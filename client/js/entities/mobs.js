// Yaratık görünümleri: kodla kurulan, hareketli 3D şekiller.
// Her yaratık +Z yönüne bakar; update() yürüme, nefes ve saldırı hareketini oynatır.
import * as THREE from 'three';
import { mat, glowMat } from '../util.js';

const shade = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
function mesh(geo, material, x, y, z) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// ---------- dört ayaklılar: köpek, kurt, domuz, ayı, ejder gövdesi ----------
function quad(color, o = {}) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const c = mat(color), dark = mat(shade(color, 0.7));
  const L = o.len || 1.1, H = o.h || 0.55, W = o.w || 0.45, legH = o.legH || 0.45;
  body.add(mesh(B(W, H, L), c, 0, legH + H / 2, 0));
  const head = new THREE.Group(); head.position.set(0, legH + H * 0.8, L / 2 + 0.05); body.add(head);
  head.add(mesh(B(W * 0.85, H * 0.8, 0.45), c, 0, 0, 0.15));
  head.add(mesh(B(W * 0.5, H * 0.45, o.snout || 0.3), dark, 0, -0.08, 0.45));
  if (o.ears) for (const s of [-1, 1]) head.add(mesh(new THREE.ConeGeometry(0.08, 0.22, 4), dark, s * W * 0.28, H * 0.5, 0.05));
  if (o.tusks) for (const s of [-1, 1]) {
    const t = mesh(new THREE.ConeGeometry(0.035, 0.22, 4), mat('#f4efe4'), s * W * 0.25, -0.12, 0.6); t.rotation.x = -1.1; head.add(t);
  }
  if (o.eyes) for (const s of [-1, 1]) head.add(mesh(new THREE.SphereGeometry(0.04, 5, 4), glowMat(o.eyes, 1), s * W * 0.25, 0.1, 0.38));
  const legs = [];
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]]) {
    const pivot = new THREE.Group(); pivot.position.set(sx * W * 0.35, legH, sz * L * 0.35);
    pivot.add(mesh(B(0.13, legH, 0.13), dark, 0, -legH / 2, 0));
    body.add(pivot); legs.push(pivot);
  }
  let tail = null;
  if (o.tail !== false) {
    tail = new THREE.Group(); tail.position.set(0, legH + H * 0.8, -L / 2);
    const t = mesh(B(0.08, 0.08, o.tail || 0.45), c, 0, 0, -(o.tail || 0.45) / 2); t.rotation.x = 0.5; tail.add(t);
    body.add(tail);
  }
  let wings = null;
  if (o.wings) {
    wings = [];
    for (const s of [-1, 1]) {
      const w = new THREE.Group(); w.position.set(s * W * 0.5, legH + H, 0.1);
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshLambertMaterial({ color: shade(color, 0.6), side: THREE.DoubleSide }));
      wm.position.x = s * 0.8; wm.rotation.x = -Math.PI / 2; w.add(wm); body.add(w); wings.push({ w, s });
    }
  }
  if (o.neck) { head.position.z += 0.35; head.position.y += 0.35; body.add(mesh(B(W * 0.5, 0.5, 0.5), c, 0, legH + H, L / 2)); }
  return {
    root,
    update(t, moving, atk) {
      const sp = moving ? 10 : 0;
      legs.forEach((l, i) => { l.rotation.x = Math.sin(t * sp + (i % 3 ? Math.PI : 0)) * 0.6 * (moving ? 1 : 0); });
      body.position.y = moving ? Math.abs(Math.sin(t * sp)) * 0.05 : Math.sin(t * 2) * 0.015;
      head.rotation.x = -atk * 0.5;
      body.position.z = atk * 0.35;
      if (tail) tail.rotation.y = Math.sin(t * (moving ? 12 : 3)) * 0.4;
      if (wings) wings.forEach(({ w, s }) => { w.rotation.z = s * Math.sin(t * 5) * 0.5; });
    },
  };
}

// ---------- örümcek / akrep ----------
function spider(color, scorpion) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const c = mat(color), dark = mat(shade(color, 0.6));
  body.add(mesh(new THREE.SphereGeometry(0.35, 8, 6), c, 0, 0.55, 0.25));
  body.add(mesh(new THREE.SphereGeometry(scorpion ? 0.3 : 0.5, 8, 6), dark, 0, 0.6, -0.35));
  for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.06, 5, 4), glowMat('#ff3b2f', 1), s * 0.12, 0.65, 0.55));
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? -1 : 1, k = i % 4;
    const pivot = new THREE.Group(); pivot.position.set(s * 0.25, 0.55, 0.35 - k * 0.22);
    const leg = mesh(B(0.7, 0.06, 0.06), dark, s * 0.35, 0, 0); leg.rotation.z = s * -0.6;
    pivot.add(leg); body.add(pivot); legs.push(pivot);
  }
  let tail = null, claws = [];
  if (scorpion) {
    tail = new THREE.Group(); tail.position.set(0, 0.6, -0.6); body.add(tail);
    let prev = tail;
    for (let i = 0; i < 3; i++) {
      const seg = new THREE.Group(); seg.position.set(0, i ? 0.28 : 0, i ? -0.05 : 0); seg.rotation.x = -0.7;
      seg.add(mesh(new THREE.SphereGeometry(0.13, 6, 5), c, 0, 0.14, 0));
      prev.add(seg); prev = seg;
    }
    prev.add(mesh(new THREE.ConeGeometry(0.07, 0.3, 5), mat('#2a1a14'), 0, 0.35, 0.1));
    for (const s of [-1, 1]) { const cl = mesh(B(0.18, 0.12, 0.4), c, s * 0.3, 0.5, 0.7); body.add(cl); claws.push(cl); }
  }
  return {
    root,
    update(t, moving, atk) {
      legs.forEach((l, i) => { l.rotation.y = moving ? Math.sin(t * 14 + i) * 0.35 : 0; });
      body.position.y = Math.sin(t * 3) * 0.02;
      body.position.z = atk * 0.3;
      if (tail) tail.rotation.x = -atk * 0.9;
      claws.forEach((cl, i) => { cl.rotation.y = (i ? -1 : 1) * atk * 0.6; });
    },
  };
}

// ---------- golem ----------
function golem(color, glowColor) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const c = mat(color), dark = mat(shade(color, 0.7));
  body.add(mesh(B(1.0, 1.0, 0.7), c, 0, 1.6, 0));
  body.add(mesh(B(0.5, 0.45, 0.45), dark, 0, 2.35, 0.05));
  body.add(mesh(B(0.3, 0.08, 0.05), glowMat(glowColor || '#ffb347', 1), 0, 2.38, 0.29));
  const arms = [], legs = [];
  for (const s of [-1, 1]) {
    const a = new THREE.Group(); a.position.set(s * 0.7, 2.0, 0); a.add(mesh(B(0.35, 1.1, 0.35), dark, 0, -0.55, 0)); body.add(a); arms.push(a);
    const l = new THREE.Group(); l.position.set(s * 0.28, 1.1, 0); l.add(mesh(B(0.38, 1.1, 0.4), dark, 0, -0.55, 0)); body.add(l); legs.push(l);
  }
  return {
    root,
    update(t, moving, atk) {
      legs.forEach((l, i) => { l.rotation.x = moving ? Math.sin(t * 6 + i * Math.PI) * 0.4 : 0; });
      arms.forEach((a, i) => { a.rotation.x = (moving ? Math.sin(t * 6 + i * Math.PI) * 0.3 : 0) - atk * 1.6; });
      body.rotation.y = moving ? Math.sin(t * 6) * 0.05 : 0;
    },
  };
}

// ---------- solucan / yılan ----------
function worm(color) {
  const root = new THREE.Group();
  const c = mat(color), dark = mat(shade(color, 0.75));
  const segs = [];
  for (let i = 0; i < 6; i++) {
    const r = 0.38 - i * 0.04;
    const s = mesh(new THREE.SphereGeometry(r, 8, 6), i % 2 ? dark : c, 0, r, -i * 0.42);
    root.add(s); segs.push(s);
  }
  const head = segs[0];
  const fang = mesh(new THREE.ConeGeometry(0.2, 0.35, 6), mat('#2a1a14'), 0, 0, 0.35); fang.rotation.x = Math.PI / 2; head.add(fang);
  return {
    root,
    update(t, moving, atk) {
      segs.forEach((s, i) => { s.position.x = Math.sin(t * (moving ? 8 : 2) - i * 0.9) * 0.18 * (moving ? 1 : 0.4); });
      head.position.y = 0.38 + atk * 0.9 + (moving ? 0 : Math.sin(t * 2) * 0.05);
      head.position.z = atk * 0.3;
    },
  };
}

// ---------- uçan: akbaba, gargoyl ----------
function flyer(color) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const c = mat(color);
  body.add(mesh(B(0.5, 0.4, 0.9), c, 0, 0, 0));
  body.add(mesh(B(0.3, 0.3, 0.3), mat(shade(color, 1.4)), 0, 0.1, 0.55));
  const beak = mesh(new THREE.ConeGeometry(0.08, 0.25, 4), mat('#d9a521'), 0, 0.05, 0.8); beak.rotation.x = Math.PI / 2; body.add(beak);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.25, 0.1, 0);
    const wm = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), new THREE.MeshLambertMaterial({ color: shade(color, 0.8), side: THREE.DoubleSide }));
    wm.position.x = s * 0.7; wm.rotation.x = -Math.PI / 2; w.add(wm); body.add(w); wings.push({ w, s });
  }
  return {
    root,
    update(t, moving, atk) {
      body.position.y = 2.2 + Math.sin(t * 2.5) * 0.25 - atk * 1.2;
      wings.forEach(({ w, s }) => { w.rotation.z = s * Math.sin(t * (moving ? 14 : 8)) * 0.7; });
      body.rotation.x = atk * 0.6;
    },
  };
}

// ---------- hayalet / ruh / cadı ----------
function ghost(color) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const m = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.35, transparent: true, opacity: 0.8 });
  body.add(mesh(new THREE.ConeGeometry(0.6, 1.8, 10, 1, true), m, 0, 1.0, 0));
  body.add(mesh(new THREE.SphereGeometry(0.38, 10, 8), m, 0, 2.05, 0));
  for (const s of [-1, 1]) body.add(mesh(new THREE.SphereGeometry(0.07, 5, 4), glowMat('#ffffff', 1), s * 0.14, 2.1, 0.32));
  const arms = [];
  for (const s of [-1, 1]) { const a = new THREE.Group(); a.position.set(s * 0.45, 1.6, 0); a.add(mesh(B(0.15, 0.8, 0.15), m, 0, -0.4, 0)); body.add(a); arms.push(a); }
  return {
    root,
    update(t, moving, atk) {
      body.position.y = 0.3 + Math.sin(t * 2) * 0.15;
      arms.forEach((a, i) => { a.rotation.x = -0.5 - atk * 1.3 + Math.sin(t * 3 + i) * 0.1; });
      body.rotation.y = Math.sin(t * 1.3) * 0.15;
    },
  };
}

// ---------- kurbağa ----------
function frog(color) {
  const root = new THREE.Group(); const body = new THREE.Group(); root.add(body);
  const c = mat(color);
  const b = mesh(new THREE.SphereGeometry(0.6, 10, 8), c, 0, 0.5, 0); b.scale.set(1.1, 0.7, 1.2); body.add(b);
  for (const s of [-1, 1]) {
    body.add(mesh(new THREE.SphereGeometry(0.16, 8, 6), mat('#f4efe4'), s * 0.3, 0.9, 0.35));
    body.add(mesh(new THREE.SphereGeometry(0.08, 6, 5), mat('#111111'), s * 0.3, 0.92, 0.48));
    body.add(mesh(B(0.2, 0.25, 0.6), mat(shade(color, 0.7)), s * 0.55, 0.2, -0.2));
  }
  return {
    root,
    update(t, moving, atk) {
      body.position.y = moving ? Math.abs(Math.sin(t * 7)) * 0.5 : 0;
      body.scale.y = 1 - atk * 0.2;
      body.position.z = atk * 0.4;
    },
  };
}

// ---------- dışa açık: yaratık modeli seç ----------
export function buildMob(def, humanoidFactory) {
  let v;
  const col = def.color;
  switch (def.shape) {
    case 'dog': v = quad(col, { len: 0.9, h: 0.45, w: 0.38, legH: 0.4, ears: true, snout: 0.28 }); break;
    case 'wolf': v = quad(col, { len: 1.2, h: 0.55, w: 0.42, legH: 0.5, ears: true, snout: 0.38, eyes: '#ffd23f', tail: 0.6 }); break;
    case 'boar': v = quad(col, { len: 1.1, h: 0.65, w: 0.55, legH: 0.32, tusks: true, snout: 0.25, tail: 0.15 }); break;
    case 'bear': v = quad(col, { len: 1.5, h: 0.9, w: 0.8, legH: 0.55, ears: true, snout: 0.3, tail: false }); break;
    case 'dragon': v = quad(col, { len: 2.0, h: 0.8, w: 0.8, legH: 0.6, snout: 0.5, tail: 1.6, wings: true, neck: true, eyes: '#ffb347' }); break;
    case 'spider': v = spider(col, false); break;
    case 'scorpion': v = spider(col, true); break;
    case 'golem': v = golem(col); break;
    case 'worm': v = worm(col); break;
    case 'flyer': v = flyer(col); break;
    case 'ghost': v = ghost(col); break;
    case 'frog': v = frog(col); break;
    default: v = humanoidFactory ? humanoidFactory(def) : golem(col); break;
  }
  v.root.scale.multiplyScalar(def.scale || 1);
  if (def.boss) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 32), new THREE.MeshBasicMaterial({ color: '#ff3b2f', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06 / (def.scale || 1);
    v.root.add(ring);
  }
  return v;
}
