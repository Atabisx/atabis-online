# ATABİS ONLINE karakter üretici: ateş büyücüsünün iskeleti üstüne kodla yapılmış parçalar.
import sys, json, struct, io, math
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from glb import read, acc

SRC = '/tmp/fm/fm.glb'
J, BIN = read(SRC)
SKIN = J['skins'][0]
IBM = acc(J, BIN, SKIN['inverseBindMatrices']).reshape(-1, 4, 4)
JN = [J['nodes'][n]['name'].replace('mixamorig:', '') for n in SKIN['joints']]
JI = {n: i for i, n in enumerate(JN)}
BW = {n: np.linalg.inv(IBM[i].T)[:3, 3] for i, n in enumerate(JN)}   # kemik başlangıç noktaları (bind)
CHILD = {'Hips': 'Spine', 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head', 'Head': 'HeadTop_End',
         'LeftShoulder': 'LeftArm', 'LeftArm': 'LeftForeArm', 'LeftForeArm': 'LeftHand',
         'RightShoulder': 'RightArm', 'RightArm': 'RightForeArm', 'RightForeArm': 'RightHand',
         'LeftUpLeg': 'LeftLeg', 'LeftLeg': 'LeftFoot', 'LeftFoot': 'LeftToeBase', 'LeftToeBase': 'LeftToe_End',
         'RightUpLeg': 'RightLeg', 'RightLeg': 'RightFoot', 'RightFoot': 'RightToeBase', 'RightToeBase': 'RightToe_End'}
def seg(n):
    a = BW[n]
    if n in CHILD: return a, BW[CHILD[n]]
    if n == 'LeftHand': return a, a + np.array([0.1, 0, 0])
    if n == 'RightHand': return a, a - np.array([0.1, 0, 0])
    return a, a + np.array([0, 0.02, 0])

def src_part(name):
    n = [x for x in J['nodes'] if x.get('name') == name][0]
    p = J['meshes'][n['mesh']]['primitives'][0]
    A = {k: acc(J, BIN, v) for k, v in p['attributes'].items()}
    return Part(A['POSITION'].astype(np.float32), acc(J, BIN, p['indices']).reshape(-1, 3).astype(np.uint32),
                A.get('TEXCOORD_0'), A['JOINTS_0'].astype(np.uint16), A['WEIGHTS_0'].astype(np.float32), N=A['NORMAL'])

class Part:
    def __init__(s, V, F, UV=None, Jt=None, W=None, N=None):
        s.V = np.asarray(V, np.float32); s.F = np.asarray(F, np.uint32).reshape(-1, 3)
        s.UV = np.asarray(UV, np.float32) if UV is not None else np.zeros((len(s.V), 2), np.float32)
        s.J = Jt; s.W = W; s.N = N
    def normals(s):
        if s.N is not None: return s.N
        V, F = s.V, s.F
        fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
        N = np.zeros_like(V)
        for k in range(3): np.add.at(N, F[:, k], fn)
        if getattr(s, 'smooth_weld', True):
            key = np.round(V / 1e-4).astype(np.int64)
            _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.reshape(-1)
            acc_n = np.zeros((inv.max() + 1, 3)); np.add.at(acc_n, inv, N); N = acc_n[inv]
        l = np.linalg.norm(N, axis=1, keepdims=True); l[l < 1e-12] = 1
        s.N = (N / l).astype(np.float32); return s.N

def merge(parts):
    if any(p.J is None for p in parts):
        V, F, UV, off = [], [], [], 0
        for p in parts: V.append(p.V); F.append(p.F + off); UV.append(p.UV); off += len(p.V)
        return Part(np.concatenate(V), np.concatenate(F), np.concatenate(UV))
    V, F, UV, Jt, W, off = [], [], [], [], [], 0
    for p in parts:
        V.append(p.V); F.append(p.F + off); UV.append(p.UV); Jt.append(p.J); W.append(p.W); off += len(p.V)
    m = Part(np.concatenate(V), np.concatenate(F), np.concatenate(UV), np.concatenate(Jt), np.concatenate(W))
    m.N = np.concatenate([p.normals() for p in parts]); return m

# ---------- geometri ----------
def lathe(prof, seg_n=24, c=(0, 0), sx=1.0, sz=1.0, a0=0.0, a1=2 * math.pi, cap_top=False, cap_bot=False, u_rep=1.0):
    """prof: [(y, r)] halkalar; yatay elips. a=0 önde (+z). u açıya, v halkaya göre."""
    closed = abs(a1 - a0 - 2 * math.pi) < 1e-6
    n_a = seg_n + 1
    V, UV = [], []
    ys = [p[0] for p in prof]; yr = (max(ys) - min(ys)) or 1
    for i, (y, r) in enumerate(prof):
        rx, rz = (r if np.isscalar(r) else r[0]), (r if np.isscalar(r) else r[1])
        for k in range(n_a):
            a = a0 + (a1 - a0) * k / seg_n
            V.append((c[0] + math.sin(a) * rx * sx, y, c[1] + math.cos(a) * rz * sz))
            UV.append((k / seg_n * u_rep, (max(ys) - y) / yr))
    F = []
    for i in range(len(prof) - 1):
        for k in range(seg_n):
            a, b = i * n_a + k, i * n_a + k + 1; c2, d = a + n_a, b + n_a
            if prof[i][0] > prof[i + 1][0]: F += [(a, c2, b), (b, c2, d)]
            else: F += [(a, b, c2), (b, d, c2)]
    V = np.array(V, np.float32); UV = np.array(UV, np.float32)
    if closed:   # dikiş noktalarını birleştirmeden bırak (uv dikişi), normaller ortak hesaplanır
        pass
    p = Part(V, F, UV)
    if cap_top or cap_bot:
        extra = []
        for flag, idx in ((cap_top, int(np.argmax(ys))), (cap_bot, int(np.argmin(ys)))):
            if not flag: continue
            y = prof[idx][0]; ci = len(p.V) + len(extra)
            extra.append((c[0], y, c[1]))
            top = idx == int(np.argmax(ys))
            for k in range(seg_n):
                a, b = idx * n_a + k, idx * n_a + k + 1
                p.F = np.vstack([p.F, (a, b, ci) if top else (b, a, ci)])
        if extra:
            p.V = np.vstack([p.V, np.array(extra, np.float32)]); p.UV = np.vstack([p.UV, np.full((len(extra), 2), 0.5, np.float32)])
    return p

def frame_from(axis):
    y = axis / np.linalg.norm(axis)
    t = np.array([0, 0, 1.0]) if abs(y[2]) < 0.9 else np.array([1.0, 0, 0])
    x = np.cross(y, t); x /= np.linalg.norm(x); z = np.cross(x, y)
    return x, y, z

def tube(p0, p1, prof, seg_n=12, sx=1.0, sz=1.0, u_rep=1.0):
    """p0→p1 ekseninde lathe; prof: [(t 0..1, r)]."""
    p0 = np.array(p0, float); p1 = np.array(p1, float); L = np.linalg.norm(p1 - p0)
    x, y, z = frame_from(p1 - p0)
    loc = lathe([(t * L, r) for t, r in prof], seg_n, sx=sx, sz=sz, u_rep=u_rep)
    M = np.stack([x, y, z], 1)
    loc.V = (loc.V @ M.T + p0).astype(np.float32); loc.N = None
    return loc

def ellipsoid(c, r, seg_n=16, rings=10, v0=0.0, v1=1.0, a0=0, a1=2 * math.pi):
    """v: 0 üst kutup, 1 alt kutup; kısmi küre/kubbe için v1<1."""
    prof = []
    for i in range(rings + 1):
        t = v0 + (v1 - v0) * i / rings; th = t * math.pi
        prof.append((c[1] + math.cos(th) * r[1], (max(1e-4, math.sin(th) * r[0]), max(1e-4, math.sin(th) * r[2]))))
    return lathe(prof, seg_n, c=(c[0], c[2]), a0=a0, a1=a1)

def box(c, size, rot=None):
    sx, sy, sz = [s / 2 for s in size]
    V = np.array([[-sx, -sy, -sz], [sx, -sy, -sz], [sx, sy, -sz], [-sx, sy, -sz], [-sx, -sy, sz], [sx, -sy, sz], [sx, sy, sz], [-sx, sy, sz]], np.float32)
    faces = [(0, 2, 1), (0, 3, 2), (4, 5, 6), (4, 6, 7), (0, 1, 5), (0, 5, 4), (3, 6, 2), (3, 7, 6), (0, 4, 7), (0, 7, 3), (1, 2, 6), (1, 6, 5)]
    # düz gölgeleme için köşeleri yüzlere böl
    VV, FF, UU = [], [], []
    for f in faces:
        b = len(VV); VV += [V[i] for i in f]; FF.append((b, b + 1, b + 2)); UU += [(0, 0), (1, 0), (1, 1)]
    VV = np.array(VV)
    if rot is not None: VV = VV @ rot.T
    return Part(VV + np.array(c), FF, UU)

def sheet(rows, u_rep=1.0):
    """rows: [[(x,y,z) ...], ...] ızgara; iki yüzlü malzeme ile kullanılır."""
    R = len(rows); C = len(rows[0]); V, UV, F = [], [], []
    for i, row in enumerate(rows):
        for k, p in enumerate(row): V.append(p); UV.append((k / (C - 1) * u_rep, i / (R - 1)))
    for i in range(R - 1):
        for k in range(C - 1):
            a = i * C + k; F += [(a, a + C, a + 1), (a + 1, a + C, a + C + 1)]
    return Part(V, F, UV)

def rotm(ax, ang):
    ax = np.array(ax, float); ax /= np.linalg.norm(ax); c, s = math.cos(ang), math.sin(ang); x, y, z = ax
    return np.array([[c + x * x * (1 - c), x * y * (1 - c) - z * s, x * z * (1 - c) + y * s],
                     [y * x * (1 - c) + z * s, c + y * y * (1 - c), y * z * (1 - c) - x * s],
                     [z * x * (1 - c) - y * s, z * y * (1 - c) + x * s, c + z * z * (1 - c)]])
def xform(p, R=None, t=(0, 0, 0), pivot=(0, 0, 0)):
    V = p.V - np.array(pivot)
    if R is not None: V = V @ np.array(R).T
    p.V = (V + np.array(pivot) + np.array(t)).astype(np.float32); p.N = None; return p
def mirror_x(p):
    q = Part(p.V * np.array([-1, 1, 1], np.float32), p.F[:, ::-1].copy(), p.UV.copy()); return q

# ---------- deri ağırlıkları ----------
def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / max(1e-9, ab @ ab), 0, 1)
    return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
def skin_auto(p, bones, power=4, falloff=None):
    D = np.stack([seg_dist(p.V, *seg(b)) for b in bones], 1)
    w = 1.0 / (D ** power + 1e-7)
    idx = np.argsort(-w, 1)[:, :4]
    ww = np.take_along_axis(w, idx, 1); ww /= ww.sum(1, keepdims=True)
    p.J = np.array([[JI[bones[i]] for i in row] for row in idx], np.uint16)
    if p.J.shape[1] < 4:
        pad = 4 - p.J.shape[1]; p.J = np.pad(p.J, ((0, 0), (0, pad))); ww = np.pad(ww, ((0, 0), (0, pad)))
    p.W = ww.astype(np.float32); return p
def skin_rigid(p, bone):
    p.J = np.zeros((len(p.V), 4), np.uint16); p.J[:, 0] = JI[bone]
    p.W = np.zeros((len(p.V), 4), np.float32); p.W[:, 0] = 1; return p
def skin_fn(p, fn):
    """fn(v) -> {bone: weight}"""
    Jt = np.zeros((len(p.V), 4), np.uint16); W = np.zeros((len(p.V), 4), np.float32)
    for i, v in enumerate(p.V):
        d = sorted(fn(v).items(), key=lambda kv: -kv[1])[:4]; s = sum(x[1] for x in d) or 1
        for k, (b, w) in enumerate(d): Jt[i, k] = JI[b]; W[i, k] = w / s
    p.J, p.W = Jt, W; return p

# ---------- doku boyama ----------
def png(img):
    b = io.BytesIO(); img.save(b, 'PNG', optimize=True); return b.getvalue()
def hexc(h, a=255):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (a,)
def shade(h, k):
    c = hexc(h); return tuple(max(0, min(255, int(v * k))) for v in c[:3]) + (255,)

# ---------- GLB yazıcı ----------
class Writer:
    def __init__(s, title):
        s.title = title; s.bin = bytearray(); s.views = []; s.accs = []; s.mats = []; s.texs = []; s.imgs = []; s.meshes = []; s.mesh_nodes = []
    def _view(s, data, target=None):
        while len(s.bin) % 4: s.bin.append(0)
        off = len(s.bin); s.bin += data
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: v['target'] = target
        s.views.append(v); return len(s.views) - 1
    def _acc(s, arr, ctype, typ, target=None, minmax=False, normalized=False):
        v = s._view(arr.tobytes(), target)
        a = {'bufferView': v, 'componentType': ctype, 'count': int(arr.shape[0]), 'type': typ}
        if normalized: a['normalized'] = True
        if minmax: a['min'] = [float(x) for x in arr.min(0)]; a['max'] = [float(x) for x in arr.max(0)]
        s.accs.append(a); return len(s.accs) - 1
    def texture(s, img):
        v = s._view(png(img)); s.imgs.append({'bufferView': v, 'mimeType': 'image/png'})
        s.texs.append({'source': len(s.imgs) - 1, 'sampler': 0}); return len(s.texs) - 1
    def material(s, name, color='#ffffff', tex=None, unlit=False, double=False, rough=0.85, metal=0.0, emissive=None):
        m = {'name': name, 'pbrMetallicRoughness': {'baseColorFactor': [round((c / 255) ** 2.2, 5) for c in hexc(color)[:3]] + [1], 'roughnessFactor': rough, 'metallicFactor': metal}}
        if tex is not None: m['pbrMetallicRoughness']['baseColorTexture'] = {'index': s.texture(tex) if not isinstance(tex, int) else tex}
        if unlit: m['extensions'] = {'KHR_materials_unlit': {}}
        if double: m['doubleSided'] = True
        if emissive: m['emissiveFactor'] = [(c / 255) ** 2.2 for c in hexc(emissive)[:3]]
        s.mats.append(m); return len(s.mats) - 1
    def mesh(s, name, p, mat):
        p.normals()
        F = p.F.astype(np.uint32 if len(p.V) > 65535 else np.uint16).reshape(-1)
        attrs = {'POSITION': s._acc(p.V.astype(np.float32), 5126, 'VEC3', 34962, True),
                 'NORMAL': s._acc(p.N.astype(np.float32), 5126, 'VEC3', 34962),
                 'TEXCOORD_0': s._acc(p.UV.astype(np.float32), 5126, 'VEC2', 34962),
                 'JOINTS_0': s._acc(p.J.astype(np.uint16), 5123, 'VEC4', 34962),
                 'WEIGHTS_0': s._acc(p.W.astype(np.float32), 5126, 'VEC4', 34962)}
        ind = s._acc(F.reshape(-1, 1), 5125 if F.dtype == np.uint32 else 5123, 'SCALAR', 34963)
        s.meshes.append({'name': name, 'primitives': [{'attributes': attrs, 'indices': ind, 'material': mat}]})
        s.mesh_nodes.append((name, len(s.meshes) - 1))
    def save(s, path):
        nodes = json.loads(json.dumps(J['nodes']))
        # eski mesh düğümlerini at: yalnızca iskelet + üst gruplar kalsın
        keep = {0, 1} | set(SKIN['joints'])
        remap = {}; out = []
        for i, n in enumerate(nodes):
            if i in keep: remap[i] = len(out); out.append(n)
        for n in out:
            n.pop('mesh', None); n.pop('skin', None)
            if 'children' in n: n['children'] = [remap[c] for c in n['children'] if c in remap]
            if n.get('name') == 'fire-mage': n['name'] = s.title
            if n.get('extras'): n['extras'] = {'partId': 'character', 'partLabel': s.title}
        ibm = s._acc(IBM.astype(np.float32).reshape(-1, 16), 5126, 'MAT4')
        skin = {'joints': [remap[j] for j in SKIN['joints']], 'inverseBindMatrices': ibm, 'skeleton': remap[SKIN['skeleton']]}
        holder = [k for k, n in enumerate(out) if n.get('name') == s.title][0]
        for name, mi in s.mesh_nodes:
            out.append({'name': f'{s.title}.{name}', 'mesh': mi, 'skin': 0}); out[holder].setdefault('children', []).append(len(out) - 1)
        g = {'asset': {'version': '2.0', 'generator': 'ATABIS karakter ureticisi'}, 'scene': 0, 'scenes': [{'name': 'AuxScene', 'nodes': [0]}],
             'nodes': out, 'skins': [skin], 'meshes': s.meshes, 'materials': s.mats, 'textures': s.texs, 'images': s.imgs,
             'samplers': [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 33071}],
             'accessors': s.accs, 'bufferViews': s.views, 'buffers': [{'byteLength': len(s.bin)}], 'extensionsUsed': ['KHR_materials_unlit']}
        if not s.texs: g.pop('textures'); g.pop('images'); g.pop('samplers')
        js = json.dumps(g, separators=(',', ':')).encode()
        while len(js) % 4: js += b' '
        while len(s.bin) % 4: s.bin.append(0)
        total = 12 + 8 + len(js) + 8 + len(s.bin)
        with open(path, 'wb') as f:
            f.write(struct.pack('<III', 0x46546C67, 2, total)); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
            f.write(struct.pack('<II', len(s.bin), 0x004E4942)); f.write(bytes(s.bin))
        return total

def outline(parts, w=0.009):
    """ters kabuk çizgi: normaller boyunca şişir, yüzleri ters çevir."""
    out = []
    for p in parts:
        N = p.normals()
        q = Part(p.V + N * w, p.F[:, ::-1].copy(), p.UV.copy(), p.J.copy(), p.W.copy())
        out.append(q)
    return merge(out)
