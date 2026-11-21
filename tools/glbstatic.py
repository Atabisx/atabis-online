# Deri (skin) bilgisini silip GLB'yi düz (iskeletsiz) modele çevirir: silah gibi sabit eşyalar için.
# Kullanım: python3 tools/glbstatic.py girdi.glb çıktı.glb [--rotz derece] [--paint balta]
#   --rotz: modeli z ekseni etrafında çevirir (silahlar oyunda dik durur: sap aşağı, uç yukarı)
#   --paint balta: dokusuz baltayı köşe renkleriyle boyar (ağız çelik, sap ahşap, uçlar pirinç)
import sys, json, struct, math, argparse
import numpy as np
ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--rotz', type=float, default=0); ap.add_argument('--paint', default='')
a = ap.parse_args()
b = open(a.src, 'rb').read(); L = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + L])
binc = bytearray(b[20 + L + 8:])
for n in j['nodes']: n.pop('skin', None)
j.pop('skins', None)
for m in j.get('meshes', []):
    for p in m['primitives']:
        for k in ('JOINTS_0', 'WEIGHTS_0'): p['attributes'].pop(k, None)

def read_acc(i):
    ac = j['accessors'][i]; bv = j['bufferViews'][ac['bufferView']]
    n = {'VEC3': 3, 'VEC2': 2, 'SCALAR': 1, 'VEC4': 4}[ac['type']]
    return np.frombuffer(bytes(binc[bv.get('byteOffset', 0) + ac.get('byteOffset', 0):]), np.float32, count=ac['count'] * n).reshape(-1, n)
def add_acc(arr, typ):
    global binc
    while len(binc) % 4: binc.append(0)
    off = len(binc); binc += arr.astype(np.float32).tobytes()
    j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes, 'target': 34962})
    j['accessors'].append({'bufferView': len(j['bufferViews']) - 1, 'componentType': 5126, 'count': len(arr), 'type': typ})
    return len(j['accessors']) - 1

if a.paint == 'balta':
    for m in j['meshes']:
        for p in m['primitives']:
            P = read_acc(p['attributes']['POSITION'])
            ax = int(np.argmax(P.max(0) - P.min(0)))          # sapın ekseni (en uzun)
            other = [k for k in range(3) if k != ax]
            c = np.median(P[:, other], axis=0)
            r = np.hypot(P[:, other[0]] - c[0], P[:, other[1]] - c[1])
            t = (P[:, ax] - P[:, ax].min()) / (P[:, ax].max() - P[:, ax].min())
            col = np.tile(np.array([[0.36, 0.22, 0.12]]), (len(P), 1))           # ahşap sap
            band = (np.sin(t * 90) > 0.6) & (r < 0.05)
            col[band] = [0.25, 0.15, 0.08]                                        # sap sargısı
            col[r > 0.05] = [0.72, 0.74, 0.78]                                    # çelik ağız
            col[(t > 0.97) | (t < 0.03)] = [0.78, 0.6, 0.25]                      # pirinç uçlar
            p['attributes']['COLOR_0'] = add_acc(col, 'VEC3')
    for mt in j['materials']:
        mt['pbrMetallicRoughness'] = {'baseColorFactor': [1, 1, 1, 1], 'metallicFactor': 0.45, 'roughnessFactor': 0.45}

if a.rotz:
    h = math.radians(a.rotz) / 2
    roots = j['scenes'][j.get('scene', 0)]['nodes']
    j['nodes'].append({'name': 'dik', 'rotation': [0, 0, math.sin(h), math.cos(h)], 'children': roots})
    j['scenes'][j.get('scene', 0)]['nodes'] = [len(j['nodes']) - 1]
j['buffers'] = [{'byteLength': len(binc)}]
while len(binc) % 4: binc.append(0)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
with open(a.dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binc)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
    f.write(struct.pack('<II', len(binc), 0x004E4942)); f.write(bytes(binc))
print('düz model yazıldı', a.dst)
