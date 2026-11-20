// Görünüş eşyaları: kanatlar (tüylü, yarasa zarlı, kristal), evcil hayvanlar.
// Hepsi kodla üretilir; dışarıdan model gerekmez.
import * as THREE from 'three';
import { buildMob } from './mobs.js';
import { attachMobModel, loadModel } from './models.js';

const mats = new Map();
function wingMat(color, glow, opts = {}) {
  const k = color + glow + JSON.stringify(opts);
  if (!mats.has(k)) {
    mats.set(k, new THREE.MeshStandardMaterial({ color, emissive: glow || '#000000', emissiveIntensity: opts.ei ?? 0.35, roughness: opts.rough ?? 0.6,
      metalness: opts.metal ?? 0.05, side: THREE.DoubleSide, transparent: !!opts.alpha, opacity: opts.alpha ?? 1, depthWrite: !opts.alpha }));
  }
  return mats.get(k);
}

// tek kanat (sağ taraf; sol için aynası alınır). Yerel eksenler: +x dışarı, +y yukarı, -z geri
function featherWing(w) {
  const g = new THREE.Group();
  const base = new THREE.Color(w.color), tip = new THREE.Color(w.glow);
  const rows = [[7, 1.05, 0.0], [6, 0.8, 0.07], [5, 0.55, 0.14]];
  rows.forEach(([n, len, dz], r) => {
    for (let i = 0; i < n; i++) {
      const a = -0.25 + (i / (n - 1)) * 1.35;          // yelpaze açısı
      const c = base.clone().lerp(tip, (i / n) * 0.6 + r * 0.12);
      const f = new THREE.Mesh(new THREE.BoxGeometry(0.12 - r * 0.015, len * (0.75 + i / n * 0.45), 0.02), wingMat('#' + c.getHexString(), w.glow, { ei: 0.25 + r * 0.1 }));
      f.geometry.translate(0, f.geometry.parameters.height / 2, 0);
      f.position.set(0.08 + i * 0.075, 0.05 - r * 0.05, -dz);
      f.rotation.z = -a;
      g.add(f);
    }
  });
  // kemik (üst kenar)
  const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.75, 6), wingMat(w.color, w.glow, { ei: 0.15 }));
  bone.rotation.z = -1.15; bone.position.set(0.32, 0.32, 0.02);
  g.add(bone);
  return g;
}
function batWing(w) {
  const g = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(0.35, 0.55); shape.lineTo(1.1, 0.75); shape.quadraticCurveTo(1.0, 0.35, 1.15, 0.05);
  shape.quadraticCurveTo(0.85, 0.1, 0.8, -0.25); shape.quadraticCurveTo(0.55, -0.1, 0.45, -0.45); shape.quadraticCurveTo(0.25, -0.15, 0, 0);
  const memb = new THREE.Mesh(new THREE.ShapeGeometry(shape, 10), wingMat(w.color, w.glow, { ei: 0.45, alpha: 0.88, rough: 0.8 }));
  g.add(memb);
  const boneMat = wingMat('#2a1a1a', w.glow, { ei: 0.2 });
  for (const [x, y] of [[1.1, 0.75], [1.15, 0.05], [0.8, -0.25], [0.45, -0.45]]) {
    const len = Math.hypot(x - 0.35, y - 0.55);
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.015, len, 5), boneMat);
    b.position.set((x + 0.35) / 2, (y + 0.55) / 2, 0.01); b.rotation.z = Math.atan2(y - 0.55, x - 0.35) - Math.PI / 2;
    g.add(b);
  }
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.03, 0.66, 6), boneMat);
  arm.position.set(0.17, 0.27, 0.01); arm.rotation.z = Math.atan2(0.55, 0.35) - Math.PI / 2;
  g.add(arm);
  return g;
}
function crystalWing(w) {
  const g = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const len = 0.45 + Math.sin(i / 6 * Math.PI) * 0.6 + (i === 2 ? 0.2 : 0);
    const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), wingMat(w.color, w.glow, { ei: 0.8, alpha: 0.82, metal: 0.4, rough: 0.15 }));
    m.scale.set(0.9, len * 5, 0.35);
    const a = -0.2 + i * 0.2;
    m.position.set(0.12 + Math.sin(a) * len * 0.5 + i * 0.05, Math.cos(a) * len * 0.5, 0);
    m.rotation.z = -a;
    g.add(m);
  }
  return g;
}

// hazır modelli kanat (client/models/wings/<ad>.glb, tools/wingglb.py ile hazırlanır):
// 'sol' ve 'sag' parçaları kendi kök noktalarında çırpar, 'orta' (sırt plakası) sabit
function modelWings(w) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.rotation.y = Math.PI;              // modelin süslü yüzü (+z) sırttan dışarı baksın
  body.scale.setScalar(w.scale || 1);
  root.add(body);
  let L = null, R = null;
  root.userData.ready = loadModel(`models/wings/${w.model}.glb`).then((scene) => {
    const m = scene.clone(true);
    m.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.side = THREE.DoubleSide; if (w.glow) { o.material.emissive = new THREE.Color(w.glow); o.material.emissiveIntensity = 0.12; } }
      if (o.name === 'sol') L = o; if (o.name === 'sag') R = o;
    });
    body.add(m);
  }).catch((e) => console.warn('kanat modeli', e));
  root.userData.flap = (t, moving) => {
    if (!L || !R) return;
    const sp = moving ? 6.5 : 2.0, amp = moving ? 0.38 : 0.12;
    const a = Math.sin(t * sp) * amp;
    // kökten öne-arkaya açılıp kapanır, uçlar hafif yukarı kalkar
    L.rotation.y = -a; R.rotation.y = a;
    L.rotation.z = -a * 0.25; R.rotation.z = a * 0.25;
  };
  return root;
}
export function buildWings(w) {
  if (w.model) return modelWings(w);
  const make = w.kind === 'bat' ? batWing : w.kind === 'crystal' ? crystalWing : featherWing;
  const root = new THREE.Group();
  const R = make(w), L = make(w);
  L.scale.x = -1;
  const pivR = new THREE.Group(), pivL = new THREE.Group();
  pivR.position.x = 0.08; pivL.position.x = -0.08;
  pivR.add(R); pivL.add(L);
  root.add(pivR, pivL);
  root.scale.setScalar(w.kind === 'feather' ? 0.78 : 0.9);
  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData.flap = (t, moving) => {
    const sp = moving ? 7 : 2.2, amp = moving ? 0.42 : 0.16;
    const a = Math.sin(t * sp) * amp;
    pivR.rotation.y = 0.35 + a; pivL.rotation.y = -0.35 - a;
    pivR.rotation.z = -0.08 + a * 0.3; pivL.rotation.z = 0.08 - a * 0.3;
  };
  root.userData.flap(0, false);
  return root;
}

// evcil hayvan: küçük boyutlu canavar gövdesi, sahibinin arkasından seker
export function buildPet(def) {
  const p = def.pet || {};
  const v = buildMob({ shape: p.shape || 'dog', color: p.color || def.color || '#999', scale: p.shape === 'dragon' ? 0.42 : p.shape === 'flyer' ? 0.38 : 0.5 });
  // gerçek modeli olan hayvanlar (kurt, köpek/tilki, yılan) küçültülmüş modelle gösterilir
  if (p.model) attachMobModel(v, { style: { model: p.model }, scale: 0.45, color: p.color });
  v.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return v;
}
