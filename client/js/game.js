// ATABİS ONLINE – 3D istemci (Three.js)
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { mat, esc } from './util.js';
import { loadMap, colliders, circles, BOUNDS } from './world/map.js';
import { buildMob } from './entities/mobs.js';
import { itemModel, ITEM_MODELS, attachMountModel, MOUNT } from './entities/models.js';
import { buildOutfit, undersuitColor } from './entities/outfits.js';
import { retargetClips, correctFrame } from './entities/retarget.js';
import * as sfx from './audio.js';
import * as fx from './fx.js';
import * as icons from './icons.js';
import { buildStage, updateStage } from './lobby.js';
import * as social from './social.js';
import * as settings from './settings.js';
import { buildWings, buildPet } from './entities/cosmetics.js';

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
fx.initFx(scene, camera, renderer);

const hemi = new THREE.HemisphereLight('#dfefff', '#4a6a35', 1.1);
scene.add(hemi);
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
  const tn = document.createTextNode(text);
  el.appendChild(tn);
  let hp = null;
  if (withHp) {
    const wrap = document.createElement('div'); wrap.className = 'hp';
    hp = document.createElement('div'); hp.style.width = '100%';
    wrap.appendChild(hp); el.appendChild(wrap);
  }
  labelsEl.appendChild(el);
  return { el, hp, tn };
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
// ---------- metin taşları (Metin2 tarzı) ----------
// Uzun, sivri, kırık yüzlü koyu bir taş; yüzeyinde parlayan oyma rünler ve çatlaklar,
// dibinde moloz, çevresinde dönen kristal kırıkları ve yükselen ışık zerreleri.
const stoneTexCache = {};
function stoneTextures(color) {
  if (stoneTexCache[color]) return stoneTexCache[color];
  const W = 256, H = 512;
  const base = document.createElement('canvas'); base.width = W; base.height = H;
  const glowC = document.createElement('canvas'); glowC.width = W; glowC.height = H;
  const g = base.getContext('2d'), e = glowC.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#4a4e5a'); gr.addColorStop(0.6, '#2c2f38'); gr.addColorStop(1, '#1c1e25');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) { const v = 30 + rnd() * 60; g.fillStyle = `rgba(${v},${v + 4},${v + 12},${0.25 + rnd() * 0.3})`; g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3); }
  e.fillStyle = '#000'; e.fillRect(0, 0, W, H);
  // çatlaklar: kayada koyu, parıltıda renkli
  for (let c = 0; c < 9; c++) {
    let x = rnd() * W, y = rnd() * H;
    g.strokeStyle = 'rgba(10,10,14,0.8)'; g.lineWidth = 2; e.strokeStyle = color; e.lineWidth = 1.5; e.shadowColor = color; e.shadowBlur = 6;
    g.beginPath(); e.beginPath(); g.moveTo(x, y); e.moveTo(x, y);
    for (let k = 0; k < 7; k++) { x += (rnd() - 0.5) * 40; y += 10 + rnd() * 30; g.lineTo(x, y); e.lineTo(x, y); }
    g.stroke(); e.stroke();
  }
  // oyma rünler: her yüzde dikey bir sıra (kayada oyuk, parıltıda ışık)
  const glyph = (ctx, cx, cy, sz, r) => {
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const t = Math.floor(r() * 4);
      if (t === 0) { ctx.moveTo(cx - sz, cy - sz + k * sz * 0.6); ctx.lineTo(cx + sz, cy - sz + k * sz * 0.6); }
      else if (t === 1) { const ox = (r() - 0.5) * sz; ctx.moveTo(cx + ox, cy - sz); ctx.lineTo(cx + ox, cy + sz); }
      else if (t === 2) { ctx.moveTo(cx - sz, cy + sz); ctx.lineTo(cx + sz, cy - sz); }
      else { const a0 = r() * 3; ctx.moveTo(cx + Math.cos(a0) * sz * 0.55, cy + Math.sin(a0) * sz * 0.55); ctx.arc(cx, cy, sz * 0.55, a0, a0 + 3); }
    }
    ctx.stroke();
  };
  e.lineCap = g.lineCap = 'round';
  for (let col = 0; col < 7; col++) {
    const cx = (col + 0.5) * W / 7;
    for (let row = 0; row < 4; row++) {
      const s0 = seed;
      g.strokeStyle = 'rgba(8,8,12,0.9)'; g.lineWidth = 5; g.shadowBlur = 0; glyph(g, cx, H * 0.38 + row * 44, 11, rnd);
      seed = s0;
      e.strokeStyle = color; e.lineWidth = 3.5; e.shadowColor = color; e.shadowBlur = 10; glyph(e, cx, H * 0.38 + row * 44, 11, rnd);
    }
  }
  const mk = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  return (stoneTexCache[color] = { map: mk(base), emissiveMap: mk(glowC) });
}
function createStone(s) {
  if (stones[s.id]) return;
  const color = s.color === 'purple' ? '#9a7dff' : '#ff4a2f';
  const tex = stoneTextures(color);
  const g = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({ map: tex.map, emissiveMap: tex.emissiveMap, emissive: new THREE.Color(color), emissiveIntensity: 1.3, roughness: 0.9, metalness: 0.05, flatShading: true });
  // ana gövde: 7 köşeli, yukarı daralan, yüzeyi kırık
  const geo = new THREE.CylinderGeometry(0.18, 1.0, 3.6, 7, 5);
  const pos = geo.attributes.position;
  let sd = (s.id * 9301 + 49297) % 233280; const rr = () => ((sd = (sd * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (Math.abs(y) < 1.79) { pos.setX(i, pos.getX(i) * (0.85 + rr() * 0.3)); pos.setZ(i, pos.getZ(i) * (0.85 + rr() * 0.3)); }
    pos.setY(i, y + (rr() - 0.5) * 0.15);
  }
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, stoneMat); body.position.y = 1.8; body.castShadow = true; body.rotation.y = rr() * 3;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.7, 7), stoneMat); tip.position.y = 3.9; tip.castShadow = true;
  const inner = new THREE.Group(); inner.add(body, tip);
  // dipte moloz
  const rubbleMat = new THREE.MeshStandardMaterial({ map: tex.map, roughness: 0.95, flatShading: true });
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2 + rr(), r = 1.0 + rr() * 0.5;
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.18 + rr() * 0.22, 0), rubbleMat);
    m.position.set(Math.cos(a) * r, 0.12, Math.sin(a) * r); m.rotation.set(rr() * 3, rr() * 3, 0); m.castShadow = true;
    g.add(m);
  }
  // çevresinde dönen parlayan kristal kırıkları
  const shards = new THREE.Group(); shards.position.y = 2.2;
  const shardMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.6, roughness: 0.3 });
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), shardMat); m.scale.y = 2;
    const a = i / 4 * Math.PI * 2; m.position.set(Math.cos(a) * 1.6, Math.sin(i * 2) * 0.5, Math.sin(a) * 1.6);
    shards.add(m);
  }
  // yerde nabız gibi atan ışık
  const glow = new THREE.Mesh(new THREE.CircleGeometry(2.8, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06;
  g.add(inner, shards, glow);
  g.position.set(s.x, 0, s.z);
  scene.add(g);
  const label = makeLabel(`${s.name} · Sv. ${s.lv}`, s.color === 'purple' ? '#c8d0ff' : '#ffb4a3', true);
  label.hp.style.width = (100 * s.hp / s.max) + '%';
  stones[s.id] = { ...s, group: g, rock: inner, label, shake: 0, mat: stoneMat, glow, shards, glowColor: color, flash: 0, wisp: 0, phase: rr() * 6 };
}
// her karede: rün nabzı, vurulunca parlama, dönen kırıklar, ışık zerreleri
function updateStones(dt, t) {
  for (const s of Object.values(stones)) {
    if (s.shake > 0) { s.shake -= dt; s.rock.position.x = (Math.random() - 0.5) * 0.25; } else s.rock.position.x = 0;
    if (!s.mat) continue;
    s.flash = Math.max(0, s.flash - dt * 3);
    const pulse = 1.1 + Math.sin(t * 2.2 + s.phase) * 0.35;
    s.mat.emissiveIntensity = pulse + s.flash * 2.5;
    s.glow.material.opacity = 0.18 + Math.sin(t * 2.2 + s.phase) * 0.07 + s.flash * 0.3;
    s.shards.rotation.y += dt * 0.8;
    s.wisp += dt;
    if (s.wisp > 0.18) { s.wisp = 0; fx.stoneWisp(s, s.glowColor); }
  }
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
// Sınıfa özel karakter modelleri (mixamo iskeletli, kendi kıyafeti ve dokusuyla).
// Bekleme/yürüme/koşma Soldier'dan aktarılır, böylece silah tutuşu ve saldırı pozları aynı kalır.
// hide: silah takılıyken gizlenen parçalar (modelin kendi asası gibi); skip: ölçüde sayılmayan parçalar.
// k: boy ölçeği (verilmezse ölçülür); helm: kask takılınca gizlenen kendi miğferi;
// helmet: false → kapüşonlu modele kask eşyası giydirilmez (iç içe geçmesin)
const CHAR_MODELS = {
  savasci: { url: 'models/chars/savasci.glb', hide: ['sword'], skip: ['sword'] },        // barbar kız (kendi kılıçları gizli, oyunun silahı takılır)
  ninja: { url: 'models/chars/ninja.glb', hide: ['fan'], skip: ['fan'] },                // yelpaze dansçısı
  sura: { url: 'models/chars/sura.glb', hide: ['spear'], skip: ['spear'], k: 1.1 },       // kanatlı kadın savaşçı (kanatlar boyu etkilemesin)
  saman: { url: 'models/chars/saman.glb', hide: ['prop'], skip: ['prop', 'outline'], k: 0.933 },
  okcu: { url: 'models/chars/okcu.glb', hide: ['crossbow'], skip: ['crossbow'] },        // iblis avcısı
};
const charModels = {};   // cls -> { scene, calib, clips }
function loadGlb(url) { return new Promise((res) => loader.load(url, res, undefined, (e) => { console.warn('Model yüklenemedi:', url, e); res(null); })); }
const modelReady = (async () => {
  const g = await loadGlb('models/Soldier.glb');
  if (!g) { console.warn('Model yüklenemedi, basit karakter kullanılacak'); return; }
  gltf = g;
  try { calib = calibrate(g.scene); FACE_OFFSET = calib.faceOffset; } catch (e) { console.warn('Kalibrasyon başarısız', e); calib = null; return; }
  await Promise.all(Object.entries(CHAR_MODELS).map(async ([cls, cfg]) => {
    const c = await loadGlb(cfg.url); if (!c) return;
    try {
      const sc = c.scene;
      // parça adı nesnede ya da üst gruplarında geçebilir (çok parçalı asa gibi)
      const part = (o, list) => { for (let q = o; q && q !== sc; q = q.parent) if (list.some((k) => q.name.toLowerCase().includes(k))) return true; return false; };
      // ölçüm sırasında asa ve dış çizgiyi gizle (boyu ve zemini yanlış hesaplamasın)
      const hidden = [];
      sc.traverse((o) => { if (o.isMesh && part(o, cfg.skip || [])) { hidden.push(o); o.visible = false; } });
      const c0 = calibrate(sc);
      sc.rotation.y = c0.faceOffset - calib.faceOffset;          // Soldier ile aynı yöne baksın
      const cc = calibrate(sc, cfg.k);
      for (const o of hidden) o.visible = true;
      sc.traverse((o) => {
        if (!o.isMesh) return;
        if (part(o, cfg.hide || [])) o.userData.hideWithWeapon = true;
        if (part(o, cfg.helm || [])) o.userData.ownHelmet = true;
        if (part(o, ['outline'])) o.userData.outline = true;
      });
      const moves = retargetClips(g.scene, sc, g.animations.filter((a) => a.name !== 'TPose'));
      for (const k of Object.keys(cc)) if (cc[k] && cc[k].bone) cc[k] = correctFrame(cc[k], moves);
      charModels[cls] = { scene: sc, calib: cc, clips: moves, cfg };
    } catch (e) { console.warn('Karakter modeli hazırlanamadı', cls, e); }
  }));
})();

// ---------- özel NPC modelleri ----------
// Işınlayıcı: kullanıcının eklediği ruh modeli (iskeletsiz, tek parça). Yüklenene kadar yer tutucu görünür.
const NPC_MODELS = { teleport: { url: 'models/npc/isinlayici.glb', height: 2.35, hover: 0.25, glow: '#9b6bff' } };
const npcModel = {};          // kind -> yüklenen sahne
const npcWaiting = {};        // kind -> modeli bekleyen NPC'ler
for (const [kind, cfg] of Object.entries(NPC_MODELS)) {
  loader.load(cfg.url, (g) => {
    g.scene.traverse((o) => {
      if (o.isMesh && o.material && o.material.map) {
        // hafif kendi ışığıyla parlasın, karlı köyde de seçilsin
        o.material.emissive = new THREE.Color('#ffffff');
        o.material.emissiveMap = o.material.map;
        o.material.emissiveIntensity = 0.45;
        o.material.roughness = 0.6;
      }
    });
    npcModel[kind] = g.scene;
    for (const obj of npcWaiting[kind] || []) if (players[obj.id] === obj) dressNpc(obj, kind);
    npcWaiting[kind] = [];
  }, undefined, (e) => console.warn('NPC modeli yüklenemedi:', cfg.url, e));
}
function dressNpc(obj, kind) {
  const cfg = NPC_MODELS[kind], src = npcModel[kind];
  if (!src) { (npcWaiting[kind] = npcWaiting[kind] || []).push(obj); return false; }
  // eski görünümü kaldır (asker modeli ya da kapsül), halkayı ve savurma izini bırak
  for (const c of [...obj.group.children]) if (c !== obj.slash && !c.userData.keep) obj.group.remove(c);
  const model = src.clone(true);
  const box = new THREE.Box3().setFromObject(model);
  const k = cfg.height / Math.max(0.01, box.max.y - box.min.y);
  model.scale.setScalar(k);
  model.position.y = -box.min.y * k;
  model.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const holder = new THREE.Group();
  holder.add(model);
  obj.group.add(holder);
  // yerde parlayan mor ışık halkası
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshBasicMaterial({ color: cfg.glow, transparent: true, opacity: 0.35, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06;
  obj.group.add(glow);
  obj.model = null; obj.mixer = null; obj.bones = null; obj.materials = [];
  obj.spirit = { holder, glow, hover: cfg.hover, phase: Math.random() * 6 };
  obj.labelY = cfg.height + cfg.hover + 0.45;
  return true;
}

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
function calibrate(root, kOver) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => { if (o.isMesh && o.visible) box.expandByObject(o); });
  if (box.isEmpty()) box.setFromObject(root);
  const height = box.max.y - box.min.y;
  const k = kOver || height / 1.8;               // modelin 1 metresi
  const L = boneByName(root, 'LeftArm'), R = boneByName(root, 'RightArm');
  const hand = boneByName(root, 'RightHand'), finger = boneByName(root, 'RightHandMiddle1') || boneByName(root, 'RightHandIndex1');
  const spine = boneByName(root, 'Spine2') || boneByName(root, 'Spine1') || boneByName(root, 'Spine');
  const head = boneByName(root, 'Head');
  const hips = boneByName(root, 'Hips');
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
    // sınıf kostümleri için: sırt (pelerin/sadak), boyun ve kalça (cüppe/kemer)
    back: { bone: spine.name, ...localTransform(spine, ps.clone().addScaledVector(fwd, -0.13 * k).addScaledVector(up, 0.12 * k), qBody, k) },
    neck: { bone: spine.name, ...localTransform(spine, ps.clone().addScaledVector(up, 0.2 * k), qBody, k) },
    hips: hips ? { bone: hips.name, ...localTransform(hips, hips.getWorldPosition(new V3()), qBody, k) } : null,
    // uzuv çerçeveleri (kemik doğrultusunda): omuzluk, bileklik, uyluk plakası, dizlik
    shoulderL: limbFrame(root, 'LeftArm', 'LeftForeArm', 0.12, true, fwd, k),
    shoulderR: limbFrame(root, 'RightArm', 'RightForeArm', 0.12, true, fwd, k),
    foreL: limbFrame(root, 'LeftForeArm', 'LeftHand', 0.55, false, fwd, k),
    foreR: limbFrame(root, 'RightForeArm', 'RightHand', 0.55, false, fwd, k),
    thighL: limbFrame(root, 'LeftUpLeg', 'LeftLeg', 0.08, true, fwd, k),
    thighR: limbFrame(root, 'RightUpLeg', 'RightLeg', 0.08, true, fwd, k),
    shinL: limbFrame(root, 'LeftLeg', 'LeftFoot', 0.45, false, fwd, k),
    shinR: limbFrame(root, 'RightLeg', 'RightFoot', 0.45, false, fwd, k),
  };
}
// kemik boyunca hizalı çerçeve: y = kemikten çocuğuna (flip ise tersi), z = öne yakın, x = yana
function limbFrame(root, name, childName, t, flip, fwd, k) {
  const b = boneByName(root, name), c = boneByName(root, childName);
  if (!b || !c) return null;
  const a = b.getWorldPosition(new V3()), e = c.getWorldPosition(new V3());
  const y = e.clone().sub(a).normalize(); if (flip) y.negate();
  const z = fwd.clone().sub(y.clone().multiplyScalar(fwd.dot(y)));
  if (z.lengthSq() < 1e-6) z.set(0, 0, 1);
  z.normalize();
  const x = new V3().crossVectors(y, z).normalize();
  return { bone: b.name, ...localTransform(b, a.clone().lerp(e, t), basisQuat(x, y, z), k) };
}

// ---------- sınıf görünümleri: her sınıfın kendi silueti (Metin2'deki gibi ayırt edilsin) ----------
// Gövde oranı (genişlik), temel renk tonu ve bedene takılan kostüm parçaları.
const CLASS_LOOK = {
  savasci: { bulk: 1.08, tint: '#9a4a36' },
  ninja: { bulk: 0.92, tint: '#2c2f3c' },
  sura: { bulk: 1.0, tint: '#3e2c4e' },
  saman: { bulk: 0.97, tint: '#d8cfa8' },
  okcu: { bulk: 0.93, tint: '#3f6a3a' },
};
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
  if (def.model && ITEM_MODELS[def.model]) return itemModel(def.model, swordMesh(def));   // kullanıcının modeli
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
// ---------- silah ve zırh aurası (Metin2'deki +9 parıltısı gibi) ----------
// Kademe yükseldikçe renk ve yoğunluk artar; efsanevi eşyalar altın parlar.
function auraOf(def) {
  if (!def || def.tier == null) return null;
  const leg = def.rarity >= 2;
  if (def.tier >= 15 || leg) return { color: '#ffd23f', k: leg ? 1.3 : 1.1 };
  if (def.tier >= 12) return { color: '#ff5a3a', k: 0.95 };
  if (def.tier >= 9) return { color: '#b06bff', k: 0.8 };
  if (def.tier >= 6) return { color: '#6fa8ff', k: 0.6 };
  return null;
}
const _av = new THREE.Vector3();
// eşyanın üstüne hafif büyütülmüş, eklemeli parlayan bir kabuk
function addGlowShell(root, color, list) {
  const meshes = [];
  root.traverse((o) => { if (o.isMesh && !o.userData.shell) meshes.push(o); });
  for (const o of meshes) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide });
    const sh = new THREE.Mesh(o.geometry, m);
    sh.userData.shell = true; sh.scale.setScalar(1.12); sh.renderOrder = 5;
    o.add(sh);
    list.push(m);
  }
}
function setupAuras(p, wMesh, w, a) {
  p.auraMats = [];
  p.weaponAura = null; p.armorAura = null;
  const wa = auraOf(w), aa = auraOf(a);
  if (wa && wMesh) {
    p.weaponAura = { ...wa, mesh: wMesh, len: (w.len || 1.0) + 0.1, acc: 0 };
    const go = () => addGlowShell(wMesh, wa.color, p.auraMats);
    let ready = null;
    wMesh.traverse((o) => { if (o.userData && o.userData.ready) ready = o.userData.ready; });
    if (ready) ready.then(go); else go();
  }
  if (aa) {
    p.armorAura = { ...aa, acc: 0, ph: Math.random() * 6 };
    // ayak altında hafif halka
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.95, 40), new THREE.MeshBasicMaterial({ color: aa.color, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05;
    p.group.add(ring); p.equipMeshes.push(ring);
    p.auraMats.push(ring.material);
    p.armorAura.ring = ring;
  }
}
function updateAuras(p, dt, t) {
  if (!p.weaponAura && !p.armorAura) return;
  const me = players[myId];
  const near = !me || p === me || Math.hypot(me.group.position.x - p.group.position.x, me.group.position.z - p.group.position.z) < 45;
  const pulse = 0.5 + 0.5 * Math.sin(t * 3.2 + (p.armorAura ? p.armorAura.ph : 0));
  for (const m of p.auraMats || []) m.opacity = (m.type === 'MeshBasicMaterial' && m.side === THREE.BackSide ? 0.22 : 0.18) + pulse * 0.22;
  if (!near || p.dead) return;
  const wa = p.weaponAura;
  if (wa && wa.mesh.parent) {
    // bıçak boyunca kıvılcımlar
    wa.acc += dt * 22 * wa.k;
    while (wa.acc > 1) {
      wa.acc -= 1;
      _av.set((Math.random() - 0.5) * 0.04, 0.1 + Math.random() * wa.len, 0);
      wa.mesh.localToWorld(_av);
      fx.emit(_av.x, _av.y, _av.z, { vx: (Math.random() - 0.5) * 0.4, vy: 0.3 + Math.random() * 0.5, vz: (Math.random() - 0.5) * 0.4, color: wa.color, size: 0.13 * wa.k + 0.05, life: 0.5, drag: 1.5 });
    }
  }
  const aa = p.armorAura;
  if (aa) {
    // gövdeyi saran yükselen ışık sarmalı
    aa.acc += dt * 14 * aa.k;
    const g = p.group.position;
    while (aa.acc > 1) {
      aa.acc -= 1;
      const ang = t * 3 + Math.random() * Math.PI * 2, r = 0.45 + Math.random() * 0.15;
      fx.emit(g.x + Math.cos(ang) * r, 0.15 + Math.random() * 0.4, g.z + Math.sin(ang) * r, { vx: -Math.sin(ang) * 0.6, vy: 1.1 + Math.random() * 0.8, vz: Math.cos(ang) * 0.6, color: aa.color, size: 0.16 * aa.k, life: 1.1, drag: 0.6 });
    }
    if (aa.ring) aa.ring.rotation.z += dt * 0.8;
  }
}

function applyLook(p, look) {
  p.look = look || {};
  applyCosmetics(p);
  const calib = p.calib || calibBase();
  if (!p.model || !calib) return;
  for (const m of p.equipMeshes) m.parent && m.parent.remove(m);
  p.equipMeshes = [];
  const w = ITEMS[p.look.weapon], a = ITEMS[p.look.armor], h = ITEMS[p.look.helmet];
  let wMesh = null;
  if (w) { wMesh = weaponMesh(w); attach(p, calib.sword, wMesh); }
  const cos = ITEMS[p.look.costume];
  if (p.custom) {
    // kostüm: modelin kendi kıyafetini kostüm rengine boyar
    p.model.traverse((o) => {
      if (!o.isMesh || o.userData.outline) return;
      for (const m of [].concat(o.material)) {
        if (!m.userData.base) continue;
        m.color.copy(m.userData.base);
        if (cos && cos.tint) m.color.lerp(new THREE.Color(cos.tint), 0.42);
        if (m.emissive) m.emissive.set(cos && cos.tint ? cos.tint : '#000000'), m.emissiveIntensity = cos ? 0.08 : 0;
      }
    });
    // kendi kıyafeti olan karakter: kostüm parçası ve renk boyası yok; silah takılıysa kendi asası gizlenir
    const helmOk = h && !(p.charCfg && p.charCfg.helmet === false);
    p.model.traverse((o) => { if (o.userData.hideWithWeapon) o.visible = !w; if (o.userData.ownHelmet) o.visible = !helmOk; });
    p.capes = []; p.robe = null;
    if (helmOk) attach(p, calib.helmet, h.model && ITEM_MODELS[h.model] ? itemModel(h.model, helmetMesh(h)) : helmetMesh(h));
    setupAuras(p, wMesh, w, a);
    return;
  }
  // sınıfa göre vücut oranı ve renk; zırh varsa onun rengi ağır basar
  const cl = CLASS_LOOK[p.cls];
  // alttaki modeli sınıfın koyu iç giysisine doğru karart; metal parçalar zırhın rengini alır
  const under = undersuitColor(p.cls);
  const tint = new THREE.Color(under || '#ffffff');
  for (const m of p.materials) m.color.copy(m.userData.base).lerp(tint, under ? 0.6 : 0);
  if (p.model && p.model.parent && cl) { const base = 1 / calib.k; p.model.parent.scale.set(base * cl.bulk, base, base * cl.bulk); }
  p.capes = [];
  p.robe = null;
  const outfit = cl ? buildOutfit(p.cls, { metal: cos && cos.tint ? cos.tint : a && a.color && a.color !== '#ffffff' ? a.color : null, tier: a ? a.tier : null, legendary: (a && a.rarity >= 2) || !!cos, hasHelmet: !!h }) : [];
  for (const [where, mesh] of outfit) {
    if (!calib[where]) continue;
    attach(p, calib[where], mesh);
    if (mesh.userData.cape) p.capes.push(mesh);
    if (mesh.userData.robe) p.robe = mesh;
  }
  if (a && a.plate) {
    // sınıflı karakterde zırh, takımın kendisidir (renk ve süs); sınıfsızlarda eski göğüslük
    if (!CLASS_LOOK[p.cls]) { attach(p, calib.chest, chestMesh(a)); attach(p, calib.padL, padMesh(a)); attach(p, calib.padR, padMesh(a)); }
  }
  if (h) attach(p, calib.helmet, h.model && ITEM_MODELS[h.model] ? itemModel(h.model, helmetMesh(h)) : helmetMesh(h));
  setupAuras(p, wMesh, w, a);
}

const calibBase = () => calib;
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
    const cm = !p.npc && charModels[p.cls];
    const model = SkeletonUtils.clone(cm ? cm.scene : gltf.scene);
    obj.calib = cm ? cm.calib : calib;
    obj.custom = !!cm; obj.charCfg = cm ? cm.cfg : null;
    model.traverse((o) => {
      if (o.isBone) obj.boneMap[o.name] = o;
      if (o.isMesh) {
        o.castShadow = !o.userData.outline;
        o.frustumCulled = false;   // derili model: animasyonda sınır kutusu dışına taşabilir
        o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone();
        for (const m of [].concat(o.material)) { m.userData.base = m.color.clone(); if (!cm) obj.materials.push(m); }
      }
    });
    const wrap = new THREE.Group();
    wrap.add(model);
    if (obj.calib) { wrap.scale.setScalar(1 / obj.calib.k); wrap.position.y = -obj.calib.minY / obj.calib.k; }
    group.add(wrap);
    obj.model = model;
    obj.mixer = new THREE.AnimationMixer(model);
    for (const clip of cm ? cm.clips : gltf.animations) obj.actions[clip.name] = obj.mixer.clipAction(clip);
    if (obj.actions.Idle) obj.actions.Idle.play();
    const find = (n) => Object.values(obj.boneMap).find((b) => b.name.replace(/^mixamorig[:_]?/i, '') === n);
    obj.bones = { spine: find('Spine1') || find('Spine'), arm: find('RightArm'), fore: find('RightForeArm'),
      chest: find('Spine2'), armL: find('LeftArm'), neck: find('Neck'), foreL: find('LeftForeArm'),
      upL: find('LeftUpLeg'), upR: find('RightUpLeg'), legL: find('LeftLeg'), legR: find('RightLeg') };
    if (!obj.bones.spine || !obj.bones.arm) obj.bones = null;
  } else {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 8), mat(p.id === myId ? '#c0392b' : '#2f6fd0'));
    body.position.y = 0.9; body.castShadow = true; group.add(body);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 28), new THREE.MeshBasicMaterial({
    color: p.npc ? '#7be08f' : p.id === myId ? '#e8b54a' : '#8ec5ff', transparent: true, opacity: 0.85 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.07;
  ring.userData.keep = true;
  group.add(ring);
  const slash = new THREE.Mesh(new THREE.RingGeometry(1.0, 2.3, 24, 1, Math.PI * 0.15, Math.PI * 0.7),
    new THREE.MeshBasicMaterial({ color: '#fff4d0', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
  slash.rotation.x = -Math.PI / 2; slash.position.y = 1.1;
  group.add(slash);
  obj.slash = slash;
  group.position.set(p.x, 0, p.z);
  scene.add(group);
  obj.label = makeLabel(p.npc ? p.name : `${p.name} · Sv. ${obj.level}`, p.npc ? '#7be08f' : p.gm ? '#ffe14a' : p.id === myId ? '#e8b54a' : '#8ec5ff', !p.npc);
  if (p.gm) {
    // Metin2 tarzı GM rozeti
    const b = document.createElement('span'); b.className = 'gmtag'; b.textContent = 'GM';
    obj.label.el.insertBefore(b, obj.label.tn);
    obj.label.el.classList.add('gm');
  }
  if (!p.npc && social.inParty(p.id)) obj.label.el.classList.add('party');
  setGuildTag(obj, p.guild);
  setEmpireTag(obj, p.empire);
  if (isWarFoe(obj)) setTimeout(() => markFoe(obj.id, true), 0);
  if (obj.label.hp) { obj.label.hp.parentNode.classList.add('player'); obj.label.hp.style.width = (p.maxHp ? 100 * p.hp / p.maxHp : 100) + '%'; }
  players[p.id] = obj;
  applyLook(obj, p.look);
  return obj;
}
// krallık işareti (ismin önünde renkli elmas)
const EMP_COLORS = { 1: '#e0453a', 2: '#e8b54a', 3: '#3d8fe0' };
let myEmpire = 0;
function setEmpireTag(obj, e) {
  obj.empire = e || 0;
  let t = obj.label.el.querySelector('.emp');
  if (!e) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement('span'); t.className = 'emp'; obj.label.el.insertBefore(t, obj.label.tn); }
  t.style.background = EMP_COLORS[e];
}
// savaş meydanında düşman krallıktan oyuncular kırmızı halka ve isimle görünür
function isWarFoe(p) {
  const w = social.warState();
  return !!(w && w.active && currentMap && currentMap.war && p && !p.npc && p.id !== myId && p.empire && myEmpire && p.empire !== myEmpire);
}
function refreshFoes() { for (const p of Object.values(players)) if (!p.npc && p.id !== myId) markFoe(p.id, p.id === duelFoe || isWarFoe(p)); social.refreshWar(); }
function foesList() {
  const list = [];
  for (const p of Object.values(players)) if (!p.dead && (p.id === duelFoe || isWarFoe(p))) list.push(p);
  return list;
}
// ---------- pazar tezgâhları ----------
const stallObjs = {};
const STALL_CLOTH = ['#b23a24', '#2f6fd0', '#3f7a3a', '#8a3ab2', '#c98a1a'];
function addStall(s) {
  if (stallObjs[s.id]) { stallObjs[s.id].label.tn.textContent = `${s.title}`; stallObjs[s.id].label.el.querySelector('small').textContent = `${s.owner} · ${s.n} eşya`; return; }
  const g = new THREE.Group();
  const wood = mat('#7a5232'), cloth = mat(STALL_CLOTH[s.id % STALL_CLOTH.length]);
  const top = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 1.1), wood); top.position.y = 0.95; g.add(top);
  const front = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.8, 0.08), mat('#5e3d22')); front.position.set(0, 0.5, 0.52); g.add(front);
  for (const [x, z] of [[-1.02, -0.48], [1.02, -0.48], [-1.02, 0.48], [1.02, 0.48]]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 6), wood); post.position.set(x, 1.1, z); g.add(post);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 1.5), cloth); roof.position.set(0, 2.2, 0.1); roof.rotation.x = 0.18; g.add(roof);
  for (let i = 0; i < 5; i++) {   // perde saçağı
    const f = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.03), i % 2 ? mat('#f4e8c8') : cloth); f.position.set(-1 + i * 0.5, 2.0, 0.83); f.rotation.x = 0.18; g.add(f);
  }
  for (const [x, c] of [[-0.6, '#e8b54a'], [0, '#7fb3ff'], [0.6, '#ff8a7a']]) {   // tezgâh üstündeki mallar
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.32), mat(c)); b.position.set(x, 1.15, 0); b.rotation.y = x; g.add(b);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.position.set(s.x, 0, s.z);
  scene.add(g);
  const label = makeLabel(s.title, '#ffd36b', false);
  label.el.classList.add('stall');
  const sm = document.createElement('small'); sm.textContent = `${s.owner} · ${s.n} eşya`; label.el.appendChild(sm);
  stallObjs[s.id] = { ...s, group: g, label };
}
function removeStall(id) { const s = stallObjs[id]; if (!s) return; scene.remove(s.group); s.label.el.remove(); delete stallObjs[id]; }
function pickStallAt(cx, cy) {
  let best = null, bd = 70;
  for (const s of Object.values(stallObjs)) {
    _proj.set(s.x, 1.2, s.z).project(camera); if (_proj.z > 1) continue;
    const d = Math.hypot((_proj.x + 1) / 2 * window.innerWidth - cx, (1 - _proj.y) / 2 * window.innerHeight - cy);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
// ---------- görünüş: kanat ve evcil hayvan ----------
function applyCosmetics(p) {
  const wk = p.look.wings, pk = p.look.pet;
  if (p.wingKey !== wk) {
    if (p.wings) p.group.remove(p.wings);
    p.wings = null; p.wingKey = wk;
    const d = ITEMS[wk];
    if (d && d.wing) {
      const w = buildWings(d.wing);
      // kanat sırtta: karakterin baktığı yönün tersine, omuz hizasında
      const holder = new THREE.Group();
      holder.rotation.y = -FACE_OFFSET;
      w.position.set(0, (p.labelY || 2.2) * 0.58, -0.22);
      holder.add(w);
      p.group.add(holder);
      p.wings = holder; p.wingMesh = w;
    }
  }
  if (p.petKey !== pk) {
    if (p.pet) scene.remove(p.pet.root);
    p.pet = null; p.petKey = pk;
    const d = ITEMS[pk];
    if (d && d.pet) {
      const v = buildPet(d);
      const gp = p.group.position;
      v.root.position.set(gp.x + 1, 0, gp.z + 1);
      scene.add(v.root);
      p.pet = { root: v.root, v, t: Math.random() * 10, fly: d.pet.shape === 'flyer' || d.pet.shape === 'dragon' };
    }
  }
}
function updateCosmetics(p, dt, t) {
  if (p.wingMesh) { p.wings.visible = !p.dead; p.wingMesh.userData.flap(t + (p.id.length || 0), p.moving); }
  const pet = p.pet; if (!pet) return;
  pet.root.visible = !p.dead && p.group.visible;
  // sahibinin sol arkasında dur
  const f = p.group.rotation.y - FACE_OFFSET, gp = p.group.position;
  const tx = gp.x - Math.sin(f) * 1.4 + Math.cos(f) * 1.0, tz = gp.z - Math.cos(f) * 1.4 - Math.sin(f) * 1.0;
  const dx = tx - pet.root.position.x, dz = tz - pet.root.position.z, d = Math.hypot(dx, dz);
  const moving = d > 0.25;
  if (d > 25) pet.root.position.set(tx, 0, tz);
  else if (moving) { const k = Math.min(1, dt * (2 + d * 1.6)); pet.root.position.x += dx * k; pet.root.position.z += dz * k; pet.root.rotation.y = angleLerp(pet.root.rotation.y, Math.atan2(dx, dz), 1 - Math.exp(-8 * dt)); }
  pet.t += dt;
  pet.root.position.y = pet.fly ? 1.1 + Math.sin(pet.t * 3) * 0.15 : 0;
  if (pet.v.update) pet.v.update(pet.t, moving, 0, dt);
}
// lonca adı etiketin üstünde
function setGuildTag(obj, name) {
  let t = obj.label.el.querySelector('.gtag');
  if (!name) { if (t) t.remove(); return; }
  if (!t) { t = document.createElement('span'); t.className = 'gtag'; obj.label.el.insertBefore(t, obj.label.el.firstChild); }
  t.textContent = `[${name}]`;
}
// at: binince karakterin altına at modeli gelir
function setMount(p, on) {
  p.mounted = on;
  if (on && !p.horse) {
    // önce kodla çizilmiş at görünür, heybeli at modeli yüklenince onunla değişir
    p.horse = buildMob({ shape: 'horse', color: '#6b4a2e', scale: 1 }, null);
    p.group.add(p.horse.root);
    p.horse.onModel = () => { if (p.mounted) seatRider(p); };
    attachMountModel(p.horse);
  }
  // at, binicinin baktığı yöne baksın (karakter modelleri FACE_OFFSET kadar dönük)
  if (p.horse) { p.horse.root.visible = on; p.horse.root.rotation.y = -FACE_OFFSET; }
  seatRider(p);
}
function riderBaseY(p) {
  const lift = p.mounted ? (p.horse && p.horse.modelLoaded ? MOUNT.riderY : 1.0) : 0;
  const calib = p.calib || calibBase();
  return (calib ? -calib.minY / calib.k : 0) + lift;
}
function seatRider(p) {
  if (p.model) p.model.parent.position.y = riderBaseY(p);
}
// beceri hareketleri: kılıç fırtınasında dönme, buff ve seviye atlamada sıçrama
// ---------- beceri hareketleri (Metin2 tarzı): sıçrama, takla, dönme, atılma, eğilme ----------
// jump: yükseklik, jumpAt: [başla, bitir] (süre oranı), spin: tur, flip: +1 öne / -1 geriye takla,
// lunge: öne (eksi: geriye) kayma, lean: öne eğilme, combos: [zaman oranı, kombo] kılıç vuruşları, cast: büyü pozu
// yere çakılma sarsıntısı (yakında olursa)
const shake = { t: 0, dur: 0, amp: 0 };
fx.onShake((amp, dur, x, z) => {
  const me = players[myId]; if (!me) return;
  const d = x == null ? 0 : Math.hypot(me.group.position.x - x, me.group.position.z - z);
  if (d > 14) return;
  shake.amp = Math.max(shake.t > 0 ? shake.amp : 0, amp * (1 - d / 14)); shake.t = shake.dur = dur;
});
const MOVES = {
  s_ucluk: { dur: 0.75, lunge: 0.9, wave: 3, combos: [[0, 0], [0.3, 1], [0.6, 2]] },
  s_firtina: { dur: 0.9, jump: 1.5, jumpAt: [0.05, 0.92], spin: 3 },
  s_hamle: { dur: 0.5, lean: 0.5, lunge: 0.8, combos: [[0.55, 2]] },
  s_demir: { dur: 0.8, jump: 0.55, jumpAt: [0.05, 0.48], cast: 'raise' },
  n_golge: { dur: 0.6, jump: 1.1, jumpAt: [0, 0.6], flip: 1, lunge: 1.2, combos: [[0.6, 2]] },
  n_zehir: { dur: 0.45, lean: 0.25, combos: [[0, 1]] },
  n_yagmur: { dur: 1.0, jump: 2.6, jumpAt: [0, 0.85], flip: -1, spin: 0.5 },
  n_adim: { dur: 0.65, jump: 1.0, jumpAt: [0, 0.9], flip: -1, lunge: -1.3 },
  u_kara: { dur: 0.8, jump: 0.35, jumpAt: [0.4, 0.8], cast: 'raise' },
  u_emme: { dur: 0.8, lean: -0.25, cast: 'push' },
  u_alev: { dur: 0.75, jump: 1.3, jumpAt: [0, 0.62], spin: 1 },
  u_kalkan: { dur: 0.8, cast: 'raise', spin: 1 },
  m_sifa: { dur: 0.8, cast: 'raise' },
  m_simsek: { dur: 0.7, jump: 0.4, jumpAt: [0, 0.5], cast: 'push' },
  m_kutsama: { dur: 1.0, jump: 0.6, jumpAt: [0.1, 0.9], cast: 'raise' },
  m_kukreme: { dur: 0.8, lean: 0.35, lunge: 0.4, cast: 'push' },
  o_coklu: { dur: 0.6, jump: 0.5, jumpAt: [0, 0.5], lunge: -0.9, bow: true },
  o_zehirli: { dur: 0.55, lean: -0.15, bow: true },
  o_ates: { dur: 0.6, lean: -0.25, lunge: -0.3, bow: true },
  o_hafif: { dur: 0.6, jump: 0.8, jumpAt: [0, 0.8], spin: 1 },
};
function startMove(p, sk) {
  const spec = MOVES[sk.key] || (sk.target === 'self' || sk.target === 'heal' ? { dur: 0.8, cast: 'raise' } : { dur: 0.5, combos: [[0, sk.combo || 0]] });
  p.move = { spec, t: 0, fired: 0 };
  if (spec.cast) { p.castT = p.castDur = Math.max(0.6, spec.dur); p.castKind = spec.cast; }
  if (spec.bow) { p.swingT = SWING_T; p.combo = 0; }
}
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
function skillPoseUpdate(p, dt) {
  if (!p.model) return;
  const wrap = p.model.parent, mv = p.move;
  p.moveOff = p.moveOff || { x: 0, z: 0 };
  if (!mv) {
    if (p.posed) { wrap.rotation.y = 0; wrap.rotation.x = 0; p.moveOff.x = p.moveOff.z = 0; wrap.position.y = riderBaseY(p); p.posed = false; }
    return;
  }
  mv.t += dt;
  const s = mv.spec, k = clamp01(mv.t / s.dur);
  p.posed = true;
  // zamanı gelen kılıç vuruşları
  for (const c of s.combos || []) if (mv.fired < (s.combos.indexOf(c) + 1) && k >= c[0]) {
    mv.fired++; p.swingT = SWING_T; p.combo = c[1]; if (p.cls !== 'okcu') p.slashT = 0.3;
  }
  const [ja, jb] = s.jumpAt || [0, 1], u = clamp01((k - ja) / (jb - ja));
  const y = s.jump && u > 0 && u < 1 ? Math.sin(u * Math.PI) * s.jump : 0;
  const yaw = s.spin ? ease(k) * s.spin * Math.PI * 2 : 0;
  let pitch = s.flip ? s.flip * ease(u) * Math.PI * 2 : 0;
  if (s.lean) pitch += s.lean * Math.sin(k * Math.PI);
  let fwd = 0;
  if (s.lunge) fwd = s.wave ? s.lunge * Math.abs(Math.sin(k * Math.PI * s.wave)) * (1 - k * 0.3) : s.lunge * Math.sin(k * Math.PI);
  // takla gövdenin ortası etrafında döner (ayak değil)
  const fz = Math.cos(-FACE_OFFSET), fx = Math.sin(-FACE_OFFSET), cH = 0.95;
  wrap.rotation.y = yaw;
  wrap.rotation.x = pitch * fz;
  wrap.position.y = riderBaseY(p) + y + cH * (1 - Math.cos(pitch));
  const off = fwd + cH * Math.sin(pitch);
  p.moveOff.x = fx * off; p.moveOff.z = fz * off;
  if (mv.t >= s.dur) p.move = null;
}
// balık tutarken elde olta
function setRod(p, on) {
  if (p.rod) { p.rod.parent && p.rod.parent.remove(p.rod); p.rod = null; }
  const calib = p.calib || calibBase();
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
  if (p.pet) scene.remove(p.pet.root);
  scene.remove(p.group); p.label.el.remove(); delete players[id];
}
function setAnim(p, name) {
  if (!p.mixer || p.current === name || !p.actions[name]) return;
  const from = p.actions[p.current], to = p.actions[name];
  to.reset().play();
  if (from) to.crossFadeFrom(from, 0.2, false);
  p.current = name;
}
function updateLabelText(p) { p.label.tn.textContent = `${p.name} · Sv. ${p.level}`; }

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
// nefes: dururken göğüs kalkar-iner, omuzlar hafif yükselir, baş çok az sallanır
function applyBreath(p, t) {
  if (!p.bones || p.dead || p.swingT > 0) return;
  const still = p.moving ? 0.25 : 1;
  const ph = t * 1.9 + (p.breathPh || (p.breathPh = Math.random() * 6));
  const b = Math.sin(ph), b2 = Math.sin(ph * 0.5);
  const a = p.group.rotation.y - FACE_OFFSET;
  _f.set(Math.sin(a), 0, Math.cos(a));
  _r.crossVectors(_f, _u);
  p.model.updateMatrixWorld(true);
  rotWorld(p.bones.chest || p.bones.spine, _r, -b * 0.045 * still);
  rotWorld(p.bones.arm, _f, b * 0.035 * still);
  rotWorld(p.bones.armL, _f, -b * 0.035 * still);
  rotWorld(p.bones.neck, _r, b * 0.03 * still);
  rotWorld(p.bones.spine, _u, b2 * 0.025 * still);
}
// ata binince otur: uyluklar öne ve yana açılır (atın gövdesini sarar), baldırlar aşağı sarkar,
// kollar dizgin tutar gibi öne uzanır; gövde dik
function applyRide(p) {
  if (!p.bones || !p.mounted || !p.bones.upL) return;
  const a = p.group.rotation.y - FACE_OFFSET;
  _f.set(Math.sin(a), 0, Math.cos(a));
  _r.crossVectors(_f, _u);
  p.model.updateMatrixWorld(true);
  rotWorld(p.bones.upL, _r, 1.45); rotWorld(p.bones.upR, _r, 1.45);
  rotWorld(p.bones.upL, _f, -0.42); rotWorld(p.bones.upR, _f, 0.42);
  rotWorld(p.bones.legL, _r, -1.5); rotWorld(p.bones.legR, _r, -1.5);
  if (p.swingT <= 0) {
    rotWorld(p.bones.arm, _r, 0.55); rotWorld(p.bones.armL, _r, 0.55);
    rotWorld(p.bones.fore, _r, 0.6); rotWorld(p.bones.foreL, _r, 0.6);
  }
}
// pelerinler yürürken arkaya uçuşur
function updateCapes(p, t) {
  if (!p.capes || !p.capes.length) return;
  const m = p.moving ? 1 : 0;
  p.capeM = (p.capeM || 0) + (m - (p.capeM || 0)) * 0.1;
  for (const c of p.capes) c.rotation.x = 0.12 + p.capeM * (0.55 + Math.sin(t * 9) * 0.08) + Math.sin(t * 1.4) * 0.03;
  if (p.robe) p.robe.visible = !p.mounted;
}
function applySwing(p) {
  const mo = p.moveOff || { x: 0, z: 0 };
  if (p.swingT <= 0 || !p.bones) { if (p.model) { p.model.parent.position.x = mo.x; p.model.parent.position.z = mo.z; } return; }
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
  wrap.position.x = Math.sin(-FACE_OFFSET) * o.lunge + mo.x;
  wrap.position.z = Math.cos(-FACE_OFFSET) * o.lunge + mo.z;
}

// büyü pozu: 'raise' iki kol başın üstüne kalkar, 'push' sağ kol öne uzanır, gövde hafif geriye
function applyCast(p, dt) {
  if (!(p.castT > 0) || !p.bones) return;
  p.castT = Math.max(0, p.castT - dt);
  const t = 1 - p.castT / p.castDur;
  const k = seg(t, 0, 0.3) * (1 - seg(t, 0.7, 1));
  const a = p.group.rotation.y - FACE_OFFSET;
  _f.set(Math.sin(a), 0, Math.cos(a));
  _r.crossVectors(_f, _u);
  p.model.updateMatrixWorld(true);
  if (p.castKind === 'raise') {
    rotWorld(p.bones.arm, _r, 2.5 * k); rotWorld(p.bones.armL, _r, 2.5 * k);
    rotWorld(p.bones.arm, _f, -0.35 * k); rotWorld(p.bones.armL, _f, 0.35 * k);
    rotWorld(p.bones.spine, _r, 0.18 * k);
    rotWorld(p.bones.neck, _r, 0.25 * k);
  } else {
    rotWorld(p.bones.arm, _r, 1.5 * k); rotWorld(p.bones.fore, _r, 0.2 * k);
    rotWorld(p.bones.armL, _r, 0.6 * k);
    rotWorld(p.bones.spine, _u, -0.35 * k);
    rotWorld(p.bones.spine, _r, -0.12 * k);
  }
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
      const w = swordMesh({ color: (def.style && def.style.weapon) || (def.boss ? '#ffb347' : '#9aa3ad'), len: 0.9, glow: def.boss });
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
                 ry: m.ry || 0, moving: false, atkT: 0, t: Math.random() * 10, height: v.height ? v.height + 0.25 : (def.shape === 'flyer' ? 3.2 : 2.2) * (def.scale || 1) };
}
function removeMob(id) {
  const m = mobs[id]; if (!m) return;
  scene.remove(m.v.root); m.label.el.remove(); delete mobs[id];
}
// ölen yaratık yan yatar ve bir süre yerde kalır (boss'lar daha uzun), sonra toprağa gömülür
const corpses = [];
function killMobVisual(m, boss) {
  m.label.el.remove(); delete mobs[m.id];
  const root = m.v.root;
  // yerdeki halka/parıltı gövdeyle birlikte dikilmesin diye kaldırılır
  const flat = []; root.traverse((o) => { if (o.geometry && (o.geometry.type === 'RingGeometry' || o.geometry.type === 'CircleGeometry')) flat.push(o); });
  for (const o of flat) o.parent.remove(o);
  // yere yatınca gövdenin yarı genişliği kadar kaldırılır (yarısı toprağa girmesin)
  const ry = root.rotation.y; root.rotation.y = 0; root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3());
  root.rotation.y = ry; root.rotation.order = 'YXZ';
  const half = Math.max(0.05, Math.min(size.x, size.z) / 2);
  corpses.push({ root, t: 0, side: Math.random() < 0.5 ? 1 : -1, half, lie: boss ? 12 : 3, boss, y0: root.position.y, dust: false });
}
function updateCorpses(dt) {
  for (let i = corpses.length - 1; i >= 0; i--) {
    const c = corpses[i]; c.t += dt;
    const fallT = c.boss ? 1.0 : 0.6, fall = Math.min(1, c.t / fallT), e = fall * fall;     // hızlanarak devrilir
    const bounce = fall >= 1 ? Math.sin(Math.min(1, (c.t - fallT) / 0.25) * Math.PI) * 0.06 : 0;
    c.root.rotation.z = c.side * (Math.PI / 2) * e - c.side * bounce;
    let y = c.y0 + c.half * Math.sin(e * Math.PI / 2);
    if (fall >= 1 && !c.dust) {
      c.dust = true;
      const p = c.root.position, n = c.boss ? 40 : 14;
      for (let k = 0; k < n; k++) { const a = Math.random() * Math.PI * 2; fx.emit(p.x + Math.cos(a) * c.half * 2, 0.2, p.z + Math.sin(a) * c.half * 2, { vx: Math.cos(a) * 2, vy: 0.8, vz: Math.sin(a) * 2, color: '#b8a888', size: c.boss ? 1.2 : 0.5, life: 1.0, grow: 1.5, drag: 2 }); }
      if (c.boss) sfx.hit('stone', true, p);
    }
    const sinkT = c.t - c.lie;
    if (sinkT > 0) y -= (c.half * 2 + 0.2) * Math.min(1, sinkT / 1.5);
    c.root.position.y = y;
    if (sinkT > 1.5) { scene.remove(c.root); corpses.splice(i, 1); }
  }
}
function updateMobs(dt) {
  for (const m of Object.values(mobs)) {
    m.t += dt;
    m.v.root.position.lerp(m.target, 1 - Math.exp(-10 * dt));
    m.v.root.rotation.y = angleLerp(m.v.root.rotation.y, m.ry, 1 - Math.exp(-10 * dt));
    if (m.atkT > 0) m.atkT = Math.max(0, m.atkT - dt);
    const atk = m.atkT > 0 ? Math.sin((1 - m.atkT / 0.4) * Math.PI) : 0;
    if (!(m.frozenUntil > performance.now())) m.v.update(m.t, m.moving, atk, dt);
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
let myName = '';
let myGm = false;
let selected = null;   // {uid} veya {slot}
const EQUIP = ['weapon', 'armor', 'helmet', 'shoes', 'bracelet', 'earring'];
const BONUS_NAMES = { maxhp: ['Maks. Can', ''], maxmp: ['Maks. Mana', ''], atk: ['Saldırı', ''], def: ['Savunma', ''], crit: ['Kritik', '%'],
  atkspeed: ['Saldırı Hızı', '%'], movespeed: ['Hareket Hızı', '%'], monster: ['Canavarlara Güç', '%'], hpsteal: ['Can Çalma', '%'] };
const SLOT_NAMES = { costume: 'Kostüm', wings: 'Kanat', pet: 'Evcil hayvan', stone: 'Ruh taşı', material: 'Malzeme', weapon: 'Silah', armor: 'Zırh', helmet: 'Miğfer', shoes: 'Ayakkabı', bracelet: 'Bilezik', earring: 'Küpe', potion: 'İksir', use: 'Kullanılır', fish: 'Balık', gem: 'Değerli taş' };
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
  stone: '<path d="M12 3l7 6-3 10H8L5 9z"/>',
  material: '<path d="M12 21c-5-3-7-8-5-14 6 0 9 4 9 9"/><path d="M12 21V9"/>',
  costume: '<path d="M9 3h6l4 4-3 2v12H8V9L5 7z"/><path d="M12 3v4"/>',
  wings: '<path d="M12 8C9 3 3 3 2 9c3-1 5 0 6 2-3 0-5 2-5 5 3-2 6-2 9-1z"/><path d="M12 8c3-5 9-5 10 1-3-1-5 0-6 2 3 0 5 2 5 5-3-2-6-2-9-1z"/>',
  pet: '<circle cx="12" cy="15" r="5"/><circle cx="6" cy="9" r="2"/><circle cx="18" cy="9" r="2"/><circle cx="9" cy="5" r="1.6"/><circle cx="15" cy="5" r="1.6"/>',
};
// ---------- gerçekçi 3D simgeler (icons.js) ----------
function iconBuilder(key, def) {
  const s = def.slot;
  if (s === 'weapon') return () => weaponMesh(def);
  if (s === 'armor') return () => {
    if (def.model && ITEM_MODELS[def.model]) return itemModel(def.model, chestMesh(def));
    const g = new THREE.Group(); g.add(chestMesh(def));
    for (const sx of [-1, 1]) { const p = padMesh(def); p.position.set(sx * 0.2, 0.15, 0); g.add(p); }
    return g;
  };
  if (s === 'helmet') return () => (def.model && ITEM_MODELS[def.model] ? itemModel(def.model, helmetMesh(def)) : helmetMesh(def));
  if (s === 'shoes') return () => icons.bootsMesh(def);
  if (s === 'bracelet') return () => icons.braceletMesh(def);
  if (s === 'earring') return () => icons.earringMesh(def);
  if (s === 'potion') return () => icons.potionMesh(def);
  if (s === 'gem') return () => icons.pearlMesh(def.color);
  if (s === 'fish') return () => (key === 'b_cizme' ? icons.bootsMesh({ color: '#5a4a3a' }) : icons.fishMesh(def.color));
  if (s === 'stone') return () => icons.spiritStoneMesh(def.color, def.stone.grade);
  if (s === 'material') return () => icons.leafMesh(def.color);
  if (key === 'kutsama') return () => icons.scrollMesh();
  if (key === 'efsun') return () => icons.crystalMesh('#c86bff');
  if (key === 'efsun_degis') return () => icons.crystalMesh('#4fd1c5', true);
  if (key === 'olta') return () => icons.rodMesh();
  if (key === 'yem') return () => icons.wormMesh();
  if (key === 'istiridye') return () => icons.shellMesh();
  if (key === 'at_muhru') return () => icons.medalMesh();
  if (key === 'isin_yuzugu') return () => icons.ringMesh();
  return null;
}
const ICON_POSE = { weapon: { rz: -0.8, ry: 0.35 }, armor: { ry: 0.45, rx: 0.08 }, helmet: { ry: 0.65, rx: 0.1 }, shoes: { ry: 0.55, rx: 0.2 },
  bracelet: { ry: 0.3 }, earring: { ry: 0.4 }, potion: { ry: 0.3, rx: 0.1 }, fish: { ry: 0.5 }, gem: { rx: 0.5 }, use: { ry: 0.5, rx: 0.15 }, stone: { rx: 0.4, ry: 0.3 }, material: { rx: 0.3, ry: 0.4 } };
function itemIcon(key, def, size = 26, slot) {
  if (def && key) {
    const b = iconBuilder(key, def);
    const url = b && icons.iconURL(key, b, ICON_POSE[def.slot]);
    if (url) return `<img class="ico3d" src="${url}" width="${size + 8}" height="${size + 8}" alt="" draggable="false">`;
  }
  return iconSvg(def, size, slot);
}
icons.onIconsReady(() => {
  if (invEl.classList.contains('open')) renderInv();
  if (document.getElementById('shop').classList.contains('open')) renderShop();
});

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
// ---------- demirci artısı ve ruh taşları (sunucudaki rules.js ile aynı formüller) ----------
const UP_CHANCE = [95, 90, 85, 75, 65, 55, 45, 35, 25], STONE_UP_CHANCE = [70, 60, 50, 40], STONE_ADD_CHANCE = [95, 85, 75, 65, 55];
const SOCKETS = { weapon: 3, armor: 3 };
const upgradeCost = (def, up) => Math.round((2000 + (def.lv || 1) * 300) * (up + 1) * (1 + up * 0.35));
const stoneUpCost = (g) => 5000 * (g + 1) * (g + 1);
const LEAVES = ['yaprak_mor', 'yaprak_mavi', 'yaprak_kirmizi'];
const leafNeed = (def, up) => ((def.lv || 1) >= 30 && up >= 6 ? up + 1 : 0);
const countItem = (key) => inv.inventory.reduce((a, i) => a + (i.key === key ? (i.n || 1) : 0), 0);
function upBonus(def, up) {
  if (!up) return { atk: 0, def: 0, hp: 0 };
  return { atk: def.atk ? Math.round(def.atk * 0.08 * up + up * 2) : 0, def: def.def ? Math.round(def.def * 0.1 * up + up) : 0, hp: def.hp ? Math.round(def.hp * 0.08 * up) : 0 };
}
const itemName = (it, def) => (def ? def.name : '?') + (it && it.up ? ' +' + it.up : '');
function statTextIt(it, def) {
  const b = upBonus(def, (it && it.up) || 0), parts = [];
  if (def.atk) parts.push(`Saldırı ${def.atk + b.atk}${b.atk ? ` <span class="upv">(+${b.atk})</span>` : ''}`);
  if (def.def) parts.push(`Savunma ${def.def + b.def}${b.def ? ` <span class="upv">(+${b.def})</span>` : ''}`);
  if (def.hp) parts.push(`Can ${def.hp + b.hp}${b.hp ? ` <span class="upv">(+${b.hp})</span>` : ''}`);
  const BN = { crit: 'Kritik', pierce: 'Delici', dodge: 'Kaçınma', atkspeed: 'Saldırı hızı', movespeed: 'Hareket hızı', mp: 'Mana', monster: 'Canavarlara karşı' };
  for (const [k, v] of Object.entries(def.bonus || {})) if (BN[k]) parts.push(`${BN[k]} +${['mp'].includes(k) ? '' : '%'}${v}`);
  return parts.length ? parts.join(' · ') : statText(def);
}
// silah/zırhın taş yuvaları: dolu yuva taşın renginde
function socketHtml(it, def) {
  const n = SOCKETS[def.slot]; if (!n) return '';
  let h = '<span class="socks">';
  for (let i = 0; i < n; i++) {
    const k = (it.sock || [])[i], sd = k && ITEMS[k];
    h += sd ? `<i class="sock full" style="--c:${sd.color}" title="${esc(sd.name)}"></i><small style="color:${sd.color}">${esc(sd.name)}</small>` : '<i class="sock"></i>';
  }
  return h + '</span>';
}
const invEl = document.getElementById('inv'), gridEl = document.getElementById('grid'), detailEl = document.getElementById('detail');
function renderInv() {
  document.getElementById('yang').textContent = `${inv.yang.toLocaleString('tr-TR')} Yang`;
  const eqEl = document.getElementById('equipcol');
  eqEl.querySelectorAll('.eq').forEach((el) => {
    const slot = el.dataset.slot, it = inv.equip[slot], def = it ? ITEMS[it.key] : null;
    el.innerHTML = `${itemIcon(it && it.key, def, 22, slot)}<span>${def ? `<span style="color:${RARITY[def.rarity]}">${esc(itemName(it, def))}</span>` : 'Boş'}<small>${SLOT_NAMES[slot]}</small></span>`;
    el.classList.toggle('sel', !!(selected && selected.slot === slot));
  });
  document.getElementById('stats').innerHTML = `Saldırı <b>${inv.atk}</b> · Savunma <b>${inv.def}</b> · Can <b>${inv.maxHp}</b>`;
  let html = '';
  for (let i = 0; i < 32; i++) {
    const it = inv.inventory[i];
    if (it) {
      const def = ITEMS[it.key] || { name: '?', rarity: 0 };
      const sel = selected && selected.uid === it.uid ? ' sel' : '';
      html += `<button class="slot${sel}" data-uid="${it.uid}" aria-label="${esc(itemName(it, def))}" style="border-color:${sel ? '' : RARITY[def.rarity] + '66'}">${itemIcon(it.key, def)}${it.n > 1 ? `<i class="cnt">${it.n}</i>` : ''}${it.up ? `<i class="upb">+${it.up}</i>` : ''}</button>`;
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
  else if (def.slot === 'fish' || def.slot === 'gem' || def.slot === 'material') buttons = '<button class="alt" data-act="drop">Yere at</button>';
  else if (def.slot === 'stone') buttons = `<button data-act="socket" style="background:${def.color};color:#111">${def.stone.for === 'weapon' ? 'Silaha tak' : 'Zırha tak'}</button><button class="alt" data-act="drop">Yere at</button>`;
  else buttons = '<button data-act="equip">Giy</button><button class="alt" data-act="drop">Yere at</button>';
  detailEl.innerHTML = `<span class="dico">${itemIcon(it.key, def, 48)}</span><span class="grow"><b style="color:${RARITY[def.rarity]}">${esc(itemName(it, def))}${it.n > 1 ? ' x' + it.n : ''}</b><br>` +
    `<span style="color:#c9c4b6">${SLOT_NAMES[def.slot] || ''} · ${statTextIt(it, def)}</span> ${reqText(def)}<span style="color:#8b877c">${esc(cls)}</span>` +
    socketHtml(it, def) +
    (def.desc ? `<br><small style="color:#8b877c">${esc(def.desc)}</small>` : '') +
    (it.bon && it.bon.length ? '<br>' + it.bon.map(([t, v]) => `<small style="color:#c86bff">${BONUS_NAMES[t] ? BONUS_NAMES[t][0] : t} +${v}${BONUS_NAMES[t] ? BONUS_NAMES[t][1] : ''}</small>`).join(' · ') : '') +
    '</span>' + buttons +
    (EQUIP.includes(def.slot) && inv.inventory.some((x) => x.key === 'efsun') && (it.bon || []).length < 5 ? '<button class="alt" data-act="enchant" style="color:#c86bff">Efsunla</button>' : '') +
    (EQUIP.includes(def.slot) && inv.inventory.some((x) => x.key === 'efsun_degis') && (it.bon || []).length ? '<button class="alt" data-act="reroll" style="color:#4fd1c5">Efsun Değiştir</button>' : '');
}
document.getElementById('invbtn').addEventListener('click', () => { selected = null; renderInv(); invEl.classList.add('open'); tutStats.invOpened = true; });
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
  if (b.dataset.act === 'use' && it) { socket.emit('useItem', it.uid); if (ITEMS[it.key] && ITEMS[it.key].slot === 'potion') sfx.potion(); return; }
  if (b.dataset.act === 'enchant') { socket.emit('enchant', selected.slot ? { slot: selected.slot } : { uid: selected.uid }); return; }
  if (b.dataset.act === 'reroll') { socket.emit('reroll', selected.slot ? { slot: selected.slot } : { uid: selected.uid }); return; }
  if (b.dataset.act === 'socket' && it) {
    const sd = ITEMS[it.key].stone, slot = sd.for;
    if (!inv.equip[slot]) { toast(slot === 'weapon' ? 'Önce bir silah kuşan.' : 'Önce bir zırh kuşan.'); return; }
    socket.emit('socketStone', { stone: it.uid, slot }); return;
  }
  selected = null;
});
// ---------- demirci (Metin2 gibi +0..+9, ruh taşı +0..+4) ----------
const smithEl = document.getElementById('smith'), smithList = document.getElementById('smithList');
let smithScroll = false;
function openSmith() { smithEl.classList.add('open'); document.getElementById('smithResult').className = ''; renderSmith(); }
function renderSmith() {
  if (!smithEl.classList.contains('open')) return;
  const scrolls = inv.inventory.filter((i) => i.key === 'kutsama').reduce((a, i) => a + (i.n || 1), 0);
  if (!scrolls) smithScroll = false;
  document.getElementById('smithYang').textContent = `${inv.yang.toLocaleString('tr-TR')} Yang`;
  const sc = document.getElementById('smithScroll');
  sc.checked = smithScroll; sc.disabled = !scrolls;
  document.getElementById('smithScrollN').textContent = scrolls ? `(${scrolls} adet)` : '(yok · dükkânda satılır)';
  const rows = [];
  for (const slot of EQUIP) { const it = inv.equip[slot]; if (it) rows.push({ it, ref: { slot }, eq: true }); }
  for (const it of inv.inventory) { const d = ITEMS[it.key]; if (d && (EQUIP.includes(d.slot) || d.slot === 'stone')) rows.push({ it, ref: { uid: it.uid } }); }
  let html = '';
  for (const { it, ref, eq } of rows) {
    const def = ITEMS[it.key];
    let info, can, btn = 'Yükselt';
    if (def.slot === 'stone') {
      const g = def.stone.grade;
      can = g < 4;
      info = can ? `+${g} → +${g + 1} · Şans %${STONE_UP_CHANCE[g]} · ${stoneUpCost(g).toLocaleString('tr-TR')} Yang<br><small class="warn">Başarısız olursa taş kırılır.</small>` : 'En yüksek derece (+4)';
    } else {
      const up = it.up || 0;
      can = up < 9;
      const risk = smithScroll ? 'Kağıt korur' : up >= 4 ? 'Başarısızsa −1' : 'Başarısızsa değişmez';
      // Sv. 30+ eşyalarda +6'dan sonra üç renk yaprak istenir
      const need = can ? leafNeed(def, up) : 0;
      let leafHtml = '';
      if (need) {
        leafHtml = '<span class="leaves">' + LEAVES.map((k) => { const have = countItem(k), ok = have >= need;
          if (!ok) can = false;
          return `<span class="leaf${ok ? '' : ' miss'}" style="--c:${ITEMS[k].color}">${itemIcon(k, ITEMS[k], 18)}${have}/${need}</span>`; }).join('') + '</span>';
      }
      info = up < 9 ? `+${up} → +${up + 1} · Şans %${UP_CHANCE[up]} · ${upgradeCost(def, up).toLocaleString('tr-TR')} Yang<br><small class="${up >= 4 && !smithScroll ? 'warn' : ''}">${risk}</small>${leafHtml}` : 'En yüksek seviye (+9)';
    }
    html += `<div class="srow">${itemIcon(it.key, def, 26)}<span class="grow"><b style="color:${RARITY[def.rarity]}">${esc(itemName(it, def))}</b>${eq ? ' <small class="eqtag">kuşanılı</small>' : ''}${it.n > 1 ? ' <small>x' + it.n + '</small>' : ''}<br><small>${info}</small></span>` +
      `<button data-up='${JSON.stringify(ref)}' ${can ? '' : 'disabled'}>${btn}</button></div>`;
  }
  smithList.innerHTML = html || '<p style="color:#8b877c">Yükseltilecek eşyan yok.</p>';
}
smithList.addEventListener('click', (e) => {
  const b = e.target.closest('[data-up]'); if (!b || !socket) return;
  const ref = JSON.parse(b.dataset.up);
  socket.emit('upgrade', { ...ref, scroll: smithScroll });
  sfx.click();
});
document.getElementById('smithScroll').addEventListener('change', (e) => { smithScroll = e.target.checked; renderSmith(); });
document.getElementById('smithClose').addEventListener('click', () => smithEl.classList.remove('open'));
function smithResult(ok, text) {
  const r = document.getElementById('smithResult');
  r.textContent = text; r.className = ''; void r.offsetWidth; r.className = ok ? 'ok' : 'fail';
  const me = players[myId];
  if (me) {
    const p = me.group.position;
    fx.hitSpark({ x: p.x, y: 1.2, z: p.z }, ok, 'stone');
    if (ok) fx.levelUp(me);
  }
  if (ok) sfx.enchant(); else sfx.hit('stone', false, me ? me.group.position : null);
}

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
    else if (st === 'available' || (!st && myLevel >= 25)) body = '<p>Kızılçam Ormanı\'ndaki <b>Vahşi Kurt</b>lar atlarımıza saldırıyor. <b>20</b> tanesini yen, sana kendi atını vereyim.</p><button class="btn" data-quest="accept">Görevi kabul et</button>';
    else if (st === 'active') body = `<p>Vahşi Kurt: <b>${q.horseKills || 0} / 20</b></p><p class="muted">Kızılçam Ormanı'nda (Sv. 15, köyün doğusundaki geçitten) bulabilirsin.</p>`;
    else if (st === 'ready') body = '<p>Harika iş çıkardın! Atın seni bekliyor.</p><button class="btn" data-quest="claim">At Mührü\'nü al</button>';
    else body = '<p>Atına iyi bak. Envanterindeki At Mührü ile binip inebilirsin. Atlıyken saldırırsan ya da beceri kullanırsan atından inersin.</p>';
    html = `<div style="display:flex;flex-direction:column;gap:10px;font-size:14px;line-height:1.5">${body}</div>`;
  } else if (shopKind === 'teleport') {
    for (const m of MAPS) {
      if (m.hidden && !myGm) continue;
      const here = m.id === currentMap.id, ok = myGm || myLevel >= m.minLevel;
      html += `<div class="srow"><span class="grow"><b>${esc(m.name)}</b>${m.village ? ' <small>(köy)</small>' : ''}<br><small style="color:${ok ? '#8b877c' : '#ff6a5a'}">Sv. ${m.minLevel}+</small></span>` +
        (here ? '<small>Buradasın</small>' : `<button data-tp="${m.id}" ${ok ? '' : 'disabled'}>Git</button>`) + '</div>';
    }
  } else if (shopKind === 'sell') {
    if (!inv.inventory.length) html = '<p class="muted">Satacak eşyan yok.</p>';
    for (const it of inv.inventory) {
      const def = ITEMS[it.key]; if (!def) continue;
      const value = (def.price ? Math.floor(def.price * 0.25) : def.tier != null ? 100 * (def.tier + 1) * (def.tier + 1) : 10) * (it.n || 1);
      html += `<div class="srow">${itemIcon(it.key, def, 22)}<span class="grow"><b style="color:${RARITY[def.rarity]}">${esc(def.name)}${it.n > 1 ? ' x' + it.n : ''}</b><br><small>${statText(def)}</small></span>` +
        `<button class="alt" data-sell="${it.uid}">Sat ${value.toLocaleString('tr-TR')}</button></div>`;
    }
  } else {
    const keys = shop ? shop[shopKind] || [] : [];
    for (const key of keys) {
      const def = ITEMS[key]; if (!def) continue;
      if (def.classes && !def.classes.includes(myClass)) continue;   // sadece kendi sınıfının silahları
      const afford = inv.yang >= def.price;
      let cls = '';
      if (def.classes) cls = ' · ' + def.classes.map((c) => (CLASSES[c] || {}).name || c).join(', ');
      html += `<div class="srow">${itemIcon(key, def, 22)}<span class="grow"><b style="color:${RARITY[def.rarity]}">${esc(def.name)}</b> ${reqText(def)}<br><small>${statText(def)}${esc(cls)}</small></span>` +
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
  if (b.dataset.buy) { socket.emit('buy', { key: b.dataset.buy, n: Number(b.dataset.n || 1) }); sfx.pickup(true); }
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
  myHpFrac = max ? hp / max : 1;
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
potBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (socket) { socket.emit('usePotion', 'hp'); if (!potBtn.classList.contains('empty')) sfx.potion(); } });
const mpBtn = document.getElementById('mpBtn');
mpBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); if (socket) { socket.emit('usePotion', 'mp'); if (!mpBtn.classList.contains('empty')) sfx.potion(); } });
const mpBarEl = document.getElementById('mpbar'), mpTextEl = document.getElementById('mptext');
function setMp(mp, max) {
  mpBarEl.style.width = Math.max(0, Math.min(100, 100 * mp / max)) + '%';
  mpTextEl.textContent = `${mp} / ${max}`;
  myMp = mp; myMpMax = max || 1;
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
// ---------- karakter penceresi: Metin2 tarzı durum puanları ----------
const charwinEl = document.getElementById('charwin');
let attrs = null;
const STAT_INFO = {
  str: { name: 'GÜÇ', short: 'STR', color: '#ff8a5a', desc: (m) => (m === 'str' ? 'Saldırı gücü (ana özellik)' : 'Biraz saldırı gücü') },
  vit: { name: 'CANLILIK', short: 'VIT', color: '#ff5a6a', desc: () => 'Azami can ve biraz savunma' },
  int: { name: 'ZEKA', short: 'INT', color: '#7fb3ff', desc: (m) => (m === 'int' ? 'Saldırı gücü, mana, beceri hasarı' : 'Azami mana ve beceri hasarı') },
  dex: { name: 'ÇEVİKLİK', short: 'DEX', color: '#7be08f', desc: (m) => (m === 'dex' ? 'Saldırı gücü (ana özellik), kritik' : 'Kritik vuruş şansı, biraz savunma') },
};
function renderChar() {
  const pts = document.getElementById('charPts');
  if (!attrs) return;
  pts.textContent = attrs.free; pts.style.display = attrs.free > 0 ? '' : 'none';
  if (!charwinEl.classList.contains('open')) return;
  document.getElementById('charFree').textContent = attrs.free > 0 ? `Boş puan: ${attrs.free}` : 'Boş puan yok';
  const cls = (CLASSES[myClass] || {}).name || myClass;
  document.getElementById('charHead').innerHTML = `<span><b>${esc(myName || '')}</b> · ${esc(cls)}</span><span>Seviye <b>${myLevel}</b></span>`;
  document.getElementById('charStats').innerHTML = ['str', 'vit', 'int', 'dex'].map((k) => {
    const st = STAT_INFO[k], v = attrs.values[k], can = attrs.free > 0 && v < attrs.max;
    return `<div class="st-row${attrs.main === k ? ' main' : ''}"><span class="st-ico" style="background:linear-gradient(180deg,${st.color},${st.color}aa)">${st.short}</span>` +
      `<span class="st-name"><b>${st.name}</b><small>${st.desc(attrs.main)}</small></span><span class="st-val">${v}</span>` +
      `<button data-st="${k}" data-n="1" ${can ? '' : 'disabled'} aria-label="${st.name} +1">+</button><button class="five" data-st="${k}" data-n="5" ${attrs.free >= 2 && can ? '' : 'disabled'} aria-label="${st.name} +5">+5</button></div>`;
  }).join('');
  const row = (n, v) => `<span>${n}<b>${v}</b></span>`;
  document.getElementById('charDerived').innerHTML = row('Saldırı', attrs.atk) + row('Savunma', attrs.def) + row('Azami can', attrs.maxHp) + row('Azami mana', attrs.maxMp) +
    row('Kritik', attrs.crit + '%') + row('Beceri hasarı', '+' + (attrs.skill || 0) + '%') + row('Saldırı hızı', '+' + (attrs.atkspeed || 0) + '%') + row('Hareket hızı', '+' + (attrs.movespeed || 0) + '%') +
    row('Delici vuruş', (attrs.pierce || 0) + '%') + row('Kaçınma', (attrs.dodge || 0) + '%') + row('Canavarlara karşı', '+' + (attrs.monster || 0) + '%') + row('Can çalma', (attrs.hpsteal || 0) + '%') +
    Object.entries(attrs.vs || {}).filter(([, v]) => v > 0).map(([c, v]) => row(((CLASSES[c] || {}).name || c) + 'lara karşı', '+' + v + '%')).join('');
}
document.getElementById('charBtn').addEventListener('click', () => { charwinEl.classList.add('open'); renderChar(); });
document.getElementById('charClose').addEventListener('click', () => charwinEl.classList.remove('open'));
document.getElementById('charStats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-st]'); if (!b || !socket) return;
  socket.emit('statUp', { stat: b.dataset.st, n: Number(b.dataset.n) });
  sfx.click();
});
window.addEventListener('keydown', (e) => { if ((e.key === 'k' || e.key === 'K') && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { charwinEl.classList.toggle('open'); renderChar(); } });

const skillbarEl = document.getElementById('skillbar'), skillwinEl = document.getElementById('skillwin');
let skillState = { levels: {}, points: 0, unlock: 5 };
const skillCdUntil = {};
const skLabel = (lv) => (lv > 17 ? 'M' + (lv - 17) : String(lv));
function mySkills() { return SKILLS[myClass] || []; }
// beceri simgeleri (24x24, beyaz çizgi)
const SKILL_ICONS = {
  s_ucluk: '<path d="M4 20 14 4"/><path d="M8 21 18 6"/><path d="M12 22 21 9"/>',
  s_firtina: '<path d="M12 3a9 9 0 1 1-8.5 6"/><path d="M12 7a5 5 0 1 1-4.7 3.3"/><path d="m12 12 7-9"/><path d="m17 3 2 0 0 2"/>',
  s_hamle: '<path d="M3 12h13"/><path d="m12 6 6 6-6 6"/><path d="M3 7h5"/><path d="M3 17h5"/><path d="M21 4v16"/>',
  s_demir: '<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/><path d="M12 7v10"/><path d="M8 11h8"/>',
  n_golge: '<path d="M14 3a8 8 0 1 0 7 11 6 6 0 0 1-7-11z"/><path d="m3 21 7-7"/><path d="m8 14 2 2"/>',
  n_zehir: '<path d="M12 3s5 6 5 10a5 5 0 0 1-10 0c0-4 5-10 5-10z"/><path d="m4 21 5-5"/><path d="m6 15 3 3"/>',
  n_yagmur: '<path d="M6 3v9"/><path d="m4 10 2 3 2-3"/><path d="M12 5v11"/><path d="m10 14 2 3 2-3"/><path d="M18 3v9"/><path d="m16 10 2 3 2-3"/><path d="M4 21h16"/>',
  n_adim: '<path d="M3 8h10a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h7"/>',
  u_kara: '<path d="M14 3 5 12l2 2 9-9V3z"/><path d="m4 20 3-3"/><path d="M15 21c3 0 5-2 5-5-1 1-2 1-3 0 0-2 1-3 0-5-1 2-3 3-3 5-1-1-1-2-1-3-1 2-2 3-2 5 0 2 2 3 4 3z"/>',
  u_emme: '<path d="M12 12m-2 0a2 2 0 1 0 4 0 4 4 0 1 0-8 0 6 6 0 1 0 12 0 8 8 0 1 0-16 0"/>',
  u_alev: '<path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7 0 2-1 3-2 3 0-3-1-6-4-8 0 3-2 5-3 7-1 1-2 3-2 5 0 4 3 7 7 7z"/><path d="M12 22c-2 0-3-1.5-3-3.5 0-2 2-3 3-5 1 2 3 3 3 5S14 22 12 22z"/>',
  u_kalkan: '<path d="M12 2 4 5v6c0 5 3.5 9 8 11 4.5-2 8-6 8-11V5z"/><path d="M15 9a4 4 0 1 0 0 6 3 3 0 1 1 0-6z"/>',
  m_sifa: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-3 4.5 4.5 0 0 1 8 3c0 6-8 11-8 11z"/><path d="M12 9v6"/><path d="M9 12h6"/>',
  m_simsek: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  m_kutsama: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M2 12h3"/><path d="M19 12h3"/><path d="m5 5 2 2"/><path d="m17 17 2 2"/><path d="m5 19 2-2"/><path d="m17 7 2-2"/>',
  m_kukreme: '<path d="M4 12c0-4 3-7 7-7l5 3-2 2 4 2-4 2 2 2-5 3c-4 0-7-3-7-7z"/><path d="M19 8c1 1 2 3 2 4s-1 3-2 4"/><circle cx="9" cy="10" r="1"/>',
  o_coklu: '<path d="M3 21 18 6"/><path d="M3 15 15 3"/><path d="M9 21 21 9"/><path d="m15 3h3v3"/><path d="m18 6h3v3"/>',
  o_zehirli: '<path d="M3 21 17 7"/><path d="M14 4h6v6"/><path d="M6 6s3 3 3 5a3 3 0 0 1-6 0c0-2 3-5 3-5z"/>',
  o_ates: '<path d="M3 21 17 7"/><path d="M14 4h6v6"/><path d="M7 3c0 2-3 3-3 6a3 3 0 0 0 6 0c0-2-2-3-1-5-1 0-2 0-2-1z"/>',
  o_hafif: '<path d="M20 4C10 4 4 10 4 20"/><path d="M20 4c0 8-6 13-12 13"/><path d="M14 10 8 16"/>',
};
function lighten(hex, k) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(c + (255 - c) * k).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}
// M1/M2/M3'te beceri düğmesi de ustalık rengini alır
const skColor = (sk, lv) => { const m = fx.MASTERY[fx.masteryOf(lv)]; return m ? m.color : sk.color; };
function renderSkillbar() {
  skillbarEl.innerHTML = mySkills().map((sk) => {
    const lv = skillState.levels[sk.key] || 0;
    const mp = sk.mp + sk.mpLv * Math.max(0, lv - 1);
    const icon = SKILL_ICONS[sk.key] || '<circle cx="12" cy="12" r="6"/>';
    const col = skColor(sk, lv);
    return `<button class="skb${lv ? ' ready' : ' locked'}${fx.masteryOf(lv) ? ' m' + fx.masteryOf(lv) : ''}" data-sk="${sk.key}" aria-label="${esc(sk.name)}" style="--c:${col};--c2:${lighten(col, 0.45)}">` +
      `<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>` +
      `<span class="cd" id="cd_${sk.key}"></span><span class="cdt" id="cdt_${sk.key}"></span>` +
      (lv ? `<span class="lv">${skLabel(lv)}</span><span class="mp">${mp}</span>` : '') + '</button>';
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
    return `<div class="sk-row"><span class="badge" style="color:${skColor(sk, lv)}">${lv ? skLabel(lv) : '–'}</span><span class="grow"><b>${esc(sk.name)}</b><br><small>${esc(sk.desc)}</small><br><small>Mana ${mp} · Bekleme ${sk.cd} sn</small></span><button data-up="${sk.key}" ${can ? '' : 'disabled'} aria-label="${esc(sk.name)} seviyesini artır">+</button></div>`;
  }).join('');
}
skillbarEl.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('[data-sk]'); if (!b) return;
  e.preventDefault();
  b.classList.remove('press'); void b.offsetWidth; b.classList.add('press');
  setTimeout(() => b.classList.remove('press'), 360);
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
    const tEl = document.getElementById('cdt_' + sk.key);
    const c = skillCdUntil[sk.key];
    if (c && c.until > now) {
      // saat gibi kararan bekleme kadranı
      const k = 100 * (c.until - now) / c.total;
      el.style.background = `conic-gradient(rgba(0,0,0,0.72) ${k}%, rgba(0,0,0,0) ${k}%)`;
      const sec = Math.ceil((c.until - now) / 1000);
      if (tEl.textContent !== String(sec)) tEl.textContent = sec;
      el.parentElement.classList.remove('ready');
    } else if (el.style.background) {
      el.style.background = ''; tEl.textContent = '';
      if (skillState.levels[sk.key]) el.parentElement.classList.add('ready');
    }
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
  // köydeyken pazar tezgâhı düğmesi; at düğmesi görünüyorsa onun yanına kayar
  stallBtn.style.display = currentMap && currentMap.village ? 'flex' : 'none';
  stallBtn.style.left = mountBtn.style.display === 'none' ? '174px' : '226px';
}
const stallBtn = document.getElementById('stallBtn');
stallBtn.addEventListener('click', () => { sfx.click(); social.openMyStall(); });
const talkBtn = document.getElementById('talkBtn');
let nearAction = null;
talkBtn.addEventListener('click', () => { if (nearAction) nearAction.run(); });
const deadEl = document.getElementById('dead');
document.getElementById('respawnBtn').addEventListener('click', () => { if (socket) socket.emit('respawn'); });
// Metin2 gibi: "Burada başla" 5 saniye sonra tıklanabilir
const hereBtn = document.getElementById('respawnHereBtn');
let deadTimer = null;
hereBtn.addEventListener('click', () => { if (socket && !hereBtn.disabled) socket.emit('respawn', { here: true }); });
function startDeadCountdown() {
  let left = 5;
  hereBtn.disabled = true; hereBtn.textContent = `Burada başla (${left})`;
  clearInterval(deadTimer);
  deadTimer = setInterval(() => {
    left--;
    if (left <= 0) { clearInterval(deadTimer); hereBtn.disabled = false; hereBtn.textContent = 'Burada başla'; }
    else hereBtn.textContent = `Burada başla (${left})`;
  }, 1000);
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

// ---------- otomatik av (Metin2 tarzı) ----------
// Açıkken en yakın yaratığa (ve metin taşına) yürür, vurur, hazır becerileri kullanır, canı azalınca iksir içer.
// Joystick'e dokununca o an sen yönetirsin; bırakınca kaldığı yerden devam eder.
const auto = { on: false, target: null, pick: 0, skill: 0, pot: 0, mpPot: 0, best: Infinity, stuckT: 0, skip: new Map() };
const autoBtn = document.getElementById('autoBtn');
function setAuto(on) {
  auto.on = on; auto.target = null; auto.skip.clear();
  autoBtn.classList.toggle('on', on); autoBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
  toast(on ? 'Otomatik av açık' : 'Otomatik av kapalı');
}
autoBtn.addEventListener('click', () => { sfx.click(); if (!auto.on && currentMap && currentMap.safe) { toast('Burada av yok.'); return; } setAuto(!auto.on); });
let myHpFrac = 1, myMpMax = 1;
// hedefin konumu ve gövde yarıçapı
function autoTargetPos(t) {
  if (t.kind === 'mob') { const m = mobs[t.id]; return m && m.hp > 0 ? { x: m.v.root.position.x, z: m.v.root.position.z, r: (m.def && (m.def.hitR || m.def.scale * 0.6)) || 0.6 } : null; }
  const st = stones[t.id]; return st ? { x: st.x, z: st.z, r: 1.2 } : null;
}
function autoPickTarget(pos, now) {
  let best = null, bestD = 34;
  for (const m of Object.values(mobs)) {
    if (!(m.hp > 0) || (auto.skip.get('m' + m.id) || 0) > now) continue;
    const def = m.def || {};
    if (def.boss && (def.lv || 0) > myLevel + 3) continue;          // kendinden çok güçlü boss'a dalma
    const p = m.v.root.position, d = Math.hypot(p.x - pos.x, p.z - pos.z) - (def.boss ? 4 : 0);
    if (d < bestD) { best = { kind: 'mob', id: m.id }; bestD = d; }
  }
  for (const [id, st] of Object.entries(stones)) {
    if ((auto.skip.get('s' + id) || 0) > now) continue;
    const d = Math.hypot(st.x - pos.x, st.z - pos.z) + 3;              // taşlar biraz geride kalsın
    if (d < bestD) { best = { kind: 'stone', id }; bestD = d; }
  }
  return best;
}
// her karede: yürünecek yönü (dünya ekseninde) döndürür, menzildeyse vurur
function autoStep(me, now, dt) {
  if (!auto.on || amDead || !me) return null;
  const pos = me.group.position;
  // iksirler
  if (myHpFrac < 0.4 && now - auto.pot > 1500 && !potBtn.classList.contains('empty')) { auto.pot = now; socket.emit('usePotion', 'hp'); sfx.potion(); }
  if (myMp / myMpMax < 0.15 && now - auto.mpPot > 2500 && !mpBtn.classList.contains('empty')) { auto.mpPot = now; socket.emit('usePotion', 'mp'); }
  let tp = auto.target && autoTargetPos(auto.target);
  if (!tp || now - auto.pick > 2500) {
    const nt = autoPickTarget(pos, now);
    if (!tp || (nt && (nt.kind !== auto.target.kind || nt.id !== auto.target.id) && !(auto.target.kind === 'mob' && mobs[auto.target.id] && mobs[auto.target.id].hp < mobs[auto.target.id].max))) {
      auto.target = nt; auto.best = Infinity; auto.stuckT = 0;
    }
    auto.pick = now; tp = auto.target && autoTargetPos(auto.target);
  }
  if (!tp) return null;
  const d = Math.hypot(tp.x - pos.x, tp.z - pos.z);
  const reach = CLASS_RANGE() + tp.r - 0.4;
  if (d > reach) {
    // takıldıysa (yaklaşamıyorsa) bu hedefi bir süre atla
    if (d < auto.best - 0.3) { auto.best = d; auto.stuckT = 0; } else if ((auto.stuckT += dt) > 2.5) {
      auto.skip.set((auto.target.kind === 'mob' ? 'm' : 's') + auto.target.id, now + 12000); auto.target = null; return null;
    }
    return new V3(tp.x - pos.x, 0, tp.z - pos.z).normalize();
  }
  auto.best = d; auto.stuckT = 0;
  if (me.swingT <= 0) attack();
  // hazır becerileri sırayla kullan (iyileştirme sadece can azken)
  if (now - auto.skill > 700) {
    auto.skill = now;
    for (const sk of mySkills()) {
      const lv = skillState.levels[sk.key] || 0; if (!lv) continue;
      const c = skillCdUntil[sk.key]; if (c && c.until > now) continue;
      if (myMp < (sk.mp || 0) + (sk.mpLv || 0) * (lv - 1)) continue;
      if (sk.target === 'heal' && myHpFrac > 0.6) continue;
      useSkill(sk.key); break;
    }
  }
  return null;
}


// ---------- kamera: tek parmakla döndür, iki parmakla yakınlaştır ----------
let camYaw = Math.PI / 4, camZoom = 1;
// daha yatık açı ve karakterin önüne bakış: ileride ne olduğu daha uzaktan görünür
const CAM_H = 9.6, CAM_D = 14.2, CAM_AHEAD = 4.2;
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
  for (const foe of foesList()) { const fp = foe.group.position, d = Math.hypot(fp.x - pos.x, fp.z - pos.z); if (d < bestD) { best = fp; bestD = d; } }
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
    for (const foe of foesList()) { const fp = foe.group.position, d = Math.hypot(fp.x - pos.x, fp.z - pos.z); if (d < bestD) { best = fp; bestD = d; } }
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
function showLevelBanner(level) {
  const el = document.getElementById('levelBanner');
  document.getElementById('lbLv').textContent = level;
  document.getElementById('lbSub').textContent = '+3 durum puanı · Karakter penceresinden dağıt';
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
}
function levelUpFx(p) {
  fx.levelUp(p);
  p.move = { spec: { dur: 0.6, jump: 0.6 }, t: 0, fired: 0 };   // seviye atlayınca sevinçle zıplar
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
  for (const c of corpses) scene.remove(c.root);
  corpses.length = 0;
  for (const id of Object.keys(stones)) removeStone(id);
  for (const id of Object.keys(drops)) removeDrop(id);
  for (const p of mapInfo.portals) if (p.label) p.label.el.remove();
  for (const id of Object.keys(stallObjs)) removeStall(id);
  pendingPick.clear();
  fx.clearFx();
}
function enterMap(data) {
  clearWorld();
  currentMap = MAPS[data.map];
  mapInfo = loadMap(scene, currentMap);
  // açık renkli gökyüzü (kar, çöl): efektler normal karışımla çizilsin ki renkleri seçilsin
  { const c = scene.background; fx.setBright(c && (0.299 * c.r + 0.587 * c.g + 0.114 * c.b) > 0.62); }
  setWeather(mapInfo.weather);
  sfx.music(sfx.musicForMap(currentMap.theme, currentMap.id));
  for (const p of mapInfo.portals) {
    const target = MAPS[p.to];
    p.label = makeLabel(`${target.name} · Sv. ${target.minLevel}+`, '#9fd8ff', false);
  }
  for (const n of mapInfo.npcs) {
    const npc = createPlayer({ id: 'npc:' + n.kind, name: n.name, cls: 'savasci', x: n.x, z: n.z, ry: 0, level: 0, npc: true,
      look: { weapon: null, armor: n.kind === 'armor' ? 'armor3' : n.kind === 'weapons' ? 'armor1' : null, helmet: null } });
    npc.ry = FACE_OFFSET; npc.group.rotation.y = FACE_OFFSET; npc.npcKind = n.kind;
    if (NPC_MODELS[n.kind]) {
      dressNpc(npc, n.kind);
      // özel modeller düz +Z'ye bakar: köy meydanına dönük başlasın
      npc.ry = npc.group.rotation.y = Math.atan2(25 - n.x, 25 - n.z);
    }
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
  social.bind(sock);
  if (opts.onKicked) alertBox = opts.onKicked;

  socket.on('welcome', (data) => {
    lobbyMode('off');
    myId = data.id; myClass = data.cls; myName = data.name; myGm = !!data.gm;
    document.getElementById('myname').textContent = data.name;
    document.getElementById('myclass').textContent = (CLASSES[myClass] || {}).name || '';
    setStats(data.stats.level, data.stats.exp, data.stats.need);
    myEmpire = data.empire || 0;
    if (!myEmpire && !myGm) setTimeout(() => social.askEmpire(), 1500);
    if (opts.onWelcome) opts.onWelcome();
  });
  socket.on('mapChange', (data) => { amDead = false; auto.target = null; auto.skip.clear(); if (auto.on && data && MAPS[data.map] && (MAPS[data.map].safe || MAPS[data.map].war)) setAuto(false); deadEl.classList.remove('open'); setFishState('idle'); enterMap(data); updateToolButtons(); renderSkillbar(); refreshFoes(); if (!(currentMap && currentMap.dungeon)) social.clearDungeon(); });
  socket.on('inv', (data) => { Object.assign(inv, data); renderInv(); if (shopKind) renderShop(); renderSmith(); if (trade) renderTrade(); social.refreshGuild(); social.refreshStallWins(); });
  socket.on('upgraded', ({ ok, name, up, stone }) => smithResult(ok, ok ? (stone ? `BAŞARILI · ${name}` : `BAŞARILI · ${name} +${up}`) : (stone ? 'BAŞARISIZ · taş kırıldı' : `BAŞARISIZ · ${name} +${up}`)));
  socket.on('socketed', ({ ok }) => { if (ok) sfx.enchant(); else sfx.hit('stone', false, null); });
  // ---------- sohbet, fısıltı, arkadaşlar, düello ----------
  socket.on('whisper', ({ from, to, text }) => {
    const mine = from === myName;
    log(`<b class="wsp">[Fısıltı] ${mine ? 'Sen → ' + esc(to) : esc(from)}:</b> <span class="wsp">${esc(text)}</span>`);
    if (!mine) { toast(`${from}: ${text}`); lastWhisperFrom = from; sfx.click(); }
  });
  socket.on('friends', (list) => { friendList = list; renderFriends(); });
  socket.on('friendAsk', ({ id, name, level }) => askBox(`${name} (Sv. ${level}) seni arkadaş olarak eklemek istiyor.`, (ok) => socket.emit('friendAnswer', { id, ok })));
  socket.on('tradeAsk', ({ name, level }) => askBox(`${name} (Sv. ${level}) seninle ticaret yapmak istiyor.`, (ok) => socket.emit('tradeAnswer', { ok })));
  socket.on('tradeOpen', ({ id, name }) => { trade = { id, name, me: null, them: null }; document.getElementById('tradeInfo').innerHTML = ''; tradeEl.classList.add('open'); sfx.click(); });
  socket.on('tradeState', (st) => { if (!trade) return; trade.me = st.me; trade.them = st.them; renderTrade(); });
  socket.on('tradeClose', ({ done, msg }) => { trade = null; tradeEl.classList.remove('open'); if (msg) toast(msg); if (done) sfx.pickup(true); });
  socket.on('duelAsk', ({ id, name, level }) => askBox(`${name} (Sv. ${level}) seni düelloya davet ediyor!`, (ok) => socket.emit('duelAnswer', { id, ok }), 'Kabul et', 'Reddet', true));
  socket.on('duelStart', ({ a, b, in: sec }) => {
    for (const id of [a, b]) { const p = players[id]; if (p) p.duelWith = id === a ? b : a; }
    if (a === myId || b === myId) {
      duelFoe = a === myId ? b : a;
      markFoe(duelFoe, true);
      let n = sec || 3;
      const tick = () => { if (n > 0) { duelBanner(String(n), ''); n--; setTimeout(tick, 1000); } else duelBanner('DÜELLO!', 'fight'); };
      tick();
    }
  });
  socket.on('duelEnd', ({ a, b, winner }) => {
    for (const id of [a, b]) { const p = players[id]; if (p) p.duelWith = null; }
    if (a === myId || b === myId) {
      markFoe(duelFoe, false); duelFoe = null;
      if (winner) duelBanner(winner === myId ? 'KAZANDIN' : 'KAYBETTİN', winner === myId ? 'win' : 'lose');
    }
  });
  socket.on('hp', ({ hp, max }) => setHp(hp, max));
  socket.on('stats', ({ level, exp, need, up }) => {
    setStats(level, exp, need);
    const me = players[myId];
    if (up && me) { me.level = level; updateLabelText(me); log(`<b>Sistem:</b> Seviye atladın! Artık Sv. ${level}.`); showLevelBanner(level); sfx.levelUp(); }
  });
  socket.on('expGain', (n) => { const me = players[myId]; if (me) floatText(`+${n} TP`, me.group.position.x, 2.6, me.group.position.z, false); });
  socket.on('notice', (t) => toast(t));
  socket.on('announce', (t) => { toast(t); log(`<b style="color:#ffb347">Duyuru:</b> ${esc(t)}`); });
  socket.on('look', ({ id, look }) => { const p = players[id]; if (p) applyLook(p, look); });
  socket.on('mp', ({ mp, max }) => setMp(mp, max));
  socket.on('skills', (data) => { skillState = data; renderSkillbar(); if (skillwinEl.classList.contains('open')) renderSkillWin(); });
  socket.on('attrs', (a) => { attrs = a; renderChar(); });
  socket.on('skillCd', ({ key, until }) => { skillCdUntil[key] = { until: performance.now() + until * 1000, total: until * 1000 }; });
  socket.on('buffs', (list) => { buffList = list; buffAt = performance.now(); renderBuffs(); });
  socket.on('quests', (q) => {
    const first = !quests.__seen; quests = q; quests.__seen = true;
    if (shopKind === 'stable') renderShop();
    // yeni oyuncu: öğretici (bitmediyse kaldığı adımdan)
    if (first && q.tutorial !== 'done' && myLevel < 15 && !myGm) setTimeout(() => social.startTutorial(Math.max(0, (Number(q.tutorial) || 1) - 1)), 2500);
  });
  socket.on('mount', ({ id, on }) => { const p = players[id]; if (p) setMount(p, on); });
  socket.on('playerGuild', ({ id, guild }) => { const p = players[id]; if (p) setGuildTag(p, guild); });
  socket.on('playerEmpire', ({ id, empire }) => { const p = players[id]; if (p) setEmpireTag(p, empire); });
  socket.on('stalls', (list) => { for (const id of Object.keys(stallObjs)) removeStall(id); for (const s of list) addStall(s); });
  socket.on('stallAdd', (s) => { if (!s.n) removeStall(s.id); else addStall(s); });
  socket.on('stallRemove', ({ id }) => removeStall(id));
  socket.on('fishing', ({ id, on }) => { const p = players[id]; if (p) setRod(p, on); });
  socket.on('fishWait', () => setFishState('wait'));
  socket.on('fishBite', () => { setFishState('bite'); sfx.fishBite(); if (navigator.vibrate) navigator.vibrate(150); });
  socket.on('enchanted', () => sfx.enchant());
  socket.on('fishEnd', ({ ok, msg }) => { setFishState('idle'); toast(msg); });
  socket.on('playerHp', ({ id, hp, max }) => { const p = players[id]; if (p && p.label.hp) p.label.hp.style.width = Math.max(0, 100 * hp / max) + '%'; });
  socket.on('skillFx', ({ id, key, targets, x, z, lv }) => {
    const sk = skillDef(key); if (!sk) return;
    const p = players[id];
    if (p) startMove(p, sk);
    const from = p ? p.group.position : { x, z };
    sfx.skill(sk, from);
    if (p && sk.target !== 'heal') sfx.grunt(from, p.cls === 'ninja' || p.cls === 'saman');
    // Metin2 tarzı beceri görüntüsü (fx.js) + karakterin dönmesi/sıçraması
    const tl = [];
    for (const t of targets) { const tp = targetPos(t); if (tp) tl.push({ x: tp.x, y: 0, z: tp.z, obj: players[t] || null }); }
    const facing = p ? p.group.rotation.y - FACE_OFFSET : 0;
    try { fx.playSkill(sk, { caster: p || null, from: { x: from.x, z: from.z }, facing, targets: tl, lv: lv || 0 }); } catch (e) { console.warn('Beceri efekti', key, e); }
  });
  // sersemleme / donma: yaratık yerinde kalır, üstünde yıldızlar ya da buz kalıbı
  socket.on('mobStun', ({ id, sec, kind }) => {
    const m = mobs[id]; if (!m) return;
    m.frozenUntil = performance.now() + sec * 1000;
    const pos = m.v.root.position;
    if (kind === 'freeze') fx.iceBlock(pos, sec, Math.max(0.8, (m.height || 1.6) / 1.7));
    else fx.stunStars(pos, sec, (m.height || 1.6) + 0.35);
  });
  socket.on('playerJoin', (p) => { const o = createPlayer(p); if (p.mounted) setMount(o, true); log(`<b>${esc(p.name)}</b> haritaya geldi.`); });
  socket.on('playerLeave', ({ id }) => removePlayer(id));
  socket.on('playerLevel', ({ id, level }) => { const p = players[id]; if (p) { p.level = level; updateLabelText(p); levelUpFx(p); } });
  socket.on('playerDied', ({ id }) => { const p = players[id]; if (p) p.dead = true; });
  socket.on('died', ({ village }) => {
    amDead = true;
    if (auto.on) setAuto(false);   // ölünce otomatik av durur
    document.getElementById('deadText').textContent = `Köyde başlarsan ${village} içinde tam canla, burada başlarsan yarım canla doğarsın.`;
    deadEl.classList.add('open');
    startDeadCountdown();
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
    const tm = target && (mobs[target] ? mobs[target].v.root.position : stones[target] ? stones[target] : players[target] ? players[target].group.position : null);
    if (p.cls === 'okcu' && tm) shootArrow(p, tm);
    sfx.swing(p.cls, p.group.position, combo || 0);
    p.swingT = SWING_T; p.combo = combo || 0;
    if (p.cls !== 'okcu') p.slashT = 0.3;
  });
  socket.on('hit', ({ id, kind, dmg, crit, hp, max, miss }) => {
    if (kind === 'player') {
      const p = players[id]; if (!p) return;
      const pos = p.group.position;
      if (p.label.hp && max) p.label.hp.style.width = Math.max(0, 100 * hp / max) + '%';
      floatText(miss ? 'ISKA' : (crit ? 'KRİTİK ' : '') + '-' + dmg, pos.x, 2.6, pos.z, crit);
      if (!miss) { sfx.hit('player', crit, pos); fx.hitSpark({ x: pos.x, y: 1.2, z: pos.z }, crit, 'mob'); }
      if (id === myId && !miss) { document.body.classList.add('hurt'); setTimeout(() => document.body.classList.remove('hurt'), 180); }
      return;
    }
    if (kind === 'mob') {
      const m = mobs[id]; if (!m) return;
      m.hp = hp; m.label.hp.style.width = (100 * hp / m.max) + '%';
      floatText((crit ? 'KRİTİK ' : '') + '-' + dmg, m.v.root.position.x, m.height + 0.6, m.v.root.position.z, crit);
      sfx.hit('mob', crit, m.v.root.position);
      fx.hitSpark(m.v.root.position, crit, 'mob');
    } else {
      const s = stones[id]; if (!s) return;
      s.hp = hp; s.label.hp.style.width = (100 * hp / s.max) + '%'; s.shake = 0.2; s.flash = crit ? 1 : 0.6;
      sfx.hit('stone', crit, s);
      fx.hitSpark({ x: s.x, y: 0.6, z: s.z }, crit, 'stone');
      floatText((crit ? 'KRİTİK ' : '') + '-' + dmg, s.x, 4.4, s.z, crit);
    }
  });
  socket.on('mobSpawn', (m) => createMob(m));
  socket.on('mobDie', ({ id, by, name, mobName, boss }) => {
    const dm = mobs[id];
    sfx.die(boss, dm ? dm.v.root.position : null);
    if (dm) killMobVisual(dm, boss); else removeMob(id);
    if (by === myId) { log(`<b>Sistem:</b> ${esc(mobName)} yenildi.`); tutStats.kills++; }
    else if (boss) log(`<b>${esc(name)}</b> ${esc(mobName)} adlı boss'u yendi!`);
  });
  socket.on('mobAttack', ({ id, target, dmg, miss }) => {
    const m = mobs[id]; if (m) m.atkT = 0.4;
    if (miss) { const p = players[target]; if (p) floatText('ISKA', p.group.position.x, 2.4, p.group.position.z, false); return; }
    if (target === myId) sfx.hurt(); else if (m) sfx.mobAttack(m.v.root.position);
    const p = players[target];
    // ateş püskürten yaratıklar (ör. Ateş Kertenkelesi)
    if (m && p && m.def && m.def.style && m.def.style.breath) {
      const mp = m.v.root.position;
      fx.breath({ x: mp.x, y: (m.height || 2) * 0.45, z: mp.z }, p.group.position, m.def.style.breath);
    }
    if (p) floatText('-' + dmg, p.group.position.x, 2.4, p.group.position.z, false);
    if (target === myId) document.body.classList.add('hurt'), setTimeout(() => document.body.classList.remove('hurt'), 180);
  });
  socket.on('mobHeal', ({ id, hp }) => { const m = mobs[id]; if (m) { m.hp = hp; m.label.hp.style.width = '100%'; } });
  socket.on('stoneSpawn', (s) => createStone(s));
  socket.on('stoneGone', ({ id }) => removeStone(id));
  socket.on('mobGone', ({ id }) => removeMob(id));
  socket.on('stoneDown', ({ id, by, name, stoneName }) => {
    if (stones[id]) { sfx.stoneBreak(stones[id]); fx.stoneBreak(stones[id], stones[id].glowColor || '#ff4a2f'); }
    removeStone(id);
    log(by === myId ? `<b>Sistem:</b> ${esc(stoneName)}'ni kırdın! Ganimetleri topla.` : `<b>${esc(name)}</b> bir ${esc(stoneName)} kırdı.`);
  });
  socket.on('drop', (d) => createDrop(d));
  socket.on('dropGone', ({ id }) => {
    const pk = pendingPick.get(id);
    if (pk && performance.now() - pk.t < 2500) sfx.pickup(pk.yang);
    pendingPick.delete(id);
    removeDrop(id);
  });
  socket.on('chat', ({ name, text, gm, channel }) => log(channel === 'party' ? `<b class="chatparty">[Grup] ${esc(name)}:</b> <span class="chatparty">${esc(text)}</span>`
    : channel === 'guild' ? `<b class="chatguild">[Lonca] ${esc(name)}:</b> <span class="chatguild">${esc(text)}</span>` : gm ? `<b class="gmchat">[GM] ${esc(name)}:</b> <span class="gmchat">${esc(text)}</span>` : `<b>${esc(name)}:</b> ${esc(text)}`));
  socket.on('openTeleport', () => openShop('teleport', 'IŞINLANMA YÜZÜĞÜ'));
  socket.on('revived', ({ x, z }) => {
    amDead = false; deadEl.classList.remove('open'); clearInterval(deadTimer);
    const me = players[myId]; if (me) { me.dead = false; me.group.position.set(x, 0, z); fx.levelUp && fx.hitSpark(me.group.position, true, 'mob'); }
  });
  socket.on('playerRevive', ({ id }) => { const p = players[id]; if (p) p.dead = false; });
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
    if (p.npcKind === 'blacksmith') return { label: 'Demirci', run: () => openSmith() };
    return { label: p.name, run: () => openShop(p.npcKind, p.name.toLocaleUpperCase('tr-TR')) };
  }
  for (const pt of mapInfo.portals) {
    if (Math.hypot(pt.x - pos.x, pt.z - pos.z) > 4.5) continue;
    const t = MAPS[pt.to];
    return { label: `Geçit: ${t.name}`, run: () => socket.emit('travel', pt.to) };
  }
  return null;
}

// ---------- hava: kar yağışı ----------
// Kameranın çevresinde dönen bir kar tanesi bulutu; tanecikler düşer, dibe varınca tepeye döner.
const SNOW_N = 1400, SNOW_W = 70, SNOW_H = 26;
let snow = null;
function makeSnow() {
  const pos = new Float32Array(SNOW_N * 3), speed = new Float32Array(SNOW_N);
  for (let i = 0; i < SNOW_N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * SNOW_W; pos[i * 3 + 1] = Math.random() * SNOW_H; pos[i * 3 + 2] = (Math.random() - 0.5) * SNOW_W;
    speed[i] = 1.6 + Math.random() * 1.8;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const cv = document.createElement('canvas'); cv.width = cv.height = 32;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.7)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 32, 32);
  const material = new THREE.PointsMaterial({ size: 0.28, map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false, opacity: 0.95 });
  const pts = new THREE.Points(geo, material);
  pts.frustumCulled = false;
  return { pts, pos, speed, t: 0 };
}
function setWeather(kind) {
  if (kind === 'snow') {
    if (!snow) snow = makeSnow();
    if (!snow.pts.parent) scene.add(snow.pts);
  } else if (snow && snow.pts.parent) scene.remove(snow.pts);
}
function updateWeather(dt) {
  if (!snow || !snow.pts.parent) return;
  snow.t += dt;
  const c = players[myId] ? players[myId].group.position : { x: 25, z: 25 };
  snow.pts.position.set(c.x, 0, c.z);
  const p = snow.pos, half = SNOW_W / 2;
  for (let i = 0; i < SNOW_N; i++) {
    const k = i * 3;
    p[k + 1] -= snow.speed[i] * dt;
    p[k] += Math.sin(snow.t * 0.9 + i) * 0.4 * dt;
    if (p[k + 1] < 0) { p[k + 1] = SNOW_H; p[k] = (Math.random() - 0.5) * SNOW_W; p[k + 2] = (Math.random() - 0.5) * SNOW_W; }
    if (p[k] > half) p[k] -= SNOW_W; else if (p[k] < -half) p[k] += SNOW_W;
  }
  snow.pts.geometry.attributes.position.needsUpdate = true;
}

// ---------- ses ----------
const pendingPick = new Map();
const sndBtn = document.getElementById('sndBtn');
function updateSndBtn() { if (sndBtn) { sndBtn.classList.toggle('off', sfx.isMuted()); sndBtn.setAttribute('aria-label', sfx.isMuted() ? 'Sesi aç' : 'Sesi kapat'); } }
if (sndBtn) sndBtn.addEventListener('click', () => { sfx.unlock(); sfx.setMuted(!sfx.isMuted()); updateSndBtn(); sfx.click(); });
updateSndBtn();
const musicBtn = document.getElementById('musicBtn');
function updateMusicBtn() { if (musicBtn) { musicBtn.classList.toggle('off', !sfx.isMusicOn()); musicBtn.setAttribute('aria-label', sfx.isMusicOn() ? 'Müziği kapat' : 'Müziği aç'); } }
if (musicBtn) musicBtn.addEventListener('click', () => { sfx.unlock(); sfx.setMusicOn(!sfx.isMusicOn()); updateMusicBtn(); sfx.click(); });
updateMusicBtn();
// tarayıcılar sesi ancak bir dokunuştan sonra açar
for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => sfx.unlock(), { passive: true });

// ---------- sohbet ----------
let lastWhisperFrom = null, whisperTo = null;
const chatBar = document.getElementById('chatBar'), chatInput = document.getElementById('chatInput'), chatTo = document.getElementById('chatTo');
function openChat(to) {
  whisperTo = to || null;
  chatTo.textContent = whisperTo ? `${whisperTo}:` : 'Herkes:';
  chatTo.classList.toggle('w', !!whisperTo);
  chatBar.classList.add('open');
  chatInput.focus();
}
function closeChat() { chatBar.classList.remove('open'); chatInput.blur(); chatInput.value = ''; }
function sendChat() {
  const t = chatInput.value.trim();
  if (t && socket) {
    const m = t.match(/^\/(w|f|fısılda)\s+(\S+)\s+(.+)$/i);
    if (m) socket.emit('whisper', { to: m[2], text: m[3] });
    else if (/^\/r\s+/i.test(t) && lastWhisperFrom) socket.emit('whisper', { to: lastWhisperFrom, text: t.replace(/^\/r\s+/i, '') });
    else if (whisperTo) socket.emit('whisper', { to: whisperTo, text: t });
    else socket.emit('chat', t);
  }
  closeChat();
}
document.getElementById('chatBtn').addEventListener('click', () => (chatBar.classList.contains('open') ? closeChat() : openChat()));
document.getElementById('chatSend').addEventListener('click', sendChat);
chatTo.addEventListener('click', () => { if (whisperTo) { whisperTo = null; chatTo.textContent = 'Herkes:'; chatTo.classList.remove('w'); } });
chatInput.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') sendChat(); if (e.key === 'Escape') closeChat(); });
window.addEventListener('keydown', (e) => { if (e.key === 'Enter' && document.body.classList.contains('ingame') && !chatBar.classList.contains('open')) { e.preventDefault(); openChat(); } });

// ---------- oyuncuya dokununca menü: fısılda, arkadaş ekle, düello ----------
const pmenu = document.getElementById('pmenu');
let pmenuTarget = null;
function openPlayerMenu(p, x, y) {
  pmenuTarget = p.id;
  document.getElementById('pmName').textContent = p.name;
  document.getElementById('pmSub').textContent = `${(CLASSES[p.cls] || {}).name || ''} · Sv. ${p.level}`;
  const isFriend = friendList.some((f) => f.name === p.name);
  pmenu.querySelector('[data-pm="friend"]').style.display = isFriend ? 'none' : '';
  pmenu.style.left = Math.min(window.innerWidth - 200, Math.max(8, x - 90)) + 'px';
  pmenu.style.top = Math.min(window.innerHeight - 230, Math.max(8, y - 40)) + 'px';
  pmenu.classList.add('open');
}
pmenu.addEventListener('click', (e) => {
  const b = e.target.closest('[data-pm]'); if (!b || !socket) return;
  const p = players[pmenuTarget];
  if (b.dataset.pm === 'whisper' && p) openChat(p.name);
  if (b.dataset.pm === 'friend' && p) socket.emit('friendRequest', p.id);
  if (b.dataset.pm === 'duel' && p) socket.emit('duelRequest', p.id);
  if (b.dataset.pm === 'trade' && p) socket.emit('tradeRequest', p.id);
  if (b.dataset.pm === 'party' && p) socket.emit('partyInvite', p.id);
  if (b.dataset.pm === 'guild' && p) socket.emit('guildInvite', p.id);
  pmenu.classList.remove('open');
});
const _proj = new THREE.Vector3();
function pickPlayerAt(cx, cy) {
  let best = null, bd = 56;
  for (const p of Object.values(players)) {
    if (p.id === myId || p.npc || String(p.id).startsWith('lobby')) continue;
    _proj.set(p.group.position.x, 1.1, p.group.position.z).project(camera);
    if (_proj.z > 1) continue;
    const sx = (_proj.x + 1) / 2 * window.innerWidth, sy = (1 - _proj.y) / 2 * window.innerHeight;
    const d = Math.hypot(sx - cx, sy - cy);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
let tapStart = null;
renderer.domElement.addEventListener('pointerdown', (e) => { tapStart = { x: e.clientX, y: e.clientY, t: performance.now() }; pmenu.classList.remove('open'); });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!tapStart || !myId) return;
  const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y), dur = performance.now() - tapStart.t;
  tapStart = null;
  if (moved > 10 || dur > 450) return;
  const p = pickPlayerAt(e.clientX, e.clientY);
  if (p) { openPlayerMenu(p, e.clientX, e.clientY); return; }
  const st = pickStallAt(e.clientX, e.clientY);
  if (st && socket) { socket.emit('stallView', st.id); sfx.click(); }
});

// ---------- onay kutusu (düello / arkadaşlık isteği) ----------
const askEl = document.getElementById('askBox');
let askCb = null, askTimer = null;
function askBox(text, cb, yes = 'Kabul et', no = 'Reddet', danger = false) {
  if (askCb) askCb(false);
  askCb = cb;
  document.getElementById('askText').textContent = text;
  document.getElementById('askYes').textContent = yes; document.getElementById('askNo').textContent = no;
  askEl.classList.toggle('danger', danger);
  askEl.classList.add('open');
  sfx.click();
  clearTimeout(askTimer);
  askTimer = setTimeout(() => answerAsk(false), 20000);
}
function answerAsk(ok) { const cb = askCb; askCb = null; askEl.classList.remove('open'); clearTimeout(askTimer); if (cb) cb(ok); }
document.getElementById('askYes').addEventListener('click', () => answerAsk(true));
document.getElementById('askNo').addEventListener('click', () => answerAsk(false));

// ---------- ticaret ----------
const tradeEl = document.getElementById('tradewin');
let trade = null;   // { id, name, me: {items, yang, ok}, them: {...} }
function tradeSlot(x, used) {
  const def = ITEMS[x.key] || { name: '?', rarity: 0 };
  return `<button class="slot${used ? ' used' : ''}" data-uid="${x.uid}" aria-label="${esc(itemName(x, def))}" style="border-color:${RARITY[def.rarity]}66">${itemIcon(x.key, def)}` +
    `${x.n > 1 ? `<i class="cnt">${x.n}</i>` : ''}${x.up ? `<i class="upb">+${x.up}</i>` : ''}</button>`;
}
function renderTrade() {
  if (!trade || !trade.me) return;
  const { me, them } = trade;
  document.getElementById('tradeWith').textContent = trade.name;
  document.getElementById('tradeThemName').textContent = `${trade.name} teklifi`;
  document.getElementById('tradeThem').innerHTML = them.items.map((x) => tradeSlot(x)).join('') || '<small style="color:#8b877c">Henüz bir şey koymadı</small>';
  document.getElementById('tradeMe').innerHTML = me.items.map((x) => tradeSlot(x)).join('') || '<small style="color:#8b877c">Aşağıdan eşya seç</small>';
  document.getElementById('tradeThemYang').textContent = them.yang.toLocaleString('tr-TR');
  const yi = document.getElementById('tradeYang'); if (document.activeElement !== yi) yi.value = me.yang || '';
  tradeEl.querySelector('.tside.them').classList.toggle('ok', them.ok);
  tradeEl.querySelector('.tside.me').classList.toggle('ok', me.ok);
  document.getElementById('tradeThemOk').textContent = them.ok ? '✔ Onayladı' : 'Bekliyor';
  document.getElementById('tradeMeOk').textContent = me.ok ? '✔ Onayladın' : '';
  const okb = document.getElementById('tradeOk');
  okb.textContent = me.ok ? (them.ok ? 'Takas ediliyor…' : 'Karşı taraf bekleniyor') : 'Onayla'; okb.classList.toggle('done', me.ok); okb.disabled = me.ok;
  const offered = new Set(me.items.map((x) => x.uid));
  document.getElementById('tradeInv').innerHTML = inv.inventory.map((it) => tradeSlot({ ...it, n: it.n || 1 }, offered.has(it.uid))).join('');
}
function tradeInfo(x) {
  const def = ITEMS[x.key]; if (!def) return;
  const st = def.atk || def.def ? statTextIt(x, def) : esc(def.desc || '');
  document.getElementById('tradeInfo').innerHTML = `<b style="color:${RARITY[def.rarity]}">${esc(itemName(x, def))}</b>${x.n > 1 ? ' x' + x.n : ''} · ${st}` +
    ((x.sock || []).length ? ' · Taşlar: ' + x.sock.map((k) => esc((ITEMS[k] || {}).name || k)).join(', ') : '');
}
document.getElementById('tradeThem').addEventListener('click', (e) => {
  const b = e.target.closest('[data-uid]'); if (!b || !trade) return;
  const x = trade.them.items.find((i) => i.uid === Number(b.dataset.uid)); if (x) { tradeInfo(x); sfx.click(); }
});
document.getElementById('tradeMe').addEventListener('click', (e) => {
  const b = e.target.closest('[data-uid]'); if (!b || !socket) return;
  socket.emit('tradeRemove', Number(b.dataset.uid)); sfx.click();
});
document.getElementById('tradeInv').addEventListener('click', (e) => {
  const b = e.target.closest('[data-uid]'); if (!b || !socket || b.classList.contains('used')) return;
  const it = inv.inventory.find((i) => i.uid === Number(b.dataset.uid)); if (it) tradeInfo({ ...it, n: it.n || 1 });
  socket.emit('tradeAdd', Number(b.dataset.uid)); sfx.click();
});
document.getElementById('tradeYangSet').addEventListener('click', () => { if (socket) socket.emit('tradeYang', Number(document.getElementById('tradeYang').value) || 0); });
document.getElementById('tradeYang').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('tradeYangSet').click(); });
document.getElementById('tradeOk').addEventListener('click', () => {
  if (!socket || !trade) return;
  const yi = Number(document.getElementById('tradeYang').value) || 0;
  if (yi !== (trade.me.yang || 0)) { socket.emit('tradeYang', yi); toast('Yang miktarı güncellendi, kontrol edip tekrar onayla.'); return; }
  socket.emit('tradeAccept'); sfx.click();
});
for (const id of ['tradeCancel', 'tradeX']) document.getElementById(id).addEventListener('click', () => { if (socket) socket.emit('tradeCancel'); });

// ---------- arkadaş listesi ----------
let friendList = [];
const friendsEl = document.getElementById('friendwin');
function renderFriends() {
  const on = friendList.filter((f) => f.online).length;
  const badge = document.getElementById('friendOn'); badge.textContent = on; badge.style.display = on ? '' : 'none';
  if (!friendsEl.classList.contains('open')) return;
  document.getElementById('friendList').innerHTML = friendList.length ? friendList.map((f) =>
    `<div class="srow"><i class="dot${f.online ? ' on' : ''}"></i><span class="grow"><b>${esc(f.name)}</b><br><small>${f.online ? `${esc((CLASSES[f.cls] || {}).name || '')} · Sv. ${f.level} · ${esc(f.map || '')}` : 'Çevrimdışı'}</small></span>` +
    `<button data-fw="${esc(f.name)}" ${f.online ? '' : 'disabled'}>Fısılda</button><button class="alt" data-fr="${esc(f.name)}">Sil</button></div>`).join('')
    : '<p style="color:#8b877c;font-size:13px">Henüz arkadaşın yok. Bir oyuncuya dokun ve "Arkadaş ekle"ye bas.</p>';
}
document.getElementById('friendBtn').addEventListener('click', () => { friendsEl.classList.add('open'); renderFriends(); if (socket) socket.emit('friendsGet'); });
document.getElementById('friendClose').addEventListener('click', () => friendsEl.classList.remove('open'));
document.getElementById('friendList').addEventListener('click', (e) => {
  const w = e.target.closest('[data-fw]'), r = e.target.closest('[data-fr]');
  if (w) { friendsEl.classList.remove('open'); openChat(w.dataset.fw); }
  if (r && socket) { if (r.dataset.armed) socket.emit('friendRemove', r.dataset.fr); else { r.dataset.armed = '1'; r.textContent = 'Emin misin?'; } }
});

// ---------- düello ----------
let duelFoe = null;
function markFoe(id, on) {
  const p = players[id]; if (!p) return;
  p.label.el.classList.toggle('foe', on);
  for (const ch of p.group.children) if (ch.geometry && ch.geometry.type === 'RingGeometry' && ch.userData.keep) ch.material.color.set(on ? '#ff3b2f' : '#8ec5ff');
}
function duelBanner(text, kind) {
  const el = document.getElementById('duelBanner');
  el.textContent = text; el.className = ''; void el.offsetWidth; el.className = 'show ' + (kind || '');
  if (kind === 'fight' || kind === 'win') sfx.levelUp(); else sfx.click();
}

// ---------- giriş ve karakter seçme sahnesi (Metin2 tarzı) ----------
const lobby = { st: null, mode: 'off', char: null, charKey: null, show: [], t: 0, yaw: 0, drag: 0 };
// mode: 'login' (kamera sunağın çevresinde döner), 'select' (seçili karakter sunakta), 'off'
export function lobbyMode(mode) {
  if (mode === lobby.mode) return;
  if (mode !== 'off') sfx.music('giris');   // giriş ve karakter seçme müziği
  if (mode === 'off') {
    if (lobby.st) { scene.remove(lobby.st.group); }
    lobbyShowChar(null);
    hemi.intensity = 1.1; sun.intensity = 2.0;
    lobby.mode = 'off';
    return;
  }
  if (!lobby.st) lobby.st = buildStage();
  if (!lobby.st.group.parent) scene.add(lobby.st.group);
  scene.background = new THREE.Color('#0a0f1e');
  fx.setBright(false);
  scene.fog = new THREE.Fog('#0a0f1e', 22, 95);
  hemi.intensity = 0.35; sun.intensity = 0.45;
  sun.position.set(-10, 20, 8); sun.target.position.set(0, 0, 0);
  if (lobby.mode === 'off') lobby.t = 0;
  lobby.mode = mode;
  if (mode === 'login') lobbyShowChar(null);
}
const lookFromEquip = (e) => ({ weapon: e && e.weapon ? e.weapon.key : null, armor: e && e.armor ? e.armor.key : null, helmet: e && e.helmet ? e.helmet.key : null });
// c: { id, name, class, level, equip } — sunakta gösterilecek karakter (null: kimse)
export async function lobbyShowChar(c) {
  const key = c ? `${c.id}|${c.class}|${JSON.stringify(lookFromEquip(c.equip))}` : null;
  if (key === lobby.charKey) { if (c) lobbyFlourish(); return; }
  lobby.charKey = key;
  if (lobby.char) { removePlayer(lobby.char.id); lobby.char = null; }
  lobby.show = [];
  if (!c) return;
  await modelReady;
  if (lobby.charKey !== key || lobby.mode === 'off') return;
  const o = createPlayer({ id: 'lobby:' + (c.id || c.class), name: c.name || '', cls: c.class, x: 0, z: 0, ry: FACE_OFFSET, level: c.level || 1, look: lookFromEquip(c.equip) });
  o.target.set(0, 0.9, 0); o.group.position.set(0, 0.9, 0);
  o.ry = FACE_OFFSET; o.group.rotation.y = FACE_OFFSET;
  for (const ch of o.group.children) if (ch.geometry && ch.geometry.type === 'RingGeometry') ch.visible = false;
  lobby.char = o; lobby.yaw = 0;
  lobbyFlourish(true);
}
// seçince karakter gösteri yapar: ışık sütunu içinde belirir, üç vuruş, sonra sınıf becerisi
function lobbyFlourish(appear) {
  const o = lobby.char; if (!o) return;
  const sk = (SKILLS[o.cls] || [])[1] || (SKILLS[o.cls] || [])[0];
  const now = lobby.t;
  lobby.show = [];
  if (appear) lobby.show.push([now, () => { fx.levelUp(o); sfx.levelUp(); }]);
  [0, 1, 2].forEach((k, i) => lobby.show.push([now + 0.7 + i * 0.42, () => {
    o.swingT = SWING_T; o.combo = k; if (o.cls !== 'okcu') o.slashT = 0.3;
    sfx.swing(o.cls, o.group.position, k);
  }]));
  if (sk) lobby.show.push([now + 2.2, () => {
    try { fx.playSkill(sk, { caster: o, from: { x: 0, z: 0 }, facing: o.ry - FACE_OFFSET, targets: sk.target === 'self' || sk.target === 'heal' ? [{ x: 0, y: 0.9, z: 0, obj: o }] : [{ x: Math.sin(o.ry - FACE_OFFSET) * 3, y: 0.9, z: Math.cos(o.ry - FACE_OFFSET) * 3 }], lv: 18 }); } catch (e) { console.warn(e); }
    startMove(o, sk);
    sfx.skill(sk, o.group.position);
  }]);
}
export function lobbyRotate(dx) { lobby.yaw += dx * 0.01; }
export function lobbyReplay() { lobbyFlourish(false); }
function lobbyUpdate(dt) {
  lobby.t += dt;
  updateStage(lobby.st, dt);
  for (let i = lobby.show.length - 1; i >= 0; i--) if (lobby.t >= lobby.show[i][0]) { const f = lobby.show[i][1]; lobby.show.splice(i, 1); f(); }
  if (lobby.char) { lobby.char.ry = FACE_OFFSET + lobby.yaw; }
  if (lobby.mode === 'login') {
    const a = lobby.t * 0.08;
    camera.position.set(Math.sin(a) * 13, 4.6 + Math.sin(lobby.t * 0.3) * 0.5, Math.cos(a) * 13);
    camera.lookAt(0, 2.2, 0);
  } else {
    // karakter ekranın ortasında; telefon dikeyse biraz daha uzaktan
    const portrait = camera.aspect < 1, far = portrait ? 1.5 : 1;
    camera.position.set(Math.sin(lobby.t * 0.25) * 0.4, 2.3 * far, 6.6 * far);
    camera.lookAt(0, portrait ? 0.55 : 1.75, 0);   // dikeyde karakter üst yarıda, liste altta
  }
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
    let mag = Math.min(1, Math.hypot(ix, iy));
    // otomatik av: elle yönetmiyorsan hedefe kendisi yürür
    const autoDir = mag > 0.15 ? null : autoStep(me, now, dt);
    if (autoDir) mag = 1;
    const moving = !amDead && mag > 0.15 && me.swingT <= 0;   // saldırırken yürünmez
    if (moving) {
      const dir = autoDir || new V3().addScaledVector(camRight, ix).addScaledVector(camFwd, -iy).normalize();
      me.group.position.addScaledVector(dir, SPEED * CLASS_SPEED() * mag * dt);
      collide(me.group.position);
      me.ry = Math.atan2(dir.x, dir.z) + FACE_OFFSET;
    }
    me.moving = moving;
    if (now - lastSent > 100 && (moving || lastMoving || now - lastSent > 1000)) {
      socket.emit('move', { x: me.group.position.x, z: me.group.position.z, ry: me.ry, f: me.ry - FACE_OFFSET, moving });
      if (tutLast) tutStats.moved += Math.hypot(me.group.position.x - tutLast.x, me.group.position.z - tutLast.z);
      tutLast = { x: me.group.position.x, z: me.group.position.z };
      lastSent = now; lastMoving = moving;
    }
    // yakındaki ganimeti otomatik topla
    for (const d of Object.values(drops)) {
      if (now - d.lastTry < 1500) continue;
      if (d.owner !== myId && now - d.born < 15500) continue;
      if (Math.hypot(d.x - me.group.position.x, d.z - me.group.position.z) < 1.8) { d.lastTry = now; pendingPick.set(d.id, { t: now, yang: !d.key }); socket.emit('pickup', d.id); }
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
    camera.lookAt(camera.position.x - camOffset.x + camFwd.x * CAM_AHEAD * camZoom, 1.2, camera.position.z - camOffset.z + camFwd.z * CAM_AHEAD * camZoom);
    if (shake.t > 0) { shake.t = Math.max(0, shake.t - dt); const a = shake.amp * (shake.t / shake.dur); camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; }
    sun.position.set(me.group.position.x + 12, 25, me.group.position.z + 6);
    sun.target.position.copy(me.group.position);
    sfx.setListener(me.group.position.x, me.group.position.z);
  } else if (lobby.mode !== 'off') {
    lobbyUpdate(dt);
  } else {
    camera.position.set(25 + 14, 16, 25 + 14);
    camera.lookAt(25, 0, 25);
  }

  for (const p of Object.values(players)) {
    if (p.id !== myId && !p.npc) p.group.position.lerp(p.target, 1 - Math.exp(-10 * dt));
    p.group.rotation.y = angleLerp(p.group.rotation.y, p.ry, 1 - Math.exp(-14 * dt));
    setAnim(p, p.moving && p.swingT <= 0 && !p.mounted ? 'Run' : 'Idle');
    if (p.mixer) p.mixer.update(dt);
    if (p.mounted && p.horse) p.horse.update(clock.elapsedTime, p.moving, 0, dt);
    skillPoseUpdate(p, dt);
    if (p.swingT > 0) p.swingT = Math.max(0, p.swingT - dt);
    applyBreath(p, clock.elapsedTime);
    updateCosmetics(p, dt, clock.elapsedTime);
    applyRide(p);
    applySwing(p);
    applyCast(p, dt);
    updateCapes(p, clock.elapsedTime);
    updateAuras(p, dt, clock.elapsedTime);
    if (p.model) { if (p.id === myId ? amDead : p.dead) p.model.parent.rotation.x = -Math.PI / 2; else if (!p.move) p.model.parent.rotation.x = 0; }
    if (p.spirit) {
      // ruh: havada süzülür, hafifçe sallanır, yakına gelen oyuncuya döner
      const sp = p.spirit, t = clock.elapsedTime + sp.phase;
      sp.holder.position.y = sp.hover + Math.sin(t * 1.6) * 0.12;
      sp.holder.rotation.z = Math.sin(t * 0.9) * 0.04;
      sp.glow.material.opacity = 0.28 + Math.sin(t * 1.6) * 0.08;
      const me = players[myId];
      if (me && Math.hypot(me.group.position.x - p.group.position.x, me.group.position.z - p.group.position.z) < 9) {
        p.ry = Math.atan2(me.group.position.x - p.group.position.x, me.group.position.z - p.group.position.z);
      }
    }
    if (p.slashT > 0) {
      p.slashT -= dt;
      p.slash.material.opacity = Math.max(0, p.slashT / 0.3) * 0.7;
    } else p.slash.material.opacity = 0;
    placeLabel(p.label, p.group.position.x, p.labelY || 2.4, p.group.position.z);
  }
  updateMobs(dt);
  updateCorpses(dt);
  updateStones(dt, clock.elapsedTime);
  for (const s of Object.values(stones)) placeLabel(s.label, s.x, 4.6, s.z);
  for (const d of Object.values(drops)) {
    d.t += dt;
    d.spin.rotation.y += dt * 1.5;
    d.group.position.y = Math.sin(d.t * 3) * 0.08;
    placeLabel(d.label, d.x, 1.3, d.z);
  }
  for (const pt of mapInfo.portals) {
    if (pt.label) placeLabel(pt.label, pt.x, 6.2, pt.z);
  for (const st of Object.values(stallObjs)) placeLabel(st.label, st.x, 3.1, st.z);
    if (pt.field) pt.field.material.opacity = 0.35 + Math.sin(now / 300) * 0.12;
  }
  updateArrows(dt);
  updateEffects(dt);
  icons.pumpIcons();
  fx.updateFx(dt, (o) => players[o.id] === o);
  updateWeather(dt);
  updateSkillCooldowns();
  renderer.render(scene, camera);
}
loop();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- topluluk: menü, grup, görevler ----------
const MENU_SOON = {};
// öğretici için küçük sayaçlar
const tutStats = { moved: 0, invOpened: false, kills: 0 };
let tutLast = null;
const menuHandlers = {
  friends: () => document.getElementById('friendBtn').click(),
  char: () => document.getElementById('charBtn').click(),
  skills: () => document.getElementById('skillBtn').click(),
  guild: () => social.openGuild(),
  events: () => social.openEvents(),
  stall: () => social.openMyStall(),
  dungeon: () => social.openDungeon(),
  rank: () => social.openRank(),
  help: () => social.openHelp(),
  settings: () => document.getElementById('setBtn').click(),
};
export function onMenu(key, fn) { menuHandlers[key] = fn; }
function partyLabels(pt) {
  const ids = new Set(pt ? pt.members.map((m) => m.id) : []);
  for (const p of Object.values(players)) if (p.label && !p.npc && p.id !== myId) p.label.el.classList.toggle('party', ids.has(p.id));
}
settings.setup({
  sfx, toast, askBox,
  setCamZoom: (z) => { camZoom = Math.max(0.55, Math.min(1.7, z)); },
  // grafik: 0 düşük (telefonlar için hızlı), 1 normal, 2 yüksek
  setQuality: (q) => { renderer.setPixelRatio(Math.min(window.devicePixelRatio, [0.75, 1.25, 2][q] || 1.25)); renderer.setSize(window.innerWidth, window.innerHeight); },
  leave: () => { try { if (socket) socket.disconnect(); } catch (e) { /* yok say */ } },
});
social.setup({
  myId: () => myId, esc, toast, askBox, itemIcon, sfx, get ITEMS() { return ITEMS; }, inventory: () => inv.inventory, yang: () => inv.yang, myName: () => myName, tutStats: () => tutStats,
  onParty: partyLabels,
  inWarMap: () => !!(currentMap && currentMap.war),
  onWar: () => refreshFoes(),
  onEmpire: (n) => { myEmpire = n; const me = players[myId]; if (me) setEmpireTag(me, n); refreshFoes(); },
  menuAction: (k) => { if (menuHandlers[k]) menuHandlers[k](); else toast(`${MENU_SOON[k] || k} çok yakında!`); },
});
