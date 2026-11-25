// HUD とモーダル。DOM を直接組み立てる軽量な実装（フレームワーク不使用）。
import { BUILDINGS, CIVS, DIFFICULTY, ERAS, FEATURE, IMPROVEMENTS, MAP_SIZES, PROJECTS, RESOURCES, TECHS, TERRAIN, UNITS, itemName } from '../core/data';
import {
  attackTargets, availableItems, availableTechs, buyCost, canFound, cityAt, citiesOf, cityStrength, cityYields, civAt, eraOf,
  growthCost, itemCost, majors, maxMoves, milAt, militaryPower, tileYield, unitMaintenance, unitStrength, validImprovements,
} from '../core/game';
import type { Action, City, GameState, NewGameOptions, Winner, Yields } from '../core/types';
import type { Quality } from '../render/view';

export interface Task { label: string; sub: string; kind: 'end' | 'task' | 'busy'; run(): void }

export interface GameApi {
  state: GameState;
  human: number;
  selUnit: number;
  selCity: number;
  busy: boolean;
  quality: Quality;
  grid: boolean;
  act(a: Action): boolean;
  selectUnit(id: number): void;
  selectCity(id: number): void;
  deselect(): void;
  nextTask(): Task;
  endTurn(): void;
  focus(tile: number): void;
  focusWorld(x: number, z: number): void;
  camTarget(): { x: number; z: number };
  attackWithWarCheck(target: number): void;
  saveLocal(): void;
  loadLocal(): void;
  cloudSave(): void;
  cloudLoad(): void;
  setQuality(q: Quality): void;
  setGrid(on: boolean): void;
  toTitle(): void;
}

const fmt = (n: number) => String(Math.round(n * 10) / 10);
const sign = (n: number) => (n >= 0 ? '+' : '') + fmt(n);
const IMP_VERB: Record<string, string> = { farm: '農場を建設', mine: '鉱山を建設', pasture: '牧草地を建設', plantation: '農園を建設', lumbermill: '製材所を建設', clear: '地物を除去' };
const MM: Record<string, string> = { ocean: '#14304f', coast: '#24567a', grass: '#4f8a36', plains: '#9a9648', desert: '#cdb46f', tundra: '#7f8770', snow: '#dfe6ea' };

export function yieldStr(y: Yields): string {
  const parts: string[] = [];
  if (y.food) parts.push(`🌾${fmt(y.food)}`);
  if (y.prod) parts.push(`⚙️${fmt(y.prod)}`);
  if (y.gold) parts.push(`💰${fmt(y.gold)}`);
  if (y.sci) parts.push(`🔬${fmt(y.sci)}`);
  if (y.cul) parts.push(`🎭${fmt(y.cul)}`);
  return parts.join(' ') || '—';
}

export function playerIncome(s: GameState, pid: number): { gold: number; sci: number; cul: number } {
  let gold = 0, sci = 0, cul = 0;
  for (const c of citiesOf(s, pid)) {
    const y = cityYields(s, c);
    gold += y.gold + (c.queue[0] === 'p:wealth' ? y.prod * 0.5 : 0);
    sci += y.sci; cul += y.cul;
  }
  return { gold: gold - unitMaintenance(s, pid), sci, cul };
}

function unlocks(tech: string): string[] {
  const out: string[] = [];
  for (const k in UNITS) if (UNITS[k].tech === tech) out.push(UNITS[k].name);
  for (const k in BUILDINGS) if (BUILDINGS[k].tech === tech) out.push(BUILDINGS[k].name);
  for (const k in IMPROVEMENTS) {
    if (IMPROVEMENTS[k].tech === tech) out.push(IMPROVEMENTS[k].name);
    if (IMPROVEMENTS[k].boostTech === tech) out.push(IMPROVEMENTS[k].name + '強化');
  }
  if (tech === 'sailing') out.push('沿岸への乗船');
  if (tech === 'cartography') out.push('外洋航行');
  if (tech === 'mining') out.push('地物の除去');
  if (tech === 'spaceflight') out.push('宇宙開発計画');
  return out;
}

function itemInfo(item: string): { icon: string; desc: string } {
  const k = item.slice(2);
  if (item[0] === 'u') {
    const d = UNITS[k];
    const parts = d.civilian ? [k === 'settler' ? '新しい都市を建設（人口-1）' : `地形改良 ${d.charges}回`] : [`戦闘力${d.str}`];
    if (d.rng) parts.push(`遠隔${d.rng} 射程${d.range}`);
    parts.push(`移動${d.moves}`);
    return { icon: d.icon, desc: parts.join('・') };
  }
  if (item[0] === 'b') return { icon: '🏛️', desc: BUILDINGS[k].desc };
  return { icon: k === 'wealth' ? '💰' : '🚀', desc: PROJECTS[k].desc };
}

export class Hud {
  private el: Record<string, HTMLElement> = {};
  private mmBase = document.createElement('canvas');
  private mmCtx: CanvasRenderingContext2D;
  private mmScale = 1;
  private tipTimer = 0;
  private tipTile = -1;
  private timer = 0;

  constructor(private root: HTMLElement, private modal: HTMLElement, private api: GameApi) {
    root.innerHTML = `
      <div id="top"></div>
      <div id="research" class="panel" data-a="tech"></div>
      <div id="toasts"></div>
      <div id="minimap" class="panel"><canvas></canvas></div>
      <div id="unit" class="panel" style="display:none"></div>
      <div id="city" class="panel" style="display:none"></div>
      <button id="endturn" data-a="endturn"></button>
      <div id="tip" class="panel" style="display:none"></div>`;
    for (const id of ['top', 'research', 'toasts', 'minimap', 'unit', 'city', 'endturn', 'tip']) this.el[id] = root.querySelector('#' + id)!;
    const cv = this.el.minimap.querySelector('canvas')!;
    this.mmCtx = cv.getContext('2d')!;
    const s = api.state;
    const mw = s.w * 1.732, mh = s.h * 1.5;
    cv.width = 220; cv.height = Math.round((220 * mh) / mw);
    this.mmBase.width = cv.width; this.mmBase.height = cv.height;
    this.mmScale = cv.width / mw;
    const mmGo = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      api.focusWorld(((e.clientX - r.left) / r.width) * mw, ((e.clientY - r.top) / r.height) * mh);
    };
    cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); mmGo(e); });
    cv.addEventListener('pointermove', (e) => { if (e.buttons) mmGo(e); });
    const click = (e: Event) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-a]');
      if (t) { e.stopPropagation(); this.handle(t.dataset.a!, t.dataset.v ?? ''); }
    };
    root.addEventListener('click', click);
    modal.addEventListener('click', (e) => { if (e.target === modal && modal.dataset.lock !== '1') this.closeModal(); else click(e); });
    this.timer = window.setInterval(() => this.drawMinimap(), 200);
    this.update();
  }

  dispose(): void {
    clearInterval(this.timer);
    this.root.innerHTML = '';
    this.closeModal();
  }

  get modalOpen(): boolean { return this.modal.classList.contains('on'); }

  // ---------------------------------------------------------------- 操作
  private handle(a: string, v: string): void {
    const api = this.api, s = api.state;
    const u = s.units[api.selUnit];
    const c = s.cities[api.selCity];
    const ua = (type: 'found' | 'fortify' | 'sleep' | 'skip' | 'explore' | 'wake' | 'disband') => { if (u) api.act({ type, unit: u.id }); };
    switch (a) {
      case 'tech': this.showTech(); break;
      case 'diplo': this.showDiplo(); break;
      case 'menu': this.showMenu(); break;
      case 'help': this.showHelp(); break;
      case 'close': this.closeModal(); break;
      case 'research': if (api.act({ type: 'research', tech: v })) this.closeModal(); break;
      case 'endturn': api.nextTask().run(); break;
      case 'u-found': ua('found'); break;
      case 'u-fortify': ua('fortify'); break;
      case 'u-sleep': ua('sleep'); break;
      case 'u-skip': ua('skip'); break;
      case 'u-explore': ua('explore'); break;
      case 'u-wake': ua('wake'); break;
      case 'u-disband': if (u) this.confirm(`${UNITS[u.type].name}を解散しますか？`, () => ua('disband')); break;
      case 'u-improve': if (u) api.act({ type: 'improve', unit: u.id, improvement: v }); break;
      case 'c-close': api.deselect(); break;
      case 'c-build': if (c) api.act({ type: 'setQueue', city: c.id, queue: [v, ...c.queue.filter((q) => q !== v)] }); break;
      case 'c-queue': if (c) api.act({ type: 'setQueue', city: c.id, queue: [...c.queue, v] }); break;
      case 'c-remove': if (c) api.act({ type: 'setQueue', city: c.id, queue: c.queue.filter((_, i) => i !== Number(v)) }); break;
      case 'c-buy': if (c) api.act({ type: 'buy', city: c.id, item: v }); break;
      case 'goto': api.focus(Number(v)); break;
      case 'war': {
        const o = s.players[Number(v)];
        this.confirm(`${o.name}に宣戦布告しますか？`, () => { api.act({ type: 'declareWar', target: o.id }); this.showDiplo(); });
        break;
      }
      case 'peace': if (api.act({ type: 'makePeace', target: Number(v) })) this.showDiplo(); break;
      case 'save': api.saveLocal(); break;
      case 'load': this.closeModal(); api.loadLocal(); break;
      case 'csave': api.cloudSave(); break;
      case 'cload': this.closeModal(); api.cloudLoad(); break;
      case 'quality': this.closeModal(); api.setQuality(v as Quality); break;
      case 'grid': api.setGrid(!api.grid); this.showMenu(); break;
      case 'title': this.confirm('タイトルに戻りますか？（オートセーブは残ります）', () => api.toTitle()); break;
    }
  }

  // ---------------------------------------------------------------- 描画更新
  update(): void {
    const api = this.api, s = api.state, p = s.players[api.human];
    const inc = playerIncome(s, api.human);
    this.el.top.innerHTML = `
      <div class="stat" title="科学">🔬 +${fmt(inc.sci)}</div>
      <div class="stat" title="文化">🎭 +${fmt(inc.cul)}</div>
      <div class="stat" title="ゴールド">💰 ${Math.floor(p.gold)} <small>(${sign(inc.gold)})</small></div>
      <div class="mid">${ERAS[eraOf(p)]}時代<small>ターン ${s.turn} / ${s.maxTurns}</small></div>
      <button class="tb" data-a="tech">技術</button><button class="tb" data-a="diplo">外交</button><button class="tb" data-a="menu">☰</button>`;
    // 研究
    let r = '<h4>研究</h4>';
    if (p.research) {
      const t = TECHS[p.research], prog = p.progress[p.research] ?? 0;
      const turns = inc.sci > 0 ? Math.max(1, Math.ceil((t.cost - prog - p.sciOverflow) / inc.sci)) : '∞';
      r += `<div><b>${t.name}</b> <small style="color:var(--dim)">あと${turns}ターン</small></div><div class="bar"><u style="width:${Math.min(100, (prog / t.cost) * 100)}%"></u></div>`;
    } else if (availableTechs(p).length) r += '<div class="warn">研究する技術を選択してください</div>';
    else r += '<div>すべての技術を研究済み</div>';
    this.el.research.innerHTML = r;
    this.renderUnit();
    this.renderCity();
    const task = api.nextTask();
    const eb = this.el.endturn;
    eb.className = task.kind === 'end' ? '' : task.kind;
    eb.innerHTML = `${task.label}<small>${task.sub}</small>`;
    this.drawMinimapBase();
  }

  private renderUnit(): void {
    const api = this.api, s = api.state, el = this.el.unit;
    const u = s.units[api.selUnit];
    if (!u || u.owner !== api.human) { el.style.display = 'none'; return; }
    const d = UNITS[u.type], p = s.players[u.owner];
    el.style.display = '';
    const mine = !api.busy;
    const btn = (a: string, label: string, key = '', on = true, v = '', cls = '') =>
      `<button class="btn ${cls}" data-a="${a}" data-v="${v}" ${on && mine ? '' : 'disabled'}>${label}${key ? `<kbd>${key}</kbd>` : ''}</button>`;
    let acts = '';
    if (u.type === 'settler') acts += btn('u-found', '都市を建設', 'B', u.moves > 0 && canFound(s, u.pos, u.owner), '', 'pri');
    if (u.type === 'builder') for (const k of validImprovements(s, u.pos, u.owner)) acts += btn('u-improve', IMP_VERB[k], '', u.moves > 0, k, k === 'clear' ? '' : 'pri');
    if (u.sleeping || u.fortified > 0 || u.auto || u.goto >= 0) acts += btn('u-wake', '指示を解除');
    else {
      if (!d.civilian) acts += btn('u-fortify', '防御態勢', 'F');
      acts += btn('u-sleep', '休眠', 'Z');
    }
    acts += btn('u-skip', '待機', 'Space', u.moves > 0);
    acts += btn('u-explore', '自動探索', 'X', !u.auto);
    acts += btn('u-disband', '解散', '', true, '', 'danger');
    const st = u.auto ? '自動探索中' : u.goto >= 0 ? '移動中' : u.sleeping ? '休眠中' : u.fortified > 0 ? '防御態勢' : '';
    const stats = [`移動 ${u.moves}/${maxMoves(s, u)}`];
    if (!d.civilian) stats.push(`⚔️ ${d.str}`);
    if (d.rng) stats.push(`🏹 ${d.rng}（射程${d.range}）`);
    if (d.charges) stats.push(`残り ${u.charges}回`);
    el.innerHTML = `
      <div class="hd"><div class="ic" style="--c:${p.color};--c2:${p.color2}">${d.icon}</div>
        <div style="flex:1"><h3>${d.name} <small style="font:12px var(--sans);color:var(--gold)">${st}</small></h3>
          <div class="meta">${stats.join('　')}</div>
          <div class="bar hp"><u style="width:${u.hp}%"></u></div></div></div>
      <div class="acts">${acts}</div>`;
  }

  private renderCity(): void {
    const api = this.api, s = api.state, el = this.el.city;
    const c = s.cities[api.selCity];
    if (!c || c.owner !== api.human) { el.style.display = 'none'; return; }
    const keep = el.querySelector('.body')?.scrollTop ?? 0;
    el.style.display = '';
    const p = s.players[c.owner];
    const y = cityYields(s, c);
    const surplus = y.food - c.pop * 2;
    const need = growthCost(c.pop);
    const grow = surplus > 0 ? `あと${Math.max(1, Math.ceil((need - c.food) / surplus))}ターンで成長` : surplus < 0 ? '<span class="warn">食料不足</span>' : '停滞中';
    const turnsFor = (item: string) => {
      const cost = itemCost(s, c, item);
      const left = Math.max(0, cost - c.prod);
      return y.prod > 0 ? Math.max(1, Math.ceil(left / y.prod)) : 999;
    };
    const cur = c.queue[0];
    let h = `<div class="chd"><button class="x" data-a="c-close">×</button>
      <h3>${c.capital ? '★ ' : ''}${c.name}</h3>
      <div style="color:var(--dim)">人口 ${c.pop}・防御力 ${cityStrength(s, c)}・耐久 ${c.hp}/200</div></div><div class="body">`;
    h += `<div class="yl"><span>🌾 ${sign(surplus)}</span><span>⚙️ ${fmt(y.prod)}</span><span>💰 ${fmt(y.gold)}</span><span>🔬 ${fmt(y.sci)}</span><span>🎭 ${fmt(y.cul)}</span></div>`;
    h += `<div style="font-size:12px;color:var(--dim)">${grow}</div><div class="bar food"><u style="width:${Math.min(100, (c.food / need) * 100)}%"></u></div>`;
    h += '<div class="sec">生産中</div>';
    if (cur) {
      const cost = itemCost(s, c, cur);
      const info = itemInfo(cur);
      h += `<div><b>${info.icon} ${itemName(cur)}</b> <small style="color:var(--dim)">${cur === 'p:wealth' ? '継続' : `あと${turnsFor(cur)}ターン`}</small></div>`;
      if (cur !== 'p:wealth') h += `<div class="bar prod"><u style="width:${Math.min(100, (c.prod / cost) * 100)}%"></u></div>`;
      if (cur === 'u:settler' && c.pop < 2) h += '<div class="warn" style="font-size:12px">人口2以上で完成します</div>';
    } else h += '<div class="warn">生産する項目を選択してください</div>';
    if (c.queue.length) {
      h += '<div style="margin-top:6px">';
      c.queue.forEach((q, i) => { h += `<div class="q"><span>${i + 1}.</span><span class="nm">${itemName(q)}</span><button data-a="c-remove" data-v="${i}">×</button></div>`; });
      h += '</div>';
    }
    if (c.buildings.length) h += `<div class="sec">建造物</div><div class="chips">${c.buildings.map((b) => `<span class="chip">${BUILDINGS[b].name}</span>`).join('')}</div>`;
    const items = availableItems(s, c);
    const group = (title: string, prefix: string) => {
      const list = items.filter((i) => i[0] === prefix && !(prefix === 'b' && c.queue.includes(i)));
      if (!list.length) return;
      h += `<div class="sec">${title}</div>`;
      for (const it of list.sort((a, b) => itemCost(s, c, a) - itemCost(s, c, b))) {
        const info = itemInfo(it), cost = itemCost(s, c, it);
        const bc = buyCost(s, c, it);
        const buy = it[0] !== 'p' ? `<button class="btn mini" data-a="c-buy" data-v="${it}" ${p.gold >= bc && !api.busy ? '' : 'disabled'} title="ゴールドで即時購入">💰${bc}</button>` : '';
        const add = `<button class="btn mini" data-a="c-queue" data-v="${it}" title="キューの最後に追加">＋</button>`;
        h += `<div class="item" data-a="c-build" data-v="${it}"><span>${info.icon}</span><span class="nm">${itemName(it)}<small>${info.desc}</small></span>
          <span class="t">${it === 'p:wealth' ? '' : `⚙️${cost}・${turnsFor(it)}T`}</span>${add}${buy}</div>`;
      }
    };
    group('ユニット', 'u');
    group('建造物', 'b');
    group('プロジェクト', 'p');
    el.innerHTML = h + '</div>';
    el.querySelector('.body')!.scrollTop = keep;
  }

  // ---------------------------------------------------------------- ミニマップ
  private drawMinimapBase(): void {
    const s = this.api.state, ctx = this.mmBase.getContext('2d')!;
    const k = this.mmScale, vis = s.vis[this.api.human];
    ctx.fillStyle = '#0b0f18';
    ctx.fillRect(0, 0, this.mmBase.width, this.mmBase.height);
    const tw = 1.732 * k + 0.6, th = 1.5 * k + 0.6;
    for (let i = 0; i < s.tiles.length; i++) {
      if (!vis[i]) continue;
      const t = s.tiles[i], row = (i / s.w) | 0;
      const x = 1.732 * k * ((i % s.w) + 0.5 * (row & 1)) - tw / 2 + 0.866 * k, y = 1.5 * k * row;
      ctx.globalAlpha = 1;
      ctx.fillStyle = t.elev === 2 ? '#6b665f' : MM[t.terrain];
      ctx.fillRect(x, y, tw, th);
      if (t.owner >= 0) { ctx.globalAlpha = 0.62; ctx.fillStyle = s.players[t.owner].color; ctx.fillRect(x, y, tw, th); }
      if (vis[i] === 1) { ctx.globalAlpha = 0.35; ctx.fillStyle = '#05070c'; ctx.fillRect(x, y, tw, th); }
    }
    ctx.globalAlpha = 1;
    for (const id in s.cities) {
      const c = s.cities[id];
      if (!vis[c.pos]) continue;
      const row = (c.pos / s.w) | 0;
      const x = 1.732 * k * ((c.pos % s.w) + 0.5 * (row & 1)) + 0.866 * k, y = 1.5 * k * row + 0.75 * k;
      ctx.fillStyle = '#fff'; ctx.fillRect(x - 2.5, y - 2.5, 5, 5);
      ctx.fillStyle = s.players[c.owner].color; ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    this.drawMinimap();
  }

  private drawMinimap(): void {
    const ctx = this.mmCtx, k = this.mmScale;
    ctx.drawImage(this.mmBase, 0, 0);
    const t = this.api.camTarget();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(t.x * k - 16, t.z * k - 10, 32, 20);
  }

  // ---------------------------------------------------------------- 通知・ツールチップ
  toast(text: string, kind = '', pos = -1, action?: { label: string; run(): void }): void {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    if (pos >= 0) { el.dataset.a = 'goto'; el.dataset.v = String(pos); }
    if (action) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = action.label;
      b.addEventListener('click', (e) => { e.stopPropagation(); action.run(); el.remove(); });
      el.appendChild(b);
    }
    this.el.toasts.appendChild(el);
    while (this.el.toasts.children.length > 5) this.el.toasts.firstElementChild!.remove();
    setTimeout(() => el.remove(), action ? 20000 : 6500);
  }

  hover(tile: number, x: number, y: number): void {
    const tip = this.el.tip;
    if (tile !== this.tipTile) { tip.style.display = 'none'; this.tipTile = tile; clearTimeout(this.tipTimer); }
    else if (tip.style.display !== 'none') { this.placeTip(x, y); return; }
    else clearTimeout(this.tipTimer);
    if (tile < 0) return;
    this.tipTimer = window.setTimeout(() => {
      const html = this.tileInfo(tile);
      if (!html) return;
      tip.innerHTML = html;
      tip.style.display = '';
      this.placeTip(x, y);
    }, 320);
  }

  private placeTip(x: number, y: number): void {
    const tip = this.el.tip;
    tip.style.left = Math.min(window.innerWidth - 280, x + 18) + 'px';
    tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 10, y + 18) + 'px';
  }

  private tileInfo(i: number): string {
    const api = this.api, s = api.state, v = s.vis[api.human][i];
    if (!v) return '<b>未探索</b>';
    const t = s.tiles[i];
    const names = [t.elev === 2 ? '山岳' : TERRAIN[t.terrain].name];
    if (t.elev === 1) names.push('丘陵');
    if (t.feature) names.push(FEATURE[t.feature].name);
    let h = `<b>${names.join('・')}</b>`;
    if (t.elev !== 2) h += `<div>${yieldStr(tileYield(s, i))}</div>`;
    if (t.resource) h += `<div>${RESOURCES[t.resource].icon} ${RESOURCES[t.resource].name}</div>`;
    if (t.improvement) h += `<div>🔧 ${IMPROVEMENTS[t.improvement].name}</div>`;
    if (t.camp) h += '<div class="warn">⚠ 蛮族の野営地</div>';
    if (t.owner >= 0) {
      const c = s.cities[t.cityId];
      h += `<div style="color:var(--dim)">${s.players[t.owner].name}${c ? '（' + c.name + '）' : ''}</div>`;
    }
    if (v === 2) {
      const city = cityAt(s, i);
      if (city) h += `<div class="u">🏙️ ${city.name}　人口${city.pop}　防御力${cityStrength(s, city)}　耐久${city.hp}</div>`;
      for (const u of [milAt(s, i), civAt(s, i)]) {
        if (!u) continue;
        const d = UNITS[u.type];
        h += `<div class="u">${d.icon} ${d.name}（${s.players[u.owner].name}）HP ${u.hp}${d.civilian ? '' : `　⚔️${d.str}`}</div>`;
      }
      const sel = s.units[api.selUnit];
      if (sel && sel.owner === api.human && attackTargets(s, sel).includes(i)) {
        const ranged = !!UNITS[sel.type].rng;
        const target = milAt(s, i);
        let as: number, ds: number;
        if (city) { as = unitStrength(s, sel, { attack: true, ranged, vsCity: true }); ds = cityStrength(s, city); }
        else { as = unitStrength(s, sel, { attack: true, ranged, vs: target }); ds = unitStrength(s, target!, { attack: false, ranged: false, vs: sel }); }
        const deal = Math.round(30 * Math.exp(0.04 * (as - ds))), take = ranged ? 0 : Math.round(30 * Math.exp(0.04 * (ds - as)));
        h += `<div class="u warn">戦闘予測（${as} 対 ${ds}）<br>与ダメージ 約${deal}　被ダメージ 約${take}</div>`;
      }
    } else h += '<div style="color:var(--dim)">（視界外）</div>';
    return h;
  }

  // ---------------------------------------------------------------- モーダル
  private open(title: string, body: string, lock = false): void {
    this.modal.dataset.lock = lock ? '1' : '';
    this.modal.innerHTML = `<div class="dlg"><header><h2>${title}</h2>${lock ? '' : '<button class="x" data-a="close">×</button>'}</header><div class="c">${body}</div></div>`;
    this.modal.classList.add('on');
  }
  closeModal(): void { this.modal.classList.remove('on'); this.modal.innerHTML = ''; }

  confirm(text: string, yes: () => void): void {
    this.open('確認', `<p style="margin:0 0 16px">${text}</p><div class="acts" style="justify-content:flex-end"><button class="btn" id="cno">いいえ</button><button class="btn pri" id="cyes">はい</button></div>`);
    this.modal.querySelector('#cno')!.addEventListener('click', () => this.closeModal());
    this.modal.querySelector('#cyes')!.addEventListener('click', () => { this.closeModal(); yes(); });
  }

  showTech(): void {
    const p = this.api.state.players[this.api.human];
    const inc = playerIncome(this.api.state, this.api.human);
    const av = availableTechs(p);
    let h = '<div class="tree">';
    ERAS.forEach((era, ei) => {
      const list = Object.keys(TECHS).filter((k) => TECHS[k].era === ei);
      if (!list.length) return;
      h += `<div class="era"><h4>${era}時代</h4>`;
      for (const k of list) {
        const t = TECHS[k];
        const known = p.techs.includes(k), cur = p.research === k, can = av.includes(k);
        const cls = known ? 'known' : cur ? 'cur' : can ? 'avail' : 'locked';
        const left = t.cost - (p.progress[k] ?? 0);
        const turns = inc.sci > 0 ? Math.ceil(left / inc.sci) : '∞';
        const req = t.req.filter((r) => !p.techs.includes(r)).map((r) => TECHS[r].name);
        h += `<div class="tech ${cls}" ${can ? `data-a="research" data-v="${k}"` : ''}><b>${t.name}</b> <small style="display:inline">${known ? '✓ 研究済み' : cur ? `研究中・あと${turns}T` : `🔬${t.cost}・${turns}T`}</small>
          <small>${unlocks(k).join('、') || '—'}</small>${!known && req.length ? `<small class="warn">必要: ${req.join('、')}</small>` : ''}</div>`;
      }
      h += '</div>';
    });
    this.open('技術ツリー', h + '</div>');
  }

  showDiplo(): void {
    const api = this.api, s = api.state, me = api.human;
    const myPow = militaryPower(s, me);
    let h = '';
    for (const o of majors(s).sort((a, b) => b.score - a.score)) {
      const self = o.id === me, met = self || s.met[me][o.id];
      const war = s.war[me][o.id];
      const pow = militaryPower(s, o.id);
      const rel = pow > myPow * 1.3 ? '軍事力: 優勢' : pow < myPow * 0.75 ? '軍事力: 劣勢' : '軍事力: 互角';
      const tag = !o.alive ? '<span class="tag">滅亡</span>' : self ? '<span class="tag">あなた</span>' : !met ? '<span class="tag">未接触</span>' : war ? '<span class="tag war">戦争中</span>' : '<span class="tag peace">平和</span>';
      let btn = '';
      if (!self && met && o.alive && !api.busy) {
        if (war) btn = `<button class="btn" data-a="peace" data-v="${o.id}">和平を提案</button>`;
        else if (s.turn >= s.truce[me][o.id]) btn = `<button class="btn danger" data-a="war" data-v="${o.id}">宣戦布告</button>`;
        else btn = `<span class="tag">休戦中（あと${s.truce[me][o.id] - s.turn}T）</span>`;
      }
      h += `<div class="civrow"><div class="dot" style="--c:${o.color};--c2:${o.color2}"></div>
        <div class="nm"><b>${met ? o.name : '？？？'}</b><small>${met ? `${o.leader}・都市${citiesOf(s, o.id).length}・技術${o.techs.length}・スコア${o.score}${self ? '' : '・' + rel}` : 'まだ出会っていない文明'}</small>
        ${met ? `<small>${CIVS[o.civ].bonusDesc}${o.spaceStage ? `・宇宙開発 ${o.spaceStage}/3` : ''}</small>` : ''}</div>${tag}${btn}</div>`;
    }
    h += '<p class="help">勝利条件: すべての文明の最初の首都を支配する（制覇）／恒星間探査船を完成させる（科学）／最終ターンに最高スコア。</p>';
    this.open('外交と情勢', h);
  }

  showMenu(): void {
    const api = this.api;
    const q = (k: Quality, label: string) => `<button class="btn ${api.quality === k ? 'pri' : ''}" data-a="quality" data-v="${k}">${label}</button>`;
    this.open('メニュー', `<div class="menu">
      <button class="btn" data-a="save">💾 ブラウザに保存</button>
      <button class="btn" data-a="load">📂 ブラウザから読込</button>
      <button class="btn" data-a="csave">☁️ クラウドに保存</button>
      <button class="btn" data-a="cload">☁️ クラウドから読込</button>
      <div class="sec">画質</div><div class="acts" style="margin:0">${q('low', '低')}${q('medium', '中')}${q('high', '高')}</div>
      <button class="btn" data-a="grid">グリッド表示: ${api.grid ? 'ON' : 'OFF'}</button>
      <button class="btn" data-a="help">❓ 操作方法</button>
      <button class="btn danger" data-a="title">タイトルに戻る</button></div>`);
  }

  showHelp(): void {
    this.open('操作方法', `<div class="help">
      <b style="color:var(--text)">マウス</b><br>左ドラッグ: 視点移動　ホイール: 拡大縮小　中ボタンドラッグ / <kbd>Q</kbd><kbd>E</kbd>: 回転<br>
      左クリック: ユニット・都市を選択、光っているタイルへ移動・攻撃<br>右クリック: 目的地を指定（数ターンかけて移動）<br><br>
      <b style="color:var(--text)">キーボード</b><br><kbd>Enter</kbd> 次の行動 / ターン終了　<kbd>Shift</kbd>+<kbd>Enter</kbd> 強制ターン終了<br>
      <kbd>Space</kbd> 待機　<kbd>F</kbd> 防御態勢　<kbd>Z</kbd> 休眠　<kbd>B</kbd> 都市建設　<kbd>X</kbd> 自動探索<br>
      <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 視点移動　<kbd>T</kbd> 技術　<kbd>G</kbd> グリッド　<kbd>Esc</kbd> 選択解除<br><br>
      <b style="color:var(--text)">タッチ</b><br>1本指ドラッグ: 視点移動　ピンチ: 拡大縮小　タップ: 選択・移動・攻撃<br><br>
      <b style="color:var(--text)">進め方</b><br>開拓者で都市を建設 → 都市で生産と研究を選ぶ → 労働者で資源を改良 → 開拓者を増やして領土を広げましょう。<br>
      弓兵などの遠隔ユニットは反撃を受けずに攻撃できます。都市は近接ユニットで耐久を0にすると占領できます。</div>`);
  }

  showEnd(w: Winner | null, defeated: boolean): void {
    const s = this.api.state;
    const kinds = { domination: '制覇勝利', science: '科学勝利', score: 'スコア勝利' };
    const win = w && w.player === this.api.human;
    const title = win ? `🏆 ${kinds[w!.kind]}` : defeated && !w ? '文明は滅亡した…' : '敗北';
    let h = `<p style="font:16px var(--serif);margin:0 0 12px">${w ? `${s.players[w.player].name} が${kinds[w.kind]}を達成しました。` : 'あなたの文明は歴史から姿を消しました。'}</p>`;
    for (const o of majors(s).sort((a, b) => b.score - a.score)) {
      h += `<div class="civrow"><div class="dot" style="--c:${o.color};--c2:${o.color2}"></div><div class="nm"><b>${o.name}</b><small>都市${citiesOf(s, o.id).length}・技術${o.techs.length}</small></div><span class="tag">${o.score} 点</span></div>`;
    }
    h += '<div class="acts" style="justify-content:flex-end;margin-top:14px"><button class="btn pri" id="tt">タイトルへ</button></div>';
    this.open(title, h, true);
    this.modal.querySelector('#tt')!.addEventListener('click', () => { this.closeModal(); this.api.toTitle(); });
  }
}

// ---------------------------------------------------------------- タイトル・新規ゲーム
export function showTitle(host: HTMLElement, o: { hasSave: boolean; onNew(opts: NewGameOptions): void; onContinue(): void; onCloud(): void }): void {
  host.innerHTML = `<div id="title"><div class="box">
    <h1>ヘクサ・クロニクル</h1><p>HEXA CHRONICLE</p>
    <div class="menu">
      ${o.hasSave ? '<button class="btn pri" id="t-cont">続きから</button>' : ''}
      <button class="btn ${o.hasSave ? '' : 'pri'}" id="t-new">新しいゲーム</button>
      <button class="btn" id="t-cloud">クラウドから読込</button>
    </div></div></div>`;
  host.querySelector('#t-cont')?.addEventListener('click', o.onContinue);
  host.querySelector('#t-cloud')!.addEventListener('click', o.onCloud);
  host.querySelector('#t-new')!.addEventListener('click', () => {
    const civOpts = Object.entries(CIVS).map(([k, c]) => `<option value="${k}">${c.name}（${c.leader}）</option>`).join('');
    const box = host.querySelector('.box')!;
    box.innerHTML = `<div class="dlg" style="text-align:left"><header><h2>新しいゲーム</h2></header><div class="c"><div class="form">
      <label>文明</label><select id="n-civ">${civOpts}</select><div class="note" id="n-desc"></div>
      <label>マップ</label><select id="n-size">${Object.entries(MAP_SIZES).map(([k, m]) => `<option value="${k}" ${k === 'standard' ? 'selected' : ''}>${m.name}（${m.w}×${m.h}・最大${m.players}文明）</option>`).join('')}</select>
      <label>対戦相手</label><select id="n-opp"></select>
      <label>難易度</label><select id="n-diff">${DIFFICULTY.map((d, i) => `<option value="${i}" ${i === 1 ? 'selected' : ''}>${d}</option>`).join('')}</select>
      <label>シード値</label><input id="n-seed" inputmode="numeric" value="${Math.floor(Math.random() * 999999) + 1}" />
      </div><div class="acts" style="justify-content:flex-end;margin-top:18px"><button class="btn" id="n-back">戻る</button><button class="btn pri" id="n-go">ゲーム開始</button></div></div></div>`;
    const $ = <T extends HTMLElement>(id: string) => box.querySelector<T>('#' + id)!;
    const civ = $<HTMLSelectElement>('n-civ'), size = $<HTMLSelectElement>('n-size'), opp = $<HTMLSelectElement>('n-opp');
    const desc = () => { $('n-desc').textContent = '特性: ' + CIVS[civ.value].bonusDesc; };
    const opps = () => {
      const max = MAP_SIZES[size.value].players - 1;
      opp.innerHTML = Array.from({ length: max }, (_, i) => `<option value="${i + 1}" ${i + 1 === max ? 'selected' : ''}>${i + 1} 文明</option>`).join('');
    };
    civ.addEventListener('change', desc);
    size.addEventListener('change', opps);
    desc(); opps();
    $('n-back').addEventListener('click', () => showTitle(host, o));
    $('n-go').addEventListener('click', () => o.onNew({
      seed: Math.max(1, Math.floor(Number($<HTMLInputElement>('n-seed').value) || 1)), size: size.value as NewGameOptions['size'],
      civ: civ.value, opponents: Number(opp.value), difficulty: Number($<HTMLSelectElement>('n-diff').value),
    }));
  });
}

export function cityLabelInfo(c: City, human: number): { text: string; sub: string } {
  const text = (c.capital ? '★ ' : '') + c.name;
  if (c.owner !== human) return { text, sub: '' };
  const cur = c.queue[0];
  return { text, sub: cur ? itemName(cur) : '生産なし' };
}

