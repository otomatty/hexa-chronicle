// 外部モデルパック（KayKit Medieval Hexagon Pack, CC0 / Kay Lousberg）の読み込み。
// scripts/build-assets.ts が作った pack.bin から、頂点カラー付きのジオメトリを取り出す。
// 読み込めなかった場合は hasPack() が false になり、呼び出し側は手続き生成のモデルにフォールバックする。
import * as THREE from 'three';

interface Entry { pos: Int16Array; col: Uint8Array; idx: Uint16Array }
const models = new Map<string, Entry>();
let scale = 2000;
let tried = false;

export async function loadPack(): Promise<boolean> {
  if (tried) return models.size > 0;
  tried = true;
  try {
    let buf: ArrayBuffer;
    if (import.meta.env.VITE_INLINE_PACK === '1') {
      // バイナリを配信できないホスティング向け：base64 で JS に埋め込んだものを展開する（npm run build:inline）
      const data = (await import('../assets/pack.b64.txt?raw')).default;
      const bin = atob(data.trim());
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      buf = bytes.buffer;
    } else {
      const url = (await import('../assets/pack.bin?url')).default;
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      buf = await res.arrayBuffer();
    }
    const headLen = new DataView(buf).getUint32(0, true);
    const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, headLen))) as { scale: number; models: { n: string; v: number; i: number; o: number }[] };
    scale = head.scale;
    const base = 4 + headLen;
    for (const m of head.models) {
      const o = base + m.o;
      models.set(m.n, {
        pos: new Int16Array(buf.slice(o, o + m.v * 6)),
        col: new Uint8Array(buf, o + m.v * 6, m.v * 4),
        idx: new Uint16Array(buf.slice(o + m.v * 10, o + m.v * 10 + m.i * 2)),
      });
    }
  } catch (e) {
    console.warn('モデルパックを読み込めませんでした。手続き生成のモデルで表示します。', e);
    models.clear();
  }
  return models.size > 0;
}

let enabled = true;
/** 画質「低」ではパックを使わず、軽い手続き生成モデルで描く */
export function setPackEnabled(on: boolean): void { enabled = on; }
export const hasPack = (): boolean => enabled && models.size > 0;

const c = new THREE.Color(), tc = new THREE.Color();

/**
 * パックのモデルを、位置・法線・頂点カラーを持つ非インデックスのジオメトリとして返す（merge() にそのまま渡せる）。
 * team: 屋根や旗など「陣営色」の部分を塗る色。size: 拡大率。
 */
export function packGeo(name: string, size = 1, team = 0x9a4a32): THREE.BufferGeometry {
  const m = models.get(name);
  if (!m) return new THREE.BufferGeometry();
  const n = m.idx.length;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  tc.setHex(team);
  const k = size / scale;
  for (let i = 0; i < n; i++) {
    const v = m.idx[i];
    pos[i * 3] = m.pos[v * 3] * k; pos[i * 3 + 1] = m.pos[v * 3 + 1] * k; pos[i * 3 + 2] = m.pos[v * 3 + 2] * k;
    if (m.col[v * 4 + 3]) {
      const shade = m.col[v * 4] / 128;
      col[i * 3] = tc.r * shade; col[i * 3 + 1] = tc.g * shade; col[i * 3 + 2] = tc.b * shade;
    } else {
      c.setRGB(m.col[v * 4] / 255, m.col[v * 4 + 1] / 255, m.col[v * 4 + 2] / 255, THREE.SRGBColorSpace);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
