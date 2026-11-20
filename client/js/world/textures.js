// Kodla çizilen dokular (indirme gerektirmez): zemin, taş döşeme, sıva, ahşap, kiremit, taş duvar, kar.
// Her doku bir kez çizilip önbellekte tutulur. UV'ler metre cinsinden: repeat = 1 / dokunun kapladığı metre.
import * as THREE from 'three';

const cache = {};
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const C = (hex) => new THREE.Color(hex);
const css = (c, k = 1) => `rgb(${Math.round(Math.min(1, c.r * k) * 255)},${Math.round(Math.min(1, c.g * k) * 255)},${Math.round(Math.min(1, c.b * k) * 255)})`;
function canvas(n) { const cv = document.createElement('canvas'); cv.width = cv.height = n; return [cv, cv.getContext('2d')]; }
function finish(cv, metres) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; t.repeat.set(1 / metres, 1 / metres);
  return t;
}
// yumuşak değer gürültüsü (döşenebilir)
function noiseLayer(ctx, n, cells, color, alpha, seed) {
  const r = rng(seed), g = [];
  for (let i = 0; i < cells * cells; i++) g.push(r());
  const img = ctx.getImageData(0, 0, n, n), d = img.data, s = n / cells;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = x / s, fy = y / s, x0 = Math.floor(fx) % cells, y0 = Math.floor(fy) % cells, x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
    const tx = fx - Math.floor(fx), ty = fy - Math.floor(fy), sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const v = (g[y0 * cells + x0] * (1 - sx) + g[y0 * cells + x1] * sx) * (1 - sy) + (g[y1 * cells + x0] * (1 - sx) + g[y1 * cells + x1] * sx) * sy;
    const a = alpha * v, i = (y * n + x) * 4;
    d[i] += (color.r * 255 - d[i]) * a; d[i + 1] += (color.g * 255 - d[i + 1]) * a; d[i + 2] += (color.b * 255 - d[i + 2]) * a;
  }
  ctx.putImageData(img, 0, 0);
}
function speckle(ctx, n, count, colors, size, seed) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) { ctx.fillStyle = colors[Math.floor(r() * colors.length)]; const s = size * (0.5 + r()); ctx.fillRect(r() * n, r() * n, s, s); }
}
function get(key, make) { return cache[key] || (cache[key] = make()); }

// zemin: iki tonlu doğal gürültü + benekler (çim, kar, kum, toprak)
export function groundTex(c1, c2, snow = false) {
  return get(`g${c1}${c2}${snow}`, () => {
    const n = 512, [cv, ctx] = canvas(n);
    ctx.fillStyle = c1; ctx.fillRect(0, 0, n, n);
    noiseLayer(ctx, n, 4, C(c2).multiplyScalar(0.92), 0.9, 11);
    noiseLayer(ctx, n, 16, C(c1).multiplyScalar(snow ? 0.94 : 0.85), 0.55, 12);
    noiseLayer(ctx, n, 64, C(c2).multiplyScalar(snow ? 1.03 : 1.1), 0.35, 13);
    if (snow) speckle(ctx, n, 900, ['rgba(255,255,255,.9)', 'rgba(200,215,230,.6)'], 1.6, 14);
    else speckle(ctx, n, 2200, [css(C(c1), 0.7), css(C(c2), 1.25), css(C(c1), 1.15)], 2.2, 14);
    return finish(cv, 14);
  });
}
// taş döşeme (meydan, yollar): düzensiz sıralı taşlar, harç; kışın aralar karlı
export function cobbleTex(color, snow = false) {
  return get(`c${color}${snow}`, () => {
    const n = 512, [cv, ctx] = canvas(n), r = rng(21), base = C(color);
    ctx.fillStyle = snow ? '#e9eef2' : css(base, 0.55); ctx.fillRect(0, 0, n, n);
    const rows = 10, h = n / rows;
    for (let y = 0; y < rows; y++) {
      let x = (y % 2) * h * 0.5 - h;
      while (x < n) {
        const w = h * (0.8 + r() * 0.7), k = 0.8 + r() * 0.4;
        ctx.fillStyle = css(base, k); const pad = 3 + r() * 2;
        const rx = x + pad, ry = y * h + pad, rw = w - pad * 2, rh = h - pad * 2, rad = 7;
        ctx.beginPath(); ctx.moveTo(rx + rad, ry); ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rad); ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rad);
        ctx.arcTo(rx, ry + rh, rx, ry, rad); ctx.arcTo(rx, ry, rx + rw, ry, rad); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(rx + 3, ry + 2, rw - 6, 3);          // üst ışık
        ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(rx + 3, ry + rh - 4, rw - 6, 3);           // alt gölge
        x += w;
      }
    }
    noiseLayer(ctx, n, 8, C('#000000'), 0.12, 22);
    if (snow) { noiseLayer(ctx, n, 6, C('#f4f8fb'), 0.55, 23); speckle(ctx, n, 500, ['rgba(255,255,255,.85)'], 2, 24); }
    return finish(cv, 6);
  });
}
// sıva: kirli beyaz, lekeli
export function plasterTex(color) {
  return get(`p${color}`, () => {
    const n = 256, [cv, ctx] = canvas(n), c = C(color);
    ctx.fillStyle = color; ctx.fillRect(0, 0, n, n);
    noiseLayer(ctx, n, 8, c.clone().multiplyScalar(0.86), 0.6, 31);
    noiseLayer(ctx, n, 32, c.clone().multiplyScalar(1.08), 0.4, 32);
    speckle(ctx, n, 700, [css(c, 0.8), css(c, 1.1)], 1.4, 33);
    return finish(cv, 3);
  });
}
// ahşap: dikey tahtalar, damarlı
export function woodTex(color, planks = 4) {
  return get(`w${color}${planks}`, () => {
    const n = 256, [cv, ctx] = canvas(n), c = C(color), r = rng(41);
    const pw = n / planks;
    for (let i = 0; i < planks; i++) {
      ctx.fillStyle = css(c, 0.85 + r() * 0.3); ctx.fillRect(i * pw, 0, pw, n);
      for (let g = 0; g < 9; g++) { ctx.strokeStyle = `rgba(0,0,0,${0.08 + r() * 0.1})`; ctx.lineWidth = 1 + r() * 1.5; const gx = i * pw + r() * pw; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.bezierCurveTo(gx + 6 * (r() - 0.5), n * 0.3, gx + 8 * (r() - 0.5), n * 0.7, gx, n); ctx.stroke(); }
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(i * pw, 0, 2.5, n);
      if (r() < 0.6) { ctx.fillStyle = 'rgba(40,20,10,0.5)'; ctx.beginPath(); ctx.ellipse(i * pw + pw * (0.3 + r() * 0.4), r() * n, 4, 7, 0, 0, 7); ctx.fill(); }
    }
    return finish(cv, 2);
  });
}
// kiremit / kiremit üstü kar
export function roofTex(color, snow = false) {
  return get(`r${color}${snow}`, () => {
    const n = 256, [cv, ctx] = canvas(n), c = C(color), r = rng(51);
    ctx.fillStyle = css(c, 0.6); ctx.fillRect(0, 0, n, n);
    const rows = 8, h = n / rows, w = n / 8;
    for (let y = 0; y < rows; y++) for (let x = -1; x < 9; x++) {
      const ox = (y % 2) * w * 0.5;
      ctx.fillStyle = css(c, 0.82 + r() * 0.3);
      ctx.beginPath(); ctx.moveTo(x * w + ox + 1, y * h); ctx.lineTo(x * w + ox + w - 1, y * h);
      ctx.lineTo(x * w + ox + w - 1, y * h + h * 0.75); ctx.quadraticCurveTo(x * w + ox + w / 2, y * h + h + 4, x * w + ox + 1, y * h + h * 0.75); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x * w + ox + 1, y * h + h - 3, w - 2, 3);
    }
    if (snow) {
      // kalın kar örtüsü: kiremit sıraları hafifçe belli, kenarları gölgeli
      ctx.fillStyle = 'rgba(240,245,250,0.9)'; ctx.fillRect(0, 0, n, n);
      for (let y = 0; y < rows; y++) { ctx.fillStyle = 'rgba(150,170,190,0.22)'; ctx.fillRect(0, y * h + h - 4, n, 4); }
      noiseLayer(ctx, n, 16, C('#d8e2ec'), 0.35, 53);
      speckle(ctx, n, 300, ['rgba(255,255,255,.9)'], 2, 54);
    }
    return finish(cv, 2);
  });
}
// taş duvar: kesme taş sıraları
export function stoneTex(color) {
  return get(`s${color}`, () => {
    const n = 256, [cv, ctx] = canvas(n), c = C(color), r = rng(61);
    ctx.fillStyle = css(c, 0.5); ctx.fillRect(0, 0, n, n);
    const rows = 6, h = n / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 40;
      while (x < n) {
        const w = h * (1.1 + r() * 1.2);
        ctx.fillStyle = css(c, 0.78 + r() * 0.35); ctx.fillRect(x + 2, y * h + 2, w - 4, h - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x + 2, y * h + 2, w - 4, 3);
        x += w;
      }
    }
    noiseLayer(ctx, n, 8, C('#000000'), 0.15, 62);
    return finish(cv, 2);
  });
}

// metre cinsinden UV'li kutu: dokular her boyda aynı ölçekte görünür
export function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const sizes = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];      // +x -x +y -y +z -z
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * sizes[f][0], uv.getY(i) * sizes[f][1]); }
  return g;
}
export function planeGeo(w, h) {
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * h);
  return g;
}
const mcache = {};
export function texMat(tex, opts = {}) {
  const key = tex.uuid + JSON.stringify(opts);
  return mcache[key] || (mcache[key] = new THREE.MeshLambertMaterial({ map: tex, ...opts }));
}
