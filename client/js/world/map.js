// Harita oluşturucu: tema, zemin, köy binaları, doğa, geçitler.
// Her harita tohumlu rastgele sayıyla kurulur, yani herkes aynı haritayı görür.
import * as THREE from 'three';
import { mat, glowMat, seededRandom } from '../util.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel } from '../entities/models.js';
import { groundTex, cobbleTex, plasterTex, woodTex, roofTex, stoneTex, boxGeo, planeGeo, texMat } from './textures.js';

const S = 2.5;
const u = (v) => v * S;
export const BOUNDS = { min: -15, max: 65 };   // loadMap her haritada günceller
export const colliders = [];   // {x0,z0,x1,z1}
export const circles = [];     // {x,z,r}

// ---------- temalar ----------
const THEMES = {
  // tek köy: karlı kış köyü, üzerine kar yağar
  village_winter: { ground: '#eef3f6', ground2: '#e6edf1', path: '#b9c3cc', plaza: '#cfd8df', sky: '#c9d6e2', fog: [40, 100], snow: true,
    village: { wall: '#e4d6bc', roofs: ['#7a3b2a', '#4a5868', '#6a4a32'], snowRoof: true }, props: { snowpine: 34, rock: 6, snowman: 4, snowpile: 14 } },
  pine_forest: { ground: '#5e8a45', ground2: '#5a8642', path: '#8a7a55', sky: '#a8c8dc', fog: [35, 95], props: { pine: 70, tree: 12, rock: 14, mushroom: 14, log: 10, m_totem: 2, m_c_yesil: 3, m_s_sarmasik: 2 } },
  // iki ayrı çöl: sarı kum tepeleri ve kızıl kanyon
  desert_dunes: { ground: '#e6c27a', ground2: '#e0bc74', path: '#cfa860', sky: '#f6e3b4', fog: [50, 125], props: { dune: 26, cactus: 34, bones: 14, sandrock: 10, palm: 6, m_boynuz: 8, m_s_isik: 4, m_c_catlak: 3 } },
  desert_canyon: { ground: '#b5562f', ground2: '#ae512c', path: '#8f4426', sky: '#e8a070', fog: [35, 100], props: { mesa: 20, canyonrock: 32, deadbush: 22, bones: 8, m_tezgah: 4, m_totem: 4, m_pano: 3, m_boynuz: 5, m_s_isik: 3, m_c_catlak: 3, m_c_kor: 2 } },
  castle: { ground: '#5a6a48', ground2: '#566645', path: '#8a877e', sky: '#9aa8b8', fog: [35, 100], props: { wallseg: 16, tower: 9, banner: 14, pine: 14, rock: 10, m_pano: 5, m_ejder_heykeli: 3, m_s_isik: 3, m_s_nobetci: 3, m_c_kizil: 2 } },
  ada: { ground: '#6f9a4c', ground2: '#678f46', path: '#b8996a', sky: '#a9cfe8', fog: [70, 170], props: { tree: 26, pine: 18, rock: 8 } },
  pagoda: { ground: '#5d7d4e', ground2: '#587849', path: '#a39a86', sky: '#8eaed6', fog: [80, 190], props: { tree: 18, pine: 16, rock: 6 } },
  arena: { ground: '#5f7a48', ground2: '#5a7444', path: '#9a978e', sky: '#9fb4c8', fog: [60, 140], props: {} },
  village_green: { ground: '#6c9b4b', ground2: '#689748', path: '#b8996a', sky: '#9cc6e4', fog: [45, 95], village: { wall: '#e6d7b6', roofs: ['#3d5a80', '#a8452f'] }, props: { tree: 14, pine: 10, rock: 6 } },
  village_pine: { ground: '#5e8a45', ground2: '#5a8642', path: '#a8895a', sky: '#a8c8dc', fog: [40, 90], village: { wall: '#d9c39a', roofs: ['#7d2f20', '#5a3d24'] }, props: { pine: 30, tree: 6, rock: 8 } },
  forest_mist: { ground: '#4f7a40', ground2: '#4b763c', path: '#7a6a4a', sky: '#b8c4c8', fog: [18, 60], props: { tree: 45, pine: 25, rock: 10, mushroom: 15, m_kokler: 8, m_diken: 6, m_s_sarmasik: 5, m_c_yesil: 4 } },
  rocky: { ground: '#8a8070', ground2: '#857b6b', path: '#a89a80', sky: '#b8c8d8', fog: [40, 100], props: { boulder: 40, rock: 30, dead: 8, m_totem: 3, m_pano: 3, m_tezgah: 2, m_s_isik: 3, m_c_element: 3 } },
  desert: { ground: '#d9b56a', ground2: '#d4b065', path: '#c9a35a', sky: '#f0d9a8', fog: [45, 110], props: { cactus: 30, sandrock: 25, bones: 6 } },
  desert_village: { ground: '#d4b06a', ground2: '#cfab65', path: '#b8955a', sky: '#f0d9a8', fog: [45, 110], village: { wall: '#e0c89a', roofs: ['#8a6440', '#c9a35a'] }, props: { cactus: 18, sandrock: 15, palm: 10 } },
  swamp: { ground: '#4a5a35', ground2: '#465631', path: '#5a4a35', sky: '#8a9a7a', fog: [15, 55], props: { dead: 30, pool: 14, reed: 30, mushroom: 10, m_balcik: 10, m_kokler: 10, m_diken: 6, m_totem: 3, m_s_sarmasik: 4, m_c_yesil: 4, m_c_nekro: 2 } },
  snow: { ground: '#e8eef2', ground2: '#e2e9ee', path: '#c8d0d8', sky: '#d8e4ee', fog: [30, 85], snow: true, props: { snowpine: 55, rock: 20, snowpile: 16, m_boynuz: 4, m_s_isik: 3, m_c_element: 4 } },
  ice_cave: { ground: '#c8dce8', ground2: '#c2d6e2', path: '#a8c0d0', sky: '#4a6a88', fog: [22, 70], snow: true, props: { crystal: 50, icerock: 30, m_s_isik: 3, m_c_element: 4 } },
  volcanic: { ground: '#3a2a24', ground2: '#362620', path: '#4a3a30', sky: '#5a3a30', fog: [25, 75], props: { lava: 14, lavarock: 35, dead: 10, m_kokler: 5, m_s_taht: 3, m_c_kor: 4, m_s_nobetci: 2 } },
  castle_town: { ground: '#6a8a50', ground2: '#66864c', path: '#9a978e', sky: '#a8b8c8', fog: [40, 95], village: { wall: '#b8b4aa', roofs: ['#2f4766', '#4a5060'] }, props: { tree: 10, tower: 6, pine: 8 } },
  ruins: { ground: '#6a6a5a', ground2: '#666656', path: '#8a8a7a', sky: '#8a8a9a', fog: [25, 75], props: { pillar: 30, dead: 20, rock: 15, m_harabe_kapi: 5, m_ejder_heykeli: 3, m_diken: 6, m_kokler: 5, m_s_kafatasi: 4, m_c_catlak: 3, m_c_nekro: 4 } },
  demon: { ground: '#3a1a1a', ground2: '#361818', path: '#4a2a2a', sky: '#2a0a0a', fog: [20, 65], props: { spike: 35, lava: 12, lavarock: 15, m_diken: 10, m_harabe_kapi: 3, m_kokler: 6, m_s_nobetci: 5, m_s_taht: 3, m_c_kizil: 5, m_c_kor: 3 } },
  dragon_valley: { ground: '#7a8a5a', ground2: '#768656', path: '#9a8a6a', sky: '#c8b8a8', fog: [35, 95], props: { boulder: 30, bones: 15, tree: 10, m_ejder_heykeli: 6, m_boynuz: 8, m_totem: 3, m_s_taht: 4, m_s_isik: 3, m_c_kor: 3 } },
  lake: { ground: '#6c9b4b', ground2: '#689748', path: '#b8996a', sky: '#a8d0e8', fog: [45, 110], props: { tree: 16, pine: 12, reed: 25, rock: 8, m_s_isik: 2 } },
  dark_throne: { ground: '#1a1a22', ground2: '#18181f', path: '#2a2a35', sky: '#1a1028', fog: [20, 65], props: { pillar: 25, darkcrystal: 30, spike: 10, m_harabe_kapi: 4, m_diken: 8, m_kokler: 6, m_s_kafatasi: 5, m_s_nobetci: 4, m_c_nekro: 6 } },
};

let group = null;
// ---------- model haritaları (köy adası, arena): zemin yüksekliği ve engel ızgarası ----------
// tools/mapglb.py üretir: h (dm), engel ve modelin kendi yüzeyi (core) RLE; ızgara model merkezine göre metre
let HM = null;
function unRle(r, n) {
  const a = new Uint8Array(n); let i = 0, v = r.start ? 1 : 0;
  for (const k of r.runs) { if (v) a.fill(1, i, i + k); i += k; v ^= 1; }
  return a;
}
function hmCell(x, z) {
  if (!HM) return -1;
  const i = Math.floor((x - HM.cx - HM.x0) / HM.cell), j = Math.floor((z - HM.cz - HM.z0) / HM.cell);
  return i < 0 || j < 0 || i >= HM.nx || j >= HM.nz ? -1 : i * HM.nz + j;
}
// yürünen zeminin yüksekliği (model haritası yoksa ya da ızgara dışında 0)
// karakter seçme sahnesi açıkken kapalı (sahne haritanın ortasında durur, yükseklik onu etkilemesin)
let GROUND_ON = true;
export function setGroundEnabled(on) { GROUND_ON = !!on; }
export function groundH(x, z) {
  if (!HM || !GROUND_ON) return 0;
  const fx = (x - HM.cx - HM.x0) / HM.cell - 0.5, fz = (z - HM.cz - HM.z0) / HM.cell - 0.5;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= HM.nx - 1 || j >= HM.nz - 1) return 0;
  const tx = fx - i, tz = fz - j, h = HM.h, n = HM.nz;
  const a = h[i * n + j], b = h[(i + 1) * n + j], c = h[i * n + j + 1], d = h[(i + 1) * n + j + 1];
  return ((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz) * HM.hScale;
}
// bu haritada yükseklik verisi var mı (yoksa yer düz, y'ye dokunulmaz)
export function hasGround() { return !!HM && GROUND_ON; }
// ev, ağaç, uçurum gibi içine yürünmeyen hücre
export function blockedAt(x, z) { const k = GROUND_ON ? hmCell(x, z) : -1; return k >= 0 && HM.block[k] === 1; }
function add(mesh, x, y, z, cast = true) {
  mesh.position.set(x, y, z);
  mesh.castShadow = cast; mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}
function box(w, h, d, color, x, y, z, cast = true) {
  return add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)), x, y, z, cast);
}
function plane(x0, z0, x1, z1, color, y, material = null) {
  const m = new THREE.Mesh(material ? planeGeo(x1 - x0, z1 - z0) : new THREE.PlaneGeometry(x1 - x0, z1 - z0), material || mat(color));
  m.rotation.x = -Math.PI / 2;
  add(m, (x0 + x1) / 2, y, (z0 + z1) / 2, false);
  return m;
}
const area = (x0, z0, x1, z1, color, y, material) => plane(u(x0), u(z0), u(x1), u(z1), color, y, material);

function roofPrism(len, depth, rh, color) {
  const sh = new THREE.Shape();
  sh.moveTo(-depth / 2, 0); sh.lineTo(depth / 2, 0); sh.lineTo(0, rh); sh.lineTo(-depth / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  return new THREE.Mesh(g, mat(color));
}
const darker = (hex, k = 0.75) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();

// ---------- köy yapıları ----------
// dokulu kutu (UV metre cinsinden)
function tbox(w, h, d, material, x, y, z, cast = true) {
  return add(new THREE.Mesh(boxGeo(w, h, d), material), x, y, z, cast);
}
const WOOD = () => texMat(woodTex('#5a3d24', 2));
const WINDOW_GLASS = () => glowMat('#ffcf7a', 0.55);
// pencere: çerçeve, ışıklı cam, kayıt, panjur ve çiçeklik; nx/nz: duvarın dışa bakan yönü
function windowAt(x, y, z, nx, nz, shutter, snow) {
  const rot = Math.atan2(nx, nz), g = new THREE.Group();
  g.position.set(x, y, z); g.rotation.y = rot; group.add(g);
  const put = (m, px, py, pz) => { m.position.set(px, py, pz); m.castShadow = false; m.receiveShadow = true; g.add(m); return m; };
  put(new THREE.Mesh(boxGeo(1.05, 1.25, 0.14), WOOD()), 0, 0, 0.02);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.02, 0.06), WINDOW_GLASS()), 0, 0, 0.07);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.02, 0.08), WOOD()), 0, 0, 0.1);
  put(new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.07, 0.08), WOOD()), 0, 0.05, 0.1);
  const sh = texMat(woodTex(shutter, 3));
  for (const sx of [-1, 1]) { const m = put(new THREE.Mesh(boxGeo(0.45, 1.2, 0.06), sh), sx * 0.78, 0, 0.08); m.rotation.y = sx * 0.25; }
  put(new THREE.Mesh(boxGeo(1.15, 0.22, 0.32), WOOD()), 0, -0.72, 0.18);
  if (snow) put(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 0.34), mat('#f4f8fb')), 0, -0.57, 0.18);
  else for (let k = 0; k < 4; k++) put(new THREE.Mesh(new THREE.SphereGeometry(0.13, 6, 5), mat(['#d9534f', '#f2c14e', '#e86aa6'][k % 3])), -0.4 + k * 0.27, -0.55, 0.2);
}
// eğik çatı: iki dokulu levha + üçgen alınlıklar + mahya + baca
function roofOn(X, Z, W, D, baseY, RH, roofColor, wall, snow, rnd) {
  const o = 0.7, half = D / 2 + o, sw = Math.hypot(half, RH) + 0.1, ang = Math.atan2(RH, half), L = W + 2 * o;
  const rm = texMat(roofTex(roofColor, snow));
  for (const sgn of [1, -1]) {
    const slab = tbox(L, 0.2, sw, rm, X + W / 2, baseY + RH / 2 + 0.05, Z + D / 2 + sgn * half / 2);
    slab.rotation.x = sgn * ang;
    // saçak tahtası
    const fas = tbox(L, 0.28, 0.12, WOOD(), X + W / 2, baseY - 0.05, Z + D / 2 + sgn * (half - 0.02), false);
    void fas;
  }
  tbox(L + 0.1, 0.26, 0.3, snow ? mat('#f4f8fb') : WOOD(), X + W / 2, baseY + RH + 0.1, Z + D / 2);
  // alınlıklar (sıva + çapraz kiriş)
  const tri = new THREE.Shape(); tri.moveTo(-D / 2, 0); tri.lineTo(D / 2, 0); tri.lineTo(0, RH); tri.lineTo(-D / 2, 0);
  const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false });
  for (const ex of [X, X + W - 0.2]) {
    const m = add(new THREE.Mesh(tg, texMat(plasterTex(wall))), ex, baseY, Z + D / 2);
    m.rotation.y = Math.PI / 2;
    const beam = tbox(0.16, RH * 0.9, 0.16, WOOD(), ex + 0.1 + (ex === X ? -0.05 : 0.15), baseY + RH * 0.45, Z + D / 2, false);
    void beam;
  }
  // baca
  const cx = X + W * (rnd() < 0.5 ? 0.22 : 0.78), cz = Z + D / 2 - half * 0.35;
  tbox(0.75, RH + 1.2, 0.75, texMat(stoneTex('#8a8278')), cx, baseY + (RH + 1.2) / 2 + 0.2, cz);
  tbox(0.95, 0.15, 0.95, mat(snow ? '#f4f8fb' : '#5a5650'), cx, baseY + RH + 1.45, cz);
}
// iki katlı yarı ahşap ev: taş temel, sıvalı duvar, ahşap kirişler, ışıklı pencereler, kapı, karlı/kiremitli çatı
function house(x, z, w, d, h, rh, roof, wall, opts = {}) {
  const X = u(x), Z = u(z), W = u(w), D = u(d), H = u(h) * 1.25, RH = u(rh) * 0.95;
  const rnd = opts.rnd || Math.random, snow = !!opts.snow, shutter = opts.shutter || '#3d6a4a';
  const plaster = texMat(plasterTex(wall)), wood = WOOD(), stoneM = texMat(stoneTex('#8d8a82'));
  const F = 0.7;                               // temel yüksekliği
  tbox(W + 0.4, F, D + 0.4, stoneM, X + W / 2, F / 2, Z + D / 2);
  const two = H >= 3.2, h1 = two ? H * 0.52 : H, h2 = H - h1, jet = two ? 0.25 : 0;
  tbox(W, h1, D, plaster, X + W / 2, F + h1 / 2, Z + D / 2);
  if (two) tbox(W, h2, D + jet * 2, plaster, X + W / 2, F + h1 + h2 / 2, Z + D / 2);
  const top = F + H;
  // kirişler: köşe dikmeleri, kat ve üst kuşak, ön ve arka yüzde çaprazlar
  const posts = Math.max(2, Math.round(W / 2.2));
  for (const zz of [Z - 0.02 - jet * 0, Z + D + 0.02]) {
    for (let i = 0; i <= posts; i++) tbox(0.2, h1, 0.12, wood, X + (W * i) / posts, F + h1 / 2, zz, false);
    tbox(W + 0.1, 0.22, 0.14, wood, X + W / 2, F + h1, zz + (zz > Z ? jet : -jet), false);
    if (two) {
      for (let i = 0; i <= posts; i++) tbox(0.2, h2, 0.12, wood, X + (W * i) / posts, F + h1 + h2 / 2, zz + (zz > Z ? jet + 0.02 : -jet - 0.02), false);
      for (let i = 0; i < posts; i += 2) {
        const bw = W / posts, br = tbox(0.14, Math.hypot(bw, h2) * 0.9, 0.1, wood, X + bw * (i + 0.5), F + h1 + h2 / 2, zz + (zz > Z ? jet + 0.03 : -jet - 0.03), false);
        br.rotation.z = Math.atan2(bw, h2) * (i % 4 ? -1 : 1);
      }
    }
  }
  for (const xx of [X - 0.02, X + W + 0.02]) for (const zz of [Z, Z + D]) tbox(0.16, H, 0.16, wood, xx, F + H / 2, zz, false);
  tbox(W + 0.2, 0.22, D + jet * 2 + 0.2, wood, X + W / 2, top - 0.1, Z + D / 2, false);
  // ön kapı: çerçeve, kapı, basamak, kapı feneri
  const doorX = X + Math.min(W * 0.28, 1.6);
  tbox(1.5, 2.45, 0.16, wood, doorX, F + 1.2, Z + D + 0.06, false);
  tbox(1.2, 2.2, 0.12, texMat(woodTex('#7a4a2a', 3)), doorX, F + 1.1, Z + D + 0.12, false);
  tbox(1.7, 0.25, 0.8, stoneM, doorX, F - 0.12, Z + D + 0.55);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.3), glowMat('#ffb347', 0.9)), doorX + 1.0, F + 2.3, Z + D + 0.25, false);
  // pencereler
  const nwin = Math.max(1, Math.floor((W - 2.4) / 2.2));
  for (let i = 0; i < nwin; i++) windowAt(X + 2.6 + i * 2.2 + 0.4, F + h1 * 0.55, Z + D + 0.08, 0, 1, shutter, snow);
  if (two) {
    const n2 = Math.max(1, Math.floor(W / 2.3));
    for (let i = 0; i < n2; i++) windowAt(X + W * (i + 0.5) / n2, F + h1 + h2 * 0.5, Z + D + jet + 0.08, 0, 1, shutter, snow);
    for (let i = 0; i < n2; i++) windowAt(X + W * (i + 0.5) / n2, F + h1 + h2 * 0.5, Z - jet - 0.08, 0, -1, shutter, snow);
  }
  windowAt(X + W + 0.08, F + h1 * 0.55, Z + D / 2, 1, 0, shutter, snow);
  windowAt(X - 0.08, F + h1 * 0.55, Z + D / 2, -1, 0, shutter, snow);
  roofOn(X, Z - jet, W, D + jet * 2, top, RH, roof, wall, snow, rnd);
  colliders.push({ x0: X - 0.5, z0: Z - 0.5, x1: X + W + 0.5, z1: Z + D + 0.5 });
}
// sokak süsleri
function barrel(X, Z, snow) {
  const m = add(new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), texMat(woodTex('#7a5232', 6))), X, 0.5, Z);
  for (const y of [0.18, 0.82]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.07, 12), mat('#3a3a3a')), X, y, Z, false);
  if (snow) add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.42, 0.08, 12), mat('#f4f8fb')), X, 1.04, Z, false);
  circles.push({ x: X, z: Z, r: 0.55 }); return m;
}
function crate(X, Z, s, snow) {
  tbox(s, s, s, texMat(woodTex('#8a6440', 4)), X, s / 2, Z);
  if (snow) box(s, 0.06, s, '#f4f8fb', X, s + 0.03, Z, false);
  circles.push({ x: X, z: Z, r: s * 0.7 });
}
function cart(X, Z, rot) {
  const g = new THREE.Group(); g.position.set(X, 0, Z); g.rotation.y = rot; group.add(g);
  const put = (m, px, py, pz) => { m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  const wd = texMat(woodTex('#7a5232', 5));
  put(new THREE.Mesh(boxGeo(2.4, 0.15, 1.3), wd), 0, 0.85, 0);
  for (const sz of [-1, 1]) put(new THREE.Mesh(boxGeo(2.4, 0.45, 0.08), wd), 0, 1.1, sz * 0.62);
  for (const sx of [-1, 1]) put(new THREE.Mesh(boxGeo(0.08, 0.45, 1.3), wd), sx * 1.18, 1.1, 0);
  for (const sz of [-1, 1]) { const w = put(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.1, 14), texMat(woodTex('#5a3d24', 8))), 0.3, 0.5, sz * 0.72); w.rotation.x = Math.PI / 2; }
  const shaft = put(new THREE.Mesh(boxGeo(1.8, 0.1, 0.1), wd), 2.0, 0.75, 0.3); shaft.rotation.z = 0.2;
  const shaft2 = put(new THREE.Mesh(boxGeo(1.8, 0.1, 0.1), wd), 2.0, 0.75, -0.3); shaft2.rotation.z = 0.2;
  for (let k = 0; k < 3; k++) put(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.5, 8), mat('#d9b55a')), -0.6 + k * 0.6, 1.15, 0).rotation.x = Math.PI / 2;
  circles.push({ x: X, z: Z, r: 1.4 });
}
function bench(X, Z, rot, snow) {
  const g = new THREE.Group(); g.position.set(X, 0, Z); g.rotation.y = rot; group.add(g);
  const wd = texMat(woodTex('#6b4a2e', 3));
  const seat = new THREE.Mesh(boxGeo(2.0, 0.1, 0.5), wd); seat.position.y = 0.5; g.add(seat);
  const back = new THREE.Mesh(boxGeo(2.0, 0.5, 0.08), wd); back.position.set(0, 0.85, -0.22); g.add(back);
  for (const sx of [-0.85, 0.85]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.45), mat('#3a3a3a')); l.position.set(sx, 0.25, 0); g.add(l); }
  if (snow) { const c = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.5), mat('#f4f8fb')); c.position.y = 0.58; g.add(c); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  circles.push({ x: X, z: Z, r: 1.0 });
}
// ---------- Türk bayrağı (2893 sayılı Kanun oranları: en G, boy 1,5G; hilal dış çember G/2, iç çember 2/5 G,
// merkezler arası G/16; yıldız çemberi G/4, bir ucu göndere bakar) ----------
let flagTex = null;
function turkFlagTex() {
  if (flagTex) return flagTex;
  const G = 512, c = document.createElement('canvas'); c.width = G * 1.5; c.height = G;
  const x = c.getContext('2d');
  x.fillStyle = '#E30A17'; x.fillRect(0, 0, c.width, G);
  const cx = G * 0.5 + G / 30, cy = G / 2;                          // dış çember merkezi: gönder tarafından G/2 (+ uçkurluk)
  x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx, cy, G / 4, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#E30A17'; x.beginPath(); x.arc(cx + G / 16, cy, G / 5, 0, Math.PI * 2); x.fill();
  const sx = cx + G / 16 - G / 5 + G / 3, R = G / 8, r = R * 0.382;   // yıldız merkezi: iç çemberin gönder tarafı kenarından G/3
  x.fillStyle = '#ffffff'; x.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI + i * Math.PI / 5, rr = i % 2 ? r : R;   // ilk uç sola (göndere) bakar
    const px = sx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
    i ? x.lineTo(px, py) : x.moveTo(px, py);
  }
  x.closePath(); x.fill();
  flagTex = new THREE.CanvasTexture(c); flagTex.colorSpace = THREE.SRGBColorSpace; flagTex.anisotropy = 4;
  return flagTex;
}
// dalgalanan bayraklar: harita her karede updateMap ile çağırır
const wavers = [];
let dynamic = [];          // köy birleştirilmeden önce ayrı tutulan hareketli parçalar
function wavingFlag(X, Y, Z, W, ry = 0) {
  const geo = new THREE.PlaneGeometry(W, W / 1.5, 28, 14);
  geo.translate(W / 2, 0, 0);                                         // gönder kenarı x=0
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: turkFlagTex(), side: THREE.DoubleSide }));
  m.position.set(X, Y, Z); m.rotation.y = ry; m.castShadow = true;
  wavers.push({ m, base: Float32Array.from(geo.attributes.position.array), W, ph: Math.random() * 6 });
  dynamic.push(m);
  return m;
}
export function updateMap(t) {
  for (const f of wavers) {
    const pos = f.m.geometry.attributes.position, b = f.base, W = f.W;
    for (let i = 0; i < pos.count; i++) {
      const x = b[i * 3], y = b[i * 3 + 1], k = x / W;                // gönderden uzaklaştıkça dalga büyür
      pos.array[i * 3 + 2] = Math.sin(x * 2.2 - t * 4.2 + f.ph + y * 0.35) * 0.32 * k + Math.sin(x * 4.1 - t * 6.3 + f.ph) * 0.08 * k;
      pos.array[i * 3 + 1] = y - k * k * 0.12 + Math.sin(x * 1.7 - t * 3.1 + f.ph) * 0.05 * k;
    }
    pos.needsUpdate = true; f.m.geometry.computeVertexNormals();
  }
}
// meydan: basamaklı taş kaide, gönder, altın alem ve dalgalanan bayrak
// meydandaki anıt panosu: çerçeveli portre (client/img/ataturk.jpg) ve künye levhası
function portraitBoard(X, Z, ry) {
  const g = new THREE.Group(), W = 1.7, Hh = W * 773 / 560;
  const tex = new THREE.TextureLoader().load('img/ataturk.jpg');
  tex.colorSpace = THREE.SRGBColorSpace;
  const gold = new THREE.MeshStandardMaterial({ color: '#d9a83e', metalness: 0.75, roughness: 0.35 }), stone = texMat(stoneTex('#9a958c'));
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.5, 1.0), stone); base.position.y = 0.25; g.add(base);
  const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), gold); post.position.y = 0.8; g.add(post);
  const cy = 1.1 + Hh / 2 + 0.2;
  const fr = new THREE.Mesh(new THREE.BoxGeometry(W + 0.3, Hh + 0.3, 0.1), gold); fr.position.set(0, cy, 0); g.add(fr);
  for (const [sz, rot] of [[0.056, 0], [-0.056, Math.PI]]) {
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: '#ffffff', emissiveIntensity: 0.55, roughness: 0.7 }));
    pic.position.set(0, cy, sz); pic.rotation.y = rot; g.add(pic);
  }
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128;
  const c = cv.getContext('2d'); c.fillStyle = '#1c1a17'; c.fillRect(0, 0, 512, 128);
  c.strokeStyle = '#d9a83e'; c.lineWidth = 4; c.strokeRect(6, 6, 500, 116);
  c.fillStyle = '#f2d98a'; c.textAlign = 'center'; c.font = 'bold 44px serif'; c.fillText('Mustafa Kemal Atatürk', 256, 60);
  c.font = '30px serif'; c.fillText('1881 – 1938', 256, 104);
  const ct = new THREE.CanvasTexture(cv); ct.colorSpace = THREE.SRGBColorSpace;
  for (const [sz, rot] of [[0.51, 0], [-0.51, Math.PI]]) {
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.5), new THREE.MeshBasicMaterial({ map: ct }));
    pl.position.set(0, 0.28, sz); pl.rotation.y = rot; g.add(pl);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  g.position.set(X, 0, Z); g.rotation.y = ry; group.add(g);
  circles.push({ x: X, z: Z, r: 1.3 });
}
function flagMonument(X, Z, snow) {
  const st = texMat(stoneTex('#9a958c'));
  [[2.3, 0.35], [1.75, 0.35], [1.2, 0.4]].reduce((y, [r, h]) => {
    add(new THREE.Mesh(new THREE.CylinderGeometry(r, r + 0.08, h, 24), st), X, y + h / 2, Z);
    if (snow) add(new THREE.Mesh(new THREE.TorusGeometry(r - 0.05, 0.07, 5, 24), mat('#f4f8fb')), X, y + h, Z, false).rotation.x = Math.PI / 2;
    return y + h;
  }, 0);
  const H = 8.5;
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, H, 12), new THREE.MeshStandardMaterial({ color: '#d8dbe0', metalness: 0.7, roughness: 0.35 })), X, 1.1 + H / 2, Z);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), new THREE.MeshStandardMaterial({ color: '#e8b54a', metalness: 0.8, roughness: 0.3 })), X, 1.1 + H + 0.15, Z);
  wavingFlag(X + 0.1, 1.1 + H - 1.5, Z, 4.2);
  circles.push({ x: X, z: Z, r: 2.4 });
  return 1.1 + H;
}
// süs ipi: sarkık ip üzerinde kırmızı-beyaz üçgen flamalar
let PENNANT = null;
function bunting(x0, y0, z0, x1, y1, z1, sag = 0.9) {
  if (!PENNANT) {
    PENNANT = new THREE.BufferGeometry();
    PENNANT.setAttribute('position', new THREE.Float32BufferAttribute([-0.22, 0, 0, 0.22, 0, 0, 0, -0.5, 0], 3));
    PENNANT.computeVertexNormals();
  }
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0), n = Math.max(4, Math.round(len / 0.75));
  const pt = (t) => [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t - Math.sin(t * Math.PI) * sag, z0 + (z1 - z0) * t];
  const UP = new THREE.Vector3(0, 1, 0);
  const rope = mat('#3a2a1c'), red = new THREE.MeshLambertMaterial({ color: '#E30A17', side: THREE.DoubleSide }), white = new THREE.MeshLambertMaterial({ color: '#f6f2ea', side: THREE.DoubleSide });
  const ry = -Math.atan2(z1 - z0, x1 - x0);
  for (let i = 0; i < n; i++) {
    const a = pt(i / n), b = pt((i + 1) / n), d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(...d);
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, l, 4), rope);
    seg.quaternion.setFromUnitVectors(UP, new THREE.Vector3(d[0] / l, d[1] / l, d[2] / l));
    add(seg, mid[0], mid[1], mid[2], false);
    const p = new THREE.Mesh(PENNANT, i % 2 ? white : red); p.rotation.y = ry; add(p, mid[0], mid[1], mid[2], false);
  }
}
function stall(X, Z, c1, c2, goods) {
  tbox(3.5, 1.75, 2.2, texMat(woodTex('#8a6440', 5)), X + 1.75, 0.875, Z + 1.1);
  tbox(3.7, 0.12, 2.4, WOOD(), X + 1.75, 1.8, Z + 1.1);
  for (const [dx, dz] of [[0.1, 0.1], [3.4, 0.1], [0.1, 2.1], [3.4, 2.1]]) tbox(0.22, 4, 0.22, WOOD(), X + dx, 2, Z + dz);
  for (let k = 0; k < 5; k++) {
    const s = box(0.8, 0.12, 3.2, k % 2 ? c2 : c1, X + 0.25 + k * 0.85, 4.05, Z + 1.1);
    s.rotation.x = -0.25;
  }
  goods.forEach((c, i) => add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 6, 5), mat(c)), X + 0.8 + i * 0.95, 1.95, Z + 1.1));
  colliders.push({ x0: X - 0.3, z0: Z - 0.3, x1: X + 3.8, z1: Z + 2.5 });
}
function lantern(X, Z) {
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 3.4, 8), mat('#2a2a2e')), X, 1.7, Z);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.25, 8), mat('#2a2a2e')), X, 0.12, Z);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.5), glowMat('#ffb347', 1)), X, 3.65, Z, false);
  add(new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.4, 4), mat('#2a2a2e')), X, 4.15, Z).rotation.y = Math.PI / 4;
  circles.push({ x: X, z: Z, r: 0.35 });
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
  blacksmith: { x: 13.6, z: 19.6, name: 'Demirci', kind: 'blacksmith' },
  cosmetic: { x: 33.5, z: 31.5, name: 'Kostümcü', kind: 'cosmetics' },
};
const LAKE_NPCS = [
  { x: 31, z: 21, name: 'Işınlayıcı', kind: 'teleport' },
  { x: 19, z: 21, name: 'Balıkçı', kind: 'fisher' },
];
// demirci köşesi: örs, yanan ocak ve kılıç askısı
function forge(x, z) {
  const iron = mat('#4a4d52'), stoneM = mat('#6d665c'), woodM = mat('#5a3d24');
  box(0.9, 0.5, 0.5, '#3a3d42', x + 1.2, 0.75, z + 0.9);                     // örs gövdesi
  box(1.2, 0.18, 0.45, '#5a5e64', x + 1.2, 1.08, z + 0.9);                   // örs yüzü
  box(0.5, 0.5, 0.5, '#5a3d24', x + 1.2, 0.25, z + 0.9);                     // kütük
  const hearth = add(new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 1.0, 8), stoneM), x - 0.4, 0.5, z - 0.6);
  void hearth;
  const coal = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.1, 8), new THREE.MeshBasicMaterial({ color: '#ff6a1f' }));
  coal.position.set(x - 0.4, 1.02, z - 0.6); group.add(coal);
  const fire = new THREE.PointLight('#ff7a2a', 6, 9, 1.8); fire.position.set(x - 0.4, 1.8, z - 0.6); group.add(fire);
  box(0.25, 2.2, 0.25, '#3a3d42', x - 0.4, 2.1, z - 0.6);                    // baca
  box(1.6, 0.12, 0.1, '#5a3d24', x + 2.6, 1.7, z - 0.4);                     // askı
  for (let i = 0; i < 3; i++) box(0.08, 1.0, 0.03, '#c9d1d9', x + 2.1 + i * 0.5, 1.15, z - 0.35);
  void iron; void woodM;
  circles.push({ x: x - 0.4, z: z - 0.6, r: 1.2 }, { x: x + 1.2, z: z + 0.9, r: 0.8 });
}
function buildVillage(th, rnd) {
  const v = th.village;
  const snow = !!v.snowRoof, cob = texMat(cobbleTex('#9a948a', snow));
  area(6.5, 6.5, 13.5, 13.5, '#9a948a', 0.03, cob);
  area(9.2, 13, 10.8, 26, th.path, 0.02, cob); area(9.2, -6, 10.8, 7, th.path, 0.02, cob);
  area(-6, 9.2, 6.5, 10.8, th.path, 0.02, cob); area(13.5, 9.2, 26, 10.8, th.path, 0.02, cob);
  const r = (i) => v.roofs[i % v.roofs.length];
  const SH = ['#3d6a4a', '#7a2f2a', '#2f4f7a'], o = (i) => ({ rnd, snow, shutter: SH[i % SH.length] });
  house(7, 2.8, 3.2, 2.2, 1.4, 1.1, r(0), v.wall, o(0));
  house(11.8, 3.2, 2.6, 2.0, 1.2, 1.0, r(1), v.wall, o(1));
  house(2.6, 11.6, 2.6, 2.2, 1.3, 1.0, r(2), v.wall, o(2));
  house(12.6, 13.6, 3.0, 2.2, 1.3, 1.1, r(0), v.wall, o(1));
  house(4.0, 15.4, 2.4, 1.9, 1.1, 0.9, r(1), v.wall, o(0));
  // meydanın tam ortasında Türk bayrağı; meydan ve sokaklar süs ipleriyle süslü
  const top = flagMonument(u(10), u(10), snow);
  portraitBoard(u(10) + 5.2, u(7.3), 0);
  // meydanın dört köşesinde altın parıltılı çağırıcı dikilitaşları
  for (const [x, z] of [[5.6, 5.6], [14.4, 5.6], [14.6, 14.8], [5.9, 14.6]]) modelProp('s_isik', u(x), u(z), rnd);
  const corners = [[6.7, 6.7], [13.3, 6.7], [13.3, 13.3], [6.7, 13.3]];
  for (const [x, z] of corners) bunting(u(10), top - 3.4, u(10), u(x), 4.1, u(z), 0.7);          // gönderden fenerlere
  corners.forEach(([x, z], i) => { const [x2, z2] = corners[(i + 1) % 4]; bunting(u(x), 4.1, u(z), u(x2), 4.1, u(z2), 0.8); });
  for (const [x, z] of corners) { add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.6, 6), mat('#c9ccd2')), u(x) + 0.05, 5.0, u(z), false); wavingFlag(u(x) + 0.08, 5.45, u(z), 1.1, Math.atan2(u(z) - u(10), u(x) - u(10)) * -1); }
  // ana sokaklar boyunca karşılıklı süs ipleri
  for (const t of [3.5, 16.5]) { bunting(u(9.0), 3.6, u(t), u(11.0), 3.6, u(t), 0.5); bunting(u(t), 3.6, u(9.0), u(t), 3.6, u(11.0), 0.5); }
  // sokak süsleri: fıçılar, sandıklar, araba, banklar
  for (const [x, z] of [[6.2, 5.6], [6.5, 6.0], [13.9, 11.6], [14.2, 12.0], [3.1, 14.6]]) barrel(u(x), u(z), snow);
  for (const [x, z, s2] of [[13.6, 6.0, 0.9], [13.9, 6.4, 0.7], [6.0, 14.6, 0.8]]) crate(u(x), u(z), s2, snow);
  cart(u(15.6), u(8.4), 0.4);
  bench(u(8.0), u(7.2), 0, snow); bench(u(12.0), u(7.2), 0, snow); bench(u(7.2), u(12.4), Math.PI, snow);
  // köy içi ağaçlar ve kar yığınları (meydanı boğmadan)
  for (const [x, z] of [[1.5, 5.5], [17.5, 3.0], [1.0, 17.5], [17.8, 17.8], [5.2, 1.2]]) (snow ? pine(u(x), u(z), '#264b2a', true) : tree(u(x), u(z)));
  if (snow) for (const [x, z, s2] of [[5.6, 6.2, 1.2], [14.6, 14.0, 1.0], [2.2, 10.4, 1.4], [16.4, 6.8, 1.1]]) snowpile(u(x), u(z), s2);
  stall(u(7.2), u(12.6), '#d9534f', '#f4efe4', ['#e5533d', '#e5533d', '#ff8a7a']);
  stall(u(13.8), u(7.3), '#3d7fc4', '#f4efe4', ['#c9d1d9', '#b08a5a', '#c9d1d9']);
  stall(18, 14.5, '#6b4a2e', '#e8b54a', ['#9aa3ad', '#e8b54a', '#8a5a34']);
  obelisk(u(11.4), u(12.6));
  forge(10.2, 17.2);
  for (const [x, z] of [[6.7, 6.7], [13.3, 6.7], [6.7, 13.3], [13.3, 13.3]]) lantern(u(x), u(z));
  if (v.snowRoof) {
    // köy meydanında kardan adamlar ve kar yığınları, evlerin önünde odun yığını
    snowman(u(8.2), u(9.0)); snowman(u(12.2), u(10.6));
    for (const [x, z] of [[7.6, 5.4], [12.8, 5.8], [3.6, 14.5], [14.6, 16.2]]) logPile(u(x), u(z));
  }
}

// ---------- büyük köy: dış ev halkası ve dört kapılı ahşap çit (Metin2 köyleri gibi geniş) ----------
const VC = 25;   // köy merkezi
function buildOuterVillage(th, rnd, R) {
  const v = th.village;
  const roof = (i) => v.roofs[i % v.roofs.length];
  // dış halka evleri: yollara (doğu-batı, kuzey-güney) denk gelmeyen açılarda
  const ring = [[28, 36], [52, 40], [75, 44], [118, 38], [145, 42], [205, 40], [232, 44], [256, 38], [300, 42], [328, 38]];
  ring.forEach(([deg, rad], i) => {
    const a = deg * Math.PI / 180, cx = VC + Math.cos(a) * rad, cz = VC + Math.sin(a) * rad;
    const w = 2.6 + rnd() * 0.8, d = 2.0 + rnd() * 0.4;
    house(cx / S - w / 2, cz / S - d / 2, w, d, 1.2 + rnd() * 0.3, 1.0, roof(i), v.wall, { rnd, snow: !!v.snowRoof, shutter: ['#3d6a4a', '#7a2f2a', '#2f4f7a'][i % 3] });
    if (i % 2 === 0) barrel(cx + w * S * 0.5 + 1.2, cz + d * S * 0.5 + 1.5, !!v.snowRoof);
    if (i % 3 === 1) crate(cx - w * S * 0.5 - 1.0, cz + d * S * 0.5 + 1.2, 0.9, !!v.snowRoof);
  });
  // tarlalar ve çit içi süsler
  for (const [deg, rad] of [[10, 50], [170, 52], [260, 50], [350, 52]]) {
    const a = deg * Math.PI / 180;
    for (let k = 0; k < 2; k++) logPile(VC + Math.cos(a) * rad + k * 3, VC + Math.sin(a) * rad);
  }
  for (const [deg, rad] of [[60, 28], [120, 30], [240, 28], [300, 30], [9, 33], [189, 33]]) {
    const a = deg * Math.PI / 180; lantern(VC + Math.cos(a) * rad, VC + Math.sin(a) * rad);
  }
  // ahşap çit: dört yolda kapı boşluğu, kapılarda kule
  const n = 64, gate = 0.12, wood = '#6b4a2e', dark = '#4a3220';
  const gates = [0, Math.PI / 2, Math.PI, Math.PI * 1.5];
  const nearGate = (a) => gates.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gate);
  for (let i = 0; i < n; i++) {
    const a0 = i / n * Math.PI * 2, a1 = (i + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
    if (nearGate(am)) continue;
    const x0 = VC + Math.cos(a0) * R, z0 = VC + Math.sin(a0) * R, x1 = VC + Math.cos(a1) * R, z1 = VC + Math.sin(a1) * R;
    const len = Math.hypot(x1 - x0, z1 - z0) + 0.2;
    const seg = tbox(len, 2.6, 0.45, texMat(woodTex(i % 2 ? wood : dark, 6)), (x0 + x1) / 2, 1.3, (z0 + z1) / 2);
    seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    const post = add(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.4, 6), mat(dark)), x0, 1.7, z0);
    if (th.snow) { const cap = box(len, 0.18, 0.6, '#f4f8fb', (x0 + x1) / 2, 2.68, (z0 + z1) / 2, false); cap.rotation.y = seg.rotation.y; }
    for (let k = 0; k <= 3; k++) { const t = k / 3; circles.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, r: 0.9 }); }
    void post;
  }
  for (const g of gates) for (const s of [-1, 1]) {
    const a = g + s * gate;
    const tx = VC + Math.cos(a) * R, tz = VC + Math.sin(a) * R;
    tbox(2.6, 2.4, 2.6, texMat(stoneTex('#8a857c')), tx, 1.2, tz);
    tbox(2.2, 3.8, 2.2, texMat(woodTex(dark, 4)), tx, 4.3, tz);
    for (const sg of [1, -1]) { const sl = tbox(3.0, 0.16, 1.9, texMat(roofTex(v.roofs[0], !!v.snowRoof)), tx, 6.75, tz + sg * 0.7); sl.rotation.x = sg * 0.75; }
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3.2, 6), mat('#c9ccd2')), tx, 7.8, tz, false);
    wavingFlag(tx + 0.07, 8.6, tz, 1.8, -a);
    circles.push({ x: tx, z: tz, r: 1.6 });
  }
}
// köprülü nehir (kışın buzlu): köprü ana yolun üstünde
function buildRiver(rv, th, bmin, bmax) {
  const x0 = rv.x - rv.w / 2, x1 = rv.x + rv.w / 2, [b0, b1] = rv.bridge;
  const len = bmax - bmin + 40;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(rv.w, len), new THREE.MeshStandardMaterial({ color: th.snow ? '#4f7f9f' : '#3d7fa8', roughness: 0.15, metalness: 0.2 }));
  water.rotation.x = -Math.PI / 2; water.position.set(rv.x, 0.04, (bmin + bmax) / 2); group.add(water);
  // kıyılar
  for (const x of [x0 - 0.6, x1 + 0.6]) box(1.4, 0.5, len, th.snow ? '#dfe8ee' : '#7a6a52', x, 0.22, (bmin + bmax) / 2, false);
  // buz parçaları
  if (th.snow) for (let i = 0; i < 40; i++) {
    const z = bmin + Math.random() * (bmax - bmin);
    if (z > b0 - 3 && z < b1 + 3) continue;
    const ice = box(1 + Math.random() * 2, 0.12, 0.8 + Math.random() * 1.5, '#e8f4ff', rv.x + (Math.random() - 0.5) * (rv.w - 3), 0.08, z, false);
    ice.rotation.y = Math.random() * 3;
  }
  // köprü: tahta döşeme, korkuluk, direkler
  const deckW = b1 - b0, deckL = rv.w + 4;
  box(deckL, 0.4, deckW, '#7a5634', rv.x, 0.45, (b0 + b1) / 2);
  for (let k = 0; k < 8; k++) box(0.15, 0.06, deckW - 0.2, '#5a3d24', rv.x - deckL / 2 + 0.8 + k * (deckL - 1.6) / 7, 0.68, (b0 + b1) / 2, false);
  for (const z of [b0 + 0.3, b1 - 0.3]) {
    box(deckL, 0.18, 0.18, '#5a3d24', rv.x, 1.5, z);
    for (let k = 0; k <= 4; k++) box(0.25, 1.3, 0.25, '#4a3220', rv.x - deckL / 2 + k * deckL / 4, 0.95, z);
  }
  // suya girilmez (köprü hariç)
  colliders.push({ x0, z0: bmin - 30, x1, z1: b0 });
  colliders.push({ x0, z0: b1, x1, z1: bmax + 30 });
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

// kullanıcının getirdiği dokulu süs modelleri: boy (m), çarpışma yarıçapı oranı (0: içinden geçilir), boy oynaması
const MODEL_PROPS = {
  diken: { h: 1.3, r: 0.35, v: 0.3 }, balcik: { h: 1.0, r: 0, v: 0.3 }, harabe_kapi: { h: 4.6, r: 0.4, v: 0.15 },
  ejder_heykeli: { h: 3.8, r: 0.35, v: 0.15 }, kokler: { h: 1.6, r: 0, v: 0.3 }, tezgah: { h: 1.2, r: 0.45, v: 0.1 },
  totem: { h: 2.6, r: 0.15, v: 0.15 }, pano: { h: 1.9, r: 0.3, v: 0.1 }, boynuz: { h: 1.0, r: 0, v: 0.3 },
  // çağırıcı (summoner) yapıları: dokusuz, yükseklik/yer boyutuna göre boyanır. tint: [taş, parıltı]
  s_nobetci: { f: 's_crimson-obsidian-sentinel', h: 3.6, r: 0.3, v: 0.2, tint: ['#2a2328', '#e0342a'] },
  s_taht: { f: 's_emberstone-throne', h: 3.4, r: 0.35, v: 0.15, tint: ['#3a2a24', '#ff7a1c'] },
  s_isik: { f: 's_radiant-obelisk', h: 3.8, r: 0.25, v: 0.2, tint: ['#8a8478', '#ffd86a'] },
  s_kafatasi: { f: 's_skullbound-obelisk', h: 3.6, r: 0.3, v: 0.2, tint: ['#4a4650', '#c9b8ff'] },
  s_sarmasik: { f: 's_verdant-spiral-obelisk', h: 3.6, r: 0.25, v: 0.2, tint: ['#4a5a44', '#5cff7a'] },
  c_kor: { f: 's_runic-ember-circle', w: 7, r: 0, v: 0.2, tint: ['#3a2a26', '#ff8a2a'] },
  c_catlak: { f: 's_cracked-runic-circle', w: 8, r: 0, v: 0.2, tint: ['#5a544c', '#ffb04a'] },
  c_nekro: { f: 's_necropolis-circle', w: 8, r: 0, v: 0.2, tint: ['#3a3640', '#b07aff'] },
  c_element: { f: 's_elemental-runic-circle', w: 8, r: 0, v: 0.2, tint: ['#5a6068', '#5ad8ff'] },
  c_yesil: { f: 's_verdant-runic-circle', w: 7, r: 0, v: 0.2, tint: ['#3e4a38', '#6aff6a'] },
  c_kizil: { f: 's_crimson-runed-circle', w: 7, r: 0, v: 0.2, tint: ['#352a2c', '#ff3a3a'] },
};
const SUM_MATS = new Map();
function paintSummon(m, cfg, key) {
  // dikey/yatay konuma göre taş + parıltı köşe renkleri; bir kez boyanır, tüm kopyalar paylaşır
  if (!SUM_MATS.has(key)) {
    SUM_MATS.set(key, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0.1, emissive: new THREE.Color(cfg.tint[1]), emissiveIntensity: 0.18 }));
  }
  const mat = SUM_MATS.get(key), A = new THREE.Color(cfg.tint[0]), B = new THREE.Color(cfg.tint[1]), c = new THREE.Color();
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.material = mat;
    const g = o.geometry; if (g.userData.painted || !g.attributes.position) return;
    g.userData.painted = true;
    g.computeBoundingBox(); const bb = g.boundingBox, P = g.attributes.position, n = P.count, col = new Float32Array(n * 3);
    const H = Math.max(bb.max.y - bb.min.y, 1e-3), cx = (bb.min.x + bb.max.x) / 2, cz = (bb.min.z + bb.max.z) / 2, R = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2 || 1;
    for (let i = 0; i < n; i++) {
      const h = (P.getY(i) - bb.min.y) / H, r = Math.hypot(P.getX(i) - cx, P.getZ(i) - cz) / R;
      let k = cfg.w ? Math.min(1, Math.max(0, (h - 0.35) / 0.5)) : Math.min(1, Math.max(0, (r - 0.55) / 0.35)) * 0.8 + Math.min(1, Math.max(0, (h - 0.55) / 0.4)) * 0.35;
      k = Math.min(1, k); c.copy(A).multiplyScalar(0.7 + 0.5 * h).lerp(B, k * 0.85);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  });
}
function modelProp(name, x, z, rnd) {
  const cfg = MODEL_PROPS[name], holder = new THREE.Group();
  holder.userData.prop = name;
  holder.rotation.y = rnd() * Math.PI * 2;
  const H = (cfg.h || cfg.w) * (1 - cfg.v / 2 + rnd() * cfg.v);
  add(holder, x, 0, z, false);
  loadModel(`models/props/${cfg.f || name}.glb`).then((src) => {
    const m = src.clone(true);
    if (cfg.tint) paintSummon(m, cfg, name);
    const bb = new THREE.Box3().setFromObject(m), size = bb.getSize(new THREE.Vector3());
    const s = H / Math.max(cfg.w ? Math.max(size.x, size.z) : size.y, 1e-3);
    m.scale.setScalar(s);
    m.position.set(-(bb.min.x + bb.max.x) / 2 * s, -bb.min.y * s, -(bb.min.z + bb.max.z) / 2 * s);
    m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.shared = true; } });
    holder.add(m);
  }).catch((e) => console.warn('Süs modeli yüklenemedi:', name, e));
  // çarpışma: modelin boyuna göre tahmini yarıçap (yükleme beklenmeden)
  if (cfg.r) circles.push({ x, z, r: (cfg.h || cfg.w) * cfg.r });
}
const PROP_BUILDERS = {
  ...Object.fromEntries(Object.keys(MODEL_PROPS).map((n) => ['m_' + n, (x, z, th, rnd) => modelProp(n, x, z, rnd)])),
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
// köyün binlerce sabit parçası malzemeye göre birleştirilir: telefonda çizim sayısı azalır
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const out = new THREE.Group(), buckets = new Map(), keep = [];
  root.traverse((o) => {
    if (!o.isMesh) { if (o !== root && (o.isLight || o.isSprite)) keep.push(o); return; }
    const key = o.material.uuid + (o.castShadow ? 's' : '');
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(o.matrixWorld);
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, list: [] });
    buckets.get(key).list.push(g);
  });
  for (const b of buckets.values()) {
    const g = mergeGeometries(b.list, false); if (!g) continue;
    const m = new THREE.Mesh(g, b.mat); m.castShadow = b.cast; m.receiveShadow = true; out.add(m);
    for (const x of b.list) x.dispose();
  }
  for (const l of keep) { const p = new THREE.Vector3(); l.getWorldPosition(p); l.parent.remove(l); l.position.copy(p); out.add(l); }
  return out;
}
// ---------- vahşi haritalarda tepeler (3D arazi) ----------
// tohumdan her açılışta aynı çıkan yumuşak tepeler; yol, geçit, doğuş ve harita kenarı düz kalır
const HILL_AMP = { rocky: 6, snow: 6.5, volcanic: 6, dragon_valley: 7, dark_throne: 5, demon: 5, castle: 4, ruins: 4, desert_dunes: 3.5,
  desert_canyon: 5, pine_forest: 3.5, forest_mist: 3, swamp: 1.2, ice_cave: 2.5 };
function makeHills(def, rnd, bmin, bmax) {
  const amp = (HILL_AMP[def.theme] || 0) * 1.6; if (!amp) return null;
  const N = 48, lat = new Float32Array(N * N);
  for (let i = 0; i < lat.length; i++) lat[i] = rnd();
  const sm = (t) => t * t * (3 - 2 * t);
  const vn = (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), tx = sm(x - xi), tz = sm(z - zi);
    const g = (a, b) => lat[((a % N) + N) % N * N + ((b % N) + N) % N];
    return (g(xi, zi) * (1 - tx) + g(xi + 1, zi) * tx) * (1 - tz) + (g(xi, zi + 1) * (1 - tx) + g(xi + 1, zi + 1) * tx) * tz;
  };
  const cell = 1.5, x0 = bmin - 35, z0 = bmin - 35, nx = Math.ceil((bmax - bmin + 70) / cell) + 1, nz = nx;
  const h = new Float32Array(nx * nz);
  const flats = [[def.spawn[0], def.spawn[1], 12], ...def.portals.map((p) => [p.x, p.z, 11])];
  const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x = x0 + (i + 0.5) * cell, z = z0 + (j + 0.5) * cell;
    let n = vn(x / 38, z / 38) * 0.62 + vn(x / 16 + 7, z / 16 + 3) * 0.28 + vn(x / 7 + 2, z / 7 + 9) * 0.1;
    n = Math.max(0, n - 0.32) / 0.68;                             // düz ovalar arasında tepeler
    let m = ss(6, 15, Math.abs(z - 25));                          // ana yol düz
    const d = Math.min(x - bmin, bmax - x, z - bmin, bmax - z);
    m *= ss(2, 12, d);                                            // harita kenarı (duvar) düz
    for (const [fx, fz, r] of flats) m *= ss(r * 0.5, r * 1.6, Math.hypot(x - fx, z - fz));
    h[i * nz + j] = n * amp * m * 10;                             // dm cinsinden (hScale 0.1)
  }
  return { cell, x0, z0, nx, nz, h, hScale: 0.1, block: new Uint8Array(nx * nz), core: new Uint8Array(nx * nz), cx: 0, cz: 0 };
}
// harita modeli (tek parça diorama) + çevresindeki yumuşak tepe eteği; yükseklik verisi gelince konumlar oturur
function buildModelMap(def, th, onReady) {
  const M = def.model, holder = new THREE.Group(), token = {};
  holder.userData.token = token; group.add(holder);
  const base = `models/maps/${M.file}`;
  fetch(base + '.json').then((r) => r.json()).then((d) => {
    if (group !== holder.parent) return;   // bu arada harita değişti
    const n = d.nx * d.nz, h = new Float32Array(d.h);
    HM = { ...d, h, block: unRle(d.block, n), core: unRle(d.core, n), cx: M.x, cz: M.z };
    // etek örgüsü: adanın dışında yerden kenara yükselen toprak; modelin kendi yüzeyinin altına gömülür
    const step = 2, sx = Math.floor((d.nx - 1) / step), sz = Math.floor((d.nz - 1) / step);
    const geo = new THREE.PlaneGeometry(sx * step * d.cell, sz * step * d.cell, sx, sz);
    geo.rotateX(-Math.PI / 2);
    const P = geo.attributes.position, ox = M.x + d.x0 + (sx * step * d.cell) / 2 + d.cell / 2, oz = M.z + d.z0 + (sz * step * d.cell) / 2 + d.cell / 2;
    for (let k = 0; k < P.count; k++) {
      const wx = P.getX(k) + ox, wz = P.getZ(k) + oz, c = hmCell(wx, wz);
      P.setY(k, c >= 0 && HM.core[c] ? groundH(wx, wz) - 2.5 : groundH(wx, wz) - 0.03);
    }
    geo.computeVertexNormals();
    const tex = groundTex(th.ground, th.ground2, !!th.snow);
    const skirt = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex }));
    skirt.position.set(ox, 0, oz); skirt.receiveShadow = true;
    holder.add(skirt);
    if (onReady) onReady();
    return loadModel(base + '.glb').then((src) => {
      if (group !== holder.parent) return;
      const m = src.clone(true);
      m.scale.setScalar(M.scale);
      m.position.set(M.x, -d.y0 * M.scale, M.z);
      m.traverse((o) => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false; o.userData.shared = true; if (o.material) o.material.side = THREE.DoubleSide; } });
      holder.add(m);
    });
  }).catch((e) => console.warn('Harita modeli yüklenemedi:', M.file, e));
}
export function loadMap(scene, def) {
  if (group) {
    scene.remove(group);
    group.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
  }
  colliders.length = 0; circles.length = 0; wavers.length = 0; dynamic = []; HM = null;
  group = new THREE.Group();
  const [bmin, bmax] = def.bounds || [-15, 65];
  BOUNDS.min = bmin; BOUNDS.max = bmax;
  const span = bmax - bmin, mid = (bmin + bmax) / 2;
  const th = THEMES[def.theme] || THEMES.village_green;
  const rnd = seededRandom(def.seed || 1);

  scene.background = new THREE.Color(th.sky);
  scene.fog = new THREE.Fog(th.sky, th.fog[0], th.fog[1]);

  // zemin: doğal gürültülü doku (çim, kar, kum, toprak)
  const gsize = span + 70;
  // vahşi haritalar düz değil: yumuşak tepeler (köy, göl, savaş ve zindan haritaları düz kalır)
  if (!def.model && !def.village && !def.safe && !def.hidden) HM = makeHills(def, seededRandom((def.seed || 1) * 13 + 5), bmin, bmax);
  let groundGeo = planeGeo(gsize, gsize);
  if (HM) {
    const seg = Math.round(gsize / 2.5);
    groundGeo = new THREE.PlaneGeometry(gsize, gsize, seg, seg);
    const uv = groundGeo.attributes.uv, P = groundGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * gsize, uv.getY(i) * gsize);
    for (let i = 0; i < P.count; i++) P.setZ(i, groundH(mid + P.getX(i), mid - P.getY(i)));
    groundGeo.computeVertexNormals();
  }
  const ground = new THREE.Mesh(groundGeo, new THREE.MeshLambertMaterial({ map: groundTex(th.ground, th.ground2, !!th.snow) }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
  add(ground, mid, 0, mid, false);
  // geçitleri birbirine bağlayan ana yol: toprak doku
  plane(bmin - 5, 23, bmax + 5, 27, th.path, 0.02, new THREE.MeshLambertMaterial({ map: groundTex(th.path, darker(th.path, 0.85), !!th.snow) }));

  const npcs = [];
  if (def.model) {
    // kullanıcının getirdiği harita modeli (köy adası / arena); kodla çizilen köy kurulmaz
    let lift = null;
    if (def.flag) {
      // meydandaki Türk bayrağı ve pano: yükseklik bilinince yerine oturur
      const main = group; group = new THREE.Group();
      const [fx, fz] = def.flag;
      flagMonument(fx, fz, !!th.snow);
      portraitBoard(fx + 4.5, fz - 1.2, 0);
      const fg = group; group = main; group.add(fg);
      lift = () => { fg.position.y = groundH(fx, fz); };
    }
    buildModelMap(def, th, lift);
    if (def.village) for (const [k, n] of Object.entries(NPC_SPOTS)) {
      const at = def.npcs && def.npcs[k];
      npcs.push(at ? { ...n, x: at[0], z: at[1] } : { ...n });
    }
  } else if (def.village && th.village) {
    const main = group; group = new THREE.Group();
    buildVillage(th, rnd);
    if (def.villageR) buildOuterVillage(th, rnd, def.villageR);
    const vg = group; group = main;
    group.add(mergeStatic(vg));
    for (const m of dynamic) group.add(m);
    for (const n of Object.values(NPC_SPOTS)) npcs.push({ ...n });
  }
  if (def.river) buildRiver(def.river, th, bmin, bmax);
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
    if (def.model && Math.hypot(x - def.model.x, z - def.model.z) < def.model.scale * 0.98 + 6) return true;
    if (z > 20 && z < 30) return true;
    if (def.village && Math.hypot(x - 25, z - 25) < (def.villageR ? def.villageR + 3 : 21)) return true;
    if (def.river && Math.abs(x - def.river.x) < def.river.w / 2 + 4) return true;
    if (def.lake && Math.hypot(x - def.lake.x, z - def.lake.z) < def.lake.r + 4) return true;
    if (Math.hypot(x - def.spawn[0], z - def.spawn[1]) < 6) return true;
    for (const p of def.portals) if (Math.hypot(x - p.x, z - p.z) < 7) return true;
    return false;
  };
  // büyük haritalarda süs sayısı alanla birlikte artar (telefon için ölçülü)
  const density = Math.max(1, Math.min(2.3, ((span + 20) / 100) ** 1.4)) * (HM && !def.model ? 1.25 : 1) * (def.metin ? 0.25 : 1);   // metin haritası: taşlara yer kalsın, süs az
  const propStart = group.children.length;
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
  // tepeli haritada süsler bulundukları yerin yüksekliğine oturur (biraz gömülü: yamaçta havada kalmasın)
  if (HM && !def.model) for (let i = propStart; i < group.children.length; i++) {
    const o = group.children[i];
    o.position.y += groundH(o.position.x, o.position.z) - 0.15;
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
