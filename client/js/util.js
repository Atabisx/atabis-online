// Ortak yardımcılar: malzeme önbelleği, tohumlu rastgele sayı
import * as THREE from 'three';

const matCache = {};
export function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache[key]) matCache[key] = new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
  return matCache[key];
}
export function glowMat(color, intensity = 0.8) {
  const key = 'glow' + color + intensity;
  if (!matCache[key]) matCache[key] = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: intensity, flatShading: true });
  return matCache[key];
}

// her harita hep aynı şekilde oluşsun diye tohumlu rastgele sayı üretici
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
