# Sadeleştirilmiş (az üçgenli) iskeletli karakterin dokusunu, orijinal yüksek ayrıntılı modelden yeniden "pişirir".
#
# Sorun: orijinal modellerin dokusu binlerce küçük parçadan oluşan bir atlas. Model 1,8 milyon üçgenden ~60 bine
# indirilince üçgenler birden çok doku parçasına yayılır ve karakter yamalı / bozuk görünür.
# Çözüm: her sade üçgene dokuda kendi küçük karesini veririz (yakın üçgenler dokuda da yan yana), her pikselin
# 3B noktasına orijinal modelde en yakın yüzeyi bulup oradaki rengi, metal/pürüz ve ışıma değerini alırız.
# Normal haritası da pişirilir: orijinal modelin ince kabartıları (ve varsa kendi normal haritası) sade üçgenin
# üstüne işlenir; böylece az üçgenle yüksek ayrıntılı görünür.
#
# Geometri sırası, iskelet ve ağırlıklar aynı kalır; üçgen sırası değişmediği için giyilen zırh dosyaları
# (models/worn/*.bin.gz, gizlenen gövde üçgenleri) bozulmaz. Sadece köşeler üçgen başına ayrılır (UV'ler ayrı).
#
# Kullanım: python3 tools/charbake.py oyun.glb orijinal.glb cikti.glb [--size 2048]
import sys, json, struct, io, argparse, time
import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

ap = argparse.ArgumentParser(); ap.add_argument('game'); ap.add_argument('orig'); ap.add_argument('out')
ap.add_argument('--size', type=int, default=2048); ap.add_argument('--k', type=int, default=8)
a = ap.parse_args()
t0 = time.time()
log = lambda *x: print(f'[{time.time() - t0:5.1f}s]', *x, flush=True)

NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
DT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}
NORM = {np.uint16: 65535.0, np.int16: 32767.0, np.uint8: 255.0, np.int8: 127.0}


def read(path):
    b = open(path, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n]); o = 20 + n; bl = struct.unpack('<I', b[o:o + 4])[0]
    return j, bytearray(b[o + 8:o + 8 + bl])


def accessor(j, BIN, i):
    ac = j['accessors'][i]; bv = j['bufferViews'][ac['bufferView']]
    dt = DT[ac['componentType']]; nc = NC[ac['type']]; isz = np.dtype(dt).itemsize
    stride = bv.get('byteStride', isz * nc); off = bv.get('byteOffset', 0) + ac.get('byteOffset', 0)
    raw = np.frombuffer(bytes(BIN[off:off + stride * (ac['count'] - 1) + isz * nc]), np.uint8)
    if stride == isz * nc:
        arr = np.frombuffer(raw.tobytes(), dt, ac['count'] * nc).reshape(-1, nc)
    else:
        arr = np.lib.stride_tricks.as_strided(raw, (ac['count'], isz * nc), (stride, 1)).copy().view(dt).reshape(-1, nc)
    arr = arr.astype(np.float64) if dt == np.float32 else arr
    if ac.get('normalized') and dt in NORM: arr = arr.astype(np.float64) / NORM[dt]
    return arr


def image(j, BIN, tex_index):
    t = j['textures'][tex_index]
    src = t.get('extensions', {}).get('EXT_texture_webp', {}).get('source', t.get('source'))
    bv = j['bufferViews'][j['images'][src]['bufferView']]
    data = bytes(BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])
    return np.asarray(Image.open(io.BytesIO(data)).convert('RGB'), np.float32) / 255.0


def node_world(j):
    W = {}
    def mat(n):
        if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
        M = np.eye(4); t = n.get('translation', [0, 0, 0]); r = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
        x, y, z, w = r
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M[:3, :3] = R * np.array(s); M[:3, 3] = t; return M
    def walk(i, P):
        M = P @ mat(j['nodes'][i]); W[i] = M
        for c in j['nodes'][i].get('children', []): walk(c, M)
    for sc in j.get('scenes', [{'nodes': list(range(len(j['nodes'])))}]):
        for i in sc['nodes']: walk(i, np.eye(4))
    return W


# ---------------------------------------------------------------- orijinal (yüksek ayrıntı)
oj, obin = read(a.orig)
OW = node_world(oj)
oP, oU, oT, oN = [], [], [], []
base_n = 0
for ni, M in OW.items():
    nd = oj['nodes'][ni]
    if 'mesh' not in nd: continue
    for pr in oj['meshes'][nd['mesh']]['primitives']:
        P = accessor(oj, obin, pr['attributes']['POSITION']).astype(np.float64)
        P = P @ M[:3, :3].T + M[:3, 3]
        U = accessor(oj, obin, pr['attributes']['TEXCOORD_0']).astype(np.float64)
        T = accessor(oj, obin, pr['indices']).reshape(-1, 3).astype(np.int64)
        oP.append(P); oU.append(U); oT.append(T + base_n); base_n += len(P)
oP = np.concatenate(oP); oU = np.concatenate(oU); oT = np.concatenate(oT)
om = oj['materials'][0]; pbr = om.get('pbrMetallicRoughness', {})
tr = pbr.get('baseColorTexture', {}).get('extensions', {}).get('KHR_texture_transform', {})
oU = oU * np.array(tr.get('scale', [1, 1])) + np.array(tr.get('offset', [0, 0]))
log('orijinal:', len(oP), 'nokta', len(oT), 'üçgen')
tex_base = image(oj, obin, pbr['baseColorTexture']['index'])
tex_mr = image(oj, obin, pbr['metallicRoughnessTexture']['index']) if 'metallicRoughnessTexture' in pbr else None
tex_nrm = image(oj, obin, om['normalTexture']['index']) if 'normalTexture' in om else None
tex_emi = image(oj, obin, om['emissiveTexture']['index']) if 'emissiveTexture' in om else None
log('dokular:', 'renk', 'mr' if tex_mr is not None else '', 'normal' if tex_nrm is not None else '', 'ışıma' if tex_emi is not None else '')

# ---------------------------------------------------------------- oyun (sade, iskeletli)
gj, gbin = read(a.game)
prim = gj['meshes'][0]['primitives'][0]
gP = accessor(gj, gbin, prim['attributes']['POSITION'])
gN = accessor(gj, gbin, prim['attributes']['NORMAL'])
gU = accessor(gj, gbin, prim['attributes']['TEXCOORD_0'])
gJ = accessor(gj, gbin, prim['attributes']['JOINTS_0'])
gWt = accessor(gj, gbin, prim['attributes']['WEIGHTS_0'])
gT = accessor(gj, gbin, prim['indices']).reshape(-1, 3).astype(np.int64)
log('oyun:', len(gP), 'nokta', len(gT), 'üçgen')

# ---------------------------------------------------------------- hizalama: oyun UV'leri orijinal köşelerin UV'lerinden seçilmişti
kd = cKDTree(oU)
d, idx = kd.query(gU)
ok = d < 1e-5
src, dst = oP[idx[ok]], gP[ok]
def umeyama(X, Y):
    mx, my = X.mean(0), Y.mean(0); Xc, Yc = X - mx, Y - my
    C = Yc.T @ Xc / len(X); Uu, S, Vt = np.linalg.svd(C); D = np.eye(3)
    if np.linalg.det(Uu @ Vt) < 0: D[2, 2] = -1
    R = Uu @ D @ Vt; s = np.trace(np.diag(S) @ D) / (Xc ** 2).sum(1).mean()
    return s, R, my - s * R @ mx
sel = np.ones(len(src), bool)
for it in range(4):
    s, R, t = umeyama(src[sel], dst[sel])
    err = np.linalg.norm(src @ R.T * s + t - dst, axis=1)
    sel = err < np.percentile(err, 80)
log(f'hizalama: {ok.sum()} eşleşme, ölçek {s:.4f}, ortanca hata {np.median(err):.4f} (boy {np.ptp(gP[:, 1]):.2f})')
oP = oP @ R.T * s + t

# orijinal üçgen verileri
A, B, C = oP[oT[:, 0]], oP[oT[:, 1]], oP[oT[:, 2]]
fn = np.cross(B - A, C - A); fl = np.linalg.norm(fn, axis=1, keepdims=True); fl[fl == 0] = 1; fnU = fn / fl
# orijinalin yumuşak köşe normalleri (aynı konumdaki köşeler ortak)
_, pinv = np.unique(np.round(oP / 1e-5).astype(np.int64), axis=0, return_inverse=True); pinv = pinv.ravel()
acc = np.zeros((pinv.max() + 1, 3))
for k in range(3): np.add.at(acc, pinv[oT[:, k]], fn)
oVN = acc[pinv]; l = np.linalg.norm(oVN, axis=1, keepdims=True); l[l == 0] = 1; oVN /= l
# orijinal üçgenlerin teğet çerçevesi (normal haritası için): T = dP/du, B = dP/dv
if tex_nrm is not None:
    du1 = oU[oT[:, 1]] - oU[oT[:, 0]]; du2 = oU[oT[:, 2]] - oU[oT[:, 0]]
    e1, e2 = B - A, C - A
    det = du1[:, 0] * du2[:, 1] - du2[:, 0] * du1[:, 1]; det[np.abs(det) < 1e-14] = 1e-14
    oTan = (e1 * du2[:, 1:2] - e2 * du1[:, 1:2]) / det[:, None]
    oBit = (e2 * du1[:, 0:1] - e1 * du2[:, 0:1]) / det[:, None]
cent = (A + B + C) / 3
ckd = cKDTree(cent)
log('arama ağacı hazır')

# ---------------------------------------------------------------- atlas: her iki sade üçgen bir kare hücre
n = len(gT); S = a.size
gc = (gP[gT[:, 0]] + gP[gT[:, 1]] + gP[gT[:, 2]]) / 3
q = ((gc - gc.min(0)) / np.ptp(gc, 0).max() * 1023).astype(np.int64)
def spread(x):
    x = x & 0x3ff; x = (x | (x << 16)) & 0x30000ff; x = (x | (x << 8)) & 0x300f00f; x = (x | (x << 4)) & 0x30c30c3; x = (x | (x << 2)) & 0x9249249; return x
order = np.argsort(spread(q[:, 0]) | (spread(q[:, 1]) << 1) | (spread(q[:, 2]) << 2), kind='stable')
cells = (n + 1) // 2; G = int(np.ceil(np.sqrt(cells))); cs = S // G
log(f'atlas {S}px: {G}x{G} hücre, hücre {cs}px')
slot = np.empty(n, np.int64); slot[order] = np.arange(n)
cell = slot // 2; half = slot % 2
cx, cy = (cell % G) * cs, (cell // G) * cs
# hücre içi köşeler (piksel): alt üçgen (1,1),(cs-2,1),(1,cs-2); üst üçgen (cs-1,cs-1),(2,cs-1),(cs-1,2)
L0 = np.array([[1, 1], [cs - 2, 1], [1, cs - 2]], np.float64)
L1 = np.array([[cs - 1, cs - 1], [2, cs - 1], [cs - 1, 2]], np.float64)
loc = np.where(half[:, None, None] == 0, L0[None], L1[None])           # n,3,2
atlasUV = (loc + np.stack([cx, cy], 1)[:, None, :]) / S                  # n,3,2 (glTF: v aşağı)

# sade üçgenin teğet çerçevesi (atlas UV'sine göre)
gA, gB, gC = gP[gT[:, 0]], gP[gT[:, 1]], gP[gT[:, 2]]
du1 = atlasUV[:, 1] - atlasUV[:, 0]; du2 = atlasUV[:, 2] - atlasUV[:, 0]
e1, e2 = gB - gA, gC - gA
det = du1[:, 0] * du2[:, 1] - du2[:, 0] * du1[:, 1]
gTan = (e1 * du2[:, 1:2] - e2 * du1[:, 1:2]) / det[:, None]
gBit = (e2 * du1[:, 0:1] - e1 * du2[:, 0:1]) / det[:, None]

# ---------------------------------------------------------------- pişirme
out_base = np.zeros((S, S, 3), np.float32)
out_mr = np.zeros((S, S, 3), np.float32) if tex_mr is not None else None
out_emi = np.zeros((S, S, 3), np.float32) if tex_emi is not None else None
out_nrm = np.zeros((S, S, 3), np.float32)
py, px = np.mgrid[0:cs, 0:cs]; px = px.ravel() + 0.5; py = py.ravel() + 0.5


def bilinear(img, uv):
    H, W = img.shape[:2]
    x = (uv[:, 0] % 1.0) * W - 0.5; y = (uv[:, 1] % 1.0) * H - 0.5
    x0 = np.floor(x).astype(np.int64); y0 = np.floor(y).astype(np.int64); fx = (x - x0)[:, None]; fy = (y - y0)[:, None]
    x0 %= W; y0 %= H; x1 = (x0 + 1) % W; y1 = (y0 + 1) % H
    return (img[y0, x0] * (1 - fx) * (1 - fy) + img[y0, x1] * fx * (1 - fy) + img[y1, x0] * (1 - fx) * fy + img[y1, x1] * fx * fy)


def bary(Pq, a0, b0, c0):
    v0, v1, v2 = b0 - a0, c0 - a0, Pq - a0
    d00 = (v0 * v0).sum(-1); d01 = (v0 * v1).sum(-1); d11 = (v1 * v1).sum(-1); d20 = (v2 * v0).sum(-1); d21 = (v2 * v1).sum(-1)
    den = d00 * d11 - d01 * d01; den = np.where(np.abs(den) < 1e-20, 1e-20, den)
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    return np.stack([1 - v - w, v, w], -1)


CH = 6000   # üçgen grubu
for g0 in range(0, n, CH):
    tri = np.arange(g0, min(n, g0 + CH)); m = len(tri)
    # her üçgen için hücresindeki bütün pikseller; pikselin hangi yarıya düştüğüne göre bu üçgene ait olanlar
    hp = half[tri][:, None]
    inside = np.where(hp == 0, (px + py)[None] < cs, (px + py)[None] >= cs)           # m, cs*cs
    ti, pi = np.nonzero(inside)
    T_ = tri[ti]
    lp = np.stack([px[pi], py[pi]], 1)
    lc = loc[T_]
    w = bary(np.concatenate([lp, np.zeros((len(lp), 1))], 1), *(np.concatenate([lc[:, k], np.zeros((len(lc), 1))], 1) for k in range(3)))
    w = np.clip(w, 0, 1); w /= w.sum(1, keepdims=True)                                   # kenar payı: en yakın kenarın rengi
    Pq = w[:, 0:1] * gA[T_] + w[:, 1:2] * gB[T_] + w[:, 2:3] * gC[T_]
    Nq = w[:, 0:1] * gN[gT[T_, 0]] + w[:, 1:2] * gN[gT[T_, 1]] + w[:, 2:3] * gN[gT[T_, 2]]
    Nq /= np.linalg.norm(Nq, axis=1, keepdims=True) + 1e-12
    # orijinalde en yakın yüzey: k aday üçgen, yönü uyuşanlar arasında en yakını
    _, cand = ckd.query(Pq, k=a.k, workers=-1)
    best_d = np.full(len(Pq), np.inf); best = np.zeros(len(Pq), np.int64); best_w = np.zeros((len(Pq), 3))
    for kk in range(a.k):
        c = cand[:, kk]
        bw = bary(Pq, A[c], B[c], C[c]); bw = np.clip(bw, 0, 1); bw /= bw.sum(1, keepdims=True)
        Qp = bw[:, 0:1] * A[c] + bw[:, 1:2] * B[c] + bw[:, 2:3] * C[c]
        dd = np.linalg.norm(Qp - Pq, axis=1)
        facing = (fnU[c] * Nq).sum(1)
        dd = dd + np.where(facing < 0.0, 0.02, 0.0)                                     # ters yüzlü katmanı (pelerin arkası) cezalandır
        better = dd < best_d
        best_d[better] = dd[better]; best[better] = c[better]; best_w[better] = bw[better]
    ot = oT[best]
    uv = best_w[:, 0:1] * oU[ot[:, 0]] + best_w[:, 1:2] * oU[ot[:, 1]] + best_w[:, 2:3] * oU[ot[:, 2]]
    X = (cx[T_] + px[pi] - 0.5).astype(np.int64); Y = (cy[T_] + py[pi] - 0.5).astype(np.int64)
    out_base[Y, X] = bilinear(tex_base, uv)
    if out_mr is not None: out_mr[Y, X] = bilinear(tex_mr, uv)
    if out_emi is not None: out_emi[Y, X] = bilinear(tex_emi, uv)
    # yüksek ayrıntılı normal (dünya), varsa orijinal normal haritasıyla
    hn = best_w[:, 0:1] * oVN[ot[:, 0]] + best_w[:, 1:2] * oVN[ot[:, 1]] + best_w[:, 2:3] * oVN[ot[:, 2]]
    hn /= np.linalg.norm(hn, axis=1, keepdims=True) + 1e-12
    if tex_nrm is not None:
        tn = bilinear(tex_nrm, uv) * 2 - 1
        Tt = oTan[best] - hn * (oTan[best] * hn).sum(1, keepdims=True); Tt /= np.linalg.norm(Tt, axis=1, keepdims=True) + 1e-12
        Bb = oBit[best] - hn * (oBit[best] * hn).sum(1, keepdims=True); Bb /= np.linalg.norm(Bb, axis=1, keepdims=True) + 1e-12
        # glTF: yeşil kanal +Y = -v yönü (dokuda yukarı)
        hn = Tt * tn[:, 0:1] - Bb * tn[:, 1:2] + hn * tn[:, 2:3]
        hn /= np.linalg.norm(hn, axis=1, keepdims=True) + 1e-12
    # sade üçgenin teğet uzayına çevir
    Tl = gTan[T_] - Nq * (gTan[T_] * Nq).sum(1, keepdims=True); Tl /= np.linalg.norm(Tl, axis=1, keepdims=True) + 1e-12
    Bl = gBit[T_] - Nq * (gBit[T_] * Nq).sum(1, keepdims=True); Bl /= np.linalg.norm(Bl, axis=1, keepdims=True) + 1e-12
    enc = np.stack([(hn * Tl).sum(1), -(hn * Bl).sum(1), np.maximum((hn * Nq).sum(1), 0.05)], 1)
    enc /= np.linalg.norm(enc, axis=1, keepdims=True)
    out_nrm[Y, X] = enc * 0.5 + 0.5
    if (g0 // CH) % 3 == 0: log(f'pişiriliyor {min(n, g0 + CH)}/{n}')

# kullanılmayan hücreler: komşu rengi (mipmap'te siyah sızmasın)
mask = out_nrm.sum(2) > 0
if (~mask).any():
    from scipy import ndimage
    idx_ = ndimage.distance_transform_edt(~mask, return_distances=False, return_indices=True)
    for arr in (out_base, out_mr, out_emi, out_nrm):
        if arr is not None: arr[:] = arr[idx_[0], idx_[1]]
log('pişirme bitti')


def enc_img(arr, q=90, lossless=False):
    im = Image.fromarray((np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8))
    b = io.BytesIO(); im.save(b, 'WEBP', quality=q, method=5, lossless=lossless); return b.getvalue()


# ---------------------------------------------------------------- yeni GLB: köşeler üçgen başına ayrı, üçgen sırası aynı
nv = n * 3
NP = gP[gT].reshape(-1, 3).astype(np.float32)
NN = gN[gT].reshape(-1, 3).astype(np.float32)
NU = atlasUV.reshape(-1, 2).astype(np.float32)
NJ = gJ[gT].reshape(-1, 4)
NW = gWt[gT].reshape(-1, 4).astype(np.float32)
NI = np.arange(nv, dtype=np.uint32)

keep_acc = set(range(len(gj['accessors']))) - set(prim['attributes'].values()) - {prim['indices']}
# yüksek ayrıntılı sürüm: her köşede telefon sürümündeki üçgenin numarası (giyilen zırh gövdeyi gizlerken kullanılır)
LQTRI = accessor(gj, gbin, prim['attributes']['_LQTRI'])[gT].reshape(-1, 1).astype(np.float32) if '_LQTRI' in prim['attributes'] else None
NB = bytearray(); views = []; accs = []; acc_map = {}


def add_view(data, target=None):
    while len(NB) % 4: NB.append(0)
    v = {'buffer': 0, 'byteOffset': len(NB), 'byteLength': len(data)}
    if target: v['target'] = target
    NB.extend(data); views.append(v); return len(views) - 1


for i in sorted(keep_acc):                       # iskelet (ters bağlama matrisleri), animasyon vb. aynen
    ac = dict(gj['accessors'][i]); bv = gj['bufferViews'][ac['bufferView']]
    data = bytes(gbin[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])
    nvw = dict(bv); nvw.pop('byteOffset', None)
    vi = add_view(data, bv.get('target')); views[vi].update({k: v for k, v in nvw.items() if k in ('byteStride',)})
    ac['bufferView'] = vi; acc_map[i] = len(accs); accs.append(ac)


def add_acc(arr, comp, typ, target, minmax=False):
    vi = add_view(arr.tobytes(), target)
    ac = {'bufferView': vi, 'componentType': comp, 'count': len(arr), 'type': typ}
    if minmax: ac['min'] = arr.min(0).tolist(); ac['max'] = arr.max(0).tolist()
    accs.append(ac); return len(accs) - 1


# dosya küçük kalsın (KHR_mesh_quantization): normal 4 bayt, UV 2x16 bit, ağırlık 4x8 bit, eklem 4x8 bit
def add_norm(arr, comp, typ, target, stride=None):
    acc_i = add_acc(arr, comp, typ, target); accs[acc_i]['normalized'] = True
    if stride: views[accs[acc_i]['bufferView']]['byteStride'] = stride
    return acc_i
N8 = np.zeros((nv, 4), np.int8); N8[:, :3] = np.clip(np.round(NN * 127), -127, 127)
U16 = np.clip(np.round(NU * 65535), 0, 65535).astype(np.uint16)
W8 = np.round(NW / NW.sum(1, keepdims=True) * 255).astype(np.int64)
W8[np.arange(nv), W8.argmax(1)] += 255 - W8.sum(1); W8 = np.clip(W8, 0, 255).astype(np.uint8)
jt = 5121 if NJ.max() < 256 else 5123
attrs = {'POSITION': add_acc(NP, 5126, 'VEC3', 34962, True)}
vi = add_view(N8.tobytes(), 34962); views[vi]['byteStride'] = 4
accs.append({'bufferView': vi, 'componentType': 5120, 'normalized': True, 'count': nv, 'type': 'VEC3'}); attrs['NORMAL'] = len(accs) - 1
attrs['TEXCOORD_0'] = add_norm(U16, 5123, 'VEC2', 34962)
attrs['JOINTS_0'] = add_acc(NJ.astype(DT[jt]), jt, 'VEC4', 34962)
attrs['WEIGHTS_0'] = add_norm(W8, 5121, 'VEC4', 34962)
if LQTRI is not None: attrs['_LQTRI'] = add_acc(LQTRI, 5126, 'SCALAR', 34962)
ind = add_acc(NI, 5125, 'SCALAR', 34963)
# diğer meshler / skin'deki accessor referanslarını yeniden eşle
for sk in gj.get('skins', []):
    if 'inverseBindMatrices' in sk: sk['inverseBindMatrices'] = acc_map[sk['inverseBindMatrices']]
for an in gj.get('animations', []):
    for smp in an['samplers']: smp['input'] = acc_map[smp['input']]; smp['output'] = acc_map[smp['output']]
prim['attributes'] = attrs; prim['indices'] = ind

images, textures = [], []
def add_tex(data):
    vi = add_view(data); images.append({'bufferView': vi, 'mimeType': 'image/webp'})
    textures.append({'sampler': 0, 'extensions': {'EXT_texture_webp': {'source': len(images) - 1}}}); return len(textures) - 1
mt = gj['materials'][0]
for k in ('normalTexture', 'emissiveTexture', 'emissiveFactor', 'occlusionTexture'): mt.pop(k, None)
p2 = {'baseColorTexture': {'index': add_tex(enc_img(out_base, 90))}}
if out_mr is not None:
    p2['metallicRoughnessTexture'] = {'index': add_tex(enc_img(out_mr, 90))}; p2['metallicFactor'] = pbr.get('metallicFactor', 1.0); p2['roughnessFactor'] = pbr.get('roughnessFactor', 1.0)
else:
    p2['metallicFactor'] = pbr.get('metallicFactor', 0.0); p2['roughnessFactor'] = pbr.get('roughnessFactor', 0.7)
mt['pbrMetallicRoughness'] = p2
mt['normalTexture'] = {'index': add_tex(enc_img(out_nrm, 86))}
if out_emi is not None and out_emi.max() > 0.02:
    mt['emissiveTexture'] = {'index': add_tex(enc_img(out_emi, 88))}; mt['emissiveFactor'] = om.get('emissiveFactor', [1, 1, 1])
gj['images'] = images; gj['textures'] = textures
gj['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 33071, 'wrapT': 33071}]
gj['bufferViews'] = views; gj['accessors'] = accs
gj['extensionsUsed'] = sorted(set(gj.get('extensionsUsed', [])) | {'EXT_texture_webp', 'KHR_mesh_quantization'})
gj['extensionsRequired'] = sorted(set(gj.get('extensionsRequired', [])) | {'KHR_mesh_quantization'})
gj['buffers'] = [{'byteLength': len(NB)}]
while len(NB) % 4: NB.append(0)
js = json.dumps(gj, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(a.out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(NB)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(NB), 0x004E4942)); f.write(NB)
log(a.out, 'yazıldı', len(NB) // 1024, 'KB')
Image.fromarray((np.clip(out_base, 0, 1) * 255).astype(np.uint8)).resize((768, 768)).save(a.out + '.renk.jpg')
Image.fromarray((np.clip(out_nrm, 0, 1) * 255).astype(np.uint8)).resize((768, 768)).save(a.out + '.normal.jpg')
