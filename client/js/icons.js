// Gerçekçi envanter simgeleri: her eşya, küçük bir ikinci çizicide ışıklandırılmış 3D modeliyle
// çizilip resme dönüştürülür (bir kez; sonra önbellekten gelir). Çizilene kadar eski SVG simge görünür.
import * as THREE from 'three';

const SIZE = 112;
let renderer = null, scene = null, camera = null, failed = false;
const cache = {};        // anahtar -> dataURL
const pending = new Set();
const queue = [];
let onReady = null, readyTimer = null;

export function onIconsReady(cb) { onReady = cb; }

function setup() {
  if (renderer || failed) return !!renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.setSize(SIZE, SIZE, false);
    renderer.setClearColor(0x000000, 0);
    if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
    scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight('#fff6e8', '#3a3328', 1.4));
    const key = new THREE.DirectionalLight('#fff1d6', 2.6); key.position.set(2, 3, 4); scene.add(key);
    const rim = new THREE.DirectionalLight('#9fc8ff', 1.6); rim.position.set(-3, 1.5, -3); scene.add(rim);
    const fill = new THREE.DirectionalLight('#ffffff', 0.6); fill.position.set(-2, -1, 3); scene.add(fill);
    camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
    return true;
  } catch (e) {
    console.warn('Simge çizici açılamadı, düz simgeler kullanılacak', e);
    failed = true; renderer = null;
    return false;
  }
}

// key: eşya anahtarı; build(): THREE.Object3D döndürür (userData.ready varsa model yüklenince çizilir)
export function iconURL(key, build, pose) {
  if (cache[key]) return cache[key];
  if (failed) return null;
  if (!pending.has(key)) { pending.add(key); queue.push({ key, build, pose }); }
  return null;
}

const _box = new THREE.Box3(), _c = new THREE.Vector3(), _s = new THREE.Vector3();
async function draw(job) {
  let obj;
  try { obj = job.build(); } catch (e) { console.warn('Simge modeli kurulamadı', job.key, e); pending.delete(job.key); return; }
  if (!obj) { pending.delete(job.key); return; }
  // içindeki model(ler) yüklensin
  const waits = [];
  obj.traverse((o) => { if (o.userData && o.userData.ready) waits.push(o.userData.ready); });
  if (waits.length) await Promise.all(waits);
  const holder = new THREE.Group();
  const pose = job.pose || {};
  holder.rotation.set(pose.rx || 0, pose.ry || 0, pose.rz || 0);
  holder.add(obj);
  scene.add(holder);
  holder.updateMatrixWorld(true);
  _box.setFromObject(holder);
  _box.getCenter(_c); _box.getSize(_s);
  holder.position.sub(_c);
  const r = Math.max(_s.x, _s.y, _s.z) * 0.62;
  const dist = r / Math.tan((camera.fov || 28) * Math.PI / 360) * 1.05;
  camera.position.set(dist * 0.18, dist * 0.22, dist);
  camera.lookAt(0, 0, 0);
  renderer.render(scene, camera);
  try { cache[job.key] = renderer.domElement.toDataURL('image/png'); } catch (e) { /* yok say */ }
  scene.remove(holder);
  pending.delete(job.key);
  // ekrandaki pencereleri toplu yenile
  if (onReady && !readyTimer) readyTimer = setTimeout(() => { readyTimer = null; onReady(); }, 120);
}

// her karede en fazla iki simge çiz (oyun takılmasın)
let busy = 0;
export function pumpIcons() {
  if (!queue.length || busy >= 2) return;
  if (!setup()) { queue.length = 0; return; }
  while (queue.length && busy < 2) {
    const job = queue.shift();
    busy++;
    draw(job).finally(() => { busy--; });
  }
}

// ---------- kodla kurulan eşya modelleri (dosyası olmayanlar) ----------
const std = (color, metal = 0.6, rough = 0.35, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough, ...extra });
const glow = (color, k = 1) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3 });

export function bootsMesh(def) {
  const g = new THREE.Group();
  const leather = std('#5a3d24', 0.05, 0.75), metal = std(def.color, 0.8, 0.28), trim = std(def.trim || '#e8b54a', 0.9, 0.25);
  for (const s of [-1, 1]) {
    const b = new THREE.Group(); b.position.x = s * 0.16; b.rotation.y = s * 0.12;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.3, 14), leather); shaft.position.y = 0.2;
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.088, 0.06, 14), metal); cuff.position.y = 0.34;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.08, 0.28), leather); foot.position.set(0, 0.04, 0.07);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.078, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal); toe.scale.set(1, 0.7, 1.2); toe.position.set(0, 0.04, 0.19);
    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.03), metal); shin.position.set(0, 0.22, 0.085);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.083, 0.008, 6, 18), trim); strap.rotation.x = Math.PI / 2; strap.position.y = 0.14;
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 0.3), std('#2a2018', 0, 0.9)); sole.position.set(0, 0.0, 0.07);
    b.add(shaft, cuff, foot, toe, shin, strap, sole);
    // üst kademeler (evrim zinciri): zırhlı dizlik, kanatçık ve parlayan taş — her basamak daha gösterişli
    const t = def.tier || 0;
    if (t >= 9) { const knee = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), metal); knee.rotation.x = Math.PI / 2; knee.position.set(0, 0.36, 0.07); b.add(knee); }
    if (t >= 11) for (const k of [0, 1]) { const wing = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 4), trim); wing.position.set(s * 0.09, 0.3 - k * 0.07, -0.02); wing.rotation.z = -s * 1.2; b.add(wing); }
    if (t >= 12) { const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), glow(t >= 14 ? '#ff4a2a' : t >= 13 ? '#b06bff' : '#7fd0ff', 0.9)); gem.position.set(0, 0.25, 0.105); b.add(gem); }
    g.add(b);
  }
  return g;
}
export function braceletMesh(def) {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.06, 16, 40), std(def.color, 0.9, 0.22));
  band.scale.z = 1.6;
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 40), std(def.trim || '#e8b54a', 1, 0.2)); inner.position.z = 0.07;
  const inner2 = inner.clone(); inner2.position.z = -0.07;
  g.add(band, inner, inner2);
  const gemColor = def.rarity >= 3 ? '#ff3b5c' : def.rarity >= 2 ? '#7fb3ff' : '#7be08f';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(i === 0 ? 0.07 : 0.04, 0), glow(gemColor, i === 0 ? 0.8 : 0.4));
    gem.position.set(Math.cos(a) * 0.36, Math.sin(a) * 0.36, 0);
    g.add(gem);
  }
  g.rotation.x = 0.9;
  return g;
}
export function earringMesh(def) {
  const g = new THREE.Group();
  const gold = std(def.trim || '#e8b54a', 1, 0.2);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.014, 8, 24, Math.PI * 1.4), gold); hook.position.y = 0.38; hook.rotation.z = -0.4;
  const link = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.16, 6), gold); link.position.y = 0.22;
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.06, 8), std(def.color, 0.9, 0.25)); cap.position.y = 0.13;
  const gemColor = def.rarity >= 3 ? '#ff3b5c' : def.rarity >= 2 ? '#8a7dff' : '#4fd1c5';
  const drop = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), glow(gemColor, 0.5)); drop.scale.y = 1.5; drop.position.y = -0.02;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.12, 12), glow(gemColor, 0.5)); tip.rotation.x = Math.PI; tip.position.y = -0.18;
  g.add(hook, link, cap, drop, tip);
  return g;
}
// kolye: altın zincir, ortada taşlı madalyon
export function necklaceMesh(def) {
  const g = new THREE.Group();
  const gold = std(def.trim || '#e8b54a', 1, 0.2);
  const chain = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.016, 8, 48, Math.PI * 1.25), gold);
  chain.rotation.z = -Math.PI * 1.125;   // yay aşağı sarkar chain.position.y = 0.18;
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI / 2 - Math.PI * 0.55 + (i / 8) * Math.PI * 1.1;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), std(def.color, 0.7, 0.3));
    b.position.set(Math.cos(a) * 0.34, 0.18 + Math.sin(a) * 0.34, 0.01); g.add(b);
  }
  const gemColor = def.rarity >= 3 ? '#ff3b5c' : def.rarity >= 2 ? '#8a7dff' : '#4fd1c5';
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.025, 10, 28), gold); frame.position.y = -0.24;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 1), glow(gemColor, 0.6)); gem.position.y = -0.24; gem.scale.set(1, 1.2, 0.6);
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.012, 6, 14), gold); bail.position.y = -0.1;
  g.add(chain, frame, gem, bail);
  // evrim zinciri: her basamakta yan sarkaçlar, kanatlar ve büyüyen taş
  const t = def.tier || 0, tc = t >= 14 ? '#ff4a2a' : t >= 13 ? '#b06bff' : t >= 12 ? '#ff7a3a' : t >= 11 ? '#7fd0ff' : gemColor;
  gem.material = glow(tc, 0.7);
  if (t >= 10) for (const sx of [-1, 1]) {
    const pd = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), glow(tc, 0.5)); pd.position.set(sx * 0.17, -0.12, 0); pd.scale.y = 1.6; g.add(pd);
  }
  if (t >= 12) for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 4), gold); w.position.set(sx * 0.15, -0.26, -0.01); w.rotation.z = sx * 1.9; g.add(w);
  }
  if (t >= 13) { const halo = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.01, 6, 32), glow(tc, 0.8)); halo.position.y = -0.24; g.add(halo); }
  if (t >= 14) gem.scale.multiplyScalar(1.35);
  return g;
}
export function potionMesh(def) {
  const g = new THREE.Group();
  const liquid = def.color || '#ff3b2f';
  const glass = new THREE.MeshStandardMaterial({ color: '#e8f4ff', metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.35 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.26, 24, 18), glass); body.position.y = 0.26;
  const fluid = new THREE.Mesh(new THREE.SphereGeometry(0.23, 24, 18, 0, Math.PI * 2, Math.PI * 0.25, Math.PI * 0.75), glow(liquid, 0.55)); fluid.position.y = 0.26;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.18, 14), glass); neck.position.y = 0.56;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.09, 12), std('#8a5a32', 0, 0.85)); cork.position.y = 0.69;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.015, 6, 18), std('#e8b54a', 1, 0.25)); ring.rotation.x = Math.PI / 2; ring.position.y = 0.48;
  const shine = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffffff' })); shine.position.set(-0.12, 0.36, 0.17);
  g.add(fluid, body, neck, cork, ring, shine);
  return g;
}
export function crystalMesh(color, big = false) {
  const g = new THREE.Group();
  const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), glow(color, 0.7)); c.scale.y = 1.6;
  g.add(c);
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), glow(color, 0.5)); s.scale.y = 1.6;
    const a = i / 4 * Math.PI * 2; s.position.set(Math.cos(a) * 0.3, -0.25, Math.sin(a) * 0.3); s.rotation.z = Math.cos(a) * 0.5;
    g.add(s);
  }
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.08, 8), std('#3a3328', 0.3, 0.7)); base.position.y = -0.36;
  if (big) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 6, 30), std('#e8b54a', 1, 0.2)); ring.rotation.x = Math.PI / 2; ring.position.y = -0.05; g.add(ring); }
  g.add(base);
  return g;
}
// balıklar: her türün kendi biçimi ve deseni (Metin2 gibi tanınır)
const FISH_LOOK = {
  hamsi: { L: 0.5, H: 0.14, W: 0.09, back: '#2f6f9a', belly: '#e8f0f4', fin: '#7fa8c0', fork: 0.9 },
  sazan: { L: 0.5, H: 0.25, W: 0.15, back: '#7a5a1e', belly: '#f0d27a', fin: '#b0602a', scales: '#5a3e10', barbel: true },
  alabalik: { L: 0.52, H: 0.2, W: 0.12, back: '#4a5e3a', belly: '#f4ece0', fin: '#9a8a6a', stripe: '#e8708a', spots: '#1a1a14' },
  levrek: { L: 0.55, H: 0.22, W: 0.12, back: '#3c4a56', belly: '#e4e8ea', fin: '#6a7884', bars: '#26303a', spiny: true },
  yayin: { L: 0.62, H: 0.17, W: 0.17, back: '#2e3228', belly: '#a8a490', fin: '#3a3e34', whiskers: true, flatHead: true },
};
const FISH_BY_KEY = { b_hamsi: 'hamsi', b_sazan: 'sazan', b_alabalik: 'alabalik', b_levrek: 'levrek', b_yayin: 'yayin' };
export function fishMesh(def) {
  const color = typeof def === 'string' ? def : def && def.color;
  const kind = (def && typeof def === 'object' && (def.fish || FISH_BY_KEY[def.key])) || 'hamsi';
  const F = FISH_LOOK[kind] || { ...FISH_LOOK.hamsi, back: color || '#5a7a8a' };
  const g = new THREE.Group();
  // gövde: uzatılmış küre, kuyruğa doğru incelir; renkler köşe başına (sırt koyu, karın açık, desenler)
  const geo = new THREE.SphereGeometry(1, 32, 18);
  const pos = geo.attributes.position, cols = [];
  const cB = new THREE.Color(F.back), cY = new THREE.Color(F.belly), tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = (x + 1) / 2;                                    // 0 kuyruk, 1 baş
    const taper = Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + t * 0.95)), 0.75);
    let yy = y * F.H * taper, zz = z * F.W * taper;
    if (F.flatHead && t > 0.7) { yy *= 1 - (t - 0.7) * 0.9; zz *= 1 + (t - 0.7) * 0.6; }
    pos.setXYZ(i, x * F.L, yy + (kind === 'sazan' ? Math.max(0, y) * 0.06 * taper : 0), zz);
    const k = THREE.MathUtils.smoothstep(y, -0.35, 0.45);
    tmp.copy(cY).lerp(cB, k);
    if (F.stripe && Math.abs(y + 0.02) < 0.16 && t > 0.15 && t < 0.85) tmp.lerp(new THREE.Color(F.stripe), 0.75);
    if (F.spots && y > -0.1 && Math.sin(x * 37) * Math.sin(y * 29 + z * 11) > 0.72) tmp.set(F.spots);
    if (F.bars && y > -0.15 && t > 0.2 && t < 0.8 && Math.sin(t * 40) > 0.55) tmp.lerp(new THREE.Color(F.bars), 0.7);
    if (F.scales && (Math.sin(x * 46 + y * 18) * Math.sin(z * 30 + y * 26) > 0.6)) tmp.lerp(new THREE.Color(F.scales), 0.35);
    if (t > 0.86 && y > -0.2) tmp.multiplyScalar(0.85);    // kafa biraz koyu
    cols.push(tmp.r, tmp.g, tmp.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  geo.computeVertexNormals();
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.45, roughness: 0.32 }));
  body.castShadow = true; g.add(body);
  const finMat = new THREE.MeshStandardMaterial({ color: F.fin, metalness: 0.2, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  // kuyruk: çatal
  const tail = new THREE.Shape(); const fk = F.fork || 0.5;
  tail.moveTo(0, 0); tail.lineTo(-F.L * 0.42, F.H * 1.25); tail.lineTo(-F.L * (0.42 - fk * 0.22), 0); tail.lineTo(-F.L * 0.42, -F.H * 1.25); tail.lineTo(0, 0);
  const tm = new THREE.Mesh(new THREE.ShapeGeometry(tail), finMat); tm.position.x = -F.L * 0.86; g.add(tm);
  // sırt yüzgeci (levrekte dikenli)
  const dor = new THREE.Shape(); dor.moveTo(-F.L * 0.35, 0);
  if (F.spiny) { for (let i = 0; i <= 6; i++) dor.lineTo(-F.L * 0.35 + i * F.L * 0.09, (i % 2 ? 0.45 : 1) * F.H * 0.9); dor.lineTo(F.L * 0.25, 0); }
  else { dor.quadraticCurveTo(-F.L * 0.1, F.H * 1.1, F.L * 0.2, 0); }
  const dm = new THREE.Mesh(new THREE.ShapeGeometry(dor), finMat); dm.position.y = F.H * 0.85; g.add(dm);
  // göğüs ve karın yüzgeçleri
  for (const sz of [-1, 1]) {
    const pf = new THREE.Mesh(new THREE.ConeGeometry(F.H * 0.35, F.L * 0.3, 3), finMat);
    pf.rotation.set(sz * 0.5, 0, 2.3); pf.scale.z = 0.25; pf.position.set(F.L * 0.42, -F.H * 0.35, sz * F.W * 0.8); g.add(pf);
  }
  // göz
  for (const sz of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(F.H * 0.12, 10, 8), new THREE.MeshStandardMaterial({ color: '#e8d890', metalness: 0.3, roughness: 0.2 }));
    eye.position.set(F.L * 0.74, F.H * 0.25, sz * F.W * 0.62);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(F.H * 0.09, 8, 6), new THREE.MeshBasicMaterial({ color: '#0a0a0a' }));
    pupil.position.set(F.H * 0.04, 0, sz * F.H * 0.08); eye.add(pupil); g.add(eye);
  }
  // bıyıklar: yayın balığında uzun, sazanda kısa
  if (F.whiskers || F.barbel) {
    const wm = new THREE.MeshStandardMaterial({ color: F.fin, roughness: 0.6 });
    const n = F.whiskers ? 2 : 1, len = F.whiskers ? F.L * 0.55 : F.L * 0.12;
    for (const sz of [-1, 1]) for (let i = 0; i < n; i++) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.012, len, 5), wm);
      w.geometry.translate(0, -len / 2, 0);
      w.position.set(F.L * 0.95, -F.H * 0.1 - i * F.H * 0.15, sz * F.W * 0.5);
      w.rotation.set(sz * (0.5 + i * 0.4), 0, -0.9 - i * 0.3); g.add(w);
    }
  }
  g.rotation.z = 0.2;
  return g;
}
export function pearlMesh(color) {
  const g = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std('#c9b8a0', 0.2, 0.6, { side: THREE.DoubleSide }));
  shell.scale.y = 0.35; shell.rotation.x = Math.PI;
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.17, 24, 18), std(color || '#f4f1e8', 0.3, 0.12)); pearl.position.y = 0.05;
  g.add(shell, pearl);
  return g;
}
export function shellMesh() {
  const g = new THREE.Group();
  const m = std('#8a7a68', 0.15, 0.7, { side: THREE.DoubleSide });
  const a = new THREE.Mesh(new THREE.SphereGeometry(0.4, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); a.scale.y = 0.3;
  const b = a.clone(); b.rotation.x = Math.PI - 0.5; b.position.set(0, 0.05, -0.15);
  g.add(a, b);
  return g;
}
export function rodMesh() {
  const g = new THREE.Group();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.03, 1.4, 8), std('#8a5a32', 0, 0.6)); rod.rotation.z = -0.7;
  const reel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 14), std('#c9d1d9', 0.9, 0.25)); reel.rotation.x = Math.PI / 2; reel.position.set(-0.32, -0.25, 0.04);
  g.add(rod, reel);
  return g;
}
export function wormMesh() {
  const g = new THREE.Group();
  const m = std('#d97a7a', 0.05, 0.6);
  for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), m); s.position.set(Math.cos(i * 0.7) * 0.25, i * 0.03, Math.sin(i * 0.7) * 0.25); g.add(s); }
  return g;
}
export function medalMesh() {
  const g = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.06, 32), std('#c9a35a', 1, 0.25)); disc.rotation.x = Math.PI / 2;
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 8, 32), std('#8a6a3a', 1, 0.3));
  const horse = new THREE.Mesh(new THREE.TorusKnotGeometry(0.12, 0.03, 40, 6), std('#6b4a2e', 0.6, 0.4)); horse.position.z = 0.05;
  g.add(disc, rim, horse);
  return g;
}

export function ringMesh(color = '#4fd1c5') {
  const g = new THREE.Group();
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 16, 40), std('#e8b54a', 1, 0.18));
  const setting = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.08, 8), std('#e8b54a', 1, 0.2)); setting.position.y = 0.3;
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), glow(color, 0.9)); gem.position.y = 0.4; gem.scale.y = 0.8;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 6, 30), glow(color, 1.2)); halo.position.y = 0.4; halo.rotation.x = Math.PI / 2;
  g.add(band, setting, gem, halo);
  g.rotation.x = 0.35;
  return g;
}
// ruh taşı: parlak yüzeyli yuvarlak taş, içinde ışıyan çekirdek, dereceye göre altın halka
export function spiritStoneMesh(color, grade = 0) {
  const g = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(0.34, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const k = 1 + Math.sin(i * 12.9898) * 0.06; pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k * 0.82, pos.getZ(i) * k); }
  geo.computeVertexNormals();
  const shell = new THREE.Mesh(geo, std(color, 0.35, 0.18, { flatShading: true, transparent: true, opacity: 0.88 }));
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), glow(color, 0.95));
  g.add(core, shell);
  for (let i = 0; i < grade; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.38 + i * 0.045, 0.012, 6, 36), std('#e8b54a', 1, 0.2));
    r.rotation.x = Math.PI / 2 + 0.35; r.rotation.y = i * 0.5; g.add(r);
  }
  return g;
}
// kutsama kağıdı: dürülmüş parşömen ve kırmızı kurdele
export function scrollMesh() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.78, 20), std('#efe0b0', 0, 0.8)); paper.rotation.z = Math.PI / 2;
  for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 12), std('#8a5a32', 0.2, 0.5)); c.rotation.z = Math.PI / 2; c.position.x = sx * 0.44; g.add(c); }
  const rib = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 20), std('#b0281f', 0.1, 0.5)); rib.rotation.y = Math.PI / 2;
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 14), std('#c9a14a', 0.9, 0.25)); seal.position.set(0, -0.06, 0.15); seal.rotation.x = Math.PI / 2;
  g.add(paper, rib, seal);
  return g;
}
// demirci yaprağı: damarlı, hafif kıvrık yaprak
export function leafMesh(color) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.45); shape.quadraticCurveTo(0.34, -0.1, 0, 0.5); shape.quadraticCurveTo(-0.34, -0.1, 0, -0.45);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 16 });
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i); pos.setZ(i, pos.getZ(i) + x * x * 0.9); }
  geo.computeVertexNormals();
  const leaf = new THREE.Mesh(geo, std(color, 0.15, 0.45, { emissive: color, emissiveIntensity: 0.25 }));
  const vein = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.018, 0.9, 6), std('#f4f1e8', 0, 0.6)); vein.position.z = 0.05;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.22, 6), std('#5a3d24', 0, 0.7)); stem.position.set(0, -0.55, 0.02);
  g.add(leaf, vein, stem); g.rotation.z = -0.5;
  return g;
}
// sandık (pet sandığı vb.): ahşap gövde, metal kuşak, altın kilit
export function chestBoxMesh(color = '#7a4a26', band = '#e8b54a') {
  const g = new THREE.Group();
  const wood = std(color, 0.05, 0.7), metal = std(band, 0.9, 0.3);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.45, 0.5), wood); body.position.y = -0.1;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.8, 18, 1, false, 0, Math.PI), wood); lid.rotation.z = Math.PI / 2; lid.position.y = 0.12;
  const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.47, 0.52), metal); b1.position.set(-0.25, -0.1, 0);
  const b2 = b1.clone(); b2.position.x = 0.25;
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.06), metal); lock.position.set(0, 0.06, 0.27);
  g.add(body, lid, b1, b2, lock);
  return g;
}
