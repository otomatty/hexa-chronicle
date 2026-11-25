// 後処理：シーンを一度バッファに描き、深度から環境光の遮蔽（AO）を計算して重ねる。
// 近景ではミニチュア風の被写界深度（上下のぼかし）と、わずかな色調補正も行う。
import * as THREE from 'three';

const FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform vec2 uPx;
uniform mat4 uProjInv;
uniform float uProjScale;
uniform float uTilt;
uniform float uAo;
varying vec2 vUv;

vec3 viewPos(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  vec4 c = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  return c.xyz / c.w;
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  // 画面の上下をぼかす（ティルトシフト）
  float blur = smoothstep(0.3, 0.5, abs(vUv.y - 0.5)) * uTilt;
  if (blur > 0.01) {
    vec3 acc = col;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7853982 + 0.4;
      float r = (i - (i / 2) * 2 == 0) ? 2.0 : 4.2;
      acc += texture2D(tColor, vUv + vec2(cos(a), sin(a)) * uPx * blur * r).rgb;
    }
    col = acc / 9.0;
  }
  float d = texture2D(tDepth, vUv).x;
  if (d < 0.9999 && uAo > 0.0) {
    vec3 p = viewPos(vUv);
    vec3 n = normalize(cross(dFdx(p), dFdy(p)));
    const float RAD = 0.5;
    float sr = RAD * uProjScale / max(0.5, -p.z);
    float rot = ign(gl_FragCoord.xy) * 6.2831853;
    float occ = 0.0;
    for (int i = 0; i < 11; i++) {
      float fi = (float(i) + 0.5) / 11.0;
      float a = rot + fi * 15.7;
      vec2 o = vec2(cos(a), sin(a)) * sr * sqrt(fi);
      o.x *= uPx.x / uPx.y;
      vec3 v = viewPos(vUv + o) - p;
      float l2 = dot(v, v);
      occ += max(0.0, dot(n, v) * inversesqrt(l2 + 1e-5) - 0.14) / (1.0 + l2 / (RAD * RAD * 0.4));
    }
    float ao = clamp(1.0 - (occ / 11.0) * uAo, 0.0, 1.0);
    col *= mix(vec3(0.5, 0.53, 0.62), vec3(1.0), ao);
  }
  // 色調：わずかに彩度とコントラストを上げる
  float l = dot(col, vec3(0.3, 0.59, 0.11));
  col = mix(vec3(l), col, 0.97);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.12);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Post {
  private rt: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private size = new THREE.Vector2();

  constructor(renderer: THREE.WebGLRenderer, samples: number) {
    renderer.getDrawingBufferSize(this.size);
    this.rt = new THREE.WebGLRenderTarget(this.size.x, this.size.y, { samples, depthTexture: new THREE.DepthTexture(this.size.x, this.size.y) });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tColor: { value: this.rt.texture }, tDepth: { value: this.rt.depthTexture }, uPx: { value: new THREE.Vector2() },
        uProjInv: { value: new THREE.Matrix4() }, uProjScale: { value: 1 }, uTilt: { value: 0 }, uAo: { value: 1.5 },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: FRAG,
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    quad.frustumCulled = false;
    this.scene.add(quad);
    this.setSize(renderer);
  }

  setSize(renderer: THREE.WebGLRenderer): void {
    renderer.getDrawingBufferSize(this.size);
    this.rt.setSize(this.size.x, this.size.y);
    this.mat.uniforms.uPx.value.set(1 / this.size.x, 1 / this.size.y);
  }

  /** tilt: 0..1（近景ほど強いぼかし） */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera, tilt: number): void {
    const u = this.mat.uniforms;
    u.uProjInv.value.copy(camera.projectionMatrixInverse);
    u.uProjScale.value = camera.projectionMatrix.elements[5] * 0.5;
    u.uTilt.value = tilt;
    renderer.setRenderTarget(this.rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.cam);
  }

  dispose(): void {
    this.rt.depthTexture?.dispose();
    this.rt.dispose();
    this.mat.dispose();
  }
}
