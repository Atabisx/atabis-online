// ATABİS ONLINE – 3D istemci (Three.js)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mat, esc } from './util.js';
import { loadMap, colliders, circles, BOUNDS } from './world/map.js';
import { buildMob } from './entities/mobs.js';

let FACE_OFFSET = Math.PI;     // model yüklenince otomatik hesaplanır
const SPEED = 6;               // metre / saniye
const ATTACK_RANGE = 4.4;

// ---------- sahne ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 220);

scene.add(new THREE.HemisphereLight('#dfefff', '#4a6a35', 1.1));
const sun = new THREE.DirectionalLight('#fff3dc', 2.0);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -24; sun.shadow.camera.right = 24;
sun.shadow.camera.top = 24; sun.shadow.camera.bottom = -24;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 90;
scene.add(sun, sun.target);

// harita verisi (sunucuyla aynı dosya)
let MAPS = [];
let SKILLS = {};
let currentMap = null, mapInfo = { portals: [], npcs: [] };


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
  while (logEl.children.length > 5) logEl.firstChild.remove();
}


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
  fetch('/shared/maps.json').then((r) => r.json()).then((j) => { MAPS = j; }),
  fetch('/shared/mobs.json').then((r) => r.json()).then((j) => { MOBS = j; }),
  fetch('/shared/skills.json').then((r) => r.json()).then((j) => { SKILLS = j; }),
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
  const obj = { id: p.id, name: p.name, cls: p.cls, level: p.level || 1, npc: !!p.npc, dead: !!p.dead, group, mixer: null, actions: {}, current: 'Idle',
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
    color: p.npc ? '#7be08f' : p.id === myId ? '#e8b54a' : '#8ec5ff', transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07;
  group.add(ring);
  const slash = new THREE.Mesh(new THREE.RingGeometry(1.0, 2.3, 24, 1, Math.PI * 0.15, Math.PI * 0.7),
    new THREE.MeshBasicMaterial({ color: '#fff4d0', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  slash.rotation.x = -Math.PI / 2; slash.position.y = 1.1;
  group.add(slash);
  obj.slash = slash;
  group.position.set(p.x, 0, p.z);
  scene.add(group);
  obj.label = makeLabel(p.npc ? p.name : `${p.name} · Sv. ${obj.level}`, p.npc ? '#7be08f' : p.id === myId ? '#e8b54a' : '#8ec5ff', !p.npc);
  if (obj.label.hp) { obj.label.hp.parentNode.classList.add('player'); obj.label.hp.style.width = (p.maxHp ? 100 * p.hp / p.maxHp : 100) + '%'; }
  players[p.id] = obj;
  applyLook(obj, p.look);
  return obj;
}
// at: binince karakterin altına at modeli gelir
function setMount(p, on) {
  p.mounted = on;
  if (on && !p.horse) {
    p.horse = buildMob({ shape: 'horse', color: '#6b4a2e', scale: 1 }, null);
    p.group.add(p.horse.root);
  }
  if (p.horse) p.horse.root.visible = on;
  if (p.model) p.model.parent.position.y = (calib ? -calib.minY / calib.k : 0) + (on ? 1.0 : 0);
}
// balık tutarken elde olta
function setRod(p, on) {
  if (p.rod) { p.rod.parent && p.rod.parent.remove(p.rod); p.rod = null; }
  if (!on || !calib || !p.boneMap) return;
  const bone = p.boneMap[calib.sword.bone]; if (!bone) return;
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.022, 2.4, 5), mat('#8a6440'));
  pole.position.y = 1.0; g.add(pole);
  g.position.copy(calib.sword.p); g.quaternion.copy(calib.sword.q); g.scale.multiply(calib.sword.s);
  bone.add(g); p.rod = g;
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


// ---------- yaratıklar ----------
const mobs = {};
let MOBS = {};

// insansı yaratıklar (haydut, şövalye, iskelet...) asker modelinin boyanmış kopyasıdır
function humanoidMob(def) {
  const root = new THREE.Group();
  if (!gltf) {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), mat(def.color));
    body.position.y = 0.9; body.castShadow = true; root.add(body);
    return { root, update() {} };
  }
  const model = SkeletonUtils.clone(gltf.scene);
  const tint = new THREE.Color(def.shape === 'skeleton' ? '#e8e2d0' : def.color);
  const boneMap = {};
  model.traverse((o) => {
    if (o.isBone) boneMap[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true;
      o.material = [].concat(o.material).map((m) => { const c = m.clone(); c.color.lerp(tint, def.shape === 'skeleton' ? 0.85 : 0.65); return c; });
      if (o.material.length === 1) o.material = o.material[0];
    }
  });
  const wrap = new THREE.Group();
  wrap.add(model);
  if (calib) {
    wrap.scale.setScalar(1 / calib.k); wrap.position.y = -calib.minY / calib.k;
    const bone = boneMap[calib.sword.bone];
    if (bone) {
      const w = swordMesh({ color: def.boss ? '#ffb347' : '#9aa3ad', len: 0.9, glow: def.boss });
      w.position.copy(calib.sword.p); w.quaternion.copy(calib.sword.q); w.scale.multiply(calib.sword.s);
      bone.add(w);
    }
  }
  const turn = new THREE.Group(); turn.rotation.y = FACE_OFFSET; turn.add(wrap);
  root.add(turn);
  const mixer = new THREE.AnimationMixer(model);
  const actions = {};
  for (const clip of gltf.animations) actions[clip.name] = mixer.clipAction(clip);
  let current = 'Idle';
  if (actions.Idle) actions.Idle.play();
  return {
    root,
    update(t, moving, atk, dt) {
      const want = moving ? 'Run' : 'Idle';
      if (want !== current && actions[want]) {
        actions[want].reset().play();
        if (actions[current]) actions[want].crossFadeFrom(actions[current], 0.2, false);
        current = want;
      }
      mixer.update(dt);
      wrap.rotation.x = atk * 0.35;
    },
  };
}

function createMob(m) {
  if (mobs[m.id]) return;
  const def = MOBS[m.key];
  if (!def) return;
  const v = buildMob(def, humanoidMob);
  v.root.position.set(m.x, 0, m.z);
  v.root.rotation.y = m.ry || 0;
  scene.add(v.root);
  const label = makeLabel(`${def.name} · Sv. ${def.lv}`, def.boss ? '#ff6a3d' : (def.aggro ? '#ffb4a3' : '#f4f1e8'), true);
  if (def.boss) label.el.classList.add('boss');
  label.hp.style.width = (100 * m.hp / m.max) + '%';
  mobs[m.id] = { id: m.id, key: m.key, def, v, label, hp: m.hp, max: m.max, target: new THREE.Vector3(m.x, 0, m.z),
                 ry: m.ry || 0, moving: false, atkT: 0, t: Math.random() * 10, height: (def.shape === 'flyer' ? 3.2 : 2.2) * (def.scale || 1) };
}
function removeMob(id) {
  const m = mobs[id]; if (!m) return;
  scene.remove(m.v.root); m.label.el.remove(); delete mobs[id];
}
function updateMobs(dt) {
  for (const m of Object.values(mobs)) {
    m.t += dt;
    m.v.root.position.lerp(m.target, 1 - Math.exp(-10 * dt));
    m.v.root.rotation.y = angleLerp(m.v.root.rotation.y, m.ry, 1 - Math.exp(-10 * dt));
    if (m.atkT > 0) m.atkT = Math.max(0, m.atkT - dt);
    const atk = m.atkT > 0 ? Math.sin((1 - m.atkT / 0.4) * Math.PI) : 0;
    m.v.update(m.t, m.moving, atk, dt);
    placeLabel(m.label, m.v.root.position.x, m.height + 0.4, m.v.root.position.z);
  }
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
  } else if (def.slot === 'helmet') {
    shape = helmetMesh(def); shape.position.y = 0.2; shape.scale.setScalar(1.4);
  } else if (def.slot === 'potion') {
    shape = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 8), new THREE.MeshLambertMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.4 }));
    shape.position.y = 0.2;
  } else if (def.slot === 'shoes') {
    shape = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.36), mat(def.color)); shape.position.y = 0.15;
  } else {
    shape = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 14), new THREE.MeshStandardMaterial({ color: def.color, metalness: 0.8, roughness: 0.25 }));
    shape.position.y = 0.3;
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
  const label = makeLabel(def ? def.name + (d.n > 1 ? ' x' + d.n : '') : `${d.yang} Yang`, def ? RARITY[def.rarity] : '#ffe08a', false);
  label.el.style.fontSize = '10px';
  drops[d.id] = { ...d, ...m, label, lastTry: 0, t: Math.random() * 6, born: performance.now() };
}
function removeDrop(id) {
  const d = drops[id]; if (!d) return;
  scene.remove(d.group); d.label.el.remove(); delete drops[id];
}


// ---------- envanter arayüzü ----------
const inv = { inventory: [], equip: {}, yang: 0, atk: 0, def: 0, maxHp: 0 };
let myLevel = 1;
let selected = null;   // {uid} veya {slot}
const EQUIP = ['weapon', 'armor', 'helmet', 'shoes', 'bracelet', 'earring'];
const BONUS_NAMES = { maxhp: ['Maks. Can', ''], maxmp: ['Maks. Mana', ''], atk: ['Saldırı', ''], def: ['Savunma', ''], crit: ['Kritik', '%'],
  atkspeed: ['Saldırı Hızı', '%'], movespeed: ['Hareket Hızı', '%'], monster: ['Canavarlara Güç', '%'], hpsteal: ['Can Çalma', '%'] };
const SLOT_NAMES = { weapon: 'Silah', armor: 'Zırh', helmet: 'Miğfer', shoes: 'Ayakkabı', bracelet: 'Bilezik', earring: 'Küpe', potion: 'İksir', use: 'Kullanılır', fish: 'Balık', gem: 'Değerli taş' };
const ICONS = {
  weapon: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5"/><path d="m13 19 6-6"/><path d="m16 16 4 4"/><path d="m19 21 2-2"/>',
  armor: '<path d="M8 3 4 6v5l3 1v9h10v-9l3-1V6l-4-3-2 2h-4z"/>',
  helmet: '<path d="M4 15a8 8 0 0 1 16 0v3H4z"/><path d="M12 7v-3"/>',
  shoes: '<path d="M4 4h6v9l9 3v4H4z"/>',
  bracelet: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="4"/>',
  earring: '<path d="M12 3v5"/><circle cx="12" cy="14" r="5"/>',
  potion: '<path d="M9 3h6"/><path d="M10 3v5L6 15a5 5 0 0 0 4.5 6h3A5 5 0 0 0 18 15l-4-7V3"/>',
  use: '<path d="M12 3l2.5 5.5L20 9l-4 4 1 6-5-3-5 3 1-6-4-4 5.5-.5z"/>',
  fish: '<path d="M3 12c4-6 11-6 15 0-4 6-11 6-15 0z"/><path d="M18 12l3-3v6z"/>',
  gem: '<circle cx="12" cy="12" r="6"/><circle cx="10" cy="10" r="1.5"/>',
};
function iconSvg(def, size = 26, slot) {
  const c = def ? (def.color === '#ffffff' ? '#d9cfb8' : def.color) : '#5a5e55';
  const s = def ? def.slot : slot || 'weapon';
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[s] || ICONS.weapon}</svg>`;
}
function statText(def) {
  const parts = [];
  if (def.heal) parts.push(`+${def.heal} can`);
  if (def.mana) parts.push(`+${def.mana} mana`);
  if (def.buff) parts.push(def.desc);
  if (def.slot === 'fish' || def.slot === 'gem') parts.push(`Satış: ${Math.floor(def.price * 0.25).toLocaleString('tr-TR')} Yang`);
  if (def.atk) parts.push(`Saldırı +${def.atk}`);
  if (def.def) parts.push(`Savunma +${def.def}`);
  if (def.hp) parts.push(`Can +${def.hp}`);
  return parts.join(' · ');
}
function reqText(def) {
  if (!def.lv || def.slot === 'potion') return '';
  const ok = myLevel >= def.lv;
  return `<span style="color:${ok ? '#8b877c' : '#ff6a5a'}">Sv. ${def.lv}</span>`;
}
const invEl = document.getElementById('inv'), gridEl = document.getElementById('grid'), detailEl = document.getElementById('detail');
function renderInv() {
  document.getElementById('yang').textContent = `${inv.yang.toLocaleString('tr-TR')} Yang`;
  const eqEl = document.getElementById('equipcol');
  eqEl.querySelectorAll('.eq').forEach((el) => {
    const slot = el.dataset.slot, it = inv.equip[slot], def = it ? ITEMS[it.key] : null;
    el.innerHTML = `${iconSvg(def, 22, slot)}<span>${def ? `<span style="color:${RARITY[def.rarity]}">${esc(def.name)}</span>` : 'Boş'}<small>${SLOT_NAMES[slot]}</small></span>`;
    el.classList.toggle('sel', !!(selected && selected.slot === slot));
  });
  document.getElementById('stats').innerHTML = `Saldırı <b>${inv.atk}</b> · Savunma <b>${inv.def}</b> · Can <b>${inv.maxHp}</b>`;
  let html = '';
  for (let i = 0; i < 32; i++) {
    const it = inv.inventory[i];
    if (it) {
      const def = ITEMS[it.key] || { name: '?', rarity: 0 };
      const sel = selected && selected.uid === it.uid ? ' sel' : '';
      html += `<button class="slot${sel}" data-uid="${it.uid}" aria-label="${esc(def.name)}" style="border-color:${sel ? '' : RARITY[def.rarity] + '66'}">${iconSvg(def)}${it.n > 1 ? `<i class="cnt">${it.n}</i>` : ''}</button>`;
    } else html += '<div class="slot" aria-hidden="true"></div>';
  }
  gridEl.innerHTML = html;
  renderDetail();
  updatePotionButton();
}
function renderDetail() {
  let it = null, equipped = false;
  if (selected && selected.uid != null) it = inv.inventory.find((x) => x.uid === selected.uid);
  if (selected && selected.slot) { it = inv.equip[selected.slot]; equipped = true; }
  if (!it) { detailEl.innerHTML = '<span class="grow" style="color:#8b877c">Bir eşyaya dokun.</span>'; return; }
  const def = ITEMS[it.key];
  let cls = '';
  if (def.classes) cls = ' · ' + def.classes.map((c) => (CLASSES[c] || {}).name || c).join(', ');
  let buttons;
  if (equipped) buttons = '<button data-act="unequip">Çıkar</button>';
  else if (def.slot === 'potion' || def.slot === 'use') buttons = '<button data-act="use">Kullan</button><button class="alt" data-act="drop">Yere at</button>';
  else if (def.slot === 'fish' || def.slot === 'gem') buttons = '<button class="alt" data-act="drop">Yere at</button>';
  else buttons = '<button data-act="equip">Giy</button><button class="alt" data-act="drop">Yere at</button>';
  detailEl.innerHTML = `<span class="grow"><b style="color:${RARITY[def.rarity]}">${esc(def.name)}${it.n > 1 ? ' x' + it.n : ''}</b><br>` +
    `<span style="color:#c9c4b6">${SLOT_NAMES[def.slot] || ''} · ${statText(def)}</span> ${reqText(def)}<span style="color:#8b877c">${esc(cls)}</span>` +
    (def.desc ? `<br><small style="color:#8b877c">${esc(def.desc)}</small>` : '') +
    (it.bon && it.bon.length ? '<br>' + it.bon.map(([t, v]) => `<small style="color:#c86bff">${BONUS_NAMES[t] ? BONUS_NAMES[t][0] : t} +${v}${BONUS_NAMES[t] ? BONUS_NAMES[t][1] : ''}</small>`).join(' · ') : '') +
    '</span>' + buttons +
    (EQUIP.includes(def.slot) && inv.inventory.some((x) => x.key === 'efsun') ? '<button class="alt" data-act="enchant" style="color:#c86bff">Efsunla</button>' : '');
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
  const b = e.target.closest('[data-act]'); if (!b || !selected || !socket) return;
  const it = selected.uid != null ? inv.inventory.find((x) => x.uid === selected.uid) : null;
  if (b.dataset.act === 'equip') socket.emit('equip', selected.uid);
  if (b.dataset.act === 'unequip') socket.emit('unequip', selected.slot);
  if (b.dataset.act === 'drop') socket.emit('dropItem', selected.uid);
  if (b.dataset.act === 'use' && it) { socket.emit('useItem', it.uid); return; }
  if (b.dataset.act === 'enchant') { socket.emit('enchant', selected.slot ? { slot: selected.slot } : { uid: selected.uid }); return; }
  selected = null;
});
const toastEl = document.getElementById('toast');
let toastTimer = null;
function toast(text) {
  toastEl.textContent = text; toastEl.style.opacity = '1';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { toastEl.style.opacity = '0'; }, 2400);
}

// ---------- dükkân ve ışınlayıcı ----------
const shopEl = document.getElementById('shop'), shopList = document.getElementById('shopList'), shopTitle = document.getElementById('shopTitle');
let shopKind = null;
function openShop(kind, title) {
  shopKind = kind;
  shopTitle.textContent = title;
  renderShop();
  shopEl.classList.add('open');
}
function renderShop() {
  if (!shopKind || !currentMap) return;
  const shop = currentMap.shop;
  let html = '';
  if (shopKind === 'stable') {
    const q = quests;
    const st = q.horse;
    let body;
    if (!st && myLevel < 25) body = '<p class="muted">Ata binmek için önce 25. seviyeye ulaş. Sonra gel, sana bir görevim olacak.</p>';
    else if (st === 'available' || (!st && myLevel >= 25)) body = '<p>Kızılçam Köyü\'nün çevresindeki <b>Vahşi Kurt</b>lar atlarımıza saldırıyor. <b>20</b> tanesini yen, sana kendi atını vereyim.</p><button class="btn" data-quest="accept">Görevi kabul et</button>';
    else if (st === 'active') body = `<p>Vahşi Kurt: <b>${q.horseKills || 0} / 20</b></p><p class="muted">Kızılçam Köyü (Sv. 15) çevresinde bulabilirsin.</p>`;
    else if (st === 'ready') body = '<p>Harika iş çıkardın! Atın seni bekliyor.</p><button class="btn" data-quest="claim">At Mührü\'nü al</button>';
    else body = '<p>Atına iyi bak. Envanterindeki At Mührü ile binip inebilirsin. Atlıyken saldırırsan ya da beceri kullanırsan atından inersin.</p>';
    html = `<div style="display:flex;flex-direction:column;gap:10px;font-size:14px;line-height:1.5">${body}</div>`;
  } else if (shopKind === 'teleport') {
    for (const m of MAPS) {
      const here = m.id === currentMap.id, ok = myLevel >= m.minLevel;
      html += `<div class="srow"><span class="grow"><b>${esc(m.name)}</b>${m.village ? ' <small>(köy)</small>' : ''}<br><small style="color:${ok ? '#8b877c' : '#ff6a5a'}">Sv. ${m.minLevel}+</small></span>` +
        (here ? '<small>Buradasın</small>' : `<button data-tp="${m.id}" ${ok ? '' : 'disabled'}>Git</button>`) + '</div>';
    }
  } else if (shopKind === 'sell') {
    if (!inv.inventory.length) html = '<p class="muted">Satacak eşyan yok.</p>';
    for (const it of inv.inventory) {
      const def = ITEMS[it.key]; if (!def) continue;
      const value = (def.price ? Math.floor(def.price * 0.25) : def.tier != null ? 100 * (def.tier + 1) * (def.tier + 1) : 10) * (it.n || 1);
      html += `<div class="srow">${iconSvg(def, 22)}<span class="grow"><b style="color:${RARITY[def.rarity]}">${esc(def.name)}${it.n > 1 ? ' x' + it.n : ''}</b><br><small>${statText(def)}</small></span>` +
        `<button class="alt" data-sell="${it.uid}">Sat ${value.toLocaleString('tr-TR')}</button></div>`;
    }
  } else {
    const keys = shop ? shop[shopKind] || [] : [];
    for (const key of keys) {
      const def = ITEMS[key]; if (!def) continue;
      const afford = inv.yang >= def.price;
      let cls = '';
      if (def.classes) cls = ' · ' + def.classes.map((c) => (CLASSES[c] || {}).name || c).join(', ');
      html += `<div class="srow">${iconSvg(def, 22)}<span class="grow"><b style="color:${RARITY[def.rarity]}">${esc(def.name)}</b> ${reqText(def)}<br><small>${statText(def)}${esc(cls)}</small></span>` +
        `<button data-buy="${key}" ${afford ? '' : 'disabled'}>${def.price.toLocaleString('tr-TR')}</button>` +
        (def.stack ? `<button data-buy="${key}" data-n="10" ${inv.yang >= def.price * 10 ? '' : 'disabled'}>x10</button>` : '') + '</div>';
    }
  }
  shopList.innerHTML = html;
  document.getElementById('shopYang').textContent = `${inv.yang.toLocaleString('tr-TR')} Yang`;
  document.getElementById('shopTabs').style.display = shopKind === 'teleport' || shopKind === 'stable' ? 'none' : 'flex';
  document.querySelectorAll('#shopTabs button').forEach((b) => {
    const list = shop && shop[b.dataset.tab];
    b.style.display = b.dataset.tab === 'sell' || (list && list.length) ? '' : 'none';
  });
  document.querySelectorAll('#shopTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === shopKind));
}
shopList.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !socket) return;
  if (b.dataset.quest) socket.emit('quest', b.dataset.quest);
  if (b.dataset.buy) socket.emit('buy', { key: b.dataset.buy, n: Number(b.dataset.n || 1) });
  if (b.dataset.sell) socket.emit('sell', Number(b.dataset.sell));
  if (b.dataset.tp) { socket.emit('teleport', Number(b.dataset.tp)); shopEl.classList.remove('open'); }
});
document.getElementById('shopTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  shopKind = b.dataset.tab; renderShop();
});
document.getElementById('shopClose').addEventListener('click', () => { shopEl.classList.remove('open'); shopKind = null; });

// ---------- can barı, iksir, konuşma, ölüm ----------
const hpBar = document.getElementById('hpbar'), hpText = document.getElementById('hptext');
function setHp(hp, max) {
  hpBar.style.width = Math.max(0, Math.min(100, 100 * hp / max)) + '%';
  hpText.textContent = `${hp} / ${max}`;
}
const potBtn = document.getElementById('potBtn');
function updatePotionButton() {
  const n = inv.inventory.filter((i) => i.key && i.key.startsWith('p_hp')).reduce((a, i) => a + (i.n || 1), 0);
  document.getElementById('potCount').textContent = n;
  potBtn.classList.toggle('empty', n === 0);
  const m = inv.inventory.filter((i) => i.key && i.key.startsWith('p_mp')).reduce((a, i) => a + (i.n || 1), 0);
  document.getElementById('mpCount').textContent = m;
  document.getElementById('mpBtn').classList.toggle('empty', m === 0);
  if (typeof updateToolButtons === 'function') updateToolButtons();
}
potBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (socket) socket.emit('usePotion', 'hp'); });
const mpBtn = document.getElementById('mpBtn');
mpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (socket) socket.emit('usePotion', 'mp'); });
const mpBarEl = document.getElementById('mpbar'), mpTextEl = document.getElementById('mptext');
function setMp(mp, max) {
  mpBarEl.style.width = Math.max(0, Math.min(100, 100 * mp / max)) + '%';
  mpTextEl.textContent = `${mp} / ${max}`;
  myMp = mp;
}
let myMp = 0;
let quests = {};
// güçlendirme göstergesi
const buffsEl = document.getElementById('buffs');
let buffList = {}, buffAt = 0;
const BUFF_NAMES = { atk: 'Saldırı', def: 'Savunma', atkspeed: 'Saldırı hızı', movespeed: 'Hareket hızı', crit: 'Kritik' };
function renderBuffs() {
  const passed = (performance.now() - buffAt) / 1000;
  buffsEl.innerHTML = Object.entries(buffList).map(([stat, b]) => {
    const left = Math.max(0, Math.round(b.left - passed));
    return left > 0 ? `<span>${BUFF_NAMES[stat] || stat} +${b.value}${stat === 'atk' || stat === 'def' ? '' : '%'} · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>` : '';
  }).join('');
}
setInterval(renderBuffs, 1000);

// ---------- beceriler ----------
const skillbarEl = document.getElementById('skillbar'), skillwinEl = document.getElementById('skillwin');
let skillState = { levels: {}, points: 0, unlock: 5 };
const skillCdUntil = {};
const skLabel = (lv) => (lv > 17 ? 'M' + (lv - 17) : String(lv));
function mySkills() { return SKILLS[myClass] || []; }
function renderSkillbar() {
  skillbarEl.innerHTML = mySkills().map((sk, i) => {
    const lv = skillState.levels[sk.key] || 0;
    const short = sk.name.split(' ').map((w) => w[0]).join('').slice(0, 2);
    return `<button class="skb${lv ? '' : ' locked'}" data-sk="${sk.key}" aria-label="${esc(sk.name)}" style="border-color:${sk.color}"><span style="color:${sk.color}">${esc(short)}</span><span class="cd" id="cd_${sk.key}"></span><span class="lv">${lv ? skLabel(lv) : ''}</span></button>`;
  }).join('');
  const pts = document.getElementById('skillPts');
  pts.textContent = skillState.points; pts.style.display = skillState.points > 0 && myLevel >= skillState.unlock ? '' : 'none';
}
function renderSkillWin() {
  document.getElementById('skillPtsText').textContent = myLevel < skillState.unlock ? `${skillState.unlock}. seviyede açılır` : `Puan: ${skillState.points}`;
  document.getElementById('skillList').innerHTML = mySkills().map((sk) => {
    const lv = skillState.levels[sk.key] || 0;
    const mp = sk.mp + sk.mpLv * Math.max(0, lv - 1);
    const can = myLevel >= skillState.unlock && skillState.points > 0 && lv < 20;
    return `<div class="sk-row"><span class="badge" style="color:${sk.color}">${lv ? skLabel(lv) : '–'}</span><span class="grow"><b>${esc(sk.name)}</b><br><small>${esc(sk.desc)}</small><br><small>Mana ${mp} · Bekleme ${sk.cd} sn</small></span><button data-up="${sk.key}" ${can ? '' : 'disabled'} aria-label="${esc(sk.name)} seviyesini artır">+</button></div>`;
  }).join('');
}
skillbarEl.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-sk]'); if (!b) return;
  e.preventDefault();
  useSkill(b.dataset.sk);
});
document.getElementById('skillBtn').addEventListener('click', () => { renderSkillWin(); skillwinEl.classList.add('open'); });
document.getElementById('skillClose').addEventListener('click', () => skillwinEl.classList.remove('open'));
document.getElementById('skillList').addEventListener('click', (e) => {
  const b = e.target.closest('[data-up]'); if (b && socket) socket.emit('skillUp', b.dataset.up);
});
function updateSkillCooldowns() {
  const now = performance.now();
  for (const sk of mySkills()) {
    const el = document.getElementById('cd_' + sk.key); if (!el) continue;
    const c = skillCdUntil[sk.key];
    el.style.height = c && c.until > now ? (100 * (c.until - now) / c.total) + '%' : '0';
  }
}

// ---------- at ve balık butonları ----------
const mountBtn = document.getElementById('mountBtn'), fishBtn = document.getElementById('fishBtn');
mountBtn.addEventListener('click', () => {
  const it = inv.inventory.find((i) => i.key === 'at_muhru');
  if (it && socket) socket.emit('useItem', it.uid);
});
let fishState = 'idle';
fishBtn.addEventListener('pointerdown', (e) => {
  e.preventDefault(); if (!socket) return;
  if (fishState === 'idle') socket.emit('fishCast');
  else if (fishState === 'bite' || fishState === 'wait') socket.emit('fishPull');
});
function setFishState(st) {
  fishState = st;
  fishBtn.classList.toggle('bite', st === 'bite');
  fishBtn.textContent = st === 'idle' ? 'Olta at' : st === 'wait' ? 'Bekle…' : 'ÇEK!';
}
function updateToolButtons() {
  mountBtn.style.display = inv.inventory.some((i) => i.key === 'at_muhru') ? 'flex' : 'none';
  mountBtn.classList.toggle('on', !!inv.mounted);
  fishBtn.style.display = currentMap && currentMap.fishing && inv.inventory.some((i) => i.key === 'olta') ? 'block' : 'none';
}
const talkBtn = document.getElementById('talkBtn');
let nearAction = null;
talkBtn.addEventListener('click', () => { if (nearAction) nearAction.run(); });
const deadEl = document.getElementById('dead');
document.getElementById('respawnBtn').addEventListener('click', () => { if (socket) socket.emit('respawn'); });


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


// ---------- kamera: tek parmakla döndür, iki parmakla yakınlaştır ----------
let camYaw = Math.PI / 4, camZoom = 1;
const CAM_H = 12, CAM_D = 12.7;
const camTouches = new Map();
let pinchStart = null;
renderer.domElement.addEventListener('pointerdown', (e) => {
  camTouches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  renderer.domElement.setPointerCapture(e.pointerId);
  if (camTouches.size === 2) {
    const [a, b] = [...camTouches.values()];
    pinchStart = { d: Math.hypot(a.x - b.x, a.y - b.y), zoom: camZoom };
  }
});
renderer.domElement.addEventListener('pointermove', (e) => {
  const prev = camTouches.get(e.pointerId); if (!prev) return;
  const cur = { x: e.clientX, y: e.clientY };
  camTouches.set(e.pointerId, cur);
  if (camTouches.size === 1) camYaw -= (cur.x - prev.x) * 0.008;
  else if (camTouches.size === 2 && pinchStart) {
    const [a, b] = [...camTouches.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    camZoom = Math.max(0.55, Math.min(1.7, pinchStart.zoom * pinchStart.d / Math.max(20, d)));
  }
});
const camEnd = (e) => { camTouches.delete(e.pointerId); if (camTouches.size < 2) pinchStart = null; };
renderer.domElement.addEventListener('pointerup', camEnd);
renderer.domElement.addEventListener('pointercancel', camEnd);
renderer.domElement.addEventListener('wheel', (e) => { camZoom = Math.max(0.55, Math.min(1.7, camZoom * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: true });
const camRight = new THREE.Vector3(), camFwd = new THREE.Vector3(), camOffset = new THREE.Vector3();
function updateCamVectors() {
  camFwd.set(-Math.sin(camYaw), 0, -Math.cos(camYaw));
  camRight.set(Math.cos(camYaw), 0, -Math.sin(camYaw));
  camOffset.set(Math.sin(camYaw) * CAM_D * camZoom, CAM_H * camZoom, Math.cos(camYaw) * CAM_D * camZoom);
}


// ---------- ağ ----------
let socket = null;
let lastSent = 0, lastMoving = false, lastAttackSent = 0;
let myClass = 'savasci', amDead = false;
const CLASS_RANGE = () => (CLASSES[myClass] && CLASSES[myClass].range) || ATTACK_RANGE;
const CLASS_SPEED = () => inv.speed || (CLASSES[myClass] && CLASSES[myClass].speed) || 1;

function attack() {
  const me = players[myId]; if (!me || !socket || amDead) return;
  const now = performance.now();
  if (now - lastAttackSent < (inv.atkCd || (myClass === 'ninja' ? 400 : 480)) + 20) return;
  lastAttackSent = now;
  // en yakın hedefe dön (yaratık ya da taş)
  let best = null, bestD = CLASS_RANGE() + 1.5;
  const pos = me.group.position;
  for (const m of Object.values(mobs)) {
    const p = m.v.root.position, d = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (d < bestD) { best = p; bestD = d; }
  }
  for (const s of Object.values(stones)) {
    const d = Math.hypot(s.x - pos.x, s.z - pos.z);
    if (d < bestD) { best = { x: s.x, z: s.z }; bestD = d; }
  }
  if (best) me.ry = Math.atan2(best.x - pos.x, best.z - pos.z) + FACE_OFFSET;
  socket.emit('attack');
}
// beceri kullan: önce en yakın hedefe dön
function useSkill(key) {
  const me = players[myId]; if (!me || !socket || amDead) return;
  const sk = mySkills().find((x) => x.key === key); if (!sk) return;
  const lv = skillState.levels[key] || 0;
  if (!lv) { toast(myLevel < skillState.unlock ? `Beceriler ${skillState.unlock}. seviyede açılır.` : 'Bu beceriyi önce beceri penceresinden öğren.'); return; }
  const c = skillCdUntil[key];
  if (c && c.until > performance.now()) return;
  const pos = me.group.position;
  if (sk.target !== 'self' && sk.target !== 'heal') {
    let best = null, bestD = (sk.range || sk.radius || 6) + 2;
    for (const m of Object.values(mobs)) {
      const p = m.v.root.position, d = Math.hypot(p.x - pos.x, p.z - pos.z);
      if (d < bestD) { best = p; bestD = d; }
    }
    for (const st of Object.values(stones)) { const d = Math.hypot(st.x - pos.x, st.z - pos.z); if (d < bestD) { best = st; bestD = d; } }
    if (best) me.ry = Math.atan2(best.x - pos.x, best.z - pos.z) + FACE_OFFSET;
  }
  socket.emit('skill', { key, f: me.ry - FACE_OFFSET });
}

// ---------- görsel efektler ----------
const effects = [];
function ringFx(x, z, r, color, dur = 0.5, y = 0.15) {
  const m = new THREE.Mesh(new THREE.RingGeometry(0.6, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z);
  scene.add(m);
  effects.push({ m, t: 0, dur, update(k) { const s = 0.3 + k * r; m.scale.set(s, s, s); m.material.opacity = 0.85 * (1 - k); } });
}
function beamFx(x, z, color, dur = 1.2, h = 6) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, h, 16, 1, true), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  m.position.set(x, h / 2, z);
  scene.add(m);
  effects.push({ m, t: 0, dur, update(k) { m.material.opacity = 0.5 * (1 - k); m.scale.set(1 + k * 0.4, 0.3 + k, 1 + k * 0.4); m.position.y = h / 2 * (0.3 + k); } });
}
function boltFx(from, to, color, dur = 0.35) {
  const a = new THREE.Vector3(from.x, 1.5, from.z), b = new THREE.Vector3(to.x, 1.5, to.z);
  const len = Math.max(0.1, Math.hypot(b.x - a.x, b.z - a.z));
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, len), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  m.position.set((a.x + b.x) / 2, 1.5, (a.z + b.z) / 2);
  m.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  scene.add(m);
  effects.push({ m, t: 0, dur, update(k) { m.material.opacity = 0.9 * (1 - k); } });
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.t += dt;
    const k = Math.min(1, e.t / e.dur);
    e.update(k);
    if (k >= 1) { scene.remove(e.m); e.m.geometry.dispose(); e.m.material.dispose(); effects.splice(i, 1); }
  }
}
function levelUpFx(p) {
  const { x, z } = p.group.position;
  beamFx(x, z, '#ffd23f', 1.6, 7);
  ringFx(x, z, 4, '#ffd23f', 0.9);
  setTimeout(() => ringFx(p.group.position.x, p.group.position.z, 5, '#fff1b8', 0.9), 250);
}
function skillDef(key) {
  for (const list of Object.values(SKILLS)) for (const sk of list) if (sk.key === key) return sk;
  return null;
}
function targetPos(id) {
  if (mobs[id]) return mobs[id].v.root.position;
  if (stones[id]) return stones[id];
  if (players[id]) return players[id].group.position;
  return null;
}
let alertBox = (msg) => toast(msg);

function clearWorld() {
  for (const id of Object.keys(players)) removePlayer(id);
  for (const id of Object.keys(mobs)) removeMob(id);
  for (const id of Object.keys(stones)) removeStone(id);
  for (const id of Object.keys(drops)) removeDrop(id);
  for (const p of mapInfo.portals) if (p.label) p.label.el.remove();
}
function enterMap(data) {
  clearWorld();
  currentMap = MAPS[data.map];
  mapInfo = loadMap(scene, currentMap);
  for (const p of mapInfo.portals) {
    const target = MAPS[p.to];
    p.label = makeLabel(`${target.name} · Sv. ${target.minLevel}+`, '#9fd8ff', false);
  }
  for (const n of mapInfo.npcs) {
    const npc = createPlayer({ id: 'npc:' + n.kind, name: n.name, cls: 'savasci', x: n.x, z: n.z, ry: 0, level: 0, npc: true,
      look: { weapon: null, armor: n.kind === 'armor' ? 'armor3' : n.kind === 'weapons' ? 'armor1' : null, helmet: null } });
    npc.ry = FACE_OFFSET; npc.group.rotation.y = FACE_OFFSET; npc.npcKind = n.kind;
  }
  for (const p of Object.values(data.players)) { const o = createPlayer(p); if (p.mounted) setMount(o, true); }
  for (const m of data.mobs) createMob(m);
  for (const s of data.stones) createStone(s);
  for (const d of data.drops) createDrop(d);
  const me = players[myId];
  if (me) {
    me.group.position.set(data.you.x, 0, data.you.z);
    updateCamVectors();
    camera.position.copy(me.group.position).add(camOffset);
  }
  document.getElementById('mapName').textContent = currentMap.name.toLocaleUpperCase('tr-TR');
  document.getElementById('mapSub').textContent = currentMap.village ? 'Köy · güvenli bölge' : `Seviye ${currentMap.minLevel}+ bölgesi`;
  shopEl.classList.remove('open');
  log(`<b>Sistem:</b> ${esc(currentMap.name)} haritasına geldin.`);
}

// giriş ekranı oyun yüklenene kadar bekler
export const ready = Promise.all([modelReady, itemsReady]);
export const modelLoaded = () => !!gltf;

// main.js çağırır: sunucuya bağlanmış soketle oyunu başlatır
export function startGame(sock, opts = {}) {
  socket = sock;
  if (opts.onKicked) alertBox = opts.onKicked;

  socket.on('welcome', (data) => {
    myId = data.id; myClass = data.cls;
    document.getElementById('myname').textContent = data.name;
    document.getElementById('myclass').textContent = (CLASSES[myClass] || {}).name || '';
    setStats(data.stats.level, data.stats.exp, data.stats.need);
    if (opts.onWelcome) opts.onWelcome();
  });
  socket.on('mapChange', (data) => { amDead = false; deadEl.classList.remove('open'); setFishState('idle'); enterMap(data); updateToolButtons(); renderSkillbar(); });
  socket.on('inv', (data) => { Object.assign(inv, data); renderInv(); if (shopKind) renderShop(); });
  socket.on('hp', ({ hp, max }) => setHp(hp, max));
  socket.on('stats', ({ level, exp, need, up }) => {
    setStats(level, exp, need);
    const me = players[myId];
    if (up && me) { me.level = level; updateLabelText(me); log(`<b>Sistem:</b> Seviye atladın! Artık Sv. ${level}.`); floatText('SEVİYE ' + level, me.group.position.x, 3, me.group.position.z, true); }
  });
  socket.on('expGain', (n) => { const me = players[myId]; if (me) floatText(`+${n} TP`, me.group.position.x, 2.6, me.group.position.z, false); });
  socket.on('notice', (t) => toast(t));
  socket.on('announce', (t) => { toast(t); log(`<b style="color:#ffb347">Duyuru:</b> ${esc(t)}`); });
  socket.on('look', ({ id, look }) => { const p = players[id]; if (p) applyLook(p, look); });
  socket.on('mp', ({ mp, max }) => setMp(mp, max));
  socket.on('skills', (data) => { skillState = data; renderSkillbar(); if (skillwinEl.classList.contains('open')) renderSkillWin(); });
  socket.on('skillCd', ({ key, until }) => { skillCdUntil[key] = { until: performance.now() + until * 1000, total: until * 1000 }; });
  socket.on('buffs', (list) => { buffList = list; buffAt = performance.now(); renderBuffs(); });
  socket.on('quests', (q) => { quests = q; if (shopKind === 'stable') renderShop(); });
  socket.on('mount', ({ id, on }) => { const p = players[id]; if (p) setMount(p, on); });
  socket.on('fishing', ({ id, on }) => { const p = players[id]; if (p) setRod(p, on); });
  socket.on('fishWait', () => setFishState('wait'));
  socket.on('fishBite', () => { setFishState('bite'); if (navigator.vibrate) navigator.vibrate(150); });
  socket.on('fishEnd', ({ ok, msg }) => { setFishState('idle'); toast(msg); });
  socket.on('playerHp', ({ id, hp, max }) => { const p = players[id]; if (p && p.label.hp) p.label.hp.style.width = Math.max(0, 100 * hp / max) + '%'; });
  socket.on('skillFx', ({ id, key, targets, x, z }) => {
    const sk = skillDef(key); if (!sk) return;
    const p = players[id];
    if (p && sk.combo != null) { p.swingT = SWING_T; p.combo = sk.combo; if (p.cls !== 'okcu') p.slashT = 0.3; }
    if (p && sk.target === 'dash') { /* konum 'correct' ile gelir */ }
    const from = p ? p.group.position : { x, z };
    if (sk.target === 'aoe' || sk.target === 'front' || sk.target === 'dash') ringFx(sk.target === 'dash' ? from.x : x, sk.target === 'dash' ? from.z : z, sk.radius, sk.color, 0.5);
    if (sk.target === 'single' || sk.target === 'multi') for (const t of targets) { const tp = targetPos(t); if (tp) { boltFx(from, tp, sk.color); ringFx(tp.x, tp.z, sk.splash || 1.5, sk.color, 0.4); } }
    if (sk.target === 'chain') { let prev = from; for (const t of targets) { const tp = targetPos(t); if (tp) { boltFx(prev, tp, sk.color, 0.45); prev = tp; } } }
    if (sk.target === 'self' || sk.target === 'heal') for (const t of targets) { const tp = targetPos(t); if (tp) beamFx(tp.x, tp.z, sk.color, 1.0, 4); }
  });
  socket.on('playerJoin', (p) => { const o = createPlayer(p); if (p.mounted) setMount(o, true); log(`<b>${esc(p.name)}</b> haritaya geldi.`); });
  socket.on('playerLeave', ({ id }) => removePlayer(id));
  socket.on('playerLevel', ({ id, level }) => { const p = players[id]; if (p) { p.level = level; updateLabelText(p); levelUpFx(p); } });
  socket.on('playerDied', ({ id }) => { const p = players[id]; if (p) p.dead = true; });
  socket.on('died', ({ village }) => {
    amDead = true;
    document.getElementById('deadText').textContent = `${village} köyünde yeniden doğacaksın.`;
    deadEl.classList.add('open');
  });
  socket.on('state', ({ p: list, m: mlist }) => {
    document.getElementById('count').textContent = list.length;
    for (const s of list) {
      if (s.id === myId) continue;
      const p = players[s.id]; if (!p) continue;
      p.target.set(s.x, 0, s.z); p.ry = s.ry; p.moving = s.moving;
      if (p.dead && s.moving) p.dead = false;
    }
    for (const [id, x, z, ry, mv] of mlist) {
      const m = mobs[id]; if (!m) continue;
      m.target.set(x, 0, z); m.ry = ry; m.moving = !!mv;
    }
  });
  socket.on('correct', ({ x, z }) => { const me = players[myId]; if (me) me.group.position.set(x, 0, z); });
  socket.on('swing', ({ id, combo, target }) => {
    const p = players[id]; if (!p) return;
    const tm = target && (mobs[target] ? mobs[target].v.root.position : stones[target] ? stones[target] : null);
    if (p.cls === 'okcu' && tm) shootArrow(p, tm);
    p.swingT = SWING_T; p.combo = combo || 0;
    if (p.cls !== 'okcu') p.slashT = 0.3;
  });
  socket.on('hit', ({ id, kind, dmg, crit, hp }) => {
    if (kind === 'mob') {
      const m = mobs[id]; if (!m) return;
      m.hp = hp; m.label.hp.style.width = (100 * hp / m.max) + '%';
      floatText((crit ? 'KRİTİK ' : '') + '-' + dmg, m.v.root.position.x, m.height + 0.6, m.v.root.position.z, crit);
    } else {
      const s = stones[id]; if (!s) return;
      s.hp = hp; s.label.hp.style.width = (100 * hp / s.max) + '%'; s.shake = 0.2;
      floatText((crit ? 'KRİTİK ' : '') + '-' + dmg, s.x, 4.4, s.z, crit);
    }
  });
  socket.on('mobSpawn', (m) => createMob(m));
  socket.on('mobDie', ({ id, by, name, mobName, boss }) => {
    removeMob(id);
    if (by === myId) log(`<b>Sistem:</b> ${esc(mobName)} yenildi.`);
    else if (boss) log(`<b>${esc(name)}</b> ${esc(mobName)} adlı boss'u yendi!`);
  });
  socket.on('mobAttack', ({ id, target, dmg }) => {
    const m = mobs[id]; if (m) m.atkT = 0.4;
    const p = players[target];
    if (p) floatText('-' + dmg, p.group.position.x, 2.4, p.group.position.z, false);
    if (target === myId) document.body.classList.add('hurt'), setTimeout(() => document.body.classList.remove('hurt'), 180);
  });
  socket.on('mobHeal', ({ id, hp }) => { const m = mobs[id]; if (m) { m.hp = hp; m.label.hp.style.width = '100%'; } });
  socket.on('stoneSpawn', (s) => createStone(s));
  socket.on('stoneDown', ({ id, by, name, stoneName }) => {
    removeStone(id);
    log(by === myId ? `<b>Sistem:</b> ${esc(stoneName)}'ni kırdın! Ganimetleri topla.` : `<b>${esc(name)}</b> bir ${esc(stoneName)} kırdı.`);
  });
  socket.on('drop', (d) => createDrop(d));
  socket.on('dropGone', ({ id }) => removeDrop(id));
  socket.on('chat', ({ name, text }) => log(`<b>${esc(name)}:</b> ${esc(text)}`));
  socket.on('disconnect', (reason) => { if (reason !== 'io client disconnect') log('<b>Sistem:</b> Sunucu bağlantısı koptu, yeniden bağlanılıyor…'); });
  socket.on('connect', () => { if (myId) location.reload(); });
  socket.on('kicked', (msg) => { alertBox(msg); });
}

function setStats(level, exp, need) {
  myLevel = level;
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
  pos.x = Math.max(BOUNDS.min, Math.min(BOUNDS.max, pos.x));
  pos.z = Math.max(BOUNDS.min, Math.min(BOUNDS.max, pos.z));
}

// ---------- oklar ----------
const arrows = [];
const arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 4);
arrowGeo.rotateX(Math.PI / 2);
const arrowMat = new THREE.MeshBasicMaterial({ color: '#f4e2b8' });
function shootArrow(p, target) {
  const m = new THREE.Mesh(arrowGeo, arrowMat);
  const from = p.group.position.clone(); from.y = 1.4;
  const to = new V3(target.x, 1.6, target.z);
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

// ---------- yakındaki NPC ve geçitler ----------
function findNearAction(pos) {
  for (const p of Object.values(players)) {
    if (!p.npcKind || Math.hypot(p.group.position.x - pos.x, p.group.position.z - pos.z) > 4) continue;
    if (p.npcKind === 'teleport') return { label: 'Işınlayıcı', run: () => openShop('teleport', 'IŞINLAYICI') };
    if (p.npcKind === 'stable') return { label: 'Seyis', run: () => openShop('stable', 'SEYİS · AT GÖREVİ') };
    if (p.npcKind === 'fisher') return { label: 'Balıkçı', run: () => openShop('potions', 'BALIKÇI') };
    return { label: p.name, run: () => openShop(p.npcKind, p.name.toLocaleUpperCase('tr-TR')) };
  }
  for (const pt of mapInfo.portals) {
    if (Math.hypot(pt.x - pos.x, pt.z - pos.z) > 4.5) continue;
    const t = MAPS[pt.to];
    return { label: `Geçit: ${t.name}`, run: () => socket.emit('travel', pt.to) };
  }
  return null;
}

// ---------- ana döngü ----------
const clock = new THREE.Clock();
const camPos = new V3();
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
let actionCheck = 0;
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  const now = performance.now();
  const me = players[myId];
  updateCamVectors();

  if (me && currentMap) {
    if (atkHeld) attack();
    let ix = input.x, iy = input.y;
    if (keys.w || keys.arrowup) iy = -1; if (keys.s || keys.arrowdown) iy = 1;
    if (keys.a || keys.arrowleft) ix = -1; if (keys.d || keys.arrowright) ix = 1;
    const mag = Math.min(1, Math.hypot(ix, iy));
    const moving = !amDead && mag > 0.15 && me.swingT <= 0;   // saldırırken yürünmez
    if (moving) {
      const dir = new V3().addScaledVector(camRight, ix).addScaledVector(camFwd, -iy).normalize();
      me.group.position.addScaledVector(dir, SPEED * CLASS_SPEED() * mag * dt);
      collide(me.group.position);
      me.ry = Math.atan2(dir.x, dir.z) + FACE_OFFSET;
    }
    me.moving = moving;
    if (now - lastSent > 100 && (moving || lastMoving || now - lastSent > 1000)) {
      socket.emit('move', { x: me.group.position.x, z: me.group.position.z, ry: me.ry, f: me.ry - FACE_OFFSET, moving });
      lastSent = now; lastMoving = moving;
    }
    // yakındaki ganimeti otomatik topla
    for (const d of Object.values(drops)) {
      if (now - d.lastTry < 1500) continue;
      if (d.owner !== myId && now - d.born < 15500) continue;
      if (Math.hypot(d.x - me.group.position.x, d.z - me.group.position.z) < 1.8) { d.lastTry = now; socket.emit('pickup', d.id); }
    }
    // NPC / geçit butonu
    if (now - actionCheck > 200) {
      actionCheck = now;
      nearAction = amDead ? null : findNearAction(me.group.position);
      talkBtn.style.display = nearAction ? 'flex' : 'none';
      if (nearAction) talkBtn.textContent = nearAction.label;
    }
    camPos.copy(me.group.position).add(camOffset);
    camera.position.lerp(camPos, 1 - Math.exp(-8 * dt));
    camera.lookAt(camera.position.x - camOffset.x, 1.2, camera.position.z - camOffset.z);
    sun.position.set(me.group.position.x + 12, 25, me.group.position.z + 6);
    sun.target.position.copy(me.group.position);
  } else {
    camera.position.set(25 + 14, 16, 25 + 14);
    camera.lookAt(25, 0, 25);
  }

  for (const p of Object.values(players)) {
    if (p.id !== myId && !p.npc) p.group.position.lerp(p.target, 1 - Math.exp(-10 * dt));
    p.group.rotation.y = angleLerp(p.group.rotation.y, p.ry, 1 - Math.exp(-14 * dt));
    setAnim(p, p.moving && p.swingT <= 0 ? 'Run' : 'Idle');
    if (p.mixer) p.mixer.update(dt);
    if (p.swingT > 0) p.swingT = Math.max(0, p.swingT - dt);
    applySwing(p);
    if (p.model) p.model.parent.rotation.x = (p.id === myId ? amDead : p.dead) ? -Math.PI / 2 : 0;
    if (p.slashT > 0) {
      p.slashT -= dt;
      p.slash.material.opacity = Math.max(0, p.slashT / 0.3) * 0.7;
    } else p.slash.material.opacity = 0;
    placeLabel(p.label, p.group.position.x, 2.4, p.group.position.z);
  }
  updateMobs(dt);
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
  for (const pt of mapInfo.portals) {
    if (pt.label) placeLabel(pt.label, pt.x, 6.2, pt.z);
    if (pt.field) pt.field.material.opacity = 0.35 + Math.sin(now / 300) * 0.12;
  }
  updateArrows(dt);
  updateEffects(dt);
  updateSkillCooldowns();
  renderer.render(scene, camera);
}
loop();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
