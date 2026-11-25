// 六角グリッド・国境・ハイライト・戦場の霧・雲の影・地表のディテールを、
// ジオメトリを増やさずシェーダー内で描く。タイル情報は 2 枚の小さなデータテクスチャで渡す。
import * as THREE from 'three';

export interface MapUniforms {
  [k: string]: THREE.IUniform;
  uTile: { value: THREE.DataTexture };
  uVis: { value: THREE.DataTexture };
  uMap: { value: THREE.Vector2 };
  uPC: { value: THREE.Color[] };
  uPC2: { value: THREE.Color[] };
  uTime: { value: number };
  uHover: { value: THREE.Vector2 };
  uGrid: { value: number };
  uExposure: { value: number };
}

export interface MapTextures {
  uniforms: MapUniforms;
  /** RGBA: R=所有者+1, G=ハイライト種別 */
  tile: Uint8Array;
  /** RGBA: R=探索済み, G=視界内, B=陸, A=沿岸 */
  vis: Uint8Array;
}

/** 未探索領域（古地図風）の基調色。背景色にも使う */
export const PARCHMENT = 0xb59b72;

export function createMapTextures(w: number, h: number): MapTextures {
  const tile = new Uint8Array(w * h * 4);
  const vis = new Uint8Array(w * h * 4);
  const tt = new THREE.DataTexture(tile, w, h, THREE.RGBAFormat);
  tt.magFilter = tt.minFilter = THREE.NearestFilter;
  tt.needsUpdate = true;
  const vt = new THREE.DataTexture(vis, w, h, THREE.RGBAFormat);
  vt.magFilter = vt.minFilter = THREE.LinearFilter;
  vt.needsUpdate = true;
  const mk = () => Array.from({ length: 9 }, () => new THREE.Color(0x888888));
  return {
    tile, vis,
    uniforms: {
      uTile: { value: tt }, uVis: { value: vt }, uMap: { value: new THREE.Vector2(w, h) }, uPC: { value: mk() }, uPC2: { value: mk() },
      uTime: { value: 0 }, uHover: { value: new THREE.Vector2(-1, -1) }, uGrid: { value: 1 }, uExposure: { value: 0.66 },
    },
  };
}

export const HC_FRAG = /* glsl */ `
varying vec3 vHcPos;
uniform sampler2D uTile;
uniform sampler2D uVis;
uniform vec2 uMap;
uniform vec3 uPC[9];
uniform vec3 uPC2[9];
uniform float uTime;
uniform vec2 uHover;
uniform float uGrid;
uniform float uExposure;
#ifdef HC_TERRAIN
varying vec4 vMat;
#endif
const float HC_SQ3 = 1.7320508;

// トーンマッピング（ACES 近似）と sRGB 変換。レンダラー側の変換は使わず、
// どの描画先（画面／後処理用のバッファ）でも同じ色になるようシェーダー内で行う
vec3 hcTone(vec3 c) {
  c *= uExposure;
  c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float hcHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float hcN(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hcHash(i), hcHash(i + vec2(1.0, 0.0)), f.x), mix(hcHash(i + vec2(0.0, 1.0)), hcHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float hcFbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * hcN(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s / 0.9375;
}
// ゆっくり流れる雲の影
float hcCloud(vec2 p) {
  float c = hcFbm(p * 0.045 + vec2(uTime * 0.011, uTime * 0.006));
  return smoothstep(0.5, 0.72, c);
}
vec2 hcCellOf(vec2 c) {
  float row = floor(c.y / 1.5 + 0.5);
  float col = floor(c.x / HC_SQ3 - 0.5 * mod(row, 2.0) + 0.5);
  return vec2(col, row);
}
// xy: (列, 行)  zw: セル中心からのオフセット
vec4 hcCell(vec2 p) {
  vec2 s = vec2(HC_SQ3, 3.0);
  vec2 a = mod(p + s * 0.5, s) - s * 0.5;
  vec2 b = mod(p, s) - s * 0.5;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  return vec4(hcCellOf(p - g), g);
}
vec4 hcTile(vec2 cr) {
  if (cr.x < 0.0 || cr.y < 0.0 || cr.x >= uMap.x || cr.y >= uMap.y) return vec4(0.0);
  return texture2D(uTile, (cr + 0.5) / uMap);
}
vec4 hcVisRow(float x, float row) {
  float u = (x / HC_SQ3 - 0.5 * mod(row, 2.0) + 0.5) / uMap.x;
  return texture2D(uVis, vec2(u, (clamp(row, 0.0, uMap.y - 1.0) + 0.5) / uMap.y));
}
// 行ごとに半タイルずれる六角配置を、行単位の線形補間でなめらかに読む
vec4 hcVis(vec2 p) {
  float rf = p.y / 1.5;
  float r0 = floor(rf);
  float t = smoothstep(0.0, 1.0, rf - r0);
  return mix(hcVisRow(p.x, r0), hcVisRow(p.x, r0 + 1.0), t);
}
vec3 hcOverlay(vec3 base, vec2 p, float gridAmt) {
  vec4 c = hcCell(p);
  vec2 g = c.zw;
  vec2 ag = abs(g);
  vec2 sg = vec2(g.x < 0.0 ? -1.0 : 1.0, g.y < 0.0 ? -1.0 : 1.0);
  float d1 = 0.8660254 - ag.x;
  float d2 = 0.8660254 - (ag.x * 0.5 + ag.y * 0.8660254);
  float ed = min(d1, d2);
  float aa = fwidth(ed) * 1.2 + 0.003;
  vec4 t = hcTile(c.xy);
  float owner = floor(t.r * 255.0 + 0.5);
  float line = 1.0 - smoothstep(0.005, 0.005 + aa, ed);
  base = mix(base, base * 0.55, line * gridAmt * 0.42);
  if (owner > 0.5) {
    vec2 ctr = p - g;
    float o1 = floor(hcTile(hcCellOf(ctr + vec2(sg.x, 0.0) * HC_SQ3)).r * 255.0 + 0.5);
    float o2 = floor(hcTile(hcCellOf(ctr + vec2(0.5 * sg.x, 0.8660254 * sg.y) * HC_SQ3)).r * 255.0 + 0.5);
    float db = 9.0;
    if (o1 != owner) db = min(db, d1);
    if (o2 != owner) db = min(db, d2);
    if (db < 1.0) {
      float steep = 1.0 - smoothstep(0.55, 1.0, vHcPos.y);
      vec3 pc = uPC[int(owner) - 1];
      vec3 pc2 = uPC2[int(owner) - 1];
      float glow = 1.0 - smoothstep(0.08, 0.5, db);
      float outer = 1.0 - smoothstep(0.052, 0.052 + aa, db);
      float inner = smoothstep(0.066, 0.066 + aa, db) * (1.0 - smoothstep(0.092, 0.092 + aa, db));
      base = mix(base, pc, glow * glow * 0.36 * steep);
      base = mix(base, pc2, inner * 0.9 * steep);
      base = mix(base, pc * 1.08 + 0.02, outer * steep);
    }
  }
  float code = floor(t.g * 255.0 + 0.5);
  if (code > 0.5) {
    vec3 hc = code < 1.5 ? vec3(0.35, 0.72, 1.0) : code < 2.5 ? vec3(1.0, 0.16, 0.12) : code < 3.5 ? vec3(1.0, 0.88, 0.45) : vec3(0.3, 1.0, 0.75);
    float rim = 1.0 - smoothstep(0.03, 0.085, ed);
    float pulse = 0.5 + 0.5 * sin(uTime * 4.0);
    float fill = code < 1.5 ? 0.07 : code < 2.5 ? 0.28 + 0.16 * pulse : code < 3.5 ? 0.08 + 0.06 * pulse : 0.3;
    float rimAmt = code < 1.5 ? 0.42 : 0.65;
    base = mix(base, hc, min(1.0, fill + rim * rimAmt));
  }
  if (c.x == uHover.x && c.y == uHover.y) {
    float rim = 1.0 - smoothstep(0.03, 0.09, ed);
    base = mix(base, vec3(1.0), rim * 0.75 + 0.05);
  }
  return base;
}
// 未探索領域は古地図の紙として描く
vec3 hcParchment(vec2 p) {
  float n = hcFbm(p * 0.21 + 3.1);
  float f = hcN(p * 5.0);
  vec3 c = mix(vec3(0.79, 0.69, 0.52), vec3(0.6, 0.5, 0.35), smoothstep(0.3, 0.78, n));
  c *= 0.93 + 0.09 * f;
  vec2 ag = abs(hcCell(p).zw);
  float ed = 0.8660254 - max(ag.x, ag.x * 0.5 + ag.y * 0.8660254);
  c *= 1.0 - 0.12 * (1.0 - smoothstep(0.0, 0.028, ed));
  return c;
}
vec3 hcFog(vec3 col, vec2 p) {
  vec4 v = hcVis(p);
  float wob = (hcN(p * 1.9) - 0.5) * 0.32 * step(0.02, v.r) * step(v.r, 0.98);
  float e = smoothstep(0.28, 0.62, v.r + wob);
  float vis = smoothstep(0.15, 0.8, v.g);
  float lum = dot(col, vec3(0.3, 0.59, 0.11));
  vec3 sepia = vec3(lum) * vec3(1.03, 0.93, 0.76);
  vec3 paper = hcParchment(p);
  // 視界外は、地図に描き込まれた絵のように紙の色へ寄せる
  vec3 dim = mix(mix(sepia, col, 0.32) * 0.85 + vec3(0.05, 0.04, 0.025), paper, 0.42);
  col = mix(dim, col, vis);
  return mix(paper, col, e);
}
`;

const HC_VERT_DECL = 'varying vec3 vHcPos;';
const HC_VERT_MAIN = /* glsl */ `
  vec4 hcW = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  hcW = instanceMatrix * hcW;
  #endif
  vHcPos = (modelMatrix * hcW).xyz;
`;

// 地表のピクセル単位のディテール（色むらと疑似的な凹凸）
const HC_TERRAIN_COLOR = /* glsl */ `
  #ifdef HC_DETAIL
  {
    vec2 q = vHcPos.xz;
    float land = step(0.0, vHcPos.y);
    float big = hcFbm(q * 0.55);
    float dn = hcFbm(q * 2.3);
    float fine = hcN(q * 27.0);
    vec3 c = diffuseColor.rgb;
    // 草地：黄緑と深緑のまだら + 細かな草目
    float gr = vMat.x * land;
    float blades = hcN(vec2(q.x * 64.0 + q.y * 9.0, q.y * 15.0));
    vec3 grassC = c * mix(vec3(0.84, 0.95, 0.78), vec3(1.08, 1.05, 0.9), big) * (0.86 + 0.22 * blades * fine + 0.1 * dn);
    // 砂：風紋
    float sd = vMat.y;
    float rip = sin((q.x * 0.8 + q.y * 0.6) * 44.0 + hcFbm(q * 1.4) * 9.0);
    vec3 sandC = c * (0.94 + 0.06 * rip * land + 0.12 * (dn - 0.5)) * mix(vec3(0.97), vec3(1.07, 0.99, 0.88), big);
    // 雪：青みのある陰影ときらめき
    vec3 snowC = mix(c * vec3(0.84, 0.91, 1.02), c * 1.05, smoothstep(0.3, 0.7, dn));
    snowC += step(0.988, hcHash(floor(q * 95.0))) * 0.3;
    // 岩：地層と割れ目
    float strata = sin(vHcPos.y * 34.0 + hcFbm(q * 3.0) * 7.0);
    float crack = 1.0 - smoothstep(0.0, 0.07, abs(hcN(q * 7.0) - 0.5));
    vec3 rockC = c * (0.9 + 0.1 * strata) * (1.0 - 0.32 * crack) * (0.82 + 0.36 * dn);
    float wsum = gr + sd + vMat.z + vMat.w + 0.0001;
    vec3 generic = c * (0.78 + 0.44 * dn) * (0.94 + 0.12 * fine * land);
    vec3 tex = (grassC * gr + sandC * sd + snowC * vMat.z + rockC * vMat.w) / wsum;
    diffuseColor.rgb = mix(generic, tex, clamp(wsum, 0.0, 1.0));
  }
  #endif
  diffuseColor.rgb = hcOverlay(diffuseColor.rgb, vHcPos.xz, uGrid);
`;
// 建物：壁に窓、屋根に瓦の段、石畳に目地を描く
const HC_BUILDING_COLOR = /* glsl */ `
  #ifdef HC_DETAIL
  {
    vec3 wn = normalize(cross(dFdx(vHcPos), dFdy(vHcPos)));
    vec3 c = diffuseColor.rgb;
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
    if (abs(wn.y) < 0.35) {
      #ifdef HC_WINDOWS
      vec2 tdir = normalize(vec2(-wn.z, wn.x) + 1e-5);
      float u = dot(vHcPos.xz, tdir) * 27.0;
      float v = vHcPos.y * 31.0;
      vec2 f = fract(vec2(u, v));
      float win = step(0.3, f.x) * step(f.x, 0.72) * step(0.3, f.y) * step(f.y, 0.78);
      float lit = step(0.72, hcHash(floor(vec2(u, v)) + 3.0));
      float wallish = smoothstep(0.2, 0.42, lum) * (1.0 - smoothstep(0.12, 0.26, sat));
      vec3 wc = mix(vec3(0.08, 0.1, 0.15), vec3(1.0, 0.8, 0.42), lit * 0.5);
      c *= 0.9 + 0.16 * hcN(vec2(u, v) * 1.7);
      c = mix(c, wc, win * wallish * 0.78);
      #endif
    } else {
      float flat_ = smoothstep(0.9, 0.98, abs(wn.y));
      // 屋根：斜面に沿った瓦の段
      float rows = smoothstep(0.0, 0.25, fract(vHcPos.y * 75.0));
      c *= mix(0.82 + 0.18 * rows, 1.0, flat_);
      // 石畳：ずらした目地
      vec2 g = vHcPos.xz * 21.0;
      g.x += step(1.0, mod(g.y, 2.0)) * 0.5;
      vec2 gf = fract(g);
      float mortar = 1.0 - step(0.09, gf.x) * step(0.09, gf.y);
      float stone = 0.88 + 0.2 * hcHash(floor(g));
      c *= mix(1.0, stone * (1.0 - 0.22 * mortar), flat_ * (1.0 - smoothstep(0.1, 0.3, sat)));
    }
    diffuseColor.rgb = c;
  }
  #endif
`;
const HC_PROP_COLOR = /* glsl */ `
  #ifdef HC_DETAIL
  diffuseColor.rgb *= 0.86 + 0.28 * hcN(vHcPos.xz * 33.0 + vHcPos.y * 21.0);
  #endif
`;
const HC_TERRAIN_NORMAL = /* glsl */ `
  #ifdef HC_DETAIL
  {
    float be = 0.045;
    vec2 bp = vHcPos.xz * 4.6;
    float b0 = hcFbm(bp);
    float bx = hcFbm(bp + vec2(be * 4.6, 0.0));
    float bz = hcFbm(bp + vec2(0.0, be * 4.6));
    float bs = (vHcPos.y > 0.0 ? 0.045 : 0.01) + vMat.w * 0.09 + vMat.y * 0.02;
    vec3 wn = vec3(b0 - bx, 0.0, b0 - bz) * (bs / be);
    normal = normalize(normal + (viewMatrix * vec4(wn, 0.0)).xyz);
  }
  #endif
`;

export type PatchKind = 'terrain' | 'prop' | 'building' | 'paved' | 'unit';

/**
 * 標準マテリアルに、雲の影・戦場の霧・トーンマッピングと、種類ごとの質感
 * （地表のテクスチャ／建物の窓や瓦／植生の色むら）を差し込む。
 */
export function patchMaterial<T extends THREE.Material>(mat: T, uniforms: MapUniforms, kind: PatchKind, detail = false): T {
  const terrain = kind === 'terrain';
  mat.defines = { ...(mat.defines ?? {}), ...(detail ? { HC_DETAIL: '' } : {}), ...(terrain ? { HC_TERRAIN: '' } : {}), ...(kind === 'building' ? { HC_WINDOWS: '' } : {}) };
  const color = terrain ? HC_TERRAIN_COLOR : kind === 'building' || kind === 'paved' ? HC_BUILDING_COLOR : kind === 'prop' ? HC_PROP_COLOR : '';
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + HC_VERT_DECL + (terrain ? '\nattribute vec4 aMat;\nvarying vec4 vMat;' : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + HC_VERT_MAIN + (terrain ? '\nvMat = aMat;' : ''));
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + HC_FRAG)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + color + '\ndiffuseColor.rgb *= 1.0 - 0.3 * hcCloud(vHcPos.xz);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + (terrain ? HC_TERRAIN_NORMAL : ''))
      .replace('#include <tonemapping_fragment>', 'gl_FragColor.rgb = hcTone(gl_FragColor.rgb);')
      .replace('#include <colorspace_fragment>', '')
      // 未探索の場所では立体物を描かない（古地図の上に影絵が浮かないように）
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + (terrain ? '' : 'if (hcVis(vHcPos.xz).r < 0.3) discard;\n') + 'gl_FragColor.rgb = hcFog(gl_FragColor.rgb, vHcPos.xz);');
  };
  mat.customProgramCacheKey = () => 'hc:' + kind + (detail ? 1 : 0);
  return mat;
}

export const WATER_VERT = /* glsl */ `
varying vec3 vHcPos;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vHcPos = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

export const WATER_FRAG = /* glsl */ `
${HC_FRAG}
uniform vec3 uSun;
float wHeight(vec2 p) {
  float t = uTime;
  return sin(p.x * 1.9 + t * 1.1) * 0.3 + sin(p.y * 2.3 - t * 0.9) * 0.26 + sin((p.x + p.y) * 3.7 + t * 1.6) * 0.16
    + hcN(p * 3.0 + t * 0.25) * 0.5 + hcN(p * 9.0 - t * 0.4) * 0.16;
}
void main() {
  vec2 p = vHcPos.xz;
  vec4 m = hcVis(p);
  float shallow = clamp(max(m.b * 1.7, m.a * 0.62), 0.0, 1.0);
  float big = hcFbm(p * 0.12 + 7.0);
  vec3 deep = mix(vec3(0.01, 0.06, 0.17), vec3(0.015, 0.1, 0.24), big);
  vec3 mid = vec3(0.02, 0.22, 0.36);
  vec3 turq = vec3(0.08, 0.52, 0.53);
  vec3 col = mix(deep, mid, smoothstep(0.0, 0.5, shallow));
  col = mix(col, turq, smoothstep(0.45, 1.0, shallow));
  // 内陸の川は少し深い青緑に寄せる
  float inland = smoothstep(0.78, 0.98, m.b);
  col = mix(col, vec3(0.035, 0.22, 0.4), inland * 0.9);
  // 浅瀬のコースティクス
  float ca = hcN(p * 4.3 + vec2(uTime * 0.35, 0.0)) * hcN(p * 5.1 - vec2(0.0, uTime * 0.3));
  col += vec3(0.25, 0.4, 0.35) * smoothstep(0.28, 0.6, ca) * smoothstep(0.35, 0.9, shallow) * 0.5 * (1.0 - inland * 0.75);
  float e = 0.06;
  float h0 = wHeight(p);
  vec3 n = normalize(vec3(h0 - wHeight(p + vec2(e, 0.0)), 1.5, h0 - wHeight(p + vec2(0.0, e))));
  vec3 V = normalize(cameraPosition - vHcPos);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  col = mix(col, vec3(0.45, 0.63, 0.84), fres * 0.42);
  float diff = max(dot(n, uSun), 0.0);
  col *= 0.62 + 0.5 * diff;
  float spec = pow(max(dot(reflect(-uSun, n), V), 0.0), 150.0);
  col += vec3(1.0, 0.95, 0.85) * spec * 0.7;
  float foamBand = smoothstep(0.26, 0.4, m.b) * (1.0 - smoothstep(0.5, 0.62, m.b));
  float foam = foamBand * smoothstep(0.35, 0.8, 0.5 + 0.5 * sin(m.b * 34.0 - uTime * 1.4 + hcN(p * 2.5) * 5.0));
  col = mix(col, vec3(0.95), foam * 0.75);
  col *= 1.0 - 0.3 * hcCloud(p);
  col = hcOverlay(col, p, uGrid * (0.35 + 0.65 * smoothstep(0.1, 0.5, shallow)));
  gl_FragColor = vec4(col, mix(mix(0.94, 0.6, smoothstep(0.5, 1.0, shallow)), 0.92, inland));
  gl_FragColor.rgb = hcTone(gl_FragColor.rgb);
  gl_FragColor.rgb = hcFog(gl_FragColor.rgb, p);
  gl_FragColor.a = mix(1.0, gl_FragColor.a, smoothstep(0.28, 0.62, m.r));
}`;
