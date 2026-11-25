// ゲームルール本体。
// すべての変更は applyAction(state, playerId, action) を通る。乱数は state.rng に持つため、
// 同じ初期状態に同じアクション列を与えれば必ず同じ結果になる（サーバー側実行・リプレイ可能）。
import { BUILDINGS, CIVS, FEATURE, IMPROVEMENTS, PROJECTS, RESOURCES, TECHS, TERRAIN, UNITS, WONDERS, Y, MAP_SIZES, BARB_COLOR } from './data';
import { hexDist, neighborTable, nextRand, tilesInRange } from './hex';
import { generateMap } from './mapgen';
import type { Action, ActionResult, City, GameEvent, GameState, NewGameOptions, Player, Tile, Unit, Yields } from './types';

export const CITY_MAX_HP = 200;
export const SAVE_VERSION = 1;
const INF = 1e9;

// ---------------------------------------------------------------- 実行時インデックス
interface Rt {
  nb: Int32Array;
  mil: Int32Array;
  civ: Int32Array;
  city: Int32Array;
}
const RT = new WeakMap<GameState, Rt>();
export function rt(s: GameState): Rt {
  let r = RT.get(s);
  if (!r) {
    const n = s.w * s.h;
    r = { nb: neighborTable(s.w, s.h), mil: new Int32Array(n), civ: new Int32Array(n), city: new Int32Array(n) };
    for (const id in s.units) {
      const u = s.units[id];
      (UNITS[u.type].civilian ? r.civ : r.mil)[u.pos] = u.id;
    }
    for (const id in s.cities) r.city[s.cities[id].pos] = s.cities[id].id;
    RT.set(s, r);
  }
  return r;
}

const emit = (s: GameState, e: GameEvent) => { s.events.push(e); };
export const rand = (s: GameState) => nextRand(s);

// ---------------------------------------------------------------- 参照ヘルパー
export const isWater = (t: Tile) => t.terrain === 'ocean' || t.terrain === 'coast';
export const hasTech = (p: Player, k: string) => p.techs.includes(k);
export function eraOf(p: Player): number {
  let e = 0;
  for (const t of p.techs) e = Math.max(e, TECHS[t].era);
  return e;
}
export function atWar(s: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  return s.players[a].barb || s.players[b].barb || s.war[a][b];
}
export const milAt = (s: GameState, i: number): Unit | undefined => s.units[rt(s).mil[i]];
export const civAt = (s: GameState, i: number): Unit | undefined => s.units[rt(s).civ[i]];
export const cityAt = (s: GameState, i: number): City | undefined => s.cities[rt(s).city[i]];
export function unitsOf(s: GameState, pid: number): Unit[] {
  const out: Unit[] = [];
  for (const id in s.units) if (s.units[id].owner === pid) out.push(s.units[id]);
  return out;
}
export function citiesOf(s: GameState, pid: number): City[] {
  const out: City[] = [];
  for (const id in s.cities) if (s.cities[id].owner === pid) out.push(s.cities[id]);
  return out;
}
export function neighbors(s: GameState, i: number): number[] {
  const nb = rt(s).nb, out: number[] = [];
  for (let d = 0; d < 6; d++) if (nb[i * 6 + d] >= 0) out.push(nb[i * 6 + d]);
  return out;
}
export function isCoastal(s: GameState, i: number): boolean {
  const nb = rt(s).nb;
  for (let d = 0; d < 6; d++) {
    const j = nb[i * 6 + d];
    if (j >= 0 && isWater(s.tiles[j])) return true;
  }
  return false;
}
export const dist = (s: GameState, a: number, b: number) => hexDist(s.w, a, b);
export const majors = (s: GameState) => s.players.filter((p) => !p.barb);
export function aiMult(s: GameState, p: Player): number {
  return p.human ? 1 : [0.8, 1, 1.2, 1.45][s.difficulty] ?? 1;
}
export function militaryPower(s: GameState, pid: number): number {
  let v = 0;
  for (const id in s.units) {
    const u = s.units[id];
    if (u.owner !== pid) continue;
    const d = UNITS[u.type];
    v += Math.max(d.str, d.rng ?? 0) * (0.5 + u.hp / 200);
  }
  return v;
}
export function playerResources(s: GameState, pid: number): Set<string> {
  const out = new Set<string>();
  for (const t of s.tiles) if (t.owner === pid && t.resource) out.add(t.resource);
  return out;
}

// ---------------------------------------------------------------- 産出
export function tileYield(s: GameState, i: number): Yields {
  const t = s.tiles[i];
  if (t.elev === 2) return Y();
  const y = { ...TERRAIN[t.terrain].y };
  const add = (o: Yields) => { y.food += o.food; y.prod += o.prod; y.gold += o.gold; y.sci += o.sci; y.cul += o.cul; };
  if (t.elev === 1) y.prod += 1;
  if (t.feature) add(FEATURE[t.feature].y);
  if (t.resource) add(RESOURCES[t.resource].y);
  if (t.wonder) add(WONDERS[t.wonder].y);
  const owner = t.owner >= 0 ? s.players[t.owner] : null;
  if (t.improvement) {
    const d = IMPROVEMENTS[t.improvement];
    add(d.y);
    if (d.boostTech && d.boost && owner && hasTech(owner, d.boostTech)) add(d.boost);
  }
  if (t.river && !isWater(t)) {
    y.gold += 1;
    if (t.improvement === 'farm') y.food += 1;
  }
  if (owner && t.terrain === 'coast') {
    if (owner.civ === 'mizuho') y.food += 1;
    const c = s.cities[t.cityId];
    if (c && c.buildings.includes('harbor')) y.food += 1;
  }
  return y;
}

export function cityYields(s: GameState, c: City): Yields {
  const p = s.players[c.owner];
  const y = tileYield(s, c.pos);
  y.food = Math.max(2, y.food);
  y.prod = Math.max(1, y.prod);
  y.gold += 1;
  for (const i of c.worked) {
    const t = tileYield(s, i);
    y.food += t.food; y.prod += t.prod; y.gold += t.gold; y.sci += t.sci; y.cul += t.cul;
  }
  for (const b of c.buildings) {
    const d = BUILDINGS[b].y;
    y.food += d.food; y.prod += d.prod; y.gold += d.gold; y.sci += d.sci; y.cul += d.cul;
  }
  if (c.capital) { y.prod += 2; y.sci += 2; y.gold += 3; y.cul += 1; }
  y.sci += c.pop * 0.5;
  y.cul += c.pop * 0.25 + 0.5;
  const bonus = CIVS[p.civ]?.bonus;
  if (bonus === 'science' && c.capital) y.sci += 3;
  if (bonus === 'gold') y.gold += 2;
  if (bonus === 'culture') y.cul += 1;
  const m = aiMult(s, p);
  y.prod *= m; y.sci *= m; y.gold *= m;
  return y;
}

export const growthCost = (pop: number) => Math.floor(12 + 7 * (pop - 1) + Math.pow(pop - 1, 1.6));
export function borderCost(s: GameState, c: City): number {
  const n = c.tilesClaimed;
  const base = Math.floor(6 + 4 * n + Math.pow(n, 1.35) * 1.2);
  return CIVS[s.players[c.owner].civ]?.bonus === 'culture' ? Math.floor(base * 0.75) : base;
}

export function cityTiles(s: GameState, c: City): number[] {
  return tilesInRange(s.w, s.h, c.pos, 3).filter((i) => s.tiles[i].cityId === c.id);
}

export function assignWorkers(s: GameState, c: City): void {
  const wantFood = c.pop < 4 ? 3.2 : 2.4;
  const scored: [number, number][] = [];
  for (const i of cityTiles(s, c)) {
    if (i === c.pos) continue;
    const m = milAt(s, i);
    if (m && atWar(s, m.owner, c.owner)) continue;
    const y = tileYield(s, i);
    scored.push([i, y.food * wantFood + y.prod * 2 + y.gold + y.sci * 1.5 + y.cul]);
  }
  scored.sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  c.worked = scored.slice(0, c.pop).map((x) => x[0]);
}

function claimNext(s: GameState, c: City): boolean {
  const nb = rt(s).nb;
  let best = -1, bs = -INF;
  for (const i of tilesInRange(s.w, s.h, c.pos, 3)) {
    const t = s.tiles[i];
    if (t.owner >= 0) continue;
    let adj = false;
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      if (j >= 0 && s.tiles[j].cityId === c.id) { adj = true; break; }
    }
    if (!adj) continue;
    const y = tileYield(s, i);
    const sc = y.food * 2 + y.prod * 2 + y.gold + (t.resource ? 4 : 0) - dist(s, c.pos, i) * 2 + (t.elev === 2 ? -3 : 0);
    if (sc > bs) { bs = sc; best = i; }
  }
  if (best < 0) return false;
  s.tiles[best].owner = c.owner;
  s.tiles[best].cityId = c.id;
  c.tilesClaimed++;
  return true;
}

// ---------------------------------------------------------------- 生産
export function itemCost(s: GameState, c: City, item: string): number {
  const k = item.slice(2);
  const bonus = CIVS[s.players[c.owner].civ]?.bonus;
  if (item[0] === 'u') {
    const d = UNITS[k];
    return Math.round(d.cost * (bonus === 'military' && !d.civilian ? 0.85 : 1));
  }
  if (item[0] === 'b') return Math.round(BUILDINGS[k].cost * (bonus === 'builder' ? 0.85 : 1));
  return PROJECTS[k].cost;
}
export const buyCost = (s: GameState, c: City, item: string) => Math.ceil(itemCost(s, c, item) * 2.5);

export function canBuild(s: GameState, c: City, item: string, res?: Set<string>): boolean {
  const p = s.players[c.owner];
  const k = item.slice(2);
  if (item[0] === 'u') {
    const d = UNITS[k];
    if (!d) return false;
    if (d.tech && !hasTech(p, d.tech)) return false;
    if (d.res && !(res ?? playerResources(s, p.id)).has(d.res)) return false;
    if (d.sea && !isCoastal(s, c.pos)) return false;
    return true;
  }
  if (item[0] === 'b') {
    const d = BUILDINGS[k];
    if (!d || c.buildings.includes(k)) return false;
    if (d.tech && !hasTech(p, d.tech)) return false;
    if (d.req && !c.buildings.includes(d.req)) return false;
    if (d.coastal && !isCoastal(s, c.pos)) return false;
    return true;
  }
  if (item[0] === 'p') {
    const d = PROJECTS[k];
    if (!d) return false;
    if (d.stage < 0) return true;
    return hasTech(p, 'spaceflight') && p.spaceStage === d.stage;
  }
  return false;
}

/** 現在生産できる項目。旧式化したユニット（同兵科でより上位が作れる）は除く */
export function availableItems(s: GameState, c: City): string[] {
  const res = playerResources(s, c.owner);
  const best = new Map<string, string>();
  for (const k in UNITS) {
    if (!canBuild(s, c, 'u:' + k, res)) continue;
    const cls = UNITS[k].cls;
    const cur = best.get(cls);
    if (!cur || UNITS[cur].cost < UNITS[k].cost) best.set(cls, k);
  }
  const out = [...best.values()].map((k) => 'u:' + k);
  for (const k in BUILDINGS) if (canBuild(s, c, 'b:' + k)) out.push('b:' + k);
  for (const k in PROJECTS) if (canBuild(s, c, 'p:' + k)) out.push('p:' + k);
  return out;
}

function spawnTileOk(s: GameState, type: string, owner: number, i: number): boolean {
  const d = UNITS[type], t = s.tiles[i], r = rt(s);
  if (t.elev === 2) return false;
  if ((d.civilian ? r.civ : r.mil)[i]) return false;
  const other = d.civilian ? s.units[r.mil[i]] : s.units[r.civ[i]];
  if (other && other.owner !== owner) return false;
  const c = s.cities[r.city[i]];
  if (c && c.owner !== owner) return false;
  if (d.sea) return (isWater(t) && (t.terrain === 'coast' || !!d.ocean)) || (!!c && c.owner === owner);
  return !isWater(t);
}
export function findSpawnTile(s: GameState, type: string, owner: number, near: number): number {
  for (const i of tilesInRange(s.w, s.h, near, 2).sort((a, b) => dist(s, a, near) - dist(s, b, near) || a - b)) {
    if (spawnTileOk(s, type, owner, i)) return i;
  }
  return -1;
}

export function spawnUnit(s: GameState, type: string, owner: number, pos: number): Unit {
  const d = UNITS[type];
  const u: Unit = {
    id: s.nextId++, type, owner, pos, hp: 100, moves: d.moves, attacked: false, acted: false,
    fortified: 0, sleeping: false, skipped: false, charges: d.charges ?? 0, goto: -1, auto: false, guard: false,
  };
  s.units[u.id] = u;
  (d.civilian ? rt(s).civ : rt(s).mil)[pos] = u.id;
  emit(s, { type: 'unitCreated', unit: u.id, owner, pos });
  return u;
}

function removeUnit(s: GameState, u: Unit): void {
  const arr = UNITS[u.type].civilian ? rt(s).civ : rt(s).mil;
  if (arr[u.pos] === u.id) arr[u.pos] = 0;
  delete s.units[u.id];
  emit(s, { type: 'unitDied', unit: u.id, owner: u.owner, pos: u.pos });
  checkEliminated(s, u.owner, -1);
}

function relocate(s: GameState, u: Unit, to: number): void {
  const arr = UNITS[u.type].civilian ? rt(s).civ : rt(s).mil;
  if (arr[u.pos] === u.id) arr[u.pos] = 0;
  u.pos = to;
  arr[to] = u.id;
}

function completeItem(s: GameState, c: City, item: string): boolean {
  const k = item.slice(2);
  const p = s.players[c.owner];
  if (item[0] === 'u') {
    if (k === 'settler' && c.pop < 2) return false;
    const pos = findSpawnTile(s, k, c.owner, c.pos);
    if (pos < 0) return false;
    if (k === 'settler') { c.pop--; assignWorkers(s, c); }
    spawnUnit(s, k, c.owner, pos);
  } else if (item[0] === 'b') {
    c.buildings.push(k);
  } else {
    const d = PROJECTS[k];
    if (d.stage !== p.spaceStage) return true;
    p.spaceStage++;
    emit(s, { type: 'space', owner: p.id, stage: p.spaceStage });
    for (const o of citiesOf(s, p.id)) o.queue = o.queue.filter((q) => q !== item || o === c);
    if (p.spaceStage >= 3 && !s.winner) {
      s.winner = { player: p.id, kind: 'science' };
      emit(s, { type: 'victory', winner: s.winner });
    }
  }
  emit(s, { type: 'built', city: c.id, owner: c.owner, item });
  return true;
}

function processCity(s: GameState, c: City): Yields {
  const p = s.players[c.owner];
  const y = cityYields(s, c);
  // 食料と成長
  c.food += y.food - c.pop * 2;
  const need = growthCost(c.pop);
  if (c.food >= need) {
    c.food -= need;
    c.pop++;
    emit(s, { type: 'cityGrew', city: c.id, owner: c.owner });
  } else if (c.food < 0) {
    if (c.pop > 1) c.pop--;
    c.food = 0;
  }
  // 生産
  c.queue = c.queue.filter((q) => canBuild(s, c, q));
  const item = c.queue[0];
  if (!item) {
    c.prod = Math.min(c.prod + y.prod, 40);
    emit(s, { type: 'needProduction', city: c.id, owner: c.owner });
  } else if (item === 'p:wealth') {
    y.gold += y.prod * 0.5;
  } else {
    c.prod += y.prod;
    const cost = itemCost(s, c, item);
    if (c.prod >= cost && completeItem(s, c, item)) {
      c.prod -= cost;
      c.queue.shift();
      if (!c.queue.length) emit(s, { type: 'needProduction', city: c.id, owner: c.owner });
    }
  }
  // 国境
  c.culture += y.cul;
  let guard = 0;
  while (c.culture >= borderCost(s, c) && guard++ < 3) {
    const cost = borderCost(s, c);
    if (!claimNext(s, c)) break;
    c.culture -= cost;
  }
  c.hp = Math.min(CITY_MAX_HP, c.hp + 20);
  assignWorkers(s, c);
  void p;
  return y;
}

export function availableTechs(p: Player): string[] {
  const out: string[] = [];
  for (const k in TECHS) {
    if (p.techs.includes(k)) continue;
    if (TECHS[k].req.every((r) => p.techs.includes(r))) out.push(k);
  }
  return out;
}

export function unitMaintenance(s: GameState, pid: number): number {
  let mil = 0;
  for (const id in s.units) if (s.units[id].owner === pid && !UNITS[s.units[id].type].civilian) mil++;
  const free = 3 + citiesOf(s, pid).length;
  return Math.max(0, mil - free) * (1 + Math.floor(eraOf(s.players[pid]) / 2));
}

export function computeScore(s: GameState, pid: number): number {
  const p = s.players[pid];
  let v = p.techs.length * 6 + p.spaceStage * 50;
  for (const c of citiesOf(s, pid)) v += 10 + c.pop * 4 + c.buildings.length * 2;
  for (const t of s.tiles) if (t.owner === pid) v += 1;
  return v;
}

function endPlayerTurn(s: GameState, pid: number): void {
  const p = s.players[pid];
  if (p.barb || !p.alive) return;
  let gold = 0, sci = 0, cul = 0;
  for (const c of citiesOf(s, pid)) {
    const y = processCity(s, c);
    gold += y.gold; sci += y.sci; cul += y.cul;
  }
  gold -= unitMaintenance(s, pid);
  p.gold = Math.max(0, p.gold + gold);
  // 研究
  let pool = sci + p.sciOverflow;
  p.sciOverflow = 0;
  if (p.research && !p.techs.includes(p.research)) {
    const cost = TECHS[p.research].cost;
    const cur = (p.progress[p.research] ?? 0) + pool;
    if (cur >= cost) {
      p.techs.push(p.research);
      delete p.progress[p.research];
      emit(s, { type: 'tech', owner: pid, tech: p.research });
      p.research = '';
      pool = Math.min(cur - cost, cost);
      p.sciOverflow = pool;
    } else {
      p.progress[p.research] = cur;
    }
  } else {
    p.research = '';
    p.sciOverflow = Math.min(pool, 200);
  }
  p.income = { gold, sci, cul };
  p.score = computeScore(s, pid);
}

// ---------------------------------------------------------------- 視界
export function updateVis(s: GameState, pid: number): void {
  const p = s.players[pid];
  if (p.barb) return;
  const v = s.vis[pid], n = v.length, r = rt(s);
  for (let i = 0; i < n; i++) if (v[i] === 2) v[i] = 1;
  for (const id in s.units) {
    const u = s.units[id];
    if (u.owner !== pid) continue;
    const sight = UNITS[u.type].cls === 'recon' || s.tiles[u.pos].elev === 1 ? 3 : 2;
    for (const j of tilesInRange(s.w, s.h, u.pos, sight)) v[j] = 2;
  }
  for (let i = 0; i < n; i++) {
    if (s.tiles[i].owner !== pid) continue;
    v[i] = 2;
    for (let d = 0; d < 6; d++) {
      const j = r.nb[i * 6 + d];
      if (j >= 0) v[j] = 2;
    }
  }
  for (let i = 0; i < n; i++) {
    if (v[i] !== 2) continue;
    const seen = (o: number) => {
      if (o < 0 || o === pid || s.players[o].barb || s.met[pid][o]) return;
      s.met[pid][o] = s.met[o][pid] = true;
      emit(s, { type: 'met', a: pid, b: o });
    };
    seen(s.tiles[i].owner);
    const wd = s.tiles[i].wonder;
    if (wd && !p.wonders.includes(wd)) {
      p.wonders.push(wd);
      p.gold += 20;
      emit(s, { type: 'wonder', owner: pid, wonder: wd, pos: i, gold: 20 });
    }
    if (r.mil[i]) seen(s.units[r.mil[i]].owner);
    if (r.civ[i]) seen(s.units[r.civ[i]].owner);
  }
}

// ---------------------------------------------------------------- 移動
export const isEmbarked = (s: GameState, u: Unit) => !UNITS[u.type].sea && isWater(s.tiles[u.pos]);

export function maxMoves(s: GameState, u: Unit): number {
  const d = UNITS[u.type];
  return d.moves + (s.players[u.owner].civ === 'nordheim' && isEmbarked(s, u) ? 1 : 0);
}

/** to に入るための移動コスト（進入不可は INF）。占有は見ない */
export function moveCost(s: GameState, u: Unit, to: number): number {
  const t = s.tiles[to], d = UNITS[u.type], p = s.players[u.owner];
  if (t.elev === 2) return INF;
  const water = isWater(t);
  if (d.sea) {
    if (!water) {
      const c = cityAt(s, to);
      return c && c.owner === u.owner ? 1 : INF;
    }
    return t.terrain === 'ocean' && !d.ocean ? INF : 1;
  }
  if (water) {
    if (p.barb) return INF;
    if (!hasTech(p, t.terrain === 'coast' ? 'sailing' : 'cartography')) return INF;
    return 1;
  }
  return 1 + (t.elev === 1 ? 1 : 0) + (t.feature ? 1 : 0);
}

/** 2 つの隣接タイルの境界に川があるか */
export function riverBetween(s: GameState, a: number, b: number): boolean {
  const m = s.tiles[a].river;
  if (!m) return false;
  const nb = rt(s).nb;
  for (let d = 0; d < 6; d++) if (m & (1 << d) && nb[a * 6 + d] === b) return true;
  return false;
}

/** 乗船・上陸・渡河（残り移動力をすべて消費する）。「建築学」を得ると橋で渡河の制約がなくなる */
function isTransition(s: GameState, u: Unit, from: number, to: number): boolean {
  if (UNITS[u.type].sea) return false;
  if (isWater(s.tiles[from]) !== isWater(s.tiles[to])) return true;
  return riverBetween(s, from, to) && !hasTech(s.players[u.owner], 'construction');
}

/** 0: 進入可, 1: 通過のみ可（味方がいる）, 2: 進入不可。knownOnly なら視界外のユニットは見えないものとして扱う */
export function occupancy(s: GameState, u: Unit, to: number, knownOnly: boolean): number {
  const r = rt(s);
  const c = s.cities[r.city[to]];
  if (c && c.owner !== u.owner) return 2;
  if (knownOnly && !s.players[u.owner].barb && s.vis[u.owner][to] !== 2) return 0;
  const m = s.units[r.mil[to]], v = s.units[r.civ[to]];
  if (UNITS[u.type].civilian) {
    if (m && m.owner !== u.owner) return 2;
    if (v) return v.owner === u.owner ? 1 : 2;
    return 0;
  }
  if (m) return m.owner === u.owner ? 1 : 2;
  return 0;
}

class Heap {
  private a: number[] = [];
  private k: number[] = [];
  get size() { return this.a.length; }
  push(v: number, key: number) {
    const a = this.a, k = this.k;
    let i = a.length;
    a.push(v); k.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= k[i]) break;
      [a[p], a[i]] = [a[i], a[p]]; [k[p], k[i]] = [k[i], k[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a, k = this.k;
    const top = a[0];
    const la = a.pop()!, lk = k.pop()!;
    if (a.length) {
      a[0] = la; k[0] = lk;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && k[l] < k[m]) m = l;
        if (r < a.length && k[r] < k[m]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; [k[m], k[i]] = [k[i], k[m]];
        i = m;
      }
    }
    return top;
  }
}

/** A* による経路探索。戻り値は開始タイルを含むタイル列。target が占有されていても経路は返す */
export function findPath(s: GameState, u: Unit, target: number, maxNodes = 4000): number[] | null {
  if (target === u.pos) return [u.pos];
  const n = s.w * s.h, nb = rt(s).nb;
  if (target < 0 || target >= n) return null;
  if (moveCost(s, u, target) >= INF && !(cityAt(s, target) || milAt(s, target))) return null;
  const g = new Float32Array(n).fill(INF);
  const came = new Int32Array(n).fill(-1);
  const open = new Heap();
  g[u.pos] = 0;
  open.push(u.pos, 0);
  let visited = 0;
  while (open.size) {
    const cur = open.pop();
    if (cur === target) break;
    if (visited++ > maxNodes) return null;
    for (let d = 0; d < 6; d++) {
      const j = nb[cur * 6 + d];
      if (j < 0) continue;
      let c = moveCost(s, u, j);
      if (j === target) {
        if (c >= INF) c = 1;
      } else {
        if (c >= INF) continue;
        const occ = occupancy(s, u, j, true);
        if (occ === 2) continue;
        if (occ === 1) c += 1.5;
      }
      if (isTransition(s, u, cur, j)) c += 2;
      const ng = g[cur] + c;
      if (ng < g[j]) {
        g[j] = ng;
        came[j] = cur;
        open.push(j, ng + dist(s, j, target));
      }
    }
  }
  if (came[target] < 0) return null;
  const path = [target];
  let c = target;
  while (c !== u.pos) { c = came[c]; path.push(c); }
  return path.reverse();
}

/** このターンに移動して停止できるタイル → 直前タイル */
export function reachable(s: GameState, u: Unit): Map<number, number> {
  const out = new Map<number, number>();
  if (u.moves <= 0) return out;
  const nb = rt(s).nb;
  const best = new Map<number, number>([[u.pos, u.moves]]);
  const prev = new Map<number, number>();
  const queue = [u.pos];
  while (queue.length) {
    let qi = 0;
    for (let k = 1; k < queue.length; k++) if (best.get(queue[k])! > best.get(queue[qi])!) qi = k;
    const cur = queue.splice(qi, 1)[0];
    const left = best.get(cur)!;
    if (left <= 0) continue;
    for (let d = 0; d < 6; d++) {
      const j = nb[cur * 6 + d];
      if (j < 0) continue;
      const c = moveCost(s, u, j);
      if (c >= INF) continue;
      const occ = occupancy(s, u, j, true);
      if (occ === 2) continue;
      const nl = isTransition(s, u, cur, j) ? 0 : Math.max(0, left - c);
      if (!best.has(j) || nl > best.get(j)!) {
        if (!best.has(j)) queue.push(j);
        else if (!queue.includes(j)) queue.push(j);
        best.set(j, nl);
        prev.set(j, cur);
        if (occ === 0) out.set(j, cur); else out.delete(j);
      }
    }
  }
  return out;
}

function clearCampAt(s: GameState, u: Unit): void {
  const t = s.tiles[u.pos];
  if (!t.camp || s.players[u.owner].barb || UNITS[u.type].civilian) return;
  t.camp = false;
  s.camps = s.camps.filter((c) => c.pos !== u.pos);
  const gold = 35 + Math.floor(rand(s) * 20);
  s.players[u.owner].gold += gold;
  emit(s, { type: 'campCleared', owner: u.owner, pos: u.pos, gold });
}

function captureCivilianAt(s: GameState, u: Unit): void {
  if (UNITS[u.type].civilian) return;
  const v = civAt(s, u.pos);
  if (!v || v.owner === u.owner || !atWar(s, v.owner, u.owner)) return;
  const old = v.owner;
  if (s.players[u.owner].barb) { removeUnit(s, v); return; }
  v.owner = u.owner;
  v.goto = -1; v.auto = false; v.sleeping = false; v.moves = 0;
  emit(s, { type: 'notify', owner: old, text: `${UNITS[v.type].name}が捕獲された`, pos: u.pos });
  emit(s, { type: 'notify', owner: u.owner, text: `敵の${UNITS[v.type].name}を捕獲した`, pos: u.pos });
  checkEliminated(s, old, u.owner);
}

/** path に沿って進めるところまで進む。戻り値は到達したか */
function walk(s: GameState, u: Unit, path: number[]): boolean {
  let cur = u.pos, moves = u.moves, stop = 0, stopMoves = u.moves;
  for (let k = 1; k < path.length && moves > 0; k++) {
    const t = path[k];
    const occ = occupancy(s, u, t, false);
    if (occ === 2) break;
    const c = moveCost(s, u, t);
    if (c >= INF) break;
    moves = isTransition(s, u, cur, t) ? 0 : Math.max(0, moves - c);
    cur = t;
    if (occ === 0) { stop = k; stopMoves = moves; }
    // 敵の非戦闘ユニットを踏んだら捕獲してそこで止まる
    const v = civAt(s, t);
    if (occ === 0 && v && v.owner !== u.owner && !UNITS[u.type].civilian && atWar(s, v.owner, u.owner)) break;
  }
  if (stop === 0) return path.length === 1;
  const sub = path.slice(0, stop + 1);
  relocate(s, u, path[stop]);
  u.moves = stopMoves;
  u.acted = true;
  u.fortified = 0;
  u.sleeping = false;
  emit(s, { type: 'move', unit: u.id, owner: u.owner, path: sub });
  captureCivilianAt(s, u);
  clearCampAt(s, u);
  updateVis(s, u.owner);
  return stop === path.length - 1;
}

function doMove(s: GameState, u: Unit, to: number): ActionResult {
  const path = findPath(s, u, to);
  if (!path) { u.goto = -1; return { ok: false, error: 'そこへは移動できません' }; }
  const before = u.pos;
  const arrived = walk(s, u, path);
  u.goto = arrived || !s.players[u.owner].human ? -1 : to;
  if (u.pos === before && u.moves > 0 && !arrived) {
    // 行き止まり（隣が塞がっている等）。予約は残しつつ今ターンは待機
    u.skipped = true;
  }
  return { ok: true };
}

// ---------------------------------------------------------------- 戦闘
export function cityStrength(s: GameState, c: City): number {
  const p = s.players[c.owner];
  let v = 14 + eraOf(p) * 7 + c.pop;
  if (c.buildings.includes('walls')) v += 8;
  if (s.tiles[c.pos].elev === 1) v += 3;
  const g = milAt(s, c.pos);
  if (g) v += Math.floor(UNITS[g.type].str * 0.2);
  return v;
}

export function unitStrength(s: GameState, u: Unit, o: { attack: boolean; ranged: boolean; vs?: Unit; vsCity?: boolean }): number {
  const d = UNITS[u.type], p = s.players[u.owner], t = s.tiles[u.pos];
  let v = o.attack && o.ranged ? d.rng ?? d.str : d.str;
  if (isEmbarked(s, u)) v = Math.max(8, Math.floor(d.str * 0.5));
  v -= Math.round(10 * (1 - u.hp / 100));
  if (!o.attack) {
    if (t.elev === 1) v += 3;
    if (t.feature === 'forest' || t.feature === 'jungle') v += 3;
    if (t.feature === 'marsh') v -= 2;
    v += Math.min(2, u.fortified) * 3;
  }
  if (o.vs) {
    const vc = UNITS[o.vs.type].cls;
    if (d.cls === 'anticav' && vc === 'cavalry') v += 10;
    if (o.attack && o.ranged && d.cls === 'siege') v -= 17;
  }
  if (o.vsCity && o.attack && o.ranged && d.cls !== 'siege') v -= 12;
  const bonus = CIVS[p.civ]?.bonus;
  if (bonus === 'melee' && !d.rng && !d.sea) v += 3;
  if (bonus === 'naval' && d.sea) v += 5;
  if (!p.human && !p.barb) v += [-3, 0, 2, 4][s.difficulty] ?? 0;
  return v;
}

const damage = (s: GameState, diff: number) =>
  Math.max(1, Math.min(150, Math.round(30 * Math.exp(0.04 * diff) * (0.8 + rand(s) * 0.4))));

/** 攻撃可能なタイル一覧 */
export function attackTargets(s: GameState, u: Unit): number[] {
  const d = UNITS[u.type];
  if (d.civilian || u.attacked || u.moves <= 0 || isEmbarked(s, u)) return [];
  const range = d.rng ? d.range ?? 1 : 1;
  const out: number[] = [];
  const pl = s.players[u.owner];
  for (const i of tilesInRange(s.w, s.h, u.pos, range)) {
    if (i === u.pos) continue;
    if (!pl.barb && s.vis[u.owner][i] !== 2) continue;
    const c = cityAt(s, i);
    if (c) {
      if (c.owner !== u.owner && atWar(s, c.owner, u.owner)) out.push(i);
      continue;
    }
    const m = milAt(s, i);
    if (!m || m.owner === u.owner || !atWar(s, m.owner, u.owner)) continue;
    if (!d.rng && !d.sea && isWater(s.tiles[i])) continue;
    out.push(i);
  }
  return out;
}

function setCapital(s: GameState, pid: number): void {
  const cs = citiesOf(s, pid);
  if (!cs.length || cs.some((c) => c.capital)) return;
  cs.sort((a, b) => b.pop - a.pop || a.id - b.id)[0].capital = true;
}

function checkEliminated(s: GameState, pid: number, by: number): void {
  const p = s.players[pid];
  if (p.barb || !p.alive) return;
  if (citiesOf(s, pid).length > 0) return;
  // 都市を一度も持っていない序盤は、開拓者が残っていれば存続
  if (unitsOf(s, pid).some((u) => u.type === 'settler')) return;
  p.alive = false;
  for (const u of unitsOf(s, pid)) {
    const arr = UNITS[u.type].civilian ? rt(s).civ : rt(s).mil;
    if (arr[u.pos] === u.id) arr[u.pos] = 0;
    delete s.units[u.id];
    emit(s, { type: 'unitDied', unit: u.id, owner: pid, pos: u.pos });
  }
  emit(s, { type: 'eliminated', player: pid, by });
  checkVictory(s);
}

function checkVictory(s: GameState): void {
  if (s.winner) return;
  const alive = majors(s).filter((p) => p.alive);
  let w = -1;
  if (alive.length === 1) w = alive[0].id;
  else {
    const caps = Object.values(s.cities).filter((c) => c.originalCapital);
    if (caps.length >= 2 && caps.every((c) => c.owner === caps[0].owner)) w = caps[0].owner;
  }
  if (w >= 0) {
    s.winner = { player: w, kind: 'domination' };
    emit(s, { type: 'victory', winner: s.winner });
  }
}

function captureCity(s: GameState, c: City, by: number): void {
  const old = c.owner;
  const m = milAt(s, c.pos);
  if (m && m.owner === old) removeUnit(s, m);
  const v = civAt(s, c.pos);
  if (v && v.owner === old) { v.owner = by; v.goto = -1; v.auto = false; }
  c.owner = by;
  c.pop = Math.max(1, Math.floor(c.pop * 0.75));
  c.hp = 60;
  c.queue = [];
  c.prod = 0;
  c.food = 0;
  c.capital = false;
  for (const t of s.tiles) if (t.cityId === c.id) t.owner = by;
  assignWorkers(s, c);
  setCapital(s, old);
  setCapital(s, by);
  emit(s, { type: 'cityCaptured', city: c.id, from: old, to: by, pos: c.pos });
  checkEliminated(s, old, by);
  checkVictory(s);
  updateVis(s, by);
  if (s.players[old].alive) updateVis(s, old);
}

function doAttack(s: GameState, a: Unit, target: number): ActionResult {
  if (!attackTargets(s, a).includes(target)) return { ok: false, error: '攻撃できません' };
  const ad = UNITS[a.type];
  const ranged = !!ad.rng;
  const from = a.pos;
  const city = cityAt(s, target);
  let dmgDef = 0, dmgAtk = 0, defKilled = false;
  a.attacked = true; a.acted = true; a.moves = 0; a.fortified = 0; a.sleeping = false; a.goto = -1;

  if (city) {
    const cs = cityStrength(s, city);
    const as = unitStrength(s, a, { attack: true, ranged, vsCity: true }) - (!ranged && riverBetween(s, from, target) ? 5 : 0);
    dmgDef = damage(s, as - cs);
    if (city.buildings.includes('walls') && ad.cls !== 'siege') dmgDef = Math.ceil(dmgDef * 0.6);
    if (!ranged) dmgAtk = damage(s, cs - unitStrength(s, a, { attack: false, ranged: false }));
    city.hp -= dmgDef;
    const barb = s.players[a.owner].barb;
    if (city.hp <= 0) {
      city.hp = 0;
      if (!ranged && !barb) {
        dmgAtk = Math.min(dmgAtk, a.hp - 1);
        defKilled = true;
      } else if (barb) {
        city.hp = 1;
        const p = s.players[city.owner];
        p.gold = Math.max(0, p.gold - 25);
      }
    }
    a.hp -= dmgAtk;
    emit(s, { type: 'attack', attacker: a.id, owner: a.owner, from, to: target, ranged, dmgDef, dmgAtk, defKilled });
    if (defKilled) {
      captureCity(s, city, a.owner);
      relocate(s, a, target);
      emit(s, { type: 'move', unit: a.id, owner: a.owner, path: [from, target] });
      updateVis(s, a.owner);
    } else if (a.hp <= 0) removeUnit(s, a);
    return { ok: true };
  }

  const d = milAt(s, target)!;
  const as = unitStrength(s, a, { attack: true, ranged, vs: d }) - (!ranged && riverBetween(s, from, target) ? 5 : 0);
  const ds = unitStrength(s, d, { attack: false, ranged: false, vs: a });
  dmgDef = damage(s, as - ds);
  if (!ranged) dmgAtk = damage(s, ds - as);
  if (d.hp - dmgDef <= 0) {
    defKilled = true;
    dmgAtk = Math.min(dmgAtk, a.hp - 1);
  }
  d.hp -= dmgDef;
  a.hp -= dmgAtk;
  d.fortified = Math.min(d.fortified, 1);
  emit(s, { type: 'attack', attacker: a.id, owner: a.owner, from, to: target, ranged, dmgDef, dmgAtk, defKilled });
  if (defKilled) {
    removeUnit(s, d);
    if (!ranged && moveCost(s, a, target) < INF && occupancy(s, a, target, false) === 0 && s.units[a.id]) {
      relocate(s, a, target);
      emit(s, { type: 'move', unit: a.id, owner: a.owner, path: [from, target] });
      captureCivilianAt(s, a);
      clearCampAt(s, a);
    }
    updateVis(s, a.owner);
  } else if (a.hp <= 0) {
    removeUnit(s, a);
  }
  return { ok: true };
}

function cityStrike(s: GameState, c: City): void {
  if (!c.buildings.includes('walls')) return;
  let best: Unit | undefined;
  for (const i of tilesInRange(s.w, s.h, c.pos, 2)) {
    const m = milAt(s, i);
    if (!m || !atWar(s, m.owner, c.owner)) continue;
    if (!best || m.hp < best.hp) best = m;
  }
  if (!best) return;
  const ds = unitStrength(s, best, { attack: false, ranged: false });
  const dmg = damage(s, cityStrength(s, c) - ds);
  const killed = best.hp - dmg <= 0;
  best.hp -= dmg;
  emit(s, { type: 'attack', attacker: 0, cityAttacker: c.id, owner: c.owner, from: c.pos, to: best.pos, ranged: true, dmgDef: dmg, dmgAtk: 0, defKilled: killed });
  if (killed) removeUnit(s, best);
}

// ---------------------------------------------------------------- 都市の建設・改良
export function canFound(s: GameState, pos: number, pid: number): boolean {
  const t = s.tiles[pos];
  if (isWater(t) || t.elev === 2 || t.wonder) return false;
  if (t.owner >= 0 && t.owner !== pid) return false;
  for (const id in s.cities) if (dist(s, s.cities[id].pos, pos) < 4) return false;
  return true;
}

function foundCity(s: GameState, pid: number, pos: number): City {
  const p = s.players[pid];
  const names = CIVS[p.civ].cities;
  const n = p.cityNameIdx++;
  const name = n < names.length ? names[n] : `新${names[n % names.length]}`;
  const first = !Object.values(s.cities).some((c) => c.founder === pid);
  const c: City = {
    id: s.nextId++, name, owner: pid, founder: pid, originalCapital: first, capital: citiesOf(s, pid).length === 0,
    pos, pop: 1, food: 0, prod: 0, culture: 0, tilesClaimed: 0, queue: [], buildings: [], hp: CITY_MAX_HP, worked: [], founded: s.turn,
  };
  s.cities[c.id] = c;
  rt(s).city[pos] = c.id;
  const t = s.tiles[pos];
  t.feature = '';
  t.improvement = '';
  t.camp = false;
  for (const i of tilesInRange(s.w, s.h, pos, 1)) {
    if (s.tiles[i].owner < 0 || i === pos) { s.tiles[i].owner = pid; s.tiles[i].cityId = c.id; }
  }
  assignWorkers(s, c);
  emit(s, { type: 'cityFounded', city: c.id, owner: pid, pos });
  updateVis(s, pid);
  return c;
}

/** そのタイルで労働者が実行できる作業（'clear' は地物の除去） */
export function validImprovements(s: GameState, i: number, pid: number): string[] {
  const t = s.tiles[i], p = s.players[pid];
  if (t.owner !== pid || isWater(t) || t.elev === 2 || t.wonder || cityAt(s, i)) return [];
  const out: string[] = [];
  const ok = (k: string) => !IMPROVEMENTS[k].tech || hasTech(p, IMPROVEMENTS[k].tech!);
  if (!t.improvement) {
    if (t.resource && RESOURCES[t.resource].improvement) {
      const k = RESOURCES[t.resource].improvement;
      if (ok(k)) out.push(k);
    } else {
      if (t.elev === 0 && !t.feature && (t.terrain === 'grass' || t.terrain === 'plains')) out.push('farm');
      if (t.elev === 1 && !t.feature && ok('mine')) out.push('mine');
      if (t.feature === 'forest' && ok('lumbermill')) out.push('lumbermill');
    }
    if (t.feature && hasTech(p, 'mining') && !(t.resource && (t.resource === 'silk' || t.resource === 'spices'))) out.push('clear');
  }
  return out;
}

// ---------------------------------------------------------------- 外交
export function declareWar(s: GameState, a: number, b: number): boolean {
  if (a === b || s.war[a][b] || s.players[a].barb || s.players[b].barb) return false;
  if (!s.players[b].alive || s.turn < s.truce[a][b]) return false;
  s.war[a][b] = s.war[b][a] = true;
  s.warSince[a][b] = s.warSince[b][a] = s.turn;
  s.peaceOffer[a][b] = s.peaceOffer[b][a] = -1;
  s.met[a][b] = s.met[b][a] = true;
  emit(s, { type: 'war', a, b });
  return true;
}

function setPeace(s: GameState, a: number, b: number): void {
  s.war[a][b] = s.war[b][a] = false;
  s.truce[a][b] = s.truce[b][a] = s.turn + 12;
  s.peaceOffer[a][b] = s.peaceOffer[b][a] = -1;
  emit(s, { type: 'peace', a, b });
}

/** AI が相手からの和平を受けるか */
export function aiAcceptsPeace(s: GameState, ai: number, other: number): boolean {
  const len = s.turn - s.warSince[ai][other];
  if (len < 8) return false;
  const mine = militaryPower(s, ai), theirs = militaryPower(s, other);
  return len > 30 || mine < theirs * 1.15;
}

function proposePeace(s: GameState, a: number, b: number): ActionResult {
  if (!s.war[a][b]) return { ok: false, error: '戦争状態ではありません' };
  if (s.peaceOffer[b][a] >= 0) { setPeace(s, a, b); return { ok: true }; }
  if (!s.players[b].human) {
    if (aiAcceptsPeace(s, b, a)) { setPeace(s, a, b); return { ok: true }; }
    return { ok: false, error: '和平は拒否されました' };
  }
  s.peaceOffer[a][b] = s.turn;
  emit(s, { type: 'peaceOffer', from: a, to: b });
  return { ok: true };
}

// ---------------------------------------------------------------- 自動探索
/** 最寄りの未探索境界へ向かう。行き先が無ければ false */
export function exploreStep(s: GameState, u: Unit): boolean {
  const nb = rt(s).nb, v = s.vis[u.owner];
  const seen = new Set<number>([u.pos]);
  let frontier = [u.pos];
  let target = -1;
  for (let depth = 0; depth < 14 && target < 0 && frontier.length; depth++) {
    const next: number[] = [];
    for (const cur of frontier) {
      for (let d = 0; d < 6 && target < 0; d++) {
        const j = nb[cur * 6 + d];
        if (j < 0 || seen.has(j)) continue;
        seen.add(j);
        if (moveCost(s, u, j) >= INF || occupancy(s, u, j, true) === 2) continue;
        next.push(j);
        if (occupancy(s, u, j, true) !== 0) continue;
        for (let e = 0; e < 6; e++) {
          const k = nb[j * 6 + e];
          if (k >= 0 && v[k] === 0) { target = j; break; }
        }
      }
      if (target >= 0) break;
    }
    frontier = next;
  }
  if (target < 0) return false;
  const path = findPath(s, u, target);
  if (!path) return false;
  const before = u.pos;
  walk(s, u, path);
  return u.pos !== before;
}

// ---------------------------------------------------------------- ターン進行
export function needsOrders(u: Unit): boolean {
  return u.moves > 0 && !u.sleeping && !u.skipped && u.fortified === 0 && u.goto < 0 && !u.auto;
}

function beginTurn(s: GameState, pid: number): void {
  const p = s.players[pid];
  for (const u of unitsOf(s, pid)) {
    if (!u.acted && u.hp < 100) {
      const t = s.tiles[u.pos];
      const heal = p.barb ? 5 : cityAt(s, u.pos) ? 20 : t.owner === pid ? 15 : 10;
      u.hp = Math.min(100, u.hp + heal);
    }
    if (!u.acted && u.fortified > 0) u.fortified = Math.min(3, u.fortified + 1);
    u.moves = maxMoves(s, u);
    u.attacked = false;
    u.acted = false;
    u.skipped = false;
  }
  if (!p.barb) {
    for (const c of citiesOf(s, pid)) cityStrike(s, c);
    updateVis(s, pid);
    if (p.human) {
      for (const u of unitsOf(s, pid)) {
        if (!s.units[u.id]) continue;
        if (u.goto >= 0) doMove(s, u, u.goto);
        else if (u.auto && !exploreStep(s, u)) {
          u.auto = false;
          emit(s, { type: 'notify', owner: pid, text: `${UNITS[u.type].name}の探索先がなくなりました`, pos: u.pos });
        }
      }
    }
  }
  emit(s, { type: 'turn', player: pid });
}

function endTurn(s: GameState): void {
  const pid = s.current;
  endPlayerTurn(s, pid);
  checkVictory(s);
  const n = s.players.length;
  let next = pid;
  for (let k = 0; k < n; k++) {
    next = (next + 1) % n;
    if (next === 0) {
      s.turn++;
      if (s.turn > s.maxTurns && !s.winner) {
        const alive = majors(s).filter((p) => p.alive).sort((a, b) => b.score - a.score || a.id - b.id);
        s.winner = { player: alive[0].id, kind: 'score' };
        emit(s, { type: 'victory', winner: s.winner });
      }
    }
    if (s.players[next].alive) break;
  }
  s.current = next;
  if (!s.winner) beginTurn(s, next);
}

// ---------------------------------------------------------------- アクション適用
export function applyAction(s: GameState, pid: number, a: Action): ActionResult {
  if (s.winner) return { ok: false, error: 'ゲームは終了しています' };
  if (pid !== s.current) return { ok: false, error: 'あなたのターンではありません' };
  const p = s.players[pid];
  const fail = (error: string): ActionResult => ({ ok: false, error });

  const unit = (id: number): Unit | null => {
    const u = s.units[id];
    return u && u.owner === pid ? u : null;
  };
  const city = (id: number): City | null => {
    const c = s.cities[id];
    return c && c.owner === pid ? c : null;
  };

  switch (a.type) {
    case 'move': {
      const u = unit(a.unit);
      if (!u) return fail('ユニットがありません');
      if (a.to < 0 || a.to >= s.tiles.length) return fail('範囲外です');
      u.auto = false;
      if (u.moves <= 0) { u.goto = p.human ? a.to : -1; return { ok: true }; }
      return doMove(s, u, a.to);
    }
    case 'attack': {
      const u = unit(a.unit);
      if (!u) return fail('ユニットがありません');
      return doAttack(s, u, a.target);
    }
    case 'found': {
      const u = unit(a.unit);
      if (!u || u.type !== 'settler') return fail('開拓者ではありません');
      if (u.moves <= 0) return fail('移動力がありません');
      if (!canFound(s, u.pos, pid)) return fail('ここには都市を建設できません');
      foundCity(s, pid, u.pos);
      removeUnit(s, u);
      return { ok: true };
    }
    case 'improve': {
      const u = unit(a.unit);
      if (!u || u.type !== 'builder') return fail('労働者ではありません');
      if (u.moves <= 0) return fail('移動力がありません');
      if (!validImprovements(s, u.pos, pid).includes(a.improvement)) return fail('ここでは実行できません');
      const t = s.tiles[u.pos];
      if (a.improvement === 'clear') {
        t.feature = '';
        const c = s.cities[t.cityId];
        if (c) c.prod += 20;
      } else {
        t.improvement = a.improvement;
        if (a.improvement === 'farm' || a.improvement === 'mine') t.feature = t.resource ? t.feature : '';
      }
      u.charges--;
      u.moves = 0;
      u.acted = true;
      const c = s.cities[t.cityId];
      if (c) assignWorkers(s, c);
      if (u.charges <= 0) removeUnit(s, u);
      return { ok: true };
    }
    case 'fortify': {
      const u = unit(a.unit);
      if (!u) return fail('ユニットがありません');
      u.goto = -1; u.auto = false;
      if (UNITS[u.type].civilian) u.sleeping = true;
      else u.fortified = Math.max(1, u.fortified);
      return { ok: true };
    }
    case 'sleep': {
      const u = unit(a.unit);
      if (!u) return fail('ユニットがありません');
      u.sleeping = true; u.goto = -1; u.auto = false;
      return { ok: true };
    }
    case 'wake': {
      const u = unit(a.unit);
      if (!u) return fail('ユニットがありません');
      u.sleeping = false; u.fortified = 0; u.goto = -1; u.auto = false; u.skipped = false;
      return { ok: true };
    }
    case 'skip': {
      const u = unit(a.unit);
      if (!u) return fail('ユニットがありません');
      u.skipped = true;
      return { ok: true };
    }
    case 'explore': {
      const u = unit(a.unit);
      if (!u) return fail('ユニットがありません');
      u.auto = true; u.goto = -1; u.sleeping = false; u.fortified = 0;
      if (u.moves > 0 && !exploreStep(s, u)) { u.auto = false; return fail('探索できる場所がありません'); }
      return { ok: true };
    }
    case 'disband': {
      const u = unit(a.unit);
      if (!u) return fail('ユニットがありません');
      removeUnit(s, u);
      return { ok: true };
    }
    case 'setQueue': {
      const c = city(a.city);
      if (!c) return fail('都市がありません');
      const q: string[] = [];
      for (const item of a.queue.slice(0, 8)) {
        if (!canBuild(s, c, item)) continue;
        if (item[0] !== 'u' && q.includes(item)) continue;
        q.push(item);
      }
      c.queue = q;
      return { ok: true };
    }
    case 'buy': {
      const c = city(a.city);
      if (!c) return fail('都市がありません');
      if (a.item[0] === 'p' || !canBuild(s, c, a.item)) return fail('購入できません');
      const cost = buyCost(s, c, a.item);
      if (p.gold < cost) return fail('ゴールドが足りません');
      if (!completeItem(s, c, a.item)) return fail('配置できる場所がありません');
      p.gold -= cost;
      const qi = c.queue.indexOf(a.item);
      if (qi >= 0) c.queue.splice(qi, 1);
      updateVis(s, pid);
      return { ok: true };
    }
    case 'research': {
      if (!availableTechs(p).includes(a.tech)) return fail('研究できません');
      p.research = a.tech;
      return { ok: true };
    }
    case 'declareWar': {
      const o = s.players[a.target];
      if (!o || o.barb || !o.alive || a.target === pid) return fail('対象が不正です');
      if (s.turn < s.truce[pid][a.target]) return fail('休戦期間中です');
      return declareWar(s, pid, a.target) ? { ok: true } : fail('宣戦できません');
    }
    case 'makePeace': {
      const o = s.players[a.target];
      if (!o || o.barb || a.target === pid) return fail('対象が不正です');
      return proposePeace(s, pid, a.target);
    }
    case 'endTurn':
      endTurn(s);
      return { ok: true };
  }
}

// ---------------------------------------------------------------- 新規ゲーム
export function createGame(o: NewGameOptions): GameState {
  const size = MAP_SIZES[o.size] ?? MAP_SIZES.standard;
  const nMajors = Math.max(2, Math.min(size.players, o.opponents + 1));
  const { tiles, starts } = generateMap(size.w, size.h, o.seed, nMajors);
  const s: GameState = {
    version: SAVE_VERSION, seed: o.seed, rng: (o.seed * 2654435761) | 0, turn: 1, maxTurns: 300,
    difficulty: o.difficulty, current: 0, w: size.w, h: size.h, tiles, units: {}, cities: {}, players: [],
    war: [], met: [], truce: [], peaceOffer: [], warSince: [], vis: [], camps: [], nextId: 1, winner: null, events: [],
  };
  const pool = Object.keys(CIVS).filter((k) => k !== o.civ);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const civs = [o.civ in CIVS ? o.civ : pool.pop()!, ...pool].slice(0, Math.min(nMajors, starts.length));
  const mk = (id: number, civ: string, human: boolean, barb: boolean): Player => ({
    id, civ, name: barb ? '蛮族' : CIVS[civ].name, leader: barb ? '' : CIVS[civ].leader,
    color: barb ? BARB_COLOR : CIVS[civ].color, color2: barb ? '#a33' : CIVS[civ].color2,
    human, barb, alive: true, gold: barb ? 0 : 20, techs: [], research: '', progress: {}, sciOverflow: 0,
    spaceStage: 0, score: 0, cityNameIdx: 0, wonders: [], income: { gold: 0, sci: 0, cul: 0 },
  });
  civs.forEach((civ, i) => s.players.push(mk(i, civ, i === 0 && !o.allAI, false)));
  s.players.push(mk(s.players.length, 'barb', false, true));
  const np = s.players.length;
  const grid = <T,>(v: T) => Array.from({ length: np }, () => Array<T>(np).fill(v));
  s.war = grid(false); s.met = grid(false); s.truce = grid(0); s.peaceOffer = grid(-1); s.warSince = grid(0);
  s.vis = Array.from({ length: np }, () => Array<number>(s.w * s.h).fill(0));
  civs.forEach((_, i) => {
    const pos = starts[i];
    spawnUnit(s, 'settler', i, pos);
    spawnUnit(s, 'warrior', i, pos);
    if (!s.players[i].human && s.difficulty >= 2) {
      const t = findSpawnTile(s, 'warrior', i, pos);
      if (t >= 0) spawnUnit(s, 'warrior', i, t);
    }
    if (!s.players[i].human && s.difficulty >= 3) {
      const t = findSpawnTile(s, 'builder', i, pos);
      if (t >= 0) spawnUnit(s, 'builder', i, t);
    }
  });
  for (let i = 0; i < np; i++) updateVis(s, i);
  s.events = [];
  beginTurn(s, 0);
  return s;
}

// ---------------------------------------------------------------- セーブ
export function serialize(s: GameState): string {
  const { events, tiles, vis, ...rest } = s;
  void events;
  const packed = tiles.map((t) => [t.terrain, t.elev, t.feature, t.resource, t.improvement, t.owner, t.cityId, t.camp ? 1 : 0, t.river, t.wonder]);
  return JSON.stringify({ ...rest, tiles: packed, vis: vis.map((v) => v.join('')) });
}

export function deserialize(json: string): GameState {
  const o = JSON.parse(json);
  if (o.version !== SAVE_VERSION) throw new Error('セーブデータのバージョンが異なります');
  o.tiles = o.tiles.map((t: [Tile['terrain'], number, Tile['feature'], string, string, number, number, number, number?, string?]) => ({
    terrain: t[0], elev: t[1], feature: t[2], resource: t[3], improvement: t[4], owner: t[5], cityId: t[6], camp: !!t[7], river: t[8] ?? 0, wonder: t[9] ?? '',
  }));
  for (const p of o.players) p.wonders ??= [];
  o.vis = o.vis.map((v: string) => Array.from(v, Number));
  o.events = [];
  return o as GameState;
}
