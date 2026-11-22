# İskeletli FBX (7.x ikili) -> derili glTF (GLB). Kemikler mixamo adlarına çevrilir.
# Kullanım: python3 fbxskin.py giriş.fbx çıkış.glb dokuklasörü [--tex 1024] [--skip mesh1,mesh2] [--transfer kaynak.npz] [--dump çıkış.npz]
import sys, os, io, json, struct, math, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fbx import parse, find, child
from PIL import Image

MESHWORLD = False
MIXAMO = {
    # 3ds Max Biped
    'Bip001 Pelvis': 'Hips', 'Bip001 Spine': 'Spine', 'Bip001 Spine1': 'Spine1', 'Bip001 Spine2': 'Spine2', 'Bip001 Neck': 'Neck', 'Bip001 Head': 'Head', 'Bip001 HeadNub': 'HeadTop_End',
    'Bip001 L Clavicle': 'LeftShoulder', 'Bip001 L UpperArm': 'LeftArm', 'Bip001 L Forearm': 'LeftForeArm', 'Bip001 L Hand': 'LeftHand',
    'Bip001 R Clavicle': 'RightShoulder', 'Bip001 R UpperArm': 'RightArm', 'Bip001 R Forearm': 'RightForeArm', 'Bip001 R Hand': 'RightHand',
    'Bip001 L Thigh': 'LeftUpLeg', 'Bip001 L Calf': 'LeftLeg', 'Bip001 L Foot': 'LeftFoot', 'Bip001 L Toe0': 'LeftToeBase',
    'Bip001 R Thigh': 'RightUpLeg', 'Bip001 R Calf': 'RightLeg', 'Bip001 R Foot': 'RightFoot', 'Bip001 R Toe0': 'RightToeBase',
    # Unreal tarzı
    'pelvis': 'Hips', 'spine_01': 'Spine', 'spine_02': 'Spine1', 'spine_03': 'Spine2', 'neck_01': 'Neck', 'head': 'Head',
    'clavicle_l': 'LeftShoulder', 'upperarm_l': 'LeftArm', 'lowerarm_l': 'LeftForeArm', 'hand_l': 'LeftHand',
    'clavicle_r': 'RightShoulder', 'upperarm_r': 'RightArm', 'lowerarm_r': 'RightForeArm', 'hand_r': 'RightHand',
    'thigh_l': 'LeftUpLeg', 'calf_l': 'LeftLeg', 'foot_l': 'LeftFoot', 'ball_l': 'LeftToeBase',
    'thigh_r': 'RightUpLeg', 'calf_r': 'RightLeg', 'foot_r': 'RightFoot', 'ball_r': 'RightToeBase',
    # Unreal benzeri ikinci düzen (spine01, arm_l, knee_l, toe_l)
    'spine01': 'Spine', 'spine02': 'Spine1', 'spine03': 'Spine2', 'neck': 'Neck',
    'arm_l': 'LeftArm', 'arm_r': 'RightArm', 'knee_l': 'LeftLeg', 'knee_r': 'RightLeg', 'toe_l': 'LeftToeBase', 'toe_r': 'RightToeBase',
}
# parmaklar: Biped "Bip001 L Finger1" -> LeftHandIndex1 vb.
FING_B = {'0': 'Thumb', '1': 'Index', '2': 'Middle', '3': 'Ring', '4': 'Pinky'}
FING_U = {'thumb': 'Thumb', 'index': 'Index', 'middle': 'Middle', 'ring': 'Ring', 'pinky': 'Pinky'}
def mixname(n):
    if n in MIXAMO: return 'mixamorig' + MIXAMO[n]
    # HumanIK (Maya) adları: Character1_RightHand -> mixamorigRightHand
    if n.startswith('Character1_'): return 'mixamorig' + n[len('Character1_'):]
    import re
    m = re.match(r'Bip001 ([LR]) Finger(\d)(\d?)(Nub)?$', n)
    if m:
        side = 'Left' if m.group(1) == 'L' else 'Right'
        k = 4 if m.group(4) else (int(m.group(3)) + 1 if m.group(3) else 1)
        return f'mixamorig{side}Hand{FING_B[m.group(2)]}{k}'
    m = re.match(r'(thumb|index|middle|ring|pinky)_([lr])$', n)          # parmak kökü: index_l -> LeftHandIndex1
    if m: return f"mixamorig{'Left' if m.group(2) == 'l' else 'Right'}Hand{FING_U[m.group(1)]}1"
    m = re.match(r'(thumb|index|middle|ring|pinky)_tip_([lr])$', n)
    if m: return f"mixamorig{'Left' if m.group(2) == 'l' else 'Right'}Hand{FING_U[m.group(1)]}4"
    m = re.match(r'(thumb|index|middle|ring|pinky)_0(\d)_([lr])$', n)
    if m: return f"mixamorig{'Left' if m.group(3) == 'l' else 'Right'}Hand{FING_U[m.group(1)]}{m.group(2)}"
    return n.replace(' ', '_')

def name_of(o): return o['props'][1].split('\x00')[0]
def p70(o):
    c = child(o, 'Properties70'); return {pp['props'][0]: pp['props'][4:] for pp in (c['ch'] if c else [])}
def rot_euler(r, order=0):
    x, y, z = np.radians(r)
    Rx = np.array([[1, 0, 0], [0, math.cos(x), -math.sin(x)], [0, math.sin(x), math.cos(x)]])
    Ry = np.array([[math.cos(y), 0, math.sin(y)], [0, 1, 0], [-math.sin(y), 0, math.cos(y)]])
    Rz = np.array([[math.cos(z), -math.sin(z), 0], [math.sin(z), math.cos(z), 0], [0, 0, 1]])
    M = {0: Rz @ Ry @ Rx, 1: Ry @ Rz @ Rx, 2: Rx @ Rz @ Ry, 3: Rz @ Rx @ Ry, 4: Ry @ Rx @ Rz, 5: Rx @ Ry @ Rz}[order]
    R4 = np.eye(4); R4[:3, :3] = M; return R4
def T4(v): M = np.eye(4); M[:3, 3] = v; return M
def S4(v): return np.diag([v[0], v[1], v[2], 1.0])
def local_matrix(P):
    g = lambda k, d: np.array(P[k], dtype=float) if k in P else np.array(d, dtype=float)
    order = int(P.get('RotationOrder', [0])[0])
    T = T4(g('Lcl Translation', [0, 0, 0])); R = rot_euler(g('Lcl Rotation', [0, 0, 0]), order); S = S4(g('Lcl Scaling', [1, 1, 1]))
    Roff = T4(g('RotationOffset', [0, 0, 0])); Rp = T4(g('RotationPivot', [0, 0, 0])); Soff = T4(g('ScalingOffset', [0, 0, 0])); Sp = T4(g('ScalingPivot', [0, 0, 0]))
    act = int(P.get('RotationActive', [0])[0])
    Rpre = rot_euler(g('PreRotation', [0, 0, 0])) if act or 'PreRotation' in P else np.eye(4)
    Rpost = rot_euler(g('PostRotation', [0, 0, 0])) if act or 'PostRotation' in P else np.eye(4)
    return T @ Roff @ Rp @ Rpre @ R @ np.linalg.inv(Rpost) @ np.linalg.inv(Rp) @ Soff @ Sp @ S @ np.linalg.inv(Sp)
def geometric(P):
    g = lambda k, d: np.array(P[k], dtype=float) if k in P else np.array(d, dtype=float)
    return T4(g('GeometricTranslation', [0, 0, 0])) @ rot_euler(g('GeometricRotation', [0, 0, 0])) @ S4(g('GeometricScaling', [1, 1, 1]))

def layer(geo, name, key, idxkey):
    L = child(geo, name)
    if not L: return None
    mp = child(L, 'MappingInformationType')['props'][0]; ref = child(L, 'ReferenceInformationType')['props'][0]
    data = child(L, key)['props'][0] if child(L, key) else None
    idx = child(L, idxkey)['props'][0] if idxkey and child(L, idxkey) else None
    return mp, ref, data, idx

def find_file(folder, fn):
    base = os.path.basename(fn.replace('\\', '/')).lower()
    stem = os.path.splitext(base)[0]
    for root, _, files in os.walk(folder):
        for f in files:
            if f.lower() == base: return os.path.join(root, f)
    for root, _, files in os.walk(folder):   # uzantı farklı olabilir (tga -> png)
        for f in files:
            if os.path.splitext(f.lower())[0] == stem: return os.path.join(root, f)
    return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst'); ap.add_argument('texdir')
    ap.add_argument('--tex', type=int, default=1024); ap.add_argument('--skip', default='')
    ap.add_argument('--transfer', default=None); ap.add_argument('--dump', default=None)
    ap.add_argument('--texmap', default='')   # malzeme=dosya,malzeme=dosya (eksik doku için)
    ap.add_argument('--fitbody', default='Man'); ap.add_argument('--sx', type=float, default=0.9); ap.add_argument('--srctop', type=float, default=None)
    ap.add_argument('--meshworld', action='store_true')   # deri Transform yerine örgünün dünya matrisini kullan (3ds Max çıkışları)
    a = ap.parse_args()
    global MESHWORLD; MESHWORLD = a.meshworld
    ver, top = parse(a.src)
    objs = {o['props'][0]: o for o in find(top, 'Objects')[0]['ch']}
    conns = [c['props'] for c in find(top, 'Connections')[0]['ch']]
    parent, kids, op = {}, {}, {}
    for c in conns:
        if c[0] == 'OO': parent.setdefault(c[1], []).append(c[2]); kids.setdefault(c[2], []).append(c[1])
        elif c[0] == 'OP': op.setdefault(c[2], []).append((c[1], c[3]))
    gs = p70(find(top, 'GlobalSettings')[0]); unit = float(gs.get('UnitScaleFactor', [1])[0])
    models = {i: o for i, o in objs.items() if o['name'] == 'Model'}
    # dünya matrisleri (dosyadaki duruş)
    W = {}
    def world(i):
        if i in W: return W[i]
        par = [p for p in parent.get(i, []) if p in models]
        M = local_matrix(p70(models[i]))
        if par: M = world(par[0]) @ M
        W[i] = M; return M
    for i in models: world(i)
    bones = [i for i, o in models.items() if o['props'][2] in ('LimbNode', 'Root', 'Null') and not any(objs.get(k, {}).get('name') == 'Geometry' for k in kids.get(i, []))]
    # sadece iskelet zincirinde olanlar: LimbNode/Root ve bunların ebeveynleri
    boneset = set(i for i in bones if models[i]['props'][2] in ('LimbNode', 'Root'))
    for i in list(boneset):
        q = i
        while True:
            par = [p for p in parent.get(q, []) if p in models]
            if not par: break
            q = par[0]
            if models[q]['props'][2] == 'Mesh': break
            boneset.add(q)
    conv = np.diag([unit / 100.0] * 3 + [1.0])  # cm/inç -> metre, eksen zaten Y-yukarı
    skip = [s.strip().lower() for s in a.skip.split(',') if s.strip()]
    meshes = [i for i, o in models.items() if o['props'][2] == 'Mesh' and not any(s in name_of(o).lower() for s in skip)]
    images, materials, mat_index = [], [], {}
    def texture_for(mat_id):
        best = None
        for (src, prop) in op.get(mat_id, []):
            t = objs.get(src)
            if t and t['name'] == 'Texture' and prop in ('DiffuseColor', 'Maya|baseColor', 'Maya|TEX_color_map', '3dsMax|Parameters|base_color_map', 'base_color_map'):
                fn = child(t, 'RelativeFilename') or child(t, 'FileName'); best = fn['props'][0] if fn else None
                if best: break
        return best
    texmap = dict(kv.split('=', 1) for kv in a.texmap.split(',') if '=' in kv)
    def material(mat_id):
        if mat_id in mat_index: return mat_index[mat_id]
        m = objs[mat_id]; nm = name_of(m); P = p70(m)
        fn = texmap.get(nm) or texture_for(mat_id)
        path = find_file(a.texdir, fn) if fn else None
        uniq = nm if all(m['name'] != nm for m in materials) else f'{nm}_{len(materials)}'
        entry = {'name': uniq, 'pbrMetallicRoughness': {'metallicFactor': 0.0, 'roughnessFactor': 0.8}}
        if path:
            im = Image.open(path)
            # yanında "..._Opacity" dosyası varsa saydamlık oradan alınır (dişler, yeleler, kanat zarı)
            op_path = path.replace('Diffuse', 'Opacity') if 'Diffuse' in os.path.basename(path) else None
            if op_path and os.path.exists(op_path):
                om = Image.open(op_path).convert('L').resize(im.size)
                if np.asarray(om).min() < 250: im = im.convert('RGB'); im.putalpha(om)
            alpha = im.mode in ('RGBA', 'LA') and np.asarray(im.convert('RGBA'))[..., 3].min() < 250
            im = im.convert('RGBA' if alpha else 'RGB')
            if max(im.size) > a.tex: im = im.resize((a.tex, a.tex) if im.size[0] == im.size[1] else (a.tex, int(a.tex * im.size[1] / im.size[0])), Image.LANCZOS)
            b = io.BytesIO()
            if alpha: im.quantize(256, method=Image.Quantize.FASTOCTREE).save(b, 'PNG', optimize=True); mime = 'image/png'   # 256 renkli: çok daha küçük
            else: im.save(b, 'JPEG', quality=84, optimize=True); mime = 'image/jpeg'
            images.append((b.getvalue(), mime))
            entry['pbrMetallicRoughness']['baseColorTexture'] = {'index': len(images) - 1}
            if alpha: entry['alphaMode'] = 'MASK'; entry['alphaCutoff'] = 0.4; entry['doubleSided'] = True
            print('  doku', nm, '<-', os.path.basename(path), im.size, 'alfa' if alpha else '')
        else:
            dc = P.get('DiffuseColor') or P.get('Diffuse') or [0.7, 0.7, 0.7]
            entry['pbrMetallicRoughness']['baseColorFactor'] = [float(dc[0]), float(dc[1]), float(dc[2]), 1.0]
            print('  doku yok', nm, fn)
        materials.append(entry); mat_index[mat_id] = len(materials) - 1; return mat_index[mat_id]
    # kemik düğümleri
    blist = [i for i in models if i in boneset]
    bidx = {b: k for k, b in enumerate(blist)}
    TL = {}
    prims_all = []
    dumpP, dumpW, dumpJ = [], [], []
    for mi in meshes:
        mo = models[mi]
        geo = [k for k in kids.get(mi, []) if objs.get(k, {}).get('name') == 'Geometry'][0]
        g = objs[geo]
        V = child(g, 'Vertices')['props'][0].reshape(-1, 3).astype(float)
        PI = child(g, 'PolygonVertexIndex')['props'][0].astype(np.int64)
        # deri
        skin = [k for k in kids.get(geo, []) if objs.get(k, {}).get('name') == 'Deformer' and objs[k]['props'][2] == 'Skin']
        cw = [[] for _ in range(len(V))]
        Mbind = world(mi) @ geometric(p70(mo))
        if skin:
            for cl in kids.get(skin[0], []):
                c = objs[cl]
                bone = [k for k in kids.get(cl, []) if k in models]
                if not bone or not child(c, 'Indexes'): continue
                bone = bone[0]
                tl = np.array(child(c, 'TransformLink')['props'][0]).reshape(4, 4).T
                tr = np.array(child(c, 'Transform')['props'][0]).reshape(4, 4).T
                TL[bone] = tl
                if not MESHWORLD: Mbind = tr @ geometric(p70(mo))
                for vi, w in zip(child(c, 'Indexes')['props'][0], child(c, 'Weights')['props'][0]):
                    if w > 1e-4: cw[vi].append((bidx[bone], float(w)))
        Pw = (np.c_[V, np.ones(len(V))] @ Mbind.T)[:, :3]
        Nmat = np.linalg.inv(Mbind[:3, :3]).T
        nm = layer(g, 'LayerElementNormal', 'Normals', 'NormalsIndex')
        uv = layer(g, 'LayerElementUV', 'UV', 'UVIndex')
        ml = layer(g, 'LayerElementMaterial', 'Materials', None)
        mats = [k for k in kids.get(mi, []) if objs.get(k, {}).get('name') == 'Material']
        N = nm[2].reshape(-1, 3) if nm else None; UVd = uv[2].reshape(-1, 2) if uv else None
        def attr(L, data, vi, pvk, poly):
            mp, ref = L[0], L[1]
            j = vi if mp in ('ByVertice', 'ByVertex', 'ByControlPoint') else (poly if mp == 'ByPolygon' else (0 if mp == 'AllSame' else pvk))
            if ref == 'IndexToDirect' and L[3] is not None: j = L[3][j]
            return data[j]
        polys, cur = [], []
        for k, i in enumerate(PI):
            if i < 0: cur.append((-i - 1, k)); polys.append(cur); cur = []
            else: cur.append((i, k))
        groups = {}
        for pidx, poly in enumerate(polys):
            mslot = 0
            if ml and ml[2] is not None and len(mats) > 1: mslot = int(ml[2][0 if ml[0] == 'AllSame' else pidx])
            groups.setdefault(mslot, []).append((pidx, poly))
        for mslot, plist in groups.items():
            key2, P, NN, UU, JJ, WW, I = {}, [], [], [], [], [], []
            for pidx, poly in plist:
                ids = []
                for vi, pvk in poly:
                    n = attr(nm, N, vi, pvk, pidx) if nm else np.array([0, 1, 0]); u = attr(uv, UVd, vi, pvk, pidx) if uv else np.array([0, 0])
                    key = (vi, round(float(u[0]), 5), round(float(u[1]), 5), round(float(n[0]), 2), round(float(n[1]), 2), round(float(n[2]), 2))
                    if key not in key2:
                        key2[key] = len(P); P.append(Pw[vi]); NN.append(Nmat @ n); UU.append(u)
                        ws = sorted(cw[vi], key=lambda t: -t[1])[:4]
                        JJ.append([t[0] for t in ws] + [0] * (4 - len(ws))); WW.append([t[1] for t in ws] + [0.0] * (4 - len(ws)))
                    ids.append(key2[key])
                for t in range(1, len(ids) - 1): I.append((ids[0], ids[t], ids[t + 1]))
            P = (np.c_[np.array(P), np.ones(len(P))] @ conv.T)[:, :3]
            NN = np.array(NN); NN /= np.maximum(1e-9, np.linalg.norm(NN, axis=1, keepdims=True))
            UU = np.array(UU, dtype=float); UU[:, 1] = 1 - UU[:, 1]
            JJ = np.array(JJ, dtype=np.uint16); WW = np.array(WW, dtype=np.float32)
            prims_all.append({'name': name_of(mo), 'P': P.astype(np.float32), 'N': NN.astype(np.float32), 'UV': UU.astype(np.float32), 'J': JJ, 'W': WW, 'I': np.array(I, dtype=np.uint32),
                              'mat': material(mats[mslot]) if mats else None, 'skinned': bool(skin)})
    # ağırlık aktarımı (iskeletsiz model için): kaynak npz'deki en yakın noktalardan
    if a.transfer:
        src = np.load(a.transfer, allow_pickle=True)
        SP, SJ, SW, snames = src['P'], src['J'], src['W'], list(src['names'])
        Wsrc = src['world']; Psrc = src['parent']
        SP, Wsrc = fit_source(prims_all, SP, SJ, SW, snames, Wsrc, a)
        transfer_weights(prims_all, SP, SJ, SW, a)
        skel = [(str(snames[k]), int(Psrc[k]), Wsrc[k]) for k in range(len(snames))]
        write_generic(a.dst, prims_all, materials, images, skel)
        return
    Wb0 = {}
    def bw_(b):
        if b in Wb0: return Wb0[b]
        if b in TL: Wb0[b] = TL[b]; return TL[b]
        par = [p for p in parent.get(b, []) if p in boneset]
        Wb0[b] = (bw_(par[0]) @ np.linalg.inv(world(par[0])) @ world(b)) if par else world(b); return Wb0[b]
    BW = [bw_(b) for b in blist]
    if a.dump:
        allP = np.concatenate([p['P'] for p in prims_all if p['skinned']]); allJ = np.concatenate([p['J'] for p in prims_all if p['skinned']]); allW = np.concatenate([p['W'] for p in prims_all if p['skinned']])
        np.savez(a.dump, P=allP, J=allJ, W=allW, names=np.array([mixname(name_of(models[b])) for b in blist]),
                 world=np.array([conv @ bw for bw in BW]), parent=np.array([bidx.get(([p for p in parent.get(b, []) if p in boneset] or [None])[0], -1) for b in blist]))
    # bağlama pozu ile dosya pozunu karşılaştır (dönüşüm formülünün doğruluğu)
    err = [np.abs(world(b) - TL[b]).max() for b in TL]
    print('kemik', len(blist), 'deri kemiği', len(TL), 'bağlama farkı en çok', round(max(err), 4) if err else None)
    # kemiklerin dünya matrisi: bağlama pozu (TransformLink) varsa o, yoksa dosya pozu.
    # Bağlama pozuyla kurulan iskelet, örgüyü olduğu gibi gösterir.
    Wb = {}
    for b in blist:
        Wb[b] = TL[b] if b in TL else None
    def bind_world(b):
        if Wb[b] is not None: return Wb[b]
        par = [p for p in parent.get(b, []) if p in boneset]
        Wb[b] = (bind_world(par[0]) @ np.linalg.inv(world(par[0])) @ world(b)) if par else world(b)
        return Wb[b]
    for b in blist: bind_world(b)
    skel = []
    for b in blist:
        par = [p for p in parent.get(b, []) if p in boneset]
        skel.append((mixname(name_of(models[b])), bidx[par[0]] if par else -1, conv @ Wb[b]))
    write_generic(a.dst, prims_all, materials, images, skel)

def decompose(M):
    t = M[:3, 3].copy(); R = M[:3, :3].copy(); s = np.linalg.norm(R, axis=0)
    if np.linalg.det(R) < 0: s[0] = -s[0]
    R = R / s
    # matris -> kuaterniyon
    m = R; tr = m[0, 0] + m[1, 1] + m[2, 2]
    if tr > 0: S = math.sqrt(tr + 1) * 2; q = [(m[2, 1] - m[1, 2]) / S, (m[0, 2] - m[2, 0]) / S, (m[1, 0] - m[0, 1]) / S, 0.25 * S]
    elif m[0, 0] > m[1, 1] and m[0, 0] > m[2, 2]: S = math.sqrt(1 + m[0, 0] - m[1, 1] - m[2, 2]) * 2; q = [0.25 * S, (m[0, 1] + m[1, 0]) / S, (m[0, 2] + m[2, 0]) / S, (m[2, 1] - m[1, 2]) / S]
    elif m[1, 1] > m[2, 2]: S = math.sqrt(1 + m[1, 1] - m[0, 0] - m[2, 2]) * 2; q = [(m[0, 1] + m[1, 0]) / S, 0.25 * S, (m[1, 2] + m[2, 1]) / S, (m[0, 2] - m[2, 0]) / S]
    else: S = math.sqrt(1 + m[2, 2] - m[0, 0] - m[1, 1]) * 2; q = [(m[0, 2] + m[2, 0]) / S, (m[1, 2] + m[2, 1]) / S, 0.25 * S, (m[1, 0] - m[0, 1]) / S]
    q = np.array(q); q /= np.linalg.norm(q)
    return t, q, s

def write_tail(dst, prims, materials, images, nodes, ibms):
    buf = bytearray(); views = []; accs = []
    def add(arr, target=None, comp=5126, typ='VEC3', mm=False, norm=False):
        while len(buf) % 4: buf.append(0)
        off = len(buf); bb = arr.tobytes(); buf.extend(bb)
        v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(bb)}
        if target: v['target'] = target
        views.append(v)
        acc = {'bufferView': len(views) - 1, 'componentType': comp, 'count': len(arr), 'type': typ}
        if norm: acc['normalized'] = True
        if mm: acc['min'] = arr.min(0).tolist(); acc['max'] = arr.max(0).tolist()
        accs.append(acc); return len(accs) - 1
    ibm = np.array([m.T.ravel() for m in ibms], dtype=np.float32)
    ibm_acc = add(ibm, comp=5126, typ='MAT4')
    meshes = []
    for p in prims:
        attrs = {'POSITION': add(p['P'], 34962, mm=True), 'NORMAL': add(p['N'], 34962), 'TEXCOORD_0': add(p['UV'], 34962, typ='VEC2')}
        if p['skinned']:
            attrs['JOINTS_0'] = add(p['J'].astype(np.uint16), 34962, comp=5123, typ='VEC4')
            w = p['W'] / np.maximum(1e-9, p['W'].sum(1, keepdims=True)); attrs['WEIGHTS_0'] = add(w.astype(np.float32), 34962, typ='VEC4')
        prim = {'attributes': attrs, 'indices': add(p['I'].ravel(), 34963, comp=5125, typ='SCALAR')}
        if p['mat'] is not None: prim['material'] = p['mat']
        meshes.append({'name': p['name'], 'primitives': [prim]})
        n = {'name': p['name'], 'mesh': len(meshes) - 1}
        if p['skinned']: n['skin'] = 0
        nodes.append(n); nodes[0]['children'].append(len(nodes) - 1)
    imgs, texs = [], []
    for data, mime in images:
        while len(buf) % 4: buf.append(0)
        off = len(buf); buf.extend(data); views.append({'buffer': 0, 'byteOffset': off, 'byteLength': len(data)})
        imgs.append({'bufferView': len(views) - 1, 'mimeType': mime}); texs.append({'source': len(imgs) - 1, 'sampler': 0})
    while len(buf) % 4: buf.append(0)
    j = {'asset': {'version': '2.0', 'generator': 'atabis fbxskin'}, 'scene': 0, 'scenes': [{'nodes': [0]}], 'nodes': nodes, 'meshes': meshes,
         'skins': [{'joints': list(range(1, len(ibms) + 1)), 'inverseBindMatrices': ibm_acc}],
         'materials': materials or [{'name': 'varsayılan'}], 'accessors': accs, 'bufferViews': views, 'buffers': [{'byteLength': len(buf)}]}
    if imgs: j['images'] = imgs; j['textures'] = texs; j['samplers'] = [{'magFilter': 9729, 'minFilter': 9987}]
    js = json.dumps(j, separators=(',', ':')).encode()
    while len(js) % 4: js += b' '
    out = struct.pack('<4sII', b'glTF', 2, 28 + len(js) + len(buf)) + struct.pack('<I4s', len(js), b'JSON') + js + struct.pack('<I4s', len(buf), b'BIN\0') + bytes(buf)
    open(dst, 'wb').write(out)
    print('yazıldı', dst, round(len(out) / 1e6, 2), 'MB', 'nokta', sum(len(p['P']) for p in prims), 'üçgen', sum(len(p['I']) for p in prims))

def fit_source(prims, SP, SJ, SW, snames, Wsrc, a):
    # kaynak modeli (nokta + iskelet) hedefe oturt: boy/genişlik ölçeği, sonra kolları omuz çevresinde döndürüp ölçekle
    body = np.concatenate([p['P'] for p in prims if p['name'] in a.fitbody.split(',')])
    names = [str(n) for n in snames]
    top_s = SP[:, 1].max() if a.srctop is None else a.srctop
    sy = body[:, 1].max() / top_s; sx = a.sx
    G = np.array([sx, sy, sx])
    P = SP * G
    W = Wsrc.copy()
    for k in range(len(W)): W[k][:3, 3] = W[k][:3, 3] * G
    for side, sign in (('Left', 1), ('Right', -1)):
        chain = [k for k, n in enumerate(names) if n.startswith('mixamorig' + side + 'Arm') or n.startswith('mixamorig' + side + 'ForeArm') or n.startswith('mixamorig' + side + 'Hand')]
        sh = W[names.index('mixamorig' + side + 'Arm')][:3, 3].copy()
        tipS = P[np.argsort(-sign * P[:, 0])[:60]].mean(0)
        tipT = body[np.argsort(-sign * body[:, 0])[:60]].mean(0)
        vS = (tipS - sh)[:2]; vT = (tipT - sh)[:2]
        ang = math.atan2(vT[1], vT[0]) - math.atan2(vS[1], vS[0]); sc = np.linalg.norm(vT) / np.linalg.norm(vS)
        R = np.array([[math.cos(ang), -math.sin(ang), 0], [math.sin(ang), math.cos(ang), 0], [0, 0, 1]]) * sc
        Rr = np.array([[math.cos(ang), -math.sin(ang), 0], [math.sin(ang), math.cos(ang), 0], [0, 0, 1]])
        chainset = set(chain)
        armw = np.array([sum(w for j, w in zip(SJ[v], SW[v]) if j in chainset) for v in range(len(SP))])
        m = armw > 0.5
        P[m] = (P[m] - sh) @ R.T + sh
        for k in chain:
            W[k][:3, 3] = (W[k][:3, 3] - sh) @ R.T + sh
            W[k][:3, :3] = Rr @ W[k][:3, :3]
        print('  kol', side, 'açı', round(math.degrees(ang), 1), 'ölçek', round(sc, 3), 'nokta', int(m.sum()))
    print('  ölçek', np.round(G, 3))
    return P, W

def transfer_weights(prims, SP, SJ, SW, a, k=6):
    # her noktaya kaynak modeldeki en yakın noktaların ağırlıkları (uzaklıkla ağırlıklı ortalama)
    from scipy.spatial import cKDTree
    tree = cKDTree(SP)
    for p in prims:
        d, ix = tree.query(p['P'], k=k)
        w = 1.0 / np.maximum(d, 1e-4) ** 2; w /= w.sum(1, keepdims=True)
        J = np.zeros((len(p['P']), 4), np.uint16); Wt = np.zeros((len(p['P']), 4), np.float32)
        for v in range(len(p['P'])):
            acc = {}
            for kk in range(k):
                for jj, ww in zip(SJ[ix[v, kk]], SW[ix[v, kk]]):
                    if ww > 0: acc[int(jj)] = acc.get(int(jj), 0) + ww * w[v, kk]
            top = sorted(acc.items(), key=lambda t: -t[1])[:4]
            for q, (jj, ww) in enumerate(top): J[v, q] = jj; Wt[v, q] = ww
        p['J'] = J; p['W'] = Wt; p['skinned'] = True
        print('  aktarıldı', p['name'], len(p['P']), 'en uzak', round(float(d[:, 0].max()), 3))

def write_generic(dst, prims, materials, images, skel):
    # skel: [(ad, ebeveyn sırası, dünya matrisi)]; kökler Armature altında
    nodes = [{'name': 'Armature', 'children': []}]
    for nm, par, Wm in skel: nodes.append({'name': nm})
    for k, (nm, par, Wm) in enumerate(skel):
        Ml = np.linalg.inv(skel[par][2]) @ Wm if par >= 0 else Wm
        t, q, sc = decompose(Ml)
        n = nodes[k + 1]; n['translation'] = [float(x) for x in t]; n['rotation'] = [float(x) for x in q]
        if np.abs(sc - 1).max() > 1e-4: n['scale'] = [float(x) for x in sc]
        (nodes[par + 1].setdefault('children', []) if par >= 0 else nodes[0]['children']).append(k + 1)
    write_tail(dst, prims, materials, images, nodes, [np.linalg.inv(Wm) for _, _, Wm in skel])

if __name__ == '__main__':
    main()
