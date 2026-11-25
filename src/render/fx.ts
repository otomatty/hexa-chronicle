// 火花・土煙・煙・紙吹雪などの粒子エフェクト。1 つの Points（1 ドローコール）で全粒子を描く。
import * as THREE from 'three';

const MAX = 1200;

export interface Burst {
  count: number;
  colors: number[];
  /** 水平方向の初速 */
  speed: number;
  /** 上方向の初速 */
  up: number;
  life: number;
  size: number;
  gravity: number;
  /** 寿命の間にどれだけ大きくなるか（1 で変化なし） */
  grow?: number;
  spread?: number;
  alpha?: number;
}

export class Fx {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 4);
  private size = new Float32Array(MAX);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private grav = new Float32Array(MAX);
  private size0 = new Float32Array(MAX);
  private grow = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private next = 0;
  /** 生きている粒子があるか（無ければ更新もバッファ転送もしない） */
  live = false;
  private geo = new THREE.BufferGeometry();
  private mat: THREE.ShaderMaterial;
  private tmp = new THREE.Color();

  constructor(exposure: { value: number }) {
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 }, uExposure: exposure },
      vertexShader: /* glsl */ `
        attribute vec4 aColor;
        attribute float aSize;
        uniform float uScale;
        varying vec4 vColor;
        void main() {
          vColor = aColor;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(0.1, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying vec4 vColor;
        uniform float uExposure;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          float a = vColor.a * (1.0 - smoothstep(0.28, 0.5, d));
          if (a < 0.01) discard;
          vec3 c = vColor.rgb * uExposure;
          c = clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
          gl_FragColor = vec4(pow(c, vec3(1.0 / 2.2)), a);
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(this.geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  /** 画面の高さと視野角から、粒子の見かけの大きさの係数を決める */
  setViewport(height: number, fovDeg: number): void {
    this.mat.uniforms.uScale.value = height / (2 * Math.tan((fovDeg * Math.PI) / 360));
  }

  burst(x: number, y: number, z: number, b: Burst): void {
    this.live = true;
    for (let k = 0; k < b.count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      const a = Math.random() * Math.PI * 2, sp = b.speed * (0.4 + Math.random() * 0.6), jit = b.spread ?? 0.05;
      this.pos[i * 3] = x + (Math.random() - 0.5) * jit;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * jit;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * jit;
      this.vel[i * 3] = Math.cos(a) * sp;
      this.vel[i * 3 + 1] = b.up * (0.6 + Math.random() * 0.6);
      this.vel[i * 3 + 2] = Math.sin(a) * sp;
      this.tmp.set(b.colors[Math.floor(Math.random() * b.colors.length)]);
      this.col[i * 4] = this.tmp.r; this.col[i * 4 + 1] = this.tmp.g; this.col[i * 4 + 2] = this.tmp.b;
      this.life[i] = this.maxLife[i] = b.life * (0.7 + Math.random() * 0.5);
      this.grav[i] = b.gravity;
      this.size0[i] = b.size * (0.7 + Math.random() * 0.6);
      this.grow[i] = b.grow ?? 1;
      this.alpha[i] = b.alpha ?? 1;
    }
  }

  // --- よく使う演出
  sparks(x: number, y: number, z: number): void {
    this.burst(x, y, z, { count: 12, colors: [0xfff2b0, 0xffd27a, 0xffffff], speed: 2.4, up: 1.6, life: 0.35, size: 0.07, gravity: 7 });
  }
  dust(x: number, y: number, z: number, n = 8): void {
    this.burst(x, y, z, { count: n, colors: [0xcbb994, 0xb5a27c, 0xd9cdb0], speed: 0.8, up: 0.5, life: 0.8, size: 0.2, gravity: -0.1, grow: 2.2, alpha: 0.6, spread: 0.25 });
  }
  blast(x: number, y: number, z: number): void {
    this.burst(x, y, z, { count: 10, colors: [0xffb347, 0xff7a2e, 0xffe08a], speed: 1.6, up: 1.4, life: 0.4, size: 0.16, gravity: 2 });
    this.burst(x, y, z, { count: 7, colors: [0x4a4642, 0x6a645e, 0x35312e], speed: 0.6, up: 0.9, life: 1.3, size: 0.24, gravity: -0.3, grow: 2.4, alpha: 0.65, spread: 0.2 });
  }
  smoke(x: number, y: number, z: number, dark = false): void {
    this.burst(x, y, z, { count: 1, colors: dark ? [0x4f4a46, 0x625c57] : [0xc9c5bf, 0xb0aca6], speed: 0.08, up: 0.42, life: 2.6, size: 0.14, gravity: -0.05, grow: 3, alpha: 0.5, spread: 0.03 });
  }
  confetti(x: number, y: number, z: number, colors: number[]): void {
    this.burst(x, y, z, { count: 36, colors: [...colors, 0xffffff, 0xffe08a], speed: 1.5, up: 3.6, life: 1.5, size: 0.08, gravity: 4.5, spread: 0.3 });
  }

  update(dt: number): void {
    if (!this.live) return;
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      any = true;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      const drag = 1 - Math.min(1, dt * 1.5);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.size0[i] * (1 + (this.grow[i] - 1) * (1 - t));
      this.col[i * 4 + 3] = this.alpha[i] * Math.min(1, t * 2.5);
    }
    this.live = any;
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
}
