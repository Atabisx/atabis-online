// Giriş ve karakter seçme ekranının arkasındaki 3D sahne (Metin2'deki gibi):
// gece, taş bir sunak, iki yanda yanan mangallar, arkada Uzak Doğu kapısı ve dağlar.
import * as THREE from 'three';
import * as fx from './fx.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0.05, ...o });

export function buildStage() {
  const g = new THREE.Group();
  g.name = 'lobby';
  const add = (mesh, x, y, z, shadow = true) => { mesh.position.set(x, y, z); mesh.castShadow = shadow; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  // zemin: koyu çimen, sunağa giden taş yol
  const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 48), M('#1f2a1c'));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 30), M('#5a554c'));
  path.rotation.x = -Math.PI / 2; path.position.set(0, 0.02, 16); path.receiveShadow = true; g.add(path);
  // sunak: üç basamaklı sekizgen taş, altın şerit
  const stone = M('#8a8274'), dark = M('#5d574c'), gold = M('#c9a14a', { metalness: 0.7, roughness: 0.35, emissive: '#3a2a08' });
  add(new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.35, 8), dark), 0, 0.17, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.7, 0.3, 8), stone), 0, 0.5, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.8, 0.25, 8), stone), 0, 0.77, 0);
  const trim = add(new THREE.Mesh(new THREE.TorusGeometry(2.65, 0.06, 6, 8), gold), 0, 0.9, 0, false);
  trim.rotation.x = Math.PI / 2; trim.rotation.z = Math.PI / 8;
  // sunağın üstündeki parlayan büyü çemberi
  const runeTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    if (x && x.arc) {
      x.strokeStyle = '#ffd98a'; x.lineWidth = 4;
      x.beginPath(); x.arc(128, 128, 118, 0, Math.PI * 2); x.stroke();
      x.lineWidth = 2; x.beginPath(); x.arc(128, 128, 96, 0, Math.PI * 2); x.stroke();
      for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; x.beginPath(); x.moveTo(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96); x.lineTo(128 + Math.cos(a + 2.4) * 96, 128 + Math.sin(a + 2.4) * 96); x.stroke(); }
    }
    return new THREE.CanvasTexture(c);
  })();
  const rune = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ map: runeTex, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  rune.rotation.x = -Math.PI / 2; rune.position.y = 0.91; g.add(rune);
  // arkada yarım daire sütunlar ve kırmızı sancaklar
  const red = M('#8e1f18', { side: THREE.DoubleSide, emissive: '#200402' });
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (i - 2.5) * 0.42, r = 7.2, x = Math.sin(a) * r, z = Math.cos(a) * r;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 6.4, 10), stone), x, 3.2, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.3), dark), x, 6.5, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), dark), x, 0.15, z);
    if (i < 5) {
      const a2 = Math.PI + (i - 2) * 0.42, xm = Math.sin(a2) * (r - 0.2), zm = Math.cos(a2) * (r - 0.2);
      const ban = add(new THREE.Mesh(new THREE.PlaneGeometry(1.4, 3.4, 1, 6), red), xm, 4.3, zm, false);
      ban.rotation.y = a2; ban.userData.banner = true;
      const emb = add(new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), gold), xm, 4.6, zm, false);
      emb.rotation.y = a2; emb.position.x -= Math.sin(a2) * 0.02; emb.position.z -= Math.cos(a2) * 0.02;
    }
  }
  // Uzak Doğu kapısı (torii) arkada
  const wood = M('#6e1a12', { emissive: '#1a0402' });
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 9, 10), wood), -4.5, 4.5, -13);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 9, 10), wood), 4.5, 4.5, -13);
  add(new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.7, 1.0), M('#2a2420')), 0, 9.2, -13);
  add(new THREE.Mesh(new THREE.BoxGeometry(11, 0.5, 0.7), wood), 0, 7.6, -13);
  // uzak dağlar ve ay
  for (let i = 0; i < 9; i++) {
    const a = Math.PI + (i - 4) * 0.33, r = 55 + (i % 3) * 6, h = 18 + ((i * 7) % 5) * 5;
    const m = new THREE.Mesh(new THREE.ConeGeometry(14 + (i % 2) * 6, h, 6), M('#141c22'));
    m.position.set(Math.sin(a) * r, h / 2 - 1, Math.cos(a) * r); g.add(m);
  }
  const moon = new THREE.Mesh(new THREE.CircleGeometry(4, 32), new THREE.MeshBasicMaterial({ color: '#f4ecd2', fog: false }));
  moon.position.set(-18, 30, -60); g.add(moon);
  const moonGlow = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: '#8fa8d8', transparent: true, opacity: 0.18, fog: false, depthWrite: false }));
  moonGlow.position.set(-18, 30, -60.5); g.add(moonGlow);
  // mangallar ve titreyen ışıkları
  const braziers = [];
  for (const sx of [-3.6, 3.6]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 1.4, 8), dark), sx, 1.6, 2.2);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.3, 0.45, 10), gold), sx, 2.45, 2.2);
    const light = new THREE.PointLight('#ff9a3c', 18, 14, 1.6);
    light.position.set(sx, 3.2, 2.2); g.add(light);
    braziers.push({ x: sx, z: 2.2, light });
  }
  // sahneyi aydınlatan soğuk ay ışığı ve sunağa düşen sıcak ışık
  const spot = new THREE.SpotLight('#ffe2b0', 40, 20, 0.5, 0.6, 1.2);
  spot.position.set(0, 9, 5); spot.target.position.set(0, 0.8, 0); g.add(spot, spot.target);
  const state = { group: g, braziers, rune, spot, t: 0 };
  return state;
}

export function updateStage(st, dt) {
  st.t += dt;
  st.rune.rotation.z += dt * 0.15;
  st.rune.material.opacity = 0.45 + Math.sin(st.t * 1.4) * 0.12;
  for (const b of st.braziers) {
    b.light.intensity = 16 + Math.sin(st.t * 13 + b.x) * 2.5 + Math.sin(st.t * 7.3) * 2;
    if (Math.random() < 0.9) fx.emit(b.x + (Math.random() - 0.5) * 0.5, 2.7, b.z + (Math.random() - 0.5) * 0.5,
      { vy: 1.6 + Math.random(), vx: (Math.random() - 0.5) * 0.4, vz: (Math.random() - 0.5) * 0.4, color: Math.random() < 0.5 ? '#ffb347' : '#ff5a1f', size: 0.5, life: 0.6, drag: 0.5, grow: -0.6 });
  }
  // havada süzülen ateş böcekleri
  if (Math.random() < 0.35) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 9;
    fx.emit(Math.cos(a) * r, 0.5 + Math.random() * 3, Math.sin(a) * r, { vy: 0.25, vx: (Math.random() - 0.5) * 0.3, vz: (Math.random() - 0.5) * 0.3, color: '#ffe08a', size: 0.14, life: 3, drag: 0 });
  }
  for (const c of st.group.children) if (c.userData.banner) c.rotation.z = Math.sin(st.t * 1.3 + c.position.x) * 0.03;
}
