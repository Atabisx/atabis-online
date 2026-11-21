# FBX hareket dosyalarını (yalnız iskelet + animasyon) derili GLB'ye klip olarak ekler.
# Kemikler ada göre eşleşir (fbxskin ile aynı mixname çevirisi).
# Kullanım: python3 fbxanim.py taban.glb çıktı.glb Idle=idle.fbx Walk=walk.fbx ... [--fps 30] [--zup]
#   Tek dosyada birden çok hareket (AnimationStack) varsa: Idle=hepsi.fbx#YığınAdı
#   --zup: 3ds Max (Z yukarı) dosyası; iskeletin köküne -90° X dönmesi eklenir
import sys, os, json, struct, math, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fbx import parse, find, child
from fbxskin import mixname, name_of, p70, local_matrix, decompose

TICK = 46186158000.0

_parsed = {}
def load_motion(path, stack=None):
    if path not in _parsed: _parsed[path] = parse(path)
    ver, top = _parsed[path]
    objs = {o['props'][0]: o for o in find(top, 'Objects')[0]['ch']}
    parent, op = {}, {}
    for c in (c['props'] for c in find(top, 'Connections')[0]['ch']):
        if c[0] == 'OO': parent.setdefault(c[1], []).append(c[2])
        elif c[0] == 'OP': op.setdefault(c[2], []).append((c[1], c[3]))
    # istenen yığının katmanlarındaki eğri düğümleri ve zaman aralığı
    allowed, t0, t1 = None, None, None
    if stack:
        st = [i for i, o in objs.items() if o['name'] == 'AnimationStack' and name_of(o) == stack]
        if not st: raise SystemExit('yığın yok: ' + stack)
        P = p70(objs[st[0]])
        if 'LocalStart' in P: t0 = float(P['LocalStart'][0]) / TICK
        if 'LocalStop' in P: t1 = float(P['LocalStop'][0]) / TICK
        layers = [i for i, o in objs.items() if o['name'] == 'AnimationLayer' and st[0] in parent.get(i, [])]
        allowed = set(i for i, o in objs.items() if o['name'] == 'AnimationCurveNode' and any(l in parent.get(i, []) for l in layers))
        if not allowed: allowed = None   # eğriler ortak zaman çizgisinde: aralıkla kesilir
    gs = p70(find(top, 'GlobalSettings')[0]); unit = float(gs.get('UnitScaleFactor', [1])[0])
    models = {i: o for i, o in objs.items() if o['name'] == 'Model'}
    base = {i: p70(o) for i, o in models.items()}
    # model -> {'Lcl Rotation': [(times, values) x3 or None]}
    anim = {}
    end = 0
    for cn_id, cn in objs.items():
        if cn['name'] != 'AnimationCurveNode': continue
        if allowed is not None and cn_id not in allowed: continue
        tgt = [(m, prop) for m, lst in op.items() for (src, prop) in lst if src == cn_id and m in models]
        if not tgt: continue
        m, prop = tgt[0]
        dflt = p70(cn)
        chans = []
        for k, ax in enumerate('XYZ'):
            curve = [src for (src, pr) in op.get(cn_id, []) if pr == 'd|' + ax and objs.get(src, {}).get('name') == 'AnimationCurve']
            if curve:
                cv = objs[curve[0]]
                kt = np.array(child(cv, 'KeyTime')['props'][0], dtype=np.float64) / TICK
                kv = np.array(child(cv, 'KeyValueFloat')['props'][0], dtype=np.float64)
                chans.append((kt, kv)); end = max(end, kt[-1])
            else:
                d = dflt.get('d|' + ax)
                chans.append(float(d[0]) if d else None)
        anim.setdefault(m, {})[prop] = chans
    byname = {mixname(name_of(o)): i for i, o in models.items()}
    if allowed is not None and anim:
        # yığının kendi eğrileri varsa süre eğrilerin anahtarlarından alınır (LocalStop tüm çizgiyi gösterebilir)
        ks = [ch[0] for d in anim.values() for chans in d.values() for ch in chans if isinstance(ch, tuple)]
        if ks: t0 = min(k[0] for k in ks); t1 = max(k[-1] for k in ks)
    if t0 is None: t0 = 0.0
    if t1 is None or t1 <= t0: t1 = end
    return models, base, anim, parent, unit, (t0, t1), byname

def sample(models, base, anim, parent, t):
    L = {}
    for i in models:
        P = dict(base[i])
        for prop, chans in anim.get(i, {}).items():
            cur = list(P.get(prop, [0, 0, 0] if prop != 'Lcl Scaling' else [1, 1, 1]))
            for k, ch in enumerate(chans):
                if ch is None: continue
                if isinstance(ch, float): cur[k] = ch
                else: cur[k] = float(np.interp(t, ch[0], ch[1]))
            P[prop] = cur
        L[i] = local_matrix(P)
    W = {}
    def world(i):
        if i in W: return W[i]
        par = [p for p in parent.get(i, []) if p in models]
        W[i] = (world(par[0]) @ L[i]) if par else L[i]; return W[i]
    for i in models: world(i)
    return W

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('clips', nargs='+')
    ap.add_argument('--fps', type=float, default=30); ap.add_argument('--zup', action='store_true')
    a = ap.parse_args()
    b = open(a.src, 'rb').read(); Lj = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20 + Lj])
    binc = bytearray(b[20 + Lj + 8:])
    nodes = j['nodes']
    par_of = {}
    for k, n in enumerate(nodes):
        for c in n.get('children', []): par_of[c] = k
    joints = j['skins'][0]['joints']
    jname = {k: nodes[k]['name'] for k in joints}
    if a.zup:
        h = math.radians(-90) / 2
        nodes[0]['rotation'] = [math.sin(h), 0, 0, math.cos(h)]
    def add(arr, typ, mm=False):
        nonlocal binc
        while len(binc) % 4: binc.append(0)
        arr = np.ascontiguousarray(arr, dtype=np.float32)
        off = len(binc); binc += arr.tobytes()
        j['bufferViews'].append({'buffer': 0, 'byteOffset': off, 'byteLength': arr.nbytes})
        acc = {'bufferView': len(j['bufferViews']) - 1, 'componentType': 5126, 'count': len(arr), 'type': typ}
        if mm: acc['min'] = [float(arr.min())]; acc['max'] = [float(arr.max())]
        j['accessors'].append(acc); return len(j['accessors']) - 1
    j['animations'] = []
    for spec in a.clips:
        cname, path = spec.split('=', 1)
        stack = None
        if '#' in path: path, stack = path.split('#', 1)
        models, base, anim, parent, unit, (t0, t1), byname = load_motion(path, stack)
        conv = np.diag([unit / 100.0] * 3 + [1.0])
        n = max(2, int(round((t1 - t0) * a.fps)) + 1)
        times = np.arange(n) / a.fps
        tr = {k: [] for k in joints}; ro = {k: [] for k in joints}; sc = {k: [] for k in joints}
        for t in times:
            W = sample(models, base, anim, parent, t + t0)
            for k in joints:
                mi = byname.get(jname[k])
                if mi is None: continue
                pk = par_of.get(k)
                if pk in jname and jname[pk] in byname:
                    Ml = np.linalg.inv(W[byname[jname[pk]]]) @ W[mi]
                else:
                    Ml = conv @ W[mi]
                tt, q, s = decompose(Ml)
                if ro[k] and np.dot(ro[k][-1], q) < 0: q = -q
                tr[k].append(tt); ro[k].append(q); sc[k].append(s)
        tin = add(times, 'SCALAR', mm=True)
        samplers, channels = [], []
        for k in joints:
            if not ro[k]: continue
            for path_, arr, typ in (('translation', tr[k], 'VEC3'), ('rotation', ro[k], 'VEC4'), ('scale', sc[k], 'VEC3')):
                arr = np.array(arr)
                if path_ == 'scale' and np.abs(arr - 1).max() < 1e-3 and 'scale' not in nodes[k]: continue
                if path_ == 'translation' and np.abs(arr - arr[0]).max() < 1e-4:
                    # hareketsiz kanal ve dinlenme konumuyla aynıysa yazılmaz (dosya küçülür)
                    rest = np.array(nodes[k].get('translation', [0, 0, 0]))
                    if np.abs(arr[0] - rest).max() < 1e-3 * max(1.0, np.abs(rest).max()): continue
                samplers.append({'input': tin, 'output': add(arr, typ), 'interpolation': 'LINEAR'})
                channels.append({'sampler': len(samplers) - 1, 'target': {'node': k, 'path': path_}})
        j['animations'].append({'name': cname, 'samplers': samplers, 'channels': channels})
        print('klip', cname, round(times[-1], 2), 's', len(channels), 'kanal', 'eşleşmeyen', sum(1 for k in joints if not ro[k]))
    while len(binc) % 4: binc.append(0)
    j['buffers'] = [{'byteLength': len(binc)}]
    js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
    out = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binc)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binc), 0x004E4942) + bytes(binc)
    open(a.dst, 'wb').write(out); print('yazıldı', a.dst, round(len(out) / 1e6, 2), 'MB')

if __name__ == '__main__':
    main()
