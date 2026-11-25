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
  return g;
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

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const norm = parts.map((p) => {
    const g = p.index ? p.toNonIndexed() : p;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
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
