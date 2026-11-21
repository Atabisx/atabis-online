# GLB'yi düz (iskeletsiz) modele çevirir: silah, asa gibi sabit eşyalar için.
# Kullanım: python3 tools/glbstatic.py girdi.glb çıktı.glb [seçenekler]
#   --rotz derece / --rotx derece: modeli döndürür (silahlar oyunda dik durur: sap aşağı, uç yukarı)
#   --paint balta: dokusuz baltayı boyar (ağız çelik, sap ahşap, uçlar pirinç)
#   --paint kilic: dokusuz kılıcı boyar (namlu çelik, siper altın, kabza deri, topuz altın)
#   --paint asa: dokusuz asayı boyar (sap koyu ahşap, baş altın, en uç mor taş)
#   --matcolor "Ad=#rrggbb:metal,Ad2=#rrggbb": malzeme rengini değiştirir (yer tutucu renkler için)
#   --cell oran: çok ağır modeli sadeleştirir (en uzun kenarın bu oranı kadar hücrelerde noktaları birleştirir)
import sys, json, struct, math, argparse
import numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--rotz', type=float, default=0); ap.add_argument('--rotx', type=float, default=0)
ap.add_argument('--paint', default=''); ap.add_argument('--matcolor', default=''); ap.add_argument('--cell', type=float, default=0)
a = ap.parse_args()

b = open(a.src, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L])
src_bin = b[20 + L + 8:]
def read_acc(i):
    ac = j['accessors'][i]; bv = j['bufferViews'][ac['bufferView']]
    n = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1, 'VEC4': 4}[ac['type']]
    dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8}[ac['componentType']]
    off = bv.get('byteOffset', 0) + ac.get('byteOffset', 0)
    return np.frombuffer(src_bin, dt, count=ac['count'] * n, offset=off).reshape(-1, n).copy()

# ilkelleri oku (düğüm dönüşümleri uygulanmış halde)
def node_mats():
    out = {}
    def T(n):
        M = np.eye(4)
        if 'matrix' in n: return np.array(n['matrix']).reshape(4, 4).T
        if 'scale' in n: M = np.diag(list(n['scale']) + [1]) @ M
        if 'rotation' in n:
            x, y, z, w = n['rotation']
            R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
            R4 = np.eye(4); R4[:3, :3] = R; M = R4 @ M
        if 'translation' in n: M[:3, 3] += n['translation']
        return M
    def walk(i, P):
        n = j['nodes'][i]; W = P @ T(n)
        if 'mesh' in n: out.setdefault(n['mesh'], W)
        for c in n.get('children', []): walk(c, W)
    for r in j['scenes'][j.get('scene', 0)]['nodes']: walk(r, np.eye(4))
    return out
NM = node_mats()
prims = []
for mi, m in enumerate(j['meshes']):
    W = NM.get(mi, np.eye(4)) if 'skins' not in j else np.eye(4)   # derili örgülerde noktalar zaten dünya konumunda
    for p in m['primitives']:
        at = p['attributes']
        P = read_acc(at['POSITION']).astype(np.float64); P = P @ W[:3, :3].T + W[:3, 3]
        N = read_acc(at['NORMAL']).astype(np.float64) @ W[:3, :3].T if 'NORMAL' in at else np.zeros_like(P)
        UV = read_acc(at['TEXCOORD_0']) if 'TEXCOORD_0' in at else np.zeros((len(P), 2), np.float32)
        I = read_acc(p['indices']).ravel().astype(np.int64) if 'indices' in p else np.arange(len(P))
        prims.append({'P': P, 'N': N, 'UV': UV, 'I': I, 'mat': p.get('material'), 'C': None})

def rot(axis, deg):
    c, s = math.cos(math.radians(deg)), math.sin(math.radians(deg))
    return {'x': np.array([[1, 0, 0], [0, c, -s], [0, s, c]]), 'z': np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])}[axis]
for ax, d in (('x', a.rotx), ('z', a.rotz)):
    if d:
        R = rot(ax, d)
        for p in prims: p['P'] = p['P'] @ R.T; p['N'] = p['N'] @ R.T

# sadeleştirme: aynı hücreye düşen (ve dokuda yakın) noktalar birleşir
if a.cell:
    allP = np.concatenate([p['P'] for p in prims]); ext = (allP.max(0) - allP.min(0)).max(); h = ext * a.cell
    # hücre ortalaması bütün parçalar için ortak: parçaların birleştiği yerlerde yarık açılmaz
    _gk, _ginv, _gcnt = np.unique(np.floor(allP / h).astype(np.int64), axis=0, return_inverse=True, return_counts=True)
    _gavg = np.zeros((len(_gcnt), 3)); np.add.at(_gavg, _ginv.ravel(), allP); _gavg /= _gcnt[:, None]
    _gmap = {tuple(k): i for i, k in enumerate(_gk)}
    def cell_avg(P):
        ks = np.floor(P / h).astype(np.int64)
        return _gavg[[_gmap[tuple(k)] for k in ks]]
    for p in prims:
        textured = p['mat'] is not None and 'baseColorTexture' in j['materials'][p['mat']].get('pbrMetallicRoughness', {})
        uvk = np.floor(p['UV'] * 96).astype(np.int64) if textured else np.zeros((len(p['P']), 2), np.int64)
        key = np.concatenate([np.floor(p['P'] / h).astype(np.int64), uvk], 1)
        _, first, inv, cnt = np.unique(key, axis=0, return_index=True, return_inverse=True, return_counts=True); inv = inv.ravel()
        k = len(cnt)
        # konum hücre ortalamasıdır (dokuya göre ayrılan kopyalar aynı yere düşer, dikiş yerinde yarık açılmaz)
        P2 = cell_avg(p['P'])[first]
        N2 = np.zeros((k, 3)); np.add.at(N2, inv, p['N']); N2 /= np.maximum(1e-9, np.linalg.norm(N2, axis=1, keepdims=True))
        UV2 = p['UV'][first].astype(np.float64)   # doku koordinatı ortalanmaz: ada dışına taşıp siyah çizgi yapmasın
        TT = inv[p['I']].reshape(-1, 3)
        ok = (TT[:, 0] != TT[:, 1]) & (TT[:, 1] != TT[:, 2]) & (TT[:, 0] != TT[:, 2]); TT = TT[ok]
        _, first = np.unique(np.sort(TT, 1), axis=0, return_index=True); TT = TT[np.sort(first)]
        print('  sadeleşti', len(p['P']), '->', k, 'nokta,', len(p['I']) // 3, '->', len(TT), 'üçgen')
        p['P'], p['N'], p['UV'], p['I'] = P2, N2, UV2.astype(np.float32), TT.ravel()

# boyama: modelin uzun ekseni (dikleştirildikten sonra y) boyunca bölgeler
def hexc(h): h = h.lstrip('#'); return [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
if a.paint:
    allP = np.concatenate([p['P'] for p in prims])
    ax = int(np.argmax(allP.max(0) - allP.min(0)))
    lo, hi = allP[:, ax].min(), allP[:, ax].max()
    oth = [k for k in range(3) if k != ax]
    c = np.median(allP[:, oth], axis=0)
    # her dilimin genişliği: siper (kılıçta) en geniş dilim
    nb = 80; tt = (allP[:, ax] - lo) / (hi - lo); bins = np.minimum(nb - 1, (tt * nb).astype(int))
    width = np.zeros(nb)
    rr = np.hypot(allP[:, oth[0]] - c[0], allP[:, oth[1]] - c[1])
    for k in range(nb):
        s = rr[bins == k]; width[k] = s.max() if len(s) else 0
    for p in prims:
        t = (p['P'][:, ax] - lo) / (hi - lo)
        r = np.hypot(p['P'][:, oth[0]] - c[0], p['P'][:, oth[1]] - c[1])
        col = np.zeros((len(t), 3))
        if a.paint == 'balta':
            col[:] = [0.36, 0.22, 0.12]
            col[(np.sin(t * 90) > 0.6) & (r < 0.05 * (hi - lo))] = [0.25, 0.15, 0.08]
            col[r > 0.05 * (hi - lo)] = [0.72, 0.74, 0.78]
            col[(t > 0.97) | (t < 0.03)] = [0.78, 0.6, 0.25]
        elif a.paint == 'kilic':
            g = int(np.argmax(width[:nb // 2]))                 # sap aşağıda: siper alt yarıdaki en geniş dilim
            g0 = (g - 1) / nb; g1 = (g + 2) / nb
            col[:] = [0.78, 0.8, 0.84]                               # çelik namlu
            col[(t >= g0) & (t <= g1)] = [0.85, 0.66, 0.25]          # altın siper
            hilt = t < g0
            col[hilt] = [0.28, 0.16, 0.09]                           # deri kabza
            col[hilt & (np.sin(t * 160) > 0.3)] = [0.2, 0.11, 0.06]  # sargı
            col[t < 0.035] = [0.85, 0.66, 0.25]                      # topuz
            col[(t > g1) & (r < 0.012 * (hi - lo))] = [0.62, 0.64, 0.7]   # namlu oluğu
        elif a.paint == 'asa':
            shaft = np.median(rr[(tt > 0.2) & (tt < 0.5)])           # sapın kalınlığı
            col[:] = [0.22, 0.13, 0.08]                               # koyu ahşap sap
            col[(t < 0.6) & (r > 1.6 * shaft)] = [0.85, 0.66, 0.25]   # yaprak bilezikler altın
            col[(t >= 0.58) & (t <= 0.66)] = [0.85, 0.66, 0.25]       # küre altı halka
            col[t > 0.66] = [0.3, 0.16, 0.62]                         # ametist küre
            col[(t > 0.66) & (np.sin(t * 70) > 0.92)] = [0.85, 0.66, 0.25]
            col[t > 0.88] = [0.72, 0.5, 1.0]                          # süzülen kristal
            col[t < 0.045] = [0.85, 0.66, 0.25]
        p['C'] = col
mc = {}
for kv in a.matcolor.split(','):
    if '=' in kv:
        k, v = kv.split('=', 1); h, *mt = v.split(':'); mc[k] = (hexc(h), float(mt[0]) if mt else 0.0)

# yaz
buf = bytearray(); views = []; accs = []
def add(arr, typ, comp=5126, target=None, mm=False):
    global buf
    while len(buf) % 4: buf.append(0)
    arr = np.ascontiguousarray(arr); off = len(buf); buf += arr.tobytes()
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes}
    if target: v['target'] = target
    views.append(v)
    ac = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if mm: ac['min'] = arr.min(0).tolist(); ac['max'] = arr.max(0).tolist()
    accs.append(ac); return len(accs) - 1
meshes, nodes = [], []
mats = j.get('materials', [{'name': 'varsayılan'}])
for mt in mats:
    if mt.get('name') in mc:
        col, met = mc[mt['name']]
        mt['pbrMetallicRoughness'] = {'baseColorFactor': col + [1], 'metallicFactor': met, 'roughnessFactor': 0.5 if met else 0.8}
for p in prims:
    at = {'POSITION': add(p['P'].astype(np.float32), 'VEC3', target=34962, mm=True), 'NORMAL': add(p['N'].astype(np.float32), 'VEC3', target=34962),
          'TEXCOORD_0': add(p['UV'].astype(np.float32), 'VEC2', target=34962)}
    if p['C'] is not None: at['COLOR_0'] = add(p['C'].astype(np.float32), 'VEC3', target=34962)
    prim = {'attributes': at, 'indices': add(p['I'].astype(np.uint32), 'SCALAR', comp=5125, target=34963)}
    if p['mat'] is not None: prim['material'] = p['mat']
    meshes.append({'primitives': [prim]}); nodes.append({'mesh': len(meshes) - 1})
if a.paint:
    for mt in mats:
        if 'baseColorTexture' not in mt.get('pbrMetallicRoughness', {}):
            mt['pbrMetallicRoughness'] = {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.45, 'roughnessFactor': 0.45}
out = {'asset': {'version': '2.0', 'generator': 'atabis glbstatic'}, 'scene': 0, 'scenes': [{'nodes': list(range(len(nodes)))}], 'nodes': nodes, 'meshes': meshes, 'materials': mats}
if 'images' in j:
    imgs = []
    for im in j['images']:
        bv = j['bufferViews'][im['bufferView']]; data = src_bin[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
        while len(buf) % 4: buf.append(0)
        off = len(buf); buf += data; views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
        imgs.append({'bufferView': len(views) - 1, 'mimeType': im['mimeType']})
    out['images'] = imgs; out['textures'] = j['textures']; out['samplers'] = j.get('samplers', [{}])
while len(buf) % 4: buf.append(0)
out['accessors'] = accs; out['bufferViews'] = views; out['buffers'] = [{'byteLength': len(buf)}]
js = json.dumps(out, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
with open(a.dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(buf)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(bytes(buf))
print('düz model yazıldı', a.dst, round((28 + len(js) + len(buf)) / 1e6, 2), 'MB')
