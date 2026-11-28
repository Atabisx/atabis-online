# takiglb.py --vcol çıktısı (tek parça, köşe renkli) kanat çiftini oyunun kanadı yapar:
# 'sol' (x>0) ve 'sag' (x<0) düğümlerine böler (çırpma için), kanat köküne (pivot) göre ölçekler/taşır.
# Kullanım: python3 tools/wingsplit.py girdi.glb cikti.glb --scale 0.55 --py 0.7
import sys, json, struct, argparse
import numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--scale', type=float, default=1.0); ap.add_argument('--py', type=float, default=0.0, help='kök noktasının model içindeki yüksekliği')
a = ap.parse_args()
b = open(a.src, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L]); BIN = b[20 + L + 8:]
p = j['meshes'][0]['primitives'][0]
def acc(i, dt, n):
    ac = j['accessors'][i]; bv = j['bufferViews'][ac['bufferView']]
    return np.frombuffer(BIN, dt, ac['count'] * n, bv.get('byteOffset', 0) + ac.get('byteOffset', 0)).reshape(-1, n)
P = acc(p['attributes']['POSITION'], np.float32, 3).astype(np.float64); N = acc(p['attributes']['NORMAL'], np.float32, 3)
C = acc(p['attributes']['COLOR_0'], np.float32, 3)
ic = j['accessors'][p['indices']]; T = acc(p['indices'], np.uint32 if ic['componentType'] == 5125 else np.uint16, 1).reshape(-1, 3).astype(np.int64)
P = (P - [0, a.py, 0]) * a.scale
blobs, views, accs = [], [], []
def add(arr, target=None, comp=5126, typ='VEC3', mm=False, norm=False):
    d = arr.tobytes(); off = sum(len(x) for x in blobs); blobs.append(d + b'\0' * (-len(d) % 4))
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(d), **({'target': target} if target else {})})
    ac = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if mm: ac['min'] = arr.min(0).tolist(); ac['max'] = arr.max(0).tolist()
    if norm: ac['normalized'] = True
    accs.append(ac); return len(accs) - 1
meshes, nodes = [], []
cx = P[T].mean(1)[:, 0]
for name, sel in (('sol', cx >= 0), ('sag', cx < 0)):
    t = T[sel]; used = np.unique(t); rm = np.full(len(P), -1); rm[used] = np.arange(len(used)); t = rm[t]
    col = np.concatenate([np.clip(C[used], 0, 1), np.ones((len(used), 1), np.float32)], 1)
    attrs = {'POSITION': add(P[used].astype(np.float32), 34962, mm=True), 'NORMAL': add(N[used].astype(np.float32), 34962),
             'COLOR_0': add((col * 255).round().astype(np.uint8), 34962, 5121, 'VEC4', norm=True)}
    big = len(used) > 65535
    ind = add(t.ravel().astype(np.uint32 if big else np.uint16), 34963, 5125 if big else 5123, 'SCALAR')
    meshes.append({'primitives': [{'attributes': attrs, 'indices': ind, 'material': 0}]}); nodes.append({'name': name, 'mesh': len(meshes) - 1})
g = {'asset': {'version': '2.0', 'generator': 'atabis wingsplit.py'}, 'scene': 0, 'scenes': [{'nodes': [0]}],
     'nodes': [{'name': 'kanat', 'children': [1, 2]}] + nodes, 'meshes': meshes,
     'materials': [{'name': 'kanat', 'doubleSided': True, 'pbrMetallicRoughness': {'metallicFactor': 0, 'roughnessFactor': 0.5}}], 'accessors': accs, 'bufferViews': views}
binb = b''.join(blobs); g['buffers'] = [{'byteLength': len(binb)}]
js = json.dumps(g, separators=(',', ':')).encode(); js += b' ' * (-len(js) % 4)
open(a.dst, 'wb').write(struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(binb), b'BIN\0') + binb)
print('yazıldı', a.dst, len(P), 'nokta')
