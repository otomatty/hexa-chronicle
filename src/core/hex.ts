// 六角グリッド（pointy-top / odd-r オフセット座標）の計算と、決定論的な乱数・ノイズ。

export const SQ3 = Math.sqrt(3);
/** 六角形の中心から頂点までの距離（ワールド単位） */
export const HEX = 1;

const DIRS_EVEN = [[1, 0], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1]];
const DIRS_ODD = [[1, 0], [1, 1], [0, 1], [-1, 0], [0, -1], [1, -1]];

const nbCache = new Map<string, Int32Array>();
/** 各タイルの隣接6方向のインデックス表（範囲外は -1） */
export function neighborTable(w: number, h: number): Int32Array {
  const key = w + 'x' + h;
  let t = nbCache.get(key);
  if (t) return t;
  t = new Int32Array(w * h * 6);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const dirs = r & 1 ? DIRS_ODD : DIRS_EVEN;
      for (let d = 0; d < 6; d++) {
        const nc = c + dirs[d][0];
        const nr = r + dirs[d][1];
        t[(r * w + c) * 6 + d] = nc < 0 || nr < 0 || nc >= w || nr >= h ? -1 : nr * w + nc;
      }
    }
  }
  nbCache.set(key, t);
  return t;
}

export function hexDist(w: number, a: number, b: number): number {
  const ar = (a / w) | 0, ac = a % w;
  const br = (b / w) | 0, bc = b % w;
  const aq = ac - ((ar - (ar & 1)) >> 1);
  const bq = bc - ((br - (br & 1)) >> 1);
  const dq = aq - bq, dr = ar - br;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

/** 半径 radius 以内のタイル一覧（中心を含む） */
export function tilesInRange(w: number, h: number, center: number, radius: number): number[] {
  const out: number[] = [];
  const cr = (center / w) | 0, cc = center % w;
  for (let r = Math.max(0, cr - radius); r <= Math.min(h - 1, cr + radius); r++) {
    for (let c = Math.max(0, cc - radius - 1); c <= Math.min(w - 1, cc + radius + 1); c++) {
      const i = r * w + c;
      if (hexDist(w, center, i) <= radius) out.push(i);
    }
  }
  return out;
}

export function tileX(w: number, i: number): number {
  const r = (i / w) | 0;
  return SQ3 * HEX * ((i % w) + 0.5 * (r & 1));
}
export function tileZ(w: number, i: number): number {
  return 1.5 * HEX * ((i / w) | 0);
}

/** ワールド座標 → タイルインデックス（範囲外は -1） */
export function worldToTile(w: number, h: number, x: number, z: number): number {
  const q = ((SQ3 / 3) * x - z / 3) / HEX;
  const r = ((2 / 3) * z) / HEX;
  let rx = Math.round(q), rz = Math.round(r);
  const ry = Math.round(-q - r);
  const dx = Math.abs(rx - q), dy = Math.abs(ry + q + r), dz = Math.abs(rz - r);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy <= dz) rz = -rx - ry;
  const col = rx + ((rz - (rz & 1)) >> 1);
  if (col < 0 || rz < 0 || col >= w || rz >= h) return -1;
  return rz * w + col;
}

// ---------------------------------------------------------------- 乱数
/** mulberry32: 状態を数値1つで持てる決定論的乱数 */
export function nextRand(holder: { rng: number }): number {
  let t = (holder.rng = (holder.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 値ノイズ（0..1） */
export function noise2(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(x * f, y * f, seed + o * 101);
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
