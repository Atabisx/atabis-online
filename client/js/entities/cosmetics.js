// Görünüş eşyaları: kanatlar (kullanıcının modelleri) ve evcil hayvanlar.
import * as THREE from 'three';
import { buildMob } from './mobs.js';
import { attachMobModel, loadModel } from './models.js';

// kanatlar: kullanıcının getirdiği modeller (client/models/wings/*.glb)
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
  const root = new THREE.Group(); root.userData.flap = () => {};   // modelsiz eski kanat: görünmez
  return root;
}

// evcil hayvan: küçük boyutlu canavar gövdesi, sahibinin arkasından seker
export function buildPet(def) {
  const p = def.pet || {};
  const v = buildMob({ shape: p.shape || 'dog', color: p.color || def.color || '#999', scale: p.shape === 'dragon' ? 0.42 : p.shape === 'flyer' ? 0.38 : 0.5 });
  // gerçek modeli olan hayvanlar (kurt, köpek/tilki, yılan) küçültülmüş modelle gösterilir
  if (p.model) attachMobModel(v, { style: { model: p.model }, scale: p.scale || 0.45, color: p.color });
  v.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return v;
}
