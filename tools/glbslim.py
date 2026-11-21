# GLB'yi küçültür; iskeleti ve animasyonları korur.
# Kullanım: python3 tools/glbslim.py girdi.glb çıktı.glb [--cell 0.004] [--tex 1024]
#   --cell: en uzun kenarın bu oranındaki hücreye düşen noktaları birleştirir (deri ağırlıkları korunur)
#   --tex: dokuları en fazla bu boyuta indirir (JPEG; saydam olanlar PNG kalır)
import sys, json, struct, io, argparse
import numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--cell', type=float, default=0); ap.add_argument('--tex', type=int, default=0)
a = ap.parse_args()
b = open(a.src, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); BIN = b[20 + L + 8:]
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}
DT = {5126: np.float32, 5125: np.uint32, 5123: np.uint16, 5121: np.uint8, 5122: np.int16, 5120: np.int8}

def read(i):
    ac = j['accessors'][i]; n = NC[ac['type']]; dt = DT[ac['componentType']]
    if 'bufferView' not in ac: return np.zeros((ac['count'], n), dt)
    bv = j['bufferViews'][ac['bufferView']]
    off = bv.get('byteOffset', 0) + ac.get('byteOffset', 0); stride = bv.get('byteStride', 0); isz = np.dtype(dt).itemsize * n
    if stride and stride != isz:
        raw = np.frombuffer(BIN, np.uint8, count=stride * (ac['count'] - 1) + isz, offset=off)
        rows = np.lib.stride_tricks.as_strided(raw, (ac['count'], isz), (stride, 1))
        return np.ascontiguousarray(rows).view(dt).reshape(-1, n)
    return np.frombuffer(BIN, dt, count=ac['count'] * n, offset=off).reshape(-1, n).copy()

data = {i: read(i) for i in range(len(j['accessors']))}     # accessor -> dizi (yeniden yazılacak)
if a.cell:
    allP = np.concatenate([data[p['attributes']['POSITION']] for m in j['meshes'] for p in m['primitives']])
    h = (allP.max(0) - allP.min(0)).max() * a.cell
    _gk, _ginv, _gcnt = np.unique(np.floor(allP / h).astype(np.int64), axis=0, return_inverse=True, return_counts=True)
    _gavg = np.zeros((len(_gcnt), 3)); np.add.at(_gavg, _ginv.ravel(), allP.astype(np.float64)); _gavg /= _gcnt[:, None]
    _gmap = {tuple(k): i for i, k in enumerate(_gk)}
    def cell_avg(P):
        return _gavg[[_gmap[tuple(k)] for k in np.floor(P / h).astype(np.int64)]]
    for m in j['meshes']:
        for p in m['primitives']:
            at = p['attributes']; P = data[at['POSITION']].astype(np.float64)
            I = data[p['indices']].ravel().astype(np.int64) if 'indices' in p else np.arange(len(P))
            key = [np.floor(P / h).astype(np.int64)]
            mat = j['materials'][p['material']] if 'material' in p and j.get('materials') else {}
            if 'TEXCOORD_0' in at and 'baseColorTexture' in mat.get('pbrMetallicRoughness', {}): key.append(np.floor(data[at['TEXCOORD_0']] * 96).astype(np.int64))
            if 'JOINTS_0' in at: key.append(data[at['JOINTS_0']][:, :1].astype(np.int64))   # farklı kemiğe bağlı noktalar birleşmez
            _, first, inv = np.unique(np.concatenate(key, 1), axis=0, return_index=True, return_inverse=True); inv = inv.ravel()
            cnt = np.bincount(inv)
            newP = cell_avg(P[first])   # dikiş kopyaları ve parça sınırları aynı konuma düşer
            T = inv[I].reshape(-1, 3)
            T = T[(T[:, 0] != T[:, 1]) & (T[:, 1] != T[:, 2]) & (T[:, 0] != T[:, 2])]
            _, fi = np.unique(np.sort(T, 1), axis=0, return_index=True); T = T[np.sort(fi)]
            print('  sadeleşti', len(P), '->', len(cnt), 'nokta')
            for k, acc in list(at.items()):
                if k == 'POSITION': arr = newP.astype(np.float32)
                else: arr = data[acc][first]
                j['accessors'].append(dict(j['accessors'][acc], count=len(arr))); data[len(j['accessors']) - 1] = arr; at[k] = len(j['accessors']) - 1
            j['accessors'].append({'componentType': 5125, 'count': T.size, 'type': 'SCALAR'}); data[len(j['accessors']) - 1] = T.astype(np.uint32).reshape(-1, 1); p['indices'] = len(j['accessors']) - 1
            p.pop('targets', None)

# dokular
imgs = []
for im in j.get('images', []):
    bv = j['bufferViews'][im['bufferView']]; raw = BIN[bv.get('byteOffset', 0): bv.get('byteOffset', 0) + bv['byteLength']]
    if a.tex:
        from PIL import Image
        img = Image.open(io.BytesIO(raw)); img.load()
        if max(img.size) > a.tex:
            r = a.tex / max(img.size); img = img.resize((max(1, int(img.width * r)), max(1, int(img.height * r))), Image.LANCZOS)
        out = io.BytesIO()
        if img.mode in ('RGBA', 'LA') and np.asarray(img.convert('RGBA'))[..., 3].min() < 250: img.save(out, 'PNG', optimize=True); mt = 'image/png'
        else: img.convert('RGB').save(out, 'JPEG', quality=86); mt = 'image/jpeg'
        raw = out.getvalue(); im['mimeType'] = mt
    imgs.append(raw)

# kullanılan erişimcileri yeniden diz ve tamponu baştan yaz
used = set()
for m in j['meshes']:
    for p in m['primitives']:
        used.update(p['attributes'].values())
        if 'indices' in p: used.add(p['indices'])
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: used.add(s['inverseBindMatrices'])
for an in j.get('animations', []):
    for sm in an['samplers']: used.update([sm['input'], sm['output']])
order = sorted(used); remap = {o: k for k, o in enumerate(order)}
buf = bytearray(); views = []; accs = []
for o in order:
    ac = dict(j['accessors'][o]); arr = np.ascontiguousarray(data[o])
    while len(buf) % 4: buf.append(0)
    views.append({'buffer': 0, 'byteOffset': len(buf), 'byteLength': arr.nbytes}); buf += arr.tobytes()
    ac['bufferView'] = len(views) - 1; ac.pop('byteOffset', None); ac['count'] = len(arr)
    if ac['type'] == 'VEC3' and 'min' in ac and ac['componentType'] == 5126: ac['min'] = arr.min(0).tolist(); ac['max'] = arr.max(0).tolist()
    ac.pop('sparse', None); accs.append(ac)
for k, raw in enumerate(imgs):
    while len(buf) % 4: buf.append(0)
    views.append({'buffer': 0, 'byteOffset': len(buf), 'byteLength': len(raw)}); buf += raw
    j['images'][k]['bufferView'] = len(views) - 1
for m in j['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: remap[v] for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = remap[p['indices']]
for s in j.get('skins', []):
    if 'inverseBindMatrices' in s: s['inverseBindMatrices'] = remap[s['inverseBindMatrices']]
for an in j.get('animations', []):
    for sm in an['samplers']: sm['input'] = remap[sm['input']]; sm['output'] = remap[sm['output']]
while len(buf) % 4: buf.append(0)
j['accessors'] = accs; j['bufferViews'] = views; j['buffers'] = [{'byteLength': len(buf)}]
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
with open(a.dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(buf))); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(bytes(buf))
print('küçültüldü', a.dst, round((28 + len(js) + len(buf)) / 1e6, 2), 'MB')
