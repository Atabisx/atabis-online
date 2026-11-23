# Takı/aksesuar modellerini (bilezik, küpe, taç...) telefona uygun hale getirir.
# Meshopt ile sıkıştırılmış (EXT_meshopt_compression) dosyaları da açar; tek parça, iskeletsiz modeller içindir.
# Kullanım: python3 tools/takiglb.py girdi.glb çıktı.glb [--cell 0.004] [--tex 512] [--rx 90] [--ry 0] [--rz 0]
#           [--metal 0 --rough 0.55]  (oyunda ortam ışığı yok: metal 1 olursa model kararır)
#           [--bend] düz duran kayış/zinciri x ekseni boyunca halkaya kıvırır (bilezik olsun)
#           [--bright 1.3] dokuyu aydınlatır, [--color c8ccd8] dokusuz modele renk verir
#           [--part 0,1]   (bağlı parçalardan sadece bunları al; büyükten küçüğe sıralı, --list ile görülür)
#   --cell: en uzun kenarın bu oranındaki hücreye düşen noktaları birleştirir (küçüldükçe ayrıntı artar)
import sys, os, json, struct, io, argparse
import numpy as np
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import meshopt

ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst', nargs='?')
ap.add_argument('--cell', type=float, default=0.004); ap.add_argument('--tex', type=int, default=512)
ap.add_argument('--rx', type=float, default=0); ap.add_argument('--ry', type=float, default=0); ap.add_argument('--rz', type=float, default=0)
ap.add_argument('--part', default=''); ap.add_argument('--bend', action='store_true'); ap.add_argument('--list', action='store_true')
ap.add_argument('--bright', type=float, default=1.0); ap.add_argument('--color', default='')
ap.add_argument('--metal', type=float, default=None); ap.add_argument('--rough', type=float, default=None)
a = ap.parse_args()

b = open(a.src, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); BIN = b[20 + L + 8:]
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}
DT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}
NORM = {np.uint16: 65535.0, np.int16: 32767.0, np.uint8: 255.0, np.int8: 127.0}

def view_bytes(i):
    bv = j['bufferViews'][i]
    e = bv.get('extensions', {}).get('EXT_meshopt_compression')
    if e:
        raw = BIN[e.get('byteOffset', 0): e.get('byteOffset', 0) + e['byteLength']]
        if e['mode'] == 'TRIANGLES':
            idx = meshopt.decode_index(raw, e['count'])
            return (idx.astype(np.uint32) if e['byteStride'] == 4 else idx.astype(np.uint16)).tobytes(), e['byteStride']
        v = meshopt.decode_vertex(raw, e['count'], e['byteStride'])
        if e.get('filter') == 'OCTAHEDRAL': v = meshopt.filter_oct(v, e['byteStride'])
        elif e.get('filter') not in (None, 'NONE'): raise SystemExit('desteklenmeyen meshopt filtresi: ' + e['filter'])
        return v.tobytes(), e['byteStride']
    o = bv.get('byteOffset', 0)
    return BIN[o:o + bv['byteLength']], bv.get('byteStride', 0)

def read(i):
    ac = j['accessors'][i]; n = NC[ac['type']]; dt = DT[ac['componentType']]
    raw, stride = view_bytes(ac['bufferView']); off = ac.get('byteOffset', 0); isz = np.dtype(dt).itemsize * n
    if stride and stride != isz:
        arr = np.frombuffer(raw, np.uint8)[off:off + stride * ac['count']].reshape(ac['count'], stride)[:, :isz]
        out = np.ascontiguousarray(arr).view(dt).reshape(-1, n)
    else:
        out = np.frombuffer(raw, dt, ac['count'] * n, off).reshape(-1, n)
    out = out.astype(np.float64)
    if ac.get('normalized'): out = np.maximum(out / NORM[dt], -1.0)
    return out

def node_matrix(n):
    if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
    t = np.array(n.get('translation', [0, 0, 0])); s = np.array(n.get('scale', [1, 1, 1]))
    x, y, z, w = n.get('rotation', [0, 0, 0, 1])
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4); M[:3, :3] = R * s; M[:3, 3] = t
    return M

# sahnedeki bütün mesh'leri dünya koordinatında topla
Ps, Us, Ts, mats = [], [], [], set()
def walk(ni, M):
    n = j['nodes'][ni]; M = M @ node_matrix(n)
    if 'mesh' in n:
        for p in j['meshes'][n['mesh']]['primitives']:
            P = read(p['attributes']['POSITION']); P = P @ M[:3, :3].T + M[:3, 3]
            U = read(p['attributes']['TEXCOORD_0']) if 'TEXCOORD_0' in p['attributes'] else np.zeros((len(P), 2))
            I = read(p['indices']).ravel().astype(np.int64) if 'indices' in p else np.arange(len(P))
            Ts.append(I.reshape(-1, 3) + sum(len(x) for x in Ps)); Ps.append(P); Us.append(U); mats.add(p.get('material'))
    for c in n.get('children', []): walk(c, M)
for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4))
P = np.concatenate(Ps); U = np.concatenate(Us); T = np.concatenate(Ts)
if len(mats) > 1: print('uyarı: birden fazla malzeme var, ilki kullanılıyor')
mat = j['materials'][list(mats)[0]] if j.get('materials') and list(mats)[0] is not None else {}
print('girdi:', len(P), 'nokta,', len(T), 'üçgen')

# döndür (derece; önce x, sonra y, sonra z)
def rot(ax, deg):
    c, s = np.cos(np.radians(deg)), np.sin(np.radians(deg))
    return {'x': np.array([[1, 0, 0], [0, c, -s], [0, s, c]]), 'y': np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]]),
            'z': np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[ax]
P = P @ (rot('z', a.rz) @ rot('y', a.ry) @ rot('x', a.rx)).T

# bağlı parçalar (aynı konumdaki dikiş kopyaları birleşik sayılır)
if a.list or a.part:
    _, pid = np.unique(np.round(P / ((P.max(0) - P.min(0)).max() * 1e-5)).astype(np.int64), axis=0, return_inverse=True); pid = pid.ravel()
    par = np.arange(pid.max() + 1)
    def find(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    for e0, e1 in np.concatenate([pid[T[:, [0, 1]]], pid[T[:, [1, 2]]]]):
        r0, r1 = find(e0), find(e1)
        if r0 != r1: par[r0] = r1
    roots = np.array([find(x) for x in range(len(par))])
    comp = roots[pid[T[:, 0]]]
    ids, cnt = np.unique(comp, return_counts=True); order = ids[np.argsort(-cnt)]
    if a.list:
        for k, c in enumerate(order[:40]):
            V = P[np.unique(T[comp == c])]
            print(f'  parça {k}: {(comp == c).sum()} üçgen, merkez {np.round(V.mean(0), 3)}, boy {np.round(V.max(0) - V.min(0), 3)}')
        if not a.dst: sys.exit()
    if a.part:
        keep = []
        for spec in a.part.split(','):
            if '-' in spec: lo, hi = map(int, spec.split('-')); keep += list(order[lo:hi + 1])
            else: keep.append(order[int(spec)])
        T = T[np.isin(comp, keep)]

used = np.unique(T); remap = np.full(len(P), -1); remap[used] = np.arange(len(used))
P, U, T = P[used], U[used], remap[T]

if a.bend:
    # x boyunca uzanan düz parçayı y ekseni etrafında halkaya sar (uçlar birleşir)
    x0, x1 = P[:, 0].min(), P[:, 0].max(); Lx = (x1 - x0) * 1.03; r = Lx / (2 * np.pi)
    th = (P[:, 0] - x0) / Lx * 2 * np.pi; rr = r + (P[:, 2] - P[:, 2].mean())
    P = np.stack([rr * np.sin(th), P[:, 1], rr * np.cos(th)], 1)

# sadeleştir: hücre kümeleme (doku dikişleri ayrı kalır)
if a.cell:
    h = (P.max(0) - P.min(0)).max() * a.cell
    cell = np.floor(P / h).astype(np.int64)
    _, cinv, ccnt = np.unique(cell, axis=0, return_inverse=True, return_counts=True); cinv = cinv.ravel()
    cavg = np.zeros((len(ccnt), 3)); np.add.at(cavg, cinv, P); cavg /= ccnt[:, None]
    key = np.concatenate([cell, np.floor(U * 64).astype(np.int64)], 1)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True); inv = inv.ravel()
    P = cavg[cinv[first]]; U = U[first]; T = inv[T]
    T = T[(T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])]
    _, fi = np.unique(np.sort(T, 1), axis=0, return_index=True); T = T[np.sort(fi)]
    used = np.unique(T); remap = np.full(len(P), -1); remap[used] = np.arange(len(used))
    P, U, T = P[used], U[used], remap[T]

# yumuşak normaller (aynı konumdaki noktalar ortak normal alır)
fn = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
_, pinv = np.unique(np.round(P / ((P.max(0) - P.min(0)).max() * 1e-6)).astype(np.int64), axis=0, return_inverse=True); pinv = pinv.ravel()
acc = np.zeros((pinv.max() + 1, 3))
for k in range(3): np.add.at(acc, pinv[T[:, k]], fn)
N = acc[pinv]; ln = np.linalg.norm(N, axis=1, keepdims=True); ln[ln == 0] = 1; N /= ln
print('çıktı:', len(P), 'nokta,', len(T), 'üçgen')
if not a.dst: sys.exit()

# doku
pbr = mat.get('pbrMetallicRoughness', {})
img_bytes = None
tex = pbr.get('baseColorTexture')
if tex:
    t = j['textures'][tex['index']]
    src = t.get('source', t.get('extensions', {}).get('EXT_texture_webp', {}).get('source'))
    im = j['images'][src]; raw, _ = view_bytes(im['bufferView'])
    img = Image.open(io.BytesIO(raw)).convert('RGB')
    if a.tex and max(img.size) > a.tex: img.thumbnail((a.tex, a.tex), Image.LANCZOS)
    if a.bright != 1.0: img = Image.fromarray(np.clip(np.asarray(img, np.float32) * a.bright, 0, 255).astype(np.uint8))
    out = io.BytesIO(); img.save(out, 'JPEG', quality=86); img_bytes = out.getvalue()

# GLB yaz
blobs, views, accs = [], [], []
def add(arr, target=None, comp=5126, typ='VEC3', minmax=False):
    data = arr.tobytes(); off = sum(len(x) for x in blobs)
    blobs.append(data + b'\0' * (-len(data) % 4))
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
    if target: v['target'] = target
    views.append(v)
    if comp is None: return len(views) - 1
    ac = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if minmax: ac['min'] = arr.min(0).tolist(); ac['max'] = arr.max(0).tolist()
    accs.append(ac); return len(accs) - 1
attrs = {'POSITION': add(P.astype(np.float32), 34962, minmax=True), 'NORMAL': add(N.astype(np.float32), 34962)}
if img_bytes: attrs['TEXCOORD_0'] = add(U.astype(np.float32), 34962, typ='VEC2')
big = len(P) > 65535
ind = add(T.ravel().astype(np.uint32 if big else np.uint16), 34963, 5125 if big else 5123, 'SCALAR')
m = {'name': 'taki', 'pbrMetallicRoughness': {'metallicFactor': pbr.get('metallicFactor', 1.0) if a.metal is None else a.metal,
                                               'roughnessFactor': pbr.get('roughnessFactor', 1.0) if a.rough is None else a.rough}}
if a.color: m['pbrMetallicRoughness']['baseColorFactor'] = [int(a.color[i:i + 2], 16) / 255 for i in (0, 2, 4)] + [1.0]
elif 'baseColorFactor' in pbr and not img_bytes: m['pbrMetallicRoughness']['baseColorFactor'] = pbr['baseColorFactor']
g = {'asset': {'version': '2.0', 'generator': 'atabis takiglb.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
     'nodes': [{'name': os.path.splitext(os.path.basename(a.dst))[0], 'mesh': 0}],
     'meshes': [{'primitives': [{'attributes': attrs, 'indices': ind, 'material': 0}]}], 'materials': [m]}
if img_bytes:
    iv = add(np.frombuffer(img_bytes, np.uint8), comp=None)
    g['images'] = [{'bufferView': iv, 'mimeType': 'image/jpeg'}]; g['textures'] = [{'source': 0, 'sampler': 0}]
    g['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
    m['pbrMetallicRoughness']['baseColorTexture'] = {'index': 0}
g['accessors'] = accs; g['bufferViews'] = views
binb = b''.join(blobs); g['buffers'] = [{'byteLength': len(binb)}]
js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
with open(a.dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binb), 0x004E4942) + binb)
print('yazıldı:', a.dst, os.path.getsize(a.dst) // 1024, 'KB')
