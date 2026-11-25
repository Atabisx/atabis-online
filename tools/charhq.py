# Bilgisayar için yüksek ayrıntılı karakter: orijinal modelden ~3 kat daha çok üçgenli, iskeletli bir ara model üretir.
# Sonra tools/charbake.py ile dokusu (4096 piksel) pişirilir.
#
#  1) orijinal model hücre kümelemeyle sadeleştirilir (hedef üçgen sayısı --tris)
#  2) telefon sürümüyle (sade, iskeletli) aynı konuma oturtulur (UV eşleşmesiyle hizalama)
#  3) telefon sürümünde olmayan parçalar (elden kesilen silah, kırıntılar) atılır
#  4) iskelet ağırlıkları telefon sürümünün en yakın üçgeninden aktarılır
#  5) her üçgene telefon sürümündeki karşılığı yazılır (_LQTRI): giyilen zırhların gizlediği gövde üçgenleri
#     telefon sürümüne göre hazırlandığı için oyun bu eşlemeyle yüksek ayrıntılı gövdede de aynı yerleri gizler
#
# Kullanım: python3 tools/charhq.py telefon_eski.glb orijinal.glb ara.glb [--tris 180000]
#   telefon_eski.glb: dokusu pişirilmeden önceki sade model (UV'leri orijinalden seçilmiş olmalı; git geçmişinde)
import sys, json, struct, argparse, time
import numpy as np
from scipy.spatial import cKDTree

ap = argparse.ArgumentParser(); ap.add_argument('lq'); ap.add_argument('orig'); ap.add_argument('out')
ap.add_argument('--tris', type=int, default=180000); ap.add_argument('--keep', type=float, default=0.03)
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
    if stride == isz * nc: arr = np.frombuffer(raw.tobytes(), dt, ac['count'] * nc).reshape(-1, nc)
    else: arr = np.lib.stride_tricks.as_strided(raw, (ac['count'], isz * nc), (stride, 1)).copy().view(dt).reshape(-1, nc)
    arr = arr.astype(np.float64) if dt == np.float32 else arr
    if ac.get('normalized') and dt in NORM: arr = arr.astype(np.float64) / NORM[dt]
    return arr


def node_world(j):
    W = {}
    def mat(n):
        if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
        M = np.eye(4); t = n.get('translation', [0, 0, 0]); x, y, z, w = n.get('rotation', [0, 0, 0, 1]); s = n.get('scale', [1, 1, 1])
        R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
        M[:3, :3] = R * np.array(s); M[:3, 3] = t; return M
    def walk(i, P):
        M = P @ mat(j['nodes'][i]); W[i] = M
        for c in j['nodes'][i].get('children', []): walk(c, M)
    for sc in j.get('scenes', [{'nodes': list(range(len(j['nodes'])))}]):
        for i in sc['nodes']: walk(i, np.eye(4))
    return W


def bary(Pq, a0, b0, c0):
    v0, v1, v2 = b0 - a0, c0 - a0, Pq - a0
    d00 = (v0 * v0).sum(-1); d01 = (v0 * v1).sum(-1); d11 = (v1 * v1).sum(-1); d20 = (v2 * v0).sum(-1); d21 = (v2 * v1).sum(-1)
    den = d00 * d11 - d01 * d01; den = np.where(np.abs(den) < 1e-20, 1e-20, den)
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    return np.stack([1 - v - w, v, w], -1)


# ---- orijinal
oj, obin = read(a.orig); OW = node_world(oj)
oP, oU, oT = [], [], []; base = 0
for ni, M in OW.items():
    nd = oj['nodes'][ni]
    if 'mesh' not in nd: continue
    for pr in oj['meshes'][nd['mesh']]['primitives']:
        P = accessor(oj, obin, pr['attributes']['POSITION']).astype(np.float64) @ M[:3, :3].T + M[:3, 3]
        oP.append(P); oU.append(accessor(oj, obin, pr['attributes']['TEXCOORD_0']).astype(np.float64))
        oT.append(accessor(oj, obin, pr['indices']).reshape(-1, 3).astype(np.int64) + base); base += len(P)
oP = np.concatenate(oP); oU = np.concatenate(oU); oT = np.concatenate(oT)
tr = oj['materials'][0].get('pbrMetallicRoughness', {}).get('baseColorTexture', {}).get('extensions', {}).get('KHR_texture_transform', {})
oU = oU * np.array(tr.get('scale', [1, 1])) + np.array(tr.get('offset', [0, 0]))
log('orijinal', len(oT), 'üçgen')

# ---- telefon sürümü (iskeletli)
lj, lbin = read(a.lq); pr = lj['meshes'][0]['primitives'][0]
lP = accessor(lj, lbin, pr['attributes']['POSITION']); lU = accessor(lj, lbin, pr['attributes']['TEXCOORD_0'])
lJ = accessor(lj, lbin, pr['attributes']['JOINTS_0']).astype(np.int64); lW = accessor(lj, lbin, pr['attributes']['WEIGHTS_0']).astype(np.float64)
lT = accessor(lj, lbin, pr['indices']).reshape(-1, 3).astype(np.int64)
d, idx = cKDTree(oU).query(lU); ok = d < 1e-5
src, dst = oP[idx[ok]], lP[ok]
def umeyama(X, Y):
    mx, my = X.mean(0), Y.mean(0); Xc, Yc = X - mx, Y - my
    U_, S, Vt = np.linalg.svd(Yc.T @ Xc / len(X)); D = np.eye(3)
    if np.linalg.det(U_ @ Vt) < 0: D[2, 2] = -1
    R = U_ @ D @ Vt; return np.trace(np.diag(S) @ D) / (Xc ** 2).sum(1).mean(), R, my - (np.trace(np.diag(S) @ D) / (Xc ** 2).sum(1).mean()) * R @ mx
sel = np.ones(len(src), bool)
for _ in range(4):
    s, R, t = umeyama(src[sel], dst[sel]); err = np.linalg.norm(src @ R.T * s + t - dst, axis=1); sel = err < np.percentile(err, 80)
oP = oP @ R.T * s + t
log(f'hizalama: ölçek {s:.4f}, ortanca hata {np.median(err):.4f}')

# ---- sadeleştir: hücre kümeleme, hücre boyunu hedef üçgen sayısına göre ara
H = np.ptp(oP, 0).max()
def cluster(cell):
    c = np.floor(oP / cell).astype(np.int64)
    _, cinv = np.unique(c, axis=0, return_inverse=True); cinv = cinv.ravel()
    T = cinv[oT]
    T = T[(T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])]
    _, fi = np.unique(np.sort(T, 1), axis=0, return_index=True); T = T[np.sort(fi)]
    return cinv, T
lo, hi = H / 2000, H / 50
for _ in range(14):
    mid = (lo * hi) ** 0.5; cinv, T = cluster(mid)
    if len(T) > a.tris: lo = mid
    else: hi = mid
cinv, T = cluster(hi)
nc = cinv.max() + 1
cnt = np.bincount(cinv, minlength=nc).astype(np.float64)
V = np.zeros((nc, 3)); np.add.at(V, cinv, oP); V /= np.maximum(cnt, 1)[:, None]
# her küme için temsilci orijinal köşe (UV'si hizalama için kullanılır)
rep = np.full(nc, -1); rep[cinv[::-1]] = np.arange(len(cinv))[::-1]
log(f'sadeleşti: hücre {hi * 1000:.1f} mm, {len(T)} üçgen')

# ---- telefon sürümünde karşılığı olmayan parçaları at (elden kesilen silah vb.)
LA, LB, LC = lP[lT[:, 0]], lP[lT[:, 1]], lP[lT[:, 2]]
lcent = (LA + LB + LC) / 3; lkd = cKDTree(lcent)
lfn = np.cross(LB - LA, LC - LA); lfn /= np.linalg.norm(lfn, axis=1, keepdims=True) + 1e-12
def nearest_lq(Pq, Nq=None, k=10):
    _, cand = lkd.query(Pq, k=k, workers=-1)
    bd = np.full(len(Pq), np.inf); bt = np.zeros(len(Pq), np.int64); bw = np.zeros((len(Pq), 3))
    for kk in range(k):
        c = cand[:, kk]; w = np.clip(bary(Pq, LA[c], LB[c], LC[c]), 0, 1); w /= w.sum(1, keepdims=True)
        Q = w[:, 0:1] * LA[c] + w[:, 1:2] * LB[c] + w[:, 2:3] * LC[c]
        dd = np.linalg.norm(Q - Pq, axis=1)
        if Nq is not None: dd = dd + np.where((lfn[c] * Nq).sum(1) < 0, 0.01, 0)
        b = dd < bd; bd[b] = dd[b]; bt[b] = c[b]; bw[b] = w[b]
    return bd, bt, bw
A, B, C = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
fn = np.cross(B - A, C - A); fa = np.linalg.norm(fn, axis=1); fnu = fn / (fa[:, None] + 1e-12)
dist, _, _ = nearest_lq((A + B + C) / 3)
keep = dist < a.keep
# bağlı parçalar: çoğu telefon sürümünde olmayan parça (elde kalan silah kabzası, kitap) bütünüyle atılır
par = np.arange(nc)
def find(x):
    r = x
    while par[r] != r: r = par[r]
    while par[x] != r: par[x], x = r, par[x]
    return r
for e0, e1 in np.concatenate([T[:, [0, 1]], T[:, [1, 2]]]):
    r0, r1 = find(e0), find(e1)
    if r0 != r1: par[r0] = r1
comp = np.array([find(v) for v in T[:, 0]])
cid, cinv2 = np.unique(comp, return_inverse=True)
near_frac = np.bincount(cinv2, weights=(dist < a.keep * 0.5).astype(float)) / np.bincount(cinv2)
keep &= near_frac[cinv2] > 0.6
for th in (0.005, 0.01, 0.015, 0.02, 0.03): log(f'  uzaklık > {th * 100:.1f} cm: {(dist > th).sum()} üçgen')
T = T[keep]; fnu = fnu[keep]; fn = fn[keep]
log(f'telefon sürümünde olmayan {int((~keep).sum())} üçgen atıldı, kalan {len(T)}')

# ---- köşe normalleri: aynı yöne bakan komşu yüzlerin ortalaması (ince pelerinin iki yüzü birbirini silmesin)
nT = len(T); corner_v = T.ravel(); corner_f = np.repeat(np.arange(nT), 3)
order = np.argsort(corner_v, kind='stable'); cv = corner_v[order]; cf = corner_f[order]
starts = np.r_[0, np.nonzero(np.diff(cv))[0] + 1]; ends = np.r_[starts[1:], len(cv)]
CN = np.zeros((nT * 3, 3))
deg = ends - starts; maxdeg = min(int(deg.max()), 24)
# her köşe için aynı noktadaki yüzleri sırayla dene
pos_in_sorted = np.empty(len(order), np.int64); pos_in_sorted[order] = np.arange(len(order))
grp = np.searchsorted(starts, pos_in_sorted, side='right') - 1
for k in range(maxdeg):
    j_ = starts[grp] + k; valid = j_ < ends[grp]
    g = np.where(valid, cf[np.minimum(j_, len(cf) - 1)], 0)
    own = corner_f
    dot = (fnu[g] * fnu[own]).sum(1)
    w = valid & (dot > 0.35)
    CN += np.where(w[:, None], fn[g], 0)
CN /= np.linalg.norm(CN, axis=1, keepdims=True) + 1e-12
log('normaller hazır')

# ---- köşeler üçgen başına; ağırlıklar ve telefon karşılığı
NP = V[T].reshape(-1, 3)
dist, lt, lw = nearest_lq(NP, CN)
NU = oU[rep[T.ravel()]]
jw = {}
J3 = lJ[lT[lt]]          # n,3,4
W3 = lW[lT[lt]] * lw[:, :, None]
Jf = J3.reshape(len(NP), 12); Wf = W3.reshape(len(NP), 12)
# aynı kemiğin ağırlıklarını topla, en büyük 4'ü al
NJ = np.zeros((len(NP), 4), np.int64); NW = np.zeros((len(NP), 4))
uj = np.unique(Jf)
acc = np.zeros((len(NP), uj.max() + 1))
np.add.at(acc, (np.repeat(np.arange(len(NP)), 12), Jf.ravel()), Wf.ravel())
top = np.argsort(-acc, axis=1)[:, :4]
NJ = top; NW = np.take_along_axis(acc, top, 1); NW /= NW.sum(1, keepdims=True) + 1e-12
# _LQTRI: her köşeye kendi üçgeninin telefon karşılığı (üçgenin ağırlık merkezine en yakın)
cent = (A[keep] + B[keep] + C[keep]) / 3
_, tri_lq, _ = nearest_lq(cent, fnu)
LQ = np.repeat(tri_lq, 3).astype(np.float32)
log('ağırlıklar aktarıldı')

# ---- yaz: telefon sürümünün iskeleti ve sahnesi aynen, mesh yeni
NB = bytearray(); views = []; accs = []
def add_view(data, target=None):
    while len(NB) % 4: NB.append(0)
    v = {'buffer': 0, 'byteOffset': len(NB), 'byteLength': len(data)}
    if target: v['target'] = target
    NB.extend(data); views.append(v); return len(views) - 1
def add_acc(arr, comp, typ, target=None, minmax=False):
    vi = add_view(np.ascontiguousarray(arr).tobytes(), target)
    ac = {'bufferView': vi, 'componentType': comp, 'count': len(arr), 'type': typ}
    if minmax: ac['min'] = arr.min(0).tolist(); ac['max'] = arr.max(0).tolist()
    accs.append(ac); return len(accs) - 1
skip = set(pr['attributes'].values()) | {pr['indices']}
amap = {}
for i, ac in enumerate(lj['accessors']):
    if i in skip: continue
    bv = lj['bufferViews'][ac['bufferView']]
    data = bytes(lbin[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])
    na = dict(ac); na['bufferView'] = add_view(data); amap[i] = len(accs); accs.append(na)
for sk in lj.get('skins', []):
    if 'inverseBindMatrices' in sk: sk['inverseBindMatrices'] = amap[sk['inverseBindMatrices']]
for an in lj.get('animations', []):
    for smp in an['samplers']: smp['input'] = amap[smp['input']]; smp['output'] = amap[smp['output']]
n3 = len(NP)
pr['attributes'] = {'POSITION': add_acc(NP.astype(np.float32), 5126, 'VEC3', 34962, True), 'NORMAL': add_acc(CN.astype(np.float32), 5126, 'VEC3', 34962),
                    'TEXCOORD_0': add_acc(NU.astype(np.float32), 5126, 'VEC2', 34962), 'JOINTS_0': add_acc(NJ.astype(np.uint16), 5123, 'VEC4', 34962),
                    'WEIGHTS_0': add_acc(NW.astype(np.float32), 5126, 'VEC4', 34962), '_LQTRI': add_acc(LQ[:, None], 5126, 'SCALAR', 34962)}
pr['indices'] = add_acc(np.arange(n3, dtype=np.uint32), 5125, 'SCALAR', 34963)
lj.pop('images', None); lj.pop('textures', None); lj.pop('samplers', None)
for m in lj['materials']: m.get('pbrMetallicRoughness', {}).pop('baseColorTexture', None)
lj['bufferViews'] = views; lj['accessors'] = accs; lj['buffers'] = [{'byteLength': len(NB)}]
lj['extensionsUsed'] = [e for e in lj.get('extensionsUsed', []) if e != 'EXT_texture_webp']
while len(NB) % 4: NB.append(0)
js = json.dumps(lj, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(a.out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(NB)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack('<II', len(NB), 0x004E4942)); f.write(NB)
log(a.out, 'yazıldı', len(T), 'üçgen', len(NB) // 1024, 'KB')
