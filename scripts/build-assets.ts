// 外部モデル（KayKit Medieval Hexagon Pack, CC0）を、ゲーム用の軽量バイナリ src/assets/pack.bin に変換する。
//   使い方: npx tsx scripts/build-assets.ts <パックの Assets/gltf フォルダ>
// パック本体はリポジトリに含めない。変換結果（頂点位置・頂点カラー・インデックスのみ）だけを同梱する。
// パレット用テクスチャは変換時に頂点カラーへ焼き込むので、実行時にテクスチャは使わない。
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PNG } from 'pngjs';
import * as THREE from 'three';

const SRC = process.argv[2];
if (!SRC) { console.error('パックの Assets/gltf フォルダを指定してください'); process.exit(1); }

/** [出力名, gltf の相対パス, 陣営色の判定に使う別色版（任意）] */
const B = (n: string): [string, string, string] => [n, `buildings/blue/building_${n}_blue`, `buildings/red/building_${n}_red`];
const LIST: [string, string, string?][] = [
  B('home_A'), B('home_B'), B('castle'), B('church'), B('market'), B('tavern'), B('blacksmith'),
  B('tower_A'), B('well'), B('windmill'), B('mine'), B('lumbermill'),
  ['tree_A', 'decoration/nature/tree_single_A'], ['tree_B', 'decoration/nature/tree_single_B'],
  ['rock_A', 'decoration/nature/rock_single_A'], ['rock_C', 'decoration/nature/rock_single_C'], ['rock_E', 'decoration/nature/rock_single_E'],
  ['tent', 'decoration/props/tent'], ['barrel', 'decoration/props/barrel'], ['crate', 'decoration/props/crate_A_big'], ['sack', 'decoration/props/sack'],
  ['lumber', 'decoration/props/resource_lumber'], ['stone', 'decoration/props/resource_stone'], ['weaponrack', 'decoration/props/weaponrack'],
];

interface Raw { pos: number[]; uv: number[]; idx: number[] }

function load(rel: string): Raw {
  const dir = join(SRC, rel, '..');
  const j = JSON.parse(readFileSync(join(SRC, rel + '.gltf'), 'utf8'));
  const bufs: Buffer[] = j.buffers.map((b: { uri: string }) => readFileSync(join(dir, b.uri)));
  const acc = (i: number): number[] => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView];
    const n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as 'SCALAR']!;
    const size = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType as 5126]!;
    const stride = bv.byteStride ?? n * size;
    const base = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const buf = bufs[bv.buffer];
    const out: number[] = [];
    for (let k = 0; k < a.count; k++) {
      for (let c = 0; c < n; c++) {
        const o = base + k * stride + c * size;
        out.push(a.componentType === 5126 ? buf.readFloatLE(o) : a.componentType === 5123 ? buf.readUInt16LE(o) : a.componentType === 5125 ? buf.readUInt32LE(o) : buf.readUInt8(o));
      }
    }
    return out;
  };
  const raw: Raw = { pos: [], uv: [], idx: [] };
  const v = new THREE.Vector3();
  const walk = (ni: number, parent: THREE.Matrix4) => {
    const node = j.nodes[ni];
    const m = new THREE.Matrix4();
    if (node.matrix) m.fromArray(node.matrix);
    else m.compose(new THREE.Vector3(...(node.translation ?? [0, 0, 0])), new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])), new THREE.Vector3(...(node.scale ?? [1, 1, 1])));
    const world = parent.clone().multiply(m);
    if (node.mesh !== undefined) {
      for (const p of j.meshes[node.mesh].primitives) {
        const base = raw.pos.length / 3;
        const pos = acc(p.attributes.POSITION), uv = acc(p.attributes.TEXCOORD_0);
        for (let k = 0; k < pos.length; k += 3) { v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(world); raw.pos.push(v.x, v.y, v.z); }
        raw.uv.push(...uv);
        for (const i of acc(p.indices)) raw.idx.push(base + i);
      }
    }
    for (const c of node.children ?? []) walk(c, world);
  };
  for (const n of j.scenes[j.scene ?? 0].nodes) walk(n, new THREE.Matrix4());
  return raw;
}

const png = PNG.sync.read(readFileSync(join(SRC, 'buildings/blue/hexagons_medieval.png')));
const texel = (u: number, v: number): [number, number, number] => {
  const x = Math.min(png.width - 1, Math.max(0, Math.floor(u * png.width)));
  const y = Math.min(png.height - 1, Math.max(0, Math.floor(v * png.height)));
  const o = (y * png.width + x) * 4;
  return [png.data[o], png.data[o + 1], png.data[o + 2]];
};

const SCALE = 2000;
const header: { scale: number; models: { n: string; v: number; i: number; o: number }[] } = { scale: SCALE, models: [] };
const chunks: Buffer[] = [];
let offset = 0;
for (const [name, rel, alt] of LIST) {
  const a = load(rel);
  const b = alt ? load(alt) : null;
  const n = a.pos.length / 3;
  const col = Buffer.alloc(n * 4);
  const lums: number[] = [];
  for (let k = 0; k < n; k++) {
    const c = texel(a.uv[k * 2], a.uv[k * 2 + 1]);
    // 別色版と UV が違う頂点 = 陣営色で塗られた部分
    const team = !!b && b.uv.length === a.uv.length && (Math.abs(a.uv[k * 2] - b.uv[k * 2]) > 1e-4 || Math.abs(a.uv[k * 2 + 1] - b.uv[k * 2 + 1]) > 1e-4);
    col[k * 4] = c[0]; col[k * 4 + 1] = c[1]; col[k * 4 + 2] = c[2]; col[k * 4 + 3] = team ? 255 : 0;
    if (team) lums.push(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]);
  }
  const mean = lums.reduce((s, x) => s + x, 0) / Math.max(1, lums.length);
  for (let k = 0; k < n; k++) {
    if (!col[k * 4 + 3]) continue;
    // 陣営色の部分は「明るさの比」だけを残す（128 = 基準の明るさ）
    const l = 0.3 * col[k * 4] + 0.59 * col[k * 4 + 1] + 0.11 * col[k * 4 + 2];
    col[k * 4] = Math.max(40, Math.min(255, Math.round((l / mean) * 128)));
  }
  const pos = Buffer.alloc(n * 6);
  for (let k = 0; k < n * 3; k++) pos.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(a.pos[k] * SCALE))), k * 2);
  const idx = Buffer.alloc(a.idx.length * 2);
  if (n > 65535) throw new Error(name + ': 頂点が多すぎます');
  a.idx.forEach((v, k) => idx.writeUInt16LE(v, k * 2));
  const pad = Buffer.alloc((4 - ((pos.length + col.length + idx.length) % 4)) % 4);
  header.models.push({ n: name, v: n, i: a.idx.length, o: offset });
  chunks.push(pos, col, idx, pad);
  offset += pos.length + col.length + idx.length + pad.length;
  console.log(name.padEnd(18), `${n} 頂点 / ${a.idx.length / 3} 面 / 陣営色 ${lums.length}`);
}
let head = Buffer.from(JSON.stringify(header), 'utf8');
head = Buffer.concat([head, Buffer.alloc((4 - (head.length % 4)) % 4, 0x20)]);
const len = Buffer.alloc(4);
len.writeUInt32LE(head.length, 0);
const out = Buffer.concat([len, head, ...chunks]);
writeFileSync('src/assets/pack.bin', out);
console.log(`src/assets/pack.bin: ${(out.length / 1024).toFixed(0)} KB`);
