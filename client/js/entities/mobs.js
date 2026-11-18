// Yaratık görünümleri: kodla kurulan, hareketli 3D şekiller.
// Her yaratık +Z yönüne bakar; update() yürüme, nefes ve saldırı hareketini oynatır.
import * as THREE from 'three';
import { mat, glowMat } from '../util.js';
import { attachMobModel } from './models.js';

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
    anchors: { head, hp: new THREE.Vector3(0, 0, 0.15), hr: Math.max(W * 0.42, H * 0.4), hf: 0.23, back: body, bp: new THREE.Vector3(0, legH + H, 0), bl: L, bw: W },
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
    anchors: { head: body, hp: new THREE.Vector3(0, 0.6, 0.25), hr: 0.3, hf: 0.3, back: body, bp: new THREE.Vector3(0, scorpion ? 0.9 : 1.08, -0.35), bl: 0.8, bw: scorpion ? 0.6 : 0.9 },
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
    anchors: { head: body, hp: new THREE.Vector3(0, 2.35, 0.05), hr: 0.26, hf: 0.24, back: body, bp: new THREE.Vector3(0, 2.1, -0.1), bl: 0.7, bw: 1.0, shoulders: 0.7 },
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
    anchors: { head, hp: new THREE.Vector3(0, 0, 0), hr: 0.38, hf: 0.36, back: root, bp: new THREE.Vector3(0, 0.62, -1.05), bl: 2.1, bw: 0.6 },
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
    anchors: { head: body, hp: new THREE.Vector3(0, 0.1, 0.55), hr: 0.16, hf: 0.15, back: body, bp: new THREE.Vector3(0, 0.2, -0.05), bl: 0.9, bw: 0.5 },
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
    anchors: { head: body, hp: new THREE.Vector3(0, 2.05, 0), hr: 0.38, hf: 0.33, back: body, bp: new THREE.Vector3(0, 1.75, -0.12), bl: 0.6, bw: 0.85, shoulders: 0.45 },
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
    anchors: { head: body, hp: new THREE.Vector3(0, 0.82, 0.3), hr: 0.36, hf: 0.3, back: body, bp: new THREE.Vector3(0, 0.88, -0.15), bl: 1.2, bw: 1.2 },
  };
}

// ---------- boss süslemeleri ----------
// Her boss'un maps/mobs verisinde kendine has bir 'style' tanımı vardır: boynuz, taç, pelerin, kanat,
// alev, kristal, diken, yele... Bunlar yaratığın baş ve sırt noktalarına takılır, böylece aynı
// türden iki boss bile birbirine benzemez.
const HUMANOID_ANCHORS = { hp: new THREE.Vector3(0, 1.66, 0.02), hr: 0.15, hf: 0.13, bp: new THREE.Vector3(0, 1.42, -0.16), bl: 0.3, bw: 0.48, shoulders: 0.24, standing: true };
function decorate(v, style) {
  const a = v.anchors;
  const head = a.head, back = a.back;
  const hp = a.hp, hr = a.hr, bp = a.bp;
  const anim = [];
  const add = (parent, m) => { parent.add(m); return m; };
  if (style.horns) {
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(hp.x + s * hr * 0.55, hp.y + hr * 0.65, hp.z - hr * 0.1);
      const m1 = mesh(new THREE.ConeGeometry(hr * 0.24, hr * 1.1, 6), mat(style.horns), 0, hr * 0.5, 0);
      g.add(m1);
      const tip = new THREE.Group(); tip.position.y = hr * 1.0; tip.rotation.z = -s * 0.7;
      tip.add(mesh(new THREE.ConeGeometry(hr * 0.16, hr * 0.9, 6), mat(style.horns), 0, hr * 0.4, 0));
      g.add(tip);
      g.rotation.z = -s * 0.55; g.rotation.x = -0.35;
      add(head, g);
    }
  }
  if (style.crown) {
    const g = new THREE.Group(); g.position.set(hp.x, hp.y + hr * 0.95, hp.z);
    g.add(mesh(new THREE.CylinderGeometry(hr * 0.72, hr * 0.8, hr * 0.3, 10, 1, true), glowMat(style.crown, 0.4), 0, 0, 0));
    for (let i = 0; i < 6; i++) {
      const ang = i / 6 * Math.PI * 2;
      g.add(mesh(new THREE.ConeGeometry(hr * 0.13, hr * 0.5, 4), glowMat(style.crown, 0.5), Math.sin(ang) * hr * 0.74, hr * 0.38, Math.cos(ang) * hr * 0.74));
    }
    g.add(mesh(new THREE.OctahedronGeometry(hr * 0.16, 0), glowMat('#ff3b5c', 1), 0, hr * 0.05, hr * 0.8));
    add(head, g);
  }
  if (style.hat) {
    const g = new THREE.Group(); g.position.set(hp.x, hp.y + hr * 0.75, hp.z);
    g.add(mesh(new THREE.CylinderGeometry(hr * 1.7, hr * 1.7, hr * 0.08, 16), mat(style.hat), 0, 0, 0));
    const cone = mesh(new THREE.ConeGeometry(hr * 0.85, hr * 2.6, 12), mat(style.hat), 0, hr * 1.25, 0); cone.rotation.z = 0.25; g.add(cone);
    g.add(mesh(new THREE.CylinderGeometry(hr * 0.88, hr * 0.88, hr * 0.2, 12), glowMat('#6fd36f', 0.6), 0, hr * 0.12, 0));
    add(head, g);
  }
  if (style.plume) {
    const g = new THREE.Group(); g.position.set(hp.x, hp.y + hr * 0.9, hp.z - hr * 0.2);
    g.add(mesh(new THREE.CylinderGeometry(hr * 0.12, hr * 0.12, hr * 0.8, 6), mat('#c9a35a'), 0, hr * 0.4, 0));
    for (let i = 0; i < 5; i++) {
      const strand = mesh(B(hr * 0.12, hr * 0.12, hr * 2.4), mat(style.plume), (i - 2) * hr * 0.1, hr * 0.7 - i * 0.02, -hr * 1.1);
      strand.rotation.x = 0.5 + i * 0.05; g.add(strand);
    }
    add(head, g); anim.push((t) => { g.rotation.x = Math.sin(t * 3) * 0.12; });
  }
  if (style.tusks) {
    for (const s of [-1, 1]) {
      const t = mesh(new THREE.ConeGeometry(hr * 0.16, hr * 1.5, 6), mat(style.tusks), hp.x + s * hr * 0.55, hp.y - hr * 0.35, hp.z + a.hf + hr * 0.5);
      t.rotation.x = -1.0; t.rotation.z = s * 0.35; add(head, t);
    }
  }
  if (style.eyes) {
    for (const s of [-1, 1]) add(head, mesh(new THREE.SphereGeometry(hr * 0.17, 6, 5), glowMat(style.eyes, 1), hp.x + s * hr * 0.42, hp.y + hr * 0.18, hp.z + a.hf));
  }
  if (style.mane) {
    const g = new THREE.Group(); g.position.set(hp.x, hp.y, hp.z - hr * 0.7);
    for (let i = 0; i < 9; i++) {
      const ang = i / 9 * Math.PI * 2;
      g.add(mesh(new THREE.IcosahedronGeometry(hr * 0.5, 0), mat(style.mane), Math.cos(ang) * hr * 1.0, Math.sin(ang) * hr * 0.9 + hr * 0.1, 0));
    }
    add(head, g);
  }
  if (style.spikes) {
    const n = 5;
    for (let i = 0; i < n; i++) {
      const k = i / (n - 1);
      const sp = mesh(new THREE.ConeGeometry(a.bw * 0.12, a.bw * (0.55 - Math.abs(k - 0.4) * 0.4), 5), mat(style.spikes), bp.x, bp.y + a.bw * 0.15, bp.z + a.bl * (0.4 - k * 0.8));
      sp.rotation.x = -0.35; add(back, sp);
    }
  }
  if (style.plates) {
    for (let i = 0; i < 3; i++) {
      const pl = mesh(B(a.bw * 1.12, a.bw * 0.14, a.bl * 0.3), mat(style.plates), bp.x, bp.y + 0.02, bp.z + a.bl * (0.25 - i * 0.25));
      pl.rotation.x = -0.12; add(back, pl);
    }
    if (a.shoulders) for (const s of [-1, 1]) add(back, mesh(new THREE.SphereGeometry(a.bw * 0.3, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(style.plates), s * a.shoulders, bp.y + 0.02, bp.z + 0.1));
  }
  if (style.cape) {
    const len = a.standing ? 1.15 : bp.y * 0.7;
    const g = new THREE.Group(); g.position.set(bp.x, bp.y + 0.02, bp.z - 0.06);
    const cl = new THREE.Mesh(new THREE.PlaneGeometry(a.bw * 1.25, len), new THREE.MeshLambertMaterial({ color: style.cape, side: THREE.DoubleSide }));
    cl.position.y = -len / 2; cl.castShadow = true; g.add(cl);
    g.rotation.x = 0.12; add(back, g);
    anim.push((t, moving) => { g.rotation.x = 0.12 + (moving ? 0.35 + Math.sin(t * 9) * 0.08 : Math.sin(t * 1.5) * 0.04); });
  }
  if (style.wings) {
    const wings = [];
    for (const s of [-1, 1]) {
      const g = new THREE.Group(); g.position.set(bp.x + s * a.bw * 0.3, bp.y, bp.z - 0.05);
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(1.6, 0.9); sh.lineTo(1.3, 0.2); sh.lineTo(1.0, 0.45); sh.lineTo(0.7, -0.1); sh.lineTo(0.35, 0.15); sh.lineTo(0, -0.4);
      const wm = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshLambertMaterial({ color: style.wings, side: THREE.DoubleSide }));
      wm.scale.set(s, 1, 1); wm.rotation.y = s * 0.3; wm.castShadow = true;
      g.add(wm); add(back, g); wings.push({ g, s });
    }
    anim.push((t) => wings.forEach(({ g, s }) => { g.rotation.y = s * (0.5 + Math.sin(t * 3) * 0.35); }));
  }
  if (style.flames) {
    const fl = [];
    const spots = [[0, 0.1, 0.2], [-0.35, 0.05, 0], [0.35, 0.05, 0], [0, 0.05, -0.3], [0, 0.08, -0.5]];
    spots.forEach(([x, y, z], i) => {
      const f = mesh(new THREE.ConeGeometry(a.bw * 0.13, a.bw * 0.6, 6), glowMat(style.flames, 1).clone(), bp.x + x * a.bw, bp.y + y + a.bw * 0.25, bp.z + z * a.bl);
      f.material.transparent = true; f.material.opacity = 0.85; add(back, f); fl.push([f, i]);
    });
    anim.push((t) => fl.forEach(([f, i]) => { const k = 0.75 + Math.abs(Math.sin(t * 9 + i * 1.7)) * 0.5; f.scale.set(1, k, 1); }));
  }
  if (style.crystals) {
    const spots = a.shoulders ? [[-a.shoulders, 0.15, 0], [a.shoulders, 0.15, 0], [0, 0.2, -0.25]] : [[-0.3, 0.1, 0.2], [0.3, 0.1, -0.1], [0, 0.15, -0.35], [0, 0.1, 0.4]];
    for (const [x, y, z] of spots) {
      const c = mesh(new THREE.OctahedronGeometry(a.bw * 0.16, 0), glowMat(style.crystals, 0.6), bp.x + (a.shoulders ? x : x * a.bw), bp.y + y + a.bw * 0.15, bp.z + z * a.bl);
      c.scale.y = 2.2; add(back, c);
    }
  }
  if (style.orbs) {
    const g = new THREE.Group(); g.position.y = (a.standing ? 1.1 : bp.y);
    const n = 3;
    for (let i = 0; i < n; i++) {
      const o = mesh(new THREE.SphereGeometry(0.12, 8, 6), glowMat(style.orbs, 1), Math.cos(i / n * Math.PI * 2) * 0.95, 0, Math.sin(i / n * Math.PI * 2) * 0.95);
      g.add(o);
    }
    v.root.add(g);
    anim.push((t) => { g.rotation.y = t * 1.6; g.position.y = (a.standing ? 1.1 : bp.y) + Math.sin(t * 2) * 0.12; });
  }
  if (style.aura) {
    const ringMat = new THREE.MeshBasicMaterial({ color: style.aura, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const glow = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32), ringMat);
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.05;
    glow.userData.keep = true;
    v.root.add(glow);
    anim.push((t) => { const k = 1 + Math.sin(t * 2.5) * 0.12; glow.scale.set(k, k, k); ringMat.opacity = 0.25 + Math.sin(t * 2.5) * 0.1; });
  }
  v.extraAnim = anim;
  if (anim.length) {
    const base = v.update;
    v.update = (t, moving, atk, dt) => { base(t, moving, atk, dt); for (const f of anim) f(t, moving); };
  }
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
    case 'horse': v = quad(col, { len: 1.7, h: 0.75, w: 0.55, legH: 1.0, ears: true, snout: 0.45, tail: 0.8, neck: true }); break;
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
  if (def.style) {
    if (!v.anchors) v.anchors = { head: v.root, back: v.root, ...HUMANOID_ANCHORS };
    // hazır 3D modeli olan boss'lara sadece aura eklenir, model kendisi yeterince farklı
    const style = def.style.model ? { aura: def.style.aura } : def.style;
    try { decorate(v, style); } catch (e) { console.warn('Boss süsü eklenemedi', def.name, e); }
  }
  v.root.scale.multiplyScalar(def.scale || 1);
  if (def.boss) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.5, 32), new THREE.MeshBasicMaterial({ color: (def.style && def.style.aura) || '#ff3b2f', transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06 / (def.scale || 1);
    ring.userData.keep = true;
    v.root.add(ring);
  }
  if (def.style && def.style.model) attachMobModel(v, def);
  return v;
}
