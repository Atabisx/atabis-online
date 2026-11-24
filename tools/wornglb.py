# Özel zırh/kostüm modellerini her sınıfın karakterine giydirir (giyilebilir hâle getirir).
# Zırh karakterin bedenine oturtulur (göğüs eni/derinliği, boyun-kalça/diz boyu), kostümün kolları karakterin
# kollarına çevrilir, tam boy zırhın (Ağır Plaka) kolu-bacağı karakterin kol-bacağına döndürülür.
# Deri ağırlıkları en yakın beden noktalarından aktarılır; giysinin altında kalan beden üçgenleri gizlenir.
#
# Çıktı: client/models/worn/<eşya>_<sınıf>.bin.gz  (oyun bunu karakterin kendi iskeletine bağlar, doku eşyanın GLB'sinden)
# Biçim (gzip içinde): 'ATW1', u32 json boyu, json {nv, nt, nh, lo, sc, i32}, sonra her biri 4 bayta hizalı diziler:
#   konum i16×3 (lo + (q+32768)/65535·sc), normal i8×4, uv u16×2, kemik u8×4, ağırlık u8×4 (toplam 255),
#   üçgen u16×3 (i32 ise u32), gizlenen beden üçgeni aralıkları u32×2 [ilk üçgen, adet]
# Kullanım: python3 tools/wornglb.py [eşya ...]   (verilmezse hepsi)
import sys, os, json, struct, gzip
import numpy as np
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import glbrig

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'client', 'models')
CELL = float(os.environ.get('CELL', 0.006)); UVCELL = float(os.environ.get('UVCELL', 0.015))
CLASSES = ['savasci', 'ninja', 'sura', 'saman', 'okcu']
ITEMS = {
    'zirh_kemik': {'bottom': 'thigh', 'wide': 1.2, 'deep': 1.3},
    'zirh_paladin': {'bottom': 'thigh', 'wide': 1.25, 'deep': 1.3},
    'zirh_altin_pul': {'bottom': 'thigh', 'wide': 1.25, 'deep': 1.3},
    'zirh_kizil_pul': {'bottom': 'thigh', 'wide': 1.2, 'deep': 1.3},
    'zirh_agir_plaka': {'suit': True},
    'kostum_usak': {'bottom': 'knee', 'wide': 1.2, 'deep': 1.3, 'sleeves': True},
    'zirh_ejderderi': {'bottom': 'hips', 'wide': 1.2, 'deep': 1.3},
    # tam boy, miğferli takımlar (miğfer karakterin başına oturur)
    'zirh_yildiz': {'suit': True, 'helm': True}, 'zirh_altin_paladin': {'suit': True, 'helm': True}, 'zirh_auric': {'suit': True, 'helm': True},
    # parça parça (havada duran) Ejder Plaka: her parça kendi kemiğine
    'zirh_ejderplaka': {'pieces': True},
}
# sınıfa özel ölçü düzeltmesi (gerekirse): {"sınıf": {"wide": .., "deep": ..}}
CLASS_FIX = {}


def read_char(path):
    # oyunun karakter GLB'si (glbrig çıktısı): nokta, üçgen, kemik/ağırlık ve eklem konumları
    b = open(path, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); BIN = b[20 + L + 8:]
    def acc(i):
        a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[a['componentType']]
        return np.frombuffer(BIN, dt, a['count'] * n, bv.get('byteOffset', 0) + a.get('byteOffset', 0)).reshape(-1, n)
    pr = j['meshes'][0]['primitives'][0]['attributes']
    P, N, U, T, _, _ = glbrig.read_glb(path)
    Jt = acc(pr['JOINTS_0']).astype(np.int64); W = acc(pr['WEIGHTS_0']).astype(np.float64)
    joints = j['skins'][0]['joints']; names = [j['nodes'][k]['name'].replace('mixamorig', '') for k in joints]
    world = {}
    def walk(k, base):
        n = j['nodes'][k]; p = base + np.array(n.get('translation', [0, 0, 0]))
        world[n['name'].replace('mixamorig', '')] = p
        for c in n.get('children', []): walk(c, p)
    walk(0, np.zeros(3))
    return P, T, Jt, W, names, {k: v for k, v in world.items() if k in names}


def measure_body(P, J):
    cx = (J['LeftArm'][0] + J['RightArm'][0]) / 2
    sw = abs(J['LeftArm'][0] - J['RightArm'][0]) / 2
    yc = J['Spine2'][1]
    m = (np.abs(P[:,1] - yc) < 0.04) & (np.abs(P[:,0] - cx) < sw * 1.0)
    x0, x1 = np.percentile(P[m,0], [4, 96]); z0, z1 = np.percentile(P[m,2], [4, 96])
    # arkadaki pelerin/apolet derinliği şişirmesin: derinlik en fazla göğüs eni kadar, önden ölçülür
    D = min(z1 - z0, 1.05 * (x1 - x0))
    return dict(cx=cx, sw=sw, chestY=yc, chestW=x1 - x0, chestD=D, chestZ=z1 - D / 2)

def measure_armor(A):
    y0, y1 = A[:,1].min(), A[:,1].max(); H = y1 - y0
    yc = y1 - 0.3 * H
    band = np.abs(A[:,1] - yc) < 0.03 * H
    xm = np.median(A[band,0]); core = band & (np.abs(A[:,0] - xm) < np.percentile(np.abs(A[band,0] - xm), 60))
    x0, x1 = np.percentile(A[core,0], [3, 97]); z0, z1 = np.percentile(A[band,2], [5, 95])
    return dict(y0=y0, y1=y1, chestY=yc, chestW=x1 - x0, cx=(x0 + x1) / 2, chestD=z1 - z0, chestZ=(z0 + z1) / 2)

def fit(A, J, P, spec):
    b = measure_body(P, J); a = measure_armor(A)
    top = J['Neck'][1] + spec.get('top', 0.03)
    bot = {'hips': J['Hips'][1] - 0.08, 'thigh': (J['LeftUpLeg'][1] + J['LeftLeg'][1]) / 2, 'knee': J['LeftLeg'][1] - 0.02}[spec['bottom']]
    sy = (top - bot) / (a['y1'] - a['y0'])
    sx = b['chestW'] * spec.get('wide', 1.15) / a['chestW']
    sz = b['chestD'] * spec.get('deep', 1.25) / a['chestD']
    Q = A.copy()
    Q[:,0] = (A[:,0] - a['cx']) * sx + b['cx']
    Q[:,1] = (A[:,1] - a['y1']) * sy + top
    Q[:,2] = (A[:,2] - a['chestZ']) * sz + b['chestZ']
    return Q


def rodrigues(u, v, t=1.0):
    u = u / np.linalg.norm(u); v = v / np.linalg.norm(v)
    ax = np.cross(u, v); s = np.linalg.norm(ax); c = u @ v
    if s < 1e-8: return np.eye(3)
    ax /= s; ang = np.arctan2(s, c) * t
    K = np.array([[0, -ax[2], ax[1]], [ax[2], 0, -ax[0]], [-ax[1], ax[0], 0]])
    return np.eye(3) + np.sin(ang) * K + (1 - np.cos(ang)) * K @ K

def align_sleeves(Q, J):
    # kostümün kolları T/A duruşunda açık: her kolu karakterin kol yönüne döndür ve boyunu uydur
    Q = Q.copy()
    for side, sg in (('Left', 1), ('Right', -1)):
        piv = J[side + 'Arm']; hand = J[side + 'Hand']
        rel = (Q[:, 0] - piv[0]) * sg
        m = rel > -0.02
        if m.sum() < 50: continue
        far = m & (rel > np.percentile(rel[m], 97))
        cuff = Q[far].mean(0)
        dc = cuff - piv; dh = hand - piv
        L = np.linalg.norm(dc); k = np.linalg.norm(dh) * 1.05 / L
        along = ((Q - piv) @ dc) / L
        t = np.clip(along / 0.10, 0, 1) * m           # omuzdan 10 cm boyunca yavaşça dön
        for tq in np.unique(np.round(t, 2)):
            sel = np.isclose(np.round(t, 2), tq) & (t > 0)
            if not sel.any(): continue
            R = rodrigues(dc, dh, tq)
            rel3 = Q[sel] - piv
            rel3 = rel3 @ R.T
            # kol boyunca uzat/kısalt
            dn = (dh / np.linalg.norm(dh)); a = rel3 @ dn
            rel3 += np.outer(a * (k - 1) * tq, dn)
            Q[sel] = piv + rel3
    return Q

def covered(P, Q, QN, T, maxd=0.15, eps=0.012):
    # giysinin altında kalan vücut üçgenleri (giysi yüzeyinin içinde, yakınında): gizlenir ki içinden taşmasın
    tree = cKDTree(Q); d, i = tree.query(P, k=4)
    inside = np.ones(len(P), bool)
    for k in range(4):
        s = ((P - Q[i[:, k]]) * QN[i[:, k]]).sum(1)
        inside &= (s < eps) & (d[:, k] < maxd)
    return inside[T].all(1)

def drop_head(A, AT):
    # tam takımın manken başı: boyun üstünde, ortada duran parçalar silinir
    from scipy import sparse
    from scipy.sparse.csgraph import connected_components
    n = len(A); M = sparse.coo_matrix((np.ones(len(AT) * 3), (np.repeat(AT[:, 0], 3), AT.ravel())), shape=(n, n))
    _, lab = connected_components(M, directed=False)
    y0, y1 = A[:, 1].min(), A[:, 1].max(); H = y1 - y0
    lo = np.full(lab.max() + 1, np.inf); np.minimum.at(lo, lab, A[:, 1])
    ax = np.zeros(lab.max() + 1); np.maximum.at(ax, lab, np.abs(A[:, 0]))
    head = (lo > y1 - 0.18 * H) & (ax < 0.06 * H)
    keep = ~head[lab][AT].any(1)
    return AT[keep]

def rotate_limb(Q, sel, piv, src, dst, blend=0.10, k=None):
    dc = src - piv; dh = dst - piv
    L = np.linalg.norm(dc); kk = (np.linalg.norm(dh) / L) if k is None else k
    along = ((Q - piv) @ dc) / L
    t = np.clip(along / blend, 0, 1) * sel
    Q = Q.copy()
    for tq in np.unique(np.round(t, 2)):
        s = np.isclose(np.round(t, 2), tq) & (t > 0)
        if not s.any(): continue
        R = rodrigues(dc, dh, tq); r = (Q[s] - piv) @ R.T
        dn = dh / np.linalg.norm(dh); a = r @ dn; r += np.outer(a * (kk - 1) * tq, dn)
        Q[s] = piv + r
    return Q

def fit_suit(A, J, P):
    # tam boy zırh: boy baş tepesine, en/derinlik göğse göre; sonra kollar ve bacaklar karakterinkine döndürülür
    b = measure_body(P, J)
    y0 = A[:, 1].min(); s = (J['HeadTop_End'][1] - 0.0) / (A[:, 1].max() - y0)
    Q = A.copy(); Q[:, 1] = (A[:, 1] - y0) * s
    yc = b['chestY']; band = np.abs(Q[:, 1] - yc) < 0.03
    xm = np.median(Q[band, 0]); core = band & (np.abs(Q[:, 0] - xm) < 0.6 * np.abs(Q[band, 0] - xm).max())
    w = np.subtract(*np.percentile(Q[core, 0], [97, 3])); z0, z1 = np.percentile(Q[band, 2], [5, 95])
    sx = b['chestW'] * 1.15 / w; sz = b['chestD'] * 1.2 / (z1 - z0)
    Q[:, 0] = (A[:, 0] - xm) * sx + b['cx']; Q[:, 2] = (A[:, 2] - (z0 + z1) / 2) * sz + b['chestZ']
    for side, sg in (('Left', 1), ('Right', -1)):
        piv = J[side + 'Arm']; rel = (Q[:, 0] - piv[0]) * sg; m = rel > -0.02
        far = m & (rel > np.percentile(rel[m], 97)); tip = Q[far].mean(0); dc = tip - piv; L = np.linalg.norm(dc)
        u = ((Q - piv) @ dc) / L ** 2                  # omuzdan parmak ucuna 0..1
        perp = np.linalg.norm((Q - piv) - np.outer(u, dc), axis=1)
        E, W = piv + dc * 0.42, piv + dc * 0.80        # takımın dirseği ve bileği (yaklaşık)
        Sb, Eb, Wb = J[side + 'Arm'], J[side + 'ForeArm'], J[side + 'Hand']
        R1 = rodrigues(E - piv, Eb - Sb); k1 = np.linalg.norm(Eb - Sb) / np.linalg.norm(E - piv)
        R2 = rodrigues(W - E, Wb - Eb); k2 = np.linalg.norm(Wb - Eb) / np.linalg.norm(W - E)
        def T1(X):
            r = (X - piv) @ R1.T; dn = (Eb - Sb) / np.linalg.norm(Eb - Sb); a = r @ dn
            return Sb + r + np.outer(a * (k1 - 1), dn)
        def T2(X):
            r = (X - E) @ R2.T; dn = (Wb - Eb) / np.linalg.norm(Wb - Eb); a = r @ dn
            return Eb + r + np.outer(np.clip(a, 0, None) * (k2 - 1), dn)
        # yumuşak ağırlıklar: gövde → üst kol → ön kol; kol ekseninden uzaklaştıkça gövdeye kalır
        ro = 0.16 - 0.06 * np.clip(u, 0, 1)
        wa = np.clip(u / 0.12, 0, 1) * np.clip((ro - perp) / 0.05, 0, 1) * m
        wf = np.clip((u - 0.36) / 0.12, 0, 1)
        Q = Q * (1 - wa)[:, None] + (T1(Q) * (1 - wf)[:, None] + T2(Q) * wf[:, None]) * wa[:, None]
    for side, sg in (('Left', 1), ('Right', -1)):
        piv = J[side + 'UpLeg']; hy = J['Hips'][1]
        wl = np.clip((Q[:, 0] - b['cx']) * sg / 0.06 + 0.5, 0, 1) * np.clip((hy - 0.02 - Q[:, 1]) / 0.12, 0, 1)
        m = wl > 0.5
        foot = m & (Q[:, 1] < np.percentile(Q[m, 1], 3))
        bm = (P[:, 1] < np.percentile(P[:, 1], 30)) & ((P[:, 0] - b['cx']) * sg > 0)
        bf = bm & (P[:, 1] < np.percentile(P[bm, 1], 3))
        src, dst = Q[foot].mean(0), P[bf].mean(0)
        R = rodrigues(src - piv, dst - piv); kk = np.linalg.norm(dst - piv) / np.linalg.norm(src - piv)
        r = (Q - piv) @ R.T; dn = (dst - piv) / np.linalg.norm(dst - piv); a = r @ dn
        TQ = piv + r + np.outer(a * (kk - 1), dn)
        Q = Q * (1 - wl)[:, None] + TQ * wl[:, None]
    return Q

TORSO = {'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder', 'LeftUpLeg', 'RightUpLeg'}
def restrict(full, deform, allow):
    # izin verilmeyen kemiklerin ağırlığı sıfırlanır (göğüs zırhı kol sallanınca gerilmesin)
    mask = np.array([n in TORSO for n in deform])
    f = full.copy(); f[allow == 0] *= mask
    bad = f.sum(1) < 1e-9; f[bad, list(deform).index('Spine2')] = 1
    return f


def skin(Q, P, Jt, W, names, allow, k=6):
    # her giysi noktası: en yakın k beden noktasının ağırlık ortalaması (göğüs zırhı yalnız gövde kemiklerinden)
    d, idx = cKDTree(P).query(Q, k=k)
    w = 1 / (d + 1e-3) ** 2; w /= w.sum(1, keepdims=True)
    full = np.zeros((len(Q), len(names)))
    for kk in range(k):
        for c in range(4):
            np.add.at(full, (np.arange(len(Q)), Jt[idx[:, kk], c]), w[:, kk] * W[idx[:, kk], c])
    full = restrict(full, names, allow)
    t4 = np.argsort(-full, 1)[:, :4]; w4 = np.take_along_axis(full, t4, 1); w4 /= w4.sum(1, keepdims=True)
    return t4, w4


def normals(Q, T):
    fn = np.cross(Q[T[:, 1]] - Q[T[:, 0]], Q[T[:, 2]] - Q[T[:, 0]]); N = np.zeros_like(Q)
    for kk in range(3): np.add.at(N, T[:, kk], fn)
    return N / (np.linalg.norm(N, axis=1, keepdims=True) + 1e-12)


def ranges(mask):
    # gizlenecek üçgenler: [başlangıç, adet] aralıkları
    m = np.concatenate([[0], mask.astype(np.int8), [0]]); d = np.diff(m)
    s = np.where(d == 1)[0]; e = np.where(d == -1)[0]
    return np.stack([s, e - s], 1).astype(np.uint32)


def cluster(A, N, U, AT, cell, uvcell=UVCELL):
    # telefon için sadeleştirme: aynı küçük hücreye (ve aynı doku bölgesine) düşen noktalar birleşir
    key = np.concatenate([np.floor(A / cell), np.floor(U / uvcell)], 1).astype(np.int64)
    _, inv, cnt = np.unique(key, axis=0, return_inverse=True, return_counts=True); inv = inv.ravel()
    def avg(X):
        Y = np.zeros((len(cnt), X.shape[1])); np.add.at(Y, inv, X); return Y / cnt[:, None]
    T = inv[AT]; T = T[(T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])]
    T = T[np.sort(np.unique(np.sort(T, 1), axis=0, return_index=True)[1])]
    return avg(A), avg(N), avg(U), T


def label_pieces(A, AT, res=400):
    # ayrık parçalı takım (havada duran zırh parçaları): ön görünüşte ayrı duran bölgeler
    from scipy import ndimage
    lo = A.min(0); sc = (res - 1) / np.ptp(A[:, 0]); H = int(np.ptp(A[:, 1]) * sc) + 1
    grid = np.zeros((res, H), bool); a, b, c = A[AT[:, 0]], A[AT[:, 1]], A[AT[:, 2]]
    for w in [(1, 0, 0), (0, 1, 0), (0, 0, 1), (.5, .5, 0), (0, .5, .5), (.5, 0, .5), (1/3, 1/3, 1/3)]:
        Q = a * w[0] + b * w[1] + c * w[2]
        grid[np.clip(((Q[:, 0] - lo[0]) * sc).astype(int), 0, res - 1), np.clip(((Q[:, 1] - lo[1]) * sc).astype(int), 0, H - 1)] = True
    lab, n = ndimage.label(ndimage.binary_dilation(grid, iterations=1))
    cc = (a + b + c) / 3
    return lab[np.clip(((cc[:, 0] - lo[0]) * sc).astype(int), 0, res - 1), np.clip(((cc[:, 1] - lo[1]) * sc).astype(int), 0, H - 1)]


def place_piece(X, top_src, bot_src, top_dst, bot_dst, girth=1.0):
    # parçanın üst-alt eksenini hedef kemik doğrultusuna çevir, boyunu uydur (kesit 'girth' ile aynı oranda)
    d0 = bot_src - top_src; d1 = bot_dst - top_dst
    k = np.linalg.norm(d1) / np.linalg.norm(d0)
    R = rodrigues(d0, d1)
    return top_dst + ((X - top_src) @ R.T) * k * girth


def fit_pieces(A, AT, J, P):
    # helm başa, göğüs+omuzluk+kemer gövdeye, eldivenler ön kola-ele, dizlikler baldıra-ayağa.
    # Parçalar önce gruplanır (bir zırh parçası birkaç ayrı bölge olabilir), her grup birlikte yerleşir.
    tl = label_pieces(A, AT)
    lo, hi = A.min(0), A.max(0); cx = (lo[0] + hi[0]) / 2; hw = (hi[0] - lo[0]) / 2; H = hi[1] - lo[1]
    groups = {}
    for k in np.unique(tl):
        if k == 0: continue
        tm = tl == k; X = A[np.unique(AT[tm])]
        c = (X.min(0) + X.max(0)) / 2; u = (c[0] - cx) / hw; v = (c[1] - lo[1]) / H
        side = 'Left' if u > 0 else 'Right'
        if v > 0.8 and abs(u) < 0.25: g = 'helm'
        elif v < 0.3: g = 'leg' + side
        elif abs(u) > 0.62 and v < 0.6: g = 'arm' + side
        else: g = 'torso'
        groups[g] = groups.get(g, np.zeros(len(AT), bool)) | tm
    Q = np.full_like(A, np.nan); allow = np.ones(len(A)); keep = np.zeros(len(AT), bool)
    for g, tm in groups.items():
        vi = np.unique(AT[tm]); X = A[vi]; c = (X.min(0) + X.max(0)) / 2
        top = np.array([c[0], X[:, 1].max(), c[2]]); bot = np.array([c[0], X[:, 1].min(), c[2]])
        if g == 'helm':
            hb = J['Neck'] + (J['Head'] - J['Neck']) * 0.3; ht = J['HeadTop_End'] + (J['HeadTop_End'] - J['Head']) * 0.45
            Y = place_piece(X, top, bot, ht, hb)
        elif g.startswith('leg'):
            sd = g[3:]; foot = J[sd + 'Foot']; toe = J[sd + 'ToeBase']
            Y = place_piece(X, top, bot, J[sd + 'Leg'] + np.array([0, 0.09, 0.02]), np.array([(foot[0] + toe[0]) / 2, 0.0, (foot[2] + toe[2]) / 2]), 1.1)
        elif g.startswith('arm'):
            sd = g[3:]; hm = J[sd + 'HandMiddle1']; tip = hm + (hm - J[sd + 'Hand']) * 0.9
            Y = place_piece(X, top, bot, J[sd + 'ForeArm'] + (J[sd + 'Hand'] - J[sd + 'ForeArm']) * 0.15, tip, 1.15)
        else:
            Y = fit(X, J, P, {'bottom': 'hips', 'wide': 1.3, 'deep': 1.4, 'top': 0.06}); allow[vi] = 0
        Q[vi] = Y; keep |= tm
    print('  gruplar:', sorted(groups))
    return Q, AT[keep], allow

def build(cls, key):
    P, T, Jt, W, names, J = read_char(os.path.join(ROOT, 'chars', cls + '.glb'))
    A, AN, U, AT, _, _ = glbrig.read_glb(os.path.join(ROOT, 'items', key + '.glb'))
    spec = dict(ITEMS[key])
    if not spec.get('suit'): spec.update({k: v * (1.0 if k == 'wide' and 'sleeves' in spec else 1) for k, v in CLASS_FIX.get(cls, {}).items()})
    if spec.get('suit') and not spec.get('helm'): AT = drop_head(A, AT)
    A, AN, U, AT = cluster(A, AN, U, AT, CELL * (A[:, 1].max() - A[:, 1].min()))
    if spec.get('pieces'):
        Q, AT, allow = fit_pieces(A, AT, J, P)
        ref = 1.0 / np.nanmedian(np.linalg.norm(Q[AT[:, 0]] - Q[AT[:, 1]], axis=1) / np.linalg.norm(A[AT[:, 0]] - A[AT[:, 1]], axis=1))
        Q = np.nan_to_num(Q)
    elif spec.get('suit'):
        Q = fit_suit(A, J, P); allow = np.ones(len(Q))
        ref = (A[:, 1].max() - A[:, 1].min()) / J['HeadTop_End'][1]
    else:
        Q = fit(A, J, P, spec); allow = np.zeros(len(Q))
        ref = (A[:, 1].max() - A[:, 1].min()) / (Q[:, 1].max() - Q[:, 1].min())
        if spec.get('sleeves'):
            cx = (J['LeftArm'][0] + J['RightArm'][0]) / 2; sw = abs(J['LeftArm'][0] - cx)
            allow = ((np.abs(Q[:, 0] - cx) > sw - 0.02) & (Q[:, 1] > J['Spine'][1])).astype(float)
            Q = align_sleeves(Q, J)
    # aşırı gerilen üçgenler (kavuşuk kolda dirsek gibi) atılır
    e1 = np.linalg.norm(Q[AT] - Q[AT[:, [1, 2, 0]]], axis=2).max(1)
    e0 = np.linalg.norm(A[AT] - A[AT[:, [1, 2, 0]]], axis=2).max(1) / ref
    AT = AT[e1 < np.maximum(2.5 * e0, 0.03)]
    used = np.unique(AT); remap = np.full(len(Q), -1); remap[used] = np.arange(len(used))
    Q, U, allow, AN, AT = Q[used], U[used], allow[used], AN[used], remap[AT]
    QN = normals(Q, AT)
    if (QN * AN).sum(1).mean() < 0: QN = -QN
    t4, w4 = skin(Q, P, Jt, W, names, allow)
    hide = covered(P, Q, QN, T)
    return Q, QN, U, t4, w4, AT, ranges(hide), hide.sum(), len(T)


def write(dst, Q, N, U, t4, w4, T, hr):
    # nicemlenmiş, gzip'li: konum i16 (kutuya göre), normal i8, uv u16, kemik u8, ağırlık u8, üçgen u16
    lo = Q.min(0); sc = np.maximum(Q.max(0) - lo, 1e-6)
    qp = np.round((Q - lo) / sc * 65535 - 32768).astype(np.int16)
    wq = np.round(w4 * 255).astype(np.int64); wq[:, 0] += 255 - wq.sum(1)
    big = len(Q) > 65535
    parts = [qp, np.concatenate([np.round(N * 127).astype(np.int8), np.zeros((len(N), 1), np.int8)], 1),
             np.round(np.clip(U, 0, 1) * 65535).astype(np.uint16), t4.astype(np.uint8), np.clip(wq, 0, 255).astype(np.uint8),
             T.astype(np.uint32 if big else np.uint16), hr]
    head = {'nv': len(Q), 'nt': len(T), 'nh': len(hr), 'lo': lo.tolist(), 'sc': sc.tolist(), 'i32': big}
    js = json.dumps(head).encode(); js += b' ' * (-len(js) % 4)
    raw = b'ATW1' + struct.pack('<I', len(js)) + js
    for p in parts:
        b = np.ascontiguousarray(p).tobytes(); raw += b + b'\0' * (-len(b) % 4)
    with gzip.open(dst, 'wb', 9) as f: f.write(raw)


if __name__ == '__main__':
    keys = sys.argv[1:] or list(ITEMS)
    os.makedirs(os.path.join(ROOT, 'worn'), exist_ok=True)
    for key in keys:
        for cls in CLASSES:
            Q, N, U, t4, w4, T, hr, nh, nb = build(cls, key)
            dst = os.path.join(ROOT, 'worn', f'{key}_{cls}.bin.gz'); write(dst, Q, N, U, t4, w4, T, hr)
            print(f'{key:16s} {cls:8s} {len(Q):6d} nokta {len(T):6d} üçgen, bedenden {nh}/{nb} gizli, {os.path.getsize(dst) // 1024} KB')
