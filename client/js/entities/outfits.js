// Sınıf kıyafetleri: Asya fantastiği tarzında, her sınıfa kendine has bir zırh takımı.
// Pul pul (lamel) göğüslük, katmanlı omuzluklar, bacakla oynayan uyluk plakaları, bileklik, dizlik,
// kemer, etek/pelerin ve sınıf başlığı. Plakalar tek geometride birleştirilir (az çizim çağrısı).
// Parçalar kemik çerçevelerine takılır: gövde çerçevelerinde x = karakterin solu, y = yukarı, z = ön;
// uzuv çerçevelerinde y = kemik boyunca (uca doğru), z = öne yakın, x = yana.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const PALETTES = {
  savasci: { metal: '#8d939c', trim: '#c9a14a', cloth: '#7a1f1a', leather: '#4a3020', under: '#3a2a24', accent: '#c0392b' },
  ninja:   { metal: '#3c414d', trim: '#a4a9b2', cloth: '#1d202b', leather: '#2a2420', under: '#1a1c24', accent: '#b0362b' },
  sura:    { metal: '#2c2433', trim: '#9a2430', cloth: '#1a1424', leather: '#2a1a20', under: '#1c1620', accent: '#b06bff' },
  saman:   { metal: '#c9a14a', trim: '#f0dca0', cloth: '#ece4cc', leather: '#5a4030', under: '#4a4038', accent: '#2f6f8a' },
  okcu:    { metal: '#6a5c3e', trim: '#c9a14a', cloth: '#2f5a2a', leather: '#5a3d24', under: '#2a3022', accent: '#c9b48a' },
};

const MAT_CACHE = {};
function M(color, kind = 'metal') {
  const key = color + kind;
  if (MAT_CACHE[key]) return MAT_CACHE[key];
  const o = kind === 'metal' ? { metalness: 0.75, roughness: 0.32 } : kind === 'gold' ? { metalness: 0.95, roughness: 0.22 } : kind === 'cloth' ? { metalness: 0, roughness: 0.92, side: THREE.DoubleSide } : { metalness: 0.05, roughness: 0.7 };
  const m = new THREE.MeshStandardMaterial({ color, ...o });
  m.userData.shared = true;
  return (MAT_CACHE[key] = m);
}
// geometri listesini tek mesh'e çevir
function merged(list, mat) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of geos) { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
  const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
  m.castShadow = true;
  return m;
}
const tf = (g, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new THREE.Vector3(sx, sy, sz));
  return g.applyMatrix4(m);
};
const BoxG = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// pul zırh: eliptik halka boyunca üst üste binen plaka sıraları (aşağı doğru hafif genişler)
function lamellar({ rx, rz, top, bottom, rows, cols, plateH, color, trimColor, open = 0 }) {
  const plates = [], trims = [];
  for (let r = 0; r < rows; r++) {
    const t = r / Math.max(1, rows - 1);
    const y = top - t * (top - bottom);
    const flare = 1 + t * 0.12;
    for (let c = 0; c < cols; c++) {
      const a = (c + (r % 2) * 0.5) / cols * Math.PI * 2;
      if (open && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < open) continue;   // önde açıklık (cüppe için)
      const px = Math.sin(a) * rx * flare, pz = Math.cos(a) * rz * flare;
      const w = (2 * Math.PI * Math.max(rx, rz) * flare) / cols * 1.15;
      plates.push(tf(BoxG(w, plateH, 0.014), { x: px, y, z: pz, ry: a, rx: -0.12 }));
    }
    if (r === 0 || r === rows - 1) trims.push(tf(new THREE.TorusGeometry(1, 0.012, 4, 32), { y: y + (r === 0 ? plateH / 2 : -plateH / 2), rx: Math.PI / 2, sx: rx * flare * 1.02, sy: rz * flare * 1.02 }));
  }
  const g = new THREE.Group();
  g.add(merged(plates, M(color)));
  if (trimColor) g.add(merged(trims, M(trimColor, 'gold')));
  return g;
}
// kavisli plaka (silindir dilimi)
const curvedPlate = (r, h, arc, thick = 0.012) => new THREE.CylinderGeometry(r, r * 1.04, h, 10, 1, true, -arc / 2, arc).translate(0, 0, 0).scale(1, 1, 1);
function pauldron(pal, side, big = 1, spikes = false) {
  const g = new THREE.Group();
  const s = big;
  const dome = tf(new THREE.SphereGeometry(0.1 * s, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), { y: 0.02, sx: 1.1, sz: 1.0 });
  const plates = [dome];
  for (let i = 0; i < 3; i++) plates.push(tf(curvedPlate(0.1 * s + i * 0.008, 0.07, Math.PI * 1.1), { y: -0.04 - i * 0.05, rx: 0 }));
  g.add(merged(plates, M(pal.metal)));
  const trims = [tf(new THREE.TorusGeometry(0.105 * s, 0.009, 4, 20), { y: -0.17, rx: Math.PI / 2 })];
  if (spikes) for (let i = 0; i < 3; i++) trims.push(tf(new THREE.ConeGeometry(0.018, 0.09, 6), { x: (i - 1) * 0.04, y: 0.1 * s + 0.02, rz: (i - 1) * 0.3 }));
  g.add(merged(trims, M(pal.trim, 'gold')));
  g.userData.side = side;
  return g;
}
function bracer(pal, len = 0.18, r = 0.062) {
  const g = new THREE.Group();
  g.add(merged([new THREE.CylinderGeometry(r * 1.12, r, len, 12, 1, true)], M(pal.leather, 'leather')));
  g.add(merged([tf(new THREE.TorusGeometry(r * 1.13, 0.008, 4, 16), { y: -len / 2 + 0.01, rx: Math.PI / 2 }), tf(new THREE.TorusGeometry(r * 1.02, 0.008, 4, 16), { y: len / 2 - 0.01, rx: Math.PI / 2 }),
    tf(BoxG(0.05, len * 0.8, 0.012), { z: r * 1.1 })], M(pal.trim, 'gold')));
  return g;
}
function greave(pal, len = 0.32, r = 0.078) {
  const g = new THREE.Group();
  g.add(merged([new THREE.CylinderGeometry(r * 1.05, r * 0.85, len, 12, 1, true, -Math.PI * 0.75, Math.PI * 1.5).rotateY(Math.PI)], M(pal.metal)));
  g.add(merged([tf(new THREE.SphereGeometry(0.058, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), { y: -len / 2 - 0.02, z: 0.02, rx: Math.PI }),
    tf(BoxG(0.03, len * 0.9, 0.012), { z: r * 1.05 })], M(pal.trim, 'gold')));
  return g;
}
// bacakla oynayan uyluk plakası (dışa bakan)
function thighPlate(pal, sideSign, len = 0.24) {
  const plates = [];
  for (let i = 0; i < 3; i++) plates.push(tf(BoxG(0.16, 0.1, 0.014), { x: sideSign * (0.115 + i * 0.006), y: -0.03 - i * 0.085, z: 0.0, rz: -sideSign * 0.1, ry: sideSign * Math.PI / 2 }));
  plates.push(tf(BoxG(0.16, 0.24, 0.012), { y: -0.13, z: 0.11, rx: 0.08 }));   // ön plaka
  const g = new THREE.Group();
  g.add(merged(plates, M(pal.metal)));
  return g;
}
// kumaş panel (önlük/arka etek)
function clothPanel(color, w, h, z, trimColor) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, h, 1, 4).translate(0, -h / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sign(z) * Math.pow(Math.max(0, -pos.getY(i) / h), 1.4) * 0.05);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(tf(geo, { z }), M(color, 'cloth')); m.castShadow = true;
  g.add(m);
  if (trimColor) g.add(merged([tf(BoxG(w, 0.025, 0.01), { y: -h + 0.012, z: z + Math.sign(z) * 0.05 })], M(trimColor, 'gold')));
  return g;
}
function belt(pal, rx = 0.19, rz = 0.15) {
  const g = new THREE.Group();
  g.add(merged([tf(new THREE.CylinderGeometry(1, 1, 0.07, 24, 1, true), { sx: rx, sz: rz })], M(pal.leather, 'leather')));
  g.add(merged([tf(BoxG(0.09, 0.08, 0.02), { z: rz + 0.01 }), tf(new THREE.TorusGeometry(0.025, 0.007, 4, 12), { z: rz + 0.022 })], M(pal.trim, 'gold')));
  return g;
}
export function capeMesh(color, inner, len = 1.05, w = 0.52) {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(w, len, 2, 8).translate(0, -len / 2, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), y = pos.getY(i); pos.setZ(i, -Math.abs(x) * 0.3 - (-y / len) * 0.05); pos.setX(i, x * (1 + (-y / len) * 0.12)); }
  geo.computeVertexNormals();
  const outer = new THREE.Mesh(geo, M(color, 'cloth')); outer.castShadow = true;
  g.add(outer);
  if (inner) { const im = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: inner, roughness: 0.9, side: THREE.BackSide })); im.position.z = 0.006; g.add(im); }
  g.userData.cape = true;
  return g;
}

// ---------- başlıklar (Soldier'ın vizörünü örter) ----------
function headgear(cls, pal) {
  const g = new THREE.Group();
  const dome = (r, open = 0.6) => new THREE.SphereGeometry(r, 18, 12, 0, Math.PI * 2, 0, Math.PI * open);
  if (cls === 'savasci') {
    // tuğlu miğfer: kubbe, siper, yanak koruyucular, kırmızı tuğ
    g.add(merged([tf(dome(0.145), { y: -0.05, sz: 1.08 }), tf(new THREE.CylinderGeometry(0.15, 0.16, 0.05, 18, 1, true), { y: -0.07 }),
      tf(BoxG(0.05, 0.14, 0.12), { x: 0.13, y: -0.15, z: 0.02, rz: 0.12 }), tf(BoxG(0.05, 0.14, 0.12), { x: -0.13, y: -0.15, z: 0.02, rz: -0.12 }),
      tf(BoxG(0.2, 0.025, 0.06), { y: -0.06, z: 0.15, rx: 0.3 })], M(pal.metal)));
    g.add(merged([tf(new THREE.TorusGeometry(0.152, 0.01, 4, 24), { y: -0.05, rx: Math.PI / 2, sy: 1.08 }), tf(new THREE.ConeGeometry(0.02, 0.08, 6), { y: 0.13 }), tf(BoxG(0.025, 0.17, 0.02), { y: 0.04, z: 0.13, rx: -0.4 })], M(pal.trim, 'gold')));
    const plume = [];
    for (let i = 0; i < 7; i++) plume.push(tf(BoxG(0.025, 0.32, 0.025), { x: (i - 3) * 0.012, y: 0.05, z: -0.12, rx: 0.9 + Math.abs(i - 3) * 0.06, rz: (i - 3) * 0.05 }));
    g.add(merged(plume, M(pal.accent, 'cloth')));
  } else if (cls === 'sura') {
    // boynuzlu kara miğfer ve yüz maskesi
    g.add(merged([tf(dome(0.148, 0.62), { y: -0.05, sz: 1.08 }), tf(BoxG(0.2, 0.12, 0.04), { y: -0.13, z: 0.135, rx: -0.1 }),
      tf(new THREE.CylinderGeometry(0.15, 0.165, 0.09, 18, 1, true), { y: -0.1 })], M(pal.metal)));
    const horns = [];
    for (const s of [-1, 1]) {
      horns.push(tf(new THREE.ConeGeometry(0.03, 0.2, 8), { x: s * 0.13, y: 0.04, z: 0.02, rz: -s * 1.0 }));
      horns.push(tf(new THREE.ConeGeometry(0.018, 0.14, 8), { x: s * 0.23, y: 0.14, z: 0.02, rz: -s * 0.2 }));
    }
    g.add(merged(horns, M('#d9cfb8', 'leather')));
    g.add(merged([tf(BoxG(0.13, 0.015, 0.02), { y: -0.1, z: 0.158 }), tf(new THREE.TorusGeometry(0.155, 0.01, 4, 24), { y: -0.055, rx: Math.PI / 2, sy: 1.08 })], M(pal.trim, 'gold')));
  } else if (cls === 'ninja') {
    // başlık ve yüz örtüsü, alnında metal plaka
    g.add(merged([tf(dome(0.15, 0.68), { y: -0.07, sz: 1.12 }), tf(new THREE.CylinderGeometry(0.15, 0.13, 0.12, 18, 1, true), { y: -0.17, z: 0.01 }),
      tf(new THREE.ConeGeometry(0.06, 0.18, 8), { y: -0.05, z: -0.15, rx: -1.9 })], M(pal.cloth, 'cloth')));
    g.add(merged([tf(BoxG(0.16, 0.04, 0.02), { y: -0.03, z: 0.155, rx: -0.15 })], M(pal.trim, 'gold')));
  } else if (cls === 'saman') {
    // taç ve uzun başlık süsü, yanlarda püsküller
    g.add(merged([tf(dome(0.143, 0.55), { y: -0.05, sz: 1.06 })], M(pal.cloth, 'cloth')));
    const gold = [tf(new THREE.CylinderGeometry(0.15, 0.15, 0.06, 18, 1, true), { y: -0.04 }), tf(new THREE.ConeGeometry(0.05, 0.22, 4), { y: 0.14 }),
      tf(new THREE.TorusGeometry(0.06, 0.01, 4, 16), { y: 0.06, z: 0.06 })];
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; gold.push(tf(new THREE.ConeGeometry(0.018, 0.09, 4), { x: Math.sin(a) * 0.15, y: 0.02, z: Math.cos(a) * 0.15 })); }
    g.add(merged(gold, M(pal.metal, 'gold')));
    const tassel = [];
    for (const s of [-1, 1]) tassel.push(tf(new THREE.CylinderGeometry(0.012, 0.02, 0.22, 6), { x: s * 0.16, y: -0.17 }));
    g.add(merged(tassel, M(pal.accent, 'cloth')));
    g.add(merged([tf(new THREE.OctahedronGeometry(0.03, 0), { y: 0.0, z: 0.16 })], new THREE.MeshStandardMaterial({ color: '#4fd1c5', emissive: '#4fd1c5', emissiveIntensity: 0.8 })));
  } else if (cls === 'okcu') {
    // avcı başlığı ve alın bandı, tüy
    g.add(merged([tf(dome(0.15, 0.62), { y: -0.07, sz: 1.12 }), tf(new THREE.ConeGeometry(0.07, 0.16, 8), { y: -0.04, z: -0.15, rx: -1.8 })], M(pal.cloth, 'cloth')));
    g.add(merged([tf(new THREE.TorusGeometry(0.152, 0.012, 4, 24), { y: -0.04, rx: Math.PI / 2, sz: 1.12 })], M(pal.trim, 'gold')));
    g.add(merged([tf(BoxG(0.02, 0.2, 0.05), { x: 0.13, y: 0.04, z: -0.04, rz: -0.35, rx: -0.3 })], M('#f4f1e8', 'cloth')));
  }
  return g;
}

// sadak (okçu): sırtta çapraz, oklar sağ omuzdan görünür
function quiver(pal) {
  const g = new THREE.Group();
  g.add(merged([new THREE.CylinderGeometry(0.055, 0.045, 0.46, 12)], M(pal.leather, 'leather')));
  const shafts = [], fl = [];
  for (let i = 0; i < 6; i++) {
    const x = ((i % 3) - 1) * 0.02, z = (i < 3 ? -1 : 1) * 0.012;
    shafts.push(tf(new THREE.CylinderGeometry(0.005, 0.005, 0.2, 4), { x, y: 0.31, z }));
    fl.push(tf(BoxG(0.032, 0.07, 0.004), { x, y: 0.39, z, ry: i * 0.7 }));
  }
  g.add(merged(shafts, M('#c9b48a', 'leather')));
  g.add(merged(fl, M(pal.accent === '#c9b48a' ? '#b0362b' : pal.accent, 'cloth')));
  g.add(merged([tf(new THREE.TorusGeometry(0.057, 0.008, 4, 14), { y: 0.2, rx: Math.PI / 2 }), tf(new THREE.TorusGeometry(0.05, 0.008, 4, 14), { y: -0.2, rx: Math.PI / 2 })], M(pal.trim, 'gold')));
  const w = new THREE.Group(); g.rotation.z = -0.7; g.position.set(0.02, -0.22, -0.05); w.add(g);
  return w;
}

// ---------- takım: [bağlantı noktası, mesh] listesi ----------
// opts: { metal, trim (eşya rengi), tier, hasHelmet, cuirass: false ise göğüslük yerine eşyanın kendi modeli takılır }
export function buildOutfit(cls, opts = {}) {
  const base = PALETTES[cls];
  if (!base) return [];
  const pal = { ...base };
  // zırh eşyasının rengi metal tonuna karışır (çok canlı renkler gerçekçi metal gibi dursun diye yumuşatılır)
  if (opts.metal) {
    const c = new THREE.Color(base.metal).lerp(new THREE.Color(opts.metal), 0.45);
    const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, Math.min(hsl.s, 0.26), Math.min(0.5, Math.max(0.3, hsl.l)));
    pal.metal = '#' + c.getHexString();
  }
  if (opts.tier != null && opts.tier >= 6) pal.trim = opts.legendary ? '#ffe08a' : '#d8b05a';
  const parts = [];
  const heavy = cls === 'savasci' || cls === 'sura';
  // göğüslük
  if (opts.cuirass !== false) {
    if (cls === 'saman') parts.push(['chest', lamellar({ rx: 0.18, rz: 0.145, top: 0.15, bottom: -0.36, rows: 6, cols: 18, plateH: 0.11, color: pal.cloth, trimColor: pal.metal })]);
    else parts.push(['chest', lamellar({ rx: heavy ? 0.195 : 0.18, rz: heavy ? 0.155 : 0.145, top: 0.16, bottom: -0.4, rows: heavy ? 8 : 7, cols: heavy ? 22 : 18, plateH: heavy ? 0.085 : 0.095, color: cls === 'ninja' || cls === 'okcu' ? pal.leather : pal.metal, trimColor: pal.trim })]);
    if (heavy) {
      // göğüs aynası (eski Asya zırhlarındaki yuvarlak plaka)
      const mirror = new THREE.Group();
      mirror.add(merged([tf(new THREE.CylinderGeometry(0.075, 0.075, 0.015, 24), { y: 0.04, z: 0.165, rx: Math.PI / 2 - 0.15 })], M(pal.trim, 'gold')));
      mirror.add(merged([tf(new THREE.CylinderGeometry(0.055, 0.055, 0.018, 24), { y: 0.04, z: 0.17, rx: Math.PI / 2 - 0.15 })], M(pal.metal)));
      parts.push(['chest', mirror]);
    }
  }
  // omuzluklar
  parts.push(['shoulderL', pauldron(pal, 1, heavy ? 1.25 : 0.95, cls === 'sura')]);
  parts.push(['shoulderR', pauldron(pal, -1, heavy ? 1.25 : 0.95, cls === 'sura')]);
  // bileklik, dizlik
  parts.push(['foreL', bracer(pal)]); parts.push(['foreR', bracer(pal)]);
  parts.push(['shinL', greave(pal)]); parts.push(['shinR', greave(pal)]);
  // kemer ve uyluk plakaları
  parts.push(['hips', belt(pal)]);
  if (cls !== 'saman') { parts.push(['thighL', thighPlate(pal, 1)]); parts.push(['thighR', thighPlate(pal, -1)]); }
  // önlük / etek / pelerin
  if (cls === 'savasci') { parts.push(['hips', clothPanel(pal.cloth, 0.2, 0.42, 0.155, pal.trim)]); parts.push(['hips', clothPanel(pal.cloth, 0.24, 0.42, -0.15, pal.trim)]); }
  if (cls === 'sura') { parts.push(['back', capeMesh('#1a1424', '#8e1f2a', 1.0, 0.42)]); parts.push(['hips', clothPanel('#2a1a30', 0.2, 0.4, 0.155, pal.trim)]); }
  if (cls === 'ninja') { parts.push(['hips', clothPanel(pal.cloth, 0.16, 0.36, 0.155, null)]); const scarf = capeMesh(pal.accent, null, 0.7, 0.11); scarf.position.x = 0.05; parts.push(['back', scarf]); }
  if (cls === 'okcu') { parts.push(['back', capeMesh(pal.cloth, '#1f3a1c', 0.62, 0.44)]); parts.push(['back', quiver(pal)]); parts.push(['hips', clothPanel(pal.cloth, 0.18, 0.34, 0.155, pal.trim)]); }
  if (cls === 'saman') {
    // uzun cüppe: katlı etek (bacak hareketini örtecek kadar geniş)
    const robe = new THREE.Group();
    const skirt = new THREE.CylinderGeometry(0.2, 0.36, 0.8, 22, 4, true).translate(0, -0.42, 0);
    const pos = skirt.attributes.position;
    for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getX(i), pos.getZ(i)); const k = 1 + Math.sin(a * 11) * 0.03 * (-(pos.getY(i)) / 0.8); pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
    skirt.computeVertexNormals();
    const sm = new THREE.Mesh(skirt, M(pal.cloth, 'cloth')); sm.castShadow = true;
    robe.add(sm);
    robe.add(merged([tf(new THREE.TorusGeometry(0.36, 0.016, 4, 30), { y: -0.82, rx: Math.PI / 2 }), tf(BoxG(0.06, 0.78, 0.012), { y: -0.42, z: 0.3, rx: -0.14 })], M(pal.metal, 'gold')));
    robe.add(merged([tf(BoxG(0.1, 0.7, 0.01), { y: -0.38, z: 0.29, rx: -0.14 })], M(pal.accent, 'cloth')));
    robe.userData.robe = true;
    parts.push(['hips', robe]);
    const beads = [];
    for (let i = 0; i < 14; i++) { const a = Math.PI * (0.12 + i / 13 * 0.76); beads.push(tf(new THREE.SphereGeometry(0.016, 6, 5), { x: Math.cos(a) * 0.13, y: -Math.sin(a) * 0.13 + 0.03, z: 0.12 })); }
    parts.push(['neck', merged(beads, M('#b0362b', 'leather'))]);
  }
  if (!opts.hasHelmet) { const hg = headgear(cls, pal); hg.scale.setScalar(1.14); hg.position.y = -0.015; const w = new THREE.Group(); w.add(hg); parts.push(['helmet', w]); }
  return parts;
}
// Soldier'ın kendi rengini sınıfın iç giysisine doğru karart (çıplak görünmesin)
export function undersuitColor(cls) { return (PALETTES[cls] || {}).under || null; }
