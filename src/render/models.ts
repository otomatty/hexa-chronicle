// ユニットと都市のプロシージャルモデル。外部アセットを使わず、プリミティブの組み合わせで作る。
import * as THREE from 'three';
import { ball, box, cone, cyl, group, hash, merge, ring } from './geo';
import type { Field } from './terrain';

type Geo = THREE.BufferGeometry;
const SKIN = 0xe0b48c, WOOD = 0x6b4a2c, DARK = 0x2a2622, STEEL = 0xb8bcc4, IRON = 0x55585e, LEATHER = 0x7a5a36;

interface Fig { tunic: number; legs?: number; hat?: 'helmet' | 'cap' | 'tricorn' | 'hood' | 'feather' | 'steel'; hatColor?: number; weapon?: string; shield?: number; scale?: number }

/** 人型フィギュア（+z 向き） */
function figure(f: Fig): Geo[] {
  const p: Geo[] = [
    box(0.05, 0.15, 0.06, f.legs ?? DARK, { x: -0.035, y: 0.075 }),
    box(0.05, 0.15, 0.06, f.legs ?? DARK, { x: 0.035, y: 0.075 }),
    box(0.15, 0.17, 0.09, f.tunic, { y: 0.235 }),
    box(0.04, 0.14, 0.05, f.tunic, { x: -0.095, y: 0.24 }),
    box(0.04, 0.14, 0.05, f.tunic, { x: 0.095, y: 0.24 }),
    ball(0.058, SKIN, { y: 0.375 }),
  ];
  const hc = f.hatColor ?? STEEL;
  if (f.hat === 'helmet' || f.hat === 'steel') {
    p.push(ball(0.064, hc, { y: 0.392, sy: 0.75 }));
    if (f.hat === 'steel') p.push(cyl(0.085, 0.085, 0.012, 8, hc, { y: 0.385 }));
  } else if (f.hat === 'cap') p.push(cyl(0.05, 0.06, 0.04, 6, hc, { y: 0.425 }));
  else if (f.hat === 'tricorn') { p.push(cyl(0.095, 0.095, 0.014, 3, hc, { y: 0.42 })); p.push(cyl(0.045, 0.05, 0.04, 6, hc, { y: 0.44 })); }
  else if (f.hat === 'hood') p.push(cone(0.07, 0.1, 6, hc, { y: 0.44 }));
  else if (f.hat === 'feather') { p.push(cyl(0.06, 0.06, 0.02, 8, hc, { y: 0.42 })); p.push(cone(0.02, 0.12, 4, 0xd9432b, { y: 0.49, z: -0.03, rx: -0.3 })); }
  switch (f.weapon) {
    case 'club': p.push(cyl(0.028, 0.014, 0.24, 5, WOOD, { x: 0.12, y: 0.32, rx: 0.5 })); break;
    case 'axe': p.push(cyl(0.012, 0.012, 0.26, 4, WOOD, { x: 0.12, y: 0.32, rx: 0.4 })); p.push(box(0.02, 0.07, 0.08, STEEL, { x: 0.12, y: 0.43, z: 0.07 })); break;
    case 'sword': p.push(box(0.018, 0.24, 0.03, STEEL, { x: 0.125, y: 0.36, rx: 0.5 })); p.push(box(0.07, 0.016, 0.02, 0xc9a23a, { x: 0.125, y: 0.27, z: -0.05 })); break;
    case 'spear': p.push(cyl(0.01, 0.01, 0.58, 4, WOOD, { x: 0.125, y: 0.33 })); p.push(cone(0.022, 0.07, 4, STEEL, { x: 0.125, y: 0.655 })); break;
    case 'pike': p.push(cyl(0.01, 0.01, 0.78, 4, WOOD, { x: 0.125, y: 0.42, rx: 0.12 })); p.push(cone(0.022, 0.08, 4, STEEL, { x: 0.125, y: 0.85, z: 0.05 })); break;
    case 'bow': {
      const g = new THREE.TorusGeometry(0.13, 0.01, 4, 8, Math.PI);
      p.push(group([paintGeo(g, WOOD)], { x: -0.13, y: 0.27, z: 0.05, rz: -Math.PI / 2, ry: Math.PI / 2 })[0]);
      p.push(box(0.025, 0.14, 0.04, LEATHER, { y: 0.27, z: -0.07 }));
      break;
    }
    case 'crossbow': p.push(box(0.03, 0.03, 0.24, WOOD, { x: 0.1, y: 0.25, z: 0.1 })); p.push(box(0.22, 0.02, 0.025, IRON, { x: 0.1, y: 0.255, z: 0.2 })); break;
    case 'musket': p.push(box(0.022, 0.03, 0.4, 0x4a3520, { x: 0.11, y: 0.27, z: 0.08, rx: -0.5 })); p.push(box(0.012, 0.012, 0.1, STEEL, { x: 0.11, y: 0.4, z: 0.3, rx: -0.5 })); break;
    case 'rifle': p.push(box(0.02, 0.03, 0.36, DARK, { x: 0.11, y: 0.26, z: 0.1, rx: -0.2 })); break;
    case 'staff': p.push(cyl(0.012, 0.012, 0.46, 4, WOOD, { x: 0.125, y: 0.24 })); break;
    case 'hammer': p.push(cyl(0.012, 0.012, 0.22, 4, WOOD, { x: 0.125, y: 0.3, rx: 0.6 })); p.push(box(0.05, 0.05, 0.09, IRON, { x: 0.125, y: 0.4, z: 0.07 })); break;
    case 'saber': p.push(box(0.014, 0.26, 0.026, STEEL, { x: 0.13, y: 0.42, rx: 0.9 })); break;
    case 'lance': p.push(cyl(0.012, 0.012, 0.7, 4, WOOD, { x: 0.13, y: 0.34, z: 0.2, rx: 1.15 })); p.push(cone(0.022, 0.07, 4, STEEL, { x: 0.13, y: 0.49, z: 0.55, rx: 1.15 })); break;
  }
  if (f.shield !== undefined) {
    p.push(cyl(0.085, 0.085, 0.02, 8, f.shield, { x: -0.115, y: 0.25, z: 0.045, rx: Math.PI / 2 }));
    p.push(cyl(0.025, 0.025, 0.03, 6, STEEL, { x: -0.115, y: 0.25, z: 0.05, rx: Math.PI / 2 }));
  }
  if (f.scale) group(p, { sx: f.scale, sy: f.scale, sz: f.scale });
  return p;
}

function paintGeo(g: Geo, color: number): Geo {
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

function squad(f: Fig, n = 3): Geo[] {
  const spots = n === 3 ? [[-0.2, 0.1], [0.2, 0.1], [0, -0.17]] : n === 2 ? [[-0.15, 0], [0.15, 0]] : [[0, 0]];
  const out: Geo[] = [];
  for (const [x, z] of spots) out.push(...group(figure(f), { x, z }));
  return out;
}

function horse(coat: number, armor?: number): Geo[] {
  const p = [
    box(0.13, 0.13, 0.34, coat, { y: 0.27 }),
    box(0.07, 0.17, 0.09, coat, { y: 0.4, z: 0.19, rx: 0.5 }),
    box(0.065, 0.075, 0.15, coat, { y: 0.48, z: 0.29, rx: 0.3 }),
    box(0.035, 0.2, 0.04, coat, { x: -0.045, y: 0.1, z: 0.13 }), box(0.035, 0.2, 0.04, coat, { x: 0.045, y: 0.1, z: 0.13 }),
    box(0.035, 0.2, 0.04, coat, { x: -0.045, y: 0.1, z: -0.13 }), box(0.035, 0.2, 0.04, coat, { x: 0.045, y: 0.1, z: -0.13 }),
    box(0.025, 0.14, 0.03, DARK, { y: 0.25, z: -0.2, rx: -0.5 }),
  ];
  if (armor !== undefined) p.push(box(0.145, 0.09, 0.3, armor, { y: 0.28 }));
  return p;
}

function rider(f: Fig, coat: number, armor?: number): Geo[] {
  const fig = figure({ ...f, legs: f.tunic });
  group(fig, { y: 0.2, sx: 0.9, sy: 0.9, sz: 0.9 });
  return [...horse(coat, armor), ...fig];
}

function wheel(x: number, z: number, r = 0.08): Geo {
  return cyl(r, r, 0.03, 10, WOOD, { x, y: r, z, rz: Math.PI / 2 });
}

function ship(c1: number, c2: number, big: boolean): Geo[] {
  const L = big ? 0.78 : 0.62, W = big ? 0.24 : 0.19;
  const p = [
    box(W, 0.1, L * 0.62, 0x6b4a2c, { y: 0.06 }),
    cone(W * 0.58, L * 0.26, 4, 0x6b4a2c, { y: 0.06, z: L * 0.43, rx: Math.PI / 2, ry: Math.PI / 4, sz: 0.6 }),
    cone(W * 0.58, L * 0.18, 4, 0x5b3e24, { y: 0.07, z: -L * 0.39, rx: -Math.PI / 2, ry: Math.PI / 4, sz: 0.6 }),
    box(W * 0.9, 0.02, L * 0.6, 0x8b6a42, { y: 0.115 }),
    cyl(0.014, 0.018, 0.5, 5, 0x4a3520, { y: 0.36, z: 0.03 }),
    box(0.3, 0.26, 0.016, c2, { y: 0.42, z: 0.05 }),
    box(0.3, 0.06, 0.02, c1, { y: 0.42, z: 0.052 }),
    box(0.09, 0.05, 0.012, c1, { x: 0.045, y: 0.63, z: 0.03 }),
  ];
  if (big) {
    p.push(cyl(0.012, 0.016, 0.4, 5, 0x4a3520, { y: 0.31, z: -0.2 }));
    p.push(box(0.22, 0.2, 0.016, c2, { y: 0.36, z: -0.18 }));
    p.push(box(W * 0.8, 0.07, 0.14, 0x7a5a36, { y: 0.15, z: -L * 0.28 }));
  } else {
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) p.push(box(0.2, 0.012, 0.02, 0x8b6a42, { x: sx * 0.17, y: 0.07, z: (k - 1) * 0.12, rz: sx * 0.35 }));
  }
  return p;
}

const cache = new Map<string, Geo>();

/** model: ユニットの見た目種別, c1/c2: 文明の色 */
export function unitGeometry(model: string, c1: number, c2: number): Geo {
  const key = `${model}:${c1}:${c2}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let p: Geo[];
  switch (model) {
    case 'warrior': p = squad({ tunic: c1, legs: LEATHER, weapon: 'club', shield: c2 }); break;
    case 'swordsman': p = squad({ tunic: c1, hat: 'helmet', weapon: 'sword', shield: c2 }); break;
    case 'spear': p = squad({ tunic: c1, hat: 'cap', hatColor: c2, weapon: 'spear', shield: c2 }); break;
    case 'pike': p = squad({ tunic: c1, hat: 'steel', weapon: 'pike' }); break;
    case 'archer': p = squad({ tunic: c1, hat: 'hood', hatColor: 0x3f5c33, weapon: 'bow' }); break;
    case 'crossbow': p = squad({ tunic: c1, hat: 'steel', weapon: 'crossbow' }); break;
    case 'musket': p = squad({ tunic: c1, legs: 0xe8e2d4, hat: 'tricorn', hatColor: DARK, weapon: 'musket' }); break;
    case 'infantry': p = squad({ tunic: 0x5c6b3f, legs: 0x4a5632, hat: 'steel', hatColor: 0x4a5632, weapon: 'rifle' }); p.push(...group([box(0.5, 0.03, 0.04, c1)], { y: 0.01, z: -0.34 })); break;
    case 'scout': p = [...group(figure({ tunic: c1, hat: 'feather', hatColor: 0x3f5c33, weapon: 'staff' }), { x: -0.08 }),
      box(0.07, 0.07, 0.16, 0x8a6a45, { x: 0.16, y: 0.09, z: 0.02 }), box(0.05, 0.05, 0.07, 0x8a6a45, { x: 0.16, y: 0.14, z: 0.13 }),
      box(0.02, 0.07, 0.02, 0x8a6a45, { x: 0.14, y: 0.035, z: 0.08 }), box(0.02, 0.07, 0.02, 0x8a6a45, { x: 0.18, y: 0.035, z: -0.04 })]; break;
    case 'settler': p = [
      box(0.24, 0.07, 0.4, WOOD, { y: 0.17, z: -0.1 }), wheel(-0.14, 0.03), wheel(0.14, 0.03), wheel(-0.14, -0.23), wheel(0.14, -0.23),
      cyl(0.14, 0.14, 0.38, 8, 0xf1ead8, { y: 0.26, z: -0.1, rx: Math.PI / 2, sy: 1 }),
      box(0.26, 0.03, 0.05, c1, { y: 0.4, z: -0.1 }),
      ...group(figure({ tunic: c1, hat: 'cap', hatColor: c2, weapon: 'staff', scale: 0.9 }), { x: -0.02, z: 0.28 }),
    ]; break;
    case 'builder': p = [
      ...group(figure({ tunic: c1, hat: 'cap', hatColor: 0xd9a441, weapon: 'hammer' }), { x: -0.1 }),
      box(0.16, 0.12, 0.16, 0x9a7446, { x: 0.17, y: 0.06, z: 0.02 }), box(0.17, 0.02, 0.17, c2, { x: 0.17, y: 0.13, z: 0.02 }),
    ]; break;
    case 'horse': p = [...group(rider({ tunic: c1, hat: 'cap', hatColor: c2, weapon: 'spear' }, 0x7a5232), { x: -0.14, z: 0.02 }), ...group(rider({ tunic: c1, hat: 'cap', hatColor: c2, weapon: 'spear' }, 0x3a2a1c), { x: 0.14, z: -0.06 })]; break;
    case 'knight': p = [...group(rider({ tunic: STEEL, hat: 'helmet', weapon: 'lance', shield: c1 }, 0x4a3a2a, c1), { x: -0.14, z: 0.02 }), ...group(rider({ tunic: STEEL, hat: 'helmet', weapon: 'lance', shield: c1 }, 0xd8d2c4, c1), { x: 0.14, z: -0.06 })]; break;
    case 'cavalry': p = [...group(rider({ tunic: c1, hat: 'tricorn', hatColor: DARK, weapon: 'saber' }, 0x5a3a22), { x: -0.14, z: 0.02 }), ...group(rider({ tunic: c1, hat: 'tricorn', hatColor: DARK, weapon: 'saber' }, 0x2a2018), { x: 0.14, z: -0.06 })]; break;
    case 'catapult': p = [
      box(0.2, 0.05, 0.34, WOOD, { y: 0.11 }), wheel(-0.13, 0.11), wheel(0.13, 0.11), wheel(-0.13, -0.11), wheel(0.13, -0.11),
      box(0.03, 0.2, 0.03, WOOD, { x: -0.07, y: 0.23, z: 0.04 }), box(0.03, 0.2, 0.03, WOOD, { x: 0.07, y: 0.23, z: 0.04 }),
      box(0.03, 0.03, 0.42, 0x8b6a42, { y: 0.31, z: -0.04, rx: 0.55 }), box(0.08, 0.05, 0.08, IRON, { y: 0.42, z: -0.22 }),
      ...group(figure({ tunic: c1, hat: 'cap', hatColor: c2, scale: 0.9 }), { x: 0.27, z: -0.05 }),
    ]; break;
    case 'cannon': p = [
      box(0.1, 0.05, 0.26, WOOD, { y: 0.13, z: -0.05 }), wheel(-0.1, 0.02, 0.11), wheel(0.1, 0.02, 0.11),
      cyl(0.035, 0.05, 0.36, 8, 0x3a3a3e, { y: 0.2, z: 0.08, rx: Math.PI / 2 - 0.15 }),
      box(0.12, 0.02, 0.03, c1, { y: 0.24, z: -0.02 }),
      ...group(figure({ tunic: c1, legs: 0xe8e2d4, hat: 'tricorn', hatColor: DARK, scale: 0.9 }), { x: 0.26, z: -0.08 }),
    ]; break;
    case 'artillery': p = [
      box(0.14, 0.06, 0.34, 0x4a5632, { y: 0.14, z: -0.08 }), wheel(-0.13, 0.02, 0.12), wheel(0.13, 0.02, 0.12),
      cyl(0.03, 0.045, 0.56, 8, 0x3f4a2c, { y: 0.27, z: 0.12, rx: Math.PI / 2 - 0.45 }),
      box(0.3, 0.2, 0.02, 0x5c6b3f, { y: 0.24, z: 0.02, rx: -0.2 }), box(0.3, 0.03, 0.025, c1, { y: 0.33, z: 0.0 }),
      ...group(figure({ tunic: 0x5c6b3f, hat: 'steel', hatColor: 0x4a5632, scale: 0.9 }), { x: 0.28, z: -0.12 }),
    ]; break;
    case 'tank': p = [
      box(0.34, 0.11, 0.52, 0x5c6b3f, { y: 0.14 }), box(0.08, 0.13, 0.56, DARK, { x: -0.19, y: 0.085 }), box(0.08, 0.13, 0.56, DARK, { x: 0.19, y: 0.085 }),
      cyl(0.13, 0.15, 0.1, 8, 0x4f5c36, { y: 0.25, z: -0.03 }), cyl(0.025, 0.03, 0.4, 6, 0x3a4228, { y: 0.26, z: 0.26, rx: Math.PI / 2 }),
      box(0.34, 0.03, 0.06, c1, { y: 0.2, z: -0.2 }), box(0.1, 0.012, 0.1, c1, { y: 0.305, z: -0.03 }),
    ]; break;
    case 'galley': p = ship(c1, c2, false); break;
    case 'caravel': p = ship(c1, 0xf1ead8, true); break;
    case 'transport': p = [box(0.26, 0.07, 0.44, 0x7a5a36, { y: 0.05 }), cyl(0.012, 0.014, 0.34, 5, 0x4a3520, { y: 0.24 }), box(0.22, 0.2, 0.014, c1, { y: 0.28, z: 0.02 }), box(0.22, 0.04, 0.016, c2, { y: 0.28, z: 0.022 })]; break;
    case 'ironclad': p = [
      box(0.24, 0.1, 0.62, 0x5a5f66, { y: 0.06 }), cone(0.14, 0.2, 4, 0x5a5f66, { y: 0.06, z: 0.4, rx: Math.PI / 2, ry: Math.PI / 4, sz: 0.6 }),
      box(0.18, 0.08, 0.26, 0x70767e, { y: 0.15 }), cyl(0.04, 0.045, 0.2, 8, DARK, { y: 0.29, z: -0.04 }),
      cyl(0.06, 0.06, 0.05, 8, 0x4a4e55, { y: 0.14, z: 0.24 }), cyl(0.015, 0.015, 0.2, 5, DARK, { y: 0.15, z: 0.34, rx: Math.PI / 2 }),
      box(0.25, 0.03, 0.5, c1, { y: 0.1 }), box(0.1, 0.06, 0.012, c1, { x: 0.05, y: 0.4, z: -0.04 }),
    ]; break;
    default: p = squad({ tunic: c1 });
  }
  p.push(ring(0.5, 0.545, c1, { y: 0.015 }));
  const g = merge(p);
  cache.set(key, g);
  return g;
}

// ---------------------------------------------------------------- 都市
function house(w: number, h: number, d: number, wall: number, roof: number, x: number, y: number, z: number, ry: number): Geo[] {
  return group([
    box(w, h, d, wall, { y: h / 2 }),
    cone(Math.max(w, d) * 0.78, h * 0.7, 4, roof, { y: h + h * 0.35, ry: Math.PI / 4, sx: w >= d ? 1 : w / d, sz: d >= w ? 1 : d / w }),
  ], { x, y, z, ry });
}

export interface CityLook { pop: number; era: number; walls: boolean; capital: boolean; c1: number; c2: number; seed: number }

export function cityGeometry(look: CityLook, field: Field, cx: number, cz: number): Geo {
  const p: Geo[] = [];
  const base = field.ground(cx, cz);
  const gy = (x: number, z: number) => field.ground(cx + x, cz + z) - base;
  const { era, c1, c2, seed } = look;
  const wallCol = era >= 4 ? 0xb9a089 : era >= 2 ? 0xd9cfb8 : 0xcdb891;
  const roofs = [c1, 0x9a4a32, 0x7a5a3a, c2];
  // 中心の建物
  if (era >= 5) {
    p.push(box(0.22, 0.6, 0.22, 0x8fa3b5, { y: 0.3 }), box(0.18, 0.2, 0.18, 0xa9bccd, { y: 0.7 }), cyl(0.01, 0.01, 0.2, 4, DARK, { y: 0.9 }));
    p.push(box(0.16, 0.42, 0.16, 0x9aa9b8, { x: 0.24, y: 0.21, z: 0.1 }), box(0.14, 0.34, 0.2, 0x7f93a6, { x: -0.22, y: 0.17, z: -0.14 }));
  } else if (look.capital || look.pop >= 6) {
    p.push(box(0.3, 0.26, 0.26, wallCol, { y: 0.13 }), cone(0.24, 0.16, 4, c1, { y: 0.34, ry: Math.PI / 4 }));
    p.push(cyl(0.06, 0.07, 0.42, 6, wallCol, { x: 0.17, y: 0.21, z: 0.14 }), cone(0.085, 0.14, 6, c1, { x: 0.17, y: 0.49, z: 0.14 }));
    p.push(cyl(0.06, 0.07, 0.36, 6, wallCol, { x: -0.17, y: 0.18, z: -0.12 }), cone(0.085, 0.12, 6, c1, { x: -0.17, y: 0.42, z: -0.12 }));
  } else {
    p.push(...house(0.2, 0.16, 0.16, wallCol, c1, 0, 0, 0, 0.3));
  }
  p.push(cyl(0.008, 0.008, 0.34, 4, DARK, { y: era >= 5 ? 1.0 : 0.6 }), box(0.14, 0.08, 0.01, c1, { x: 0.07, y: era >= 5 ? 1.12 : 0.72 }), box(0.14, 0.02, 0.012, c2, { x: 0.07, y: era >= 5 ? 1.12 : 0.72 }));
  // 周囲の家
  const count = Math.min(30, 4 + look.pop * 2);
  for (let k = 0; k < count; k++) {
    const ringIdx = k < 7 ? 0 : k < 18 ? 1 : 2;
    const per = ringIdx === 0 ? 7 : ringIdx === 1 ? 11 : 12;
    const kk = ringIdx === 0 ? k : ringIdx === 1 ? k - 7 : k - 18;
    const a = (kk / per) * Math.PI * 2 + hash(seed, k) * 0.5 + ringIdx * 0.4;
    const r = 0.3 + ringIdx * 0.17 + hash(seed, k + 50) * 0.06;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const tall = era >= 4 && hash(seed, k + 90) < 0.35;
    const w = 0.09 + hash(seed, k + 20) * 0.05, d = 0.08 + hash(seed, k + 30) * 0.05;
    const h = tall ? 0.2 + hash(seed, k + 60) * 0.14 : 0.07 + hash(seed, k + 60) * 0.05;
    if (tall && era >= 5) p.push(box(w, h * 1.4, d, hash(seed, k) < 0.5 ? 0x9aa9b8 : 0xb5aa98, { x, y: gy(x, z) + h * 0.7, z, ry: a }));
    else if (tall) { p.push(box(w, h, d, 0x9a6a55, { x, y: gy(x, z) + h / 2, z, ry: a })); p.push(box(0.025, 0.1, 0.025, 0x5a4a44, { x: x + 0.02, y: gy(x, z) + h + 0.05, z })); }
    else p.push(...house(w, h, d, wallCol, roofs[Math.floor(hash(seed, k + 70) * roofs.length)], x, gy(x, z), z, a));
  }
  if (look.walls) {
    const R = 0.74, stone = era >= 3 ? 0x9a958c : 0xb0a58c;
    for (let k = 0; k < 6; k++) {
      const a0 = (Math.PI / 3) * k + Math.PI / 6, a1 = a0 + Math.PI / 3;
      const x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const y = Math.min(gy(x0, z0), gy(x1, z1), gy(mx, mz));
      if (k !== 1) p.push(box(R * 0.98, 0.14, 0.05, stone, { x: mx, y: y + 0.07, z: mz, ry: -Math.atan2(z1 - z0, x1 - x0) }));
      p.push(cyl(0.055, 0.065, 0.22, 6, stone, { x: x0, y: gy(x0, z0) + 0.11, z: z0 }), cone(0.07, 0.08, 6, c1, { x: x0, y: gy(x0, z0) + 0.26, z: z0 }));
    }
  }
  return merge(p);
}
