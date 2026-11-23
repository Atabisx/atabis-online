# İskeletsiz (tek parça, sabit) karakter modeline mixamo iskeleti ve deri ağırlıkları ekler.
# Girdi: takiglb.py ile sadeleştirilmiş GLB + eklem konumları (JSON). Oyun, Soldier'ın yürüme/koşma/saldırı
# hareketlerini kemik yönlerinden bu iskelete aktarır (retarget.js), bu yüzden kemikler dünya eksenine göre düz kurulur.
#
# Kullanım: python3 tools/glbrig.py girdi.glb eklemler.json çıktı.glb [--voxel 0.01] [--cut "x0,x1,y0,y1,z0,z1;..."]
#   eklemler.json: {"Hips":[x,y,z], "Spine":..., "LeftArm":..., ...}  (karakterin solu +x, yüzü +z)
#   --cut: bu kutuların içindeki üçgenleri siler (modelin elindeki kendi silahı gibi; oyun kendi silahını takar)
#
# Ağırlıklar: model içi dolu kabul edilip voksellere bölünür, her kemikten model içinden (jeodezik) uzaklık ölçülür.
# Böylece yana sarkan el, yakındaki kalçaya değil kendi koluna bağlanır. Sonra ağırlıklar yüzey boyunca yumuşatılır.
# Birbirine değen el-el / el-gövde yüzeyleri arasındaki üçgenler silinir ki kollar ayrılınca zar gibi gerilmesin.
import sys, os, json, struct, argparse
import numpy as np
from scipy import ndimage, sparse
from scipy.sparse.csgraph import dijkstra
from scipy.spatial import cKDTree

# (ad, ebeveyn) — mixamo düzeni; ebeveynler önce
BONES = [('Hips', None), ('Spine', 'Hips'), ('Spine1', 'Spine'), ('Spine2', 'Spine1'), ('Neck', 'Spine2'), ('Head', 'Neck'), ('HeadTop_End', 'Head')]
for s in ('Left', 'Right'):
    BONES += [(s + 'Shoulder', 'Spine2'), (s + 'Arm', s + 'Shoulder'), (s + 'ForeArm', s + 'Arm'), (s + 'Hand', s + 'ForeArm'), (s + 'HandMiddle1', s + 'Hand')]
for s in ('Left', 'Right'):
    BONES += [(s + 'UpLeg', 'Hips'), (s + 'Leg', s + 'UpLeg'), (s + 'Foot', s + 'Leg'), (s + 'ToeBase', s + 'Foot'), (s + 'Toe_End', s + 'ToeBase')]
NAMES = [b for b, _ in BONES]
PARENT = {b: p for b, p in BONES}
# ağırlık almayan uç kemikler
TIPS = {'HeadTop_End', 'LeftHandMiddle1', 'RightHandMiddle1', 'LeftToe_End', 'RightToe_End'}
# kemik parçası: kemikten hangi çocuğuna doğru uzanır
SEG_CHILD = {'Hips': None, 'Spine': 'Spine1', 'Spine1': 'Spine2', 'Spine2': 'Neck', 'Neck': 'Head', 'Head': 'HeadTop_End'}
for s in ('Left', 'Right'):
    SEG_CHILD.update({s + 'Shoulder': s + 'Arm', s + 'Arm': s + 'ForeArm', s + 'ForeArm': s + 'Hand', s + 'Hand': s + 'HandMiddle1',
                      s + 'UpLeg': s + 'Leg', s + 'Leg': s + 'Foot', s + 'Foot': s + 'ToeBase', s + 'ToeBase': s + 'Toe_End'})


def read_glb(path):
    b = open(path, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); BIN = b[20 + L + 8:]
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]
        return np.frombuffer(BIN, dt, a['count'] * n, bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(-1, n)
    p = j['meshes'][0]['primitives'][0]
    P = acc(p['attributes']['POSITION']).astype(np.float64); N = acc(p['attributes']['NORMAL']).astype(np.float64)
    U = acc(p['attributes']['TEXCOORD_0']).astype(np.float64) if 'TEXCOORD_0' in p['attributes'] else None
    T = acc(p['indices']).reshape(-1, 3).astype(np.int64)
    img = None
    if j.get('images'):
        bv = j['bufferViews'][j['images'][0]['bufferView']]; img = BIN[bv['byteOffset']:bv['byteOffset'] + bv['byteLength']]
    return P, N, U, T, img, j['materials'][0]


def seg_dist(X, a, b):
    ab = b - a; t = np.clip(((X - a) @ ab) / max(ab @ ab, 1e-12), 0, 1)
    return np.linalg.norm(X - (a + t[:, None] * ab), axis=1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('joints'); ap.add_argument('dst')
    ap.add_argument('--voxel', type=float, default=0.01); ap.add_argument('--cut', default='')
    ap.add_argument('--power', type=float, default=5.0); ap.add_argument('--smooth', type=int, default=8)
    ap.add_argument('--solid', action='store_true'); ap.add_argument('--hops', type=int, default=2); ap.add_argument('--torso', type=float, default=0.75); ap.add_argument('--limb', type=float, default=0.0, help='kol yarıçapı sınırı (0: yok)'); ap.add_argument('--facing', type=float, default=10.0); ap.add_argument('--shell', type=int, default=0)
    ap.add_argument('--dump', default='', help='ağırlıkları .npz olarak da yaz (deneme için)')
    a = ap.parse_args()

    P, N, U, T, img, mat = read_glb(a.src)
    J = {k: np.array(v, float) for k, v in json.load(open(a.joints)).items() if not k.startswith('_')}
    # eksik uç kemikleri tamamla
    for s, sg in (('Left', 1), ('Right', -1)):
        if s + 'HandMiddle1' not in J: J[s + 'HandMiddle1'] = J[s + 'Hand'] + (J[s + 'Hand'] - J[s + 'ForeArm']) * 0.45
        if s + 'Toe_End' not in J: J[s + 'Toe_End'] = J[s + 'ToeBase'] + np.array([0, 0, 0.06])
        if s + 'Shoulder' not in J: J[s + 'Shoulder'] = J['Spine2'] * 0.4 + J[s + 'Arm'] * 0.6 + np.array([0, 0.02, 0])
    if 'HeadTop_End' not in J: J['HeadTop_End'] = np.array([J['Head'][0], P[:, 1].max(), J['Head'][2]])
    missing = [n for n in NAMES if n not in J]
    if missing: raise SystemExit('eksik eklemler: ' + ', '.join(missing))

    # modelin kendi silahı vb.: kutu içindeki üçgenleri sil
    if a.cut:
        C = P[T].mean(1); keep = np.ones(len(T), bool)
        for box in a.cut.split(';'):
            x0, x1, y0, y1, z0, z1 = map(float, box.split(','))
            keep &= ~((C[:, 0] > x0) & (C[:, 0] < x1) & (C[:, 1] > y0) & (C[:, 1] < y1) & (C[:, 2] > z0) & (C[:, 2] < z1))
        print('kesilen üçgen:', int((~keep).sum()))
        T = T[keep]
    used = np.unique(T); rm = np.full(len(P), -1); rm[used] = np.arange(len(used))
    P, N, T = P[used], N[used], rm[T]
    if U is not None: U = U[used]

    # ---- dolu vokseller ----
    h = a.voxel; lo = P.min(0) - 3 * h
    shape = tuple(np.ceil((P.max(0) + 3 * h - lo) / h).astype(int) + 1)
    surf = np.zeros(shape, bool)
    # üçgen yüzeyini sık örnekle
    A, B, Cc = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    longest = np.maximum(np.maximum(np.linalg.norm(B - A, axis=1), np.linalg.norm(Cc - B, axis=1)), np.linalg.norm(A - Cc, axis=1))
    for n in np.unique(np.clip(np.ceil(longest / (h * 0.5)).astype(int), 1, 40)):
        m = np.ceil(longest / (h * 0.5)).clip(1, 40).astype(int) == n
        g = np.array([(i / n, k / n) for i in range(n + 1) for k in range(n + 1 - i)])
        pts = A[m][:, None] * (1 - g[:, 0] - g[:, 1])[None, :, None] + B[m][:, None] * g[None, :, 0, None] + Cc[m][:, None] * g[None, :, 1, None]
        idx = np.floor((pts.reshape(-1, 3) - lo) / h).astype(int)
        surf[idx[:, 0], idx[:, 1], idx[:, 2]] = True
    closed = ndimage.binary_closing(surf, iterations=1)
    # yüzey kabuğu (içi boş): kola yaslanan gövde yüzeyi koldan ayrı kalır; --solid ile içi dolu kullanılır
    solid = (ndimage.binary_fill_holes(closed) | surf) if a.solid else (ndimage.binary_dilation(surf, iterations=a.shell) if a.shell else surf)
    vox = np.argwhere(solid); nv = len(vox)
    vid = -np.ones(shape, np.int64); vid[tuple(vox.T)] = np.arange(nv)
    print('dolu voksel:', nv)
    # 26 komşuluk grafı
    rows, cols, wts = [], [], []
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dz in (-1, 0, 1):
                if (dx, dy, dz) <= (0, 0, 0): continue
                q = vox + (dx, dy, dz)
                ok = (q >= 0).all(1) & (q < shape).all(1)
                tgt = np.full(nv, -1); tgt[ok] = vid[tuple(q[ok].T)]
                m = tgt >= 0
                rows.append(np.arange(nv)[m]); cols.append(tgt[m]); wts.append(np.full(m.sum(), h * np.sqrt(dx * dx + dy * dy + dz * dz)))
    G = sparse.coo_matrix((np.concatenate(wts), (np.concatenate(rows), np.concatenate(cols))), shape=(nv, nv)).tocsr()
    centers = lo + (vox + 0.5) * h
    tree = cKDTree(centers)

    # ---- her kemiğe jeodezik uzaklık ----
    deform = [n for n in NAMES if n not in TIPS]
    D = np.zeros((len(P), len(deform)))
    _, pv = tree.query(P)                               # her noktanın vokseli
    for bi, n in enumerate(deform):
        a0 = J[n]; c = SEG_CHILD.get(n)
        b0 = J[c] if c else (J['LeftUpLeg'] + J['RightUpLeg']) / 2 * 0.5 + J['Hips'] * 0.5
        s = np.linspace(0, 1, 24)[:, None] * (b0 - a0) + a0
        _, seeds = tree.query(s)
        g = dijkstra(G, directed=False, indices=np.unique(seeds), min_only=True)
        e = seg_dist(P, a0, b0)
        D[:, bi] = np.maximum(g[pv], e * 0.999) + h * 0.5
        if a.limb and any(n.endswith(x) for x in ('Arm', 'ForeArm', 'Hand')):
            # kola yakın sarkan pelerin kola bağlanmasın: kol kemiğinden bu yarıçaptan uzak noktalar kola gitmez
            D[e > a.limb * (1.4 if n.endswith('Hand') else 1.0), bi] = np.inf
        if a.facing and any(n.endswith(x) for x in ('Arm', 'ForeArm', 'Hand')):
            # kemik yüzeyin arkasında olmalı: yüzey normali kemikten dışarı bakmıyorsa (kola yaslanan gövde gibi) uzak say
            ab = b0 - a0; t = np.clip(((P - a0) @ ab) / max(ab @ ab, 1e-12), 0, 1)
            v = P - (a0 + t[:, None] * ab); v /= np.linalg.norm(v, axis=1, keepdims=True) + 1e-9
            cs = (v * N).sum(1)
            # kemiğe çok yakın noktalarda (eklem tahmini birkaç cm kayık olabilir) yön ölçüsü güvenilmez
            near = np.clip((e - 0.04) / 0.04, 0, 1)
            D[:, bi] *= 1 + a.facing * near * np.clip(-cs - 0.1, 0, None)
    # gövde kalın: yüzeyi omurga çizgisinden uzaktır; kol/bacak kadar yakınmış gibi say (göğüs kola gitmesin)
    for bi, n in enumerate(deform):
        if n == 'Hips' or n.startswith('Spine'): D[:, bi] *= a.torso
    D[~np.isfinite(D)] = 1e3
    W = 1.0 / D ** a.power
    W /= W.sum(1, keepdims=True)

    # yüzey boyunca yumuşat
    E = np.concatenate([T[:, [0, 1]], T[:, [1, 2]], T[:, [2, 0]]])
    Adj = sparse.coo_matrix((np.ones(len(E) * 2), (np.concatenate([E[:, 0], E[:, 1]]), np.concatenate([E[:, 1], E[:, 0]]))), shape=(len(P), len(P))).tocsr()
    Adj.data[:] = 1; deg = np.asarray(Adj.sum(1)).ravel(); deg[deg == 0] = 1
    for _ in range(a.smooth):
        W = 0.5 * W + 0.5 * (Adj @ W) / deg[:, None]

    # birbirinden uzak kemiklerin karışımını at (sağ önkol + sol el gibi): baskın kemiğe iskelette en çok 2 adım uzak olanlar kalır
    def chain(n):
        out = [n]
        while PARENT[out[-1]]: out.append(PARENT[out[-1]])
        return out
    def hop(x, y):
        cx, cy = chain(x), chain(y)
        common = next(c for c in cx if c in cy)
        return cx.index(common) + cy.index(common)
    near = np.array([[hop(x, y) <= a.hops for y in deform] for x in deform])
    W = W * near[np.argmax(W, 1)]
    W /= W.sum(1, keepdims=True)
    # en büyük 4 ağırlık
    top = np.argsort(-W, 1)[:, :4]
    TW = np.take_along_axis(W, top, 1); TW[TW < 0.01] = 0; TW /= TW.sum(1, keepdims=True)
    dom = np.array(deform)[top[:, 0]]

    # birbirine değen ayrı uzuvlar arasındaki üçgenleri sil (kollar ayrılınca zar gibi gerilmesin)
    def group(n):
        for s in ('Left', 'Right'):
            if n in (s + 'ForeArm', s + 'Hand'): return s + 'El'
            if n == s + 'Arm': return s + 'Kol'
            if n in (s + 'Leg', s + 'Foot', s + 'ToeBase'): return s + 'Bacak'
        return 'Gövde'
    gr = np.array([group(n) for n in dom])
    bad = np.zeros(len(T), bool)
    for x in range(3):
        g1, g2 = gr[T[:, x]], gr[T[:, (x + 1) % 3]]
        diff = g1 != g2
        # komşu olması doğal olan çiftler: el-kol, kol-gövde
        nat = np.zeros(len(T), bool)
        for s in ('Left', 'Right'):
            pair = {s + 'El', s + 'Kol'}
            nat |= np.array([{u, v} == pair for u, v in zip(g1, g2)])
            nat |= np.array([{u, v} == {s + 'Kol', 'Gövde'} for u, v in zip(g1, g2)])
            nat |= np.array([{u, v} == {s + 'Bacak', 'Gövde'} for u, v in zip(g1, g2)])
        bad |= diff & ~nat
    print('ayrılan üçgen:', int(bad.sum()))
    T = T[~bad]

    if a.dump: np.savez(a.dump, P=P, T=T, top=top, TW=TW, deform=np.array(deform), J=np.array([J[n] for n in NAMES]), names=np.array(NAMES))
    write(a.dst, P, N, U, T, img, mat, J, top, TW, deform)


def write(dst, P, N, U, T, img, mat, J, top, TW, deform):
    jidx = {n: i for i, n in enumerate(NAMES)}
    Jt = np.array([jidx[deform[k]] for k in range(len(deform))])[top]
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
    if U is not None and img: attrs['TEXCOORD_0'] = add(U.astype(np.float32), 34962, typ='VEC2')
    attrs['JOINTS_0'] = add(Jt.astype(np.uint8), 34962, 5121, 'VEC4')
    attrs['WEIGHTS_0'] = add(TW.astype(np.float32), 34962, 5126, 'VEC4')
    big = len(P) > 65535
    ind = add(T.ravel().astype(np.uint32 if big else np.uint16), 34963, 5125 if big else 5123, 'SCALAR')
    ibm = np.stack([np.linalg.inv(np.block([[np.eye(3), J[n][:, None]], [np.zeros((1, 3)), np.ones((1, 1))]])).T for n in NAMES]).astype(np.float32)
    ibm_acc = add(ibm.reshape(-1, 16), comp=5126, typ='MAT4')
    nodes = [{'name': 'Armature', 'children': []}, {'name': 'karakter', 'mesh': 0, 'skin': 0}]
    for n in NAMES:
        p = PARENT[n]; t = J[n] - (J[p] if p else 0)
        nodes.append({'name': 'mixamorig' + n, 'translation': [float(x) for x in t]})
    for n in NAMES:
        k = 2 + jidx[n]; p = PARENT[n]
        if p: nodes[2 + jidx[p]].setdefault('children', []).append(k)
        else: nodes[0]['children'].append(k)
    nodes[0]['children'].append(1)
    pbr = mat.get('pbrMetallicRoughness', {})
    m = {'name': 'karakter', 'pbrMetallicRoughness': {'metallicFactor': pbr.get('metallicFactor', 0), 'roughnessFactor': pbr.get('roughnessFactor', 0.7)}, 'doubleSided': True}
    g = {'asset': {'version': '2.0', 'generator': 'atabis glbrig.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': nodes,
         'meshes': [{'primitives': [{'attributes': attrs, 'indices': ind, 'material': 0}]}], 'materials': [m],
         'skins': [{'joints': [2 + i for i in range(len(NAMES))], 'inverseBindMatrices': ibm_acc, 'skeleton': 2}]}
    if img and U is not None:
        iv = add(np.frombuffer(img, np.uint8), comp=None)
        g['images'] = [{'bufferView': iv, 'mimeType': 'image/jpeg'}]; g['textures'] = [{'source': 0, 'sampler': 0}]
        g['samplers'] = [{'magFilter': 9729, 'minFilter': 9987, 'wrapS': 10497, 'wrapT': 10497}]
        m['pbrMetallicRoughness']['baseColorTexture'] = {'index': 0}
    g['accessors'] = accs; g['bufferViews'] = views
    binb = b''.join(blobs); g['buffers'] = [{'byteLength': len(binb)}]
    js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)))
        f.write(struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binb), 0x004E4942) + binb)
    print('yazıldı:', dst, os.path.getsize(dst) // 1024, 'KB,', len(P), 'nokta,', len(T), 'üçgen')


if __name__ == '__main__':
    main()
