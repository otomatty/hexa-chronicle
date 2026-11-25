// 後処理：シーンを一度バッファに描き、深度から環境光の遮蔽（AO）を計算して重ねる。
// AO は半分の解像度で計算してから合成時にぼかす（計測でここが最も重かったため）。
// 近景ではミニチュア風の被写界深度（上下のぼかし）と、わずかな色調補正も行う。
import * as THREE from 'three';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const AO_FRAG = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 uPx;
uniform vec4 uProj;   // x: 1/P00, y: 1/P11, z: near, w: far
uniform float uProjScale;
uniform float uAo;
varying vec2 vUv;

// 深度バッファの値からビュー空間の位置を復元する
vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float z = (uProj.z * uProj.w) / (uProj.w - d * (uProj.w - uProj.z));
  return vec3((uv * 2.0 - 1.0) * uProj.xy * z, -z);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  float d = texture2D(tDepth, vUv).x;
  if (d > 0.9999) { gl_FragColor = vec4(1.0); return; }
  vec3 p = viewPos(vUv);
  vec3 n = normalize(cross(dFdx(p), dFdy(p)));
  const float RAD = 0.5;
  float sr = RAD * uProjScale / max(0.5, -p.z);
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  float occ = 0.0;
  for (int i = 0; i < AO_N; i++) {
    float fi = (float(i) + 0.5) / float(AO_N);
    float a = rot + fi * 15.7;
    vec2 o = vec2(cos(a), sin(a)) * sr * sqrt(fi);
    o.x *= uPx.x / uPx.y;
    vec3 v = viewPos(vUv + o) - p;
    float l2 = dot(v, v);
    occ += max(0.0, dot(n, v) * inversesqrt(l2 + 1e-5) - 0.14) / (1.0 + l2 / (RAD * RAD * 0.4));
  }
  gl_FragColor = vec4(vec3(clamp(1.0 - (occ / float(AO_N)) * uAo, 0.0, 1.0)), 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tAo;
uniform vec2 uPx;
uniform float uTilt;
varying vec2 vUv;

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  // 画面の上下をぼかす（ティルトシフト）
  float blur = smoothstep(0.3, 0.5, abs(vUv.y - 0.5)) * uTilt;
  if (blur > 0.01) {
    vec3 acc = col;
    for (int i = 0; i < 6; i++) {
      float a = float(i) * 1.0471976 + 0.4;
      float r = (i - (i / 2) * 2 == 0) ? 2.2 : 4.2;
      acc += texture2D(tColor, vUv + vec2(cos(a), sin(a)) * uPx * blur * r).rgb;
    }
    col = acc / 7.0;
  }
  // 半解像度の AO を 4 点でぼかして重ねる
  vec2 o = uPx * 1.6;
  float ao = (texture2D(tAo, vUv + vec2(o.x, o.y)).r + texture2D(tAo, vUv + vec2(-o.x, o.y)).r
    + texture2D(tAo, vUv + vec2(o.x, -o.y)).r + texture2D(tAo, vUv + vec2(-o.x, -o.y)).r) * 0.25;
  col *= mix(vec3(0.5, 0.53, 0.62), vec3(1.0), ao);
  // 色調：わずかにコントラストを上げる
  float l = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(vec3(l), col, 0.97);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.12);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Post {
  private rt: THREE.WebGLRenderTarget;
  private aoRt: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private aoMat: THREE.ShaderMaterial;
  private size = new THREE.Vector2();

  constructor(renderer: THREE.WebGLRenderer, samples: number) {
    renderer.getDrawingBufferSize(this.size);
    this.rt = new THREE.WebGLRenderTarget(this.size.x, this.size.y, { samples, depthTexture: new THREE.DepthTexture(this.size.x, this.size.y) });
    this.aoRt = new THREE.WebGLRenderTarget(this.size.x >> 1, this.size.y >> 1, { depthBuffer: false });
    this.aoMat = new THREE.ShaderMaterial({
      defines: { AO_N: samples >= 4 ? 12 : 8 },
      uniforms: {
        tDepth: { value: this.rt.depthTexture }, uPx: { value: new THREE.Vector2() }, uProj: { value: new THREE.Vector4() },
        uProjScale: { value: 1 }, uAo: { value: 1.5 },
      },
      vertexShader: VERT, fragmentShader: AO_FRAG, depthTest: false, depthWrite: false,
    });
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: this.rt.texture }, tAo: { value: this.aoRt.texture }, uPx: { value: new THREE.Vector2() }, uTilt: { value: 0 } },
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this.setSize(renderer);
  }

  setSize(renderer: THREE.WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.size);
    this.rt.setSize(this.size.x, this.size.y);
    this.aoRt.setSize(Math.max(1, this.size.x >> 1), Math.max(1, this.size.y >> 1));
    this.mat.uniforms.uPx.value.set(1 / this.size.x, 1 / this.size.y);
    this.aoMat.uniforms.uPx.value.set(1 / this.size.x, 1 / this.size.y);
  }

  /** tilt: 0..1（近景ほど強いぼかし） */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, tilt: number): void {
    const e = camera.projectionMatrix.elements;
    this.aoMat.uniforms.uProj.value.set(1 / e[0], 1 / e[5], camera.near, camera.far);
    this.aoMat.uniforms.uProjScale.value = e[5] * 0.5;
    this.mat.uniforms.uTilt.value = tilt;
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, camera);
    this.quad.material = this.aoMat;
    renderer.setRenderTarget(this.aoRt);
    renderer.render(this.scene, this.cam);
    this.quad.material = this.mat;
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.cam);
  }

  dispose(): void {
    this.rt.depthTexture?.dispose();
    this.rt.dispose();
    this.aoRt.dispose();
    this.mat.dispose();
    this.aoMat.dispose();
  }
}
