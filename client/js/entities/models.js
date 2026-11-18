// Kullanıcının eklediği 3D modeller (client/models/mobs, client/models/items).
// Bu modellerin iskeleti ve animasyonu yok: tek parça heykel gibiler. Onları canlandırmak için
// yüklenince modelin şeklinden bacak, kol, baş ve kuyruk bölgelerini ayırıyoruz; ekran kartı her
// karede bu bölgeleri kendi eklem noktası etrafında döndürüyor (yürüme, ısırma, kılıç savurma).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// size: def.scale = 1 iken metre cinsinden boy
// kind: quad (dört ayaklı), sit (oturan köpek), humanoid, robe (cüppeli, ayak yok), snake
// legTop: bacakların bittiği yükseklik (boyun oranı); armX: bu yatay uzaklıktan sonrası kol (boyun oranı)
export const MOB_MODELS = {
  kurt:        { kind: 'quad', size: 0.8, legTop: 0.42, head: 0.3, tail: 0.14, freq: 11, amp: 0.55 },
  kaplan:      { kind: 'quad', size: 0.9, legTop: 0.4, head: 0.25, tail: 0.14, freq: 9, amp: 0.5 },
  kopek:       { kind: 'sit', size: 0.9, legTop: 0.45, head: 0.32, tail: 0.0, freq: 10, amp: 0.4 },
  at:          { kind: 'quad', size: 1.65, legTop: 0.42, head: 0.3, tail: 0.1, freq: 8, amp: 0.45 },
  savasci:     { kind: 'humanoid', size: 1.8, legTop: 0.45, armX: 0.15, armMin: 0.42, shoulder: 0.78, headY: 0.88, freq: 8, amp: 0.38 },
  mumya:       { kind: 'humanoid', size: 1.8, legTop: 0.45, armX: 0.105, armMin: 0.42, shoulder: 0.8, headY: 0.88, freq: 6, amp: 0.4 },
  su_elementi: { kind: 'humanoid', size: 1.3, legTop: 0.14, armX: 0.24, armMin: 0.08, shoulder: 0.58, headY: 0.7, freq: 6, amp: 0.35 },
  buyucu:      { kind: 'robe', size: 1.8, legTop: 0, armX: 0.2, armMin: 0.5, shoulder: 0.78, headY: 0.9, freq: 4, amp: 0.3 },
  yilan:       { kind: 'snake', size: 1.0, headY: 0.62, freq: 6, amp: 0.3 },
};
const KIND = { quad: 0, sit: 0, humanoid: 1, robe: 2, snake: 3 };

const loader = new GLTFLoader();
const cache = {};
export function loadModel(url) {
  if (!cache[url]) {
    cache[url] = new Promise((resolve, reject) => loader.load(url, (g) => resolve(g.scene), undefined, reject));
  }
  return cache[url];
}

// ---------- bölgeleri ayır: her köşe noktasına bölge, ağırlık ve eklem noktası ----------
// aPart: 0 gövde, 1-4 bacak (1 ön sol, 2 ön sağ, 3 arka sol, 4 arka sağ; insanda 1 sol, 2 sağ),
//        5 sağ kol (silah), 6 sol kol, 7 baş, 8 kuyruk
export function rig(geo, spec) {
  if (geo.userData.rigged) return geo.userData.rigged;
  const pos = geo.attributes.position, n = pos.count;
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const H = bb.max.y - bb.min.y, L = bb.max.z - bb.min.z;
  const xc = (bb.min.x + bb.max.x) / 2;
  const part = new Float32Array(n), w = new Float32Array(n), piv = new Float32Array(n * 3);
  const y = (i) => pos.getY(i), x = (i) => pos.getX(i), z = (i) => pos.getZ(i);
  const clamp01 = (v) => Math.max(0, Math.min(1, v));
  const legTopY = bb.min.y + (spec.legTop || 0) * H;
  // sol-sağ ayrım çizgisi: kutunun ortası değil, baldırların ortası (kılıç/kalkan kutuyu kaydırır)
  function midX(maxY) {
    const xs = [];
    for (let i = 0; i < n; i++) if (y(i) < maxY) xs.push(x(i));
    if (!xs.length) return xc;
    xs.sort((a, b) => a - b);
    return xs[xs.length >> 1];
  }
  // ayrım çizgisine yakın noktalar kıpırdamaz: etek/göğüs ikiye yırtılmaz, sadece esner
  const seam = (dx) => clamp01(Math.abs(dx) / (0.05 * H));

  if (spec.kind === 'quad' || spec.kind === 'sit') {
    // bacak bölgesinin ortası: ön/arka ve sol/sağ ayrımı buna göre
    let mz = 0, c = 0;
    for (let i = 0; i < n; i++) if (y(i) < legTopY) { mz += z(i); c++; }
    mz /= c || 1;
    const mx = midX(bb.min.y + 0.6 * (legTopY - bb.min.y));
    const sum = [0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0];
    const headZ = bb.max.z - spec.head * L, tailZ = bb.min.z + (spec.tail || 0) * L;
    for (let i = 0; i < n; i++) {
      if (y(i) < legTopY) {
        const front = z(i) > mz, left = x(i) > mx;
        const p = front ? (left ? 1 : 2) : (left ? 3 : 4);
        if (spec.kind === 'sit' && !front) continue;   // oturan köpeğin arka bacakları kıvrık, oynamaz
        part[i] = p; w[i] = clamp01((legTopY - y(i)) / (0.2 * H)) * seam(x(i) - mx);
        sum[p] += z(i); cnt[p]++;
      } else if (z(i) > headZ) {
        part[i] = 7; w[i] = clamp01((z(i) - headZ) / (0.12 * L));
        piv[i * 3 + 1] = bb.min.y + 0.55 * H; piv[i * 3 + 2] = headZ;
      } else if (spec.tail && z(i) < tailZ) {
        part[i] = 8; w[i] = clamp01((tailZ - z(i)) / (0.12 * L));
      }
    }
    for (let i = 0; i < n; i++) {
      const p = part[i];
      if (p >= 1 && p <= 4) { piv[i * 3 + 1] = legTopY; piv[i * 3 + 2] = sum[p] / (cnt[p] || 1); }
    }
  } else if (spec.kind === 'humanoid' || spec.kind === 'robe') {
    const armX = spec.armX * H, armMin = bb.min.y + spec.armMin * H, shY = bb.min.y + spec.shoulder * H;
    const headY = bb.min.y + spec.headY * H;
    const sum = new Array(9).fill(0), cnt = new Array(9).fill(0);
    const bx = spec.kind === 'humanoid' ? midX(bb.min.y + 0.6 * (legTopY - bb.min.y)) : xc;
    for (let i = 0; i < n; i++) {
      const dx = x(i) - bx;
      if (spec.kind === 'humanoid' && y(i) < legTopY) {
        part[i] = dx > 0 ? 1 : 2; w[i] = clamp01((legTopY - y(i)) / (0.2 * H)) * seam(dx);
      } else if (Math.abs(dx) > armX && y(i) > armMin && y(i) < headY) {
        const p = dx < 0 ? 5 : 6;
        part[i] = p; w[i] = clamp01((Math.abs(dx) - armX) / (0.06 * H));
      } else if (y(i) > headY) {
        part[i] = 7; w[i] = clamp01((y(i) - headY) / (0.05 * H));
      } else continue;
      sum[part[i]] += z(i); cnt[part[i]]++;
    }
    for (let i = 0; i < n; i++) {
      const p = part[i];
      if (!p) continue;
      const pz = sum[p] / (cnt[p] || 1);
      if (p <= 2) { piv[i * 3 + 1] = legTopY; piv[i * 3 + 2] = pz; }
      else if (p <= 6) { piv[i * 3] = bx + (p === 5 ? -armX : armX); piv[i * 3 + 1] = shY; piv[i * 3 + 2] = pz; }
      else { piv[i * 3 + 1] = headY - 0.06 * H; piv[i * 3 + 2] = pz; }
    }
  } else if (spec.kind === 'snake') {
    const headY = bb.min.y + spec.headY * H, zc = (bb.min.z + bb.max.z) / 2;
    // baş: üstte ve önde olan kısım (kıvrılıp yukarı kalkan kuyruk ucu arkada kalır)
    const isHead = (i) => y(i) > headY && z(i) > zc;
    let sz = 0, c = 0;
    for (let i = 0; i < n; i++) if (isHead(i)) { sz += z(i); c++; }
    for (let i = 0; i < n; i++) {
      if (isHead(i)) { part[i] = 7; w[i] = clamp01((y(i) - headY) / (0.1 * H)); piv[i * 3 + 1] = headY; piv[i * 3 + 2] = sz / (c || 1) - 0.1 * H; }
    }
  }
  geo.setAttribute('aPart', new THREE.BufferAttribute(part, 1));
  geo.setAttribute('aW', new THREE.BufferAttribute(w, 1));
  geo.setAttribute('aPiv', new THREE.BufferAttribute(piv, 3));
  geo.userData.rigged = { H, minY: bb.min.y };
  return geo.userData.rigged;
}

// ---------- ekran kartı kodu: bölgeleri döndür ----------
const HEAD = /* glsl */`
attribute float aPart; attribute float aW; attribute vec3 aPiv;
uniform float uTime, uMove, uAtk, uFreq, uAmp, uKind, uH, uMinY;
vec3 rotX(vec3 p, vec3 c, float a) { vec2 d = p.yz - c.yz; float s = sin(a), k = cos(a); return vec3(p.x, c.y + d.x * k - d.y * s, c.z + d.x * s + d.y * k); }
vec3 rotZ(vec3 p, vec3 c, float a) { vec2 d = p.xy - c.xy; float s = sin(a), k = cos(a); return vec3(c.x + d.x * k - d.y * s, c.y + d.x * s + d.y * k, p.z); }
`;
const BODY = /* glsl */`
#include <begin_vertex>
{
  float cyc = uTime * uFreq;
  float idle = 1.0 - uMove;
  if (aPart > 0.5 && aPart < 4.5) {
    // bacaklar: çapraz bacaklar birlikte (tırıs); insanda sol-sağ zıt
    float ph = (aPart < 1.5 || aPart > 3.5) ? 0.0 : 3.14159;
    float s = sin(cyc + ph);
    transformed = rotX(transformed, aPiv, s * uAmp * uMove * aW);
    transformed.y += max(0.0, cos(cyc + ph)) * 0.05 * uH * uMove * aW;
  } else if (aPart > 4.5 && aPart < 6.5) {
    // kollar: yürürken zıt bacakla sallanır; sağ kol saldırıda kalkar
    float right = aPart < 5.5 ? 1.0 : 0.0;
    float s = sin(cyc + (right > 0.5 ? 0.0 : 3.14159));
    if (uKind > 1.5) {
      float raise = sin(uTime * 1.8) * 0.12 + uAtk * 0.7;
      float side = right > 0.5 ? -1.0 : 1.0;
      transformed = rotZ(transformed, aPiv, side * raise * aW);
      transformed = rotX(transformed, aPiv, -uAtk * 0.9 * aW);
    } else {
      float a = s * uAmp * 0.8 * uMove + sin(uTime * 1.6 + right * 2.0) * 0.05 * idle;
      a -= uAtk * (right > 0.5 ? 1.8 : 0.35);
      transformed = rotX(transformed, aPiv, a * aW);
    }
  } else if (aPart > 6.5 && aPart < 7.5) {
    // baş: hafif nefes, yürürken sallanma, saldırıda ısırma/öne atılma
    float a = sin(uTime * 2.1) * 0.05 + sin(cyc * 2.0) * 0.05 * uMove + uAtk * 0.55;
    if (uKind > 2.5) a = sin(uTime * 1.5) * 0.08 + uAtk * 0.9;
    transformed = rotX(transformed, aPiv, a * aW);
  } else if (aPart > 7.5) {
    // kuyruk sallama
    transformed.x += sin(uTime * (5.0 + 7.0 * uMove)) * 0.12 * uH * aW;
  }
  float k = (transformed.y - uMinY) / uH;
  if (uKind > 2.5) {
    // yılan: gövde boyunca kıvrılan dalga
    transformed.x += sin(uTime * (2.0 + 5.0 * uMove) - k * 6.0) * 0.07 * uH * k;
  } else if (uKind > 1.5) {
    // cüppe eteği dalgalanır
    float e = max(0.0, 1.0 - k / 0.35);
    transformed.x += sin(uTime * 2.2 + transformed.z * 4.0) * 0.03 * uH * e;
    transformed.z += sin(uTime * 1.7 + transformed.x * 4.0) * 0.03 * uH * e;
  }
}
`;
function patch(material, u) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = HEAD + shader.vertexShader.replace('#include <begin_vertex>', BODY);
  };
  material.customProgramCacheKey = () => 'atabis-anim-' + material.type;
}

// Bir model kopyası: kendi değişkenleri (zaman, yürüme, saldırı) ve gölgesi de hareket eder
export function animatedInstance(scene, spec) {
  const holder = new THREE.Group();
  const model = scene.clone(true);
  let rigInfo = null;
  const u = { uTime: { value: 0 }, uMove: { value: 0 }, uAtk: { value: 0 }, uFreq: { value: spec.freq || 8 },
    uAmp: { value: spec.amp || 0.4 }, uKind: { value: KIND[spec.kind] || 0 }, uH: { value: 1 }, uMinY: { value: 0 } };
  model.traverse((o) => {
    if (!o.isMesh) return;
    rigInfo = rig(o.geometry, spec);
    o.material = o.material.clone();
    patch(o.material, u);
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    patch(depth, u);
    o.customDepthMaterial = depth;
    o.castShadow = true;
    o.frustumCulled = false;
  });
  if (rigInfo) { u.uH.value = rigInfo.H; u.uMinY.value = rigInfo.minY; }
  // istenen boya ölçekle, ayakları yere bas
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const k = spec.size / Math.max(0.001, box.max.y - box.min.y);
  model.scale.multiplyScalar(k);
  model.position.y -= box.min.y * k;
  holder.add(model);
  const size = spec.size;
  let move = 0;
  function update(t, moving, atk, dt) {
    move += ((moving ? 1 : 0) - move) * Math.min(1, (dt || 0.016) * 8);
    u.uTime.value = t; u.uMove.value = move; u.uAtk.value = atk || 0;
    const cyc = t * (spec.freq || 8);
    let y = 0;
    if (spec.kind === 'quad') y = Math.abs(Math.sin(cyc)) * 0.04 * size * move;
    else if (spec.kind === 'sit') y = Math.abs(Math.sin(cyc * 0.5)) * 0.18 * size * move;   // oturan köpek zıplayarak ilerler
    else if (spec.kind === 'humanoid') y = Math.abs(Math.sin(cyc)) * 0.03 * size * move;
    else if (spec.kind === 'robe') y = 0.12 * size + Math.sin(t * 1.6) * 0.05 * size;      // büyücü havada süzülür
    holder.position.y = y;
    holder.position.z = (atk || 0) * 0.18 * size;                                            // saldırıda öne atılma
    holder.rotation.x = spec.kind === 'sit' ? -Math.sin(cyc * 0.5) * 0.12 * move : 0;
  }
  return { holder, update, size };
}

// ---------- yaratık: önce kodla çizilen yedek görünür, model gelince onunla değişir ----------
export function attachMobModel(v, def) {
  const name = def.style && def.style.model;
  const spec = MOB_MODELS[name];
  if (!spec) return;
  v.height = spec.size * (def.scale || 1);
  loadModel(`models/mobs/${name}.glb`).then((scene) => {
    for (const c of [...v.root.children]) if (!c.userData.keep) v.root.remove(c);
    const inst = animatedInstance(scene, spec);
    v.root.add(inst.holder);
    const extra = v.extraAnim || [];
    v.update = (t, moving, atk, dt) => { inst.update(t, moving, atk, dt); for (const f of extra) f(t, moving); };
  }).catch((e) => console.warn('Yaratık modeli yüklenemedi:', name, e));
}

// ---------- binek atı ----------
export const MOUNT = { name: 'at', riderY: 1.08, riderZ: -0.28 };
export function attachMountModel(v) {
  const spec = MOB_MODELS.at;
  loadModel('models/mobs/at.glb').then((scene) => {
    for (const c of [...v.root.children]) if (!c.userData.keep) v.root.remove(c);
    const inst = animatedInstance(scene, spec);
    // eyer binicinin altına gelsin diye at biraz öne kaydırılır
    inst.holder.children[0].position.z += -MOUNT.riderZ;
    v.root.add(inst.holder);
    v.update = inst.update;
    v.modelLoaded = true;
    if (v.onModel) v.onModel();
  }).catch((e) => console.warn('At modeli yüklenemedi', e));
}

// ---------- silah ve zırh modelleri ----------
// grip: tutma yerinin yüksekliği (modelin boyuna oranı); len: oyundaki toplam boy (m)
export const ITEM_MODELS = {
  lav_kilic: { grip: 0.13, len: 1.2 },
  buz_balta: { grip: 0.2, len: 1.05 },
  // zırhlar: gövdeye oturacak boy (m) ve dikey kaydırma; omuzluk takılsın mı
  yelek: { armor: true, height: 0.5, y: -0.05, pads: false },
  gogusluk: { armor: true, height: 0.48, y: -0.04, pads: true },
  celik_zirh: { armor: true, height: 0.5, y: -0.02, pads: false },
};
// Modeli yüklenene kadar yedek mesh görünür; yüklenince yerine geçer
export function itemModel(key, fallback) {
  const spec = ITEM_MODELS[key];
  const g = new THREE.Group();
  if (fallback) g.add(fallback);
  if (!spec) return g;
  loadModel(`models/items/${key}.glb`).then((scene) => {
    if (fallback) g.remove(fallback);
    const m = scene.clone(true);
    m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    m.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(m);
    const h = Math.max(0.001, box.max.y - box.min.y);
    if (spec.armor) {
      const k = spec.height / h;
      m.scale.multiplyScalar(k);
      m.position.set(-(box.min.x + box.max.x) / 2 * k, -(box.min.y + h / 2) * k + spec.y, -(box.min.z + box.max.z) / 2 * k);
    } else {
      const k = spec.len / h;
      m.scale.multiplyScalar(k);
      // tutma yeri elin içine gelsin (yedek kılıçta sap -0.05'te)
      m.position.y = -(box.min.y + spec.grip * h) * k - 0.04;
    }
    g.add(m);
  }).catch((e) => console.warn('Eşya modeli yüklenemedi:', key, e));
  return g;
}
