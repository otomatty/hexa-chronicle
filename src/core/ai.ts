// AIプレイヤーと蛮族の思考。人間と同じ applyAction だけを使って行動する。
import { BUILDINGS, CIVS, MAP_SIZES, MARVELS, TECHS, UNITS } from './data';
import { tilesInRange } from './hex';
import {
  applyAction, atWar, attackTargets, availableItems, availableTechs, buyCost, canFound, cityAt, citiesOf, cityStrength,
  dist, eraOf, exploreStep, findSpawnTile, isCoastal, isWater, majors, milAt, civAt, militaryPower, rand, spawnUnit,
  tileYield, unitStrength, unitsOf, validImprovements, cityTiles, cityYields,
} from './game';
import type { City, GameState, Player, Unit } from './types';

const TECH_WEIGHT: Record<string, number> = {
  pottery: 0.6, mining: 0.6, animal: 0.7, writing: 0.6, archery: 0.9, bronze: 0.8, sailing: 1.4, celestial: 1.2,
  currency: 0.8, iron: 0.8, education: 0.7, apprenticeship: 0.8, machinery: 0.9, banking: 0.8, gunpowder: 0.8,
  cartography: 1.25, industrialization: 0.8, scitheory: 0.7, electricity: 0.8, rocketry: 0.8, spaceflight: 0.6,
};

interface Ctx {
  era: number;
  cities: City[];
  mil: Unit[];
  settlers: number;
  builders: number;
  recon: number;
  atWar: boolean;
  improvable: number;
  targetCities: number;
  claimedSites: number[];
  builderTargets: Set<number>;
  enemies: Unit[];
  enemyCities: City[];
  garrison: Map<number, number>;
  fieldArmy: number;
}

export function runAI(s: GameState, pid: number): void {
  if (s.winner || s.current !== pid) return;
  const p = s.players[pid];
  if (p.barb) barbarians(s, pid);
  else if (p.alive) {
    diplomacy(s, p);
    research(s, p);
    const ctx = buildCtx(s, p);
    for (const c of ctx.cities) chooseProduction(s, p, c, ctx);
    spendGold(s, p);
    unitsTurn(s, p, ctx);
  }
  applyAction(s, pid, { type: 'endTurn' });
}

// ---------------------------------------------------------------- 蛮族
function barbUnitType(s: GameState): string {
  const ms = majors(s).filter((p) => p.alive);
  const era = ms.reduce((a, p) => a + eraOf(p), 0) / Math.max(1, ms.length);
  const r = rand(s);
  if (era < 1) return r < 0.8 ? 'warrior' : 'archer';
  if (era < 2) return r < 0.4 ? 'warrior' : r < 0.7 ? 'spearman' : 'archer';
  if (era < 3.2) return r < 0.5 ? 'swordsman' : r < 0.8 ? 'pikeman' : 'crossbow';
  return r < 0.7 ? 'musketman' : 'crossbow';
}

function barbarians(s: GameState, pid: number): void {
  const nMaj = majors(s).filter((p) => p.alive).length;
  if (s.turn >= 6 && s.camps.length < nMaj + 1 && rand(s) < 0.3) {
    for (let k = 0; k < 40; k++) {
      const i = Math.floor(rand(s) * s.tiles.length);
      const t = s.tiles[i];
      if (isWater(t) || t.elev === 2 || t.wonder || t.owner >= 0 || milAt(s, i) || civAt(s, i)) continue;
      if (s.camps.some((c) => dist(s, c.pos, i) < 7)) continue;
      if (Object.values(s.cities).some((c) => dist(s, c.pos, i) < 5)) continue;
      if (majors(s).some((p) => s.vis[p.id][i] === 2)) continue;
      t.camp = true;
      t.improvement = '';
      s.camps.push({ pos: i, cooldown: 6 });
      spawnUnit(s, barbUnitType(s), pid, i).guard = true;
      break;
    }
  }
  for (const camp of s.camps) {
    if (!milAt(s, camp.pos)) spawnUnit(s, barbUnitType(s), pid, camp.pos).guard = true;
    if (--camp.cooldown > 0) continue;
    camp.cooldown = 9 - s.difficulty + Math.floor(rand(s) * 4);
    let near = 0;
    for (const i of tilesInRange(s.w, s.h, camp.pos, 4)) {
      const m = milAt(s, i);
      if (m && m.owner === pid) near++;
    }
    if (near >= 3) continue;
    const type = barbUnitType(s);
    const pos = findSpawnTile(s, type, pid, camp.pos);
    if (pos >= 0 && pos !== camp.pos) spawnUnit(s, type, pid, pos);
  }
  for (const u of unitsOf(s, pid)) {
    if (!s.units[u.id]) continue;
    if (tryAttack(s, u, true)) continue;
    if (u.guard) continue;
    let target = -1, bd = 8;
    for (const i of tilesInRange(s.w, s.h, u.pos, 7)) {
      const m = milAt(s, i) ?? civAt(s, i);
      const c = cityAt(s, i);
      if ((m && m.owner !== pid) || c) {
        const d = dist(s, u.pos, i);
        if (d < bd) { bd = d; target = i; }
      }
    }
    if (target >= 0) {
      applyAction(s, pid, { type: 'move', unit: u.id, to: target });
      if (s.units[u.id]) tryAttack(s, u, true);
    } else if (rand(s) < 0.5) {
      const opts = tilesInRange(s.w, s.h, u.pos, 2);
      applyAction(s, pid, { type: 'move', unit: u.id, to: opts[Math.floor(rand(s) * opts.length)] });
    }
  }
}

// ---------------------------------------------------------------- 外交・研究
function diplomacy(s: GameState, p: Player): void {
  const pid = p.id, civ = CIVS[p.civ];
  const mine = militaryPower(s, pid);
  const myCities = citiesOf(s, pid);
  let wars = 0;
  for (const o of majors(s)) if (o.id !== pid && o.alive && s.war[pid][o.id]) wars++;
  const milCount = unitsOf(s, pid).filter((u) => !UNITS[u.type].civilian).length;
  for (const o of majors(s)) {
    if (o.id === pid || !o.alive || !s.met[pid][o.id]) continue;
    const theirs = militaryPower(s, o.id);
    if (s.war[pid][o.id]) {
      const len = s.turn - s.warSince[pid][o.id];
      const offered = s.peaceOffer[pid][o.id];
      if (len >= 10 && (mine < theirs * 0.8 || len > 30 + civ.aggr * 25) && (offered < 0 || s.turn - offered >= 10)) {
        applyAction(s, pid, { type: 'makePeace', target: o.id });
      }
    } else if (wars === 0 && s.turn >= 40 - s.difficulty * 6 && s.turn >= s.truce[pid][o.id] && milCount >= 4) {
      let near = 99;
      for (const a of myCities) for (const b of citiesOf(s, o.id)) near = Math.min(near, dist(s, a.pos, b.pos));
      const ratio = mine / Math.max(1, theirs + citiesOf(s, o.id).length * 12);
      const chance = civ.aggr * 0.035 * (ratio > 1.4 ? 2.5 : ratio > 1.05 ? 1 : 0.08) * (near <= 12 ? 1 : near <= 18 ? 0.35 : 0.05);
      if (rand(s) < chance) {
        applyAction(s, pid, { type: 'declareWar', target: o.id });
        wars++;
      }
    }
  }
}

function research(s: GameState, p: Player): void {
  if (p.research) return;
  const av = availableTechs(p);
  if (!av.length) return;
  let best = av[0], bs = Infinity;
  for (const k of av) {
    const sc = (p.progress[k] ? 0.5 : 1) * (TECH_WEIGHT[k] ?? 1) * (0.85 + rand(s) * 0.3) * TECHS[k].cost;
    if (sc < bs) { bs = sc; best = k; }
  }
  applyAction(s, p.id, { type: 'research', tech: best });
}

// ---------------------------------------------------------------- 状況把握
function buildCtx(s: GameState, p: Player): Ctx {
  const pid = p.id;
  const us = unitsOf(s, pid);
  const cities = citiesOf(s, pid);
  const mil = us.filter((u) => !UNITS[u.type].civilian);
  let improvable = 0;
  for (let i = 0; i < s.tiles.length; i++) {
    if (s.tiles[i].owner !== pid) continue;
    if (validImprovements(s, i, pid).some((k) => k !== 'clear')) improvable++;
  }
  const enemies: Unit[] = [];
  for (const id in s.units) {
    const u = s.units[id];
    if (u.owner !== pid && atWar(s, u.owner, pid) && s.vis[pid][u.pos] === 2 && !UNITS[u.type].civilian) enemies.push(u);
  }
  const enemyCities = Object.values(s.cities).filter((c) => c.owner !== pid && s.war[pid][c.owner] && s.vis[pid][c.pos] >= 1);
  const sizeKey = Object.keys(MAP_SIZES).find((k) => MAP_SIZES[k].w === s.w) ?? 'standard';
  const targetCities = (sizeKey === 'small' ? 4 : sizeKey === 'large' ? 6 : 5) + (CIVS[p.civ].aggr < 0.5 ? 1 : 0);
  // 駐留の割り当て：都市にいる部隊を優先、いなければ最寄りの部隊
  const garrison = new Map<number, number>();
  const used = new Set<number>();
  for (const c of cities) {
    const m = milAt(s, c.pos);
    if (m && m.owner === pid) { garrison.set(c.id, m.id); used.add(m.id); }
  }
  for (const c of cities) {
    if (garrison.has(c.id)) continue;
    let best: Unit | undefined, bd = 99;
    for (const u of mil) {
      if (used.has(u.id) || UNITS[u.type].cls === 'recon' || UNITS[u.type].sea) continue;
      const d = dist(s, u.pos, c.pos);
      if (d < bd) { bd = d; best = u; }
    }
    if (best) { garrison.set(c.id, best.id); used.add(best.id); }
  }
  return {
    era: eraOf(p), cities, mil,
    settlers: us.filter((u) => u.type === 'settler').length + cities.filter((c) => c.queue.includes('u:settler')).length,
    builders: us.filter((u) => u.type === 'builder').length + cities.filter((c) => c.queue.includes('u:builder')).length,
    recon: us.filter((u) => UNITS[u.type].cls === 'recon').length,
    atWar: majors(s).some((o) => o.id !== pid && o.alive && s.war[pid][o.id]),
    improvable, targetCities, claimedSites: [], builderTargets: new Set(), enemies, enemyCities, garrison,
    fieldArmy: mil.length - used.size,
  };
}

function siteValue(s: GameState, i: number, pid: number): number {
  let v = 0;
  for (const j of tilesInRange(s.w, s.h, i, 2)) {
    const t = s.tiles[j];
    if (t.owner >= 0 && t.owner !== pid) { v -= 1.5; continue; }
    if (t.owner === pid) { v -= 0.6; }
    const y = tileYield(s, j);
    v += y.food * 1.5 + y.prod * 1.2 + y.gold * 0.5 + (t.resource ? 2 : 0);
  }
  if (isCoastal(s, i)) v += 3;
  if (s.tiles[i].elev === 1) v += 1.5;
  return v;
}

function bestCitySite(s: GameState, pid: number, from: number, ctx: Ctx, maxDist = 10): { pos: number; score: number } | null {
  let best = -1, bs = -1e9;
  for (const i of tilesInRange(s.w, s.h, from, maxDist)) {
    if (s.vis[pid][i] === 0 || !canFound(s, i, pid)) continue;
    if (ctx.claimedSites.some((c) => dist(s, c, i) < 4)) continue;
    const m = milAt(s, i);
    if (m && m.owner !== pid) continue;
    let sc = siteValue(s, i, pid) - dist(s, from, i) * 0.9;
    let nearOwn = 99;
    for (const c of ctx.cities) nearOwn = Math.min(nearOwn, dist(s, c.pos, i));
    if (nearOwn > 7 && nearOwn < 99) sc -= (nearOwn - 7) * 2;
    if (sc > bs) { bs = sc; best = i; }
  }
  return best >= 0 && bs > 12 ? { pos: best, score: bs } : null;
}

// ---------------------------------------------------------------- 生産
function bestUnit(items: string[], classes: string[]): string | undefined {
  let best: string | undefined, bv = -1;
  for (const it of items) {
    if (it[0] !== 'u') continue;
    const d = UNITS[it.slice(2)];
    if (!classes.includes(d.cls)) continue;
    const v = Math.max(d.str, d.rng ?? 0);
    if (v > bv) { bv = v; best = it; }
  }
  return best;
}

function militaryPick(s: GameState, items: string[], ctx: Ctx): string | undefined {
  const count = (cls: string) => ctx.mil.filter((u) => UNITS[u.type].cls === cls).length;
  const melee = count('melee') + count('anticav');
  const ranged = count('ranged'), cav = count('cavalry'), siege = count('siege');
  const walled = ctx.enemyCities.some((c) => c.buildings.includes('walls'));
  const sg = bestUnit(items, ['siege']);
  if (sg && ctx.atWar && siege < (walled ? 3 : 1) && melee >= 2) return sg;
  const rg = bestUnit(items, ['ranged']);
  if (rg && ranged * 2 < melee + cav) return rg;
  const cv = bestUnit(items, ['cavalry']);
  if (cv && cav < melee && rand(s) < 0.5) return cv;
  return bestUnit(items, ['melee', 'anticav']) ?? rg ?? cv;
}

function chooseProduction(s: GameState, p: Player, c: City, ctx: Ctx): void {
  if (c.queue.length && c.queue[0] !== 'p:wealth') return;
  const items = availableItems(s, c);
  const has = (i: string) => items.includes(i);
  const civ = CIVS[p.civ];
  const nC = ctx.cities.length, nM = ctx.mil.length;
  const milTarget = nC * 1.3 + 2 + ctx.era * 0.8 + civ.aggr * 2;
  const milCap = nC * 2.2 + 3 + ctx.era * 1.5 + civ.aggr * 3 + (ctx.atWar ? 3 : 0);
  const threatened = ctx.enemies.some((e) => dist(s, e.pos, c.pos) <= 4);
  let pick: string | undefined;

  const space = ['p:satellite', 'p:moon', 'p:starship'].find(has);
  if (space) {
    const rank = [...ctx.cities].sort((a, b) => b.pop - a.pop).indexOf(c);
    if (rank < 2 && !ctx.cities.some((o) => o !== c && o.queue[0] === space && rank > 0)) pick = space;
  }
  const g = milAt(s, c.pos);
  if (!pick && (!g || g.owner !== p.id) && nM < nC + 1) pick = bestUnit(items, ['melee', 'anticav']);
  if (!pick && s.turn < 25 && ctx.recon === 0 && nM >= 1 && nC === 1) { pick = 'u:scout'; ctx.recon++; }
  if (!pick && nC + ctx.settlers < ctx.targetCities && c.pop >= 2 && !threatened && nM >= nC && bestCitySite(s, p.id, c.pos, ctx)) {
    pick = 'u:settler';
    ctx.settlers++;
  }
  if (!pick && ctx.builders < Math.ceil(nC * 0.6) && ctx.improvable > ctx.builders * 2) { pick = 'u:builder'; ctx.builders++; }
  if (!pick && (ctx.atWar || threatened) && nM < milCap && rand(s) < 0.6) pick = militaryPick(s, items, ctx);
  if (!pick) {
    let best: string | undefined, bv = 0;
    const rank = [...ctx.cities].sort((a, b) => b.pop - a.pop || a.id - b.id).indexOf(c);
    const prodNow = Math.max(1, cityYields(s, c).prod);
    for (const it of items) {
      if (it[0] !== 'b' && it[0] !== 'w') continue;
      const k = it.slice(2), d = it[0] === 'w' ? MARVELS[k] : BUILDINGS[k];
      let v = d.y.food * (c.pop < 6 ? 1.8 : 1.1) + d.y.prod * 1.5 + d.y.gold * 0.8 + d.y.sci * 1.6 + d.y.cul * (s.turn < 60 ? 1.6 : 0.9);
      if (it[0] === 'w') {
        // 世界遺産は、生産力のある上位都市で、現実的なターン数で建つときだけ狙う
        if (rank > 1 || d.cost / prodNow > 26 || threatened || ctx.atWar) continue;
        v = v * 1.3 + 1.5;
      }
      if (k === 'walls') v = threatened || ctx.atWar ? 7 : 1.2;
      const sc = v / Math.pow(d.cost, 0.8);
      if (sc > bv) { bv = sc; best = it; }
    }
    if (best && !(nM < milTarget && rand(s) < 0.4)) pick = best;
    else if (nM < milCap) pick = militaryPick(s, items, ctx) ?? best;
    else pick = best;
  }
  if (!pick) pick = 'p:wealth';
  if (pick[0] === 'u' && !UNITS[pick.slice(2)].civilian) ctx.mil.push({ type: pick.slice(2) } as Unit);
  applyAction(s, p.id, { type: 'setQueue', city: c.id, queue: [pick] });
}

function spendGold(s: GameState, p: Player): void {
  const reserve = 40 + eraOf(p) * 25;
  for (const c of citiesOf(s, p.id).sort((a, b) => a.pop - b.pop)) {
    const it = c.queue[0];
    if (!it || it[0] === 'p') continue;
    if (it === 'u:settler' && c.pop < 2) continue;
    if (p.gold >= buyCost(s, c, it) + reserve) applyAction(s, p.id, { type: 'buy', city: c.id, item: it });
  }
}

// ---------------------------------------------------------------- ユニット行動
const expected = (diff: number) => 30 * Math.exp(0.04 * diff);

/** 有利な攻撃があれば実行する */
function tryAttack(s: GameState, u: Unit, reckless = false, allowCityMelee = true): boolean {
  const targets = attackTargets(s, u);
  if (!targets.length) return false;
  const d = UNITS[u.type];
  const ranged = !!d.rng;
  let best = -1, bs = -1e9;
  for (const t of targets) {
    const c = cityAt(s, t);
    let sc: number;
    if (c) {
      const as = unitStrength(s, u, { attack: true, ranged, vsCity: true });
      const cs = cityStrength(s, c);
      const dealt = expected(as - cs) * (c.buildings.includes('walls') && d.cls !== 'siege' ? 0.6 : 1);
      if (ranged) sc = 20 + dealt;
      else {
        if (!allowCityMelee) continue;
        const taken = expected(cs - unitStrength(s, u, { attack: false, ranged: false }));
        const capture = c.hp <= dealt * 1.05;
        if (!capture && !reckless && (u.hp - taken < 30 || c.hp > 130)) continue;
        sc = capture ? 200 : dealt - taken * 0.5;
      }
    } else {
      const m = milAt(s, t)!;
      const as = unitStrength(s, u, { attack: true, ranged, vs: m });
      const ds = unitStrength(s, m, { attack: false, ranged: false, vs: u });
      const dealt = expected(as - ds), taken = ranged ? 0 : expected(ds - as);
      const kill = m.hp <= dealt * 0.9;
      if (!ranged && !kill && !reckless && (u.hp - taken < 25 || dealt < taken * 0.6)) continue;
      if (!ranged && reckless && !kill && u.hp - taken < 10) continue;
      sc = dealt - taken * 0.8 + (kill ? 40 : 0) + (100 - m.hp) * 0.1;
    }
    if (sc > bs) { bs = sc; best = t; }
  }
  if (best < 0) return false;
  return applyAction(s, u.owner, { type: 'attack', unit: u.id, target: best }).ok;
}

function nearestCity(s: GameState, cities: City[], pos: number): City | undefined {
  let best: City | undefined, bd = 1e9;
  for (const c of cities) {
    const d = dist(s, c.pos, pos);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

function settlerTurn(s: GameState, p: Player, u: Unit, ctx: Ctx): void {
  const pid = p.id;
  if (ctx.cities.length === 0 && canFound(s, u.pos, pid)) {
    applyAction(s, pid, { type: 'found', unit: u.id });
    return;
  }
  if (ctx.enemies.some((e) => dist(s, e.pos, u.pos) <= 2)) {
    const home = nearestCity(s, ctx.cities, u.pos);
    if (home && home.pos !== u.pos) { applyAction(s, pid, { type: 'move', unit: u.id, to: home.pos }); return; }
  }
  const site = bestCitySite(s, pid, u.pos, ctx, 12);
  if (site) {
    ctx.claimedSites.push(site.pos);
    if (site.pos !== u.pos) applyAction(s, pid, { type: 'move', unit: u.id, to: site.pos });
    const cur = s.units[u.id];
    if (cur && cur.pos === site.pos && cur.moves > 0) applyAction(s, pid, { type: 'found', unit: u.id });
    else if (cur && cur.pos === u.pos && cur.moves > 0 && canFound(s, cur.pos, pid) && siteValue(s, cur.pos, pid) > 14) {
      applyAction(s, pid, { type: 'found', unit: u.id });
    }
  } else if (canFound(s, u.pos, pid) && siteValue(s, u.pos, pid) > 10) {
    applyAction(s, pid, { type: 'found', unit: u.id });
  } else if (!exploreStep(s, u) && ctx.cities.length) {
    const home = nearestCity(s, ctx.cities, u.pos)!;
    if (home.pos !== u.pos) applyAction(s, pid, { type: 'move', unit: u.id, to: home.pos });
  }
}

function builderTurn(s: GameState, p: Player, u: Unit, ctx: Ctx): void {
  const pid = p.id;
  if (ctx.enemies.some((e) => dist(s, e.pos, u.pos) <= 2)) {
    const home = nearestCity(s, ctx.cities, u.pos);
    if (home && home.pos !== u.pos) { applyAction(s, pid, { type: 'move', unit: u.id, to: home.pos }); return; }
  }
  const here = validImprovements(s, u.pos, pid).filter((k) => k !== 'clear');
  if (here.length && !ctx.builderTargets.has(u.pos)) {
    ctx.builderTargets.add(u.pos);
    applyAction(s, pid, { type: 'improve', unit: u.id, improvement: here[0] });
    return;
  }
  let best = -1, bs = -1e9;
  for (const c of ctx.cities) {
    for (const i of cityTiles(s, c)) {
      if (ctx.builderTargets.has(i)) continue;
      const opts = validImprovements(s, i, pid).filter((k) => k !== 'clear');
      if (!opts.length) continue;
      const other = civAt(s, i);
      if (other && other.id !== u.id) continue;
      if (ctx.enemies.some((e) => dist(s, e.pos, i) <= 2)) continue;
      const sc = (s.tiles[i].resource ? 5 : 0) + (c.worked.includes(i) ? 3 : 0) - dist(s, u.pos, i) * 1.2 - dist(s, c.pos, i) * 0.5;
      if (sc > bs) { bs = sc; best = i; }
    }
  }
  if (best >= 0) {
    ctx.builderTargets.add(best);
    applyAction(s, pid, { type: 'move', unit: u.id, to: best });
    const cur = s.units[u.id];
    if (cur && cur.pos === best && cur.moves > 0) {
      const opts = validImprovements(s, best, pid).filter((k) => k !== 'clear');
      if (opts.length) applyAction(s, pid, { type: 'improve', unit: u.id, improvement: opts[0] });
    }
  }
}

function militaryTurn(s: GameState, p: Player, u: Unit, ctx: Ctx): void {
  const pid = p.id, d = UNITS[u.type];
  const ranged = !!d.rng;
  const garrisonCity = [...ctx.garrison.entries()].find(([, id]) => id === u.id)?.[0];
  const isGarrison = garrisonCity !== undefined;
  const inCity = isGarrison && s.cities[garrisonCity!]?.pos === u.pos;

  // 駐留中の近接部隊は都市から出ない
  if (!(inCity && !ranged) && tryAttack(s, u, false, ctx.fieldArmy >= 3)) return;
  if (inCity) { applyAction(s, pid, { type: 'fortify', unit: u.id }); return; }
  if (isGarrison) {
    applyAction(s, pid, { type: 'move', unit: u.id, to: s.cities[garrisonCity!].pos });
    return;
  }
  if (d.cls === 'recon') {
    if (!exploreStep(s, u)) applyAction(s, pid, { type: 'disband', unit: u.id });
    return;
  }
  const home = nearestCity(s, ctx.cities, u.pos);
  if (u.hp < 45 && home) {
    if (s.tiles[u.pos].owner === pid || dist(s, home.pos, u.pos) <= 1) applyAction(s, pid, { type: 'fortify', unit: u.id });
    else applyAction(s, pid, { type: 'move', unit: u.id, to: home.pos });
    return;
  }
  // 目標の決定
  let target = -1;
  let bd = 99;
  for (const e of ctx.enemies) {
    const de = dist(s, e.pos, u.pos);
    const nearHome = ctx.cities.some((c) => dist(s, c.pos, e.pos) <= 5);
    if ((de <= 4 || (nearHome && de <= 9)) && de < bd) { bd = de; target = e.pos; }
  }
  if (target < 0 && ctx.enemyCities.length && ctx.fieldArmy >= 3) {
    const c = nearestCity(s, ctx.enemyCities, home ? home.pos : u.pos);
    if (c) target = c.pos;
  }
  if (target < 0) {
    for (const camp of s.camps) {
      const dc = dist(s, camp.pos, u.pos);
      if (s.vis[pid][camp.pos] >= 1 && dc <= 8 && dc < bd && u.hp > 60) { bd = dc; target = camp.pos; }
    }
  }
  if (target >= 0) {
    const need = ranged ? d.range ?? 2 : 1;
    if (dist(s, u.pos, target) > need) applyAction(s, pid, { type: 'move', unit: u.id, to: target });
    const cur = s.units[u.id];
    if (cur && cur.moves > 0 && !cur.attacked) tryAttack(s, cur, false, ctx.fieldArmy >= 3);
    return;
  }
  if (s.turn < 30 && ctx.cities.length <= 1 && ctx.mil.length > 1 && exploreStep(s, u)) return;
  if (home && dist(s, home.pos, u.pos) > 3) applyAction(s, pid, { type: 'move', unit: u.id, to: home.pos });
  else applyAction(s, pid, { type: 'fortify', unit: u.id });
}

function unitsTurn(s: GameState, p: Player, ctx: Ctx): void {
  const us = unitsOf(s, p.id).sort((a, b) => {
    const ra = UNITS[a.type].rng ? 0 : 1, rb = UNITS[b.type].rng ? 0 : 1;
    return ra - rb || a.id - b.id;
  });
  for (const u of us) {
    if (!s.units[u.id] || s.winner) continue;
    if (u.type === 'settler') settlerTurn(s, p, u, ctx);
    else if (u.type === 'builder') builderTurn(s, p, u, ctx);
    else militaryTurn(s, p, u, ctx);
  }
}
