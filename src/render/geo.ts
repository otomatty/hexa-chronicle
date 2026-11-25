// 頂点カラー付きのプリミティブを組み合わせてモデルを作るための小さなヘルパー。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const tmp = new THREE.Color();

export function paint(g: THREE.BufferGeometry, color: THREE.ColorRepresentation): THREE.BufferGeometry {
  tmp.set(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export interface Xf { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number }
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
export function xf(g: THREE.BufferGeometry, t: Xf): THREE.BufferGeometry {
  e.set(t.rx ?? 0, t.ry ?? 0, t.rz ?? 0);
  q.setFromEuler(e);
  m4.compose(v.set(t.x ?? 0, t.y ?? 0, t.z ?? 0), q, sc.set(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1));
  g.applyMatrix4(m4);
  // 関節の位置も一緒に動かす
  if (g.attributes.aPivot) (g.attributes.aPivot as THREE.BufferAttribute).applyMatrix4(m4);
  return g;
}

/** パーツに「どの関節で動くか」を記録する。part: 0 胴体, 1/2 脚, 3 左腕, 4 右腕 */
export function tag(parts: THREE.BufferGeometry[], part: number, px: number, py: number, pz: number): THREE.BufferGeometry[] {
  for (const g of parts) {
    const n = g.attributes.position.count;
    const a = new Float32Array(n).fill(part), pv = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pv[i * 3] = px; pv[i * 3 + 1] = py; pv[i * 3 + 2] = pz; }
    g.setAttribute('aPart', new THREE.BufferAttribute(a, 1));
    g.setAttribute('aPivot', new THREE.BufferAttribute(pv, 3));
  }
  return parts;
}

export const box = (w: number, h: number, d: number, color: THREE.ColorRepresentation, t: Xf = {}) =>
  xf(paint(new THREE.BoxGeometry(w, h, d), color), t);
export const cyl = (rt: number, rb: number, h: number, seg: number, color: THREE.ColorRepresentation, t: Xf = {}) =>
  xf(paint(new THREE.CylinderGeometry(rt, rb, h, seg), color), t);
export const cone = (r: number, h: number, seg: number, color: THREE.ColorRepresentation, t: Xf = {}) =>
  xf(paint(new THREE.ConeGeometry(r, h, seg), color), t);
export const ball = (r: number, color: THREE.ColorRepresentation, t: Xf = {}, ws = 7, hs = 5) =>
  xf(paint(new THREE.SphereGeometry(r, ws, hs), color), t);
export const ring = (ri: number, ro: number, color: THREE.ColorRepresentation, t: Xf = {}) =>
  xf(paint(new THREE.RingGeometry(ri, ro, 28), color), { rx: -Math.PI / 2, ...t });

/** 複数パーツをまとめて移動・回転する */
export function group(parts: THREE.BufferGeometry[], t: Xf): THREE.BufferGeometry[] {
  for (const p of parts) xf(p, t);
  return parts;
}

export function merge(parts: THREE.BufferGeometry[], rig = false): THREE.BufferGeometry {
  const keep = rig ? ['position', 'normal', 'color', 'aPart', 'aPivot'] : ['position', 'normal', 'color'];
  const norm = parts.map((p) => {
    if (rig && !p.attributes.aPart) tag([p], 0, 0, 0, 0);
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (!keep.includes(k)) g.deleteAttribute(k);
    return g;
  });
  const out = mergeGeometries(norm, false)!;
  for (const p of parts) p.dispose();
  return out;
}

/** タイルごとに安定した擬似乱数 */
export function hash(i: number, k: number): number {
  let h = Math.imul(i + 1, 374761393) ^ Math.imul(k + 7, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** 面のはっきりした岩や樹冠向けの二十面体 */
export const ico = (r: number, color: THREE.ColorRepresentation, t: Xf = {}, detail = 0) =>
  xf(paint(new THREE.IcosahedronGeometry(r, detail), color), t);
