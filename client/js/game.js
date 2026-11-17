// Metin.io – 3D istemci (Three.js)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const S = 2.5;                 // taslak haritadaki 1 birim = 2.5 metre
const u = (v) => v * S;
let FACE_OFFSET = Math.PI;     // model yüklenince otomatik hesaplanır
const SPEED = 6;               // metre / saniye
const ATTACK_RANGE = 4.4;
const CAM_OFFSET = new THREE.Vector3(9, 12, 9);

// ---------- sahne ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#9cc6e4');
scene.fog = new THREE.Fog('#9cc6e4', 45, 95);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 200);

scene.add(new THREE.HemisphereLight('#dfefff', '#4a6a35', 1.1));
const sun = new THREE.DirectionalLight('#fff3dc', 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
scene.add(sun, sun.target);

const matCache = {};
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache[key]) matCache[key] = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
  return matCache[key];
}
function add(mesh, x, y, z, cast = true) {
  mesh.position.set(x, y, z);
  mesh.castShadow = cast; mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
function box(w, h, d, color, x, y, z, cast = true) {
  return add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)), x, y, z, cast);
}

// ---------- harita ----------
const colliders = [];   // {x0,z0,x1,z1}
const circles = [];     // {x,z,r}

function area(x0, z0, x1, z1, color, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(u(x1 - x0), u(z1 - z0)), mat(color));
  m.rotation.x = -Math.PI / 2;
  add(m, u((x0 + x1) / 2), y, u((z0 + z1) / 2), false);
}
area(-12, -12, 32, 32, '#6c9b4b', 0);
area(9.2, 13, 10.8, 32, '#b8996a', 0.02); area(9.2, -12, 10.8, 7, '#b8996a', 0.02);
area(-12, 9.2, 7, 10.8, '#b8996a', 0.02); area(13, 9.2, 32, 10.8, '#b8996a', 0.02);
area(6.5, 6.5, 13.5, 13.5, '#c7aa78', 0.03);
area(17.2, -12, 18.8, 32, '#4f8fa6', 0.04);
area(17.5, -12, 17.9, 32, '#6fb0c4', 0.05);

function roofPrism(len, depth, rh, color) {
  const sh = new THREE.Shape();
  sh.moveTo(-depth / 2, 0); sh.lineTo(depth / 2, 0); sh.lineTo(0, rh); sh.lineTo(-depth / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  return new THREE.Mesh(g, mat(color));
}

function house(x, z, w, d, h, rh, roof) {
  const X = u(x), Z = u(z), W = u(w), D = u(d), H = u(h), RH = u(rh), o = 0.8;
  box(W + 0.4, 0.6, D + 0.4, '#8d8a82', X + W / 2, 0.3, Z + D / 2);
  box(W, H, D, '#e6d7b6', X + W / 2, 0.6 + H / 2, Z + D / 2);
  for (const [cx, cz] of [[X, Z], [X + W, Z], [X, Z + D], [X + W, Z + D], [X + W / 2, Z + D]]) {
    box(0.3, H, 0.3, '#6b4a2e', cx, 0.6 + H / 2, cz);
  }
  box(W + 0.1, 0.3, D + 0.1, '#6b4a2e', X + W / 2, 0.6 + H - 0.15, Z + D / 2);
  box(1.4, 2.4, 0.08, '#4a3221', X + W * 0.25, 0.6 + 1.2, Z + D + 0.05, false);       // kapı
  box(1.3, 1.0, 0.08, '#2d2a26', X + W * 0.72, 0.6 + H * 0.6, Z + D + 0.05, false);   // pencere
  box(0.08, 1.0, 1.3, '#2d2a26', X + W + 0.05, 0.6 + H * 0.6, Z + D / 2, false);
  const r = roofPrism(W + 2 * o, D + 2 * o, RH, roof);
  add(r, X - o, 0.6 + H - 0.1, Z + D / 2);
  const ridge = box(W + 2 * o + 0.2, 0.35, 0.35, '#2a2a2a', X + W / 2, 0.6 + H - 0.1 + RH, Z + D / 2);
  ridge.material = mat(roof === '#3d5a80' ? '#2f4766' : '#7d2f20');
  // kıvrık saçak uçları
  for (const [cx, cz] of [[X - o, Z - o], [X + W + o, Z - o], [X - o, Z + D + o], [X + W + o, Z + D + o]]) {
    const c = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.9, 5), mat(roof === '#3d5a80' ? '#2f4766' : '#7d2f20'));
    add(c, cx, 0.6 + H + 0.25, cz);
  }
  colliders.push({ x0: X - 0.5, z0: Z - 0.5, x1: X + W + 0.5, z1: Z + D + 0.5 });
}
house(7, 2.8, 3.2, 2.2, 1.4, 1.1, '#3d5a80');
house(11.8, 3.2, 2.6, 2.0, 1.2, 1.0, '#a8452f');
house(2.6, 11.6, 2.6, 2.2, 1.3, 1.0, '#a8452f');
house(12.6, 13.6, 3.0, 2.2, 1.3, 1.1, '#3d5a80');
house(4.0, 15.4, 2.4, 1.9, 1.1, 0.9, '#3d5a80');

// kuyu
(function well() {
  const X = u(10), Z = u(10);
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.85, 1.5, 12), mat('#85827a')), X, 0.75, Z);
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 12), mat('#2e5f73')), X, 1.45, Z, false);
  box(0.3, 4, 0.3, '#6b4a2e', X - 1.5, 2, Z); box(0.3, 4, 0.3, '#6b4a2e', X + 1.5, 2, Z);
  add(roofPrism(4.4, 2.8, 1.2, '#3d5a80'), X - 2.2, 4, Z);
  circles.push({ x: X, z: Z, r: 2.3 });
})();

// tezgâhlar
function stall(x, z, c1, c2) {
  const X = u(x), Z = u(z);
  box(3.5, 1.75, 2.2, '#8a6440', X + 1.75, 0.875, Z + 1.1);
  for (const [dx, dz] of [[0.1, 0.1], [3.4, 0.1], [0.1, 2.1], [3.4, 2.1]]) box(0.22, 4, 0.22, '#5a3d24', X + dx, 2, Z + dz);
  for (let k = 0; k < 5; k++) {
    const s = box(0.8, 0.12, 3.2, k % 2 ? c2 : c1, X - 0.15 + 0.4 + k * 0.85, 4.05, Z + 1.1);
    s.rotation.x = -0.25;
  }
  ['#e5533d', '#f2c94c', '#7bc96f'].forEach((c, i) =>
    add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), mat(c)), X + 0.8 + i * 0.95, 1.95, Z + 1.1));
  colliders.push({ x0: X - 0.3, z0: Z - 0.3, x1: X + 3.8, z1: Z + 2.5 });
}
stall(7.2, 12.6, '#d9534f', '#f4efe4');
stall(13.8, 7.3, '#3d7fc4', '#f4efe4');

// fenerler
for (const [x, z] of [[6.7, 6.7], [13.3, 6.7], [6.7, 13.3], [13.3, 13.3]]) {
  box(0.2, 3.4, 0.2, '#3a2a1c', u(x), 1.7, u(z));
  const l = box(0.55, 0.7, 0.55, '#ff9b3d', u(x), 3.6, u(z));
  l.material = new THREE.MeshLambertMaterial({ color: '#ff9b3d', emissive: '#ff7a1a', emissiveIntensity: 0.8 });
}

// tarla ve çit
area(3, 2, 6, 5, '#7a5a3a', 0.04);
for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
  add(new THREE.Mesh(new THREE.SphereGeometry(0.42, 6, 4), mat('#8fc45a')), u(3.3 + i * 0.6), 0.3, u(2.3 + j * 0.6));
}
for (let k = 0; k <= 10; k++) box(0.22, 1.6, 0.22, '#6b4a2e', u(3) + k * 0.75, 0.8, u(5.2));
box(7.6, 0.18, 0.12, '#7a5636', u(4.5), 1.25, u(5.2)); box(7.6, 0.18, 0.12, '#7a5636', u(4.5), 0.6, u(5.2));

// köprü
box(u(2.2), 0.4, u(1.4), '#8a6440', u(18), 0.3, u(10));
box(u(2.2), 0.8, 0.2, '#5a3d24', u(18), 0.9, u(9.3)); box(u(2.2), 0.8, 0.2, '#5a3d24', u(18), 0.9, u(10.7));

// ağaçlar
function tree(x, z) {
  box(0.5, 2.4, 0.5, '#5a3d24', u(x), 1.2, u(z));
  add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), mat('#2f5a2a')), u(x), 3.6, u(z));
  add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), mat('#3f7535')), u(x) - 0.5, 4.4, u(z) + 0.4);
  circles.push({ x: u(x), z: u(z), r: 0.9 });
}
function pine(x, z) {
  box(0.4, 1.2, 0.4, '#5a3d24', u(x), 0.6, u(z));
  [[1.9, 1.0], [1.45, 2.4], [1.0, 3.7]].forEach(([r, y]) =>
    add(new THREE.Mesh(new THREE.ConeGeometry(r, 2.4, 7), mat('#264b2a')), u(x), y + 1.2, u(z)));
  circles.push({ x: u(x), z: u(z), r: 0.8 });
}
[[1, 7], [16, 5.5], [1.5, 16.5], [20.5, 6], [5.5, 0.5], [11, 18.5], [20, 17], [-3, 2], [23, 12], [-2, 20], [14, -2]].forEach(([x, z]) => tree(x, z));
[[0, 3], [15.5, 16], [7, 18], [19.8, 12], [-1, 12], [3, -2], [24, 20], [9, -4], [-4, 8]].forEach(([x, z]) => pine(x, z));

// ---------- yazılar (isim, can barı) ----------
const labelsEl = document.getElementById('labels');
function makeLabel(text, color, withHp) {
  const el = document.createElement('div');
  el.className = 'label';
  el.style.color = color;
  el.textContent = text;
  let hp = null;
  if (withHp) {
    const wrap = document.createElement('div'); wrap.className = 'hp';
    hp = document.createElement('div'); hp.style.width = '100%';
    wrap.appendChild(hp); el.appendChild(wrap);
  }
  labelsEl.appendChild(el);
  return { el, hp };
}
const tmpV = new THREE.Vector3();
function placeLabel(label, x, y, z) {
  tmpV.set(x, y, z).project(camera);
  if (tmpV.z > 1) { label.el.style.display = 'none'; return; }
  label.el.style.display = '';
  const sx = (tmpV.x * 0.5 + 0.5) * window.innerWidth;
  const sy = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
  label.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
}
function floatText(text, x, y, z, crit) {
  tmpV.set(x, y, z).project(camera);
  const el = document.createElement('div');
  el.className = 'dmg' + (crit ? ' crit' : '');
  el.textContent = text;
  const sx = (tmpV.x * 0.5 + 0.5) * window.innerWidth + (Math.random() - 0.5) * 50;
  const sy = (-tmpV.y * 0.5 + 0.5) * window.innerHeight;
  el.style.transform = `translate(${sx}px, ${sy}px)`;
  document.body.appendChild(el);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.style.transform = `translate(${sx}px, ${sy - 60}px)`;
    el.style.opacity = '0';
  }));
  setTimeout(() => el.remove(), 850);
}
const logEl = document.getElementById('log');
function log(html) {
  const d = document.createElement('div'); d.innerHTML = html;
  logEl.appendChild(d);
  while (logEl.children.length > 4) logEl.firstChild.remove();
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- metin taşları ----------
const stones = {};
function createStone(s) {
  if (stones[s.id]) return;
  const color = s.color === 'purple' ? '#8a7dff' : '#ff6a3d';
  const g = new THREE.Group();
  const geo = new THREE.OctahedronGeometry(1, 0);
  const rock = new THREE.Mesh(geo, mat(s.color === 'purple' ? '#2f3446' : '#3a3f4b'));
  rock.scale.set(1.3, 2.0, 1.3); rock.position.y = 1.9; rock.castShadow = true;
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color }));
  edges.scale.copy(rock.scale).multiplyScalar(1.01); edges.position.copy(rock.position);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.6, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22 }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06;
  const inner = new THREE.Group(); inner.add(rock, edges);
  g.add(inner, glow);
  g.position.set(s.x, 0, s.z);
  scene.add(g);
  const label = makeLabel(`${s.name} · Sv. ${s.lv}`, s.color === 'purple' ? '#c8d0ff' : '#ffb4a3', true);
  label.hp.style.width = (100 * s.hp / s.max) + '%';
  stones[s.id] = { ...s, group: g, rock: inner, label, shake: 0 };
}
function removeStone(id) {
  const s = stones[id]; if (!s) return;
  scene.remove(s.group); s.label.el.remove(); delete stones[id];
}

// ---------- eşya tanımları ----------
let ITEMS = {};
let CLASSES = {};
const itemsReady = Promise.all([
  fetch('/shared/items.json').then((r) => r.json()).then((j) => { ITEMS = j; }),
  fetch('/shared/classes.json').then((r) => r.json()).then((j) => { CLASSES = j; }),
]).catch((e) => console.warn('Veri dosyaları yüklenemedi', e));
const RARITY = ['#f4f1e8', '#7fb3ff', '#ffb347'];

// ---------- karakter modeli ve kalibrasyon ----------
const V3 = THREE.Vector3;
let gltf = null, calib = null;
const loader = new GLTFLoader();
const modelReady = new Promise((resolve) => {
  loader.load('models/Soldier.glb', (g) => {
    gltf = g;
    try { calib = calibrate(g.scene); FACE_OFFSET = calib.faceOffset; } catch (e) { console.warn('Kalibrasyon başarısız', e); calib = null; }
    resolve();
  }, undefined, (e) => { console.warn('Model yüklenemedi, basit karakter kullanılacak', e); resolve(); });
});

function boneByName(root, name) {
  let found = null;
  root.traverse((o) => {
    if (found || !o.isBone) return;
    if (o.name.replace(/^mixamorig[:_]?/i, '') === name) found = o;
  });
  return found;
}
function basisQuat(x, y, z) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
// dünya koordinatında istenen duruşu kemiğin kendi koordinatına çevir
function localTransform(bone, wPos, wQuat, wScale) {
  const m = new THREE.Matrix4().compose(wPos, wQuat, new V3(wScale, wScale, wScale));
  const l = bone.matrixWorld.clone().invert().multiply(m);
  const p = new V3(), q = new THREE.Quaternion(), s = new V3();
  l.decompose(p, q, s);
  return { p, q, s };
}
// modelin baktığı yönü, boyunu ve kılıç/zırh yerlerini dinlenme pozundan hesapla
function calibrate(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const height = box.max.y - box.min.y;
  const k = height / 1.8;                         // modelin 1 metresi
  const L = boneByName(root, 'LeftArm'), R = boneByName(root, 'RightArm');
  const hand = boneByName(root, 'RightHand'), finger = boneByName(root, 'RightHandMiddle1') || boneByName(root, 'RightHandIndex1');
  const spine = boneByName(root, 'Spine2') || boneByName(root, 'Spine1') || boneByName(root, 'Spine');
  const head = boneByName(root, 'Head');
  if (!L || !R || !hand || !spine || !head) throw new Error('kemikler bulunamadı');
  const pl = L.getWorldPosition(new V3()), pr = R.getWorldPosition(new V3());
  const up = new V3(0, 1, 0);
  const right = pr.clone().sub(pl); right.y = 0; right.normalize();
  const fwd = new V3().crossVectors(up, right).normalize();
  const faceOffset = -Math.atan2(fwd.x, fwd.z);

  const ph = hand.getWorldPosition(new V3());
  const grip = finger ? ph.clone().lerp(finger.getWorldPosition(new V3()), 0.6) : ph.clone();
  const qSword = basisQuat(up.clone(), fwd.clone(), right.clone().negate());
  const qBody = basisQuat(right.clone().negate(), up.clone(), fwd.clone());
  const ps = spine.getWorldPosition(new V3());
  const pHead = head.getWorldPosition(new V3());
  return {
    k, height, minY: box.min.y, faceOffset,
    sword: { bone: hand.name, ...localTransform(hand, grip, qSword, k) },
    chest: { bone: spine.name, ...localTransform(spine, ps.clone().addScaledVector(fwd, 0.02 * k).addScaledVector(up, -0.02 * k), qBody, k) },
    helmet: { bone: head.name, ...localTransform(head, pHead.clone().addScaledVector(up, 0.1 * k).addScaledVector(fwd, 0.01 * k), qBody, k) },
    padL: { bone: L.name, ...localTransform(L, pl.clone().addScaledVector(up, 0.05 * k), qBody, k) },
    padR: { bone: R.name, ...localTransform(R, pr.clone().addScaledVector(up, 0.05 * k), qBody, k) },
  };
}

// ---------- ekipman görselleri (metre cinsinden) ----------
function swordMesh(def) {
  const g = new THREE.Group();
  const len = def.len || 0.9;
  const metal = new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.7, roughness: 0.3,
    emissive: def.glow ? def.color : '#000000', emissiveIntensity: def.glow ? 0.45 : 0 });
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, len, 0.012), metal);
  blade.position.y = 0.06 + len / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.12, 4), metal);
  tip.position.y = 0.06 + len + 0.06; tip.scale.z = 0.3;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.05), mat('#6b5530'));
  guard.position.y = 0.04;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6), mat('#3a2a1c'));
  handle.position.y = -0.05;
  const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.028, 6, 5), mat('#6b5530'));
  pommel.position.y = -0.14;
  g.add(blade, tip, guard, handle, pommel);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function daggerMesh(def) {
  return swordMesh({ ...def, len: def.len || 0.42 });
}
function staffMesh(def) {
  const g = new THREE.Group();
  const len = def.len || 1.5;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, len, 6), mat('#6b4a2e'));
  shaft.position.y = len / 2 - 0.35;
  const orbM = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: def.glow ? 0.8 : 0.3, roughness: 0.2 });
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), orbM);
  orb.position.y = len - 0.3;
  const claw = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.012, 5, 10), mat('#6b5530'));
  claw.position.y = len - 0.3; claw.rotation.x = Math.PI / 2;
  g.add(shaft, orb, claw);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function bowMesh(def) {
  const g = new THREE.Group();
  const len = def.len || 1.2;
  const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -len / 2, 0), new THREE.Vector3(0, 0, 0.28), new THREE.Vector3(0, len / 2, 0));
  const limb = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.02, 5, false),
    new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.6, emissive: def.glow ? def.color : '#000000', emissiveIntensity: def.glow ? 0.4 : 0 }));
  const string = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, len, 3), mat('#e8e2d0'));
  g.add(limb, string);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function weaponMesh(def) {
  if (def.type === 'dagger') return daggerMesh(def);
  if (def.type === 'staff') return staffMesh(def);
  if (def.type === 'bow') return bowMesh(def);
  return swordMesh(def);
}
function chestMesh(def) {
  const g = new THREE.Group();
  const plate = new THREE.MeshStandardMaterial({ color: def.plate, metalness: 0.5, roughness: 0.45 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.26), plate);
  g.add(body);
  if (def.trim) {
    const trimM = new THREE.MeshStandardMaterial({ color: def.trim, metalness: 0.8, roughness: 0.25 });
    const t1 = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.03, 0.27), trimM); t1.position.y = 0.14;
    const t2 = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.02), trimM); t2.position.z = 0.135;
    g.add(t1, t2);
  }
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.05, 0.27), mat('#3a2a1c')); belt.position.y = -0.17;
  g.add(belt);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function padMesh(def) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: def.trim || def.plate, metalness: 0.6, roughness: 0.35 }));
  m.scale.set(1.25, 0.7, 1.1); m.castShadow = true;
  return m;
}
function helmetMesh(def) {
  const g = new THREE.Group();
  const m = new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.65, roughness: 0.3 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), m);
  dome.scale.set(1, 1.05, 1.08);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.128, 0.014, 6, 18), m);
  rim.rotation.x = Math.PI / 2; rim.position.y = -0.05;
  g.add(dome, rim);
  if (def.plume) {
    const pl = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.24), mat(def.plume));
    pl.position.set(0, 0.16, -0.03);
    g.add(pl);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}
function attach(p, info, mesh) {
  const bone = p.boneMap[info.bone];
  if (!bone) return;
  mesh.position.copy(info.p); mesh.quaternion.copy(info.q); mesh.scale.multiply(info.s);
  bone.add(mesh);
  p.equipMeshes.push(mesh);
}
function applyLook(p, look) {
  p.look = look || {};
  if (!p.model || !calib) return;
  for (const m of p.equipMeshes) m.parent && m.parent.remove(m);
  p.equipMeshes = [];
  const w = ITEMS[p.look.weapon], a = ITEMS[p.look.armor], h = ITEMS[p.look.helmet];
  if (w) attach(p, calib.sword, weaponMesh(w));
  const tint = new THREE.Color(a && a.color ? a.color : '#ffffff');
  for (const m of p.materials) m.color.copy(m.userData.base).lerp(tint, a && a.color !== '#ffffff' ? 0.55 : 0);
  if (a && a.plate) {
    attach(p, calib.chest, chestMesh(a));
    attach(p, calib.padL, padMesh(a)); attach(p, calib.padR, padMesh(a));
  }
  if (h) attach(p, calib.helmet, helmetMesh(h));
}

// ---------- oyuncular ----------
const players = {};
let myId = null;
function createPlayer(p) {
  if (players[p.id]) return players[p.id];
  const group = new THREE.Group();
  const obj = { id: p.id, name: p.name, cls: p.cls, level: p.level || 1, group, mixer: null, actions: {}, current: 'Idle',
    target: new V3(p.x, 0, p.z), ry: p.ry || 0, moving: false, model: null, boneMap: {}, bones: null,
    materials: [], equipMeshes: [], look: {}, swingT: 0, combo: 0 };
  if (gltf) {
    const model = SkeletonUtils.clone(gltf.scene);
    model.traverse((o) => {
      if (o.isBone) obj.boneMap[o.name] = o;
      if (o.isMesh) {
        o.castShadow = true;
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        for (const m of [].concat(o.material)) { m.userData.base = m.color.clone(); obj.materials.push(m); }
      }
    });
    const wrap = new THREE.Group();
    wrap.add(model);
    if (calib) { wrap.scale.setScalar(1 / calib.k); wrap.position.y = -calib.minY / calib.k; }
    group.add(wrap);
    obj.model = model;
    obj.mixer = new THREE.AnimationMixer(model);
    for (const clip of gltf.animations) obj.actions[clip.name] = obj.mixer.clipAction(clip);
    if (obj.actions.Idle) obj.actions.Idle.play();
    const find = (n) => Object.values(obj.boneMap).find((b) => b.name.replace(/^mixamorig[:_]?/i, '') === n);
    obj.bones = { spine: find('Spine1') || find('Spine'), arm: find('RightArm'), fore: find('RightForeArm') };
    if (!obj.bones.spine || !obj.bones.arm) obj.bones = null;
  } else {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), mat(p.id === myId ? '#c0392b' : '#2f6fd0'));
    body.position.y = 0.9; body.castShadow = true; group.add(body);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 28), new THREE.MeshBasicMaterial({
    color: p.id === myId ? '#e8b54a' : '#8ec5ff', transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07;
  group.add(ring);
  const slash = new THREE.Mesh(new THREE.RingGeometry(1.0, 2.3, 24, 1, Math.PI * 0.15, Math.PI * 0.7),
    new THREE.MeshBasicMaterial({ color: '#fff4d0', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  slash.rotation.x = -Math.PI / 2; slash.position.y = 1.1;
  group.add(slash);
  obj.slash = slash;
  group.position.set(p.x, 0, p.z);
  scene.add(group);
  obj.label = makeLabel(`${p.name} · Sv. ${obj.level}`, p.id === myId ? '#e8b54a' : '#8ec5ff', false);
  players[p.id] = obj;
  applyLook(obj, p.look);
  return obj;
}
function removePlayer(id) {
  const p = players[id]; if (!p) return;
  scene.remove(p.group); p.label.el.remove(); delete players[id];
}
function setAnim(p, name) {
  if (!p.mixer || p.current === name || !p.actions[name]) return;
  const from = p.actions[p.current], to = p.actions[name];
  to.reset().play();
  if (from) to.crossFadeFrom(from, 0.2, false);
  p.current = name;
}
function updateLabelText(p) { p.label.el.firstChild.textContent = `${p.name} · Sv. ${p.level}`; }

// ---------- saldırı hareketleri (3'lü kombo) ----------
const SWING_T = 0.45;
const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const seg = (t, a, b) => ease((t - a) / (b - a));
function swingPose(combo, t, cls) {
  const o = { twist: 0, bend: 0, armR: 0, armU: 0, fore: 0, lunge: 0 };
  if (cls === 'okcu') {          // yayı kaldır, ger ve bırak
    const a = seg(t, 0, 0.25), c = seg(t, 0.6, 1);
    o.armR = 1.55 * a - 1.55 * c;
    o.twist = -0.5 * a + 0.5 * c;
    return o;
  }
  if (combo === 0) {            // yukarıdan aşağı vuruş
    const a = seg(t, 0, 0.35), b = seg(t, 0.35, 0.6), c = seg(t, 0.6, 1);
    o.armR = 2.6 * a - 2.2 * b - 0.4 * c;
    o.fore = 0.6 * a - 0.6 * b;
    o.bend = 0.15 * a - 0.5 * b + 0.35 * c;
    o.twist = 0.2 * a - 0.5 * b + 0.3 * c;
  } else if (combo === 1) {     // yatay savuruş
    const a = seg(t, 0, 0.3), b = seg(t, 0.3, 0.6), c = seg(t, 0.6, 1);
    o.armR = 1.45 * a - 1.45 * c;
    o.armU = -1.3 * a + 2.5 * b - 1.2 * c;
    o.twist = -0.4 * a + 0.9 * b - 0.5 * c;
    o.bend = -0.1 * b + 0.1 * c;
  } else {                      // ileri saplama
    const a = seg(t, 0, 0.3), b = seg(t, 0.3, 0.5), c = seg(t, 0.55, 1);
    o.armR = 1.1 * a + 0.5 * b - 1.6 * c;
    o.fore = 0.9 * a - 0.9 * b;
    o.twist = 0.5 * a - 0.8 * b + 0.3 * c;
    o.bend = 0.1 * a - 0.4 * b + 0.3 * c;
    o.lunge = 0.6 * b - 0.6 * c;
  }
  return o;
}
const _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion();
function rotWorld(bone, axis, angle) {
  if (!bone || !angle) return;
  bone.parent.getWorldQuaternion(_pq);
  _rq.setFromAxisAngle(axis, angle);
  const t = _pq.clone().invert().multiply(_rq).multiply(_pq);
  bone.quaternion.premultiply(t);
  bone.updateMatrixWorld(true);
}
const _f = new V3(), _u = new V3(0, 1, 0), _r = new V3();
function applySwing(p) {
  if (p.swingT <= 0 || !p.bones) { if (p.model) p.model.parent.position.x = p.model.parent.position.z = 0; return; }
  const t = 1 - p.swingT / SWING_T;
  const a = p.group.rotation.y - FACE_OFFSET;
  _f.set(Math.sin(a), 0, Math.cos(a));
  _r.crossVectors(_f, _u);
  const o = swingPose(p.combo, t, p.cls);
  p.model.updateMatrixWorld(true);
  rotWorld(p.bones.spine, _u, o.twist);
  rotWorld(p.bones.spine, _r, -o.bend);
  rotWorld(p.bones.arm, _r, o.armR);
  rotWorld(p.bones.arm, _u, o.armU);
  rotWorld(p.bones.fore, _r, o.fore);
  // ileri hamle: modeli kendi önüne doğru it (grubun yerel ekseninde)
  const wrap = p.model.parent;
  wrap.position.x = Math.sin(-FACE_OFFSET) * o.lunge;
  wrap.position.z = Math.cos(-FACE_OFFSET) * o.lunge;
}

// ---------- yerdeki ganimet ----------
const drops = {};
function dropMesh(d) {
  const g = new THREE.Group();
  const def = d.key ? ITEMS[d.key] : null;
  const rarity = def ? def.rarity : 0;
  let shape;
  if (!def) {
    shape = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 10),
        new THREE.MeshStandardMaterial({ color: '#f2c94c', metalness: 0.8, roughness: 0.3, emissive: '#7a5a00', emissiveIntensity: 0.4 }));
      c.position.set(i * 0.08 - 0.08, 0.03 + i * 0.05, i % 2 * 0.06);
      shape.add(c);
    }
  } else if (def.slot === 'weapon') {
    shape = weaponMesh(def); shape.rotation.z = Math.PI / 2.4; shape.position.y = 0.35; shape.scale.setScalar(1.2);
  } else if (def.slot === 'armor') {
    shape = def.plate ? chestMesh(def) : new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.34, 0.2), mat('#d9cfb8'));
    shape.position.y = 0.3;
  } else {
    shape = helmetMesh(def); shape.position.y = 0.2; shape.scale.setScalar(1.4);
  }
  g.add(shape);
  if (def) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 4, 10, 1, true),
      new THREE.MeshBasicMaterial({ color: RARITY[rarity], transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = 2;
    g.add(beam);
  }
  g.position.set(d.x, 0, d.z);
  return { group: g, spin: shape };
}
function createDrop(d) {
  if (drops[d.id]) return;
  const m = dropMesh(d);
  scene.add(m.group);
  const def = d.key ? ITEMS[d.key] : null;
  const label = makeLabel(def ? def.name : `${d.yang} Yang`, def ? RARITY[def.rarity] : '#ffe08a', false);
  label.el.style.fontSize = '10px';
  drops[d.id] = { ...d, ...m, label, lastTry: 0, t: Math.random() * 6, born: performance.now() };
}
function removeDrop(id) {
  const d = drops[id]; if (!d) return;
  scene.remove(d.group); d.label.el.remove(); delete drops[id];
}

// ---------- envanter arayüzü ----------
const inv = { inventory: [], equip: {}, yang: 0, atk: 0, def: 0 };
let selected = null;   // {uid} veya {slot}
const SLOT_NAMES = { weapon: 'Silah', armor: 'Zırh', helmet: 'Kask' };
function iconSvg(def, size = 26) {
  const c = def ? def.color === '#ffffff' ? '#d9cfb8' : def.color : '#5a5e55';
  const slot = def ? def.slot : 'weapon';
  const paths = {
    weapon: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/>',
    armor: '<path d="M8 3 4 6v5l3 1v9h10v-9l3-1V6l-4-3-2 2h-4z"/>',
    helmet: '<path d="M4 15a8 8 0 0 1 16 0v3H4z"/><path d="M12 7v-3"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[slot]}</svg>`;
}
const invEl = document.getElementById('inv'), gridEl = document.getElementById('grid'), detailEl = document.getElementById('detail');
function statText(def) {
  return def.slot === 'weapon' ? `Saldırı +${def.atk}` : `Savunma +${def.def}`;
}
function renderInv() {
  document.getElementById('yang').textContent = `${inv.yang.toLocaleString('tr-TR')} Yang`;
  for (const el of document.querySelectorAll('.eq')) {
    const slot = el.dataset.slot, it = inv.equip[slot], def = it ? ITEMS[it.key] : null;
    el.innerHTML = `${iconSvg(def)}<span>${def ? `<span style="color:${RARITY[def.rarity]}">${esc(def.name)}</span>` : 'Boş'}<small>${SLOT_NAMES[slot]}</small></span>`;
    el.classList.toggle('sel', !!(selected && selected.slot === slot));
  }
  document.getElementById('stats').innerHTML = `Saldırı: <b>${inv.atk}</b><br>Savunma: <b>${inv.def}</b>`;
  let html = '';
  for (let i = 0; i < 24; i++) {
    const it = inv.inventory[i];
    if (it) {
      const def = ITEMS[it.key];
      const sel = selected && selected.uid === it.uid ? ' sel' : '';
      html += `<button class="slot${sel}" data-uid="${it.uid}" aria-label="${esc(def ? def.name : '?')}" style="border-color:${sel ? '' : (def ? RARITY[def.rarity] + '66' : '')}">${iconSvg(def)}</button>`;
    } else html += '<div class="slot" aria-hidden="true"></div>';
  }
  gridEl.innerHTML = html;
  renderDetail();
}
function renderDetail() {
  let it = null, equipped = false;
  if (selected && selected.uid != null) it = inv.inventory.find((x) => x.uid === selected.uid);
  if (selected && selected.slot) { it = inv.equip[selected.slot]; equipped = true; }
  if (!it) { detailEl.innerHTML = '<span class="grow" style="color:#8b877c">Bir eşyaya dokun.</span>'; return; }
  const def = ITEMS[it.key];
  detailEl.innerHTML = `<span class="grow"><b style="color:${RARITY[def.rarity]}">${esc(def.name)}</b><br><span style="color:#c9c4b6">${SLOT_NAMES[def.slot]} · ${statText(def)}</span></span>` +
    (equipped ? '<button data-act="unequip">Çıkar</button>' : '<button data-act="equip">Giy</button><button class="alt" data-act="drop">Yere at</button>');
}
document.getElementById('invbtn').addEventListener('click', () => { selected = null; renderInv(); invEl.classList.add('open'); });
document.getElementById('invclose').addEventListener('click', () => invEl.classList.remove('open'));
invEl.addEventListener('click', (e) => { if (e.target === invEl) invEl.classList.remove('open'); });
gridEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-uid]'); if (!b) return;
  selected = { uid: Number(b.dataset.uid) }; renderInv();
});
document.getElementById('equipcol').addEventListener('click', (e) => {
  const b = e.target.closest('.eq'); if (!b) return;
  selected = inv.equip[b.dataset.slot] ? { slot: b.dataset.slot } : null; renderInv();
});
detailEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]'); if (!b || !selected) return;
  if (b.dataset.act === 'equip') socket.emit('equip', selected.uid);
  if (b.dataset.act === 'unequip') socket.emit('unequip', selected.slot);
  if (b.dataset.act === 'drop') socket.emit('dropItem', selected.uid);
  selected = null;
});
const toastEl = document.getElementById('toast');
let toastTimer = null;
function toast(text) {
  toastEl.textContent = text; toastEl.style.opacity = '1';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 2200);
}

// ---------- kontroller ----------
const input = { x: 0, y: 0 };
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') attack();
  if (e.key.toLowerCase() === 'i') document.getElementById('invbtn').click();
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

const joy = document.getElementById('joy'), knob = document.getElementById('knob');
let joyId = null;
function joyMove(e) {
  const r = joy.getBoundingClientRect();
  let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
  const max = r.width / 2 - 10, len = Math.hypot(dx, dy);
  if (len > max) { dx *= max / len; dy *= max / len; }
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
  input.x = dx / max; input.y = dy / max;
}
joy.addEventListener('pointerdown', (e) => { joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joyMove(e); });
joy.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) joyMove(e); });
const joyEnd = (e) => { if (e.pointerId !== joyId) return; joyId = null; input.x = input.y = 0; knob.style.transform = ''; };
joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);

// basılı tutunca sürekli saldır
let atkHeld = false;
const atkBtn = document.getElementById('atk');
atkBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); atkHeld = true; attack(); });
const atkUp = () => { atkHeld = false; };
atkBtn.addEventListener('pointerup', atkUp); atkBtn.addEventListener('pointercancel', atkUp); atkBtn.addEventListener('pointerleave', atkUp);

// ---------- ağ ----------
let socket = null;
let lastSent = 0, lastMoving = false, lastAttackSent = 0;
let myClass = 'savasci';
const CLASS_RANGE = () => (CLASSES[myClass] && CLASSES[myClass].range) || ATTACK_RANGE;
const CLASS_SPEED = () => (CLASSES[myClass] && CLASSES[myClass].speed) || 1;

function attack() {
  const me = players[myId]; if (!me || !socket) return;
  const now = performance.now();
  if (now - lastAttackSent < (myClass === 'ninja' ? 420 : 500)) return;
  lastAttackSent = now;
  let best = null, bestD = CLASS_RANGE() + 1;
  for (const s of Object.values(stones)) {
    const d = Math.hypot(s.x - me.group.position.x, s.z - me.group.position.z);
    if (d < bestD) { best = s; bestD = d; }
  }
  if (best) me.ry = Math.atan2(best.x - me.group.position.x, best.z - me.group.position.z) + FACE_OFFSET;
  socket.emit('attack');
}
let alertBox = (msg) => toast(msg);

// giriş ekranı oyun yüklenene kadar bekler
export const ready = Promise.all([modelReady, itemsReady]);
export const modelLoaded = () => !!gltf;

// main.js çağırır: sunucuya bağlanmış soketle oyunu başlatır
export function startGame(sock, opts = {}) {
  socket = sock;
  if (opts.onKicked) alertBox = opts.onKicked;
  socket.on('welcome', (data) => {
    myClass = data.me.cls || 'savasci';
    document.getElementById('myclass').textContent = (CLASSES[myClass] || {}).name || '';
    if (opts.onWelcome) opts.onWelcome();
  });
  socket.on('welcome', (data) => {
    myId = data.id;
    for (const p of Object.values(data.players)) createPlayer(p);
    for (const s of Object.values(data.stones)) createStone(s);
    for (const d of data.drops) createDrop(d);
    const me = players[myId];
    document.getElementById('myname').textContent = me.name;
    setStats(data.me.level, data.me.exp, data.me.need);
    log('<b>Sistem:</b> Atabis Köyü\'ne hoş geldin! Metin taşlarını kır, düşen eşyaları topla.');
  });
  socket.on('inv', (data) => { Object.assign(inv, data); renderInv(); });
  socket.on('notice', (t) => toast(t));
  socket.on('look', ({ id, look }) => { const p = players[id]; if (p) applyLook(p, look); });
  socket.on('playerJoin', (p) => { if (myId) { createPlayer(p); log(`<b>${esc(p.name)}</b> oyuna katıldı.`); } });
  socket.on('playerLeave', ({ id }) => removePlayer(id));
  socket.on('state', (list) => {
    if (!myId) return;
    document.getElementById('count').textContent = list.length;
    for (const s of list) {
      if (s.id === myId) continue;
      const p = players[s.id]; if (!p) continue;
      p.target.set(s.x, 0, s.z); p.ry = s.ry; p.moving = s.moving;
    }
  });
  socket.on('correct', ({ x, z }) => { const me = players[myId]; if (me) me.group.position.set(x, 0, z); });
  socket.on('swing', ({ id, combo, target }) => {
    const p = players[id]; if (!p) return;
    if (p.cls === 'okcu' && target && stones[target]) shootArrow(p, stones[target]);
    p.swingT = SWING_T; p.combo = combo || 0;
    if (p.cls !== 'okcu') p.slashT = 0.3;
  });
  socket.on('stoneSpawn', (s) => { if (myId) createStone(s); });
  socket.on('hit', ({ stoneId, dmg, crit, hp }) => {
    const s = stones[stoneId]; if (!s) return;
    s.hp = hp; s.label.hp.style.width = (100 * hp / s.max) + '%'; s.shake = 0.2;
    floatText((crit ? 'KRİTİK ' : '') + '-' + dmg, s.x, 4.4, s.z, crit);
  });
  socket.on('stoneDown', ({ stoneId, by, name, stoneName }) => {
    removeStone(stoneId);
    log(by === myId ? `<b>Sistem:</b> ${esc(stoneName)}'ni kırdın! Ganimetleri topla.` : `<b>${esc(name)}</b> bir ${esc(stoneName)} kırdı.`);
  });
  socket.on('drop', (d) => { if (myId) createDrop(d); });
  socket.on('dropGone', ({ id }) => removeDrop(id));
  socket.on('playerStats', ({ id, level, exp, need, up }) => {
    const p = players[id]; if (!p) return;
    p.level = level; updateLabelText(p);
    if (id === myId) {
      setStats(level, exp, need);
      if (up) { log(`<b>Sistem:</b> Seviye atladın! Artık Sv. ${level}.`); floatText('SEVİYE ' + level, p.group.position.x, 3, p.group.position.z, true); }
    }
  });
  socket.on('chat', ({ name, text }) => log(`<b>${esc(name)}:</b> ${esc(text)}`));
  socket.on('disconnect', (reason) => { if (reason !== 'io client disconnect') log('<b>Sistem:</b> Sunucu bağlantısı koptu, yeniden bağlanılıyor…'); });
  socket.on('connect', () => { if (myId) location.reload(); });
  socket.on('kicked', (msg) => { alertBox(msg); });
}

function setStats(level, exp, need) {
  document.getElementById('lv').textContent = level;
  document.getElementById('expbar').style.width = Math.min(100, 100 * exp / need) + '%';
}

// ---------- çarpışma ----------
function collide(pos) {
  for (const c of colliders) {
    if (pos.x > c.x0 && pos.x < c.x1 && pos.z > c.z0 && pos.z < c.z1) {
      const dl = pos.x - c.x0, dr = c.x1 - pos.x, dt = pos.z - c.z0, db = c.z1 - pos.z;
      const m = Math.min(dl, dr, dt, db);
      if (m === dl) pos.x = c.x0; else if (m === dr) pos.x = c.x1; else if (m === dt) pos.z = c.z0; else pos.z = c.z1;
    }
  }
  const all = circles.concat(Object.values(stones).map((s) => ({ x: s.x, z: s.z, r: 1.8 })));
  for (const c of all) {
    const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), r = c.r + 0.45;
    if (d < r && d > 0.0001) { pos.x = c.x + dx / d * r; pos.z = c.z + dz / d * r; }
  }
  pos.x = Math.max(u(-6), Math.min(u(26), pos.x));
  pos.z = Math.max(u(-6), Math.min(u(26), pos.z));
}

// ---------- oklar ----------
const arrows = [];
const arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 4);
arrowGeo.rotateX(Math.PI / 2);
const arrowMat = new THREE.MeshBasicMaterial({ color: '#f4e2b8' });
function shootArrow(p, stone) {
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  const from = p.group.position.clone(); from.y = 1.4;
  const to = new V3(stone.x, 2.0, stone.z);
  m.position.copy(from); m.lookAt(to);
  scene.add(m);
  arrows.push({ m, from, to, t: 0, dur: Math.max(0.12, from.distanceTo(to) / 40) });
}
function updateArrows(dt) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    a.m.position.lerpVectors(a.from, a.to, k);
    if (k >= 1) { scene.remove(a.m); arrows.splice(i, 1); }
  }
}

// ---------- ana döngü ----------
const clock = new THREE.Clock();
const camRight = new V3(1, 0, -1).normalize();
const camFwd = new V3(-1, 0, -1).normalize();
const camPos = new V3();
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  const me = players[myId];

  if (me) {
    if (atkHeld) attack();
    let ix = input.x, iy = input.y;
    if (keys.w || keys.arrowup) iy = -1; if (keys.s || keys.arrowdown) iy = 1;
    if (keys.a || keys.arrowleft) ix = -1; if (keys.d || keys.arrowright) ix = 1;
    const mag = Math.min(1, Math.hypot(ix, iy));
    const moving = mag > 0.15 && me.swingT <= 0;   // saldırırken yürünmez
    if (moving) {
      const dir = new V3().addScaledVector(camRight, ix).addScaledVector(camFwd, -iy).normalize();
      me.group.position.addScaledVector(dir, SPEED * CLASS_SPEED() * mag * dt);
      collide(me.group.position);
      me.ry = Math.atan2(dir.x, dir.z) + FACE_OFFSET;
    }
    me.moving = moving;
    if (now - lastSent > 100 && (moving || lastMoving || now - lastSent > 1000)) {
      socket.emit('move', { x: me.group.position.x, z: me.group.position.z, ry: me.ry, moving });
      lastSent = now; lastMoving = moving;
    }
    // yakındaki ganimeti otomatik topla
    for (const d of Object.values(drops)) {
      if (now - d.lastTry < 1500) continue;
      if (d.owner !== myId && now - d.born < 15500) continue;   // başkasının ganimeti, süresi dolsun
      if (Math.hypot(d.x - me.group.position.x, d.z - me.group.position.z) < 1.8) { d.lastTry = now; socket.emit('pickup', d.id); }
    }
    camPos.copy(me.group.position).add(CAM_OFFSET);
    camera.position.lerp(camPos, 1 - Math.exp(-8 * dt));
    camera.lookAt(camera.position.x - CAM_OFFSET.x, 1.2, camera.position.z - CAM_OFFSET.z);
    sun.position.set(me.group.position.x + 12, 25, me.group.position.z + 6);
    sun.target.position.copy(me.group.position);
  } else {
    camera.position.set(u(10) + 14, 16, u(10) + 14);
    camera.lookAt(u(10), 0, u(10));
  }

  for (const p of Object.values(players)) {
    if (p.id !== myId) p.group.position.lerp(p.target, 1 - Math.exp(-10 * dt));
    p.group.rotation.y = angleLerp(p.group.rotation.y, p.ry, 1 - Math.exp(-14 * dt));
    setAnim(p, p.moving && p.swingT <= 0 ? 'Run' : 'Idle');
    if (p.mixer) p.mixer.update(dt);
    if (p.swingT > 0) p.swingT = Math.max(0, p.swingT - dt);
    applySwing(p);
    if (p.slashT > 0) {
      p.slashT -= dt;
      p.slash.material.opacity = Math.max(0, p.slashT / 0.3) * 0.7;
    } else p.slash.material.opacity = 0;
    placeLabel(p.label, p.group.position.x, 2.4, p.group.position.z);
  }
  for (const s of Object.values(stones)) {
    if (s.shake > 0) { s.shake -= dt; s.rock.position.x = (Math.random() - 0.5) * 0.25; } else s.rock.position.x = 0;
    placeLabel(s.label, s.x, 4.6, s.z);
  }
  for (const d of Object.values(drops)) {
    d.t += dt;
    d.spin.rotation.y += dt * 1.5;
    d.group.position.y = Math.sin(d.t * 3) * 0.08;
    placeLabel(d.label, d.x, 1.3, d.z);
  }
  updateArrows(dt);
  renderer.render(scene, camera);
}
loop();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
