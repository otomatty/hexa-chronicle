// 地物・資源・地形改良・野営地を InstancedMesh で描く（種類ごとに 1 ドローコール）。
import * as THREE from 'three';
import type { GameState } from '../core/types';
import { ball, box, cone, cyl, hash, merge } from './geo';
import { patchMaterial, type MapUniforms } from './shaders';
import type { Field } from './terrain';

type Geo = THREE.BufferGeometry;

function geos(): Record<string, Geo> {
  const tree = merge([
    cyl(0.03, 0.04, 0.16, 5, 0x5b4025, { y: 0.08 }),
    cone(0.16, 0.26, 6, 0x3c7d2c, { y: 0.26 }),
    cone(0.12, 0.22, 6, 0x4a9136, { y: 0.4 }),
    cone(0.075, 0.18, 6, 0x5aa340, { y: 0.52 }),
  ]);
  const pine = merge([
    cyl(0.025, 0.035, 0.14, 5, 0x4a3520, { y: 0.07 }),
    cone(0.13, 0.3, 6, 0x3d7a4c, { y: 0.27 }),
    cone(0.09, 0.26, 6, 0x4b8f5a, { y: 0.45 }),
  ]);
  const palm = merge([
    cyl(0.025, 0.04, 0.3, 5, 0x6b5030, { y: 0.15, rz: 0.08 }),
    ball(0.17, 0x2e8f3a, { y: 0.36, sy: 0.6 }, 6, 4),
    ball(0.12, 0x3fa845, { y: 0.44, x: 0.05, sy: 0.6 }, 6, 4),
    ball(0.1, 0x257a32, { y: 0.2, x: -0.12, z: 0.08, sy: 0.7 }, 5, 3),
  ]);
  const reed = merge([
    box(0.012, 0.2, 0.012, 0x8aa05a, { y: 0.1, x: -0.04 }),
    box(0.012, 0.26, 0.012, 0x7d964f, { y: 0.13, x: 0.02, z: 0.03 }),
    box(0.012, 0.18, 0.012, 0x93a862, { y: 0.09, x: 0.05, z: -0.04 }),
    box(0.02, 0.05, 0.02, 0x5c4326, { y: 0.27, x: 0.02, z: 0.03 }),
  ]);
  const wheat: Geo[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2, r = 0.05 + (i % 3) * 0.05;
    wheat.push(box(0.014, 0.17, 0.014, 0xd9b84a, { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.085 }));
    wheat.push(box(0.03, 0.05, 0.03, 0xf0d35f, { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.19 }));
  }
  const cow = (c: number, t: { x: number; z: number; ry: number }) => {
    const parts = [
      box(0.17, 0.09, 0.08, c, { y: 0.12 }), box(0.06, 0.06, 0.06, c, { x: 0.11, y: 0.15 }),
      box(0.025, 0.08, 0.025, 0x3a2a1c, { x: 0.06, y: 0.04, z: 0.025 }), box(0.025, 0.08, 0.025, 0x3a2a1c, { x: 0.06, y: 0.04, z: -0.025 }),
      box(0.025, 0.08, 0.025, 0x3a2a1c, { x: -0.06, y: 0.04, z: 0.025 }), box(0.025, 0.08, 0.025, 0x3a2a1c, { x: -0.06, y: 0.04, z: -0.025 }),
    ];
    for (const p of parts) { p.rotateY(t.ry); p.translate(t.x, 0, t.z); }
    return parts;
  };
  const rocks = (c1: number, c2: number, c3: number) => merge([
    xfIco(0.11, c1, 0, 0.07, 0), xfIco(0.08, c2, 0.13, 0.05, 0.05), xfIco(0.065, c3, -0.07, 0.04, 0.11),
  ]);
  const bushes = (leaf: number, dot: number) => {
    const p: Geo[] = [];
    for (let i = 0; i < 6; i++) {
      const x = ((i % 3) - 1) * 0.13, z = (Math.floor(i / 3) - 0.5) * 0.15;
      p.push(ball(0.06, leaf, { x, z, y: 0.07, sy: 0.9 }, 5, 4));
      p.push(ball(0.022, dot, { x: x + 0.03, z: z + 0.02, y: 0.11 }, 4, 3));
      p.push(ball(0.022, dot, { x: x - 0.03, z: z - 0.02, y: 0.09 }, 4, 3));
    }
    return merge(p);
  };
  const fences: Geo[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, r = 0.42;
    fences.push(box(0.03, 0.12, 0.03, 0x7a5a36, { x: Math.cos(a) * r, z: Math.sin(a) * r, y: 0.06 }));
    const am = a + Math.PI / 8;
    fences.push(box(0.33, 0.02, 0.02, 0x8b6a42, { x: Math.cos(am) * r * 0.92, z: Math.sin(am) * r * 0.92, y: 0.09, ry: -am + Math.PI / 2 }));
  }
  const farm: Geo[] = [];
  for (let i = 0; i < 7; i++) {
    const z = (i - 3) * 0.14;
    const half = Math.sqrt(Math.max(0.01, 0.56 * 0.56 - z * z));
    farm.push(box(half * 2, 0.03, 0.085, i % 2 ? 0xb99a3e : 0x7fae45, { z, y: 0.012 }));
  }
  const plantation: Geo[] = [];
  for (let i = 0; i < 4; i++) {
    const z = (i - 1.5) * 0.19;
    plantation.push(box(0.7, 0.025, 0.07, 0x6b4a2c, { z, y: 0.012 }));
    for (let k = 0; k < 5; k++) plantation.push(ball(0.045, 0x3f8f3a, { x: (k - 2) * 0.15, z, y: 0.06 }, 5, 3));
  }
  const spikes: Geo[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (i === 0) continue;
    spikes.push(cone(0.035, 0.26, 4, 0x4a3520, { x: Math.cos(a) * 0.5, z: Math.sin(a) * 0.5, y: 0.13 }));
  }
  return {
    tree, pine, palm, reed,
    wheat: merge(wheat),
    cattle: merge([...cow(0x8a5a35, { x: -0.06, z: 0.05, ry: 0.4 }), ...cow(0xe8e2d4, { x: 0.1, z: -0.08, ry: 2.4 })]),
    horses: merge([...cow(0x5a3a22, { x: -0.06, z: 0.05, ry: 1.0 }), ...cow(0x2a2018, { x: 0.1, z: -0.08, ry: 3.4 }),
      box(0.03, 0.09, 0.03, 0x5a3a22, { x: -0.02, y: 0.2, z: 0.14 })]),
    stone: rocks(0x9a9a98, 0xb0aea8, 0x858480),
    iron: rocks(0x4a4a52, 0x7a4a32, 0x3a3a40),
    gems: merge([
      cone(0.05, 0.16, 4, 0x4fd6e8, { y: 0.1 }), cone(0.04, 0.12, 4, 0xd65fe0, { x: 0.09, y: 0.08, z: 0.04, rz: -0.3 }),
      cone(0.035, 0.1, 4, 0x6ff0c0, { x: -0.07, y: 0.07, z: 0.06, rz: 0.3 }), xfIco(0.07, 0x55555c, 0, 0.02, 0),
    ]),
    wine: bushes(0x3f8f3a, 0x7b3fa0),
    spices: bushes(0x4a8a30, 0xd9432b),
    silk: merge([cyl(0.02, 0.03, 0.14, 5, 0x5b4025, { y: 0.07 }), ball(0.11, 0x6aa84a, { y: 0.2, sy: 0.8 }, 6, 4),
      ball(0.03, 0xf4f1e6, { x: 0.07, y: 0.19, z: 0.05 }, 4, 3), ball(0.03, 0xf4f1e6, { x: -0.06, y: 0.23, z: -0.03 }, 4, 3),
      ball(0.03, 0xf4f1e6, { x: 0.0, y: 0.16, z: -0.09 }, 4, 3)]),
    fish: merge([
      ball(0.06, 0xb9c7d6, { x: -0.07, y: 0.02, sx: 1.6, sy: 0.45, sz: 0.6 }, 6, 4), cone(0.035, 0.06, 4, 0xb9c7d6, { x: -0.19, y: 0.02, rz: -Math.PI / 2 }),
      ball(0.05, 0x8fa6bd, { x: 0.1, y: 0.02, z: 0.1, sx: 1.6, sy: 0.45, sz: 0.6, ry: 0.8 }, 6, 4),
    ]),
    farm: merge(farm),
    mine: merge([
      box(0.05, 0.22, 0.05, 0x6b4a2c, { x: -0.11, y: 0.11 }), box(0.05, 0.22, 0.05, 0x6b4a2c, { x: 0.11, y: 0.11 }),
      box(0.3, 0.05, 0.06, 0x7a5a36, { y: 0.235 }), box(0.18, 0.2, 0.03, 0x15120f, { y: 0.1, z: -0.02 }),
      xfIco(0.09, 0x6f6a64, 0.24, 0.05, 0.08), xfIco(0.07, 0x857f78, 0.3, 0.04, -0.06),
      box(0.12, 0.07, 0.08, 0x4a4038, { x: -0.24, y: 0.07, z: 0.1 }),
    ]),
    pasture: merge(fences),
    plantation: merge(plantation),
    lumbermill: merge([
      box(0.26, 0.14, 0.2, 0x8b6a42, { y: 0.07 }), xfRoof(0.2, 0.12, 0x6b3a2a, 0, 0.2, 0),
      cyl(0.03, 0.03, 0.26, 6, 0x9a7446, { x: 0.26, y: 0.03, rx: Math.PI / 2 }), cyl(0.03, 0.03, 0.26, 6, 0x8a6638, { x: 0.32, y: 0.03, rx: Math.PI / 2 }),
      cyl(0.03, 0.03, 0.26, 6, 0x9a7446, { x: 0.29, y: 0.085, rx: Math.PI / 2 }),
    ]),
    camp: merge([
      ...spikes, cone(0.2, 0.3, 5, 0x7a2f25, { y: 0.15 }), cone(0.14, 0.22, 5, 0x5a3a2a, { x: 0.22, y: 0.11, z: 0.18 }),
      cyl(0.012, 0.012, 0.5, 4, 0x2a2018, { x: -0.2, y: 0.25, z: -0.15 }), box(0.14, 0.09, 0.012, 0xb3261e, { x: -0.13, y: 0.44, z: -0.15 }),
    ]),
  };
}

function xfIco(r: number, color: number, x: number, y: number, z: number): Geo {
  const g = new THREE.IcosahedronGeometry(r, 0);
  const n = g.attributes.position.count;
  const c = new THREE.Color(color), arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  g.scale(1, 0.75, 1);
  g.translate(x, y, z);
  return g;
}
function xfRoof(r: number, h: number, color: number, x: number, y: number, z: number): Geo {
  return cone(r, h, 4, color, { x, y, z, ry: Math.PI / 4 });
}

interface Item { key: string; x: number; z: number; rot: number; scale: number; tint: number }

export class Props {
  readonly root = new THREE.Group();
  private geo = geos();
  private mat: THREE.MeshStandardMaterial;
  private sig = '';

  constructor(private field: Field, uniforms: MapUniforms) {
    this.mat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }), uniforms, false);
  }

  /** 地物や改良が変わったときだけ作り直す */
  sync(s: GameState): void {
    let h = 0;
    for (const t of s.tiles) {
      h = (Math.imul(h, 31) + t.feature.length * 7 + t.improvement.length * 13 + (t.camp ? 3 : 0) + (t.cityId >= 0 && t.owner >= 0 ? 0 : 1)) | 0;
    }
    const sig = h + ':' + Object.keys(s.cities).length;
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
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      const cx = f.tx(i), cz = f.tz(i);
      if (cityTiles.has(i)) continue;
      const scatter = (key: string, count: number, radius: number, sc: number, inner = 0) => {
        for (let k = 0; k < count; k++) {
          const a = hash(i, k * 3) * Math.PI * 2;
          const r = inner + Math.sqrt(hash(i, k * 3 + 1)) * (radius - inner);
          items.push({ key, x: cx + Math.cos(a) * r, z: cz + Math.sin(a) * r, rot: hash(i, k * 3 + 2) * 6.28, scale: sc * (0.75 + hash(i, k + 40) * 0.6), tint: 0.82 + hash(i, k + 80) * 0.3 });
        }
      };
      const dense = t.improvement ? 0.45 : 1;
      if (t.feature === 'forest') scatter(t.terrain === 'tundra' ? 'pine' : hash(i, 99) < 0.3 ? 'pine' : 'tree', Math.round(14 * dense), 0.82, 0.82, t.improvement ? 0.45 : 0.1);
      else if (t.feature === 'jungle') scatter('palm', Math.round(14 * dense), 0.82, 0.8, t.improvement ? 0.45 : 0.1);
      else if (t.feature === 'marsh') scatter('reed', 9, 0.75, 1.1);
      else if (t.elev < 2 && t.terrain === 'grass' && !t.improvement && hash(i, 5) < 0.35) scatter('tree', 1 + Math.floor(hash(i, 6) * 2), 0.7, 0.75, 0.35);
      else if (t.elev < 2 && t.terrain === 'tundra' && !t.improvement && hash(i, 5) < 0.3) scatter('pine', 1, 0.7, 0.85, 0.35);
      if (t.improvement && this.geo[t.improvement]) {
        const center = t.improvement === 'farm' || t.improvement === 'pasture' || t.improvement === 'plantation';
        items.push({ key: t.improvement, x: cx + (center ? 0 : -0.38), z: cz + (center ? 0 : -0.3), rot: center ? hash(i, 11) * 3.14 : 0.4, scale: 1, tint: 1 });
      }
      if (t.resource && this.geo[t.resource]) {
        const plantationRes = t.improvement === 'plantation';
        if (!plantationRes) items.push({ key: t.resource, x: cx + 0.36, z: cz + 0.34, rot: hash(i, 12) * 6.28, scale: 1.15, tint: 1 });
      }
      if (t.camp) items.push({ key: 'camp', x: cx, z: cz, rot: hash(i, 13) * 6.28, scale: 1, tint: 1 });
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
        const y = key === 'fish' ? 0.0 : f.ground(it.x, it.z) - 0.01;
        m.compose(p.set(it.x, y, it.z), q, sc.setScalar(it.scale));
        mesh.setMatrixAt(k, m);
        mesh.setColorAt(k, col.setScalar(it.tint));
      });
      mesh.castShadow = key !== 'farm' && key !== 'fish';
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.root.add(mesh);
    }
  }
}
