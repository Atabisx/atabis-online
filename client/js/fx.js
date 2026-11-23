// Beceri ve vuruş efektleri (Metin2 tarzı): parlak parçacıklar, kılıç izi yayları, büyü çemberleri,
// şimşek, alev sütunları, mermi izleri ve buff süresince karakterde kalan auralar.
// Bütün parçacıklar tek bir çizim çağrısında çizilir; telefonda da akıcı kalsın diye.
import * as THREE from 'three';

let scene = null, camera = null, renderer = null;
const FACE = { value: 0 };   // game.js'deki FACE_OFFSET

// ---------- parçacık sistemi ----------
const MAXP = 2400;
const P = {
  n: 0,
  pos: new Float32Array(MAXP * 3), col: new Float32Array(MAXP * 3), size: new Float32Array(MAXP), alpha: new Float32Array(MAXP),
  vel: new Float32Array(MAXP * 3), life: new Float32Array(MAXP), max: new Float32Array(MAXP), s0: new Float32Array(MAXP),
  grow: new Float32Array(MAXP), grav: new Float32Array(MAXP), drag: new Float32Array(MAXP), a0: new Float32Array(MAXP),
};
let points = null, pmat = null;
const tmpC = new THREE.Color();

// ---------- ustalık renkleri: M1 mavi, M2 mor, M3 kızıl ----------
// Beceri M seviyesindeyken o becerinin bütün parçacık ve ışıkları bu renge boyanır.
export const MASTERY = [null, { color: '#2fa8ff', k: 1.15 }, { color: '#b44dff', k: 1.3 }, { color: '#ff1f1f', k: 1.45 }];
export const masteryOf = (lv) => (lv > 17 ? Math.min(3, lv - 17) : 0);
let TINT = null;   // { h, s } ya da null
const _hsl = {}, _tc = new THREE.Color();
const tintCache = new Map();
function tc(col) {
  if (!TINT || col == null) return col;
  if (Array.isArray(col)) return col.map(tc);
  const key = TINT.key + col;
  const hit = tintCache.get(key); if (hit) return hit;
  _tc.set(col); _tc.getHSL(_hsl);
  if (_hsl.s < 0.14 && _hsl.l > 0.82) _tc.setHSL(TINT.h, 0.55, 0.86);          // beyaz çekirdekler açık tonda kalır
  else _tc.setHSL(TINT.h, Math.max(0.8, TINT.s), Math.min(0.68, Math.max(0.3, _hsl.l)));
  const out = '#' + _tc.getHexString(); tintCache.set(key, out); return out;
}
function setTint(color) {
  if (!color) { TINT = null; return; }
  _tc.set(color); _tc.getHSL(_hsl); TINT = { h: _hsl.h, s: _hsl.s, key: color };
}
// ertelenen işler (setTimeout) o anki rengi korur
function later(fn, ms) {
  const t = TINT;
  setTimeout(() => { const o = TINT; TINT = t; try { fn(); } finally { TINT = o; } }, ms);
}

function makePoints() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(P.col, 3));
  geo.setAttribute('psize', new THREE.BufferAttribute(P.size, 1));
  geo.setAttribute('palpha', new THREE.BufferAttribute(P.alpha, 1));
  pmat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 }, uBright: { value: 0 } },
    vertexShader: `
      attribute vec3 pcolor; attribute float psize; attribute float palpha;
      uniform float uScale; varying vec3 vC; varying float vA;
      void main() {
        vC = pcolor; vA = palpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = min(256.0, psize * uScale / max(0.1, -mv.z));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vA; uniform float uBright;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = clamp(1.0 - r, 0.0, 1.0); a *= a;
        float core = pow(a, 4.0);
        if (uBright > 0.5) gl_FragColor = vec4(vC * (0.8 + core * 0.6), min(1.0, sqrt(a) * vA * 1.2));
        else gl_FragColor = vec4(vC * (a + core * 1.5), a * vA);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  points = new THREE.Points(geo, pmat);
  points.frustumCulled = false;
  points.renderOrder = 10;
  return points;
}

// tek parçacık
export function emit(x, y, z, o = {}) {
  if (P.n >= MAXP) return;
  const i = P.n++;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y + groundFn(x, z); P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = o.vx || 0; P.vel[i * 3 + 1] = o.vy || 0; P.vel[i * 3 + 2] = o.vz || 0;
  tmpC.set(tc(o.color) || '#ffffff');
  P.col[i * 3] = tmpC.r; P.col[i * 3 + 1] = tmpC.g; P.col[i * 3 + 2] = tmpC.b;
  P.s0[i] = o.size || 0.3; P.size[i] = P.s0[i];
  P.life[i] = 0; P.max[i] = o.life || 0.6;
  P.grow[i] = o.grow || 0; P.grav[i] = o.gravity || 0; P.drag[i] = o.drag || 0;
  P.a0[i] = o.alpha == null ? 1 : o.alpha; P.alpha[i] = P.a0[i];
}
function killP(i) {
  const j = --P.n;
  if (i === j) return;
  for (const arr of [P.pos, P.col, P.vel]) { arr[i * 3] = arr[j * 3]; arr[i * 3 + 1] = arr[j * 3 + 1]; arr[i * 3 + 2] = arr[j * 3 + 2]; }
  for (const arr of [P.size, P.alpha, P.life, P.max, P.s0, P.grow, P.grav, P.drag, P.a0]) arr[i] = arr[j];
}
function updateParticles(dt) {
  for (let i = P.n - 1; i >= 0; i--) {
    P.life[i] += dt;
    const k = P.life[i] / P.max[i];
    if (k >= 1) { killP(i); continue; }
    const d = Math.max(0, 1 - P.drag[i] * dt);
    P.vel[i * 3] *= d; P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * d - P.grav[i] * dt; P.vel[i * 3 + 2] *= d;
    P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
    if (P.pos[i * 3 + 1] < 0.03) { P.pos[i * 3 + 1] = 0.03; P.vel[i * 3 + 1] *= -0.3; }
    P.size[i] = P.s0[i] * (1 + P.grow[i] * k);
    // hızlı belirip yavaş sönme
    P.alpha[i] = P.a0[i] * Math.min(1, k * 12) * (1 - k) * (1 - k * 0.3);
  }
  const g = points.geometry;
  g.setDrawRange(0, P.n);
  for (const name of ['position', 'pcolor', 'psize', 'palpha']) g.attributes[name].needsUpdate = true;
}

// ---------- kalıcı olmayan mesh efektleri ----------
const effects = [];
// zemin yüksekliği (adalı/arenalı haritalarda yer düz değil): efektler zemine oturur
let groundFn = () => 0;
export function setGround(fn) { groundFn = fn || (() => 0); }
function addFx(obj, dur, update, opts = {}) {
  // efekt kendi x/z'sini her karede değiştirebilir; yükseklik, sarmalayan grupla ayrıca verilir
  let lift = null;
  if (obj) { lift = new THREE.Group(); lift.add(obj); lift.position.y = groundFn(obj.position.x, obj.position.z); scene.add(lift); }
  const e = { obj, lift, t: 0, dur, update, follow: opts.follow, onEnd: opts.onEnd, tint: TINT };
  effects.push(e);
  return e;
}
function disposeObj(o) {
  o.traverse((c) => {
    if (c.geometry && !(c.geometry.userData && c.geometry.userData.shared)) c.geometry.dispose();
    if (c.material && !(c.material.userData && c.material.userData.shared)) c.material.dispose();
  });
}
// karlı/çöl gibi açık renkli haritalarda toplamalı (additive) ışık beyaza döner ve renkler kaybolur:
// orada normal karışım kullanılır, böylece mavi, mor, kızıl efektler zeminde seçilir.
let BRIGHT = false;
const add = () => ({ transparent: true, depthWrite: false, blending: BRIGHT ? THREE.NormalBlending : THREE.AdditiveBlending, side: THREE.DoubleSide });
export function setBright(on) {
  BRIGHT = !!on;
  if (pmat) { pmat.blending = BRIGHT ? THREE.NormalBlending : THREE.AdditiveBlending; pmat.uniforms.uBright.value = BRIGHT ? 1 : 0; pmat.needsUpdate = true; }
}

// paylaşılan dokular
const texCache = {};
function radialTex() {
  if (texCache.radial) return texCache.radial;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return (texCache.radial = new THREE.CanvasTexture(c));
}
// büyü çemberi: iç içe halkalar, rün çentikleri ve yıldız
function circleTex() {
  if (texCache.circle) return texCache.circle;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.translate(S / 2, S / 2); g.strokeStyle = '#fff'; g.fillStyle = '#fff';
  g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 120, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 104, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(0, 0, 60, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 24; i++) { g.save(); g.rotate(i / 24 * Math.PI * 2); g.fillRect(-2, -118, 4, i % 2 ? 10 : 16); g.restore(); }
  for (let i = 0; i < 8; i++) { g.save(); g.rotate(i / 8 * Math.PI * 2); g.beginPath(); g.arc(0, -82, 9, 0, Math.PI * 2); g.stroke(); g.restore(); }
  g.lineWidth = 3; g.beginPath();
  for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI * 2 * 2 - Math.PI / 2; const px = Math.cos(a) * 100, py = Math.sin(a) * 100; i ? g.lineTo(px, py) : g.moveTo(px, py); }
  g.stroke();
  return (texCache.circle = new THREE.CanvasTexture(c));
}
// dikey solma: sütunlar için
function columnTex() {
  if (texCache.col) return texCache.col;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 64, 0, 0);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 4, 64);
  return (texCache.col = new THREE.CanvasTexture(c));
}

// ---------- yapı taşları ----------
const rnd = (a, b) => a + Math.random() * (b - a);
function burst(x, y, z, color, n, speed, o = {}) {
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2, ph = o.flat ? rnd(-0.2, 0.25) : Math.acos(rnd(-1, 1));
    const s = speed * rnd(0.4, 1);
    emit(x, y, z, { vx: Math.cos(th) * Math.sin(ph) * s, vy: Math.cos(ph) * s * (o.flat ? 0.3 : 1) + (o.up || 0), vz: Math.sin(th) * Math.sin(ph) * s,
      color: Array.isArray(color) ? color[i % color.length] : color, size: (o.size || 0.3) * rnd(0.6, 1.3), life: (o.life || 0.6) * rnd(0.6, 1.2),
      gravity: o.gravity || 0, drag: o.drag == null ? 2 : o.drag, grow: o.grow || 0 });
  }
}
// yere yayılan şok dalgası (iki halka + parlama)
function shockwave(x, z, r, color, dur = 0.55, o = {}) {
  color = tc(color);
  const g = new THREE.Group(); g.position.set(x, o.y || 0.12, z);
  const m1 = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color, ...add() }));
  const m2 = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', ...add() }));
  const flash = new THREE.Mesh(new THREE.CircleGeometry(1, 32), new THREE.MeshBasicMaterial({ color, map: radialTex(), ...add() }));
  for (const m of [m1, m2, flash]) { m.rotation.x = -Math.PI / 2; g.add(m); }
  addFx(g, dur, (k) => {
    const e = 1 - Math.pow(1 - k, 3);
    const s = 0.2 + e * r; m1.scale.setScalar(s); m2.scale.setScalar(s * 0.92);
    flash.scale.setScalar(r * (0.4 + e * 0.6));
    m1.material.opacity = 0.95 * (1 - k); m2.material.opacity = 0.7 * (1 - k); flash.material.opacity = 0.6 * (1 - k) * (1 - k);
  });
}
// dönen büyü çemberi (zeminde); follow verilirse karakterin altında kalır
function magicCircle(x, z, r, color, dur, o = {}) {
  color = tc(color);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ color, map: circleTex(), ...add() }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, o.y || 0.08, z);
  return addFx(m, dur, (k, dt, e) => {
    if (e.follow) m.position.set(e.follow.x, o.y || 0.08, e.follow.z);
    m.rotation.z += dt * (o.spin || 1.6);
    // süreye göre (kalıcı auralarda dur çok uzun olduğu için oran değil saniye kullanılır)
    const inK = Math.min(1, e.t * 5), outK = Math.min(1, Math.max(0, e.dur - e.t) * 3);
    m.scale.setScalar(r * (0.6 + 0.4 * inK));
    m.material.opacity = (o.alpha || 0.9) * inK * outK;
  }, { follow: o.follow });
}
// ışık sütunu
function pillar(x, z, color, h, dur, o = {}) {
  color = tc(color);
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(o.r || 0.9, (o.r || 0.9) * 1.25, h, 20, 1, true), new THREE.MeshBasicMaterial({ color, map: columnTex(), ...add() }));
  const inner = new THREE.Mesh(new THREE.CylinderGeometry((o.r || 0.9) * 0.4, (o.r || 0.9) * 0.55, h * 1.1, 12, 1, true), new THREE.MeshBasicMaterial({ color: '#ffffff', map: columnTex(), ...add() }));
  outer.position.y = h / 2; inner.position.y = h * 0.55;
  g.add(outer, inner);
  addFx(g, dur, (k, dt, e) => {
    if (e.follow) g.position.set(e.follow.x, 0, e.follow.z);
    const up = Math.min(1, k * 5);
    g.scale.set(1 + k * 0.35, up, 1 + k * 0.35);
    outer.material.opacity = 0.8 * (1 - k); inner.material.opacity = 0.9 * (1 - k) * (1 - k);
    outer.rotation.y += dt * 2;
  }, { follow: o.follow });
}
// ---------- yere çakılma: çatlaklar, toz halkası, uçuşan taşlar, ekran sarsıntısı ----------
let shakeFn = null;
export function onShake(fn) { shakeFn = fn; }
export function groundSlam(x, z, color, r = 3, power = 1) {
  color = tc(color);
  // yarıklar: merkezden dışa koyu çizgiler
  const g = new THREE.Group(); g.position.set(x, 0.05, z);
  const crackMat = new THREE.MeshBasicMaterial({ color: '#1a120c', transparent: true, opacity: 0.85, depthWrite: false });
  const glowMat = new THREE.MeshBasicMaterial({ color, ...add() });
  const n = 7 + Math.round(power * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rnd(-0.2, 0.2), len = r * rnd(0.55, 1.0);
    for (const [m, w, y] of [[crackMat, 0.14, 0], [glowMat, 0.06, 0.01]]) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(w, len), m);
      c.rotation.x = -Math.PI / 2; c.rotation.z = -a; c.position.set(Math.sin(a) * len / 2, y, Math.cos(a) * len / 2);
      g.add(c);
    }
  }
  addFx(g, 1.4, (k) => { crackMat.opacity = 0.85 * (1 - k * k); glowMat.opacity = 0.9 * Math.max(0, 1 - k * 2.2); g.scale.setScalar(Math.min(1, k * 8)); });
  shockwave(x, z, r * 1.3, color, 0.5); shockwave(x, z, r * 0.8, '#ffffff', 0.3);
  burst(x, 0.3, z, ['#8a7a66', '#6b5a44', '#b8a98e'], Math.round(26 * power), 7, { up: 5, size: 0.35, life: 0.9, gravity: 16 });
  for (let i = 0; i < 18; i++) { const a = Math.random() * Math.PI * 2; emit(x + Math.cos(a) * r * 0.5, 0.25, z + Math.sin(a) * r * 0.5, { vx: Math.cos(a) * 5, vy: 0.4, vz: Math.sin(a) * 5, color: '#c9b48a', size: 0.9, life: 0.8, drag: 3, grow: 1.6, alpha: 0.5 }); }
  flash(x, 0.6, z, color, 40 * power, 0.35);
  if (shakeFn) shakeFn(0.35 * power, 0.35, x, z);
}
// buz kalıbı: hedefi saran kristaller; süre bitince kırılır
export function iceBlock(follow, sec, scale = 1) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#bfeaff', emissive: '#4fb8ff', emissiveIntensity: 0.35, transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.2, depthWrite: false });
  for (let i = 0; i < 9; i++) {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.35, 0), mat);
    const a = (i / 9) * Math.PI * 2, rr = 0.45 + (i % 3) * 0.12;
    c.scale.set(0.9, 2.2 + (i % 4) * 0.4, 0.9);
    c.position.set(Math.cos(a) * rr, 0.7 + (i % 3) * 0.25, Math.sin(a) * rr);
    c.rotation.set(rnd(-0.3, 0.3), a, rnd(-0.3, 0.3));
    g.add(c);
  }
  g.scale.setScalar(scale);
  const e = addFx(g, sec, (k, dt, ee) => {
    if (ee.follow) g.position.set(ee.follow.x, 0, ee.follow.z);
    g.scale.setScalar(scale * Math.min(1, ee.t * 6));
  }, { follow, onEnd: () => {
    const p = follow || g.position;
    burst(p.x, 1.0, p.z, ['#bfeaff', '#ffffff', '#4fb8ff'], 34, 6, { size: 0.28, life: 0.6, gravity: 10 });
  } });
  burst((follow || g.position).x, 1, (follow || g.position).z, ['#ffffff', '#bfeaff'], 20, 4, { size: 0.2, life: 0.4 });
  return e;
}
// sersemleme: başın üstünde dönen yıldızlar
export function stunStars(follow, sec, h = 2.2) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicMaterial({ color: '#ffe066', ...add() });
  for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), m); st.position.set(Math.cos(i * Math.PI / 2) * 0.45, 0, Math.sin(i * Math.PI / 2) * 0.45); g.add(st); }
  addFx(g, sec, (k, dt, e) => { if (e.follow) g.position.set(e.follow.x, h + Math.sin(e.t * 6) * 0.05, e.follow.z); g.rotation.y += dt * 6; m.opacity = Math.min(1, (e.dur - e.t) * 4); }, { follow });
}
// duman bulutu (ninja ışınlanması, kaçış)
export function smokePuff(x, z, color = '#3a2f4a', n = 26) {
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2; emit(x + Math.cos(a) * 0.3, rnd(0.2, 1.6), z + Math.sin(a) * 0.3, { vx: Math.cos(a) * rnd(1, 3), vy: rnd(0.2, 1), vz: Math.sin(a) * rnd(1, 3), color: Math.random() < 0.3 ? '#8a7dff' : color, size: rnd(0.6, 1.0), life: 0.8, drag: 3, grow: 1.8, alpha: 0.7 }); }
}
// kılıç izi yayı: önde parlak, arkaya doğru sönen hilal
function arcGeo(r0, r1, len, seg = 28) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, a = t * len, w = Math.sin(t * Math.PI);   // ortası kalın, uçları ince
    const ri = r1 - (r1 - r0) * w;
    pos.push(Math.sin(a) * ri, 0, Math.cos(a) * ri, Math.sin(a) * r1, 0, Math.cos(a) * r1);
    const b = Math.pow(t, 1.6);
    // toplamalı karışımda koyu = görünmez; normal karışımda (açık zemin) sönme saydamlıkla yapılır
    if (BRIGHT) col.push(1, 1, 1, b, 1, 1, 1, b); else col.push(b, b, b, b, b, b);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, BRIGHT ? 4 : 3));
  g.setIndex(idx);
  return g;
}
function slashArc(x, y, z, facing, r, color, dur, o = {}) {
  color = tc(color);
  const g = new THREE.Group(); g.position.set(x, y, z);
  const tilt = new THREE.Group(); tilt.rotation.z = o.tilt || 0; g.add(tilt);
  const spin = new THREE.Group(); tilt.add(spin);
  const len = o.len || 2.4;
  const mat = new THREE.MeshBasicMaterial({ color, vertexColors: true, ...add() });
  const m = new THREE.Mesh(arcGeo(r * 0.55, r, len), mat);
  const core = new THREE.Mesh(arcGeo(r * 0.85, r * 0.97, len), new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, ...add() }));
  spin.add(m, core);
  const start = facing - len / 2 - (o.sweep || 1.4) / 2;
  addFx(g, dur, (k, dt, e) => {
    if (e.follow) g.position.set(e.follow.x, y, e.follow.z);
    spin.rotation.y = start + (o.sweep || 1.4) * (1 - Math.pow(1 - k, 2)) + (o.spinRate || 0) * k;
    g.scale.setScalar(0.85 + k * 0.3);
    mat.opacity = 1 - k; core.material.opacity = (1 - k) * 0.9;
  }, { follow: o.follow });
}
// dallanan şimşek
function boltPath(a, b, segs, jitter) {
  const pts = [a.clone()];
  for (let i = 1; i < segs; i++) {
    const t = i / segs, p = a.clone().lerp(b, t);
    p.x += rnd(-jitter, jitter); p.y += rnd(-jitter, jitter) * 0.7; p.z += rnd(-jitter, jitter);
    pts.push(p);
  }
  pts.push(b.clone());
  return pts;
}
function lightning(from, to, color, dur = 0.4) {
  color = tc(color);
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, ...add() }), matW = new THREE.MeshBasicMaterial({ color: '#ffffff', ...add() });
  function build() {
    while (g.children.length) { const c = g.children.pop(); c.geometry.dispose(); }
    const a = new THREE.Vector3(from.x, from.y, from.z), b = new THREE.Vector3(to.x, to.y, to.z);
    const len = a.distanceTo(b);
    const main = boltPath(a, b, Math.max(6, Math.round(len * 1.5)), Math.min(0.6, len * 0.08));
    const branches = [main];
    for (let i = 0; i < 2; i++) {
      const s = main[1 + Math.floor(Math.random() * (main.length - 2))];
      const dir = b.clone().sub(a).normalize().multiplyScalar(len * 0.3);
      const end = s.clone().add(dir).add(new THREE.Vector3(rnd(-1, 1), rnd(-0.8, 0.4), rnd(-1, 1)));
      branches.push(boltPath(s, end, 4, 0.3));
    }
    branches.forEach((pts, bi) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i], p1 = pts[i + 1], l = p0.distanceTo(p1);
        for (const [w, m] of [[bi ? 0.07 : 0.14, mat], [bi ? 0.03 : 0.05, matW]]) {
          const seg = new THREE.Mesh(new THREE.BoxGeometry(w, w, l), m);
          seg.position.copy(p0).lerp(p1, 0.5); seg.lookAt(p1);
          g.add(seg);
        }
      }
    });
  }
  build();
  let rebuilt = false;
  addFx(g, dur, (k) => {
    if (!rebuilt && k > 0.45) { rebuilt = true; build(); }
    mat.opacity = 1 - k * 0.8; matW.opacity = 1 - k;
  }, { onEnd: () => { mat.dispose(); matW.dispose(); } });
  burst(to.x, to.y, to.z, [color, '#ffffff'], 14, 5, { size: 0.25, life: 0.35 });
}
// mermi: parlak baş + iz; varınca onHit
function projectile(from, to, color, o = {}) {
  color = tc(color);
  const head = new THREE.Mesh(new THREE.SphereGeometry(o.r || 0.18, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', ...add() }));
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color, map: radialTex(), ...add() }));
  glow.scale.setScalar((o.r || 0.18) * 7);
  const g = new THREE.Group(); g.add(head, glow);
  const a = new THREE.Vector3(from.x, from.y, from.z), b = new THREE.Vector3(to.x, to.y, to.z);
  const dist = a.distanceTo(b), dur = Math.max(0.08, dist / (o.speed || 28));
  g.position.copy(a);
  addFx(g, dur, (k) => {
    const p = a.clone().lerp(b, k);
    if (o.arc) p.y += Math.sin(k * Math.PI) * o.arc;
    g.position.copy(p);
    if (camera) glow.quaternion.copy(camera.quaternion);
    for (let i = 0; i < (o.trail || 3); i++) emit(p.x + rnd(-0.05, 0.05), p.y + rnd(-0.05, 0.05), p.z + rnd(-0.05, 0.05), { color, size: (o.r || 0.18) * 2.2, life: o.trailLife || 0.35, drag: 3 });
  }, { onEnd: () => o.onHit && o.onHit(b) });
}
// yerden yükselen alevler
function flames(x, z, color, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, r = (o.r || 0.6) * Math.sqrt(Math.random());
    emit(x + Math.cos(a) * r, 0.1 + Math.random() * 0.3, z + Math.sin(a) * r, { vx: rnd(-0.4, 0.4), vy: rnd(2.5, 5) * (o.power || 1), vz: rnd(-0.4, 0.4),
      color: Array.isArray(color) ? color[i % color.length] : color, size: rnd(0.35, 0.7) * (o.size || 1), life: rnd(0.45, 0.85), drag: 1.5, grow: -0.6 });
  }
}
// zamanla tekrar eden iş (alev sütunu, hançer yağmuru…)
function repeat(times, every, fn) {
  let i = 0;
  addFx(null, times * every, (k, dt, e) => { while (i < times && e.t >= i * every) fn(i++); });
}
// karakteri saran dönen yaylar ve yükselen girdap
function whirl(follow, color, dur, r) {
  for (let i = 0; i < 3; i++) slashArc(follow.x, 0.6 + i * 0.45, follow.z, i * 2.1, r * (1 - i * 0.12), color, dur, { len: 2.6, sweep: 0, spinRate: 18 + i * 4, follow });
  repeat(Math.round(dur / 0.04), 0.04, () => {
    const a = Math.random() * Math.PI * 2, rr = r * rnd(0.5, 1);
    emit(follow.x + Math.cos(a) * rr, rnd(0.2, 1.8), follow.z + Math.sin(a) * rr, { vx: -Math.sin(a) * 6, vy: 1.5, vz: Math.cos(a) * 6, color, size: 0.25, life: 0.4, drag: 4 });
  });
}
// buff kalkanı: karakteri saran saydam küre
function bubble(follow, color, dur) {
  color = tc(color);
  const m = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16), new THREE.MeshBasicMaterial({ color, ...add(), side: THREE.FrontSide }));
  addFx(m, dur, (k, dt, e) => {
    m.position.set(e.follow.x, 1.0, e.follow.z);
    const s = k < 0.15 ? k / 0.15 : 1; m.scale.set(s, s * 1.15, s);
    m.material.opacity = 0.35 * (1 - k) + Math.sin(e.t * 12) * 0.05;
  }, { follow });
}

// ---------- kalıcı auralar (buff süresince) ----------
const auras = [];
export function addAura(obj, color, seconds, kind) {
  for (const a of auras) if (a.obj === obj && a.kind === kind) { a.until = performance.now() + seconds * 1000; return; }
  const circle = magicCircle(obj.group.position.x, obj.group.position.z, 1.1, color, 1e9, { follow: obj.group.position, alpha: 0.45, spin: 0.8, y: 0.06 });
  auras.push({ obj, color, kind, until: performance.now() + seconds * 1000, circle, acc: 0 });
}
function updateAuras(dt, alive) {
  const now = performance.now();
  for (let i = auras.length - 1; i >= 0; i--) {
    const a = auras[i];
    if (now > a.until || !alive(a.obj)) { a.circle.dur = a.circle.t + 0.3; auras.splice(i, 1); continue; }
    a.acc += dt;
    while (a.acc > 0.09) {
      a.acc -= 0.09;
      const p = a.obj.group.position, ang = Math.random() * Math.PI * 2;
      emit(p.x + Math.cos(ang) * 0.55, rnd(0.1, 0.6), p.z + Math.sin(ang) * 0.55, { vy: rnd(1, 2), color: a.color, size: 0.18, life: 0.9, drag: 0.5 });
    }
  }
}

// ---------- dışa açık ----------
export function initFx(sc, cam, rend, faceOffset) {
  scene = sc; camera = cam; renderer = rend; FACE.value = faceOffset || 0;
  scene.add(makePoints());
  // beceri parlamaları için iki nokta ışık (sayı sabit kalsın diye baştan eklenir; sönükken ışık vermez)
  for (let i = 0; i < 2; i++) { const L = new THREE.PointLight('#ffffff', 0, 18, 1.4); L.userData.fxLight = true; scene.add(L); lights.push(L); }
}
export function updateFx(dt, alive = () => true) {
  if (!points) return;
  if (renderer && camera) {
    const h = renderer.domElement ? renderer.domElement.height : 800;
    pmat.uniforms.uScale.value = h / (2 * Math.tan((camera.fov || 50) * Math.PI / 360));
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.t += dt;
    const k = Math.min(1, e.t / e.dur);
    TINT = e.tint;
    try {
      e.update(k, dt, e);
      if (e.lift) e.lift.position.y = groundFn(e.obj.position.x, e.obj.position.z);
      if (k >= 1) {
        if (e.obj) { scene.remove(e.lift || e.obj); disposeObj(e.obj); }
        if (e.onEnd) e.onEnd();
        effects.splice(i, 1);
      }
    } catch (err) { effects.splice(i, 1); console.warn('efekt', err); }
  }
  TINT = null;
  updateAuras(dt, alive);
  updateParticles(dt);
}
export function clearFx() {
  for (const e of effects) if (e.obj) { scene.remove(e.lift || e.obj); disposeObj(e.obj); }
  effects.length = 0; auras.length = 0; P.n = 0;
}

// normal vuruş kıvılcımı
export function hitSpark(pos, crit, kind) {
  const y = (pos.y || 0) + 1.1;
  if (kind === 'stone') burst(pos.x, y, pos.z, ['#d9d4c7', '#ffd23f'], crit ? 18 : 9, 5, { size: 0.16, life: 0.45, gravity: 9 });
  else burst(pos.x, y, pos.z, crit ? ['#ffd23f', '#ff6a3d', '#ffffff'] : ['#ffffff', '#ffd9a0'], crit ? 22 : 8, crit ? 7 : 4.5, { size: crit ? 0.24 : 0.16, life: 0.35 });
  if (crit) shockwave(pos.x, pos.z, 1.6, '#ffb347', 0.35, { y: 0.9 });
}
// seviye atlama (Metin2 tarzı): yükselen iki altın sarmal, ışınlar, ışık sütunu ve yıldız patlaması
function rays(follow, color, dur, n = 10) {
  color = tc(color);
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color, map: columnTex(), ...add() });
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 6), mat);
    const a = i / n * Math.PI * 2;
    m.position.set(Math.cos(a) * 0.9, 3, Math.sin(a) * 0.9); m.rotation.y = -a; m.rotation.z = Math.cos(a * 3) * 0.12;
    g.add(m);
  }
  addFx(g, dur, (k, dt, e) => {
    g.position.set(follow.x, 0, follow.z);
    g.rotation.y += dt * 1.2;
    const s = Math.min(1, k * 4); g.scale.set(1 + k * 0.6, s * (1 + k * 0.3), 1 + k * 0.6);
    mat.opacity = 0.75 * (1 - k);
  }, { onEnd: () => mat.dispose() });
}
export function levelUp(obj) {
  const p = obj.group.position;
  pillar(p.x, p.z, '#ffd23f', 11, 2.2, { follow: p, r: 1.2 });
  rays(p, '#fff1b8', 2.0);
  magicCircle(p.x, p.z, 3, '#ffd23f', 2.6, { follow: p, spin: 2.5 });
  magicCircle(p.x, p.z, 1.8, '#fff1b8', 2.6, { follow: p, spin: -3.5, y: 0.1 });
  shockwave(p.x, p.z, 6, '#fff1b8', 0.9);
  setTimeout(() => shockwave(p.x, p.z, 4, '#ffd23f', 0.7), 300);
  // iki sarmal: altın ve beyaz, karakteri sararak yükselir
  repeat(60, 0.025, (i) => {
    for (const side of [0, Math.PI]) {
      const a = i * 0.42 + side, r = 1.1 - i * 0.008;
      emit(p.x + Math.cos(a) * r, 0.1 + i * 0.07, p.z + Math.sin(a) * r, { vx: -Math.sin(a) * 0.8, vy: 0.9, vz: Math.cos(a) * 0.8,
        color: side ? '#fff1b8' : '#ffd23f', size: 0.34, life: 1.0, drag: 1 });
    }
  });
  // tepede yıldız patlaması
  setTimeout(() => {
    burst(p.x, 4.6, p.z, ['#ffd23f', '#fff1b8', '#ffffff', '#ffb347'], 70, 7, { size: 0.3, life: 1.2, gravity: 2.5, drag: 1.2 });
    shockwave(p.x, p.z, 2.5, '#ffffff', 0.5, { y: 4.6 });
  }, 1500);
  repeat(24, 0.07, () => burst(p.x, rnd(0.4, 3.5), p.z, ['#ffd23f', '#fff1b8'], 4, 3, { up: 2.5, size: 0.2, life: 1.0, drag: 1.2 }));
}
// metin taşı kırılması: taş parçaları saçılır, renkli patlama
export function stoneBreak(pos, color) {
  burst(pos.x, 1.8, pos.z, ['#3a3f4b', '#5a5e6a', '#2a2d36'], 46, 9, { size: 0.42, life: 1.1, gravity: 14, drag: 0.6 });
  burst(pos.x, 1.8, pos.z, [color, '#ffffff'], 50, 7, { size: 0.32, life: 0.8, drag: 1.5 });
  shockwave(pos.x, pos.z, 6, color, 0.8);
  pillar(pos.x, pos.z, color, 8, 0.8, { r: 1.4 });
}
// metin taşı çevresinde yükselen ışık zerresi
export function stoneWisp(pos, color) {
  const a = Math.random() * Math.PI * 2, r = 1.2 + Math.random() * 0.8;
  emit(pos.x + Math.cos(a) * r, 0.2, pos.z + Math.sin(a) * r, { vx: -Math.cos(a) * 0.3, vy: rnd(0.8, 1.6), vz: -Math.sin(a) * 0.3, color, size: 0.22, life: 1.8, drag: 0.3 });
}
// yaratık ateş püskürtmesi (ör. Ateş Kertenkelesi)
export function breath(from, to, color) {
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.max(0.1, Math.hypot(dx, dz));
  for (let i = 0; i < 40; i++) {
    const s = rnd(6, 11);
    emit(from.x + dx / d * 0.8, from.y, from.z + dz / d * 0.8, { vx: dx / d * s + rnd(-1.5, 1.5), vy: rnd(-0.5, 1.2), vz: dz / d * s + rnd(-1.5, 1.5),
      color: i % 3 ? color : '#ffd23f', size: rnd(0.3, 0.6), life: rnd(0.3, 0.55), drag: 2, grow: 1.2 });
  }
}

// ---------- imza efektleri: her beceriyi birbirinden ayıran şekiller ----------
const lights = []; let lightIdx = 0;
// çevreyi bir anlığına beceri renginde aydınlatır
function flash(x, y, z, color, power = 40, dur = 0.45) {
  if (!lights.length) return;
  const L = lights[lightIdx++ % lights.length];
  if (!L.parent && scene) scene.add(L);
  L.color.set(tc(color)); L.position.set(x, y, z);
  addFx(null, dur, (k) => { L.intensity = power * (1 - k) * (1 - k); }, { onEnd: () => { L.intensity = 0; } });
}
// ileri uçan hilal kılıç dalgası
function crescentWave(x, z, dir, color, o = {}) {
  color = tc(color);
  const r = o.r || 1.6, len = 2.2, g = new THREE.Group(); g.position.set(x, o.y || 1.0, z); g.rotation.y = dir;
  const tilt = new THREE.Group(); tilt.rotation.z = o.tilt || 0; g.add(tilt);
  const mat = new THREE.MeshBasicMaterial({ color, vertexColors: true, ...add() });
  const m = new THREE.Mesh(arcGeo(r * 0.55, r, len), mat); m.rotation.y = -len / 2;
  const core = new THREE.Mesh(arcGeo(r * 0.86, r * 0.98, len), new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, ...add() })); core.rotation.y = -len / 2;
  tilt.add(m, core);
  const dx = Math.sin(dir), dz = Math.cos(dir), speed = o.speed || 16, dist = o.dist || 8;
  addFx(g, dist / speed, (k, dt) => {
    g.position.x += dx * speed * dt; g.position.z += dz * speed * dt;
    g.scale.setScalar(0.7 + k * 0.8);
    mat.opacity = 1 - k * k; core.material.opacity = (1 - k) * 0.9;
    if (Math.random() < 0.8) emit(g.position.x + rnd(-0.6, 0.6), g.position.y + rnd(-0.3, 0.3), g.position.z + rnd(-0.6, 0.6), { vx: dx * 2, vz: dz * 2, vy: rnd(-0.5, 0.5), color, size: 0.28, life: 0.35, drag: 3 });
  });
}
// dönen hortum: iç içe üç saydam koni ve yükselen sarmal
function tornado(follow, color, dur, r = 1.6, h = 4.5) {
  color = tc(color);
  const g = new THREE.Group(), cones = [];
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r * (1 - i * 0.2), r * 0.25, h * (1 - i * 0.12), 20, 1, true),
      new THREE.MeshBasicMaterial({ color: i === 2 ? '#ffffff' : color, map: columnTex(), ...add() }));
    m.position.y = h * (1 - i * 0.12) / 2; g.add(m); cones.push(m);
  }
  addFx(g, dur, (k, dt, e) => {
    g.position.set(e.follow.x, 0, e.follow.z);
    cones.forEach((m, i) => { m.rotation.y += dt * (9 + i * 5) * (i % 2 ? -1 : 1); m.material.opacity = (i === 2 ? 0.35 : 0.6) * Math.min(1, k * 6) * (1 - k); });
    g.scale.set(1 + Math.sin(e.t * 20) * 0.04, Math.min(1, k * 4), 1 + Math.sin(e.t * 20) * 0.04);
    for (let j = 0; j < 3; j++) { const a = e.t * 14 + j * 2.1, y = (e.t * 3 + j * 0.7) % h, rr = r * (0.3 + 0.7 * y / h); emit(e.follow.x + Math.cos(a) * rr, y, e.follow.z + Math.sin(a) * rr, { vx: -Math.sin(a) * 4, vy: 2, vz: Math.cos(a) * 4, color, size: 0.22, life: 0.35, drag: 2 }); }
  }, { follow });
}
// yerden fışkıran taş/kristal dikenler
function spikes(x, z, color, n, r, o = {}) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const rock = new THREE.MeshStandardMaterial({ color: o.rock || '#5d564c', roughness: 0.8, emissive: tc(color), emissiveIntensity: o.glow || 0.25, flatShading: true });
  const list = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + rnd(-0.2, 0.2), d = r * rnd(0.55, 1), hh = rnd(0.9, 1.7) * (o.h || 1);
    const m = new THREE.Mesh(new THREE.ConeGeometry(rnd(0.18, 0.32), hh, 5), rock);
    m.position.set(Math.cos(a) * d, -hh, Math.sin(a) * d); m.rotation.set(Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35);
    m.userData.h = hh; m.userData.delay = d / r * 0.25; g.add(m); list.push(m);
  }
  addFx(g, o.dur || 1.1, (k, dt, e) => {
    for (const m of list) {
      const t = Math.max(0, e.t - m.userData.delay), up = Math.min(1, t * 9), down = Math.max(0, (e.t - (e.dur - 0.35)) / 0.35);
      m.position.y = -m.userData.h * 0.5 + m.userData.h * 0.9 * up - m.userData.h * down;
    }
  }, { onEnd: () => rock.dispose() });
  burst(x, 0.3, z, ['#6b5a44', tc(color)], n * 3, 6, { up: 3, size: 0.3, life: 0.7, gravity: 12 });
}
// altıgen örgülü kalkan kubbesi
function dome(follow, color, dur, r = 1.5) {
  color = tc(color);
  const g = new THREE.Group();
  const wire = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), new THREE.MeshBasicMaterial({ color, wireframe: true, ...add() }));
  const skin = new THREE.Mesh(new THREE.IcosahedronGeometry(r * 0.98, 2), new THREE.MeshBasicMaterial({ color, ...add(), side: THREE.FrontSide }));
  g.add(wire, skin);
  addFx(g, dur, (k, dt, e) => {
    g.position.set(e.follow.x, 1.0, e.follow.z);
    const s = Math.min(1, e.t * 5); g.scale.set(s, s * 1.1, s);
    wire.rotation.y += dt * 0.8; skin.rotation.y -= dt * 0.4;
    wire.material.opacity = 0.85 * (1 - k * k) * (0.75 + Math.sin(e.t * 16) * 0.25); skin.material.opacity = 0.22 * (1 - k);
  }, { follow });
}
// açılan nilüfer: iki kat yaprak, ortadan yükselen ışık
function petalTex() {
  if (texCache.petal) return texCache.petal;
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const x = c.getContext('2d');
  if (x && x.createRadialGradient) {
    const gr = x.createRadialGradient(32, 80, 4, 32, 70, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.beginPath(); x.ellipse(32, 66, 24, 60, 0, 0, Math.PI * 2); x.fill();
  }
  texCache.petal = new THREE.CanvasTexture(c); texCache.petal.userData = { shared: true };
  return texCache.petal;
}
function lotus(x, z, color, dur = 1.4, follow = null) {
  color = tc(color);
  const g = new THREE.Group(); g.position.set(x, 0.1, z);
  const petals = [];
  for (const [n, len, rise, col] of [[8, 1.3, 0.9, color], [5, 0.9, 1.25, '#ffffff']]) {
    for (let i = 0; i < n; i++) {
      const piv = new THREE.Group(); piv.rotation.y = i / n * Math.PI * 2 + (len < 1 ? 0.3 : 0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, len), new THREE.MeshBasicMaterial({ color: col, map: petalTex(), ...add() }));
      m.position.z = len / 2; m.rotation.x = -Math.PI / 2;
      const hinge = new THREE.Group(); hinge.add(m); piv.add(hinge); g.add(piv);
      petals.push({ hinge, m, rise });
    }
  }
  addFx(g, dur, (k, dt, e) => {
    if (e.follow) g.position.set(e.follow.x, 0.1, e.follow.z);
    const open = Math.min(1, e.t * 2.2);
    g.rotation.y += dt * 0.6;
    for (const p of petals) { p.hinge.rotation.x = -p.rise * (1 - open) - 0.25 * open + 0.15; p.m.material.opacity = 0.9 * Math.min(1, e.t * 6) * (1 - k); }
    g.scale.setScalar(0.6 + open * 0.6);
  }, { follow });
}
// karanlık bulut ve içinden çakan şimşekler
function thunderCloud(x, z, color, dur = 1.2, strikes = []) {
  color = tc(color);
  const g = new THREE.Group(); g.position.set(x, 7.5, z);
  const dark = new THREE.Mesh(new THREE.CircleGeometry(3, 32), new THREE.MeshBasicMaterial({ color: '#1c2236', map: radialTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  const glowM = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color, map: radialTex(), ...add() }));
  dark.rotation.x = glowM.rotation.x = Math.PI / 2; glowM.position.y = -0.05; g.add(dark, glowM);
  let next = 0.15;
  addFx(g, dur, (k, dt, e) => {
    g.rotation.y += dt * 0.5;
    dark.material.opacity = 0.85 * Math.min(1, e.t * 5) * (1 - k * k);
    glowM.material.opacity = Math.random() < 0.15 ? 0.9 : 0.2 * (1 - k);
    if (e.t > next && k < 0.85) {
      next = e.t + rnd(0.12, 0.3);
      const t = strikes.length ? strikes[Math.floor(Math.random() * strikes.length)] : { x: x + rnd(-2, 2), z: z + rnd(-2, 2) };
      lightning({ x: x + rnd(-1.5, 1.5), y: 7.3, z: z + rnd(-1.5, 1.5) }, { x: t.x, y: 0.2, z: t.z }, color, 0.25);
      flash(t.x, 3, t.z, color, 35, 0.25);
    }
  });
}
// ileri püsküren alev konisi
function fireCone(x, z, dir, color, len = 7, spread = 0.45, dur = 0.7) {
  const dx = Math.sin(dir), dz = Math.cos(dir), cols = Array.isArray(color) ? color : [color];
  repeat(Math.round(dur / 0.035), 0.035, () => {
    for (let i = 0; i < 7; i++) {
      const a = dir + rnd(-spread, spread), sp = rnd(len * 1.1, len * 1.7);
      emit(x + dx * 0.8, rnd(0.9, 1.5), z + dz * 0.8, { vx: Math.sin(a) * sp, vy: rnd(-0.3, 1.2), vz: Math.cos(a) * sp, color: cols[i % cols.length], size: rnd(0.4, 0.8), life: rnd(0.45, 0.65), drag: 1.6, grow: 1.6 });
    }
  });
}
// sırtta açılan ışık kanatları
function wingTex() {
  if (texCache.wing) return texCache.wing;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  if (x && x.createLinearGradient) {
    for (let i = 0; i < 9; i++) {
      const a = -0.2 - i * 0.16, l = 230 - i * 14;
      const gr = x.createLinearGradient(0, 120, Math.cos(a) * l, 120 + Math.sin(a) * l);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.strokeStyle = gr; x.lineWidth = 16 - i; x.lineCap = 'round';
      x.beginPath(); x.moveTo(6, 120); x.lineTo(Math.cos(a) * l, 120 + Math.sin(a) * l); x.stroke();
    }
  }
  texCache.wing = new THREE.CanvasTexture(c); texCache.wing.userData = { shared: true };
  return texCache.wing;
}
function wings(follow, color, dur = 1.6) {
  color = tc(color);
  const g = new THREE.Group(), sides = [];
  for (const sx of [-1, 1]) {
    const piv = new THREE.Group();
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshBasicMaterial({ color, map: wingTex(), ...add() }));
    m.position.set(1.2, 0.45, 0); if (sx < 0) { m.scale.x = -1; m.position.x = -1.2; }
    piv.add(m); g.add(piv); sides.push({ piv, m, sx });
  }
  addFx(g, dur, (k, dt, e) => {
    g.position.set(e.follow.x, 1.45, e.follow.z);
    if (camera) g.rotation.y = Math.atan2(camera.position.x - e.follow.x, camera.position.z - e.follow.z);
    const open = Math.min(1, e.t * 3), flap = Math.sin(e.t * 7) * 0.15;
    for (const s of sides) { s.piv.rotation.z = s.sx * (-0.6 + open * 0.75 + flap); s.m.material.opacity = 0.9 * Math.min(1, e.t * 5) * (1 - k * k); }
  }, { follow });
}

// ---------- beceri yardımcıları ----------
// büyü toplama: parçacıklar karakterin göğsüne/eline doğru akar, ayağının altında küçük çember
function charge(follow, at, color, dur = 0.35, n = 26) {
  const p0 = follow || at;
  magicCircle(p0.x, p0.z, 1.3, color, dur + 0.35, { follow, spin: 5, alpha: 0.8 });
  repeat(Math.round(n / 2), dur / (n / 2), () => {
    for (let j = 0; j < 2; j++) {
      const a = Math.random() * Math.PI * 2, r = rnd(1.3, 2.2), y = rnd(0.2, 2.2);
      const c = follow || at, tx = at ? at.x : c.x, ty = at && at.y ? at.y : 1.2, tz = at ? at.z : c.z;
      const sx = c.x + Math.cos(a) * r, sz = c.z + Math.sin(a) * r, k = 1 / 0.28;
      emit(sx, y, sz, { vx: (tx - sx) * k, vy: (ty - y) * k, vz: (tz - sz) * k, color, size: 0.2, life: 0.28, drag: 0 });
    }
  });
}
// karakterin çevresinde farklı yüksekliklerde dönen rün halkaları (buff)
function runeRings(follow, color, dur, r = 1.4) {
  [0.15, 1.0, 1.9].forEach((y, i) => later(() => magicCircle(follow.x, follow.z, r * (1 - i * 0.18), color, dur - i * 0.12, { follow, y, spin: i % 2 ? -3.2 : 3.2, alpha: 0.75 }), i * 120));
}
// karakterin çevresinde dönen parlak küreler/kıymıklar
function orbit(follow, color, dur, n = 6, r = 1.1, h = 1.2) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: tc(color), map: radialTex(), ...add() });
  const core = new THREE.MeshBasicMaterial({ color: '#ffffff', ...add() });
  const orbs = [];
  for (let i = 0; i < n; i++) {
    const o = new THREE.Group();
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), mat);
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), core);
    o.add(gl, c); g.add(o); orbs.push({ o, gl, a: i / n * Math.PI * 2 });
  }
  addFx(g, dur, (k, dt, e) => {
    g.position.set(follow.x, 0, follow.z);
    const s = Math.min(1, k * 6) * Math.min(1, (1 - k) * 5);
    for (const b of orbs) {
      b.a += dt * 4.5;
      b.o.position.set(Math.cos(b.a) * r, h + Math.sin(b.a * 2 + e.t * 3) * 0.35, Math.sin(b.a) * r);
      b.o.scale.setScalar(Math.max(0.001, s));
      if (camera) b.gl.quaternion.copy(camera.quaternion);
      if (Math.random() < 0.35) { const wp = b.o.position; emit(g.position.x + wp.x, wp.y, g.position.z + wp.z, { color, size: 0.16, life: 0.35, drag: 2 }); }
    }
    mat.opacity = 0.9 * s;
  }, { onEnd: () => { mat.dispose(); core.dispose(); } });
}
// hedefe çarpma ışığı
function impact(t, color, big = 1) {
  burst(t.x, 1.1, t.z, [color, '#ffffff'], Math.round(16 * big), 5 * big, { size: 0.26, life: 0.4 });
  shockwave(t.x, t.z, 1.6 * big, color, 0.35, { y: 0.9 });
  shockwave(t.x, t.z, 2.2 * big, color, 0.45);
}
// gökten inen yıldırım (M3 süsü ve şaman)
function skyBolt(x, z, color) {
  lightning({ x: x + rnd(-0.6, 0.6), y: 10, z: z + rnd(-0.6, 0.6) }, { x, y: 0.1, z }, color, 0.3);
  shockwave(x, z, 1.8, color, 0.35);
}
// toz/rüzgâr izi (hamle)
function trail(a, b, color, n = 30) {
  for (let i = 0; i < n; i++) {
    const t = i / n, x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
    emit(x + rnd(-0.3, 0.3), rnd(0.2, 1.6), z + rnd(-0.3, 0.3), { vx: (a.x - b.x) * 0.4, vy: rnd(0, 0.6), vz: (a.z - b.z) * 0.4, color, size: rnd(0.25, 0.45), life: rnd(0.3, 0.6), drag: 2, grow: 1 });
  }
}
// ustalık süsü: M1 çift çember ve sarmal, M2 ışık sütunu ve küreler, M3 kızıl yıldırımlar ve alev halkası
// usta / büyük usta / kutsal: becerinin rengi değişir; ayakta hafif bir mühür ve yerde ateş/kıvılcım (yukarı fışkıran sütun yok)
function masteryFx(tier, f, follow, color, r) {
  if (!tier) return;
  const c = follow || f;
  magicCircle(c.x, c.z, 1.4 + tier * 0.3, color, 0.9, { follow, spin: 2.2, alpha: 0.7 });
  if (tier >= 2) orbit(follow || c, color, 0.9, 3 + tier, 1.2, 0.9);
  if (tier >= 3) {
    repeat(10, 0.05, (i) => { const a = i / 10 * Math.PI * 2, d = Math.max(2, (r || 3) * 0.75); flames(c.x + Math.cos(a) * d, c.z + Math.sin(a) * d, [color, '#ff8a3d'], 5, { r: 0.35, power: 0.8 }); });
  }
}

// Bir becerinin görüntüsü. ctx: { caster: oyuncu nesnesi | null, from: {x,z}, facing, targets: [{x,y,z,obj}], lv }
export function playSkill(sk, ctx) {
  const tier = masteryOf(ctx.lv || 0);
  setTint(tier ? MASTERY[tier].color : null);
  try { skillBody(sk, ctx, tier); } finally { TINT = null; }
}
function skillBody(sk0, ctx, tier) {
  const K = tier ? MASTERY[tier].k : 1;
  const sk = { ...sk0, radius: (sk0.radius || 3) * K };
  const c = tc(sk.color || '#ffffff');
  const f = ctx.from, face = ctx.facing || 0, T = ctx.targets || [];
  const follow = ctx.caster ? ctx.caster.group.position : null;
  const fwd = (d) => ({ x: f.x + Math.sin(face) * d, z: f.z + Math.cos(face) * d });
  const hand = { x: f.x + Math.sin(face) * 0.6, y: 1.3, z: f.z + Math.cos(face) * 0.6 };
  masteryFx(tier, f, follow, c, sk.radius);
  switch (sk.key) {
    // ----- savaşçı -----
    case 's_ucluk': {  // üç hilal kesik arka arkaya, sonda önde yer yarığı
      // imza: ileri uçan üç hilal dalga
      [0, 1, 2].forEach((i) => later(() => { crescentWave(f.x, f.z, face + (i - 1) * 0.18, i === 2 ? '#ffd23f' : c, { tilt: [0.5, -0.5, 0][i], r: 1.5 + i * 0.25, dist: sk.radius * 2.2 }); flash(f.x, 1.5, f.z, c, 30, 0.3); }, 120 + i * 110));
      charge(follow, hand, c, 0.2, 14);
      for (let i = 0; i < 3; i++) later(() => {
        const p = fwd(1.2 + i * 0.6);
        slashArc(f.x, 1.0 + i * 0.2, f.z, face, sk.radius * (0.75 + i * 0.1), i === 2 ? tc('#ffd23f') : c, 0.34, { tilt: [0.6, -0.6, 0][i], sweep: 2.2, len: 2.3 });
        burst(p.x, 1.1, p.z, [c, '#ffffff'], 14, 6, { size: 0.24, life: 0.35 });
      }, i * 110);
      later(() => {
        for (let i = 1; i <= 5; i++) { const p = fwd(i * sk.radius / 5); later(() => { burst(p.x, 0.2, p.z, ['#8a7a66', c], 8, 4, { up: 3, size: 0.3, life: 0.5, gravity: 10 }); shockwave(p.x, p.z, 1.2, c, 0.3); }, i * 30); }
        for (const t of T) impact(t, c);
      }, 330);
      break;
    }
    case 's_firtina':  // kılıç fırtınası: karakteri saran dönen altın yaylar
      // imza: karakteri saran altın hortum
      if (follow) tornado(follow, c, 1.0, sk.radius * 0.55, 4.5);
      flash(f.x, 2, f.z, c, 45, 0.8);
      if (follow) { whirl(follow, c, 1.0, sk.radius * 0.8); magicCircle(f.x, f.z, sk.radius, c, 1.1, { follow, spin: 6 }); }
      shockwave(f.x, f.z, sk.radius, c, 0.6);
      later(() => shockwave(f.x, f.z, sk.radius * 1.15, '#fff1b8', 0.5), 350);
      later(() => { for (const t of T) impact(t, c, 0.8); }, 250);
      later(() => { const e = follow || f; burst(e.x, 1, e.z, [c, '#ffd23f', '#ffffff'], 40, 9, { flat: true, size: 0.3, life: 0.5 }); }, 900);
      later(() => { const e = follow || f; groundSlam(e.x, e.z, c, sk.radius * 0.9, 1.2); }, 820);
      break;
    case 's_hamle': {  // hamle: hız izi, art arda iz yayları, varışta yer sarsıntısı ve taş parçaları
      // imza: varışta yerden fışkıran kaya dikenleri
      later(() => { const e = follow || f; spikes(e.x, e.z, c, 10, sk.radius * 0.9); flash(e.x, 1.5, e.z, c, 45, 0.4); }, 150);
      const s = { x: f.x, z: f.z };
      charge(null, { x: s.x, y: 1.0, z: s.z }, c, 0.15, 10);
      for (let i = 0; i < 18; i++) emit(s.x + rnd(-0.4, 0.4), rnd(0.2, 1.2), s.z + rnd(-0.4, 0.4), { vx: rnd(-1, 1), vy: rnd(0, 1), vz: rnd(-1, 1), color: '#c9b48a', size: 0.5, life: 0.7, drag: 2, grow: 1.5, alpha: 0.6 });
      repeat(5, 0.03, () => { if (follow) { trail(s, follow, c, 10); slashArc(follow.x, 1.0, follow.z, face, 1.3, c, 0.25, { sweep: 0, len: 1.6, tilt: Math.PI / 2 }); } });
      later(() => {
        const e = follow || s;
        trail(s, e, '#c9b48a', 30);
        shockwave(e.x, e.z, sk.radius * 1.4, c, 0.55); shockwave(e.x, e.z, sk.radius * 0.8, '#ffffff', 0.35);
        burst(e.x, 0.4, e.z, [c, '#ffd23f'], 30, 8, { flat: true, size: 0.32, life: 0.5 });
        burst(e.x, 0.3, e.z, ['#6b5a44', '#8a7a66'], 24, 7, { up: 4, size: 0.35, life: 0.8, gravity: 14 });
        slashArc(e.x, 1.2, e.z, face, 2.2, c, 0.35, { tilt: 1.3, sweep: 2.4, len: 2.0 });
        for (const t of T) impact(t, c);
      }, 140);
      break;
    }
    case 's_demir':    // demir beden: rün halkaları, dönen çelik kıymıklar, kalkan küresi
      // imza: çelik altıgen kalkan kubbesi
      if (follow) dome(follow, '#dfe6ee', 1.6, 1.45);
      flash(f.x, 2, f.z, '#dfe6ee', 35, 0.6);
      charge(follow, null, c, 0.3);
      if (follow) {
        bubble(follow, c, 1.6);
        later(() => groundSlam(follow.x, follow.z, '#dfe6ee', 2.2, 0.7), 380);
        runeRings(follow, c, 1.5); orbit(follow, c, 1.6, 6, 1.05, 1.1);
        later(() => burst(follow.x, 1.2, follow.z, [c, '#ffffff'], 36, 6, { size: 0.24, life: 0.5 }), 300);
      }
      magicCircle(f.x, f.z, 2.2, c, 1.6, { follow });
      break;
    // ----- ninja -----
    case 'n_golge':    // gölge darbesi: arkasında duman, hedefte mor çarpı kesik
      // imza: hedefin dört yanından aynı anda kesen gölge yayları
      for (const t of T) {
        for (let i = 0; i < 4; i++) later(() => { const a = face + i * Math.PI / 2; slashArc(t.x, 1.2, t.z, a, 1.9, i % 2 ? c : '#3a2a5a', 0.28, { tilt: (i % 2 ? 1 : -1) * 1.1, sweep: 1.9, len: 2.0 }); }, 60 + i * 55);
        later(() => { shockwave(t.x, t.z, 2.4, '#2a1f40', 0.45); flash(t.x, 1.5, t.z, c, 40, 0.35); }, 260);
      }
      burst(f.x, 1, f.z, ['#2a1f40', c], 22, 2.5, { size: 0.7, life: 0.7, grow: 1.5, drag: 3 });
      smokePuff(f.x, f.z);
      for (const t of T) {
        later(() => smokePuff(t.x, t.z, '#2a1f40', 16), 120);
        trail(f, t, c, 16);
        slashArc(t.x, 1.1, t.z, face + 0.8, 1.5, c, 0.3, { tilt: 0.9, sweep: 1.6, len: 1.8 });
        later(() => slashArc(t.x, 1.1, t.z, face - 0.8, 1.5, c, 0.3, { tilt: -0.9, sweep: -1.6, len: 1.8 }), 90);
        later(() => { impact(t, c, 1.1); burst(t.x, 1, t.z, ['#3a2a5a', c], 24, 3, { size: 0.6, life: 0.7, grow: 1.5, drag: 3 }); }, 180);
      }
      break;
    case 'n_zehir':    // zehirli hançer: dönen yeşil hançer, zehir bulutu, damlayan zehir
      // imza: hedefte kabaran zehir kabarcıkları
      for (const t of T) later(() => { repeat(14, 0.06, () => emit(t.x + rnd(-0.9, 0.9), rnd(0.1, 0.5), t.z + rnd(-0.9, 0.9), { vy: rnd(0.6, 1.4), color: Math.random() < 0.5 ? c : '#2e8b3a', size: rnd(0.25, 0.45), life: 0.9, grow: 1.2, drag: 0.5 })); flash(t.x, 1.2, t.z, c, 30, 0.4); }, 320);
      charge(follow, hand, c, 0.2, 12);
      for (const t of T) projectile(hand, { x: t.x, y: 1.1, z: t.z }, c, { speed: 26, r: 0.13, arc: 0.6, trail: 5, onHit: (p) => {
        impact(t, c);
        burst(p.x, p.y, p.z, [c, '#2e8b3a'], 26, 2.5, { size: 0.55, life: 1.1, grow: 1.6, drag: 2.5 });
        repeat(14, 0.08, () => emit(p.x + rnd(-0.5, 0.5), 2.2, p.z + rnd(-0.5, 0.5), { vy: -3, color: c, size: 0.16, life: 0.6, gravity: 4 }));
        magicCircle(p.x, p.z, 1.4, c, 1.0, { spin: 2, alpha: 0.6 });
      } });
      break;
    case 'n_yagmur':   // hançer yağmuru: gökten inen gümüş hançerler
      flash(f.x, 4, f.z, c, 35, 0.9);
      magicCircle(f.x, f.z, sk.radius * 0.6, '#ffffff', 1.0, { y: 6, spin: 4, alpha: 0.7 });
      if (follow) { slashArc(f.x, 1.2, f.z, face, 1.8, c, 0.35, { sweep: 0, spinRate: 14, len: 2.6, follow }); }
      shockwave(f.x, f.z, sk.radius, c, 0.4);
      magicCircle(f.x, f.z, sk.radius, c, 1.1, { spin: -2.5, alpha: 0.6 });
      repeat(22, 0.04, () => {
        const a = Math.random() * Math.PI * 2, r = sk.radius * Math.sqrt(Math.random());
        const tx = f.x + Math.cos(a) * r, tz = f.z + Math.sin(a) * r;
        projectile({ x: tx + 1.5, y: 9, z: tz - 1 }, { x: tx, y: 0.2, z: tz }, c, { speed: 40, r: 0.09, trail: 2, trailLife: 0.2, onHit: (p) => { burst(p.x, 0.25, p.z, ['#ffffff', c], 6, 4, { size: 0.15, life: 0.3, gravity: 8 }); shockwave(p.x, p.z, 0.8, c, 0.25); } });
      });
      break;
    case 'n_adim':     // kaçış adımı / hafif adım: rüzgâr sarmalı, ayakta dönen rüzgâr yayları, uçuşan yapraklar
      smokePuff(f.x, f.z, '#2a2f3a', 18);
      // fallthrough
    case 'o_hafif':
      // imza: ayakta dönen yeşil rüzgâr hortumu
      if (follow) tornado(follow, c, 0.9, 1.1, 2.6);
      flash(f.x, 1.5, f.z, c, 25, 0.5);
      if (follow) {
        magicCircle(f.x, f.z, 1.8, c, 1.2, { follow, spin: 5 });
        runeRings(follow, c, 1.1, 1.2);
        for (let i = 0; i < 2; i++) slashArc(follow.x, 0.3 + i * 0.5, follow.z, i * 3, 1.1, c, 0.9, { sweep: 0, spinRate: 16 + i * 6, len: 2.4, follow });
        repeat(30, 0.03, (i) => { const a = i * 0.7; emit(follow.x + Math.cos(a) * 0.8, 0.1 + i * 0.07, follow.z + Math.sin(a) * 0.8, { vx: -Math.sin(a) * 2, vy: 1.5, vz: Math.cos(a) * 2, color: c, size: 0.28, life: 0.7, drag: 1 }); });
        later(() => burst(follow.x, 1.0, follow.z, [c, '#c8f7c8', '#ffffff'], 30, 5, { up: 1.5, size: 0.22, life: 0.9, gravity: -0.5, drag: 1.2 }), 250);
      }
      break;
    // ----- sura -----
    case 'u_kara':     // karanlık kılıç: kara-mor alevler, dönen kara küreler
      // imza: karakterin çevresinde çatırdayan mor şimşekler
      if (follow) repeat(9, 0.11, () => { const a = Math.random() * Math.PI * 2, b = a + rnd(0.8, 2.2); lightning({ x: follow.x + Math.cos(a) * 1.2, y: rnd(0.6, 2.2), z: follow.z + Math.sin(a) * 1.2 }, { x: follow.x + Math.cos(b) * 1.2, y: rnd(0.6, 2.2), z: follow.z + Math.sin(b) * 1.2 }, '#d07bff', 0.18); });
      flash(f.x, 1.8, f.z, c, 40, 1.0);
      charge(follow, null, c, 0.3);
      if (follow) {
        magicCircle(f.x, f.z, 2.6, '#2a0f3a', 1.5, { follow, spin: -2, alpha: 0.9 });
        later(() => spikes(follow.x, follow.z, c, 8, 1.6, { rock: '#1e1626', glow: 0.9, h: 0.9, dur: 1.1 }), 200);
        runeRings(follow, c, 1.4);
        orbit(follow, '#d07bff', 1.5, 5, 1.0, 1.3);
        repeat(24, 0.04, () => flames(follow.x, follow.z, [c, '#2a0f3a', '#d07bff'], 4, { r: 0.6, power: 0.9 }));
      }
      break;
    case 'u_emme':     // ruh emme: hedefte kara girdap, ruh küreleri sana akar, sende yutma ışığı
      for (const t of T) { tornado({ x: t.x, z: t.z }, '#3a1a5a', 0.8, 1.2, 2.4); flash(t.x, 1.4, t.z, c, 35, 0.6); }
      for (const t of T) {
        impact(t, c);
        magicCircle(t.x, t.z, 1.6, c, 1.0, { spin: -6, alpha: 0.8 });
        repeat(14, 0.04, () => { const a = Math.random() * Math.PI * 2, r = rnd(1, 1.6); emit(t.x + Math.cos(a) * r, rnd(0.4, 1.8), t.z + Math.sin(a) * r, { vx: -Math.cos(a) * 3 - Math.sin(a) * 3, vy: 0, vz: -Math.sin(a) * 3 + Math.cos(a) * 3, color: c, size: 0.24, life: 0.35, drag: 1 }); });
        for (let i = 0; i < 5; i++) later(() => projectile({ x: t.x, y: 1.2, z: t.z }, { x: (follow || f).x, y: 1.2, z: (follow || f).z }, c, { speed: 13, r: 0.15, arc: 1.4, onHit: (p) => burst(p.x, p.y, p.z, [c, '#ffffff'], 6, 2, { size: 0.2, life: 0.3 }) }), i * 90);
      }
      later(() => { const e = follow || f; burst(e.x, 1.2, e.z, [c, '#ffffff', '#d07bff'], 30, 4, { size: 0.25, life: 0.5 }); shockwave(e.x, e.z, 1.8, c, 0.4); }, 520);
      break;
    case 'u_alev':     // kara alev: halka halinde yerden fışkıran alevler
      // imza: halka halinde yerden çıkan kara kristaller
      later(() => { spikes(f.x, f.z, c, 14, sk.radius * 0.75, { rock: '#1e1626', glow: 0.9, h: 1.3, dur: 1.3 }); flash(f.x, 1.5, f.z, c, 50, 0.7); }, 520);
      later(() => groundSlam(f.x, f.z, c, sk.radius * 0.8, 1.0), 480);
      charge(follow, null, c, 0.25);
      shockwave(f.x, f.z, sk.radius, c, 0.7);
      magicCircle(f.x, f.z, sk.radius, c, 1.2, { spin: 3 });
      repeat(14, 0.05, (i) => {
        const a = i / 14 * Math.PI * 2, r = sk.radius * 0.65;
        flames(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, [c, '#d07bff', '#1a0a24'], 14, { r: 0.5, power: 1.3, size: 1.2 });
      });
      later(() => { for (const t of T) { impact(t, c); flames(t.x, t.z, [c, '#d07bff'], 12, { r: 0.4 }); } }, 300);
      break;
    case 'u_kalkan': { // gölge kalkanı: küre, rün halkaları, dönen kara kalkan parçaları
      if (follow) dome(follow, '#8a7dff', 1.7, 1.5);
      flash(f.x, 1.8, f.z, '#8a7dff', 35, 0.7);
      const sc = tc('#8a7dff');
      charge(follow, null, sc, 0.3);
      if (follow) { bubble(follow, sc, 1.7); runeRings(follow, sc, 1.5); orbit(follow, sc, 1.6, 6, 1.15, 1.0); }
      magicCircle(f.x, f.z, 2.2, sc, 1.6, { follow });
      break;
    }
    // ----- şaman -----
    case 'm_sifa':     // şifa: yeşil ışık sütunu, sarmal yükselen yapraklar, kıvılcımlar
      // imza: hedefin ayağında açılan şifa nilüferi
      for (const t of T) lotus(t.x, t.z, c, 1.5, t.obj ? t.obj.group.position : null);
      flash(f.x, 2, f.z, c, 35, 0.8);
      charge(follow, null, c, 0.3);
      for (const t of T) {
        const tp = t.obj ? t.obj.group.position : t;
        repeat(24, 0.04, (i) => { const a = i * 0.6; emit(tp.x + Math.cos(a) * 0.9, 0.1 + i * 0.08, tp.z + Math.sin(a) * 0.9, { vx: -Math.sin(a), vy: 1.2, vz: Math.cos(a), color: i % 2 ? c : '#ffffff', size: 0.26, life: 0.9, drag: 1 }); });
        repeat(10, 0.06, () => burst(tp.x, rnd(0.3, 1.8), tp.z, [c, '#ffffff'], 3, 1.2, { up: 2, size: 0.25, life: 0.9, drag: 0.5 }));
      }
      magicCircle(f.x, f.z, sk.radius * 0.5, c, 1.4, { follow });
      shockwave(f.x, f.z, sk.radius, c, 0.8);
      break;
    case 'm_simsek': { // şimşek: elinde toplanan ışık, hedeften hedefe dallanan yıldırım, gökten inen ikinci yıldırım
      // imza: hedeflerin üstünde kara bulut, içinden çakan şimşekler
      if (T.length) thunderCloud(T[0].x, T[0].z, c, 1.3, T);
      charge(follow, { x: hand.x, y: 1.6, z: hand.z }, c, 0.25, 18);
      let prev = { x: hand.x, y: 1.6, z: hand.z };
      T.forEach((t, i) => {
        const to = { x: t.x, y: 1.1, z: t.z }, fromP = prev;
        later(() => { lightning(fromP, to, c, 0.45); impact(t, c, 0.8); }, 150 + i * 80);
        later(() => skyBolt(t.x, t.z, '#ffffff'), 190 + i * 80);
        prev = to;
      });
      break;
    }
    case 'm_kutsama':  // kutsama: altın hale, başın üstünde halka, yağan ışık, ışınlar
      // imza: sırtta açılan altın ışık kanatları
      if (follow) wings(follow, c, 1.7);
      flash(f.x, 2.5, f.z, c, 45, 1.0);
      charge(follow, null, c, 0.3);
      if (follow) { rays(follow, c, 1.4, 8); magicCircle(f.x, f.z, 2.4, c, 1.4, { follow, spin: 2.5 }); }
      for (const t of T) {
        const tp = t.obj ? t.obj.group.position : t;
        magicCircle(t.x, t.z, 1.7, c, 1.6, { follow: tp, spin: 2 });
        magicCircle(t.x, t.z, 0.7, c, 1.6, { follow: tp, spin: -4, y: 2.3, alpha: 0.9 });
        repeat(18, 0.05, () => emit(tp.x + rnd(-0.8, 0.8), 3.4, tp.z + rnd(-0.8, 0.8), { vy: -2.5, color: c, size: 0.24, life: 1.1, drag: 0.3 }));
      }
      break;
    case 'm_kukreme':  // ejder kükremesi: ateş patlaması, alev halkası
      // imza: önüne doğru püsküren ejder ateşi
      fireCone(f.x, f.z, face, [c, '#ffd23f', '#b0362b', '#ff9a3c'], sk.radius * 1.4, 0.5, 0.75);
      flash(f.x + Math.sin(face) * 2, 1.5, f.z + Math.cos(face) * 2, c, 60, 0.9);
      charge(follow, null, c, 0.25);
      shockwave(f.x, f.z, sk.radius, c, 0.7);
      later(() => shockwave(f.x, f.z, sk.radius * 0.7, '#ffd23f', 0.5), 150);
      later(() => shockwave(f.x, f.z, sk.radius * 1.2, c, 0.6), 300);
      burst(f.x, 1, f.z, [c, '#ffd23f', '#b0362b'], 80, 11, { flat: true, size: 0.55, life: 0.7, grow: 1.2, drag: 2.5 });
      repeat(10, 0.05, () => flames(f.x, f.z, [c, '#ffd23f'], 10, { r: sk.radius * 0.5, power: 1.4 }));
      later(() => { for (const t of T) impact(t, c); }, 200);
      break;
    // ----- okçu -----
    case 'o_coklu':    // çoklu ok: yayda toplanan ışık, her hedefe parlayan ok
      later(() => { flash(hand.x, hand.y, hand.z, c, 30, 0.3); for (const t of T) later(() => shockwave(t.x, t.z, 1.4, c, 0.3, { y: 1.0 }), 300); }, 200);
      charge(follow, hand, c, 0.22, 14);
      T.forEach((t, i) => later(() => projectile(hand, { x: t.x, y: 1.1, z: t.z }, c, { speed: 45, r: 0.09, trail: 4, onHit: () => impact(t, c, 0.7) }), 200 + i * 50));
      later(() => burst(hand.x, hand.y, hand.z, [c, '#ffffff'], 16, 4, { size: 0.2, life: 0.3 }), 200);
      break;
    case 'o_zehirli':  // buz oku: buz mavisi izli ok, varınca don patlaması (dondurma sunucudan gelir)
      charge(follow, hand, c, 0.22, 14);
      later(() => { for (const t of T) projectile(hand, { x: t.x, y: 1.1, z: t.z }, c, { speed: 42, r: 0.13, trail: 6, trailLife: 0.4, onHit: (p) => {
        impact(t, c, 0.9);
        burst(p.x, p.y, p.z, ['#ffffff', '#bfeaff', c], 34, 5, { size: 0.24, life: 0.6, gravity: 6 });
        magicCircle(p.x, p.z, 1.8, c, 1.4, { spin: 1.2, alpha: 0.8 });
        spikes(p.x, p.z, '#bfeaff', 7, 1.1, { rock: '#bfeaff', glow: 1.2, h: 0.8, dur: 1.6 });
        repeat(10, 0.08, () => emit(p.x + rnd(-1, 1), rnd(1.5, 2.5), p.z + rnd(-1, 1), { vy: -1, color: '#ffffff', size: 0.12, life: 1.0, drag: 0.5 }));
      } }); }, 200);
      break;
    case 'o_ates':     // ateşli ok: alev izli ok, varınca patlama
      for (const t of T) later(() => { groundSlam(t.x, t.z, c, 2.2, 0.8); flash(t.x, 1.5, t.z, c, 60, 0.6); }, 480);
      charge(follow, hand, c, 0.25, 16);
      later(() => { for (const t of T) projectile(hand, { x: t.x, y: 1.1, z: t.z }, c, { speed: 36, r: 0.17, trail: 7, trailLife: 0.45, onHit: (p) => {
        shockwave(p.x, p.z, 3.2, c, 0.5); burst(p.x, p.y, p.z, [c, '#ffd23f', '#b0362b'], 44, 8, { size: 0.45, life: 0.6, grow: 1.2 });
        flames(p.x, p.z, [c, '#ffd23f'], 24, { r: 0.9 });
        burst(p.x, 0.3, p.z, ['#3a2a20', '#6b5a44'], 14, 6, { up: 3, size: 0.25, life: 0.7, gravity: 12 });
      } }); }, 220);
      break;
    default:
      // bilinmeyen beceri: türüne göre genel görünüm
      charge(follow, null, c, 0.25);
      if (sk.target === 'aoe' || sk.target === 'front' || sk.target === 'dash') { shockwave(f.x, f.z, sk.radius || 3, c, 0.6); burst(f.x, 1, f.z, c, 30, 6, { flat: true }); }
      else if (sk.target === 'self' || sk.target === 'heal') { for (const t of T) magicCircle(t.x, t.z, 2, c, 1.0); }
      else for (const t of T) projectile(hand, { x: t.x, y: 1.1, z: t.z }, c, { onHit: () => impact(t, c) });
  }
  // buff becerilerinde etki süresince karakterde aura kalır
  if (sk.buff && sk.buff.dur) for (const t of T) if (t.obj) addAura(t.obj, c, sk.buff.dur, sk.key);
}
// beceri sırasında karakter hareketi: dönme, sıçrama, öne atılma, büyü pozu
// cast: 'raise' iki kol havaya, 'push' sağ kol öne (büyü/şifa), 'bow' yay germe
export function skillPose(sk) {
  if (sk.key === 's_firtina' || sk.key === 'n_yagmur' || sk.key === 'm_kukreme' || sk.key === 'u_alev') return { spin: sk.key === 's_firtina' ? 0.9 : 0.5 };
  if (sk.target === 'dash') return { lunge: 0.35 };
  if (sk.key.startsWith('o_') && sk.target !== 'self') return { bow: true };
  if (sk.target === 'self') return { jump: 0.5, cast: 'raise' };
  if (sk.target === 'heal') return { cast: 'raise' };
  if (sk.combo == null) return { cast: 'push' };
  return {};
}

// ---------- boss saldırıları: türüne göre görünür vuruş ----------
// from: boss gövdesinin ortası, to: hedefin ayak noktası, shape: yaratığın şekli
export function bossStrike(from, to, color, shape, scale = 1, hasBreath = false) {
  if (!scene) return;
  color = tc(color || '#ff6a3d');
  const dx = to.x - from.x, dz = to.z - from.z, d = Math.max(0.5, Math.hypot(dx, dz)), dir = Math.atan2(dx, dz);
  const s = Math.min(1.6, Math.max(0.8, scale));
  if (shape === 'golem' || shape === 'bear' || shape === 'frog' || shape === 'boar') {
    // ağır gövdeli: hedefin üstüne yumruk/gövde vuruşu, yer çatlar
    groundSlam(to.x, to.z, color, 2.2 * s, 0.6);
    pillar(to.x, to.z, color, 2.4, 0.35, { r: 0.6 });
  } else if (shape === 'ghost' || shape === 'skeleton') {
    // büyücü: hedefe yıldırım, altında büyü çemberi patlar
    lightning({ x: from.x, y: from.y + 0.8, z: from.z }, { x: to.x, y: 1.0, z: to.z }, color, 0.35);
    magicCircle(to.x, to.z, 1.6 * s, color, 0.7);
    shockwave(to.x, to.z, 2.4 * s, color, 0.5);
    burst(to.x, 1.0, to.z, [color, '#ffffff'], 26, 6, { size: 0.3, life: 0.5 });
    flash(to.x, 1.2, to.z, color, 30, 0.3);
  } else if (shape === 'dragon') {
    // ejder: (alev nefesi ayrıca) pençe dalgası ve hedefte patlama
    if (!hasBreath) for (let i = 0; i < 30; i++) emit(from.x + dx / d, from.y, from.z + dz / d, { vx: dx / d * rnd(7, 11) + rnd(-1.4, 1.4), vy: rnd(-0.4, 1), vz: dz / d * rnd(7, 11) + rnd(-1.4, 1.4), color: i % 3 ? color : '#ffd23f', size: rnd(0.35, 0.65), life: rnd(0.3, 0.5), drag: 2, grow: 1.2 });
    crescentWave(from.x, from.z, dir, color, { r: 1.8 * s, dist: d, speed: 18, tilt: 0.5 });
    shockwave(to.x, to.z, 2.6 * s, color, 0.55);
    burst(to.x, 0.6, to.z, [color, '#ffd23f', '#ffffff'], 34, 7, { up: 2, size: 0.35, life: 0.6, gravity: 6 });
    flash(to.x, 1.0, to.z, color, 45, 0.35);
  } else {
    // savaşçı/yırtıcı: hedefe uçan kılıç/pençe dalgası, çarpınca kıvılcım ve halka
    crescentWave(from.x, from.z, dir, color, { r: 1.5 * s, dist: d, speed: 16, tilt: shape === 'humanoid' ? 0.35 : -0.6 });
    shockwave(to.x, to.z, 1.8 * s, color, 0.45);
    burst(to.x, 1.0, to.z, [color, '#ffffff'], 22, 6, { size: 0.28, life: 0.45 });
    flash(to.x, 1.0, to.z, color, 30, 0.3);
  }
}
