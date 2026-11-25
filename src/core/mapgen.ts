// マップ生成。シード値から決定論的に大陸・気候・資源・初期位置を作る。
import { fbm, hexDist, neighborTable, nextRand, tilesInRange, tileX, tileZ } from './hex';
import type { Feature, Terrain, Tile } from './types';

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function generateMap(w: number, h: number, seed: number, nPlayers: number): { tiles: Tile[]; starts: number[] } {
  const n = w * h;
  const nb = neighborTable(w, h);
  const R = { rng: seed | 0 };
  const rand = () => nextRand(R);

  // --- 高度場から陸海を決める
  const val = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const fx = tileX(w, i) * 0.115, fz = tileZ(w, i) * 0.115;
    const nx = (i % w) / (w - 1), ny = ((i / w) | 0) / (h - 1);
    const e = fbm(fx, fz, seed, 5);
    const low = fbm(fx * 0.4 + 9.1, fz * 0.4 + 3.7, seed + 7, 3);
    const edge = smooth(0, 0.13, Math.min(nx, 1 - nx)) * smooth(0, 0.16, Math.min(ny, 1 - ny));
    val[i] = (e * 0.55 + low * 0.45) * (0.35 + 0.65 * edge);
  }
  const sorted = Array.from(val).sort((a, b) => a - b);
  const sea = sorted[Math.floor(n * 0.6)];

  const tiles: Tile[] = [];
  const land: number[] = [];
  for (let i = 0; i < n; i++) {
    const isLand = val[i] > sea;
    tiles.push({ terrain: isLand ? 'grass' : 'ocean', elev: 0, feature: '', resource: '', improvement: '', owner: -1, cityId: -1, camp: false, river: 0 });
    if (isLand) land.push(i);
  }

  // --- 起伏
  const rug = new Float32Array(n);
  for (const i of land) {
    const fx = tileX(w, i) * 0.3, fz = tileZ(w, i) * 0.3;
    const ridge = 1 - Math.abs(fbm(fx, fz, seed + 31, 3) * 2 - 1);
    rug[i] = ridge * 0.7 + fbm(fx * 2, fz * 2, seed + 37, 2) * 0.3;
  }
  const rs = land.map((i) => rug[i]).sort((a, b) => a - b);
  const mtn = rs[Math.floor(rs.length * 0.93)] ?? 9;
  const hill = rs[Math.floor(rs.length * 0.72)] ?? 9;

  // --- 気候
  for (const i of land) {
    const t = tiles[i];
    const fx = tileX(w, i) * 0.13, fz = tileZ(w, i) * 0.13;
    const lat = Math.abs(((i / w) | 0) / (h - 1) - 0.5) * 2;
    const temp = 1 - lat + (fbm(fx, fz, seed + 41, 3) - 0.5) * 0.3;
    const moist = fbm(fx * 1.2 + 5, fz * 1.2 + 5, seed + 53, 4);
    let terrain: Terrain;
    if (temp < 0.1) terrain = 'snow';
    else if (temp < 0.24) terrain = 'tundra';
    else if (moist < 0.4 && temp > 0.5) terrain = 'desert';
    else if (moist < 0.53) terrain = 'plains';
    else terrain = 'grass';
    t.terrain = terrain;
    t.elev = rug[i] > mtn ? 2 : rug[i] > hill ? 1 : 0;
    if (t.elev === 2) continue;
    const fn = fbm(fx * 2.4 + 11, fz * 2.4 + 11, seed + 67, 3);
    let feature: Feature = '';
    if (terrain === 'grass' || terrain === 'plains') {
      if (temp > 0.8 && moist > 0.5 && fn > 0.42) feature = 'jungle';
      else if (fn > 0.56) feature = 'forest';
      else if (terrain === 'grass' && t.elev === 0 && rand() < 0.05) feature = 'marsh';
    } else if (terrain === 'tundra' && fn > 0.6) feature = 'forest';
    t.feature = feature;
  }

  // --- 沿岸
  const isLand = (i: number) => tiles[i].terrain !== 'ocean' && tiles[i].terrain !== 'coast';
  for (let i = 0; i < n; i++) {
    if (isLand(i)) continue;
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      if (j >= 0 && isLand(j)) { tiles[i].terrain = 'coast'; break; }
    }
  }
  const extra: number[] = [];
  for (let i = 0; i < n; i++) {
    if (tiles[i].terrain !== 'ocean' || rand() > 0.45) continue;
    for (let d = 0; d < 6; d++) {
      const j = nb[i * 6 + d];
      if (j >= 0 && tiles[j].terrain === 'coast') { extra.push(i); break; }
    }
  }
  for (const i of extra) tiles[i].terrain = 'coast';

  // --- 川：丘陵や山のふもとの頂点から、標高の低い頂点へ辺づたいに海まで流す
  {
    const VC = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
    const tileAt = (a: number, b: number): number => {
      const t = a + 2 * b;
      if (((t % 3) + 3) % 3 !== 0) return -1;
      const r = t / 3;
      if (r < 0 || r >= h) return -1;
      const c = (a - (r & 1)) / 2;
      return c < 0 || c >= w ? -1 : r * w + c;
    };
    const ks = (a: number, b: number) => ((((a + 2 * b) % 3) + 3) % 3 === 1 ? [0, 2, 4] : [1, 3, 5]);
    const vTiles = (a: number, b: number) => ks(a, b).map((k) => tileAt(a - VC[k][0], b - VC[k][1]));
    const vNbrs = (a: number, b: number) => ks(a, b).map((k) => [a + VC[k][0], b + VC[k][1]]);
    const water = (i: number) => tiles[i].terrain === 'ocean' || tiles[i].terrain === 'coast';
    const vElev = (a: number, b: number) => {
      let e = 0;
      for (const i of vTiles(a, b)) e += i < 0 ? sea : val[i] + (tiles[i].elev === 2 ? 0.05 : tiles[i].elev === 1 ? 0.02 : 0);
      return e / 3;
    };
    const key = (a: number, b: number) => a + ',' + b;
    const used = new Set<string>();
    const sources = land.filter((i) => tiles[i].elev >= 1 && tilesInRange(w, h, i, 2).every((j) => !water(j)));
    const want = Math.round(land.length / 38);
    let made = 0;
    for (let attempt = 0; attempt < want * 8 && made < want && sources.length; attempt++) {
      const src = sources[Math.floor(rand() * sources.length)];
      const r0 = (src / w) | 0, c0 = src % w;
      const a0 = 2 * c0 + (r0 & 1), b0 = (3 * r0 - a0) / 2;
      const k0 = Math.floor(rand() * 6);
      let cur = [a0 + VC[k0][0], b0 + VC[k0][1]];
      const path = [cur];
      const seen = new Set<string>([key(cur[0], cur[1])]);
      let ok = false;
      for (let step = 0; step < 44; step++) {
        const ts = vTiles(cur[0], cur[1]);
        if (ts.some((i) => i < 0)) break;
        if (ts.some(water) || (step > 0 && used.has(key(cur[0], cur[1])))) { ok = true; break; }
        let best: number[] | null = null, be = 1e9;
        for (const nx of vNbrs(cur[0], cur[1])) {
          if (seen.has(key(nx[0], nx[1]))) continue;
          const e = vElev(nx[0], nx[1]) + rand() * 0.012;
          if (e < be) { be = e; best = nx; }
        }
        if (!best) break;
        cur = best;
        seen.add(key(cur[0], cur[1]));
        path.push(cur);
      }
      if (!ok || path.length < 4) continue;
      for (let k = 0; k + 1 < path.length; k++) {
        const ta = vTiles(path[k][0], path[k][1]), tb = vTiles(path[k + 1][0], path[k + 1][1]);
        const shared = ta.filter((i) => i >= 0 && tb.includes(i));
        if (shared.length !== 2) continue;
        for (let d = 0; d < 6; d++) {
          if (nb[shared[0] * 6 + d] === shared[1]) { tiles[shared[0]].river |= 1 << d; tiles[shared[1]].river |= 1 << ((d + 3) % 6); }
        }
      }
      for (const v of path) used.add(key(v[0], v[1]));
      made++;
    }
  }

  // --- 資源
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];
  for (let i = 0; i < n; i++) {
    const t = tiles[i];
    if (t.terrain === 'coast') { if (rand() < 0.07) t.resource = 'fish'; continue; }
    if (t.terrain === 'ocean' || t.elev === 2 || rand() > 0.17) continue;
    let opts: string[] = [];
    if (t.feature === 'forest') opts = rand() < 0.4 ? ['silk'] : [];
    else if (t.feature === 'jungle') opts = ['spices', 'spices', 'gems'];
    else if (t.feature === 'marsh') opts = [];
    else if (t.elev === 1) opts = t.terrain === 'snow' ? ['iron'] : ['iron', 'iron', 'stone', 'stone', 'gems'];
    else if (t.terrain === 'grass') opts = ['wheat', 'cattle', 'cattle', 'horses', 'wine'];
    else if (t.terrain === 'plains') opts = ['wheat', 'wheat', 'horses', 'stone', 'wine'];
    else if (t.terrain === 'desert' || t.terrain === 'tundra') opts = rand() < 0.5 ? ['stone'] : [];
    if (opts.length) t.resource = pick(opts);
  }

  // --- 陸塊のラベリング
  const mass = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  for (const s0 of land) {
    if (mass[s0] >= 0 || tiles[s0].elev === 2) continue;
    const id = sizes.length;
    let count = 0;
    const stack = [s0];
    mass[s0] = id;
    while (stack.length) {
      const i = stack.pop()!;
      count++;
      for (let d = 0; d < 6; d++) {
        const j = nb[i * 6 + d];
        if (j >= 0 && mass[j] < 0 && isLand(j) && tiles[j].elev !== 2) { mass[j] = id; stack.push(j); }
      }
    }
    sizes.push(count);
  }
  const main = sizes.indexOf(Math.max(...sizes));

  // --- 初期位置：最大の陸塊で互いに離れた肥沃な場所を選ぶ
  const fert = (i: number) => {
    let f = 0;
    for (const j of tilesInRange(w, h, i, 2)) {
      const t = tiles[j];
      if (t.elev === 2) continue;
      if (t.terrain === 'grass') f += 2;
      else if (t.terrain === 'plains') f += 1.8;
      else if (t.terrain === 'coast') f += 1;
      else if (t.terrain === 'tundra') f += 0.5;
      else if (t.terrain === 'desert' || t.terrain === 'snow') f -= 1;
      if (t.elev === 1) f += 0.5;
      if (t.resource) f += 1;
      if (t.river) f += 0.6;
    }
    return f;
  };
  const candAll = land.filter((i) => {
    const t = tiles[i], r = (i / w) | 0, c = i % w;
    return t.elev === 0 && (t.terrain === 'grass' || t.terrain === 'plains') && r >= 3 && r < h - 3 && c >= 2 && c < w - 2;
  });
  let cand = candAll.filter((i) => mass[i] === main);
  if (cand.length < nPlayers * 6) cand = candAll.filter((i) => sizes[mass[i]] >= 25);
  if (cand.length < nPlayers) cand = candAll.length >= nPlayers ? candAll : land.filter((i) => tiles[i].elev !== 2);
  const fv = new Map<number, number>();
  for (const i of cand) fv.set(i, fert(i));
  const starts: number[] = [];
  const top = [...cand].sort((a, b) => fv.get(b)! - fv.get(a)!);
  starts.push(top[Math.floor(rand() * Math.min(10, top.length))]);
  while (starts.length < nPlayers) {
    let best = -1, bs = -1e9;
    for (const i of cand) {
      if (starts.includes(i)) continue;
      let md = 1e9;
      for (const s0 of starts) md = Math.min(md, hexDist(w, i, s0));
      const score = Math.min(md, 14) * 3 + fv.get(i)! * 1.6 + rand() * 2;
      if (score > bs) { bs = score; best = i; }
    }
    if (best < 0) break;
    starts.push(best);
  }
  for (const s0 of starts) {
    tiles[s0].feature = '';
    tiles[s0].resource = '';
  }
  // 順番による有利不利を消す
  for (let i = starts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [starts[i], starts[j]] = [starts[j], starts[i]];
  }
  return { tiles, starts };
}
