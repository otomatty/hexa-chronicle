// クライアントのエントリーポイント。ゲーム状態・3Dビュー・HUD を仲介する。
import { runAI } from './core/ai';
import { CIVS, PROJECTS, TECHS, UNITS, WONDERS, itemName } from './core/data';
import {
  applyAction, attackTargets, availableTechs, cityAt, citiesOf, createGame, deserialize, dist, milAt, needsOrders, reachable,
  serialize, unitsOf,
} from './core/game';
import type { Action, GameEvent, GameState, NewGameOptions } from './core/types';
import { loadPack, setPackEnabled } from './render/pack';
import { GameView, type Quality } from './render/view';
import { cityLabelInfo, Hud, showTitle, type GameApi, type Task } from './ui/ui';

const K_AUTO = 'hexa.autosave', K_SLOT = 'hexa.save', K_CLOUD = 'hexa.cloudId', K_PREFS = 'hexa.prefs';
const stage = document.getElementById('stage')!;
const hudEl = document.getElementById('hud')!;
const modalEl = document.getElementById('modal')!;
const params = new URLSearchParams(location.search);

interface Prefs { quality: Quality; grid: boolean }
function loadPrefs(): Prefs {
  const coarse = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 700;
  const def: Prefs = { quality: coarse ? 'low' : 'medium', grid: true };
  try { return { ...def, ...JSON.parse(localStorage.getItem(K_PREFS) ?? '{}') }; } catch { return def; }
}
const prefs = loadPrefs();
const store = {
  get(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string): boolean { try { localStorage.setItem(k, v); return true; } catch { return false; } },
};
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

function loading(on: boolean, text = '世界を生成中…'): void {
  let el = document.getElementById('loading');
  if (on && !el) {
    el = document.createElement('div');
    el.id = 'loading';
    document.body.appendChild(el);
  }
  if (el) { if (on) el.textContent = text; else el.remove(); }
}

function cloudId(): string {
  let id = store.get(K_CLOUD);
  if (!id) { id = crypto.randomUUID().replace(/-/g, '').slice(0, 20); store.set(K_CLOUD, id); }
  return id;
}

class Game implements GameApi {
  human: number;
  selUnit = 0;
  selCity = 0;
  busy = false;
  quality = prefs.quality;
  grid = prefs.grid;
  view!: GameView;
  hud: Hud;
  private ended = false;
  private lastPos = -1;
  private attackedNotice = -1;
  private onKey = (e: KeyboardEvent) => this.key(e);

  constructor(public state: GameState) {
    this.human = Math.max(0, state.players.findIndex((p) => p.human));
    state.events = [];
    this.makeView();
    this.hud = new Hud(hudEl, modalEl, this);
    window.addEventListener('keydown', this.onKey);
    const cap = citiesOf(state, this.human).find((c) => c.capital);
    const first = unitsOf(state, this.human)[0];
    this.view.focus(cap ? cap.pos : first ? first.pos : 0, true);
    this.view.cam.gd = this.view.cam.dist = 17;
    if (state.winner) this.finish();
    else if (state.current !== this.human) void this.runOthers();
    else this.selectNext(false);
  }

  private makeView(): void {
    const old = this.view?.cam;
    this.view = new GameView(stage, this.state, this.human, this.quality, {
      onTileClick: (t, b) => this.tileClick(t, b),
      onTileHover: (t, x, y) => this.hud?.hover(t, x, y),
      onUnitClick: (id) => this.unitClick(id),
      onCityClick: (id) => { const c = this.state.cities[id]; if (c && c.owner === this.human) this.selectCity(id); else if (c) this.tileClick(c.pos, 0); },
      cityLabel: (id) => cityLabelInfo(this.state.cities[id], this.human),
    });
    this.view.revealAll = params.has('reveal');
    this.view.setGrid(this.grid);
    if (old) Object.assign(this.view.cam, old);
    this.view.sync(this.state);
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKey);
    this.view.dispose();
    this.hud.dispose();
  }

  // ---------------------------------------------------------------- アクション
  act(a: Action): boolean {
    if (this.busy || this.ended) return false;
    const r = applyAction(this.state, this.human, a);
    if (!r.ok && r.error) this.hud.toast(r.error, 'war');
    this.flush();
    if (r.ok && a.type !== 'endTurn') this.afterAction();
    return r.ok;
  }

  private flush(): void {
    const s = this.state;
    const ev = s.events;
    s.events = [];
    this.view.playEvents(ev, s);
    for (const e of ev) this.notify(e);
    if (this.selUnit && (!s.units[this.selUnit] || s.units[this.selUnit].owner !== this.human)) this.selUnit = 0;
    if (this.selCity && (!s.cities[this.selCity] || s.cities[this.selCity].owner !== this.human)) this.selCity = 0;
    this.view.selectedUnit = this.selUnit;
    this.view.sync(s);
    this.refreshHighlights();
    this.hud.update();
  }

  private notify(e: GameEvent): void {
    const s = this.state, me = this.human, hud = this.hud;
    const name = (pid: number) => s.players[pid].name;
    switch (e.type) {
      case 'tech': if (e.owner === me) hud.toast(`🔬 「${TECHS[e.tech].name}」の研究が完了しました`, 'good'); break;
      case 'built': if (e.owner === me) hud.toast(`⚙️ ${s.cities[e.city]?.name ?? ''}で「${itemName(e.item)}」が完成しました`, 'good', s.cities[e.city]?.pos); break;
      case 'cityFounded': if (e.owner !== me && s.vis[me][e.pos]) hud.toast(`${name(e.owner)}が都市「${s.cities[e.city].name}」を建設しました`, '', e.pos); break;
      case 'war': hud.toast(e.a === me || e.b === me ? `⚔️ ${name(e.a)}が${name(e.b)}に宣戦布告しました！` : `${name(e.a)}が${name(e.b)}に宣戦布告しました`, e.a === me || e.b === me ? 'war' : ''); break;
      case 'peace': hud.toast(`🕊️ ${name(e.a)}と${name(e.b)}が和平を結びました`, 'good'); break;
      case 'peaceOffer': if (e.to === me) hud.toast(`🕊️ ${name(e.from)}が和平を提案しています`, 'good', -1, { label: '受け入れる', run: () => this.act({ type: 'makePeace', target: e.from }) }); break;
      case 'met': if (e.a === me || e.b === me) { const o = e.a === me ? e.b : e.a; hud.toast(`🤝 ${name(o)}（${s.players[o].leader}）と接触しました`); } break;
      case 'cityCaptured': if (e.from === me || e.to === me || s.vis[me][e.pos]) hud.toast(`🔥 ${name(e.to)}が都市「${s.cities[e.city].name}」を占領しました`, e.to === me ? 'good' : 'war', e.pos); break;
      case 'eliminated': hud.toast(`☠️ ${name(e.player)}が滅亡しました`, 'war'); break;
      case 'space': hud.toast(`🚀 ${name(e.owner)}が「${Object.values(PROJECTS).find((p) => p.stage === e.stage - 1)?.name}」を達成しました（${e.stage}/3）`, e.owner === me ? 'good' : 'war'); break;
      case 'campCleared': if (e.owner === me) hud.toast(`蛮族の野営地を制圧しました（💰+${e.gold}）`, 'good', e.pos); break;
      case 'notify': if (e.owner === me) hud.toast(e.text, '', e.pos ?? -1); break;
      case 'wonder': if (e.owner === me) hud.toast(`✦ 自然遺産「${WONDERS[e.wonder].name}」を発見しました（💰+${e.gold}）`, 'good', e.pos); break;
      case 'attack': {
        if (e.owner === me || this.attackedNotice === s.turn) break;
        const target = cityAt(s, e.to) ?? milAt(s, e.to);
        const dead = e.defKilled && s.vis[me][e.to] === 2 && !target;
        if ((target && target.owner === me) || dead) {
          this.attackedNotice = s.turn;
          hud.toast(`⚠️ ${name(e.owner)}の攻撃を受けています`, 'war', e.to);
        }
        break;
      }
      case 'victory': this.finish(); break;
    }
  }

  private finish(): void {
    if (this.ended) return;
    this.ended = true;
    this.busy = false;
    this.selUnit = this.selCity = 0;
    setTimeout(() => this.hud.showEnd(this.state.winner, !this.state.players[this.human].alive), 600);
  }

  private afterAction(): void {
    const u = this.state.units[this.selUnit];
    if (this.selCity || (u && needsOrders(u))) return;
    const prev = this.selUnit;
    setTimeout(() => { if (this.selUnit === prev && !this.busy && !this.selCity) this.selectNext(true); }, 380);
  }

  // ---------------------------------------------------------------- 選択
  selectUnit(id: number, focus = false): void {
    const u = this.state.units[id];
    if (!u || u.owner !== this.human) return;
    this.selUnit = id;
    this.selCity = 0;
    this.lastPos = u.pos;
    this.view.selectedUnit = id;
    if (focus) this.view.focus(u.pos);
    this.view.sync(this.state);
    this.refreshHighlights();
    this.hud.update();
  }

  selectCity(id: number): void {
    const c = this.state.cities[id];
    if (!c || c.owner !== this.human) return;
    this.selCity = id;
    this.selUnit = 0;
    this.view.selectedUnit = 0;
    this.view.sync(this.state);
    this.refreshHighlights();
    this.hud.update();
  }

  deselect(): void {
    this.selUnit = this.selCity = 0;
    this.view.selectedUnit = 0;
    this.view.sync(this.state);
    this.refreshHighlights();
    this.hud.update();
  }

  private pending(): number[] {
    const s = this.state;
    const from = this.lastPos >= 0 ? this.lastPos : 0;
    return unitsOf(s, this.human).filter(needsOrders).sort((a, b) => dist(s, a.pos, from) - dist(s, b.pos, from) || a.id - b.id).map((u) => u.id);
  }

  private selectNext(focus: boolean): void {
    const list = this.pending().filter((id) => id !== this.selUnit);
    if (list.length) this.selectUnit(list[0], focus);
    else if (this.selUnit && !needsOrders(this.state.units[this.selUnit] ?? ({ moves: 0 } as never))) this.deselect();
  }

  private refreshHighlights(): void {
    const s = this.state, h = new Map<number, number>();
    const u = s.units[this.selUnit];
    if (u && !this.busy) {
      for (const t of reachable(s, u).keys()) h.set(t, 1);
      for (const t of attackTargets(s, u)) h.set(t, 2);
      h.set(u.pos, 3);
    }
    const c = s.cities[this.selCity];
    if (c) for (const t of c.worked) h.set(t, 3);
    this.view.setHighlights(h);
  }

  // ---------------------------------------------------------------- マップ操作
  private foreignAt(tile: number): number {
    const s = this.state;
    if (s.vis[this.human][tile] !== 2) return -1;
    const c = cityAt(s, tile), m = milAt(s, tile);
    const o = c ? c.owner : m ? m.owner : -1;
    return o >= 0 && o !== this.human ? o : -1;
  }

  attackWithWarCheck(target: number): void {
    const s = this.state, u = s.units[this.selUnit];
    if (!u) return;
    const o = this.foreignAt(target);
    if (o < 0 || s.players[o].barb || s.war[this.human][o]) return;
    const d = UNITS[u.type];
    if (d.civilian || dist(s, u.pos, target) > (d.rng ? d.range ?? 1 : 1)) { this.hud.toast(`${s.players[o].name}とは平和状態です`); return; }
    if (s.turn < s.truce[this.human][o]) { this.hud.toast('休戦期間中のため攻撃できません', 'war'); return; }
    this.hud.confirm(`${s.players[o].name}に宣戦布告して攻撃しますか？`, () => {
      if (this.act({ type: 'declareWar', target: o })) this.act({ type: 'attack', unit: u.id, target });
    });
  }

  private tileClick(tile: number, button: number): void {
    if (tile < 0 || this.busy || this.ended) return;
    const s = this.state;
    const u = s.units[this.selUnit];
    if (u && u.owner === this.human) {
      if (attackTargets(s, u).includes(tile)) { this.act({ type: 'attack', unit: u.id, target: tile }); return; }
      const foreign = this.foreignAt(tile);
      if (foreign >= 0 && !s.players[foreign].barb && !s.war[this.human][foreign] && (button === 2 || dist(s, u.pos, tile) <= 2)) {
        this.attackWithWarCheck(tile);
        return;
      }
      if (button === 2) { if (tile !== u.pos) this.act({ type: 'move', unit: u.id, to: tile }); return; }
      if (tile !== u.pos && reachable(s, u).has(tile)) { this.act({ type: 'move', unit: u.id, to: tile }); return; }
    }
    if (button === 2) return;
    // 選択：同じタイルをもう一度クリックすると 軍事 → 非戦闘 → 都市 と切り替わる
    const cands: (() => void)[] = [];
    let cur = -1;
    for (const x of [milAt(s, tile), s.units[this.civId(tile)]]) {
      if (x && x.owner === this.human) { if (x.id === this.selUnit) cur = cands.length; cands.push(() => this.selectUnit(x.id)); }
    }
    const c = cityAt(s, tile);
    if (c && c.owner === this.human) { if (c.id === this.selCity) cur = cands.length; cands.push(() => this.selectCity(c.id)); }
    if (cands.length) cands[(cur + 1) % cands.length]();
    else this.deselect();
  }

  private civId(tile: number): number {
    for (const id in this.state.units) {
      const x = this.state.units[id];
      if (x.pos === tile && UNITS[x.type].civilian) return x.id;
    }
    return 0;
  }

  private unitClick(id: number): void {
    const u = this.state.units[id];
    if (!u) return;
    if (u.owner === this.human) this.selectUnit(id);
    else this.tileClick(u.pos, 0);
  }

  // ---------------------------------------------------------------- ターン
  nextTask(): Task {
    const s = this.state, p = s.players[this.human];
    if (this.busy) return { label: '他文明の手番', sub: 'お待ちください…', kind: 'busy', run: () => {} };
    if (this.ended) return { label: 'ゲーム終了', sub: '', kind: 'busy', run: () => this.finish() };
    const cities = citiesOf(s, this.human);
    if (!p.research && cities.length && availableTechs(p).length) return { label: '研究を選択', sub: '技術ツリーを開く', kind: 'task', run: () => this.hud.showTech() };
    const idle = cities.find((c) => !c.queue.length);
    if (idle) return { label: '生産を選択', sub: idle.name, kind: 'task', run: () => { this.selectCity(idle.id); this.view.focus(idle.pos); } };
    const pend = this.pending();
    if (pend.length) {
      const id = pend.find((x) => x !== this.selUnit) ?? pend[0];
      return { label: 'ユニットに指示', sub: `${UNITS[s.units[id].type].name}（残り${pend.length}）`, kind: 'task', run: () => this.selectUnit(id, true) };
    }
    return { label: 'ターン終了', sub: 'Enter', kind: 'end', run: () => this.endTurn() };
  }

  endTurn(): void {
    if (this.busy || this.ended) return;
    this.deselect();
    if (!this.act({ type: 'endTurn' })) return;
    void this.runOthers();
  }

  private async runOthers(): Promise<void> {
    const s = this.state;
    this.busy = true;
    this.refreshHighlights();
    this.hud.update();
    while (!s.winner && s.current !== this.human && s.players[this.human].alive && this.state === s) {
      runAI(s, s.current);
      this.flush();
      await nextFrame();
    }
    this.busy = false;
    if (!s.players[this.human].alive || s.winner) { this.flush(); this.finish(); return; }
    store.set(K_AUTO, serialize(s));
    this.flush();
    this.selectNext(true);
    this.hud.update();
  }

  // ---------------------------------------------------------------- その他
  focus(tile: number): void { this.view.focus(tile); }
  focusWorld(x: number, z: number): void { this.view.focusWorld(x, z); }
  camTarget(): { x: number; z: number } { return { x: this.view.cam.tx, z: this.view.cam.tz }; }

  saveLocal(): void {
    this.hud.toast(store.set(K_SLOT, serialize(this.state)) ? '💾 ブラウザに保存しました' : '保存に失敗しました', 'good');
    this.hud.closeModal();
  }
  loadLocal(): void {
    const data = store.get(K_SLOT) ?? store.get(K_AUTO);
    if (!data) { this.hud.toast('セーブデータがありません', 'war'); return; }
    startFromSave(data);
  }
  cloudSave(): void {
    const id = cloudId();
    this.hud.closeModal();
    fetch(`/api/saves/${id}`, { method: 'PUT', body: serialize(this.state), headers: { 'content-type': 'application/json' } })
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); this.hud.toast(`☁️ クラウドに保存しました（引き継ぎコード: ${id}）`, 'good'); })
      .catch(() => this.hud.toast('クラウドセーブに接続できません（Cloudflare にデプロイすると有効になります）', 'war'));
  }
  cloudLoad(): void { void cloudLoad((msg) => this.hud.toast(msg, 'war')); }
  setQuality(q: Quality): void {
    this.quality = prefs.quality = q;
    store.set(K_PREFS, JSON.stringify(prefs));
    loading(true, '描画を再構築中…');
    setPackEnabled(q !== 'low');
    void (q === 'low' ? Promise.resolve(false) : loadPack()).then(() => setTimeout(() => { this.view.dispose(); this.makeView(); this.flush(); loading(false); }, 30));
  }
  setGrid(on: boolean): void {
    this.grid = prefs.grid = on;
    store.set(K_PREFS, JSON.stringify(prefs));
    this.view.setGrid(on);
  }
  toTitle(): void { title(); }

  private key(e: KeyboardEvent): void {
    if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
    if (e.key === 'Escape') { if (this.hud.modalOpen && modalEl.dataset.lock !== '1') this.hud.closeModal(); else this.deselect(); return; }
    if (this.hud.modalOpen || this.busy || this.ended) return;
    const u = this.state.units[this.selUnit];
    const ua = (type: 'found' | 'fortify' | 'sleep' | 'skip' | 'explore') => { if (u) this.act({ type, unit: u.id }); };
    switch (e.key.toLowerCase()) {
      case 'enter': e.preventDefault(); if (e.shiftKey) this.endTurn(); else this.nextTask().run(); break;
      case ' ': e.preventDefault(); ua('skip'); break;
      case 'f': if (u && !UNITS[u.type].civilian) ua('fortify'); break;
      case 'z': ua('sleep'); break;
      case 'b': if (u && u.type === 'settler') ua('found'); break;
      case 'x': ua('explore'); break;
      case 't': this.hud.showTech(); break;
      case 'g': this.setGrid(!this.grid); break;
    }
  }
}

// ---------------------------------------------------------------- 起動
let game: Game | null = null;

function start(state: GameState): void {
  loading(true);
  // モデルパックの読み込みを待ってから世界を作る（失敗しても手続き生成のモデルで続行する）
  setPackEnabled(prefs.quality !== 'low');
  void (prefs.quality === 'low' ? Promise.resolve(false) : loadPack()).then(() => setTimeout(() => {
    game?.dispose();
    hudEl.innerHTML = '';
    game = new Game(state);
    (window as unknown as { __game: Game }).__game = game;
    loading(false);
  }, 40));
}

function startFromSave(data: string): void {
  try { start(deserialize(data)); } catch (err) { alert('セーブデータを読み込めませんでした: ' + (err as Error).message); }
}

async function cloudLoad(fail: (msg: string) => void): Promise<void> {
  const input = prompt('引き継ぎコードを入力してください（空欄ならこのブラウザのコード）', '');
  if (input === null) return;
  const id = (input.trim() || cloudId()).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
  try {
    const r = await fetch(`/api/saves/${id}`);
    if (r.status === 404) { fail('クラウドにセーブデータがありません'); return; }
    if (!r.ok) throw new Error(String(r.status));
    startFromSave(await r.text());
  } catch { fail('クラウドセーブに接続できません（Cloudflare にデプロイすると有効になります）'); }
}

function title(): void {
  game?.dispose();
  game = null;
  showTitle(hudEl, {
    hasSave: !!store.get(K_AUTO),
    onNew: (o: NewGameOptions) => start(createGame(o)),
    onContinue: () => startFromSave(store.get(K_AUTO)!),
    onCloud: () => void cloudLoad((m) => alert(m)),
  });
}

if (params.has('spectate')) {
  // 開発用: AI同士で指定ターンまで進めた世界を眺める
  const st = createGame({ seed: Number(params.get('seed')) || 1, size: (params.get('size') as NewGameOptions['size']) ?? 'standard', civ: 'aurelia', opponents: 7, difficulty: 1, allAI: true });
  const until = Number(params.get('spectate')) || 50;
  while (!st.winner && st.turn < until) { runAI(st, st.current); st.events = []; }
  while (!st.winner && st.current !== 0) { runAI(st, st.current); st.events = []; }
  start(st);
} else if (params.has('autostart')) {
  const civs = Object.keys(CIVS);
  start(createGame({
    seed: Number(params.get('autostart')) || 1, size: (params.get('size') as NewGameOptions['size']) ?? 'standard',
    civ: params.get('civ') ?? civs[0], opponents: 7, difficulty: 1,
  }));
} else title();
