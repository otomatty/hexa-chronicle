// 産業時代以降の建物と世界遺産のモデル。
// 外部モデルパック（中世の建物）と並べても浮かないよう、同じ作法で組む：
// 厚みのある土台、枠付きの窓、切妻屋根、ずんぐりした比率、限られた色数。
import * as THREE from 'three';
import { ball, box, cone, cyl, group, hash, ico, xf, type Xf } from './geo';

type Geo = THREE.BufferGeometry;

// パックの配色に合わせたパレット
export const PAL = {
  cream: 0xf0e2c0, plaster: 0xe6d5b0, stone: 0xb9bcc8, stoneDark: 0x7d8497, wood: 0x9a6a44, woodDark: 0x6b4a34,
  brick: 0xb86a4a, brickDark: 0x94513a, glass: 0x4a6fa8, glassDark: 0x2f3f5c, glassLit: 0xffd98a, gold: 0xe2b84a,
  metal: 0x8a93a3, white: 0xf4f1e8, concrete: 0xd3d6dd, concreteDark: 0xa9aeb8, sand: 0xe0c08a, sandDark: 0xc49f6a,
  green: 0x5aa84a, greenDark: 0x3c8a3a, bronze: 0xa9763a, bronzeLight: 0xc9954e, verdigris: 0x5aa89a, water: 0x4fa8d8,
};

/** 切妻屋根（三角柱）。底辺の幅 w・高さ h・奥行き len、底面が y=0 */
export function prism(w: number, h: number, len: number, color: number, t: Xf = {}): Geo {
  const g = xf(cyl(1, 1, len, 3, color), { sx: w / Math.sqrt(3), sz: h / 1.5 });
  xf(g, { rx: -Math.PI / 2, y: h / 3 });
  return xf(g, t);
}

/** 枠付きの窓。建物の +z 面（z=dz の位置）に付ける */
function win(x: number, y: number, dz: number, lit = false, w = 0.034, h = 0.046): Geo[] {
  return [box(w + 0.012, h + 0.012, 0.012, PAL.white, { x, y, z: dz }), box(w, h, 0.016, lit ? PAL.glassLit : PAL.glass, { x, y, z: dz })];
}

/** 箱の四方に窓を並べる */
function windows(w: number, d: number, y0: number, floors: number, fh: number, seed: number, per = 0.07): Geo[] {
  const out: Geo[] = [];
  const side = (len: number, depth: number, ry: number) => {
    const n = Math.max(1, Math.floor(len / per));
    const part: Geo[] = [];
    for (let f = 0; f < floors; f++) {
      for (let k = 0; k < n; k++) part.push(...win((k - (n - 1) / 2) * (len / n), y0 + f * fh, depth, hash(seed, f * 17 + k + ry * 10) < 0.28));
    }
    out.push(...group(part, { ry }));
  };
  side(w, d / 2, 0); side(w, d / 2, Math.PI); side(d, w / 2, Math.PI / 2); side(d, w / 2, -Math.PI / 2);
  return out;
}

/** 産業時代の町家：煉瓦か漆喰の 2 階建て、切妻屋根と煙突 */
export function townhouse(roof: number, seed: number): Geo[] {
  const w = 0.15 + hash(seed, 1) * 0.04, d = 0.13, h = 0.17 + hash(seed, 2) * 0.05;
  const wall = hash(seed, 3) < 0.5 ? PAL.brick : PAL.plaster;
  return [
    box(w + 0.014, 0.03, d + 0.014, PAL.stoneDark, { y: 0.015 }),
    box(w, h, d, wall, { y: 0.03 + h / 2 }),
    box(w + 0.012, 0.012, d + 0.012, PAL.white, { y: 0.03 + h * 0.52 }),
    prism(w + 0.03, 0.09, d + 0.02, roof, { y: 0.03 + h, ry: Math.PI / 2 }),
    box(0.03, 0.09, 0.03, PAL.brickDark, { x: w * 0.25, y: 0.03 + h + 0.07 }),
    box(0.034, 0.06, 0.012, PAL.woodDark, { y: 0.06, z: d / 2 }),
    ...windows(w, d, 0.03 + h * 0.3, 2, h * 0.42, seed),
  ];
}

/** 集合住宅：平屋根と軒飾りのある 3〜4 階建て */
export function tenement(seed: number): Geo[] {
  const w = 0.17, d = 0.15, floors = 3 + Math.floor(hash(seed, 1) * 2), fh = 0.075, h = floors * fh + 0.02;
  const wall = [PAL.brick, PAL.plaster, PAL.brickDark, PAL.cream][Math.floor(hash(seed, 2) * 4)];
  return [
    box(w + 0.014, 0.035, d + 0.014, PAL.stoneDark, { y: 0.017 }),
    box(w, h, d, wall, { y: 0.035 + h / 2 }),
    box(w + 0.02, 0.016, d + 0.02, PAL.white, { y: 0.035 + h }),
    box(w - 0.02, 0.02, d - 0.02, PAL.concreteDark, { y: 0.035 + h + 0.018 }),
    box(0.04, 0.035, 0.04, PAL.metal, { x: 0.03, y: 0.035 + h + 0.045, z: -0.02 }),
    ...windows(w, d, 0.035 + fh * 0.55, floors, fh, seed),
  ];
}

/** 工場：のこぎり屋根の煉瓦造りと煙突。戻り値の smoke は煙突の先 */
export function factory(stripe: number, big: boolean): { parts: Geo[]; smoke: [number, number, number][] } {
  const w = big ? 0.42 : 0.32, d = 0.2, h = 0.15;
  const p: Geo[] = [
    box(w + 0.016, 0.03, d + 0.016, PAL.stoneDark, { y: 0.015 }),
    box(w, h, d, PAL.brick, { y: 0.03 + h / 2 }),
    box(w + 0.01, 0.016, d + 0.01, stripe, { y: 0.03 + h * 0.88 }),
    box(0.07, 0.09, 0.012, PAL.woodDark, { x: -w * 0.3, y: 0.075, z: d / 2 }),
  ];
  const n = big ? 4 : 3;
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * (w / n);
    // のこぎり屋根：片流れの屋根と、採光用のガラス面
    p.push(xf(prism(w / n, 0.07, d, PAL.concreteDark), { x, y: 0.03 + h, rz: 0 }), box(0.012, 0.05, d - 0.03, PAL.glass, { x: x + w / n / 2 - 0.012, y: 0.03 + h + 0.03 }));
    p.push(box(w / n - 0.04, 0.05, 0.014, PAL.glass, { x, y: 0.03 + h * 0.5, z: d / 2 }), box(w / n - 0.03, 0.062, 0.01, PAL.white, { x, y: 0.03 + h * 0.5, z: d / 2 }));
  }
  const smoke: [number, number, number][] = [];
  const stacks: [number, number, number][] = big ? [[w * 0.36, -d * 0.2, 0.5], [w * 0.2, d * 0.15, 0.42]] : [[w * 0.3, -d * 0.1, 0.42]];
  for (const [x, z, hh] of stacks) {
    p.push(cyl(0.026, 0.04, hh, 8, PAL.brickDark, { x, y: hh / 2, z }), cyl(0.034, 0.034, 0.022, 8, PAL.stoneDark, { x, y: hh, z }), cyl(0.036, 0.036, 0.014, 8, PAL.white, { x, y: hh * 0.72, z }));
    smoke.push([x, hh + 0.05, z]);
  }
  return { parts: p, smoke };
}

/** 近代のオフィス：階ごとのガラスの帯と屋上設備 */
export function office(seed: number, floors: number, accent: number): Geo[] {
  const w = 0.16 + hash(seed, 1) * 0.04, d = 0.14 + hash(seed, 2) * 0.03, fh = 0.062, h = floors * fh;
  const body = hash(seed, 3) < 0.5 ? PAL.concrete : PAL.cream;
  const p: Geo[] = [
    box(w + 0.02, 0.03, d + 0.02, PAL.stoneDark, { y: 0.015 }),
    box(w, 0.06, d, PAL.glassDark, { y: 0.06 }),
    box(w + 0.03, 0.012, d + 0.03, accent, { y: 0.094 }),
    box(w, h, d, body, { y: 0.1 + h / 2 }),
    box(w + 0.012, 0.02, d + 0.012, PAL.concreteDark, { y: 0.1 + h + 0.01 }),
    box(0.05, 0.035, 0.04, PAL.metal, { x: -0.03, y: 0.1 + h + 0.035 }), box(0.03, 0.05, 0.03, PAL.metal, { x: 0.04, y: 0.1 + h + 0.045, z: 0.02 }),
  ];
  for (let f = 0; f < floors; f++) p.push(box(w + 0.006, fh * 0.48, d + 0.006, hash(seed, 20 + f) < 0.2 ? PAL.glassLit : PAL.glass, { y: 0.1 + fh * (f + 0.5) }));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box(0.016, h, 0.016, body, { x: sx * (w / 2), y: 0.1 + h / 2, z: sz * (d / 2) }));
  return p;
}

/** 高層ビル：段々に細くなるガラスの塔 */
export function skyscraper(seed: number, height: number, accent: number): Geo[] {
  const w = 0.17, glass = hash(seed, 1) < 0.5 ? 0x6f93c4 : 0x5f86b0;
  const p: Geo[] = [box(w + 0.05, 0.07, w + 0.05, PAL.concreteDark, { y: 0.035 }), box(w + 0.06, 0.012, w + 0.06, accent, { y: 0.076 })];
  let y = 0.08, cw = w;
  const tiers = [0.55, 0.3, 0.15];
  tiers.forEach((frac, ti) => {
    const h = height * frac;
    p.push(box(cw, h, cw, glass, { y: y + h / 2 }));
    // 縦の方立てと、階を示す横帯
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(box(0.014, h, 0.014, PAL.white, { x: sx * cw / 2, y: y + h / 2, z: sz * cw / 2 }));
    for (let k = 1; k < Math.floor(h / 0.07); k++) p.push(box(cw + 0.004, 0.008, cw + 0.004, PAL.glassDark, { y: y + k * 0.07 }));
    p.push(box(cw + 0.016, 0.014, cw + 0.016, ti === tiers.length - 1 ? accent : PAL.white, { y: y + h }));
    y += h;
    cw *= 0.72;
  });
  p.push(cyl(0.006, 0.01, height * 0.22, 5, PAL.metal, { y: y + height * 0.11 }), ball(0.014, 0xd9432b, { y: y + height * 0.22 }, 5, 4));
  return p;
}

/** 産業時代の市庁舎：時計塔のある広間 */
export function civicHall(c1: number, c2: number): Geo[] {
  const p: Geo[] = [
    box(0.4, 0.035, 0.3, PAL.stoneDark, { y: 0.017 }),
    box(0.34, 0.18, 0.22, PAL.cream, { y: 0.125 }),
    prism(0.38, 0.1, 0.24, c1, { y: 0.215, ry: Math.PI / 2 }),
    box(0.12, 0.42, 0.12, PAL.stone, { y: 0.245 }),
    box(0.14, 0.02, 0.14, PAL.white, { y: 0.39 }),
    cone(0.1, 0.16, 4, c1, { y: 0.535, ry: Math.PI / 4 }),
    cyl(0.005, 0.005, 0.08, 4, PAL.gold, { y: 0.65 }), ball(0.014, PAL.gold, { y: 0.69 }, 5, 4),
    box(0.06, 0.09, 0.012, PAL.woodDark, { y: 0.08, z: 0.111 }),
    box(0.16, 0.02, 0.012, c2, { y: 0.2, z: 0.112 }),
    ...windows(0.34, 0.22, 0.11, 2, 0.07, 7, 0.085),
  ];
  for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    p.push(...group([cyl(0.04, 0.04, 0.01, 12, PAL.white, { y: 0.42, z: 0.061, rx: Math.PI / 2 }), box(0.006, 0.03, 0.004, PAL.glassDark, { y: 0.43, z: 0.068 }), box(0.022, 0.006, 0.004, PAL.glassDark, { x: 0.008, y: 0.42, z: 0.068 })], { ry }));
  }
  return p;
}

// ---------------------------------------------------------------- 世界遺産
function base(r: number, color: number): Geo[] {
  // 石畳の台座に、金の縁取りを一段はさむ
  return [cyl(r, r + 0.05, 0.4, 6, color, { y: -0.17, ry: Math.PI / 6 }), cyl(r + 0.012, r + 0.012, 0.018, 6, PAL.gold, { y: 0.022, ry: Math.PI / 6 }), cyl(r - 0.03, r - 0.02, 0.02, 6, 0xcfc4ab, { y: 0.034, ry: Math.PI / 6 })];
}

/** 世界遺産のモデル。原点を中心に半径 0.7 程度、地面は y=0.04 */
export function marvelParts(key: string, c1: number, c2: number): Geo[] {
  const T = 0.04;
  const p: Geo[] = base(0.66, 0xb9ad94);
  const up = (parts: Geo[]) => p.push(...group(parts, { y: T }));
  switch (key) {
    case 'sunstair': {
      const q: Geo[] = [];
      for (let k = 0; k < 6; k++) q.push(box(0.96 - k * 0.15, 0.085, 0.96 - k * 0.15, k % 2 ? PAL.sandDark : PAL.sand, { y: 0.042 + k * 0.085 }));
      q.push(box(0.16, 0.5, 0.52, PAL.cream, { y: 0.24, z: 0.24, rx: -0.78 }), box(0.2, 0.12, 0.16, PAL.sand, { y: 0.57 }), prism(0.24, 0.07, 0.18, c1, { y: 0.63 }), ball(0.035, PAL.gold, { y: 0.75 }, 6, 5));
      for (const [x, z] of [[-0.4, 0.4], [0.4, 0.4], [-0.4, -0.4], [0.4, -0.4]]) q.push(cyl(0.03, 0.04, 0.12, 6, PAL.stoneDark, { x, y: 0.06, z }), ico(0.035, 0xff9a3a, { x, y: 0.15, z }));
      up(group(q, { sx: 0.92, sz: 0.92 }));
      break;
    }
    case 'archive': {
      const q: Geo[] = [box(0.9, 0.05, 0.6, PAL.stone, { y: 0.025 }), box(0.72, 0.03, 0.2, PAL.white, { y: 0.065, z: 0.26 }), box(0.5, 0.3, 0.38, PAL.cream, { y: 0.2 }),
        box(0.22, 0.2, 0.3, PAL.plaster, { x: -0.34, y: 0.15 }), box(0.22, 0.2, 0.3, PAL.plaster, { x: 0.34, y: 0.15 }),
        prism(0.26, 0.07, 0.32, c1, { x: -0.34, y: 0.25 }), prism(0.26, 0.07, 0.32, c1, { x: 0.34, y: 0.25 }),
        cyl(0.2, 0.22, 0.06, 12, PAL.white, { y: 0.38 }), ball(0.19, PAL.verdigris, { y: 0.41, sy: 0.85 }, 12, 7), cyl(0.012, 0.02, 0.1, 6, PAL.gold, { y: 0.61 }),
        box(0.56, 0.035, 0.1, PAL.white, { y: 0.345, z: 0.2 }), prism(0.56, 0.08, 0.1, PAL.white, { y: 0.36, z: 0.2, ry: Math.PI / 2 })];
      for (let k = 0; k < 6; k++) q.push(cyl(0.02, 0.024, 0.28, 7, PAL.white, { x: -0.25 + k * 0.1, y: 0.19, z: 0.22 }));
      q.push(box(0.1, 0.16, 0.012, PAL.woodDark, { y: 0.13, z: 0.191 }));
      up(group(q, { sx: 0.9, sz: 0.9 }));
      break;
    }
    case 'beacon': {
      const q: Geo[] = [ico(0.3, PAL.stoneDark, { y: 0.05, sy: 0.4 }), ico(0.2, PAL.stone, { x: 0.25, y: 0.04, z: 0.15, sy: 0.4 }), cyl(0.2, 0.24, 0.16, 8, PAL.stone, { y: 0.14 }), cyl(0.21, 0.21, 0.02, 8, PAL.white, { y: 0.23 })];
      for (let k = 0; k < 5; k++) q.push(cyl(0.15 - k * 0.018, 0.165 - k * 0.018, 0.17, 10, k % 2 ? c1 : PAL.white, { y: 0.325 + k * 0.17 }));
      q.push(cyl(0.13, 0.13, 0.02, 10, PAL.stoneDark, { y: 1.09 }), cyl(0.065, 0.065, 0.1, 8, PAL.glassLit, { y: 1.15 }), ball(0.05, 0xfff2b0, { y: 1.15 }, 6, 5), cone(0.1, 0.09, 8, c1, { y: 1.245 }), ball(0.015, PAL.gold, { y: 1.3 }, 5, 4),
        box(0.05, 0.08, 0.012, PAL.woodDark, { y: 0.19, z: 0.2 }));
      up(q);
      break;
    }
    case 'gardens': {
      const q: Geo[] = [];
      for (let k = 0; k < 4; k++) {
        const s0 = 0.9 - k * 0.2, y = 0.07 + k * 0.14;
        q.push(box(s0, 0.14, s0, k % 2 ? PAL.cream : PAL.sand, { y }), box(s0 - 0.04, 0.02, s0 - 0.04, PAL.greenDark, { y: y + 0.075 }));
        for (let j = 0; j < 8; j++) {
          const a = (j / 8) * 6.283 + k, r = s0 * 0.42;
          q.push(ico(0.05 + hash(k, j) * 0.03, j % 3 ? PAL.green : PAL.greenDark, { x: Math.cos(a) * r, y: y + 0.11, z: Math.sin(a) * r, sy: 0.9 }));
        }
        q.push(box(0.05, 0.14, 0.012, PAL.water, { x: (k % 2 ? 1 : -1) * s0 * 0.25, y, z: s0 / 2 + 0.004 }));
      }
      q.push(cyl(0.018, 0.022, 0.16, 6, PAL.wood, { y: 0.67 }), ico(0.09, PAL.green, { y: 0.78 }), box(0.9, 0.014, 0.9, PAL.water, { y: 0.008, sx: 1.06, sz: 1.06 }));
      up(group(q, { sx: 0.9, sz: 0.9 }));
      break;
    }
    case 'colossus': {
      const b = PAL.bronze, l = PAL.bronzeLight;
      up([box(0.4, 0.2, 0.4, PAL.stone, { y: 0.1 }), box(0.46, 0.03, 0.46, PAL.white, { y: 0.2 }), box(0.3, 0.02, 0.012, c1, { y: 0.12, z: 0.202 }),
        cyl(0.05, 0.06, 0.42, 7, b, { x: -0.07, y: 0.43 }), cyl(0.05, 0.06, 0.42, 7, b, { x: 0.07, y: 0.43 }),
        cyl(0.13, 0.15, 0.14, 8, l, { y: 0.68 }), cyl(0.15, 0.12, 0.3, 8, b, { y: 0.88 }),
        cyl(0.04, 0.035, 0.34, 6, b, { x: -0.19, y: 0.86, rz: -0.25 }), cyl(0.04, 0.035, 0.36, 6, b, { x: 0.2, y: 1.12, rz: 0.35 }),
        ball(0.095, l, { y: 1.13 }, 9, 7), cone(0.1, 0.1, 8, l, { y: 1.24 }),
        cyl(0.02, 0.026, 0.12, 6, PAL.gold, { x: 0.27, y: 1.33 }), ico(0.05, 0xffb347, { x: 0.27, y: 1.43 }),
        cyl(0.11, 0.11, 0.02, 10, l, { x: -0.25, y: 0.76, z: 0.08, rx: Math.PI / 2 })]);
      break;
    }
    case 'spire': {
      up([cyl(0.3, 0.34, 0.1, 10, PAL.stoneDark, { y: 0.05 }), cyl(0.22, 0.26, 0.5, 10, PAL.stone, { y: 0.35 }), cyl(0.27, 0.27, 0.025, 10, PAL.white, { y: 0.6 }),
        cyl(0.2, 0.22, 0.12, 10, PAL.cream, { y: 0.67 }), ball(0.21, PAL.white, { y: 0.73, sy: 0.95 }, 12, 8), box(0.07, 0.2, 0.24, PAL.glassDark, { y: 0.84, z: 0.07, rx: -0.5 }),
        cyl(0.03, 0.04, 0.3, 7, PAL.gold, { y: 0.95, z: 0.16, rx: -0.5 }),
        box(0.2, 0.16, 0.18, PAL.cream, { x: 0.34, y: 0.08 }), prism(0.24, 0.07, 0.2, c1, { x: 0.34, y: 0.16 }),
        ...windows(0.5, 0.5, 0.22, 3, 0.12, 5, 0.5), box(0.06, 0.1, 0.012, PAL.woodDark, { y: 0.15, z: 0.265 })]);
      break;
    }
    case 'cathedral': {
      const q: Geo[] = [box(0.36, 0.34, 0.74, PAL.cream, { y: 0.17 }), prism(0.4, 0.2, 0.76, c1, { y: 0.34 }), box(0.7, 0.26, 0.24, PAL.cream, { y: 0.13, z: -0.12 }), prism(0.26, 0.14, 0.72, c1, { y: 0.26, z: -0.12, ry: Math.PI / 2 }),
        cyl(0.07, 0.07, 0.012, 14, 0x7a4fb8, { y: 0.36, z: 0.375, rx: Math.PI / 2 }), cyl(0.085, 0.085, 0.008, 14, PAL.white, { y: 0.36, z: 0.372, rx: Math.PI / 2 }),
        box(0.09, 0.14, 0.012, PAL.woodDark, { y: 0.07, z: 0.372 }), cone(0.03, 0.3, 6, PAL.gold, { y: 0.7, z: -0.12 })];
      for (const sx of [-1, 1]) {
        q.push(box(0.15, 0.62, 0.15, PAL.stone, { x: sx * 0.22, y: 0.31, z: 0.3 }), box(0.17, 0.02, 0.17, PAL.white, { x: sx * 0.22, y: 0.5, z: 0.3 }), cone(0.115, 0.3, 4, c1, { x: sx * 0.22, y: 0.77, z: 0.3, ry: Math.PI / 4 }),
          box(0.04, 0.09, 0.012, PAL.glass, { x: sx * 0.22, y: 0.42, z: 0.376 }));
        for (let k = 0; k < 4; k++) q.push(box(0.05, 0.24, 0.05, PAL.stone, { x: sx * 0.21, y: 0.12, z: 0.12 - k * 0.14 }), box(0.03, 0.1, 0.012, 0x7a4fb8, { x: sx * 0.181, y: 0.2, z: 0.05 - k * 0.14, ry: Math.PI / 2 }));
      }
      up(group(q, { sx: 0.82, sy: 0.9, sz: 0.82, z: 0.02 }));
      break;
    }
    case 'clock': {
      const q: Geo[] = [box(0.5, 0.05, 0.4, PAL.stoneDark, { y: 0.025 }), box(0.42, 0.2, 0.3, PAL.brick, { y: 0.15 }), prism(0.46, 0.1, 0.32, c1, { y: 0.25, ry: Math.PI / 2 }),
        box(0.2, 0.9, 0.2, PAL.stone, { y: 0.5 }), box(0.23, 0.03, 0.23, PAL.white, { y: 0.62 }), box(0.24, 0.24, 0.24, PAL.cream, { y: 1.0 }), box(0.27, 0.03, 0.27, PAL.white, { y: 1.13 }),
        cone(0.19, 0.3, 4, c1, { y: 1.29, ry: Math.PI / 4 }), cyl(0.008, 0.008, 0.12, 4, PAL.gold, { y: 1.5 }), ball(0.02, PAL.gold, { y: 1.57 }, 6, 5),
        ...windows(0.42, 0.3, 0.13, 2, 0.08, 9, 0.09), box(0.07, 0.1, 0.012, PAL.woodDark, { y: 0.1, z: 0.151 })];
      for (const ry of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
        q.push(...group([cyl(0.09, 0.09, 0.012, 16, PAL.white, { y: 1.0, z: 0.121, rx: Math.PI / 2 }), cyl(0.1, 0.1, 0.008, 16, PAL.gold, { y: 1.0, z: 0.118, rx: Math.PI / 2 }),
          box(0.012, 0.07, 0.006, PAL.glassDark, { y: 1.03, z: 0.13 }), box(0.05, 0.012, 0.006, PAL.glassDark, { x: 0.02, y: 1.0, z: 0.13 }), box(0.03, 0.2, 0.012, PAL.glass, { y: 0.78, z: 0.101 })], { ry }));
      }
      up(group(q, { sx: 0.85, sy: 0.9, sz: 0.85 }));
      break;
    }
    case 'skytower': {
      const q: Geo[] = [cyl(0.3, 0.34, 0.06, 8, PAL.concreteDark, { y: 0.03 })];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * 6.283 + 0.785;
        q.push(cyl(0.022, 0.034, 0.75, 5, k % 2 ? 0xd9432b : PAL.white, { x: Math.cos(a) * 0.16, y: 0.4, z: Math.sin(a) * 0.16, rz: Math.cos(a) * 0.3, rx: -Math.sin(a) * 0.3 }));
      }
      q.push(cyl(0.2, 0.2, 0.015, 8, PAL.metal, { y: 0.32 }), cyl(0.06, 0.09, 0.5, 8, PAL.white, { y: 0.95 }), cyl(0.07, 0.07, 0.1, 8, 0xd9432b, { y: 0.85 }),
        cyl(0.17, 0.12, 0.07, 12, PAL.glass, { y: 1.22 }), cyl(0.18, 0.18, 0.02, 12, c1, { y: 1.265 }), cyl(0.12, 0.17, 0.05, 12, PAL.white, { y: 1.3 }),
        cyl(0.02, 0.05, 0.4, 6, PAL.white, { y: 1.52 }), cyl(0.008, 0.016, 0.3, 5, 0xd9432b, { y: 1.86 }), ball(0.018, 0xff5a3a, { y: 2.02 }, 5, 4));
      up(group(q, { sy: 0.86 }));
      break;
    }
    default: {
      // 軌道の環：発射台と、立てた巨大な環
      const ringGeo = new THREE.TorusGeometry(0.5, 0.045, 6, 22);
      const glow = new THREE.TorusGeometry(0.5, 0.016, 5, 22);
      const paintG = (g: Geo, c: number) => { const col = new THREE.Color(c), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = col.r; a[i * 3 + 1] = col.g; a[i * 3 + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
      up([cyl(0.5, 0.54, 0.06, 12, PAL.concreteDark, { y: 0.03 }), cyl(0.3, 0.3, 0.012, 12, c1, { y: 0.066 }),
        xf(paintG(ringGeo, PAL.white), { y: 0.66 }), xf(paintG(glow, 0x7fe3ff), { y: 0.66, z: 0.05 }), xf(paintG(glow.clone(), 0x7fe3ff), { y: 0.66, z: -0.05 }),
        box(0.12, 0.2, 0.16, PAL.concrete, { x: -0.5, y: 0.14 }), box(0.12, 0.2, 0.16, PAL.concrete, { x: 0.5, y: 0.14 }),
        cyl(0.045, 0.05, 0.42, 8, PAL.white, { y: 0.28 }), cone(0.045, 0.1, 8, c1, { y: 0.54 }), box(0.012, 0.1, 0.07, c1, { x: 0.05, y: 0.12 }), box(0.012, 0.1, 0.07, c1, { x: -0.05, y: 0.12 }),
        box(0.03, 0.36, 0.03, PAL.metal, { x: 0.14, y: 0.24 }), box(0.1, 0.012, 0.02, PAL.metal, { x: 0.09, y: 0.36 }),
        ball(0.03, c2, { x: 0.5, y: 0.26 }, 6, 5), ball(0.03, c2, { x: -0.5, y: 0.26 }, 6, 5)]);
    }
  }
  return p;
}
