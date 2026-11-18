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

function makePoints() {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P.pos, 3));
  geo.setAttribute('pcolor', new THREE.BufferAttribute(P.col, 3));
  geo.setAttribute('psize', new THREE.BufferAttribute(P.size, 1));
  geo.setAttribute('palpha', new THREE.BufferAttribute(P.alpha, 1));
  pmat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 600 } },
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
      varying vec3 vC; varying float vA;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = clamp(1.0 - r, 0.0, 1.0); a *= a;
        float core = pow(a, 4.0);
        gl_FragColor = vec4(vC * (a + core * 1.5), a * vA);
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
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = o.vx || 0; P.vel[i * 3 + 1] = o.vy || 0; P.vel[i * 3 + 2] = o.vz || 0;
  tmpC.set(o.color || '#ffffff');
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
function addFx(obj, dur, update, opts = {}) {
  if (obj) scene.add(obj);
  const e = { obj, t: 0, dur, update, follow: opts.follow, onEnd: opts.onEnd };
  effects.push(e);
  return e;
}
function disposeObj(o) {
  o.traverse((c) => {
    if (c.geometry && !(c.geometry.userData && c.geometry.userData.shared)) c.geometry.dispose();
    if (c.material && !(c.material.userData && c.material.userData.shared)) c.material.dispose();
  });
}
const add = () => ({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });

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
// kılıç izi yayı: önde parlak, arkaya doğru sönen hilal
function arcGeo(r0, r1, len, seg = 28) {
  const pos = [], col = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, a = t * len, w = Math.sin(t * Math.PI);   // ortası kalın, uçları ince
    const ri = r1 - (r1 - r0) * w;
    pos.push(Math.sin(a) * ri, 0, Math.cos(a) * ri, Math.sin(a) * r1, 0, Math.cos(a) * r1);
    const b = Math.pow(t, 1.6);
    col.push(b, b, b, b, b, b);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
function slashArc(x, y, z, facing, r, color, dur, o = {}) {
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
    e.update(k, dt, e);
    if (k >= 1) {
      if (e.obj) { scene.remove(e.obj); disposeObj(e.obj); }
      if (e.onEnd) e.onEnd();
      effects.splice(i, 1);
    }
  }
  updateAuras(dt, alive);
  updateParticles(dt);
}
export function clearFx() {
  for (const e of effects) if (e.obj) { scene.remove(e.obj); disposeObj(e.obj); }
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

// Bir becerinin görüntüsü. ctx: { caster: oyuncu nesnesi | null, from: {x,z}, facing, targets: [{x,y,z,obj}] }
export function playSkill(sk, ctx) {
  const c = sk.color || '#ffffff';
  const f = ctx.from, face = ctx.facing || 0, T = ctx.targets || [];
  const follow = ctx.caster ? ctx.caster.group.position : null;
  const fwd = (d) => ({ x: f.x + Math.sin(face) * d, z: f.z + Math.cos(face) * d });
  const hand = { x: f.x + Math.sin(face) * 0.6, y: 1.3, z: f.z + Math.cos(face) * 0.6 };
  switch (sk.key) {
    // ----- savaşçı -----
    case 's_ucluk':   // üç hilal kesik arka arkaya
      for (let i = 0; i < 3; i++) setTimeout(() => {
        const p = fwd(1.2);
        slashArc(f.x, 1.0 + i * 0.2, f.z, face, sk.radius * 0.8, i === 2 ? '#ffd23f' : c, 0.32, { tilt: [0.5, -0.5, 0][i], sweep: 2.0, len: 2.2 });
        burst(p.x, 1.1, p.z, [c, '#ffffff'], 12, 6, { size: 0.22, life: 0.35 });
      }, i * 110);
      break;
    case 's_firtina':  // kılıç fırtınası: karakteri saran dönen altın yaylar
      if (follow) whirl(follow, c, 0.9, sk.radius * 0.8);
      shockwave(f.x, f.z, sk.radius, c, 0.6);
      setTimeout(() => shockwave(f.x, f.z, sk.radius * 1.1, '#fff1b8', 0.5), 350);
      break;
    case 's_hamle': {  // hamle: toz izi + varışta yer sarsıntısı
      const s = { x: f.x, z: f.z };
      for (let i = 0; i < 18; i++) emit(s.x + rnd(-0.4, 0.4), rnd(0.2, 1.2), s.z + rnd(-0.4, 0.4), { vx: rnd(-1, 1), vy: rnd(0, 1), vz: rnd(-1, 1), color: '#c9b48a', size: 0.5, life: 0.7, drag: 2, grow: 1.5, alpha: 0.6 });
      setTimeout(() => { const e = follow || s; shockwave(e.x, e.z, sk.radius * 1.3, c, 0.5); burst(e.x, 0.4, e.z, [c, '#ffd23f'], 26, 7, { flat: true, size: 0.3, life: 0.5 }); }, 120);
      break;
    }
    case 's_demir':    // demir beden: gümüş kalkan küresi + yükselen kıvılcımlar
      if (follow) { bubble(follow, c, 1.4); pillar(f.x, f.z, c, 4, 1.0, { follow, r: 0.8 }); }
      magicCircle(f.x, f.z, 2, c, 1.4, { follow });
      break;
    // ----- ninja -----
    case 'n_golge':    // gölge darbesi: hedefte mor çarpı kesik + duman
      for (const t of T) {
        slashArc(t.x, 1.1, t.z, face + 0.8, 1.4, c, 0.3, { tilt: 0.9, sweep: 1.6, len: 1.8 });
        setTimeout(() => slashArc(t.x, 1.1, t.z, face - 0.8, 1.4, c, 0.3, { tilt: -0.9, sweep: -1.6, len: 1.8 }), 90);
        burst(t.x, 1, t.z, ['#3a2a5a', c], 20, 3, { size: 0.6, life: 0.7, grow: 1.5, drag: 3 });
      }
      break;
    case 'n_zehir':    // zehirli hançer: yeşil mermi + zehir bulutu
      for (const t of T) projectile(hand, { x: t.x, y: 1.1, z: t.z }, c, { speed: 32, r: 0.12, onHit: (p) => {
        burst(p.x, p.y, p.z, [c, '#2e8b3a'], 22, 2.5, { size: 0.55, life: 1.1, grow: 1.6, drag: 2.5 });
      } });
      break;
    case 'n_yagmur':   // hançer yağmuru: gökten inen gümüş hançerler
      shockwave(f.x, f.z, sk.radius, c, 0.4);
      repeat(16, 0.05, () => {
        const a = Math.random() * Math.PI * 2, r = sk.radius * Math.sqrt(Math.random());
        const tx = f.x + Math.cos(a) * r, tz = f.z + Math.sin(a) * r;
        projectile({ x: tx + 1.5, y: 9, z: tz - 1 }, { x: tx, y: 0.2, z: tz }, c, { speed: 40, r: 0.09, trail: 2, trailLife: 0.2, onHit: (p) => burst(p.x, 0.25, p.z, ['#ffffff', c], 6, 4, { size: 0.15, life: 0.3, gravity: 8 }) });
      });
      break;
    case 'n_adim':     // kaçış adımı: yeşil rüzgâr sarmalı
    case 'o_hafif':
      if (follow) {
        magicCircle(f.x, f.z, 1.8, c, 1.0, { follow, spin: 4 });
        repeat(24, 0.03, (i) => { const a = i * 0.7; emit(follow.x + Math.cos(a) * 0.8, 0.1 + i * 0.07, follow.z + Math.sin(a) * 0.8, { vx: -Math.sin(a) * 2, vy: 1.5, vz: Math.cos(a) * 2, color: c, size: 0.28, life: 0.7, drag: 1 }); });
      }
      break;
    // ----- sura -----
    case 'u_kara':     // karanlık kılıç: kara-mor alevler
      if (follow) {
        pillar(f.x, f.z, c, 5, 1.1, { follow, r: 0.7 });
        repeat(20, 0.04, () => flames(follow.x, follow.z, [c, '#2a0f3a', '#d07bff'], 4, { r: 0.6, power: 0.9 }));
      }
      break;
    case 'u_emme':     // ruh emme: hedeften ruh küreleri sana akar
      for (const t of T) {
        burst(t.x, 1.2, t.z, [c, '#ffffff'], 14, 3, { size: 0.3, life: 0.5 });
        for (let i = 0; i < 4; i++) setTimeout(() => projectile({ x: t.x, y: 1.2, z: t.z }, { x: (follow || f).x, y: 1.2, z: (follow || f).z }, c, { speed: 14, r: 0.14, arc: 1.2 }), i * 90);
      }
      break;
    case 'u_alev':     // kara alev: halka halinde yerden fışkıran alevler
      shockwave(f.x, f.z, sk.radius, c, 0.7);
      magicCircle(f.x, f.z, sk.radius, c, 1.0, { spin: 3 });
      repeat(10, 0.06, (i) => {
        const a = i / 10 * Math.PI * 2, r = sk.radius * 0.65;
        flames(f.x + Math.cos(a) * r, f.z + Math.sin(a) * r, [c, '#d07bff', '#1a0a24'], 14, { r: 0.5, power: 1.3, size: 1.2 });
      });
      break;
    case 'u_kalkan':   // gölge kalkanı
      if (follow) bubble(follow, '#8a7dff', 1.6);
      magicCircle(f.x, f.z, 2, '#8a7dff', 1.4, { follow });
      break;
    // ----- şaman -----
    case 'm_sifa':     // şifa: yeşil ışık sütunu ve yükselen kıvılcımlar
      for (const t of T) {
        pillar(t.x, t.z, c, 5, 1.2, { follow: t.obj ? t.obj.group.position : null, r: 0.8 });
        repeat(10, 0.06, () => burst(t.x, rnd(0.3, 1.8), t.z, [c, '#ffffff'], 3, 1.2, { up: 2, size: 0.25, life: 0.9, drag: 0.5 }));
      }
      magicCircle(f.x, f.z, sk.radius * 0.5, c, 1.2, { follow });
      break;
    case 'm_simsek': { // şimşek: hedeften hedefe dallanan yıldırım
      let prev = { x: hand.x, y: 1.6, z: hand.z };
      T.forEach((t, i) => {
        const to = { x: t.x, y: 1.1, z: t.z }, fromP = prev;
        setTimeout(() => lightning(fromP, to, c, 0.4), i * 80);
        setTimeout(() => lightning({ x: t.x + rnd(-0.5, 0.5), y: 9, z: t.z + rnd(-0.5, 0.5) }, { x: t.x, y: 0.2, z: t.z }, '#ffffff', 0.25), i * 80 + 40);
        prev = to;
      });
      break;
    }
    case 'm_kutsama':  // kutsama: altın hale ve yağan ışık
      for (const t of T) {
        const tp = t.obj ? t.obj.group.position : t;
        magicCircle(t.x, t.z, 1.6, c, 1.5, { follow: tp, spin: 2 });
        repeat(16, 0.05, () => emit(tp.x + rnd(-0.8, 0.8), 3.2, tp.z + rnd(-0.8, 0.8), { vy: -2.5, color: c, size: 0.22, life: 1.1, drag: 0.3 }));
      }
      break;
    case 'm_kukreme':  // ejder kükremesi: ateş patlaması
      shockwave(f.x, f.z, sk.radius, c, 0.7);
      setTimeout(() => shockwave(f.x, f.z, sk.radius * 0.7, '#ffd23f', 0.5), 150);
      burst(f.x, 1, f.z, [c, '#ffd23f', '#b0362b'], 70, 11, { flat: true, size: 0.55, life: 0.7, grow: 1.2, drag: 2.5 });
      repeat(8, 0.05, () => flames(f.x, f.z, [c, '#ffd23f'], 10, { r: sk.radius * 0.5, power: 1.4 }));
      break;
    // ----- okçu -----
    case 'o_coklu':    // çoklu ok: her hedefe parlayan ok
      T.forEach((t, i) => setTimeout(() => projectile(hand, { x: t.x, y: 1.1, z: t.z }, c, { speed: 45, r: 0.08, trail: 3, onHit: (p) => burst(p.x, p.y, p.z, [c, '#ffffff'], 10, 4, { size: 0.18, life: 0.3 }) }), i * 50));
      break;
    case 'o_zehirli':
      for (const t of T) projectile(hand, { x: t.x, y: 1.1, z: t.z }, c, { speed: 40, r: 0.1, trail: 4, onHit: (p) => burst(p.x, p.y, p.z, [c, '#2e8b3a'], 24, 2.5, { size: 0.55, life: 1.2, grow: 1.6, drag: 2.5 }) });
      break;
    case 'o_ates':     // ateşli ok: alev izli ok, varınca patlama
      for (const t of T) projectile(hand, { x: t.x, y: 1.1, z: t.z }, c, { speed: 36, r: 0.16, trail: 6, trailLife: 0.45, onHit: (p) => {
        shockwave(p.x, p.z, 3, c, 0.5); burst(p.x, p.y, p.z, [c, '#ffd23f', '#b0362b'], 40, 8, { size: 0.45, life: 0.6, grow: 1.2 });
        flames(p.x, p.z, [c, '#ffd23f'], 20, { r: 0.8 });
      } });
      break;
    default:
      // bilinmeyen beceri: türüne göre genel görünüm
      if (sk.target === 'aoe' || sk.target === 'front' || sk.target === 'dash') { shockwave(f.x, f.z, sk.radius || 3, c, 0.6); burst(f.x, 1, f.z, c, 30, 6, { flat: true }); }
      else if (sk.target === 'self' || sk.target === 'heal') { for (const t of T) pillar(t.x, t.z, c, 4, 1.0); }
      else for (const t of T) projectile(hand, { x: t.x, y: 1.1, z: t.z }, c, { onHit: (p) => burst(p.x, p.y, p.z, c, 16, 4) });
  }
  // buff becerilerinde etki süresince karakterde aura kalır
  if (sk.buff && sk.buff.dur) for (const t of T) if (t.obj) addAura(t.obj, c, sk.buff.dur, sk.key);
}
// beceri sırasında karakter hareketi: dönme, sıçrama, öne atılma
export function skillPose(sk) {
  if (sk.key === 's_firtina' || sk.key === 'n_yagmur' || sk.key === 'm_kukreme' || sk.key === 'u_alev') return { spin: sk.key === 's_firtina' ? 0.9 : 0.5 };
  if (sk.target === 'dash') return { lunge: 0.35 };
  if (sk.target === 'self' || sk.target === 'heal') return { jump: 0.5 };
  return {};
}
