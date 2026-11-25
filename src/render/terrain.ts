// 地形メッシュ。タイルの属性を滑らかに補間した高さ場を作り、三角格子でメッシュ化する。
import * as THREE from 'three';
import { fbm, HEX, neighborTable, noise2, SQ3, tileX, tileZ, worldToTile } from '../core/hex';
import type { GameState, Tile } from '../core/types';
import { hash } from './geo';
import { patchMaterial, WATER_FRAG, WATER_VERT, type MapUniforms } from './shaders';

const C = (hex: number) => new THREE.Color(hex);
const COL = {
  grass: C(0x5d9b3a), plains: C(0xa9a54e), desert: C(0xdcc27e), tundra: C(0x8e957c), snow: C(0xe9eff3),
  coast: C(0xc9bf8f), ocean: C(0x1d3550), forest: C(0x3f7a30), jungle: C(0x2f7a34), marsh: C(0x4c6b3a),
  hill: C(0x8a8a52), rock: C(0x958c80), rockDark: C(0x756c62), sand: C(0xdccf9a), deep: C(0x0f2238),
};

function tileColor(t: Tile): THREE.Color {
  if (t.elev === 2) return COL.rock.clone();
  const c = COL[t.terrain].clone();
  if (t.feature === 'forest') c.lerp(t.terrain === 'tundra' ? C(0x4e6b4a) : COL.forest, 0.7);
  else if (t.feature === 'jungle') c.lerp(COL.jungle, 0.8);
  else if (t.feature === 'marsh') c.lerp(COL.marsh, 0.85);
  if (t.elev === 1 && t.terrain !== 'snow') c.lerp(COL.hill, t.terrain === 'desert' ? 0.15 : 0.3);
  return c;
}

/** ワールド座標から高さ・色を返す高さ場 */
export class Field {
  readonly w: number;
  readonly h: number;
  private nb: Int32Array;
  private cx: Float32Array;
  private cz: Float32Array;
  private base: Float32Array;
  private amp: Float32Array;
  private hill: Float32Array;
  private mtn: Float32Array;
  private water: Uint8Array;
  private col: Float32Array;
  private seed: number;
  // sample() の結果
  sh = 0; sr = 0; sg = 0; sb = 0; swat = 0; smt = 0;

  constructor(s: GameState) {
    const n = s.w * s.h;
    this.w = s.w; this.h = s.h; this.seed = s.seed;
    this.nb = neighborTable(s.w, s.h);
    this.cx = new Float32Array(n); this.cz = new Float32Array(n);
    this.base = new Float32Array(n); this.amp = new Float32Array(n);
    this.hill = new Float32Array(n); this.mtn = new Float32Array(n);
    this.water = new Uint8Array(n); this.col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const t = s.tiles[i];
      this.cx[i] = tileX(s.w, i); this.cz[i] = tileZ(s.w, i);
      let base = 0.14, amp = 0.035;
      if (t.terrain === 'ocean') { base = -0.5; amp = 0.05; this.water[i] = 1; }
      else if (t.terrain === 'coast') { base = -0.15; amp = 0.025; this.water[i] = 1; }
      else if (t.elev === 2) { base = 0.55; amp = 0.14; this.mtn[i] = 0.75 + hash(i, 3) * 0.55; }
      else if (t.elev === 1) { base = 0.33; amp = 0.1; this.hill[i] = 1; }
      else if (t.feature === 'marsh') { base = 0.07; amp = 0.015; }
      else if (t.terrain === 'desert') amp = 0.06;
      this.base[i] = base; this.amp[i] = amp;
      const c = tileColor(t);
      this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    }
  }

  /** 都市タイルは建物が沈まないよう起伏を抑える */
  flatten(i: number): void {
    this.amp[i] = 0.01;
    this.hill[i] *= 0.3;
  }

  sample(x: number, z: number): number {
    const i = worldToTile(this.w, this.h, x, z);
    if (i < 0) { this.sh = -0.5; this.sr = COL.ocean.r; this.sg = COL.ocean.g; this.sb = COL.ocean.b; this.swat = 1; this.smt = 0; return -0.5; }
    const { nb, cx, cz, base, amp, hill, mtn, water, col } = this;
    let sw = 0, h = 0, a = 0, hl = 0, peak = 0, wat = 0, swc = 0, r = 0, g = 0, b = 0;
    for (let k = -1; k < 6; k++) {
      const j = k < 0 ? i : nb[i * 6 + k];
      if (j < 0) continue;
      const dx = x - cx[j], dz = z - cz[j];
      const d2 = (dx * dx + dz * dz) / 3;
      if (d2 >= 1) continue;
      let w = 1 - d2;
      w *= w;
      sw += w; h += w * base[j]; a += w * amp[j]; hl += w * hill[j]; wat += w * water[j];
      if (mtn[j] > 0) {
        const pk = Math.max(0, 1 - Math.sqrt(dx * dx + dz * dz) / 1.05);
        peak += pk * Math.sqrt(pk) * mtn[j];
      }
      const wc = w * w;
      swc += wc; r += wc * col[j * 3]; g += wc * col[j * 3 + 1]; b += wc * col[j * 3 + 2];
    }
    h /= sw; a /= sw; hl /= sw; wat /= sw;
    h += (fbm(x * 1.7, z * 1.7, this.seed + 3, 3) - 0.5) * a * 2;
    if (hl > 0.01) h += hl * (fbm(x * 0.9 + 7, z * 0.9 + 7, this.seed + 5, 2) - 0.4) * 0.34;
    if (peak > 0) {
      const ridge = 1 - Math.abs(2 * noise2(x * 1.3, z * 1.3, this.seed + 9) - 1);
      h += peak * (0.7 + 0.5 * ridge);
    }
    this.sh = h; this.sr = r / swc; this.sg = g / swc; this.sb = b / swc; this.swat = wat; this.smt = peak;
    return h;
  }

  heightAt(x: number, z: number): number { return this.sample(x, z); }

  /** ユニットや建物を置く高さ（水面より下にはならない） */
  ground(x: number, z: number): number { return Math.max(0, this.sample(x, z)); }
  tileGround(i: number): number { return this.ground(this.cx[i], this.cz[i]); }
  tx(i: number): number { return this.cx[i]; }
  tz(i: number): number { return this.cz[i]; }
}

// 六角形の頂点（三角格子上の整数オフセット）
const CORNERS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

export function buildTerrain(s: GameState, field: Field, uniforms: MapUniforms, subdiv: number): THREE.Mesh {
  const N = subdiv;
  const n = s.w * s.h;
  const OFF = 4096, K = 16384;
  const vmap = new Map<number, number>();
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const meta: number[] = []; // 高さ以外の補助情報（山の重み, 水の重み）
  const ux = (SQ3 / 2) * HEX / N, uz = HEX / N;
  const seed = s.seed;

  const vid = (A: number, B: number): number => {
    const key = (A + OFF) * K + (B + OFF);
    let v = vmap.get(key);
    if (v !== undefined) return v;
    const x = A * ux, z = (A / 2 + B) * uz;
    const h = field.sample(x, z);
    v = pos.length / 3;
    pos.push(x, h, z);
    col.push(field.sr, field.sg, field.sb);
    meta.push(field.smt, field.swat);
    vmap.set(key, v);
    return v;
  };

  for (let i = 0; i < n; i++) {
    const row = (i / s.w) | 0, c = i % s.w;
    const a = 2 * c + (row & 1), b = (3 * row - a) / 2;
    const CA = a * N, CB = b * N;
    for (let k = 0; k < 6; k++) {
      const d1 = CORNERS[(k + 1) % 6], d0 = CORNERS[k];
      // 三角形 (中心, 頂点k+1, 頂点k) を N 分割
      for (let u = 0; u < N; u++) {
        for (let v = 0; v < N - u; v++) {
          const p = (uu: number, vv: number) => vid(CA + uu * d1[0] + vv * d0[0], CB + uu * d1[1] + vv * d0[1]);
          const v00 = p(u, v), v10 = p(u + 1, v), v01 = p(u, v + 1);
          idx.push(v00, v10, v01);
          if (u + v < N - 1) idx.push(v10, p(u + 1, v + 1), v01);
        }
      }
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const cc = new THREE.Color();
  const vc = pos.length / 3;
  for (let v = 0; v < vc; v++) {
    const x = pos[v * 3], h = pos[v * 3 + 1], z = pos[v * 3 + 2];
    const mt = meta[v * 2], wat = meta[v * 2 + 1];
    cc.setRGB(col[v * 3], col[v * 3 + 1], col[v * 3 + 2]);
    const nz = noise2(x * 2.6, z * 2.6, seed + 77);
    cc.multiplyScalar(0.88 + 0.24 * nz);
    if (h < 0) {
      cc.lerp(COL.deep, Math.min(1, -h / 0.45) * 0.85);
    } else {
      if (wat > 0.03 && h < 0.1) cc.lerp(COL.sand, Math.min(1, wat * 6) * (1 - h / 0.1));
      const slope = 1 - nrm.getY(v);
      if (h > 0.26) {
        const rk = Math.min(1, Math.max(0, (slope - 0.16) / 0.22));
        cc.lerp(nz > 0.5 ? COL.rock : COL.rockDark, rk * 0.9);
      }
      if (mt > 0.02) {
        cc.lerp(nz > 0.45 ? COL.rock : COL.rockDark, Math.min(1, mt * 3));
        const snowLine = 1.02 + nz * 0.22;
        if (h > snowLine) cc.lerp(COL.snow, Math.min(1, (h - snowLine) / 0.12) * (slope < 0.62 ? 1 : 0.5));
      }
    }
    col[v * 3] = cc.r; col[v * 3 + 1] = cc.g; col[v * 3 + 2] = cc.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 }), uniforms, true);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
}

export function buildWater(s: GameState, uniforms: MapUniforms, sun: THREE.Vector3): THREE.Mesh {
  const mw = s.w * SQ3 * HEX, mh = s.h * 1.5 * HEX;
  const geo = new THREE.PlaneGeometry(mw + 120, mh + 120, 1, 1);
  geo.rotateX(-Math.PI / 2);
  geo.translate(mw / 2, 0, mh / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uSun: { value: sun } },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
    transparent: true,
    depthWrite: false,
  });
  // uniforms はオブジェクト参照を共有する（スプレッドでも各 {value} は同一）
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 1;
  mesh.matrixAutoUpdate = false;
  return mesh;
}
