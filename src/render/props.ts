// 山・植生・地表の小物・資源・地形改良・野営地を InstancedMesh で描く（種類ごとに 1 ドローコール）。
import * as THREE from 'three';
import type { GameState } from '../core/types';
import { districtTiles } from './districts';
import { ball, box, cone, cyl, hash, ico, merge } from './geo';
import { patchMaterial, type MapUniforms } from './shaders';
import type { Field } from './terrain';

type Geo = THREE.BufferGeometry;

/** 面のはっきりした岩山。頂点をずらした円錐に、高さで岩と雪の色を塗る */
function peak(seed: number, rockLow: number, rockHigh: number, snowFrom: number): Geo {
  const g = new THREE.ConeGeometry(0.62, 1, 9, 6, true).toNonIndexed();
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const lo = new THREE.Color(rockLow), hi = new THREE.Color(rockHigh), snow = new THREE.Color(0xf3f6f9), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z), ang = Math.atan2(z, x);
    const key = Math.round(ang * 100) * 31 + Math.round(y * 100);
    const j = hash(seed, key), j2 = hash(seed, key + 7);
    // 上ほど急峻に、裾は広く。稜線ごとに出入りをつける
    const profile = 0.62 + 0.38 * (1 - y) * (1 - y);
    const ridge = 0.72 + 0.56 * hash(seed, Math.round(ang * 100)) * (0.4 + 0.6 * (1 - y));
    const rr = r * profile * ridge * (0.9 + j * 0.25);
    const yy = r < 1e-4 ? y : y * (0.93 + j2 * 0.12);
    pos.setXYZ(i, Math.cos(ang) * rr + (r < 1e-4 ? (hash(seed, 1) - 0.5) * 0.06 : 0), yy, Math.sin(ang) * rr);
    c.copy(lo).lerp(hi, Math.min(1, y * 1.3 + j * 0.25));
    if (y > snowFrom + (j - 0.5) * 0.22) c.lerp(snow, Math.min(1, (y - snowFrom) * 5 + 0.55));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  g.computeVertexNormals();
  return g;
}

function cow(c: number, t: { x: number; z: number; ry: number }): Geo[] {
  const parts = [
    box(0.17, 0.09, 0.08, c, { y: 0.12 }), box(0.06, 0.06, 0.06, c, { x: 0.11, y: 0.15 }),
    box(0.025, 0.08, 0.025, 0x3a2a1c, { x: 0.06, y: 0.04, z: 0.025 }), box(0.025, 0.08, 0.025, 0x3a2a1c, { x: 0.06, y: 0.04, z: -0.025 }),
    box(0.025, 0.08, 0.025, 0x3a2a1c, { x: -0.06, y: 0.04, z: 0.025 }), box(0.025, 0.08, 0.025, 0x3a2a1c, { x: -0.06, y: 0.04, z: -0.025 }),
  ];
  for (const p of parts) { p.rotateY(t.ry); p.translate(t.x, 0, t.z); }
  return parts;
}

function geos(): Record<string, Geo> {
  const rocks = (c1: number, c2: number, c3: number) => merge([
    ico(0.11, c1, { y: 0.06, sy: 0.75 }), ico(0.08, c2, { x: 0.13, y: 0.04, z: 0.05, sy: 0.75 }), ico(0.065, c3, { x: -0.07, y: 0.035, z: 0.11, sy: 0.75 }),
  ]);
  const bushes = (leaf: number, dot: number) => {
    const p: Geo[] = [];
    for (let i = 0; i < 6; i++) {
      const x = ((i % 3) - 1) * 0.13, z = (Math.floor(i / 3) - 0.5) * 0.15;
      p.push(ico(0.065, leaf, { x, z, y: 0.06, sy: 0.85 }));
      p.push(ball(0.022, dot, { x: x + 0.03, z: z + 0.02, y: 0.11 }, 4, 3));
      p.push(ball(0.022, dot, { x: x - 0.03, z: z - 0.02, y: 0.09 }, 4, 3));
    }
    return merge(p);
  };
  const wheat: Geo[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = 0.05 + (i % 3) * 0.05;
    wheat.push(box(0.014, 0.17, 0.014, 0xd9b84a, { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.085 }));
    wheat.push(box(0.03, 0.05, 0.03, 0xf0d35f, { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.19 }));
  }
  const fences: Geo[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = 0.42;
    fences.push(box(0.03, 0.12, 0.03, 0x7a5a36, { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.06 }));
    const am = a + Math.PI / 8;
    fences.push(box(0.33, 0.02, 0.02, 0x8b6a42, { x: Math.cos(am) * r * 0.92, z: Math.sin(am) * r * 0.92, y: 0.09, ry: -am + Math.PI / 2 }));
    fences.push(box(0.33, 0.02, 0.02, 0x8b6a42, { x: Math.cos(am) * r * 0.92, z: Math.sin(am) * r * 0.92, y: 0.045, ry: -am + Math.PI / 2 }));
  }
  const farm: Geo[] = [];
  for (let i = 0; i < 9; i++) {
    const z = (i - 4) * 0.115;
    const half = Math.sqrt(Math.max(0.01, 0.58 * 0.58 - z * z));
    farm.push(box(half * 2, 0.035, 0.075, [0xc2a246, 0x86b34a, 0xa9b84f][i % 3], { z, y: 0.012 }));
  }
  farm.push(box(0.12, 0.09, 0.1, 0xb5936a, { x: 0.36, y: 0.045, z: 0.36 }), cone(0.1, 0.07, 4, 0x8a4a34, { x: 0.36, y: 0.125, z: 0.36, ry: Math.PI / 4 }));
  const plantation: Geo[] = [];
  for (let i = 0; i < 4; i++) {
    const z = (i - 1.5) * 0.19;
    plantation.push(box(0.7, 0.025, 0.07, 0x6b4a2c, { z, y: 0.012 }));
    for (let k = 0; k < 5; k++) plantation.push(ico(0.05, 0x3f8f3a, { x: (k - 2) * 0.15, z, y: 0.06 }));
  }
  const spikes: Geo[] = [];
  for (let i = 1; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    spikes.push(cone(0.035, 0.26, 4, 0x4a3520, { x: Math.cos(a) * 0.5, z: Math.sin(a) * 0.5, y: 0.13 }));
  }
  const fronds: Geo[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const f = cone(0.035, 0.24, 4, i % 2 ? 0x3c9a40 : 0x2f8236, { y: 0.12, sz: 0.35 });
    f.rotateZ(-1.95); f.rotateY(a); f.translate(0, 0.44, 0);
    fronds.push(f);
  }
  const tuft: Geo[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    tuft.push(cone(0.016, 0.07 + (i % 2) * 0.03, 3, i % 2 ? 0x7fb24a : 0x6aa23e, { x: Math.cos(a) * 0.025, z: Math.sin(a) * 0.025, y: 0.04, rz: Math.cos(a) * 0.35, rx: Math.sin(a) * 0.35 }));
  }
  return {
    // --- 山
    peakA: peak(11, 0x7d746a, 0xa89e92, 0.5), peakB: peak(23, 0x766d64, 0x9f968b, 0.56),
    peakSnowA: peak(37, 0x8a8785, 0xb8babc, 0.22), peakSnowB: peak(41, 0x83817c, 0xafb2b4, 0.3),
    peakDryA: peak(53, 0x8f6544, 0xbd8f63, 2), peakDryB: peak(67, 0x86583a, 0xb38257, 2),
    // --- 植生
    tree: merge([
      cyl(0.03, 0.045, 0.2, 5, 0x5b4025, { y: 0.1 }),
      ico(0.17, 0x3f8a2f, { y: 0.33, sy: 0.9 }), ico(0.13, 0x52a03a, { x: 0.09, y: 0.42, z: 0.04 }), ico(0.12, 0x347a2a, { x: -0.09, y: 0.38, z: -0.05 }),
    ]),
    tree2: merge([
      cyl(0.028, 0.04, 0.3, 5, 0x4f3820, { y: 0.15 }),
      ico(0.15, 0x4a9634, { y: 0.44, sy: 1.25 }), ico(0.1, 0x5fae42, { x: 0.05, y: 0.6, z: -0.03 }), ico(0.09, 0x3a8230, { x: -0.08, y: 0.36, z: 0.06 }),
    ]),
    pine: merge([
      cyl(0.025, 0.035, 0.14, 5, 0x4a3520, { y: 0.07 }),
      cone(0.15, 0.24, 7, 0x2f6a42, { y: 0.24 }), cone(0.115, 0.22, 7, 0x3a7a4c, { y: 0.38 }), cone(0.075, 0.2, 7, 0x478a58, { y: 0.52 }),
    ]),
    palm: merge([
      cyl(0.022, 0.03, 0.24, 5, 0x7a5c38, { y: 0.12, rz: 0.1 }), cyl(0.018, 0.022, 0.22, 5, 0x6b5030, { x: -0.035, y: 0.33, rz: 0.2 }),
      ...fronds.map((f) => { f.translate(-0.06, 0, 0); return f; }),
    ]),
    jungle: merge([
      cyl(0.04, 0.06, 0.26, 5, 0x4a3a22, { y: 0.13 }),
      ico(0.2, 0x2a7a34, { y: 0.38, sy: 0.6 }), ico(0.15, 0x379040, { x: 0.1, y: 0.47, z: 0.06, sy: 0.6 }), ico(0.13, 0x226a2c, { x: -0.11, y: 0.3, z: -0.08, sy: 0.7 }),
    ]),
    bush: merge([ico(0.07, 0x4f8f36, { y: 0.05, sy: 0.75 }), ico(0.05, 0x5fa040, { x: 0.07, y: 0.04, z: 0.03, sy: 0.75 })]),
    tuft: merge(tuft),
    reed: merge([
      box(0.012, 0.2, 0.012, 0x8aa05a, { y: 0.1, x: -0.04 }), box(0.012, 0.26, 0.012, 0x7d964f, { y: 0.13, x: 0.02, z: 0.03 }),
      box(0.012, 0.18, 0.012, 0x93a862, { y: 0.09, x: 0.05, z: -0.04 }), box(0.02, 0.05, 0.02, 0x5c4326, { y: 0.27, x: 0.02, z: 0.03 }),
    ]),
    cactus: merge([
      cyl(0.03, 0.035, 0.22, 6, 0x4f8a4a, { y: 0.11 }), cyl(0.02, 0.02, 0.09, 5, 0x4f8a4a, { x: 0.055, y: 0.15 }), cyl(0.02, 0.02, 0.05, 5, 0x4f8a4a, { x: 0.04, y: 0.11, rz: Math.PI / 2 }),
      cyl(0.02, 0.02, 0.07, 5, 0x5a964f, { x: -0.055, y: 0.12 }), cyl(0.02, 0.02, 0.05, 5, 0x5a964f, { x: -0.04, y: 0.09, rz: Math.PI / 2 }),
    ]),
    deadbush: merge([
      box(0.01, 0.09, 0.01, 0x8a6a45, { y: 0.045, rz: 0.4 }), box(0.01, 0.1, 0.01, 0x7a5a38, { y: 0.05, rz: -0.35, rx: 0.3 }), box(0.01, 0.08, 0.01, 0x8a6a45, { y: 0.04, rx: -0.5 }),
    ]),
    pebble: merge([ico(0.055, 0x8f8a82, { y: 0.025, sy: 0.6 }), ico(0.035, 0xa39e96, { x: 0.07, y: 0.018, z: 0.03, sy: 0.6 })]),
    // --- 資源
    wheat: merge(wheat),
    cattle: merge([...cow(0x8a5a35, { x: -0.06, z: 0.05, ry: 0.4 }), ...cow(0xe8e2d4, { x: 0.1, z: -0.08, ry: 2.4 })]),
    horses: merge([...cow(0x5a3a22, { x: -0.06, z: 0.05, ry: 1.0 }), ...cow(0x2a2018, { x: 0.1, z: -0.08, ry: 3.4 }), box(0.03, 0.09, 0.03, 0x5a3a22, { x: -0.02, y: 0.2, z: 0.14 })]),
    stone: rocks(0x9a9a98, 0xb0aea8, 0x858480),
    iron: rocks(0x4a4a52, 0x7a4a32, 0x3a3a40),
    gems: merge([
      cone(0.05, 0.16, 4, 0x4fd6e8, { y: 0.1 }), cone(0.04, 0.12, 4, 0xd65fe0, { x: 0.09, y: 0.08, z: 0.04, rz: -0.3 }),
      cone(0.035, 0.1, 4, 0x6ff0c0, { x: -0.07, y: 0.07, z: 0.06, rz: 0.3 }), ico(0.07, 0x55555c, { y: 0.02, sy: 0.75 }),
    ]),
    wine: bushes(0x3f8f3a, 0x7b3fa0),
    spices: bushes(0x4a8a30, 0xd9432b),
    silk: merge([cyl(0.02, 0.03, 0.14, 5, 0x5b4025, { y: 0.07 }), ico(0.11, 0x6aa84a, { y: 0.2, sy: 0.8 }),
      ball(0.03, 0xf4f1e6, { x: 0.07, y: 0.19, z: 0.05 }, 4, 3), ball(0.03, 0xf4f1e6, { x: -0.06, y: 0.23, z: -0.03 }, 4, 3), ball(0.03, 0xf4f1e6, { y: 0.16, z: -0.09 }, 4, 3)]),
    fish: merge([
      ball(0.06, 0xb9c7d6, { x: -0.07, y: 0.02, sx: 1.6, sy: 0.45, sz: 0.6 }, 6, 4), cone(0.035, 0.06, 4, 0xb9c7d6, { x: -0.19, y: 0.02, rz: -Math.PI / 2 }),
      ball(0.05, 0x8fa6bd, { x: 0.1, y: 0.02, z: 0.1, sx: 1.6, sy: 0.45, sz: 0.6, ry: 0.8 }, 6, 4),
    ]),
    // --- 地形改良
    farm: merge(farm),
    mine: merge([
      box(0.05, 0.22, 0.05, 0x6b4a2c, { x: -0.11, y: 0.11 }), box(0.05, 0.22, 0.05, 0x6b4a2c, { x: 0.11, y: 0.11 }),
      box(0.3, 0.05, 0.06, 0x7a5a36, { y: 0.235 }), box(0.18, 0.2, 0.03, 0x15120f, { y: 0.1, z: -0.02 }),
      ico(0.09, 0x6f6a64, { x: 0.24, y: 0.05, z: 0.08, sy: 0.75 }), ico(0.07, 0x857f78, { x: 0.3, y: 0.04, z: -0.06, sy: 0.75 }),
      box(0.12, 0.07, 0.08, 0x4a4038, { x: -0.24, y: 0.07, z: 0.1 }), cyl(0.03, 0.03, 0.02, 8, 0x2a2622, { x: -0.28, y: 0.03, z: 0.145, rx: Math.PI / 2 }),
      cyl(0.03, 0.03, 0.02, 8, 0x2a2622, { x: -0.2, y: 0.03, z: 0.145, rx: Math.PI / 2 }),
    ]),
    pasture: merge(fences),
    plantation: merge(plantation),
    lumbermill: merge([
      box(0.26, 0.14, 0.2, 0x8b6a42, { y: 0.07 }), cone(0.2, 0.12, 4, 0x6b3a2a, { y: 0.2, ry: Math.PI / 4 }),
      cyl(0.03, 0.03, 0.26, 6, 0x9a7446, { x: 0.26, y: 0.03, rx: Math.PI / 2 }), cyl(0.03, 0.03, 0.26, 6, 0x8a6638, { x: 0.32, y: 0.03, rx: Math.PI / 2 }),
      cyl(0.03, 0.03, 0.26, 6, 0x9a7446, { x: 0.29, y: 0.085, rx: Math.PI / 2 }),
    ]),
    camp: merge([
      ...spikes, cone(0.2, 0.3, 5, 0x7a2f25, { y: 0.15 }), cone(0.14, 0.22, 5, 0x5a3a2a, { x: 0.22, y: 0.11, z: 0.18 }),
      cyl(0.012, 0.012, 0.5, 4, 0x2a2018, { x: -0.2, y: 0.25, z: -0.15 }), box(0.14, 0.09, 0.012, 0xb3261e, { x: -0.13, y: 0.44, z: -0.15 }),
      ico(0.05, 0xff9a3a, { x: 0.02, y: 0.04, z: -0.24 }), box(0.14, 0.02, 0.02, 0x3a2a1c, { x: 0.02, y: 0.012, z: -0.24, ry: 0.6 }),
    ]),
  };
}

interface Item { key: string; x: number; z: number; rot: number; sxz: number; sy: number; r: number; g: number; b: number; sink: number }

const NO_SHADOW = new Set(['farm', 'fish', 'tuft', 'pebble', 'deadbush', 'reed']);

export class Props {
  readonly root = new THREE.Group();
  private geo = geos();
  private mat: THREE.MeshStandardMaterial;
  private sig = '';

  /** rich: 草むらや小石などの細かい装飾も置くか */
  constructor(private field: Field, uniforms: MapUniforms, private rich: boolean) {
    this.mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), uniforms, false);
  }

  /** 地物や改良が変わったときだけ作り直す */
  sync(s: GameState): void {
    let h = 0;
    for (const t of s.tiles) h = (Math.imul(h, 31) + t.feature.length * 7 + t.improvement.length * 13 + (t.camp ? 3 : 0)) | 0;
    let b = 0;
    for (const id in s.cities) b = (Math.imul(b, 31) + s.cities[id].buildings.length * 7 + s.cities[id].pos) | 0;
    const sig = h + ':' + b;
    if (sig === this.sig) return;
    this.sig = sig;
    this.rebuild(s);
  }

  private rebuild(s: GameState): void {
    for (const c of [...this.root.children]) {
      this.root.remove(c);
      (c as THREE.InstancedMesh).dispose();
    }
    const items: Item[] = [];
    const f = this.field;
    const cityTiles = new Set(Object.values(s.cities).map((c) => c.pos));
    for (const i of districtTiles(s)) cityTiles.add(i);
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      if (t.terrain === 'ocean') continue;
      const cx = f.tx(i), cz = f.tz(i);
      const add = (key: string, x: number, z: number, rot: number, sxz: number, sy = sxz, tint: [number, number, number] = [1, 1, 1], sink = 0.01) =>
        items.push({ key, x, z, rot, sxz, sy, r: tint[0], g: tint[1], b: tint[2], sink });
      /** タイル内にばらまく。pick でインスタンスごとに種類を選べる */
      const scatter = (pick: string | ((h: number) => string), count: number, radius: number, sc: number, inner = 0, salt = 0, tint: [number, number, number] = [1, 1, 1]) => {
        for (let k = 0; k < count; k++) {
          const q = k * 5 + salt * 97;
          const a = hash(i, q) * Math.PI * 2;
          const r = inner + Math.sqrt(hash(i, q + 1)) * (radius - inner);
          const size = sc * (0.72 + hash(i, q + 2) * 0.6);
          const v = 0.84 + hash(i, q + 3) * 0.3;
          const key = typeof pick === 'string' ? pick : pick(hash(i, q + 4));
          if (t.river && f.nearRiver(cx + Math.cos(a) * r, cz + Math.sin(a) * r)) continue;
          add(key, cx + Math.cos(a) * r, cz + Math.sin(a) * r, hash(i, q + 2) * 6.28, size, size * (0.9 + hash(i, q + 4) * 0.3),
            [tint[0] * v * (0.92 + hash(i, q + 1) * 0.16), tint[1] * v, tint[2] * v * (0.88 + hash(i, q) * 0.2)]);
        }
      };

      if (t.elev === 2) {
        const kind = t.terrain === 'desert' ? 'peakDry' : t.terrain === 'snow' || t.terrain === 'tundra' ? 'peakSnow' : 'peak';
        const v = () => kind + (hash(i, items.length) < 0.5 ? 'A' : 'B');
        const big = (1.28 + hash(i, 21) * 0.3) * (t.river ? 0.8 : 1);
        add(v(), cx + (hash(i, 22) - 0.5) * 0.2, cz + (hash(i, 23) - 0.5) * 0.2, hash(i, 24) * 6.28, big, 1.55 + hash(i, 25) * 0.75, [1, 1, 1], 0.22);
        const n = 2 + Math.floor(hash(i, 26) * 2);
        for (let k = 0; k < n; k++) {
          const a = hash(i, 30 + k) * 6.28 + k * 2.1, r = 0.42 + hash(i, 40 + k) * 0.2;
          const sc = 0.55 + hash(i, 50 + k) * 0.35;
          if (t.river && f.nearRiver(cx + Math.cos(a) * r * 1.5, cz + Math.sin(a) * r * 1.5)) continue;
          add(v(), cx + Math.cos(a) * r, cz + Math.sin(a) * r, hash(i, 60 + k) * 6.28, sc, 0.7 + hash(i, 70 + k) * 0.6, [0.95, 0.95, 0.95], 0.15);
        }
        continue;
      }
      if (cityTiles.has(i)) continue;
      const water = t.terrain === 'coast';
      const dense = t.improvement ? 0.4 : 1;
      const inner = t.improvement ? 0.45 : 0.08;
      if (t.feature === 'forest') {
        const cold = t.terrain === 'tundra';
        scatter((h) => (cold || h < 0.22 ? 'pine' : h < 0.7 ? 'tree' : 'tree2'), Math.round(15 * dense), 0.84, 0.86, inner, 0, cold ? [0.92, 0.98, 1.05] : [1, 1, 1]);
        if (this.rich) scatter('bush', 3, 0.8, 0.9, 0.2, 1);
      } else if (t.feature === 'jungle') {
        scatter((h) => (h < 0.55 ? 'jungle' : h < 0.85 ? 'palm' : 'tree2'), Math.round(15 * dense), 0.84, 0.9, inner);
        if (this.rich) scatter('bush', 4, 0.8, 1.0, 0.2, 1, [0.8, 1.05, 0.8]);
      } else if (t.feature === 'marsh') {
        scatter('reed', 11, 0.78, 1.1);
        if (this.rich) scatter('bush', 2, 0.7, 0.8, 0.2, 1, [0.8, 0.9, 0.7]);
      } else if (!water) {
        const centerImp = t.improvement === 'farm' || t.improvement === 'pasture' || t.improvement === 'plantation';
        if (t.terrain === 'grass') {
          if (!t.improvement && hash(i, 5) < 0.4) scatter((h) => (h < 0.6 ? 'tree' : 'tree2'), 1 + Math.floor(hash(i, 6) * 2), 0.72, 0.72, 0.4);
          if (this.rich && !centerImp) { scatter('tuft', 7, 0.8, 1.0, 0.15, 2); scatter('bush', hash(i, 8) < 0.45 ? 2 : 0, 0.75, 0.8, 0.3, 3); }
        } else if (t.terrain === 'plains') {
          if (!t.improvement && hash(i, 5) < 0.2) scatter('tree2', 1, 0.7, 0.7, 0.4, 0, [1.05, 1, 0.75]);
          if (this.rich && !centerImp) { scatter('tuft', 5, 0.8, 1.0, 0.15, 2, [1.25, 1.05, 0.6]); scatter('bush', hash(i, 8) < 0.3 ? 1 : 0, 0.75, 0.8, 0.3, 3, [1.1, 1, 0.7]); scatter('pebble', hash(i, 9) < 0.3 ? 1 : 0, 0.75, 1, 0.3, 4); }
        } else if (t.terrain === 'desert') {
          if (this.rich) { scatter('pebble', 1 + Math.floor(hash(i, 9) * 2), 0.78, 1.1, 0.2, 4, [1.2, 1.0, 0.78]); scatter('deadbush', hash(i, 8) < 0.5 ? 2 : 0, 0.75, 1.1, 0.25, 3); }
          if (!t.improvement && hash(i, 7) < 0.3) scatter('cactus', 1 + Math.floor(hash(i, 6) * 2), 0.7, 0.9, 0.35, 5);
        } else if (t.terrain === 'tundra') {
          if (!t.improvement && hash(i, 5) < 0.3) scatter('pine', 1, 0.7, 0.8, 0.35, 0, [0.92, 0.98, 1.05]);
          if (this.rich) { scatter('pebble', 1 + Math.floor(hash(i, 9) * 2), 0.78, 1.2, 0.2, 4); scatter('tuft', 3, 0.8, 0.9, 0.15, 2, [0.95, 0.95, 0.8]); }
        } else if (t.terrain === 'snow') {
          if (this.rich) scatter('pebble', 1 + Math.floor(hash(i, 9) * 2), 0.78, 1.5, 0.2, 4, [1.3, 1.35, 1.4]);
        }
        if (t.elev === 1 && this.rich) scatter('pebble', 3, 0.8, 1.7, 0.2, 6, t.terrain === 'desert' ? [1.2, 1, 0.8] : [1, 1, 1]);
      }
      if (t.improvement && this.geo[t.improvement]) {
        const center = t.improvement === 'farm' || t.improvement === 'pasture' || t.improvement === 'plantation';
        add(t.improvement, cx + (center ? 0 : -0.38), cz + (center ? 0 : -0.3), center ? hash(i, 11) * 3.14 : 0.4, 1);
      }
      if (t.resource && this.geo[t.resource] && t.improvement !== 'plantation') {
        add(t.resource, cx + 0.36, cz + 0.34, hash(i, 12) * 6.28, 1.15);
      }
      if (t.camp) add('camp', cx, cz, hash(i, 13) * 6.28, 1);
    }
    const by = new Map<string, Item[]>();
    for (const it of items) {
      let a = by.get(it.key);
      if (!a) by.set(it.key, (a = []));
      a.push(it);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    for (const [key, arr] of by) {
      const mesh = new THREE.InstancedMesh(this.geo[key], this.mat, arr.length);
      arr.forEach((it, k) => {
        q.setFromAxisAngle(up, it.rot);
        const y = key === 'fish' ? 0.0 : f.ground(it.x, it.z) - it.sink;
        m.compose(p.set(it.x, y, it.z), q, sc.set(it.sxz, it.sy, it.sxz));
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, col.setRGB(it.r, it.g, it.b));
      });
      mesh.castShadow = !NO_SHADOW.has(key);
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
  }
}
