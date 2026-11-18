// Harita oluşturucu: tema, zemin, köy binaları, doğa, geçitler.
// Her harita tohumlu rastgele sayıyla kurulur, yani herkes aynı haritayı görür.
import * as THREE from 'three';
import { mat, glowMat, seededRandom } from '../util.js';

const S = 2.5;
const u = (v) => v * S;
export const BOUNDS = { min: -15, max: 65 };   // loadMap her haritada günceller
export const colliders = [];   // {x0,z0,x1,z1}
export const circles = [];     // {x,z,r}

// ---------- temalar ----------
const THEMES = {
  // tek köy: karlı kış köyü, üzerine kar yağar
  village_winter: { ground: '#eef3f6', ground2: '#e6edf1', path: '#b9c3cc', plaza: '#cfd8df', sky: '#c9d6e2', fog: [40, 100], snow: true,
    village: { wall: '#d9c39a', roofs: ['#f4f8fb', '#eaf1f6'], snowRoof: true }, props: { snowpine: 34, rock: 6, snowman: 4, snowpile: 14 } },
  pine_forest: { ground: '#5e8a45', ground2: '#5a8642', path: '#8a7a55', sky: '#a8c8dc', fog: [35, 95], props: { pine: 70, tree: 12, rock: 14, mushroom: 14, log: 10 } },
  // iki ayrı çöl: sarı kum tepeleri ve kızıl kanyon
  desert_dunes: { ground: '#e6c27a', ground2: '#e0bc74', path: '#cfa860', sky: '#f6e3b4', fog: [50, 125], props: { dune: 26, cactus: 34, bones: 14, sandrock: 10, palm: 6 } },
  desert_canyon: { ground: '#b5562f', ground2: '#ae512c', path: '#8f4426', sky: '#e8a070', fog: [35, 100], props: { mesa: 20, canyonrock: 32, deadbush: 22, bones: 8 } },
  castle: { ground: '#5a6a48', ground2: '#566645', path: '#8a877e', sky: '#9aa8b8', fog: [35, 100], props: { wallseg: 16, tower: 9, banner: 14, pine: 14, rock: 10 } },
  village_green: { ground: '#6c9b4b', ground2: '#689748', path: '#b8996a', sky: '#9cc6e4', fog: [45, 95], village: { wall: '#e6d7b6', roofs: ['#3d5a80', '#a8452f'] }, props: { tree: 14, pine: 10, rock: 6 } },
  village_pine: { ground: '#5e8a45', ground2: '#5a8642', path: '#a8895a', sky: '#a8c8dc', fog: [40, 90], village: { wall: '#d9c39a', roofs: ['#7d2f20', '#5a3d24'] }, props: { pine: 30, tree: 6, rock: 8 } },
  forest_mist: { ground: '#4f7a40', ground2: '#4b763c', path: '#7a6a4a', sky: '#b8c4c8', fog: [18, 60], props: { tree: 45, pine: 25, rock: 10, mushroom: 15 } },
  rocky: { ground: '#8a8070', ground2: '#857b6b', path: '#a89a80', sky: '#b8c8d8', fog: [40, 100], props: { boulder: 40, rock: 30, dead: 8 } },
  desert: { ground: '#d9b56a', ground2: '#d4b065', path: '#c9a35a', sky: '#f0d9a8', fog: [45, 110], props: { cactus: 30, sandrock: 25, bones: 6 } },
  desert_village: { ground: '#d4b06a', ground2: '#cfab65', path: '#b8955a', sky: '#f0d9a8', fog: [45, 110], village: { wall: '#e0c89a', roofs: ['#8a6440', '#c9a35a'] }, props: { cactus: 18, sandrock: 15, palm: 10 } },
  swamp: { ground: '#4a5a35', ground2: '#465631', path: '#5a4a35', sky: '#8a9a7a', fog: [15, 55], props: { dead: 30, pool: 14, reed: 30, mushroom: 10 } },
  snow: { ground: '#e8eef2', ground2: '#e2e9ee', path: '#c8d0d8', sky: '#d8e4ee', fog: [30, 85], snow: true, props: { snowpine: 55, rock: 20, snowpile: 16 } },
  ice_cave: { ground: '#c8dce8', ground2: '#c2d6e2', path: '#a8c0d0', sky: '#4a6a88', fog: [22, 70], snow: true, props: { crystal: 50, icerock: 30 } },
  volcanic: { ground: '#3a2a24', ground2: '#362620', path: '#4a3a30', sky: '#5a3a30', fog: [25, 75], props: { lava: 14, lavarock: 35, dead: 10 } },
  castle_town: { ground: '#6a8a50', ground2: '#66864c', path: '#9a978e', sky: '#a8b8c8', fog: [40, 95], village: { wall: '#b8b4aa', roofs: ['#2f4766', '#4a5060'] }, props: { tree: 10, tower: 6, pine: 8 } },
  ruins: { ground: '#6a6a5a', ground2: '#666656', path: '#8a8a7a', sky: '#8a8a9a', fog: [25, 75], props: { pillar: 30, dead: 20, rock: 15 } },
  demon: { ground: '#3a1a1a', ground2: '#361818', path: '#4a2a2a', sky: '#2a0a0a', fog: [20, 65], props: { spike: 35, lava: 12, lavarock: 15 } },
  dragon_valley: { ground: '#7a8a5a', ground2: '#768656', path: '#9a8a6a', sky: '#c8b8a8', fog: [35, 95], props: { boulder: 30, bones: 15, tree: 10 } },
  lake: { ground: '#6c9b4b', ground2: '#689748', path: '#b8996a', sky: '#a8d0e8', fog: [45, 110], props: { tree: 16, pine: 12, reed: 25, rock: 8 } },
  dark_throne: { ground: '#1a1a22', ground2: '#18181f', path: '#2a2a35', sky: '#1a1028', fog: [20, 65], props: { pillar: 25, darkcrystal: 30, spike: 10 } },
};

let group = null;
function add(mesh, x, y, z, cast = true) {
  mesh.position.set(x, y, z);
  mesh.castShadow = cast; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function box(w, h, d, color, x, y, z, cast = true) {
  return add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)), x, y, z, cast);
}
function plane(x0, z0, x1, z1, color, y) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat(color));
  m.rotation.x = -Math.PI / 2;
  add(m, (x0 + x1) / 2, y, (z0 + z1) / 2, false);
  return m;
}
const area = (x0, z0, x1, z1, color, y) => plane(u(x0), u(z0), u(x1), u(z1), color, y);

function roofPrism(len, depth, rh, color) {
  const sh = new THREE.Shape();
  sh.moveTo(-depth / 2, 0); sh.lineTo(depth / 2, 0); sh.lineTo(0, rh); sh.lineTo(-depth / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  return new THREE.Mesh(g, mat(color));
}
const darker = (hex, k = 0.75) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// ---------- köy yapıları ----------
function house(x, z, w, d, h, rh, roof, wall) {
  const X = u(x), Z = u(z), W = u(w), D = u(d), H = u(h), RH = u(rh), o = 0.8;
  box(W + 0.4, 0.6, D + 0.4, '#8d8a82', X + W / 2, 0.3, Z + D / 2);
  box(W, H, D, wall, X + W / 2, 0.6 + H / 2, Z + D / 2);
  for (const [cx, cz] of [[X, Z], [X + W, Z], [X, Z + D], [X + W, Z + D], [X + W / 2, Z + D]]) box(0.3, H, 0.3, '#6b4a2e', cx, 0.6 + H / 2, cz);
  box(W + 0.1, 0.3, D + 0.1, '#6b4a2e', X + W / 2, 0.6 + H - 0.15, Z + D / 2);
  box(1.4, 2.4, 0.08, '#4a3221', X + W * 0.25, 1.8, Z + D + 0.05, false);
  box(1.3, 1.0, 0.08, '#2d2a26', X + W * 0.72, 0.6 + H * 0.6, Z + D + 0.05, false);
  box(0.08, 1.0, 1.3, '#2d2a26', X + W + 0.05, 0.6 + H * 0.6, Z + D / 2, false);
  add(roofPrism(W + 2 * o, D + 2 * o, RH, roof), X - o, 0.6 + H - 0.1, Z + D / 2);
  const rd = darker(roof);
  box(W + 2 * o + 0.2, 0.35, 0.35, rd, X + W / 2, 0.6 + H - 0.1 + RH, Z + D / 2);
  for (const [cx, cz] of [[X - o, Z - o], [X + W + o, Z - o], [X - o, Z + D + o], [X + W + o, Z + D + o]]) {
    add(new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.9, 5), mat(rd)), cx, 0.6 + H + 0.25, cz);
  }
  colliders.push({ x0: X - 0.5, z0: Z - 0.5, x1: X + W + 0.5, z1: Z + D + 0.5 });
}
function well(X, Z) {
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.85, 1.5, 12), mat('#85827a')), X, 0.75, Z);
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.1, 12), mat('#2e5f73')), X, 1.45, Z, false);
  box(0.3, 4, 0.3, '#6b4a2e', X - 1.5, 2, Z); box(0.3, 4, 0.3, '#6b4a2e', X + 1.5, 2, Z);
  add(roofPrism(4.4, 2.8, 1.2, '#3d5a80'), X - 2.2, 4, Z);
  circles.push({ x: X, z: Z, r: 2.3 });
}
function stall(X, Z, c1, c2, goods) {
  box(3.5, 1.75, 2.2, '#8a6440', X + 1.75, 0.875, Z + 1.1);
  for (const [dx, dz] of [[0.1, 0.1], [3.4, 0.1], [0.1, 2.1], [3.4, 2.1]]) box(0.22, 4, 0.22, '#5a3d24', X + dx, 2, Z + dz);
  for (let k = 0; k < 5; k++) {
    const s = box(0.8, 0.12, 3.2, k % 2 ? c2 : c1, X + 0.25 + k * 0.85, 4.05, Z + 1.1);
    s.rotation.x = -0.25;
  }
  goods.forEach((c, i) => add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), mat(c)), X + 0.8 + i * 0.95, 1.95, Z + 1.1));
  colliders.push({ x0: X - 0.3, z0: Z - 0.3, x1: X + 3.8, z1: Z + 2.5 });
}
function lantern(X, Z) {
  box(0.2, 3.4, 0.2, '#3a2a1c', X, 1.7, Z);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.55), glowMat('#ff9b3d')), X, 3.6, Z);
}
function obelisk(X, Z) {
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.4, 8), mat('#5a5e6a')), X, 0.2, Z);
  const o = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.9, 0), glowMat('#7fb3ff', 1)), X, 3.2, Z);
  o.scale.set(0.8, 1.8, 0.8);
  box(0.5, 2.2, 0.5, '#4a4e5a', X, 1.3, Z);
  circles.push({ x: X, z: Z, r: 1.8 });
}

// köy: ev, kuyu, dükkân tezgâhları, fenerler, ışınlayıcı
export const NPC_SPOTS = {
  market: { x: 21.5, z: 35, name: 'Market (İksir)', kind: 'potions' },
  weapons: { x: 38.5, z: 22.5, name: 'Silahçı', kind: 'weapons' },
  armor: { x: 20, z: 18.8, name: 'Zırhçı', kind: 'armor' },
  teleport: { x: 28.5, z: 33.8, name: 'Işınlayıcı', kind: 'teleport' },
  stable: { x: 15, z: 31, name: 'Seyis', kind: 'stable' },
};
const LAKE_NPCS = [
  { x: 31, z: 21, name: 'Işınlayıcı', kind: 'teleport' },
  { x: 19, z: 21, name: 'Balıkçı', kind: 'fisher' },
];
function buildVillage(th, rnd) {
  const v = th.village;
  area(6.5, 6.5, 13.5, 13.5, th.plaza || '#c7aa78', 0.03);
  area(9.2, 13, 10.8, 26, th.path, 0.02); area(9.2, -6, 10.8, 7, th.path, 0.02);
  const r = (i) => v.roofs[i % v.roofs.length];
  house(7, 2.8, 3.2, 2.2, 1.4, 1.1, r(0), v.wall);
  house(11.8, 3.2, 2.6, 2.0, 1.2, 1.0, r(1), v.wall);
  house(2.6, 11.6, 2.6, 2.2, 1.3, 1.0, r(1), v.wall);
  house(12.6, 13.6, 3.0, 2.2, 1.3, 1.1, r(0), v.wall);
  house(4.0, 15.4, 2.4, 1.9, 1.1, 0.9, r(0), v.wall);
  well(u(10), u(10));
  stall(u(7.2), u(12.6), '#d9534f', '#f4efe4', ['#e5533d', '#e5533d', '#ff8a7a']);
  stall(u(13.8), u(7.3), '#3d7fc4', '#f4efe4', ['#c9d1d9', '#b08a5a', '#c9d1d9']);
  stall(18, 14.5, '#6b4a2e', '#e8b54a', ['#9aa3ad', '#e8b54a', '#8a5a34']);
  obelisk(u(11.4), u(12.6));
  for (const [x, z] of [[6.7, 6.7], [13.3, 6.7], [6.7, 13.3], [13.3, 13.3]]) lantern(u(x), u(z));
  if (v.snowRoof) {
    // köy meydanında kardan adamlar ve kar yığınları, evlerin önünde odun yığını
    snowman(u(8.2), u(9.0)); snowman(u(12.2), u(10.6));
    for (const [x, z] of [[7.6, 5.4], [12.8, 5.8], [3.6, 14.5], [14.6, 16.2]]) logPile(u(x), u(z));
  }
}

// ---------- doğa ----------
function tree(X, Z, c1 = '#2f5a2a', c2 = '#3f7535') {
  box(0.5, 2.4, 0.5, '#5a3d24', X, 1.2, Z);
  add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.9, 0), mat(c1)), X, 3.6, Z);
  add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), mat(c2)), X - 0.5, 4.4, Z + 0.4);
  circles.push({ x: X, z: Z, r: 0.9 });
}
function pine(X, Z, color = '#264b2a', snow = false) {
  box(0.4, 1.2, 0.4, '#5a3d24', X, 0.6, Z);
  [[1.9, 1.0], [1.45, 2.4], [1.0, 3.7]].forEach(([r, y]) => {
    add(new THREE.Mesh(new THREE.ConeGeometry(r, 2.4, 7), mat(color)), X, y + 1.2, Z);
    if (snow) add(new THREE.Mesh(new THREE.ConeGeometry(r * 0.55, 0.9, 7), mat('#f4f8fb')), X, y + 2.05, Z);
  });
  circles.push({ x: X, z: Z, r: 0.8 });
}
function deadTree(X, Z, color = '#4a3a2a') {
  box(0.45, 3.4, 0.45, color, X, 1.7, Z);
  const b1 = box(0.25, 1.6, 0.25, color, X + 0.5, 3, Z); b1.rotation.z = -0.7;
  const b2 = box(0.22, 1.3, 0.22, color, X - 0.45, 2.5, Z + 0.2); b2.rotation.z = 0.8;
  circles.push({ x: X, z: Z, r: 0.6 });
}
function rock(X, Z, s, color) {
  const m = add(new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), mat(color)), X, s * 0.5, Z);
  m.scale.y = 0.7; m.rotation.y = X * 0.37;
  if (s > 0.9) circles.push({ x: X, z: Z, r: s * 0.9 });
}
function cactus(X, Z) {
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 3, 7), mat('#4f8a3a')), X, 1.5, Z);
  const a = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.2, 6), mat('#4f8a3a')), X + 0.55, 2, Z); a.rotation.z = 0.2;
  circles.push({ x: X, z: Z, r: 0.6 });
}
function palm(X, Z) {
  const t = add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 4.5, 6), mat('#8a6440')), X, 2.25, Z); t.rotation.z = 0.08;
  for (let i = 0; i < 6; i++) {
    const l = add(new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.5), mat('#4f8a3a')), X + Math.cos(i) * 0.9, 4.4, Z + Math.sin(i) * 0.9);
    l.rotation.y = -i; l.rotation.z = -0.35;
  }
  circles.push({ x: X, z: Z, r: 0.5 });
}
function crystal(X, Z, color, s = 1) {
  for (let i = 0; i < 3; i++) {
    const c = add(new THREE.Mesh(new THREE.OctahedronGeometry(0.5 * s, 0), glowMat(color, 0.5)), X + (i - 1) * 0.5 * s, 0.9 * s, Z + (i % 2) * 0.4 * s);
    c.scale.y = 2.2 - i * 0.4; c.rotation.z = (i - 1) * 0.3;
  }
  circles.push({ x: X, z: Z, r: 0.9 * s });
}
function pool(X, Z, r, color, glow) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 16), glow ? glowMat(color, 0.9) : mat(color));
  m.rotation.x = -Math.PI / 2;
  add(m, X, 0.05, Z, false);
}
function pillar(X, Z, color, broken) {
  const h = broken ? 1.5 + (X * 7 % 2.5) : 5;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.65, h, 8), mat(color)), X, h / 2, Z);
  box(1.6, 0.4, 1.6, darker(color), X, 0.2, Z);
  circles.push({ x: X, z: Z, r: 0.9 });
}
function spike(X, Z, color) {
  const s = add(new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.2, 5), mat(color)), X, 1.6, Z);
  s.rotation.z = (X % 1) * 0.3;
  circles.push({ x: X, z: Z, r: 0.6 });
}
function tower(X, Z) {
  add(new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 8, 10), mat('#9a978e')), X, 4, Z);
  add(new THREE.Mesh(new THREE.ConeGeometry(2.4, 3, 10), mat('#2f4766')), X, 9.5, Z);
  circles.push({ x: X, z: Z, r: 2.2 });
}
function bones(X, Z) {
  for (let i = 0; i < 3; i++) {
    const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 5), mat('#e8e2d0')), X + i * 0.3, 0.1, Z + (i % 2) * 0.4);
    b.rotation.z = Math.PI / 2; b.rotation.y = i;
  }
}
function mushroom(X, Z) {
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 0.6, 6), mat('#e8e2d0')), X, 0.3, Z);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.4, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), mat('#b0362b')), X, 0.55, Z);
}
function reed(X, Z) {
  for (let i = 0; i < 4; i++) {
    const r = add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 1.6, 4), mat('#6a7a40')), X + i * 0.15, 0.8, Z + (i % 2) * 0.15, false);
    r.rotation.z = (i - 1.5) * 0.12;
  }
}

function snowman(X, Z) {
  const w = mat('#f7fafc');
  add(new THREE.Mesh(new THREE.SphereGeometry(0.75, 10, 8), w), X, 0.65, Z);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), w), X, 1.6, Z);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), w), X, 2.3, Z);
  const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.35, 6), mat('#e67e22')), X, 2.3, Z + 0.45); nose.rotation.x = Math.PI / 2;
  for (const s of [-1, 1]) add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 5, 4), mat('#1a1a1a')), X + s * 0.12, 2.42, Z + 0.3);
  box(0.75, 0.08, 0.75, '#2a2a2a', X, 2.62, Z); box(0.45, 0.4, 0.45, '#2a2a2a', X, 2.84, Z);
  box(0.9, 0.12, 0.12, '#b0362b', X, 1.98, Z + 0.1);
  circles.push({ x: X, z: Z, r: 0.8 });
}
function snowpile(X, Z, s) {
  const m = add(new THREE.Mesh(new THREE.SphereGeometry(s, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#f4f8fb')), X, 0, Z, false);
  m.scale.y = 0.45;
}
function logPile(X, Z) {
  for (let i = 0; i < 3; i++) {
    const l = add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.8, 7), mat('#6b4a2e')), X, 0.22 + (i === 2 ? 0.38 : 0), Z + (i === 2 ? 0 : (i - 0.5) * 0.46));
    l.rotation.x = Math.PI / 2; l.rotation.z = Math.PI / 2;
  }
  box(1.9, 0.12, 1.1, '#f4f8fb', X, 0.82, Z, false);
}
function fallenLog(X, Z, rnd) {
  const l = add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 3.5, 8), mat('#5a3d24')), X, 0.35, Z);
  l.rotation.z = Math.PI / 2; l.rotation.y = rnd() * Math.PI;
  circles.push({ x: X, z: Z, r: 1.2 });
}
function dune(X, Z, s, color) {
  const m = add(new THREE.Mesh(new THREE.SphereGeometry(s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(color)), X, 0, Z, false);
  m.scale.set(1.6, 0.22, 1); m.rotation.y = X * 0.21;
}
// kanyon kayalığı: üst üste binmiş, yukarı doğru daralan katmanlar
function mesa(X, Z, s, rnd) {
  const cols = ['#9a4628', '#b55a33', '#8a3d22', '#c4683f'];
  let y = 0, r = s;
  const layers = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < layers; i++) {
    const h = 1.6 + rnd() * 1.6;
    const m = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, h, 7), mat(cols[i % cols.length])), X, y + h / 2, Z);
    m.rotation.y = rnd() * 3;
    y += h; r *= 0.82;
  }
  circles.push({ x: X, z: Z, r: s * 0.95 });
}
function deadBush(X, Z) {
  for (let i = 0; i < 5; i++) {
    const b = add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, 1.1, 4), mat('#5a3a22')), X, 0.45, Z, false);
    b.rotation.z = (i - 2) * 0.35; b.rotation.y = i * 1.3;
  }
}
// kale duvarı parçası (mazgallı)
function wallSeg(X, Z, rnd) {
  const g = new THREE.Group();
  const len = 6 + rnd() * 6, c = mat('#8f8b82');
  const w = new THREE.Mesh(new THREE.BoxGeometry(len, 3.6, 1.2), c); w.position.y = 1.8; w.castShadow = w.receiveShadow = true; g.add(w);
  for (let x = -len / 2 + 0.5; x < len / 2; x += 1.2) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 1.2), c); m.position.set(x, 3.95, 0); m.castShadow = true; g.add(m); }
  const ang = rnd() < 0.5 ? 0 : Math.PI / 2;
  g.rotation.y = ang; g.position.set(X, 0, Z); group.add(g);
  const hx = ang ? 0.8 : len / 2 + 0.3, hz = ang ? len / 2 + 0.3 : 0.8;
  colliders.push({ x0: X - hx, z0: Z - hz, x1: X + hx, z1: Z + hz });
}
function banner(X, Z, rnd) {
  box(0.15, 5, 0.15, '#3a2a1c', X, 2.5, Z);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.8), new THREE.MeshLambertMaterial({ color: rnd() < 0.5 ? '#8e2a21' : '#2f4766', side: THREE.DoubleSide }));
  f.position.set(X + 0.6, 4.0, Z); group.add(f);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.3, 4), mat('#e8b54a')), X, 5.15, Z);
}

const PROP_BUILDERS = {
  snowman: (x, z) => snowman(x, z),
  snowpile: (x, z, th, rnd) => snowpile(x, z, 0.9 + rnd() * 1.4),
  log: (x, z, th, rnd) => fallenLog(x, z, rnd),
  dune: (x, z, th, rnd) => dune(x, z, 4 + rnd() * 5, th.ground2),
  mesa: (x, z, th, rnd) => mesa(x, z, 2.4 + rnd() * 2.6, rnd),
  canyonrock: (x, z, th, rnd) => rock(x, z, 0.6 + rnd() * 1.5, '#8a3d22'),
  deadbush: (x, z) => deadBush(x, z),
  wallseg: (x, z, th, rnd) => wallSeg(x, z, rnd),
  banner: (x, z, th, rnd) => banner(x, z, rnd),
  tree: (x, z) => tree(x, z),
  pine: (x, z) => pine(x, z),
  snowpine: (x, z) => pine(x, z, '#2f4a3a', true),
  dead: (x, z, th) => deadTree(x, z, th.ground === '#3a2a24' ? '#2a1a14' : '#4a3a2a'),
  rock: (x, z, th, rnd) => rock(x, z, 0.5 + rnd() * 0.9, '#8d8a82'),
  boulder: (x, z, th, rnd) => rock(x, z, 1.2 + rnd() * 1.6, '#7d776a'),
  sandrock: (x, z, th, rnd) => rock(x, z, 0.8 + rnd() * 1.4, '#c9a35a'),
  icerock: (x, z, th, rnd) => rock(x, z, 0.8 + rnd() * 1.2, '#a8c8dc'),
  lavarock: (x, z, th, rnd) => rock(x, z, 0.7 + rnd() * 1.3, '#2a1a14'),
  cactus: (x, z) => cactus(x, z),
  palm: (x, z) => palm(x, z),
  crystal: (x, z, th, rnd) => crystal(x, z, '#9fd8ff', 0.8 + rnd() * 0.8),
  darkcrystal: (x, z, th, rnd) => crystal(x, z, '#8a5aff', 0.8 + rnd() * 0.9),
  lava: (x, z, th, rnd) => pool(x, z, 1.5 + rnd() * 2.5, '#ff5a1f', true),
  pool: (x, z, th, rnd) => pool(x, z, 1.5 + rnd() * 3, '#3a4a30', false),
  pillar: (x, z, th, rnd) => pillar(x, z, th.ground === '#1a1a22' ? '#2a2a35' : '#b8b4a6', rnd() < 0.6),
  spike: (x, z) => spike(x, z, '#2a0a0a'),
  tower: (x, z) => tower(x, z),
  bones: (x, z) => bones(x, z),
  mushroom: (x, z) => mushroom(x, z),
  reed: (x, z) => reed(x, z),
};

// ---------- geçitler ----------
function portalMesh(X, Z, color) {
  const g = new THREE.Group();
  const stone = mat('#6a6e78');
  const l = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 0.8), stone); l.position.set(0, 2.5, -2.2);
  const r = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5, 0.8), stone); r.position.set(0, 2.5, 2.2);
  const top = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 5.4), stone); top.position.set(0, 5.2, 0);
  const field = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 4.6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false }));
  field.rotation.y = Math.PI / 2; field.position.y = 2.4;
  g.add(l, r, top, field);
  g.position.set(X, 0, Z);
  group.add(g);
  return { group: g, field };
}

// ---------- ana fonksiyon ----------
// def: maps.json içindeki harita; sonuç: geçit listesi ve NPC'ler
export function loadMap(scene, def) {
  if (group) {
    scene.remove(group);
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  colliders.length = 0; circles.length = 0;
  group = new THREE.Group();
  const [bmin, bmax] = def.bounds || [-15, 65];
  BOUNDS.min = bmin; BOUNDS.max = bmax;
  const span = bmax - bmin, mid = (bmin + bmax) / 2;
  const th = THEMES[def.theme] || THEMES.village_green;
  const rnd = seededRandom(def.seed || 1);

  scene.background = new THREE.Color(th.sky);
  scene.fog = new THREE.Fog(th.sky, th.fog[0], th.fog[1]);

  // zemin: büyük düzlem + hafif dama deseni
  const cv = document.createElement('canvas'); cv.width = cv.height = 2;
  const cx = cv.getContext('2d');
  cx.fillStyle = th.ground; cx.fillRect(0, 0, 2, 2);
  cx.fillStyle = th.ground2; cx.fillRect(0, 0, 1, 1); cx.fillRect(1, 1, 1, 1);
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  const gsize = span + 70;
  tex.repeat.set(gsize / 12, gsize / 12);
  tex.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gsize, gsize), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2;
  add(ground, mid, 0, mid, false);
  // geçitleri birbirine bağlayan ana yol
  plane(bmin - 5, 23, bmax + 5, 27, th.path, 0.02);

  const npcs = [];
  if (def.village && th.village) {
    buildVillage(th, rnd);
    for (const n of Object.values(NPC_SPOTS)) npcs.push({ ...n });
  }
  if (def.lake) {
    const L = def.lake;
    const sand = new THREE.Mesh(new THREE.CircleGeometry(L.r + 3, 40), mat('#d9c08a'));
    sand.rotation.x = -Math.PI / 2; add(sand, L.x, 0.03, L.z, false);
    const water = new THREE.Mesh(new THREE.CircleGeometry(L.r, 40), new THREE.MeshLambertMaterial({ color: '#3f86a8', emissive: '#0d2a3a', emissiveIntensity: 0.3 }));
    water.rotation.x = -Math.PI / 2; add(water, L.x, 0.06, L.z, false);
    circles.push({ x: L.x, z: L.z, r: L.r - 1.2 });
    obelisk(LAKE_NPCS[0].x + 2.5, LAKE_NPCS[0].z - 2);
    stall(LAKE_NPCS[1].x - 3.5, LAKE_NPCS[1].z - 4.5, '#3d7fc4', '#f4efe4', ['#7fb3c4', '#7fb3c4', '#c8c0b0']);
    for (const n of LAKE_NPCS) npcs.push({ ...n });
  }

  // doğa: köy merkezinden, yoldan ve geçitlerden uzak
  const blocked = (x, z) => {
    if (z > 20 && z < 30) return true;
    if (def.village && Math.hypot(x - 25, z - 25) < 21) return true;
    if (def.lake && Math.hypot(x - def.lake.x, z - def.lake.z) < def.lake.r + 4) return true;
    if (Math.hypot(x - def.spawn[0], z - def.spawn[1]) < 6) return true;
    for (const p of def.portals) if (Math.hypot(x - p.x, z - p.z) < 7) return true;
    return false;
  };
  // büyük haritalarda süs sayısı alanla birlikte artar (telefon için ölçülü)
  const density = Math.max(1, Math.min(1.9, ((span + 20) / 100) ** 1.4));
  for (const [kind, base] of Object.entries(th.props)) {
    const build = PROP_BUILDERS[kind];
    if (!build) continue;
    const count = Math.round(base * density);
    let placed = 0, tries = 0;
    while (placed < count && tries < count * 20) {
      tries++;
      const x = bmin - 10 + rnd() * (span + 20), z = bmin - 10 + rnd() * (span + 20);
      if (blocked(x, z)) continue;
      build(x, z, th, rnd);
      placed++;
    }
  }

  // harita kenarını belli eden alçak duvar
  const edge = '#' + new THREE.Color(th.ground).multiplyScalar(0.6).getHexString();
  const a = bmin - 1, b = bmax + 1;
  for (const [x0, z0, x1, z1] of [[a, a, b, bmin], [a, bmax, b, b], [a, bmin, bmin, 21.5], [a, 28.5, bmin, bmax], [bmax, bmin, b, 21.5], [bmax, 28.5, b, bmax]]) {
    box(x1 - x0, 1.2, z1 - z0, edge, (x0 + x1) / 2, 0.6, (z0 + z1) / 2);
  }

  const portals = def.portals.map((p) => ({ ...p, ...portalMesh(p.x, p.z, '#7fb3ff') }));
  scene.add(group);
  return { portals, npcs, weather: th.snow ? 'snow' : null };
}
