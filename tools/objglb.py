# Basit OBJ (sadece nokta + yüz) -> GLB. Dörtgenler üçgene bölünür, normaller hesaplanır.
# Kullanım: python3 tools/objglb.py girdi.obj çıktı.glb
import sys, json, struct
import numpy as np
src, dst = sys.argv[1], sys.argv[2]
V, F = [], []
with open(src, 'r', errors='replace') as f:
    for line in f:
        if line.startswith('v '): V.append(line.split()[1:4])
        elif line.startswith('f '):
            ids = [int(t.split('/')[0]) for t in line.split()[1:]]
            for k in range(1, len(ids) - 1): F.append((ids[0], ids[k], ids[k + 1]))
P = np.array(V, dtype=np.float64); I = np.array(F, dtype=np.int64)
I = np.where(I < 0, I + len(P), I - 1)
fn = np.cross(P[I[:, 1]] - P[I[:, 0]], P[I[:, 2]] - P[I[:, 0]])
N = np.zeros_like(P)
for k in range(3): np.add.at(N, I[:, k], fn)
N /= np.maximum(1e-12, np.linalg.norm(N, axis=1, keepdims=True))
buf = bytearray(); views, accs = [], []
def add(arr, typ, comp=5126, target=None, mm=False):
    while len(buf) % 4: buf.append(0)
    arr = np.ascontiguousarray(arr); off = len(buf); buf.extend(arr.tobytes())
    views.append({'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes, **({'target': target} if target else {})})
    ac = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
    if mm: ac['min'] = arr.min(0).tolist(); ac['max'] = arr.max(0).tolist()
    accs.append(ac); return len(accs) - 1
prim = {'attributes': {'POSITION': add(P.astype(np.float32), 'VEC3', target=34962, mm=True), 'NORMAL': add(N.astype(np.float32), 'VEC3', target=34962)},
        'indices': add(I.ravel().astype(np.uint32), 'SCALAR', 5125, 34963), 'material': 0}
while len(buf) % 4: buf.append(0)
j = {'asset': {'version': '2.0'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': [{'mesh': 0}], 'meshes': [{'primitives': [prim]}],
     'materials': [{'name': 'obj'}], 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(buf)}]}
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
with open(dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 28 + len(js) + len(buf))); f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(buf), 0x004E4942)); f.write(bytes(buf))
print('yazıldı', dst, len(P), 'nokta', len(I), 'üçgen')
