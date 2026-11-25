// ユニットと都市のプロシージャルモデル。外部アセットを使わず、プリミティブの組み合わせで作る。
import * as THREE from 'three';
import { ball, box, cone, cyl, group, hash, merge, ring, tag, xf } from './geo';
import { civicHall, factory, marvelParts, office, PAL, skyscraper, tenement, townhouse } from './builds';
import { hasPack, packGeo } from './pack';

type Geo = THREE.BufferGeometry;
const SKIN = 0xe0b48c, WOOD = 0x6b4a2c, DARK = 0x2a2622, STEEL = 0xb8bcc4, IRON = 0x55585e, LEATHER = 0x7a5a36;

interface Fig { noLegs?: boolean; tunic: number; legs?: number; hat?: 'helmet' | 'cap' | 'tricorn' | 'hood' | 'feather' | 'steel'; hatColor?: number; weapon?: string; shield?: number; scale?: number }

/** 人型フィギュア（+z 向き） */
function figure(f: Fig): Geo[] {
  const legs = f.legs ?? DARK;
  const legL = [cyl(0.03, 0.025, 0.15, 6, legs, { x: -0.037, y: 0.085 }), box(0.05, 0.028, 0.08, DARK, { x: -0.037, y: 0.014, z: 0.012 })];
  const legR = [cyl(0.03, 0.025, 0.15, 6, legs, { x: 0.037, y: 0.085 }), box(0.05, 0.028, 0.08, DARK, { x: 0.037, y: 0.014, z: 0.012 })];
  const armL = [cyl(0.024, 0.02, 0.15, 5, f.tunic, { x: -0.108, y: 0.27, rz: -0.2 }), ball(0.024, SKIN, { x: -0.124, y: 0.19 }, 5, 4)];
  const armR = [cyl(0.024, 0.02, 0.15, 5, f.tunic, { x: 0.108, y: 0.27, rz: 0.2 }), ball(0.024, SKIN, { x: 0.124, y: 0.19 }, 5, 4)];
  const p: Geo[] = [
    cyl(0.072, 0.096, 0.09, 7, f.tunic, { y: 0.175 }),
    cyl(0.088, 0.07, 0.14, 7, f.tunic, { y: 0.285 }),
    cyl(0.076, 0.076, 0.022, 7, LEATHER, { y: 0.212 }),
    ball(0.06, SKIN, { y: 0.4 }, 8, 6),
  ];
  const hc = f.hatColor ?? STEEL;
  if (f.hat === 'helmet' || f.hat === 'steel') {
    p.push(ball(0.066, hc, { y: 0.418, sy: 0.72 }, 8, 5));
    if (f.hat === 'steel') p.push(cyl(0.088, 0.088, 0.012, 8, hc, { y: 0.41 }));
  } else if (f.hat === 'cap') p.push(cyl(0.05, 0.062, 0.045, 7, hc, { y: 0.45 }));
  else if (f.hat === 'tricorn') { p.push(cyl(0.1, 0.1, 0.014, 3, hc, { y: 0.445 })); p.push(cyl(0.045, 0.052, 0.045, 6, hc, { y: 0.47 })); }
  else if (f.hat === 'hood') { p.push(cone(0.072, 0.11, 7, hc, { y: 0.47 })); p.push(cyl(0.09, 0.1, 0.05, 7, hc, { y: 0.335 })); }
  else if (f.hat === 'feather') { p.push(cyl(0.064, 0.064, 0.022, 8, hc, { y: 0.45 })); p.push(cone(0.02, 0.12, 4, 0xd9432b, { y: 0.52, z: -0.03, rx: -0.3 })); }
  switch (f.weapon) {
    case 'club': armR.push(cyl(0.028, 0.014, 0.24, 5, WOOD, { x: 0.12, y: 0.32, rx: 0.5 })); break;
    case 'axe': armR.push(cyl(0.012, 0.012, 0.26, 4, WOOD, { x: 0.12, y: 0.32, rx: 0.4 })); armR.push(box(0.02, 0.07, 0.08, STEEL, { x: 0.12, y: 0.43, z: 0.07 })); break;
    case 'sword': armR.push(box(0.018, 0.24, 0.03, STEEL, { x: 0.125, y: 0.36, rx: 0.5 })); armR.push(box(0.07, 0.016, 0.02, 0xc9a23a, { x: 0.125, y: 0.27, z: -0.05 })); break;
    case 'spear': armR.push(cyl(0.01, 0.01, 0.58, 4, WOOD, { x: 0.125, y: 0.33 })); armR.push(cone(0.022, 0.07, 4, STEEL, { x: 0.125, y: 0.655 })); break;
    case 'pike': armR.push(cyl(0.01, 0.01, 0.78, 4, WOOD, { x: 0.125, y: 0.42, rx: 0.12 })); armR.push(cone(0.022, 0.08, 4, STEEL, { x: 0.125, y: 0.85, z: 0.05 })); break;
    case 'bow': {
      const g = new THREE.TorusGeometry(0.13, 0.01, 4, 8, Math.PI);
      armL.push(group([paintGeo(g, WOOD)], { x: -0.13, y: 0.27, z: 0.05, rz: -Math.PI / 2, ry: Math.PI / 2 })[0]);
      p.push(box(0.025, 0.14, 0.04, LEATHER, { y: 0.27, z: -0.07 }));
      break;
    }
    case 'crossbow': armR.push(box(0.03, 0.03, 0.24, WOOD, { x: 0.1, y: 0.25, z: 0.1 })); armR.push(box(0.22, 0.02, 0.025, IRON, { x: 0.1, y: 0.255, z: 0.2 })); break;
    case 'musket': armR.push(box(0.022, 0.03, 0.4, 0x4a3520, { x: 0.11, y: 0.27, z: 0.08, rx: -0.5 })); armR.push(box(0.012, 0.012, 0.1, STEEL, { x: 0.11, y: 0.4, z: 0.3, rx: -0.5 })); break;
    case 'rifle': armR.push(box(0.02, 0.03, 0.36, DARK, { x: 0.11, y: 0.26, z: 0.1, rx: -0.2 })); break;
    case 'staff': armR.push(cyl(0.012, 0.012, 0.46, 4, WOOD, { x: 0.125, y: 0.24 })); break;
    case 'hammer': armR.push(cyl(0.012, 0.012, 0.22, 4, WOOD, { x: 0.125, y: 0.3, rx: 0.6 })); armR.push(box(0.05, 0.05, 0.09, IRON, { x: 0.125, y: 0.4, z: 0.07 })); break;
    case 'saber': armR.push(box(0.014, 0.26, 0.026, STEEL, { x: 0.13, y: 0.42, rx: 0.9 })); break;
    case 'lance': armR.push(cyl(0.012, 0.012, 0.7, 4, WOOD, { x: 0.13, y: 0.34, z: 0.2, rx: 1.15 })); armR.push(cone(0.022, 0.07, 4, STEEL, { x: 0.13, y: 0.49, z: 0.55, rx: 1.15 })); break;
  }
  if (f.shield !== undefined) {
    armL.push(cyl(0.085, 0.085, 0.02, 8, f.shield, { x: -0.115, y: 0.25, z: 0.045, rx: Math.PI / 2 }));
    armL.push(cyl(0.025, 0.025, 0.03, 6, STEEL, { x: -0.115, y: 0.25, z: 0.05, rx: Math.PI / 2 }));
  }
  // 関節：脚は腰、腕（と持ち物）は肩を軸に動く
  if (f.noLegs) p.push(...legL, ...legR);
  else p.push(...tag(legL, 1, -0.037, 0.165, 0), ...tag(legR, 2, 0.037, 0.165, 0));
  p.push(...tag(armL, 3, -0.1, 0.34, 0), ...tag(armR, 4, 0.1, 0.34, 0));
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
    box(0.025, 0.14, 0.03, DARK, { y: 0.25, z: -0.2, rx: -0.5 }),
    // 対角の脚を同じ位相で動かす
    ...tag([box(0.035, 0.2, 0.04, coat, { x: -0.045, y: 0.1, z: 0.13 })], 1, -0.045, 0.2, 0.13),
    ...tag([box(0.035, 0.2, 0.04, coat, { x: 0.045, y: 0.1, z: -0.13 })], 1, 0.045, 0.2, -0.13),
    ...tag([box(0.035, 0.2, 0.04, coat, { x: 0.045, y: 0.1, z: 0.13 })], 2, 0.045, 0.2, 0.13),
    ...tag([box(0.035, 0.2, 0.04, coat, { x: -0.045, y: 0.1, z: -0.13 })], 2, -0.045, 0.2, -0.13),
  ];
  if (armor !== undefined) p.push(box(0.145, 0.09, 0.3, armor, { y: 0.28 }));
  return p;
}

function rider(f: Fig, coat: number, armor?: number): Geo[] {
  const fig = figure({ ...f, legs: f.tunic, noLegs: true });
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
  const g = merge(p, true);
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

function addWalls(p: Geo[], look: CityLook, TOP: number): void {
  const { era, c1 } = look;
  if (look.walls) {
    const R = 0.74, stone = era >= 3 ? 0x9a958c : 0xb0a58c;
    for (let k = 0; k < 6; k++) {
      const a0 = (Math.PI / 3) * k + Math.PI / 6, a1 = a0 + Math.PI / 3;
      const x0 = Math.cos(a0) * R, z0 = Math.sin(a0) * R, x1 = Math.cos(a1) * R, z1 = Math.sin(a1) * R;
      const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      const y = TOP;
      if (k !== 1) p.push(box(R * 0.98, 0.14, 0.05, stone, { x: mx, y: y + 0.07, z: mz, ry: -Math.atan2(z1 - z0, x1 - x0) }));
      p.push(cyl(0.055, 0.065, 0.22, 6, stone, { x: x0, y: TOP + 0.11, z: z0 }), cone(0.07, 0.08, 6, c1, { x: x0, y: TOP + 0.26, z: z0 }));
    }
  }
}

export interface CityLook { pop: number; era: number; walls: boolean; capital: boolean; c1: number; c2: number; seed: number }

export function cityGeometry(look: CityLook): Geo {
  const p: Geo[] = [];
  // 都市は石畳の台地の上に建てる（斜面でも建物が埋もれない）
  const TOP = 0.05;
  const gy = (_x: number, _z: number) => TOP;
  const { era, c1, c2, seed } = look;
  const pave = era >= 4 ? 0x8d8a86 : era >= 2 ? 0xa99d88 : 0xb3a383;
  p.push(cyl(0.8, 0.86, 0.5, 6, pave, { y: TOP - 0.25, ry: Math.PI / 6 }));
  p.push(cyl(0.805, 0.805, 0.03, 6, era >= 4 ? 0x6f6c68 : 0x8a7d66, { y: TOP - 0.03, ry: Math.PI / 6 }));
  for (let k = 0; k < 3; k++) p.push(box(1.36, 0.012, 0.06, era >= 4 ? 0x5f5d5a : 0x8f8168, { y: TOP + 0.004, ry: (Math.PI / 3) * k + Math.PI / 6 }));
  const lift: Geo[] = [];
  if (hasPack() && era < 4) {
    // 産業時代より前は、外部モデルパックの建物で街並みを組む
    const P = (name: string, size: number, x: number, z: number, ry: number) => xf(packGeo(name, size, c1), { x, y: TOP, z, ry });
    if (look.capital) p.push(P('castle', 0.21, 0, 0, hash(seed, 1) * 6.28));
    else if (look.pop >= 5) p.push(P('church', 0.3, 0, 0, hash(seed, 1) * 6.28));
    else p.push(P('tower_A', 0.22, 0, 0, hash(seed, 1) * 6.28));
    const n = Math.min(11, 3 + look.pop);
    for (let k = 0; k < n; k++) {
      const inner = k < 6;
      const a = ((inner ? k : k - 6) / (inner ? 6 : 5)) * Math.PI * 2 + hash(seed, k) * 0.4 + (inner ? 0.5 : 0);
      const r = (inner ? 0.38 : 0.58) + hash(seed, k + 50) * 0.05;
      const kind = k === 2 && look.pop >= 3 ? 'well' : k === 4 && look.pop >= 6 ? 'tavern' : k === 7 && look.pop >= 8 ? 'church' : hash(seed, k + 20) < 0.5 ? 'home_A' : 'home_B';
      const size = kind === 'tavern' ? 0.17 : kind === 'church' ? 0.2 : kind === 'well' ? 0.26 : 0.19 + hash(seed, k + 30) * 0.04;
      p.push(P(kind, size, Math.cos(a) * r, Math.sin(a) * r, -a + Math.PI / 2));
    }
    p.push(cyl(0.008, 0.008, 0.3, 4, DARK, { y: look.capital ? 1.0 : 0.72 }), box(0.14, 0.08, 0.01, c1, { x: 0.07, y: look.capital ? 1.1 : 0.82 }), box(0.14, 0.02, 0.012, c2, { x: 0.07, y: look.capital ? 1.1 : 0.82 }));
    addWalls(p, look, TOP);
    return merge(p);
  }
  if (hasPack()) {
    // 産業時代以降：パックの作法に合わせて組んだ町家・集合住宅・オフィス・高層ビル
    const put = (parts: Geo[], x: number, z: number, ry: number, sc = 1) => p.push(...group(parts, { x, y: TOP, z, ry, sx: sc, sy: sc, sz: sc }));
    const modern = era >= 5;
    if (modern) put(skyscraper(seed, look.capital ? 0.95 : 0.7, c1), 0, 0, hash(seed, 1) * 1.5, look.capital ? 1.05 : 0.9);
    else put(civicHall(c1, c2), 0, 0, hash(seed, 1) * 6.28, look.capital ? 0.95 : 0.78);
    const n = Math.min(13, 4 + look.pop);
    for (let k = 0; k < n; k++) {
      const inner = k < 6;
      const a = ((inner ? k : k - 6) / (inner ? 6 : 7)) * Math.PI * 2 + hash(seed, k) * 0.3 + (inner ? 0.5 : 0.2);
      const r = (inner ? 0.4 : 0.6) + hash(seed, k + 50) * 0.04;
      const x = Math.cos(a) * r, z = Math.sin(a) * r, ry = -a + Math.PI / 2, h = hash(seed, k + 20);
      if (modern) {
        if (h < 0.3 + (era - 5) * 0.2 && look.pop >= 8 && inner) put(skyscraper(seed + k, 0.45 + hash(seed, k + 60) * 0.3, c1), x, z, ry, 0.72);
        else if (h < 0.7) put(office(seed + k, 2 + Math.floor(hash(seed, k + 40) * 3), c1), x, z, ry, 0.82);
        else if (h < 0.88) put(tenement(seed + k), x, z, ry, 0.85);
        else put(townhouse(c1, seed + k), x, z, ry, 0.85);
      } else if (h < 0.3) p.push(xf(packGeo(h < 0.15 ? 'home_A' : 'home_B', 0.19, c1), { x, y: TOP, z, ry }));
      else if (h < 0.72) put(townhouse(c1, seed + k), x, z, ry, 0.9);
      else put(tenement(seed + k), x, z, ry, 0.85);
    }
    const fy = modern ? (look.capital ? 1.42 : 1.0) : look.capital ? 0.72 : 0.6;
    p.push(cyl(0.008, 0.008, 0.2, 4, DARK, { y: fy }), box(0.14, 0.08, 0.01, c1, { x: 0.07, y: fy + 0.06 }), box(0.14, 0.02, 0.012, c2, { x: 0.07, y: fy + 0.06 }));
    addWalls(p, look, TOP);
    return merge(p);
  }
  const wallCol = era >= 4 ? 0xb9a089 : era >= 2 ? 0xd9cfb8 : 0xcdb891;
  const roofs = [c1, 0x9a4a32, 0x7a5a3a, c2];
  // 中心の建物
  if (era >= 5) {
    lift.push(box(0.22, 0.6, 0.22, 0x8fa3b5, { y: 0.3 }), box(0.18, 0.2, 0.18, 0xa9bccd, { y: 0.7 }), cyl(0.01, 0.01, 0.2, 4, DARK, { y: 0.9 }));
    lift.push(box(0.16, 0.42, 0.16, 0x9aa9b8, { x: 0.24, y: 0.21, z: 0.1 }), box(0.14, 0.34, 0.2, 0x7f93a6, { x: -0.22, y: 0.17, z: -0.14 }));
  } else if (look.capital || look.pop >= 6) {
    lift.push(box(0.3, 0.26, 0.26, wallCol, { y: 0.13 }), cone(0.24, 0.16, 4, c1, { y: 0.34, ry: Math.PI / 4 }));
    lift.push(cyl(0.06, 0.07, 0.42, 6, wallCol, { x: 0.17, y: 0.21, z: 0.14 }), cone(0.085, 0.14, 6, c1, { x: 0.17, y: 0.49, z: 0.14 }));
    lift.push(cyl(0.06, 0.07, 0.36, 6, wallCol, { x: -0.17, y: 0.18, z: -0.12 }), cone(0.085, 0.12, 6, c1, { x: -0.17, y: 0.42, z: -0.12 }));
  } else {
    lift.push(...house(0.2, 0.16, 0.16, wallCol, c1, 0, 0, 0, 0.3));
  }
  lift.push(cyl(0.008, 0.008, 0.34, 4, DARK, { y: era >= 5 ? 1.0 : 0.6 }), box(0.14, 0.08, 0.01, c1, { x: 0.07, y: era >= 5 ? 1.12 : 0.72 }), box(0.14, 0.02, 0.012, c2, { x: 0.07, y: era >= 5 ? 1.12 : 0.72 }));
  if (era < 5 && era >= 2 && (look.capital || look.pop >= 6)) lift.push(ball(0.085, c2, { y: 0.47, sy: 0.9 }), cyl(0.006, 0.006, 0.1, 4, 0xe2c36b, { y: 0.58 }));
  if (era >= 3 && era < 5 && look.pop >= 8) lift.push(box(0.1, 0.34, 0.14, 0xcfc6b4, { x: -0.3, y: 0.17, z: 0.22 }), cone(0.06, 0.26, 4, 0x4a5568, { x: -0.3, y: 0.47, z: 0.22, ry: Math.PI / 4 }));
  if (look.pop >= 4) for (let k = 0; k < 3; k++) {
    const a = 2.2 + k * 0.5;
    lift.push(box(0.07, 0.05, 0.06, 0x8b6a42, { x: Math.cos(a) * 0.2, y: 0.025, z: Math.sin(a) * 0.2 }), box(0.09, 0.012, 0.08, k % 2 ? c2 : c1, { x: Math.cos(a) * 0.2, y: 0.07, z: Math.sin(a) * 0.2, rz: 0.15 }));
  }
  p.push(...group(lift, { y: TOP }));
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
  addWalls(p, look, TOP);
  return merge(p);
}

// ---------------------------------------------------------------- 区域（都市の周囲に広がる専門地区）
export type DistrictKind = 'campus' | 'commerce' | 'industry' | 'culture' | 'harbor' | 'marvel';

/** 柱の並ぶ建物（銀行・博物館など） */
function colonnade(w: number, d: number, h: number, wall: number, roof: number, t: { x: number; z: number; ry: number }): Geo[] {
  const p = [box(w, h, d, wall, { y: h / 2 + 0.02 }), box(w + 0.05, 0.02, d + 0.05, 0xd9d2c0, { y: 0.01 }), box(w + 0.04, 0.03, d + 0.04, roof, { y: h + 0.035 })];
  p.push(cyl(Math.max(w, d) * 0.62, Math.max(w, d) * 0.62, 0.012, 3, roof, { y: h + 0.06, sx: 1, sz: d / w }));
  const n = 4;
  for (let i = 0; i < n; i++) p.push(cyl(0.012, 0.014, h, 6, 0xeee8d8, { x: -w / 2 + (w / (n - 1)) * i, y: h / 2 + 0.02, z: d / 2 + 0.02 }));
  return group(p, { x: t.x, z: t.z, ry: t.ry });
}

/**
 * 区域のモデル。level は該当する建造物の数（多いほど建物が増える）。
 * 戻り値の smoke は煙突の位置（モデル座標）。
 */
export function districtGeometry(kind: DistrictKind, level: number, era: number, c1: number, c2: number, key = ''): { geo: Geo; smoke: [number, number, number][] } {
  if (kind === 'marvel') return { geo: merge(marvelParts(key, c1, c2)), smoke: [] };
  const p: Geo[] = [];
  const smoke: [number, number, number][] = [];
  const T = 0.04;
  if (kind !== 'harbor') {
    const pave = kind === 'industry' ? 0x8a8580 : era >= 4 ? 0x9c968a : 0xa89c80;
    p.push(cyl(0.6, 0.66, 0.4, 6, pave, { y: T - 0.2, ry: Math.PI / 6 }));
    p.push(cyl(0.605, 0.605, 0.03, 6, kind === 'industry' ? 0x6a6660 : 0x857a64, { y: T - 0.03, ry: Math.PI / 6 }));
    p.push(cyl(0.2, 0.2, 0.012, 10, kind === 'commerce' ? 0xcdbf9a : 0x9f9480, { y: T + 0.004 }));
  }
  const wall = era >= 4 ? 0xc9c2b6 : 0xddd3bc;
  if (kind === 'campus') {
    const blue = 0x3f6fb5;
    p.push(...group(house(0.26, 0.15, 0.17, wall, blue, 0, 0, 0, 0), { x: -0.32, y: T, z: -0.22, ry: 0.5 }));
    p.push(cyl(0.05, 0.055, 0.3, 7, wall, { x: -0.44, y: T + 0.15, z: 0.12 }), cone(0.07, 0.12, 7, blue, { x: -0.44, y: T + 0.36, z: 0.12 }));
    if (level >= 2) {
      p.push(...group(house(0.22, 0.17, 0.2, wall, blue, 0, 0, 0, 0), { x: 0.34, y: T, z: -0.24, ry: -0.5 }));
      p.push(cyl(0.085, 0.09, 0.12, 10, wall, { x: 0.38, y: T + 0.06, z: 0.2 }), ball(0.085, 0xe9edf2, { x: 0.38, y: T + 0.12, z: 0.2, sy: 0.8 }, 10, 6), box(0.02, 0.02, 0.1, 0x3a3f4a, { x: 0.38, y: T + 0.2, z: 0.23, rx: -0.6 }));
    }
    if (level >= 3) p.push(...group(office(11, 3, 0x3f6fb5), { x: 0.02, y: T, z: -0.44, sx: 0.95, sz: 0.95 }));
    if (level >= 4) p.push(...group(skyscraper(13, 0.55, 0x3f6fb5), { x: -0.08, y: T, z: 0.42, sx: 0.8, sz: 0.8 }));
    p.push(cyl(0.01, 0.01, 0.2, 4, 0x3a3f4a, { x: 0.22, y: T + 0.1, z: 0.44 }), box(0.1, 0.06, 0.01, blue, { x: 0.27, y: T + 0.17, z: 0.44 }));
  } else if (kind === 'commerce' && hasPack()) {
    p.push(xf(packGeo('market', 0.4, c1), { x: -0.08, y: T, z: -0.14, ry: 0.4 }), xf(packGeo('barrel', 0.5), { x: 0.36, y: T, z: 0.2 }), xf(packGeo('crate', 0.5), { x: 0.3, y: T, z: 0.36, ry: 0.5 }), xf(packGeo('sack', 0.6), { x: -0.38, y: T, z: 0.3 }));
    if (level >= 2) p.push(...group(colonnade(0.24, 0.15, 0.15, wall, 0xd9a441, { x: 0, z: 0, ry: 0 }), { x: 0.3, y: T, z: -0.36, ry: -0.6 }));
  } else if (kind === 'commerce') {
    const awn = [c1, c2, 0xd9a441, 0xf1ead8, 0x3f8f6a];
    const n = 4 + Math.min(2, level);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.3, r = 0.4;
      p.push(...group([box(0.13, 0.07, 0.1, 0x8b6a42, { y: 0.035 }), box(0.16, 0.012, 0.14, awn[k % awn.length], { y: 0.11, rx: 0.25 }),
        cyl(0.006, 0.006, 0.11, 4, 0x5b4025, { x: -0.07, y: 0.055, z: 0.06 }), cyl(0.006, 0.006, 0.11, 4, 0x5b4025, { x: 0.07, y: 0.055, z: 0.06 })], { x: Math.cos(a) * r, y: T, z: Math.sin(a) * r, ry: -a + Math.PI / 2 }));
    }
    p.push(cyl(0.05, 0.06, 0.04, 8, 0x9a958c, { y: T + 0.02 }), cyl(0.012, 0.012, 0.12, 5, 0x9a958c, { y: T + 0.08 }));
    if (level >= 2) p.push(...group(colonnade(0.26, 0.16, 0.16, wall, 0xd9a441, { x: 0, z: 0, ry: 0 }), { x: -0.02, y: T, z: -0.47 }));
  } else if (kind === 'industry' && hasPack() && level < 2) {
    p.push(xf(packGeo('blacksmith', 0.36, c1), { x: -0.12, y: T, z: -0.12, ry: 0.5 }), xf(packGeo('lumber', 0.5), { x: 0.36, y: T, z: 0.22 }), xf(packGeo('stone', 0.5), { x: -0.3, y: T, z: 0.38 }));
    smoke.push([-0.12, T + 0.45, -0.12]);
  } else if (kind === 'industry') {
    // 工房 → 工場 → 発電所と、建造物が増えるほど大きくなる
    const f = factory(c1, level >= 2);
    p.push(...group(f.parts, { x: -0.06, y: T, z: -0.14, ry: 0.35 }));
    const m4 = new THREE.Matrix4().makeRotationY(0.35);
    for (const sm of f.smoke) { const v = new THREE.Vector3(sm[0], sm[1], sm[2]).applyMatrix4(m4); smoke.push([v.x - 0.06, v.y + T, v.z - 0.14]); }
    p.push(box(0.1, 0.05, 0.1, PAL.woodDark, { x: 0.36, y: T + 0.025, z: 0.3 }), box(0.14, 0.04, 0.08, PAL.wood, { x: -0.3, y: T + 0.02, z: 0.36, ry: 0.4 }));
    if (level >= 3) {
      p.push(cyl(0.085, 0.13, 0.3, 10, PAL.concrete, { x: 0.3, y: T + 0.15, z: 0.34 }), cyl(0.07, 0.085, 0.06, 10, PAL.concreteDark, { x: 0.3, y: T + 0.33, z: 0.34 }), cyl(0.132, 0.132, 0.014, 10, c1, { x: 0.3, y: T + 0.06, z: 0.34 }));
      smoke.push([0.3, T + 0.42, 0.34]);
    }
  } else if (kind === 'culture') {
    const purple = 0x7a4a9a;
    for (let k = 0; k < 3; k++) {
      const g = new THREE.CylinderGeometry(0.2 + k * 0.07, 0.2 + k * 0.07, 0.04 + k * 0.035, 12, 1, false, 0, Math.PI);
      p.push(group([paintGeo(g, 0xd9d2c0)], { x: -0.28, y: T + (0.04 + k * 0.035) / 2, z: 0.18, ry: 0.6 })[0]);
    }
    p.push(box(0.2, 0.012, 0.1, 0xb59a6a, { x: -0.2, y: T + 0.008, z: 0.1, ry: 0.6 }));
    if (level >= 2) p.push(...group(colonnade(0.28, 0.17, 0.17, wall, purple, { x: 0, z: 0, ry: 0 }), { x: 0.28, y: T, z: -0.3, ry: -0.5 }));
    if (level >= 3) {
      p.push(cone(0.07, 0.62, 4, 0x8f959c, { x: 0.36, y: T + 0.31, z: 0.3, ry: Math.PI / 4 }), cyl(0.05, 0.05, 0.012, 8, 0xd9432b, { x: 0.36, y: T + 0.45, z: 0.3 }), ball(0.022, 0xd9432b, { x: 0.36, y: T + 0.63, z: 0.3 }, 5, 4));
    }
    p.push(cyl(0.012, 0.012, 0.16, 5, 0xd9d2c0, { x: 0.02, y: T + 0.08, z: -0.46 }), ball(0.035, c1, { x: 0.02, y: T + 0.19, z: -0.46 }, 6, 5));
  } else {
    // 港：桟橋・倉庫・クレーン・小舟（-z 方向が岸）
    p.push(box(0.5, 0.03, 0.14, 0x8b6a42, { y: 0.05, z: -0.1 }), box(0.12, 0.03, 0.5, 0x8b6a42, { x: 0.12, y: 0.05, z: 0.2 }), box(0.12, 0.03, 0.36, 0x7a5a36, { x: -0.18, y: 0.05, z: 0.14 }));
    for (const [x, z] of [[0.12, 0.42], [0.12, 0.2], [-0.18, 0.28], [-0.22, -0.1], [0.22, -0.1]]) p.push(cyl(0.014, 0.014, 0.16, 5, 0x4a3520, { x, y: 0.0, z }));
    p.push(...group(house(0.2, 0.11, 0.13, 0xb59a7a, c1, 0, 0, 0, 0), { x: -0.02, y: 0.065, z: -0.12 }));
    p.push(cyl(0.012, 0.012, 0.24, 5, 0x4a3520, { x: 0.2, y: 0.18, z: -0.08 }), box(0.012, 0.012, 0.2, 0x4a3520, { x: 0.2, y: 0.3, z: 0.0, rx: -0.5 }));
    p.push(box(0.09, 0.04, 0.22, 0x6b4a2c, { x: -0.02, y: 0.03, z: 0.3 }), cyl(0.006, 0.006, 0.18, 4, 0x4a3520, { x: -0.02, y: 0.13, z: 0.3 }), box(0.1, 0.1, 0.008, 0xf1ead8, { x: -0.02, y: 0.15, z: 0.31 }));
  }
  return { geo: merge(p), smoke };
}

/**
 * ユニットにポーズを付ける。base の頂点を、関節（aPart / aPivot）ごとに回転させて out に書き込む。
 * walk: 歩行の位相, amp: 歩幅 (0..1), strike: 右腕の振り（ラジアン）, aim: 左腕の構え（ラジアン）
 */
export function poseUnit(base: Geo, out: Geo, walk: number, amp: number, strike: number, aim: number): void {
  const src = base.attributes.position.array as Float32Array;
  const dst = out.attributes.position.array as Float32Array;
  const part = base.attributes.aPart.array as Float32Array;
  const piv = base.attributes.aPivot.array as Float32Array;
  const sw = Math.sin(walk) * 0.62 * amp;
  const bob = Math.abs(Math.sin(walk)) * 0.014 * amp;
  const ang = [0, sw, -sw, -sw * 0.6 + aim, sw * 0.6 + strike];
  const sn = ang.map(Math.sin), cs = ang.map(Math.cos);
  for (let i = 0, n = part.length; i < n; i++) {
    const k = part[i] | 0, j = i * 3;
    if (k === 0) { dst[j] = src[j]; dst[j + 1] = src[j + 1] + bob; dst[j + 2] = src[j + 2]; continue; }
    const py = piv[j + 1], pz = piv[j + 2];
    const y = src[j + 1] - py, z = src[j + 2] - pz;
    dst[j] = src[j];
    dst[j + 1] = py + y * cs[k] - z * sn[k] + bob;
    dst[j + 2] = pz + y * sn[k] + z * cs[k];
  }
  out.attributes.position.needsUpdate = true;
}
