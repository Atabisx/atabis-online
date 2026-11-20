# Kostüm kanadı GLB'sini oyuna hazırlar:
#  - sergileme ayağını/direğini/askısını atar (sırt plakasından uzak, z'si küçük adalar),
#  - kanadı sol / sağ / orta (plaka ve kayışlar) diye üç parçaya böler (oyunda çırpabilsin diye),
#  - başlangıç noktasını sırt plakasının iç yüzüne taşır, dokuları küçültür.
# Kullanım: python3 tools/wingglb.py girdi.glb client/models/wings/ad.glb [--keep-z 0.05] [--tex 1024]
import sys, json, struct, io, argparse
import numpy as np
from PIL import Image

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}

def load(path):
    b = open(path, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L])
    o = 20 + L; BL = struct.unpack('<I', b[o:o + 4])[0]
    return j, b[o + 8:o + 8 + BL]

def acc(j, bin_, i):
    a = j['accessors'][i]; bv = j['bufferViews'][a['bufferView']]
    off = bv.get('byteOffset', 0) + a.get('byteOffset', 0); n = a['count']; c = NC[a['type']]; t = CT[a['componentType']]
    stride = bv.get('byteStride', 0); isz = np.dtype(t).itemsize * c
    if stride and stride != isz:
        return np.stack([np.frombuffer(bin_, t, count=c, offset=off + k * stride) for k in range(n)])
    arr = np.frombuffer(bin_, t, count=n * c, offset=off)
    return arr.reshape(n, c) if c > 1 else arr

def islands(pos, idx):
    """aynı konumdaki köşeler birleşik sayılır (UV dikişleri); üçgenlerle bağlı adaların kimliği"""
    key = np.round(pos / 1e-5).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True); inv = inv.ravel()
    parent = np.arange(inv.max() + 1)
    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    t = inv[idx.reshape(-1, 3)]
    for a, b, c in t:
        ra = find(a); parent[find(b)] = ra; parent[find(c)] = ra
    return np.array([find(x) for x in t[:, 0]])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--keep-z', type=float, default=0.05, help='en küçük z bu değerden küçük adalar (ayak/direk) atılır')
    ap.add_argument('--side', type=float, default=0.06, help='|x| bu değerden büyük adalar sol/sağ kanat')
    ap.add_argument('--tex', type=int, default=1024)
    a = ap.parse_args()
    j, b = load(a.src)
    prim = j['meshes'][0]['primitives'][0]
    pos = acc(j, b, prim['attributes']['POSITION']).astype(np.float32)
    nor = acc(j, b, prim['attributes']['NORMAL']).astype(np.float32)
    uv = acc(j, b, prim['attributes']['TEXCOORD_0']).astype(np.float32)
    idx = acc(j, b, prim['indices']).astype(np.int64)
    tri = idx.reshape(-1, 3)
    isl = islands(pos, idx)
    keep = np.zeros(len(tri), bool); part = np.zeros(len(tri), np.int8)    # 0 orta, 1 sol, 2 sağ
    for c in np.unique(isl):
        m = isl == c; v = pos[tri[m].ravel()]
        if v[:, 2].min() < a.keep_z: continue
        keep[m] = True
        cx = v[:, 0].mean()
        part[m] = 1 if cx < -a.side else 2 if cx > a.side else 0
    kept = tri[keep]
    v = pos[kept.ravel()]
    # başlangıç: sırt plakasının iç yüzü (orta parçanın ortası, en arkadaki z)
    mid = tri[keep & (part == 0)]
    mv = pos[mid.ravel()] if len(mid) else v
    origin = np.array([0.0, (mv[:, 1].min() + mv[:, 1].max()) / 2, mv[:, 2].min()], np.float32)
    print('atılan üçgen', int((~keep).sum()), 'kalan', int(keep.sum()), 'başlangıç', np.round(origin, 3),
          'boyut', np.round(v.max(0) - v.min(0), 3))
    # parçaları yeni tamponlara yaz
    blobs = []; bviews = []; accs = []; meshes = []; nodes = []
    def add_blob(arr, target=None):
        data = arr.tobytes(); off = sum(len(x) for x in blobs)
        pad = (-len(data)) % 4; blobs.append(data + b'\0' * pad)
        bv = {'buffer': 0, 'byteOffset': off, 'byteLength': len(data)}
        if target: bv['target'] = target
        bviews.append(bv); return len(bviews) - 1
    def add_acc(arr, typ, ctype, target, minmax=False):
        a_ = {'bufferView': add_blob(arr, target), 'componentType': ctype, 'count': len(arr), 'type': typ}
        if minmax: a_['min'] = arr.min(0).tolist(); a_['max'] = arr.max(0).tolist()
        accs.append(a_); return len(accs) - 1
    names = ['orta', 'sol', 'sag']
    for k in range(3):
        t = tri[keep & (part == k)]
        if not len(t): continue
        used, remap = np.unique(t.ravel(), return_inverse=True)
        P = (pos[used] - origin).astype(np.float32)
        if k:    # kanat parçası: kendi kök noktasına göre (çırpma ekseni)
            root = np.array([np.sign(P[:, 0].mean()) * a.side, 0, 0], np.float32); P = P - root
        else: root = np.zeros(3, np.float32)
        ii = remap.astype(np.uint32)
        prim2 = {'attributes': {'POSITION': add_acc(P, 'VEC3', 5126, 34962, True), 'NORMAL': add_acc(nor[used], 'VEC3', 5126, 34962),
                                'TEXCOORD_0': add_acc(uv[used], 'VEC2', 5126, 34962)},
                 'indices': add_acc(ii, 'SCALAR', 5125, 34963), 'material': 0}
        meshes.append({'name': names[k], 'primitives': [prim2]})
        nodes.append({'name': names[k], 'mesh': len(meshes) - 1, 'translation': root.tolist()})
    # dokular: küçült, jpeg
    images = []
    for im in j['images']:
        bv = j['bufferViews'][im['bufferView']]; data = b[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
        I = Image.open(io.BytesIO(data)).convert('RGB')
        if I.width > a.tex: I = I.resize((a.tex, a.tex), Image.LANCZOS)
        out = io.BytesIO(); I.save(out, 'JPEG', quality=86); data = out.getvalue()
        images.append({'name': im.get('name', 'doku'), 'mimeType': 'image/jpeg', 'bufferView': add_blob(np.frombuffer(data, np.uint8))})
    g = {'asset': {'version': '2.0', 'generator': 'atabis wingglb'}, 'scene': 0,
         'scenes': [{'nodes': [len(nodes)]}],
         'nodes': nodes + [{'name': 'kanat', 'children': list(range(len(nodes)))}],
         'meshes': meshes, 'accessors': accs, 'bufferViews': bviews,
         'buffers': [{'byteLength': sum(len(x) for x in blobs)}],
         'materials': j['materials'], 'textures': j['textures'], 'samplers': j.get('samplers', [{}]), 'images': images}
    js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    bin_ = b''.join(blobs)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    with open(a.dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942)); f.write(bin_)
    print('yazıldı', a.dst, total // 1024, 'KB')

if __name__ == '__main__':
    main()
