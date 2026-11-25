# Pişirilmiş karakter GLB'sini küçültür: dokuları istenen boya indirir (WebP), sıralı indeksi atar
# (köşeler zaten üçgen başına ayrı; oyun yüklerken indeksi kendisi kurar).
# Kullanım: python3 tools/charpack.py girdi.glb cikti.glb [--tex 2048] [--q 88]
import sys, json, struct, io, argparse
import numpy as np
from PIL import Image

ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--tex', type=int, default=0); ap.add_argument('--q', type=int, default=88)
a = ap.parse_args()
b = open(a.src, 'rb').read(); n = struct.unpack('<I', b[12:16])[0]
j = json.loads(b[20:20 + n]); o = 20 + n; BIN = b[o + 8:o + 8 + struct.unpack('<I', b[o:o + 4])[0]]

drop_views = set()
for m in j['meshes']:
    for p in m['primitives']:
        if 'indices' in p:
            ac = j['accessors'][p['indices']]
            bv = j['bufferViews'][ac['bufferView']]
            idx = np.frombuffer(BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']], {5125: np.uint32, 5123: np.uint16}[ac['componentType']])
            if np.array_equal(idx, np.arange(len(idx))):
                drop_views.add(ac['bufferView']); p.pop('indices')

new_img = {}
for i, im in enumerate(j.get('images', [])):
    bv = j['bufferViews'][im['bufferView']]
    data = BIN[bv.get('byteOffset', 0):bv.get('byteOffset', 0) + bv['byteLength']]
    if a.tex:
        img = Image.open(io.BytesIO(data)); mode = img.mode
        if max(img.size) > a.tex: img = img.resize((a.tex, a.tex), Image.LANCZOS)
        out = io.BytesIO(); img.save(out, 'WEBP', quality=a.q, method=6); data = out.getvalue()
        im['mimeType'] = 'image/webp'
    new_img[im['bufferView']] = data

NB = bytearray(); views = []; remap = {}
for i, v in enumerate(j['bufferViews']):
    if i in drop_views: continue
    data = new_img.get(i) or BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']]
    while len(NB) % 4: NB.append(0)
    nv = dict(v); nv['byteOffset'] = len(NB); nv['byteLength'] = len(data); NB.extend(data)
    remap[i] = len(views); views.append(nv)
accs, amap = [], {}
for i, ac in enumerate(j['accessors']):
    if ac.get('bufferView') in drop_views: continue
    na = dict(ac)
    if 'bufferView' in na: na['bufferView'] = remap[na['bufferView']]
    amap[i] = len(accs); accs.append(na)
for m in j['meshes']:
    for p in m['primitives']:
        p['attributes'] = {k: amap[v] for k, v in p['attributes'].items()}
        if 'indices' in p: p['indices'] = amap[p['indices']]
for sk in j.get('skins', []):
    if 'inverseBindMatrices' in sk: sk['inverseBindMatrices'] = amap[sk['inverseBindMatrices']]
for an in j.get('animations', []):
    for s in an['samplers']: s['input'] = amap[s['input']]; s['output'] = amap[s['output']]
for im in j.get('images', []): im['bufferView'] = remap[im['bufferView']]
j['bufferViews'] = views; j['accessors'] = accs; j['buffers'] = [{'byteLength': len(NB)}]
while len(NB) % 4: NB.append(0)
js = json.dumps(j, separators=(',', ':')).encode()
while len(js) % 4: js += b' '
with open(a.dst, 'wb') as f:
    f.write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(NB)))
    f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js); f.write(struct.pack('<II', len(NB), 0x004E4942)); f.write(NB)
print(a.dst, f'{len(b) // 1024} KB -> {(28 + len(js) + len(NB)) // 1024} KB')
