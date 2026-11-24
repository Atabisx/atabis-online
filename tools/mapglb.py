# Harita modeli (köy adası, arena gibi tek parça diorama) için yürünecek zemin yüksekliği ve engel ızgarası çıkarır.
# Kullanım: python3 tools/mapglb.py harita.glb çıktı.json --scale 70 [--cell 0.5] [--open 3.0] [--block 1.6] [--y0 auto|sayı]
#   Model oyunda (cx, cz) merkezine 'scale' kat büyütülüp konur; ızgara metre cinsindendir (merkeze göre).
#   h: zemin yüksekliği (m). Evler, ağaçlar gibi dar ve yüksek şeyler 'open' yarıçaplı açma işlemiyle zeminden ayrılır;
#   zeminden 'block' metreden yüksek kalan hücreler engeldir (içine yürünmez).
import sys, json, struct, argparse
import numpy as np
from scipy import ndimage
sys.path.insert(0, __import__('os').path.dirname(__file__))
import glbrig

ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--scale', type=float, required=True); ap.add_argument('--cell', type=float, default=0.5)
ap.add_argument('--open', type=float, default=3.0); ap.add_argument('--block', type=float, default=1.6)
ap.add_argument('--steep', type=float, default=1.2, help='komşu hücreyle bu kadar metre fark: uçurum, geçilmez')
ap.add_argument('--y0', default='auto'); ap.add_argument('--core', type=float, default=5.0); ap.add_argument('--skirt', type=float, default=24.0, help='adanın çevresindeki yerin kenar yüksekliğinden 0a inme mesafesi (m)'); ap.add_argument('--clear', action='append', default=[], help='x0,z0,x1,z1,genişlik: engelsiz yol'); ap.add_argument('--ramp', action='append', default=[], help='x0,z0,x1,z1,genişlik: (merkeze göre m) yol açar, sonu yere iner'); ap.add_argument('--png', default=''); ap.add_argument('--skirtcap', type=float, default=0, help='eteğin en yüksek noktası (m); surlu şehirde etek sur boyuna çıkmasın'); ap.add_argument('--water', default='', help='r,g,b,tolerans: üst yüzeyi bu renge yakın hücreler (havuz, göl) engel olur'); ap.add_argument('--clearblock', action='append', default=[], help='x0,z0,x1,z1,genişlik: yol açılır (yalnız engel kalkar)')
a = ap.parse_args()

P, N, U, T, img, mat = glbrig.read_glb(a.src)
P = P * a.scale
lo = P[:, [0, 2]].min(0) - a.skirt - a.cell * 2; hi = P[:, [0, 2]].max(0) + a.skirt + a.cell * 2
nx, nz = np.ceil((hi - lo) / a.cell).astype(int) + 1
top = np.full((nx, nz), -np.inf)
A, B, C = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
if a.water:
    # suyun rengi: her hücrenin en üstteki yüzeyinin doku rengi
    wr, wg, wb, wt = map(float, a.water.split(','))
    UA, UB, UC = U[T[:, 0]], U[T[:, 1]], U[T[:, 2]]
    import io
    from PIL import Image as _I
    timg = np.asarray(_I.open(io.BytesIO(img)).convert('RGB'), dtype=np.float32)
    th_, tw_ = timg.shape[:2]
    topc = np.zeros((nx, nz, 3), np.float32); topy = np.full((nx, nz), -np.inf)
L = np.maximum(np.maximum(np.linalg.norm((B - A)[:, [0, 2]], axis=1), np.linalg.norm((C - B)[:, [0, 2]], axis=1)), np.linalg.norm((A - C)[:, [0, 2]], axis=1))
k = np.clip(np.ceil(L / (a.cell * 0.5)).astype(int), 1, 60)
for n in np.unique(k):
    m = k == n
    g = np.array([(i / n, j / n) for i in range(n + 1) for j in range(n + 1 - i)])
    pts = (A[m][:, None] * (1 - g[:, 0] - g[:, 1])[None, :, None] + B[m][:, None] * g[None, :, 0, None] + C[m][:, None] * g[None, :, 1, None]).reshape(-1, 3)
    ix = np.floor((pts[:, 0] - lo[0]) / a.cell).astype(int); iz = np.floor((pts[:, 2] - lo[1]) / a.cell).astype(int)
    np.maximum.at(top, (ix, iz), pts[:, 1])
    if a.water:
        uv = (UA[m][:, None] * (1 - g[:, 0] - g[:, 1])[None, :, None] + UB[m][:, None] * g[None, :, 0, None] + UC[m][:, None] * g[None, :, 1, None]).reshape(-1, 2)
        col = timg[np.clip(((uv[:, 1] % 1) * th_).astype(int), 0, th_ - 1), np.clip(((uv[:, 0] % 1) * tw_).astype(int), 0, tw_ - 1)]
        o = np.lexsort((pts[:, 1], iz, ix)); o = o[::-1]
        key = ix[o] * nz + iz[o]; _, first = np.unique(key, return_index=True); sel = o[first]
        better = pts[sel, 1] > topy[ix[sel], iz[sel]]
        sel = sel[better]; topy[ix[sel], iz[sel]] = pts[sel, 1]; topc[ix[sel], iz[sel]] = col[sel]
has = np.isfinite(top)
# delikleri (örnek düşmeyen hücreler) komşulardan doldur
filled = top.copy(); filled[~has] = np.nan
for _ in range(3):
    nanm = np.isnan(filled)
    if not nanm.any(): break
    pad = np.pad(filled, 1, constant_values=np.nan)
    neigh = np.stack([pad[1 + dx:1 + dx + nx, 1 + dz:1 + dz + nz] for dx in (-1, 0, 1) for dz in (-1, 0, 1)])
    with np.errstate(all='ignore'): mean = np.nanmax(neigh, axis=0)
    filled[nanm] = mean[nanm]
island = ~np.isnan(filled)
island = ndimage.binary_fill_holes(ndimage.binary_closing(island, iterations=2))
# zemin: açma (önce aşındır sonra genişlet) dar yüksek şeyleri (ev, ağaç, direk) siler
r = max(1, int(round(a.open / a.cell)))
yy, xx = np.mgrid[-r:r + 1, -r:r + 1]; disk = (xx * xx + yy * yy) <= r * r
base = np.where(np.isnan(filled), np.nanpercentile(filled, 5), filled)
ground = ndimage.grey_opening(base, footprint=disk)
ground = np.where(island, ground, np.nan)
inner = ndimage.binary_erosion(island, iterations=max(1, int(8 / a.cell)))
# en alçak düzlükler bile dışarıdaki yerin (y=0) üstünde kalsın: iç zeminin alt %1'i sıfıra gelir
y0 = float(np.nanpercentile(ground[inner], 1)) - 0.2 if a.y0 == 'auto' else float(a.y0)
ground = ground - y0
topz = np.where(island, filled - y0, np.nan)
block = island & ((topz - ground) > a.block)
if a.water:
    water = island & (np.linalg.norm(topc - np.array([wr, wg, wb]), axis=2) < wt)
    water = ndimage.binary_opening(water, iterations=1)
    print('su hücresi', int(water.sum()))
    ci, cj = int((3.8 - lo[0]) / a.cell), int((8.1 - lo[1]) / a.cell); print('örnek renk', topc[ci-4:ci+5:4, cj-4:cj+5:4].reshape(-1, 3).astype(int).tolist())
    block |= water
# adanın çevresi: kenar yüksekliğinden dışarı doğru yumuşakça 0'a inen tepe eteği (uçurum dibi gömülür)
# kaynak: kenardan 'core' m içerideki düzlük (uçurum bandı da eteğe dahil olur, uçurumun önü toprakla dolar)
core = ndimage.binary_erosion(island, iterations=max(1, int(a.core / a.cell)))
dout, (ei, ej) = ndimage.distance_transform_edt(~core, return_indices=True)
edge_h = np.nan_to_num(ground, nan=0.0)[ei, ej]
if a.skirtcap: edge_h = np.minimum(edge_h, a.skirtcap)
fall = np.clip(1 - dout * a.cell / a.skirt, 0, 1)
fall = fall * fall * (3 - 2 * fall)
ground = np.where(core, ground, np.maximum(np.maximum(edge_h, 0) * fall, np.where(island, -1e3, 0)))
# bant içinde etek, gerçek yüzeyden alçaksa (ağaç, kaya) üstü engel olarak kalır
block_band = island & ~core & ((topz - ground) > a.block)
block = (block & core) | block_band
# dik yamaç (uçurum): komşu hücreden çok yüksek/alçak
gz = ground
gx = np.abs(np.diff(gz, axis=0, prepend=gz[:1])); gzd = np.abs(np.diff(gz, axis=1, prepend=gz[:, :1]))
steep = np.maximum(gx, gzd) > a.steep
block |= steep
# biraz büyüt: karakter yarıçapı
block = ndimage.binary_dilation(block, iterations=1)
# rampalar: adadan dışarı inen açık yollar (engel kalkar, yükseklik yolun sonunda 0'a iner)
cxs = lo[0] + (np.arange(nx) + 0.5) * a.cell; czs = lo[1] + (np.arange(nz) + 0.5) * a.cell
GX, GZ = np.meshgrid(cxs, czs, indexing='ij')
for spec in a.ramp:
    x0, z0, x1, z1, w = map(float, spec.split(','))
    d = np.array([x1 - x0, z1 - z0]); Ld = np.linalg.norm(d); d /= Ld
    t = ((GX - x0) * d[0] + (GZ - z0) * d[1]) / Ld
    side = np.abs(-(GX - x0) * d[1] + (GZ - z0) * d[0])
    m = (t >= 0) & (t <= 1) & (side <= w / 2)
    i0, j0 = int((x0 - lo[0]) / a.cell), int((z0 - lo[1]) / a.cell)
    hs = float(ground[i0, j0]) if np.isfinite(ground[i0, j0]) else 0.0
    ground = np.where(m, hs * (1 - np.clip(t, 0, 1)), ground)
    island = island | m
    block = block & ~m
# ada dışı 0 (düz yer); dışarıya inen kenarlar kayık olsun diye zemin en az 0
for spec in a.clear:
    x0, z0, x1, z1, w = map(float, spec.split(','))
    d = np.array([x1 - x0, z1 - z0]); Ld = np.linalg.norm(d); d /= Ld
    t = ((GX - x0) * d[0] + (GZ - z0) * d[1]) / Ld
    side = np.abs(-(GX - x0) * d[1] + (GZ - z0) * d[0])
    block &= ~((t >= 0) & (t <= 1) & (side <= w / 2))
for spec in a.clearblock:
    x0, z0, x1, z1, w = map(float, spec.split(','))
    d = np.array([x1 - x0, z1 - z0]); Ld = np.linalg.norm(d); d /= Ld
    t = ((GX - x0) * d[0] + (GZ - z0) * d[1]) / Ld
    side = np.abs(-(GX - x0) * d[1] + (GZ - z0) * d[0])
    block &= ~((t >= 0) & (t <= 1) & (side <= w / 2))
h = ground.copy()
h = ndimage.uniform_filter(h, size=3)
out = {'cell': a.cell, 'x0': float(lo[0]), 'z0': float(lo[1]), 'nx': int(nx), 'nz': int(nz), 'y0': y0 / a.scale}
# daha küçük dosya: yükseklik dm tamsayı, engel RLE
hq = np.round(h * 10).astype(int).ravel()
out['h'] = hq.tolist(); out['hScale'] = 0.1
def rle(mask):
    v = mask.ravel(); runs = []; cur = bool(v[0]); cnt = 0
    for x in v:
        if bool(x) == cur: cnt += 1
        else: runs.append(cnt); cur = bool(x); cnt = 1
    runs.append(cnt)
    return {'start': bool(v[0]), 'runs': runs}
out['block'] = rle(block); out.pop('blockStart', None)
out['core'] = rle(core)   # modelin kendi yüzeyi olan iç bölge (etek örgüsü burada gömülür)
json.dump(out, open(a.dst, 'w'), separators=(',', ':'))
print('ızgara', nx, 'x', nz, 'y0', round(y0, 2), 'zemin', round(float(np.nanmin(ground)), 2), '..', round(float(np.nanmax(ground)), 2), 'm, engel', int(block.sum()), 'hücre')
if a.png:
    from PIL import Image
    v = np.clip(h / max(1e-3, h.max()), 0, 1)
    rgb = np.stack([v * 255, v * 255, v * 255], -1).astype(np.uint8)
    rgb[block] = [220, 40, 40]; rgb[~island] = [20, 30, 60]
    Image.fromarray(rgb.transpose(1, 0, 2)).resize((nx * 3, nz * 3), Image.NEAREST).save(a.png)
