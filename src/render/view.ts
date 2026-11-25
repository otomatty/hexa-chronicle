// 3Dビュー全体：レンダラー、カメラ操作、ユニット／都市の表示、ラベル、ピッキング、演出。
import * as THREE from 'three';
import { UNITS } from '../core/data';
import { cityAt, civAt, eraOf, isEmbarked, milAt } from '../core/game';
import { HEX, SQ3, worldToTile } from '../core/hex';
import type { GameEvent, GameState } from '../core/types';
import { Fx } from './fx';
import { planDistricts } from './districts';
import { cityGeometry, districtGeometry, unitGeometry } from './models';
import { hash } from './geo';
import { Props } from './props';
import { createMapTextures, PARCHMENT, patchMaterial, type MapTextures } from './shaders';
import { buildTerrain, buildWater, Field } from './terrain';

export type Quality = 'low' | 'medium' | 'high';
const QUALITY: Record<Quality, { subdiv: number; dpr: number; shadow: number }> = {
  low: { subdiv: 2, dpr: 1, shadow: 0 },
  medium: { subdiv: 3, dpr: 1.5, shadow: 1024 },
  high: { subdiv: 4, dpr: 2, shadow: 2048 },
};

const UNIT_SCALE = 1.3;

interface UnitView {
  mesh: THREE.Mesh;
  flag: HTMLDivElement;
  hp: HTMLElement;
  key: string;
  queue: THREE.Vector3[];
  seg: number;
  lunge: { dx: number; dz: number; t: number } | null;
  phase: number;
  hit: number;
  dying: number;
  tile: number;
}
interface CityView {
  mesh: THREE.Mesh;
  label: HTMLDivElement;
  sig: string;
  labelSig: string;
  pos: number;
  districts: THREE.Mesh[];
  districtSig: string;
}
interface Shot { mesh: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3; t: number; arc: number; heavy: boolean; done: () => void }
interface Emitter { x: number; y: number; z: number; tile: number; dark: boolean }

const ARROW_GEO = new THREE.BoxGeometry(0.018, 0.018, 0.3);
const BALL_GEO = new THREE.SphereGeometry(0.07, 7, 5);
const ARROW_MAT = new THREE.MeshBasicMaterial({ color: 0x5b4025 });
const BALL_MAT = new THREE.MeshBasicMaterial({ color: 0x2a2622 });

export interface ViewCallbacks {
  onTileClick(tile: number, button: number): void;
  onTileHover(tile: number, x: number, y: number): void;
  onUnitClick(unit: number): void;
  onCityClick(city: number): void;
  cityLabel(city: number): { text: string; sub: string };
}

const colorNum = (hex: string) => new THREE.Color(hex).getHex();

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly field: Field;
  readonly cam = { tx: 0, tz: 0, dist: 20, yaw: 0, gx: 0, gz: 0, gd: 20, gyaw: 0 };
  revealAll = false;
  selectedUnit = 0;

  private tex: MapTextures;
  private props: Props;
  private sun: THREE.DirectionalLight;
  private sunDir = new THREE.Vector3(-0.5, 0.78, -0.42).normalize();
  private units = new Map<number, UnitView>();
  private cities = new Map<number, CityView>();
  private shots: Shot[] = [];
  private fx = new Fx();
  private timers: { at: number; fn: () => void }[] = [];
  private emitters = new Map<number, Emitter[]>();
  private campEmitters: Emitter[] = [];
  private smokeClock = 0;
  private unitMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, flatShading: true });
  private cityMat: THREE.MeshStandardMaterial;
  private ringMesh: THREE.Mesh;
  private labels: HTMLDivElement;
  private highlights = new Map<number, number>();
  private state: GameState;
  private raf = 0;
  private last = performance.now();
  private keys = new Set<string>();
  private disposers: (() => void)[] = [];
  private mapW: number;
  private mapH: number;
  private v3 = new THREE.Vector3();

  constructor(private host: HTMLElement, s: GameState, private viewer: number, quality: Quality, private cb: ViewCallbacks) {
    const q = QUALITY[quality];
    this.state = s;
    this.mapW = s.w * SQ3 * HEX;
    this.mapH = s.h * 1.5 * HEX;
    this.renderer = new THREE.WebGLRenderer({ antialias: quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.shadowMap.enabled = q.shadow > 0;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    host.appendChild(this.renderer.domElement);
    this.labels = document.createElement('div');
    this.labels.className = 'labels';
    host.appendChild(this.labels);

    this.scene.background = new THREE.Color(PARCHMENT);
    this.scene.fog = new THREE.Fog(0xc9c2ad, 90, 260);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.5, 400);

    this.scene.add(new THREE.HemisphereLight(0xd8e8ff, 0x8f7f60, 1.55));
    // 影側が潰れないよう、太陽の反対側から弱い補助光を当てる
    const fill = new THREE.DirectionalLight(0xbfd4ff, 0.55);
    fill.position.set(0.6, 0.5, 0.7);
    this.scene.add(fill);
    this.sun = new THREE.DirectionalLight(0xffecd0, 2.5);
    if (q.shadow > 0) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(q.shadow, q.shadow);
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.03;
      this.sun.shadow.radius = 2.5;
    }
    this.scene.add(this.sun, this.sun.target);

    this.tex = createMapTextures(s.w, s.h);
    s.players.forEach((p, i) => {
      if (i >= 9) return;
      this.tex.uniforms.uPC.value[i].set(p.color);
      this.tex.uniforms.uPC2.value[i].set(p.color2);
    });
    patchMaterial(this.unitMat, this.tex.uniforms, false);
    for (let i = 0; i < s.tiles.length; i++) {
      const t = s.tiles[i];
      const water = t.terrain === 'ocean' || t.terrain === 'coast';
      this.tex.vis[i * 4 + 2] = water ? 0 : 255;
      this.tex.vis[i * 4 + 3] = t.terrain === 'coast' ? 255 : 0;
    }
    this.field = new Field(s);
    this.scene.add(buildTerrain(s, this.field, this.tex.uniforms, q.subdiv, quality !== 'low'));
    this.scene.add(buildWater(s, this.tex.uniforms, this.sunDir));
    this.props = new Props(this.field, this.tex.uniforms, quality !== 'low');
    this.scene.add(this.props.root);
    this.cityMat = patchMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }), this.tex.uniforms, false);

    this.ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.72, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.ringMesh.visible = false;
    this.ringMesh.renderOrder = 3;
    this.scene.add(this.fx.points);
    this.scene.add(this.ringMesh);

    this.bindInput();
    this.resize();
    this.sync(s);
    const loop = (now: number) => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.frame(dt);
    };
    this.raf = requestAnimationFrame(loop);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const d of this.disposers) d();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.labels.remove();
  }

  // ---------------------------------------------------------------- 入力
  private bindInput(): void {
    const el = this.renderer.domElement;
    const on = <K extends keyof HTMLElementEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.disposers.push(() => t.removeEventListener(type, fn as EventListener));
    };
    const ptrs = new Map<number, { x: number; y: number }>();
    let downX = 0, downY = 0, moved = false, button = 0, pinch = 0;
    on(el, 'pointerdown', (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 1) { downX = e.clientX; downY = e.clientY; moved = false; button = e.button; }
      else { moved = true; pinch = 0; }
    });
    on(el, 'pointermove', (e: PointerEvent) => {
      const p = ptrs.get(e.pointerId);
      if (!p) { this.hover(e.clientX, e.clientY); return; }
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch > 0) this.cam.gd = this.clampDist(this.cam.gd * (pinch / d));
        pinch = d;
        return;
      }
      if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > 6) moved = true;
      if (!moved) return;
      if (button === 1) { this.cam.gyaw -= dx * 0.006; return; }
      const k = (this.cam.dist * 1.25) / el.clientHeight;
      const c = Math.cos(this.cam.yaw), s = Math.sin(this.cam.yaw);
      this.cam.gx -= (dx * c + dy * s * 1.35) * k;
      this.cam.gz -= (-dx * s + dy * c * 1.35) * k;
      this.cam.tx = this.cam.gx; this.cam.tz = this.cam.gz;
      this.clampTarget();
    });
    const up = (e: PointerEvent) => {
      if (!ptrs.delete(e.pointerId)) return;
      if (!moved && ptrs.size === 0) this.cb.onTileClick(this.tileAt(e.clientX, e.clientY), button);
    };
    on(el, 'pointerup', up);
    on(el, 'pointercancel', (e: PointerEvent) => { ptrs.delete(e.pointerId); });
    on(el, 'pointerleave', () => { this.tex.uniforms.uHover.value.set(-1, -1); this.cb.onTileHover(-1, 0, 0); });
    on(el, 'contextmenu', (e: Event) => e.preventDefault());
    on(el, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      this.cam.gd = this.clampDist(this.cam.gd * Math.exp(e.deltaY * 0.0011));
    }, { passive: false });
    on(window, 'keydown', (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      this.keys.add(e.key.toLowerCase());
    });
    on(window, 'keyup', (e: KeyboardEvent) => { this.keys.delete(e.key.toLowerCase()); });
    on(window, 'blur', () => this.keys.clear());
    on(window, 'resize', () => this.resize());
  }

  private clampDist(d: number): number { return Math.min(48, Math.max(5.5, d)); }
  private clampTarget(): void {
    this.cam.gx = Math.min(this.mapW + 2, Math.max(-2, this.cam.gx));
    this.cam.gz = Math.min(this.mapH + 2, Math.max(-2, this.cam.gz));
  }

  private hover(x: number, y: number): void {
    const t = this.tileAt(x, y);
    if (t < 0) this.tex.uniforms.uHover.value.set(-1, -1);
    else this.tex.uniforms.uHover.value.set(t % this.state.w, (t / this.state.w) | 0);
    this.cb.onTileHover(t, x, y);
  }

  resize(): void {
    const w = this.host.clientWidth || window.innerWidth, h = this.host.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fx.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  /** 画面座標 → タイル。高さ場に対してレイを進めて求める */
  tileAt(clientX: number, clientY: number): number {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector3(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1, 0.5);
    ndc.unproject(this.camera);
    const o = this.camera.position, d = ndc.sub(o).normalize();
    if (d.y >= -0.01) return -1;
    let t = (2.4 - o.y) / d.y;
    if (t < 0) t = 0;
    const tEnd = (-0.05 - o.y) / d.y;
    let prev = t;
    const f = this.field;
    for (; t <= tEnd + 0.2; t += 0.12) {
      const x = o.x + d.x * t, z = o.z + d.z * t, y = o.y + d.y * t;
      if (y <= f.ground(x, z)) {
        let a = prev, b = t;
        for (let k = 0; k < 6; k++) {
          const m = (a + b) / 2;
          if (o.y + d.y * m <= f.ground(o.x + d.x * m, o.z + d.z * m)) b = m; else a = m;
        }
        return worldToTile(this.state.w, this.state.h, o.x + d.x * b, o.z + d.z * b);
      }
      prev = t;
    }
    return worldToTile(this.state.w, this.state.h, o.x + d.x * tEnd, o.z + d.z * tEnd);
  }

  focus(tile: number, instant = false): void {
    if (tile < 0) return;
    this.cam.gx = this.field.tx(tile);
    this.cam.gz = this.field.tz(tile);
    if (instant) { this.cam.tx = this.cam.gx; this.cam.tz = this.cam.gz; }
  }
  focusWorld(x: number, z: number): void { this.cam.gx = x; this.cam.gz = z; this.clampTarget(); }
  setGrid(on: boolean): void { this.tex.uniforms.uGrid.value = on ? 1 : 0; }

  setHighlights(h: Map<number, number>): void {
    this.highlights = h;
    this.writeTileTex();
  }

  private writeTileTex(): void {
    const s = this.state, d = this.tex.tile;
    for (let i = 0; i < s.tiles.length; i++) {
      d[i * 4] = s.tiles[i].owner + 1;
      d[i * 4 + 1] = this.highlights.get(i) ?? 0;
    }
    this.tex.uniforms.uTile.value.needsUpdate = true;
  }

  private visOf(i: number): number {
    return this.revealAll ? 2 : this.state.vis[this.viewer][i];
  }

  // ---------------------------------------------------------------- 状態の反映
  sync(s: GameState): void {
    this.state = s;
    const d = this.tex.vis;
    for (let i = 0; i < s.tiles.length; i++) {
      const v = this.visOf(i);
      d[i * 4] = v >= 1 ? 255 : 0;
      d[i * 4 + 1] = v === 2 ? 255 : 0;
    }
    this.tex.uniforms.uVis.value.needsUpdate = true;
    this.writeTileTex();
    this.props.sync(s);
    this.campEmitters = s.camps.map((c) => ({ x: this.field.tx(c.pos), y: this.field.tileGround(c.pos) + 0.12, z: this.field.tz(c.pos), tile: c.pos, dark: false }));
    this.syncCities(s);
    this.syncUnits(s);
  }

  private tilePos(i: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.set(this.field.tx(i), this.field.tileGround(i), this.field.tz(i));
  }

  /** ユニットの立ち位置。軍事と非戦闘が同じタイルにいるときは左右に分ける */
  private unitPos(s: GameState, id: number, tile: number, out = new THREE.Vector3()): THREE.Vector3 {
    const u = s.units[id];
    let dx = 0;
    if (u && u.pos === tile && milAt(s, tile) && civAt(s, tile)) dx = UNITS[u.type].civilian ? 0.34 : -0.34;
    else if (u && cityAt(s, tile)) dx = 0;
    const x = this.field.tx(tile) + dx, z = this.field.tz(tile) + (dx ? 0.12 : 0);
    return out.set(x, this.field.ground(x, z), z);
  }

  private syncCities(s: GameState): void {
    for (const [id, cv] of this.cities) {
      if (!s.cities[id]) { this.scene.remove(cv.mesh); cv.mesh.geometry.dispose(); cv.label.remove(); this.clearDistricts(cv, id); this.cities.delete(id); }
    }
    for (const id in s.cities) {
      const c = s.cities[id];
      const p = s.players[c.owner];
      const seen = this.visOf(c.pos) >= 1;
      let cv = this.cities.get(c.id);
      if (!seen) { if (cv) { cv.mesh.visible = false; cv.label.style.display = 'none'; this.clearDistricts(cv, c.id); cv.districtSig = ''; } continue; }
      const sig = [c.owner, Math.min(13, c.pop), eraOf(p), c.buildings.includes('walls'), c.capital].join(':');
      if (!cv) {
        const label = document.createElement('div');
        label.className = 'clabel';
        label.addEventListener('click', () => this.cb.onCityClick(c.id));
        this.labels.appendChild(label);
        const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.cityMat);
        mesh.castShadow = mesh.receiveShadow = true;
        this.tilePos(c.pos, mesh.position);
        this.scene.add(mesh);
        cv = { mesh, label, sig: '', labelSig: '', pos: c.pos, districts: [], districtSig: '' };
        this.cities.set(c.id, cv);
      }
      cv.mesh.visible = true;
      if (cv.sig !== sig) {
        cv.sig = sig;
        cv.mesh.geometry.dispose();
        cv.mesh.geometry = cityGeometry({
          pop: c.pop, era: eraOf(p), walls: c.buildings.includes('walls'), capital: c.capital,
          c1: colorNum(p.color), c2: colorNum(p.color2), seed: c.id,
        });
      }
      this.syncDistricts(s, c.id, cv);
      const info = this.cb.cityLabel(c.id);
      const labelSig = [c.owner, c.pop, c.hp, info.text, info.sub].join('|');
      if (cv.labelSig !== labelSig) {
        cv.labelSig = labelSig;
        cv.label.style.setProperty('--c', p.color);
        cv.label.style.setProperty('--c2', p.color2);
        cv.label.innerHTML = `<b>${c.pop}</b><span>${info.text}</span>${info.sub ? `<small>${info.sub}</small>` : ''}` +
          (c.hp < 200 ? `<i><u style="width:${Math.max(0, c.hp / 2)}%"></u></i>` : '');
      }
    }
  }

  private clearDistricts(cv: CityView, cityId: number): void {
    for (const m of cv.districts) { this.scene.remove(m); m.geometry.dispose(); }
    cv.districts = [];
    this.emitters.delete(cityId);
  }

  /** 建造物に応じた区域を、都市の隣の空きタイルに建てる（見た目のみ。タイルの産出には影響しない） */
  private syncDistricts(s: GameState, cityId: number, cv: CityView): void {
    const c = s.cities[cityId], p = s.players[c.owner];
    const era = eraOf(p);
    const plan = planDistricts(s, c);
    const sig = c.owner + ':' + era + ':' + plan.map((d) => d.kind + d.level + '@' + d.tile).join(',');
    if (sig === cv.districtSig) return;
    cv.districtSig = sig;
    this.clearDistricts(cv, cityId);
    const ems: Emitter[] = [];
    for (const d of plan) {
      const { geo, smoke } = districtGeometry(d.kind, d.level, era, colorNum(p.color), colorNum(p.color2));
      const mesh = new THREE.Mesh(geo, this.cityMat);
      mesh.castShadow = mesh.receiveShadow = true;
      if (d.kind === 'harbor') {
        // 岸（都市側）に寄せ、桟橋が沖へ伸びる向きに回す
        const cx = this.field.tx(c.pos), cz = this.field.tz(c.pos), tx = this.field.tx(d.tile), tz = this.field.tz(d.tile);
        mesh.position.set(cx + (tx - cx) * 0.6, 0, cz + (tz - cz) * 0.6);
        mesh.rotation.y = Math.atan2(tx - cx, tz - cz);
      } else {
        this.tilePos(d.tile, mesh.position);
        mesh.rotation.y = hash(cityId, d.tile + 3) * 6.28;
      }
      mesh.updateMatrixWorld();
      for (const sm of smoke) {
        const w = new THREE.Vector3(sm[0], sm[1], sm[2]).applyMatrix4(mesh.matrixWorld);
        ems.push({ x: w.x, y: w.y, z: w.z, tile: d.tile, dark: d.level >= 2 });
      }
      this.scene.add(mesh);
      cv.districts.push(mesh);
    }
    if (ems.length) this.emitters.set(cityId, ems);
  }

  private unitKey(s: GameState, id: number): string {
    const u = s.units[id];
    const model = isEmbarked(s, u) ? 'transport' : UNITS[u.type].model;
    return model + ':' + u.owner;
  }

  private makeUnit(s: GameState, id: number, at: number): UnitView {
    const u = s.units[id], p = s.players[u.owner];
    const key = this.unitKey(s, id);
    const mesh = new THREE.Mesh(unitGeometry(key.split(':')[0], colorNum(p.color), colorNum(p.color2)), this.unitMat);
    mesh.castShadow = true;
    mesh.scale.setScalar(UNIT_SCALE);
    this.unitPos(s, id, at, mesh.position);
    mesh.rotation.y = ((id * 2.399) % 6.28);
    this.scene.add(mesh);
    const flag = document.createElement('div');
    flag.className = 'uflag';
    flag.style.setProperty('--c', p.color);
    flag.style.setProperty('--c2', p.color2);
    flag.innerHTML = `<span>${UNITS[u.type].icon}</span><i><u></u></i>`;
    flag.addEventListener('click', (e) => { e.stopPropagation(); this.cb.onUnitClick(id); });
    this.labels.appendChild(flag);
    const uv: UnitView = { mesh, flag, hp: flag.querySelector('u')!, key, queue: [], seg: 0, lunge: null, phase: id * 1.7, hit: 0, dying: 0, tile: at };
    this.units.set(id, uv);
    return uv;
  }

  private dropUnit(id: number): void {
    const uv = this.units.get(id);
    if (!uv) return;
    this.scene.remove(uv.mesh);
    uv.flag.remove();
    this.units.delete(id);
  }

  private syncUnits(s: GameState): void {
    for (const [id, uv] of this.units) {
      const u = s.units[id];
      if (uv.dying > 0) continue;
      if (!u || (u.owner !== this.viewer && this.visOf(u.pos) !== 2)) this.dropUnit(id);
    }
    for (const id in s.units) {
      const u = s.units[id];
      if (u.owner !== this.viewer && this.visOf(u.pos) !== 2) continue;
      let uv = this.units.get(u.id);
      if (!uv) uv = this.makeUnit(s, u.id, u.pos);
      const key = this.unitKey(s, u.id);
      if (uv.key !== key) {
        uv.key = key;
        const p = s.players[u.owner];
        uv.mesh.geometry = unitGeometry(key.split(':')[0], colorNum(p.color), colorNum(p.color2));
        uv.flag.style.setProperty('--c', p.color);
        uv.flag.style.setProperty('--c2', p.color2);
      }
      uv.tile = u.pos;
      // 都市内のユニットは建物と重なるので旗だけ表示する
      uv.mesh.visible = !cityAt(s, u.pos) || uv.queue.length > 0;
      if (!uv.queue.length && !uv.lunge) this.unitPos(s, u.id, u.pos, uv.mesh.position);
      uv.hp.style.width = u.hp + '%';
      uv.hp.style.background = u.hp > 60 ? '#6fd36f' : u.hp > 30 ? '#e8c14a' : '#e0553f';
      uv.flag.classList.toggle('hurt', u.hp < 100);
      uv.flag.classList.toggle('spent', u.owner === this.viewer && u.moves <= 0);
      uv.flag.classList.toggle('idle', u.owner === this.viewer && (u.fortified > 0 || u.sleeping));
      uv.flag.classList.toggle('sel', u.id === this.selectedUnit);
    }
  }

  // ---------------------------------------------------------------- 演出
  playEvents(events: GameEvent[], s: GameState): void {
    for (const e of events) {
      if (e.type === 'move') {
        const u = s.units[e.unit];
        const mine = e.owner === this.viewer;
        const pts = mine ? e.path : e.path.filter((t) => this.visOf(t) === 2);
        if (!u || pts.length === 0) continue;
        let uv = this.units.get(e.unit);
        if (!uv) {
          if (!mine && this.visOf(u.pos) !== 2) continue;
          uv = this.makeUnit(s, e.unit, pts[0]);
        }
        for (const t of pts) uv.queue.push(this.unitPos(s, e.unit, t));
        uv.mesh.visible = true;
      } else if (e.type === 'attack') {
        const seen = this.visOf(e.to) === 2 || this.visOf(e.from) === 2;
        if (!seen) continue;
        const a = this.tilePos(e.from), b = this.tilePos(e.to);
        const uv = this.units.get(e.attacker);
        const atkType = s.units[e.attacker]?.type ?? uv?.key.split(':')[0] ?? '';
        const heavy = !!e.cityAttacker || /catapult|cannon|artillery|bombard|fieldcannon/.test(uv?.key ?? atkType);
        const onCity = !!cityAt(s, e.to);
        const impact = () => {
          const target = [...this.units.values()].find((x) => x.tile === e.to && x.dying === 0 && x.mesh.visible);
          if (target) target.hit = 0.35;
          if (heavy || onCity) this.fx.blast(b.x, b.y + 0.25, b.z); else this.fx.sparks(b.x, b.y + 0.35, b.z);
          this.fx.dust(b.x, b.y + 0.08, b.z, onCity ? 10 : 5);
          if (e.dmgDef > 0) this.floater(e.to, '-' + e.dmgDef, '#ff6a55');
          if (e.dmgAtk > 0) this.floater(e.from, '-' + e.dmgAtk, '#ffb04a');
        };
        if (e.ranged) {
          a.y += heavy ? 0.3 : 0.45; b.y += 0.3;
          if (heavy) this.fx.blast(a.x, a.y, a.z);
          const n = heavy ? 1 : 3;
          for (let k = 0; k < n; k++) {
            const mesh = new THREE.Mesh(heavy ? BALL_GEO : ARROW_GEO, heavy ? BALL_MAT : ARROW_MAT);
            const off = new THREE.Vector3((k - (n - 1) / 2) * 0.16, 0, (k % 2) * 0.1);
            this.scene.add(mesh);
            mesh.visible = false;
            const shot: Shot = { mesh, a: a.clone().add(off), b: b.clone().add(off), t: -k * 0.12, arc: heavy ? 1.3 : 0.8, heavy, done: k === n - 1 ? impact : () => {} };
            this.shots.push(shot);
          }
        } else {
          if (uv) {
            const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1;
            uv.lunge = { dx: dx / l, dz: dz / l, t: 0 };
          }
          this.later(110, impact);
        }
        if (uv && !uv.queue.length) uv.mesh.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      } else if (e.type === 'unitDied') {
        const uv = this.units.get(e.unit);
        if (uv) {
          uv.dying = 0.001;
          uv.flag.remove();
          this.later(160, () => this.fx.dust(uv.mesh.position.x, uv.mesh.position.y + 0.1, uv.mesh.position.z, 9));
        }
      } else if (e.type === 'cityFounded' && this.visOf(e.pos) === 2) {
        const p = this.tilePos(e.pos), pl = s.players[e.owner];
        this.fx.dust(p.x, p.y + 0.1, p.z, 16);
        this.fx.confetti(p.x, p.y + 0.5, p.z, [colorNum(pl.color), colorNum(pl.color2)]);
      } else if (e.type === 'cityCaptured' && this.visOf(e.pos) === 2) {
        const p = this.tilePos(e.pos), pl = s.players[e.to];
        this.fx.blast(p.x, p.y + 0.3, p.z);
        this.later(250, () => this.fx.confetti(p.x, p.y + 0.6, p.z, [colorNum(pl.color), colorNum(pl.color2)]));
      } else if (e.type === 'built' && e.item[0] === 'b' && s.cities[e.city] && this.visOf(s.cities[e.city].pos) === 2) {
        const p = this.tilePos(s.cities[e.city].pos);
        this.fx.dust(p.x, p.y + 0.15, p.z, 10);
      } else if (e.type === 'campCleared' && e.owner === this.viewer) {
        this.floater(e.pos, `+${e.gold} 💰`, '#ffd866');
      }
    }
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push({ at: performance.now() + ms, fn });
  }

  floater(tile: number, text: string, color: string): void {
    const p = this.tilePos(tile, this.v3);
    p.y += 0.7;
    p.project(this.camera);
    if (p.z > 1) return;
    const el = document.createElement('div');
    el.className = 'floater';
    el.textContent = text;
    el.style.color = color;
    el.style.left = ((p.x + 1) / 2) * this.host.clientWidth + 'px';
    el.style.top = ((1 - p.y) / 2) * this.host.clientHeight + 'px';
    this.labels.appendChild(el);
    setTimeout(() => el.remove(), 1000);
  }

  // ---------------------------------------------------------------- 毎フレーム
  private frame(dt: number): void {
    const c = this.cam, k = this.keys;
    // キーボードでのカメラ操作
    const pan = c.dist * 0.9 * dt;
    let mx = 0, mz = 0;
    if (k.has('w') || k.has('arrowup')) mz -= 1;
    if (k.has('s') || k.has('arrowdown')) mz += 1;
    if (k.has('a') || k.has('arrowleft')) mx -= 1;
    if (k.has('d') || k.has('arrowright')) mx += 1;
    if (mx || mz) {
      const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
      c.gx += (mx * cs + mz * sn) * pan;
      c.gz += (-mx * sn + mz * cs) * pan;
      this.clampTarget();
    }
    if (k.has('q')) c.gyaw += dt * 1.6;
    if (k.has('e')) c.gyaw -= dt * 1.6;
    const ease = 1 - Math.exp(-dt * 10);
    c.tx += (c.gx - c.tx) * ease; c.tz += (c.gz - c.tz) * ease;
    c.dist += (c.gd - c.dist) * ease; c.yaw += (c.gyaw - c.yaw) * ease;
    const tz = Math.min(1, Math.max(0, (c.dist - 7) / 34));
    const pitch = THREE.MathUtils.degToRad(40 + 27 * tz * (2 - tz));
    const hd = Math.cos(pitch) * c.dist, vd = Math.sin(pitch) * c.dist;
    this.camera.position.set(c.tx + Math.sin(c.yaw) * hd, vd, c.tz + Math.cos(c.yaw) * hd);
    this.camera.lookAt(c.tx, 0, c.tz);
    this.camera.updateMatrixWorld();

    if (this.sun.castShadow) {
      const r = Math.min(46, Math.max(12, c.dist * 0.85));
      const sc = this.sun.shadow.camera;
      sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 1; sc.far = 160;
      sc.updateProjectionMatrix();
    }
    this.sun.position.set(c.tx + this.sunDir.x * 70, this.sunDir.y * 70, c.tz + this.sunDir.z * 70);
    this.sun.target.position.set(c.tx, 0, c.tz);
    this.sun.target.updateMatrixWorld();

    this.tex.uniforms.uTime.value += dt;
    const time = this.tex.uniforms.uTime.value;

    // ユニットの移動・攻撃・消滅アニメーション
    for (const [id, uv] of this.units) {
      const m = uv.mesh;
      if (uv.dying > 0) {
        uv.dying += dt * 3.2;
        m.scale.setScalar(Math.max(0.01, 1 - uv.dying) * UNIT_SCALE);
        m.position.y -= dt * 0.25;
        m.rotation.z += dt * 2.2;
        if (uv.dying >= 1) this.dropUnit(id);
        continue;
      }
      // 歩行中は左右に揺らし、待機中はわずかに呼吸させる
      if (uv.queue.length) { uv.phase += dt * 15; m.rotation.z = Math.sin(uv.phase) * 0.07; m.rotation.x = 0.06; }
      else if (uv.hit > 0) { uv.hit -= dt; m.rotation.x = Math.sin(uv.hit * 55) * 0.2 * (uv.hit / 0.35); }
      else { m.rotation.z *= 0.8; m.rotation.x *= 0.8; m.scale.y = UNIT_SCALE * (1 + Math.sin(time * 2.1 + uv.phase) * 0.014); }
      if (uv.queue.length) {
        let step = dt * Math.max(7, uv.queue.length * 3.5);
        while (step > 0 && uv.queue.length) {
          const to = uv.queue[0];
          const dx = to.x - m.position.x, dy = to.y - m.position.y, dz = to.z - m.position.z;
          const l = Math.hypot(dx, dz);
          if (l > 0.001) m.rotation.y = Math.atan2(dx, dz);
          if (l <= step) { m.position.copy(to); uv.queue.shift(); step -= l; if (!uv.queue.length && cityAt(this.state, uv.tile)) m.visible = false; }
          else { m.position.x += (dx / l) * step; m.position.z += (dz / l) * step; m.position.y += dy * (step / l); step = 0; }
        }
      } else if (uv.lunge) {
        uv.lunge.t += dt * 4.5;
        const base = this.unitPos(this.state, id, uv.tile, this.v3);
        const o = Math.sin(Math.min(1, uv.lunge.t) * Math.PI) * 0.5;
        m.position.set(base.x + uv.lunge.dx * o, base.y, base.z + uv.lunge.dz * o);
        if (uv.lunge.t >= 1) uv.lunge = null;
      }
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      sh.t += dt * (sh.heavy ? 2.4 : 3.6);
      if (sh.t < 0) continue;
      const t = Math.min(1, sh.t);
      const prev = this.v3.copy(sh.mesh.position);
      sh.mesh.position.lerpVectors(sh.a, sh.b, t);
      sh.mesh.position.y += Math.sin(t * Math.PI) * sh.arc;
      if (sh.mesh.visible && !sh.heavy) sh.mesh.lookAt(sh.mesh.position.x * 2 - prev.x, sh.mesh.position.y * 2 - prev.y, sh.mesh.position.z * 2 - prev.z);
      sh.mesh.visible = true;
      if (sh.t >= 1) { this.scene.remove(sh.mesh); this.shots.splice(i, 1); sh.done(); }
    }
    // 予約した演出と、煙突・焚き火の煙
    const now = performance.now();
    for (let i = this.timers.length - 1; i >= 0; i--) {
      if (this.timers[i].at <= now) { const t = this.timers[i]; this.timers.splice(i, 1); t.fn(); }
    }
    this.smokeClock += dt;
    if (this.smokeClock > 0.28) {
      this.smokeClock = 0;
      const emit = (e: Emitter) => {
        if (this.visOf(e.tile) !== 2 || Math.abs(e.x - c.tx) + Math.abs(e.z - c.tz) > c.dist * 1.6 + 8) return;
        this.fx.smoke(e.x, e.y, e.z, e.dark);
      };
      for (const list of this.emitters.values()) list.forEach(emit);
      this.campEmitters.forEach(emit);
    }
    this.fx.update(dt);
    const sel = this.units.get(this.selectedUnit);
    this.ringMesh.visible = !!sel && sel.dying === 0;
    if (sel) {
      this.ringMesh.position.copy(sel.mesh.position);
      this.ringMesh.position.y += 0.06;
      this.ringMesh.scale.setScalar(1 + Math.sin(time * 5) * 0.05);
    }

    this.renderer.render(this.scene, this.camera);
    this.placeLabels();
  }

  private placeLabels(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight;
    const v = this.v3;
    const far = this.cam.dist > 36;
    this.labels.classList.toggle('far', far);
    const put = (el: HTMLElement, x: number, y: number, z: number) => {
      v.set(x, y, z).project(this.camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.15 || v.y > 1.15) { if (el.style.display !== 'none') el.style.display = 'none'; return; }
      if (el.style.display === 'none') el.style.display = '';
      el.style.transform = `translate(${(((v.x + 1) / 2) * w).toFixed(1)}px,${(((1 - v.y) / 2) * h).toFixed(1)}px) translate(-50%,-100%)`;
    };
    for (const uv of this.units.values()) {
      if (uv.dying > 0) continue;
      const p = uv.mesh.position;
      put(uv.flag, p.x, p.y + 0.82, p.z);
    }
    for (const cv of this.cities.values()) {
      if (!cv.mesh.visible) continue;
      const p = cv.mesh.position;
      put(cv.label, p.x, p.y + 1.5, p.z);
    }
  }
}
