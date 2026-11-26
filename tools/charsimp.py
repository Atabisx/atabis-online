# Karakteri orijinal dokusu ve UV düzeniyle sadeleştirip iskeletler (doku pişirmeye gerek kalmaz).
#
# Neden: önceki yöntemler ya doku parçalarını karıştırıyordu (yamalı görünüm) ya da her üçgene ayrı doku
# hücresi verdiği için hücre kenarlarında ince çizgiler oluşuyordu. Burada:
#  - orijinalin UV adaları (doku parçaları) bulunur; köşeler sadece AYNI ada içinde birleştirilir,
#    böylece her üçgen kendi doku parçasında kalır ve orijinal doku birebir kullanılır,
#  - konumlar hücre bazında bütün adalar için ortaktır: adalar arasında çatlak oluşmaz,
#  - iskelet ağırlıkları telefon sürümünün (iskeletli sade model) en yakın üçgeninden aktarılır,
#  - _LQTRI: giyilen zırhların gizlediği gövde üçgenleri telefon sürümüne göre hazırlandığı için eşleme.
#
# Kullanım: python3 tools/charsimp.py iskeletli_eski.glb orijinal.glb cikti.glb --tris 150000 [--tex 2048]
import sys, json, struct, io, argparse, time
import numpy as np
from scipy.spatial import cKDTree
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import connected_components
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument('lq'); ap.add_argument('orig'); ap.add_argument('out')
ap.add_argument('--tris', type=int, default=150000); ap.add_argument('--tex', type=int, default=0); ap.add_argument('--keep', type=float, default=0.03)
ap.add_argument('--q', type=int, default=90)
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


# ---------------------------------------------------------------- orijinal
oj, obin = read(a.orig); OW = node_world(oj)
oP, oU, oT = [], [], []; base = 0
for ni, M in OW.items():
    nd = oj['nodes'][ni]
    if 'mesh' not in nd: continue
    for pr in oj['meshes'][nd['mesh']]['primitives']:
        oP.append(accessor(oj, obin, pr['attributes']['POSITION']).astype(np.float64) @ M[:3, :3].T + M[:3, 3])
        oU.append(accessor(oj, obin, pr['attributes']['TEXCOORD_0']).astype(np.float64))
        oT.append(accessor(oj, obin, pr['indices']).reshape(-1, 3).astype(np.int64) + base); base += len(oP[-1])
oP = np.concatenate(oP); oU = np.concatenate(oU); oT = np.concatenate(oT)
om = oj['materials'][0]; pbr = om.get('pbrMetallicRoughness', {})
tr = pbr.get('baseColorTexture', {}).get('extensions', {}).get('KHR_texture_transform', {})
oU = oU * np.array(tr.get('scale', [1, 1])) + np.array(tr.get('offset', [0, 0]))
log('orijinal', len(oT), 'üçgen', len(oP), 'köşe')

# ---------------------------------------------------------------- iskeletli eski sürüm ve hizalama
lj, lbin = read(a.lq); lpr = lj['meshes'][0]['primitives'][0]
lP = accessor(lj, lbin, lpr['attributes']['POSITION']); lU = accessor(lj, lbin, lpr['attributes']['TEXCOORD_0'])
lJ = accessor(lj, lbin, lpr['attributes']['JOINTS_0']).astype(np.int64); lW = accessor(lj, lbin, lpr['attributes']['WEIGHTS_0']).astype(np.float64)
lT = accessor(lj, lbin, lpr['indices']).reshape(-1, 3).astype(np.int64)
d, idx = cKDTree(oU).query(lU); ok = d < 1e-5
src, dst = oP[idx[ok]], lP[ok]
def umeyama(X, Y):
    mx, my = X.mean(0), Y.mean(0); Xc, Yc = X - mx, Y - my
    U_, S, Vt = np.linalg.svd(Yc.T @ Xc / len(X)); D = np.eye(3)
    if np.linalg.det(U_ @ Vt) < 0: D[2, 2] = -1
    R = U_ @ D @ Vt; s = np.trace(np.diag(S) @ D) / (Xc ** 2).sum(1).mean(); return s, R, my - s * R @ mx
sel = np.ones(len(src), bool)
for _ in range(4):
    s, R, t = umeyama(src[sel], dst[sel]); err = np.linalg.norm(src @ R.T * s + t - dst, axis=1); sel = err < np.percentile(err, 80)
oP = oP @ R.T * s + t
log(f'hizalama: {ok.sum()} eşleşme, ölçek {s:.4f}, ortanca hata {np.median(err) * 1000:.1f} mm')

# ---------------------------------------------------------------- UV adaları (doku parçaları)
nv = len(oP)
E = np.concatenate([oT[:, [0, 1]], oT[:, [1, 2]], oT[:, [2, 0]]])
nisl, isl = connected_components(coo_matrix((np.ones(len(E)), (E[:, 0], E[:, 1])), shape=(nv, nv)), directed=False)
log('UV adası:', nisl)

# ---------------------------------------------------------------- sadeleştirme: hücre (konum) + ada
H = np.ptp(oP, 0).max()
def simplify(cell):
    c = np.floor(oP / cell).astype(np.int64)
    _, cid = np.unique(c, axis=0, return_inverse=True); cid = cid.ravel()
    key = cid.astype(np.int64) * (nisl + 1) + isl
    _, kid = np.unique(key, return_inverse=True); kid = kid.ravel()
    T = kid[oT]
    T = T[(T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])]
    _, fi = np.unique(np.sort(T, 1), axis=0, return_index=True)
    return cid, kid, T[np.sort(fi)]
lo, hi = H / 3000, H / 40
for _ in range(16):
    mid = (lo * hi) ** 0.5; _, _, T = simplify(mid)
    if len(T) > a.tris: lo = mid
    else: hi = mid
cid, kid, T = simplify(hi)
nk = kid.max() + 1; ncell = cid.max() + 1
# konum: hücredeki BÜTÜN köşelerin ortalaması (adalar arası çatlak olmasın); UV: anahtarın kendi köşelerinin ortalaması
cnt = np.bincount(cid, minlength=ncell).astype(np.float64)
cpos = np.zeros((ncell, 3)); np.add.at(cpos, cid, oP); cpos /= cnt[:, None]
k2c = np.zeros(nk, np.int64); k2c[kid] = cid
V = cpos[k2c]
kc = np.bincount(kid, minlength=nk).astype(np.float64)
UV = np.zeros((nk, 2)); np.add.at(UV, kid, oU); UV /= kc[:, None]
log(f'sadeleşti: hücre {hi * 1000:.2f} mm → {len(T)} üçgen')

# ---------------------------------------------------------------- telefon sürümünde olmayan parçalar
LA, LB, LC = lP[lT[:, 0]], lP[lT[:, 1]], lP[lT[:, 2]]
lkd = cKDTree((LA + LB + LC) / 3)
lfn = np.cross(LB - LA, LC - LA); lfn /= np.linalg.norm(lfn, axis=1, keepdims=True) + 1e-12
def nearest_lq(Pq, Nq=None, k=10):
    _, cand = lkd.query(Pq, k=k, workers=-1)
    bd = np.full(len(Pq), np.inf); bt = np.zeros(len(Pq), np.int64); bw = np.zeros((len(Pq), 3))
    for kk in range(k):
        c = cand[:, kk]; w = np.clip(bary(Pq, LA[c], LB[c], LC[c]), 0, 1); w /= w.sum(1, keepdims=True)
        dd = np.linalg.norm(w[:, 0:1] * LA[c] + w[:, 1:2] * LB[c] + w[:, 2:3] * LC[c] - Pq, axis=1)
        if Nq is not None: dd = dd + np.where((lfn[c] * Nq).sum(1) < 0, 0.01, 0)
        b = dd < bd; bd[b] = dd[b]; bt[b] = c[b]; bw[b] = w[b]
    return bd, bt, bw
A, B, C = V[T[:, 0]], V[T[:, 1]], V[T[:, 2]]
dist, _, _ = nearest_lq((A + B + C) / 3)
T = T[dist < a.keep]
log(f'telefon sürümünde olmayan {int((dist >= a.keep).sum())} üçgen atıldı, kalan {len(T)}')

# kullanılan köşeleri sıkıştır
used = np.unique(T); remap = np.full(nk, -1); remap[used] = np.arange(len(used))
T = remap[T]; V = V[used]; UV = UV[used]
# köşe normalleri: aynı adadaki yüzlerin alan ağırlıklı ortalaması (adalar ayrı köşe olduğundan pelerinin iki yüzü karışmaz)
fn = np.cross(V[T[:, 1]] - V[T[:, 0]], V[T[:, 2]] - V[T[:, 0]])
VN = np.zeros_like(V)
for k in range(3): np.add.at(VN, T[:, k], fn)
VN /= np.linalg.norm(VN, axis=1, keepdims=True) + 1e-12
# iskelet ağırlıkları ve telefon karşılığı
dist, lt, lw = nearest_lq(V, VN)
Jf = lJ[lT[lt]].reshape(len(V), 12); Wf = (lW[lT[lt]] * lw[:, :, None]).reshape(len(V), 12)
acc = np.zeros((len(V), Jf.max() + 1))
np.add.at(acc, (np.repeat(np.arange(len(V)), 12), Jf.ravel()), Wf.ravel())
NJ = np.argsort(-acc, axis=1)[:, :4]; NW = np.take_along_axis(acc, NJ, 1); NW /= NW.sum(1, keepdims=True) + 1e-12
# baş ve boyun: aktarılan ağırlıklar yüzde ve saçta karışıyordu (baş eğilince yüz çekiliyor, saç yüze düşüyordu).
# Başın kendisi sert biçimde Head kemiğine, boyun bölgesi Neck→Head geçişli bağlanır.
jn = [lj['nodes'][i].get('name', '') for i in lj['skins'][0]['joints']]
def jidx(name):
    for i, n_ in enumerate(jn):
        if n_.lower().endswith(name): return i
    return None
hj, nj = jidx('head'), jidx('neck')
if hj is not None and nj is not None:
    ibm = accessor(lj, lbin, lj['skins'][0]['inverseBindMatrices']).reshape(-1, 4, 4).transpose(0, 2, 1)
    jpos = np.array([np.linalg.inv(m)[:3, 3] for m in ibm])
    hp, np_ = jpos[hj], jpos[nj]
    hor = np.linalg.norm((V - hp)[:, [0, 2]], axis=1)
    top = (V[:, 1] >= hp[1]) & (hor < 0.32)
    t = np.clip((V[:, 1] - np_[1]) / max(1e-6, hp[1] - np_[1]), 0, 1)
    neck = (~top) & (V[:, 1] >= np_[1]) & (hor < 0.14)
    for m_, wh in ((top, None), (neck, t)):
        idx_ = np.nonzero(m_)[0]
        if not len(idx_): continue
        NJ[idx_] = 0; NW[idx_] = 0
        NJ[idx_, 0] = hj; NJ[idx_, 1] = nj
        NW[idx_, 0] = 1.0 if wh is None else wh[idx_]; NW[idx_, 1] = 0.0 if wh is None else 1 - wh[idx_]
    log(f'baş: {int(top.sum())} köşe Head, boyun: {int(neck.sum())} köşe geçişli')
LQ = lt.astype(np.float32)
log(f'{len(V)} köşe, {len(T)} üçgen; ağırlıklar aktarıldı')

# ---------------------------------------------------------------- yaz
NB = bytearray(); views = []; accs = []
def add_view(data, target=None, stride=None):
    while len(NB) % 4: NB.append(0)
    v = {'buffer': 0, 'byteOffset': len(NB), 'byteLength': len(data)}
    if target: v['target'] = target
    if stride: v['byteStride'] = stride
    NB.extend(data); views.append(v); return len(views) - 1
def add_acc(arr, comp, typ, target=None, minmax=False, norm=False, stride=None, count=None):
    arr = np.ascontiguousarray(arr)
    vi = add_view(arr.tobytes(), target, stride)
    ac = {'bufferView': vi, 'componentType': comp, 'count': count or len(arr), 'type': typ}
    if norm: ac['normalized'] = True
    if minmax: ac['min'] = arr.min(0).tolist(); ac['max'] = arr.max(0).tolist()
    accs.append(ac); return len(accs) - 1
skip = set(lpr['attributes'].values()) | {lpr['indices']}
amap = {}
for i, ac in enumerate(lj['accessors']):
    if i in skip: continue
    bv = lj['bufferViews'][ac['bufferView']]
    na = dict(ac); na['bufferView'] = add_view(bytes(lbin[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']])); amap[i] = len(accs); accs.append(na)
for sk in lj.get('skins', []):
    if 'inverseBindMatrices' in sk: sk['inverseBindMatrices'] = amap[sk['inverseBindMatrices']]
for an in lj.get('animations', []):
    for smp in an['samplers']: smp['input'] = amap[smp['input']]; smp['output'] = amap[smp['output']]
N8 = np.zeros((len(V), 4), np.int8); N8[:, :3] = np.clip(np.round(VN * 127), -127, 127)
W8 = np.round(NW * 255).astype(np.int64); W8[np.arange(len(V)), W8.argmax(1)] += 255 - W8.sum(1); W8 = np.clip(W8, 0, 255).astype(np.uint8)
uv_ok = UV.min() >= 0 and UV.max() <= 1
attrs = {'POSITION': add_acc(V.astype(np.float32), 5126, 'VEC3', 34962, True),
         'NORMAL': add_acc(N8, 5120, 'VEC3', 34962, norm=True, stride=4),
         'TEXCOORD_0': add_acc(np.round(UV * 65535).astype(np.uint16), 5123, 'VEC2', 34962, norm=True) if uv_ok else add_acc(UV.astype(np.float32), 5126, 'VEC2', 34962),
         'JOINTS_0': add_acc(NJ.astype(np.uint8 if NJ.max() < 256 else np.uint16), 5121 if NJ.max() < 256 else 5123, 'VEC4', 34962),
         'WEIGHTS_0': add_acc(W8, 5121, 'VEC4', 34962, norm=True),
         '_LQTRI': add_acc(LQ[:, None], 5126, 'SCALAR', 34962)}
lpr['attributes'] = attrs
lpr['indices'] = add_acc(T.astype(np.uint32).ravel(), 5125, 'SCALAR', 34963)

# dokular: orijinalin kendisi (isteğe bağlı küçültülür)
images, textures = [], []
def tex_of(t):
    osrc = oj['textures'][t['index']]
    src = osrc.get('extensions', {}).get('EXT_texture_webp', {}).get('source', osrc.get('source'))
    im = oj['images'][src]; bv = oj['bufferViews'][im['bufferView']]
    data = bytes(obin[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]); mime = im.get('mimeType', 'image/webp')
    if a.tex:
        img = Image.open(io.BytesIO(data))
        if max(img.size) > a.tex:
            img = img.resize((a.tex, a.tex), Image.LANCZOS); o = io.BytesIO(); img.save(o, 'WEBP', quality=a.q, method=6); data = o.getvalue(); mime = 'image/webp'
    vi = add_view(data); images.append({'bufferView': vi, 'mimeType': mime})
    textures.append({'sampler': 0, **({'extensions': {'EXT_texture_webp': {'source': len(images) - 1}}} if mime == 'image/webp' else {'source': len(images) - 1})})
    return len(textures) - 1
mt = lj['materials'][0]
for k in ('normalTexture', 'emissiveTexture', 'emissiveFactor', 'occlusionTexture'): mt.pop(k, None)
p2 = {'baseColorTexture': {'index': tex_of(pbr['baseColorTexture'])}}
if 'baseColorFactor' in pbr: p2['baseColorFactor'] = pbr['baseColorFactor']
if 'metallicRoughnessTexture' in pbr: p2['metallicRoughnessTexture'] = {'index': tex_of(pbr['metallicRoughnessTexture'])}
p2['metallicFactor'] = pbr.get('metallicFactor', 1.0 if 'metallicRoughnessTexture' in pbr else 0.0)
p2['roughnessFactor'] = pbr.get('roughnessFactor', 1.0 if 'metallicRoughnessTexture' in pbr else 0.7)
mt['pbrMetallicRoughness'] = p2
if 'normalTexture' in om: mt['normalTexture'] = {'index': tex_of(om['normalTexture']), **({'scale': om['normalTexture']['scale']} if 'scale' in om['normalTexture'] else {})}
if 'emissiveTexture' in om: mt['emissiveTexture'] = {'index': tex_of(om['emissiveTexture'])}; mt['emissiveFactor'] = om.get('emissiveFactor', [1, 1, 1])
mt['doubleSided'] = om.get('doubleSided', mt.get('doubleSided', False))
lj['images'] = images; lj['textures'] = textures
lj['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
lj['bufferViews'] = views; lj['accessors'] = accs; lj['buffers'] = [{'byteLength': len(NB)}]
ext = set(lj.get('extensionsUsed', [])) | {'KHR_mesh_quantization'} | ({'EXT_texture_webp'} if any('extensions' in t for t in textures) else set())
lj['extensionsUsed'] = sorted(ext); lj['extensionsRequired'] = sorted(set(lj.get('extensionsRequired', [])) | {'KHR_mesh_quantization'})
while len(NB) % 4: NB.append(0)
js = json.dumps(lj, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(a.out, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(NB)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack('<II', len(NB), 0x004E4942)); f.write(NB)
log(a.out, 'yazıldı', len(T), 'üçgen', len(V), 'köşe', len(NB) // 1024, 'KB')
