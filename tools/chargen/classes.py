# Sınıf karakterleri: savaşçı (erkek), ninja (kadın), okçu (kadın)
import sys, math
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from cgen import *

PI = math.pi
HEAD = src_part('fire-mage.head')

def head_radius(y, pad=0.0):
    """kafa yumurtasının y yüksekliğindeki (x, ön z, arka z) yarıçapları"""
    m = np.abs(HEAD.V[:, 1] - y) < 0.012
    if not m.any(): return 0.03, 0.03, 0.03
    V = HEAD.V[m]; return np.abs(V[:, 0]).max() + pad, V[:, 2].max() + pad, -V[:, 2].min() + pad

# ---------------- doku ressamları ----------------
def tex_lamellar(plate, lace, trim, w=256, h=256, rows=7, cols=16, trim_top=True, trim_bot=True, rivet='#e8d9a8'):
    im = Image.new('RGBA', (w, h), hexc(lace)); d = ImageDraw.Draw(im)
    top = 14 if trim_top else 0; bot = 14 if trim_bot else 0
    rh = (h - top - bot) / rows; cw = w / cols
    for r in range(rows):
        y0 = top + r * rh
        off = (cw / 2) if r % 2 else 0
        for c in range(-1, cols + 1):
            x0 = c * cw + off
            d.rounded_rectangle([x0 + 1.5, y0 + 2, x0 + cw - 1.5, y0 + rh - 3], radius=3, fill=shade(plate, 1.0))
            d.rectangle([x0 + 1.5, y0 + rh * 0.62, x0 + cw - 1.5, y0 + rh - 3], fill=shade(plate, 0.78))
            d.line([x0 + 3, y0 + 4, x0 + cw - 4, y0 + 4], fill=shade(plate, 1.3), width=1)
            d.ellipse([x0 + cw / 2 - 1.5, y0 + rh * 0.3 - 1.5, x0 + cw / 2 + 1.5, y0 + rh * 0.3 + 1.5], fill=hexc(rivet))
        d.line([0, y0 + rh - 1.5, w, y0 + rh - 1.5], fill=shade(lace, 1.25), width=2)
    if trim_top: d.rectangle([0, 0, w, top], fill=hexc(trim)); d.line([0, top - 2, w, top - 2], fill=shade(trim, 0.6), width=2)
    if trim_bot: d.rectangle([0, h - bot, w, h], fill=hexc(trim)); d.line([0, h - bot + 1, w, h - bot + 1], fill=shade(trim, 0.6), width=2)
    return im

def tex_cloth(base, trim=None, pattern=None, w=256, h=256, trim_w=16, stripes=None, dark_bottom=True):
    im = Image.new('RGBA', (w, h), hexc(base)); d = ImageDraw.Draw(im)
    # hafif dokuma çizgileri
    for y in range(0, h, 6): d.line([0, y, w, y], fill=shade(base, 0.94), width=1)
    if pattern == 'cloud':
        for k in range(6):
            cx = (k * 47) % w; cy = 70 + (k * 61) % (h - 120)
            for r in (14, 10, 6): d.arc([cx - r, cy - r, cx + r, cy + r], 200, 340, fill=shade(base, 1.35), width=2)
    if pattern == 'diamond':
        for x in range(0, w, 32):
            for y in range(40, h - 30, 32): d.polygon([(x + 16, y), (x + 26, y + 10), (x + 16, y + 20), (x + 6, y + 10)], outline=shade(base, 1.4))
    if stripes:
        for (y0, y1, col) in stripes: d.rectangle([0, int(y0 * h), w, int(y1 * h)], fill=hexc(col))
    if trim:
        d.rectangle([0, h - trim_w, w, h], fill=hexc(trim)); d.line([0, h - trim_w - 2, w, h - trim_w - 2], fill=shade(trim, 0.6), width=2)
        for x in range(0, w, 16): d.polygon([(x, h - trim_w), (x + 8, h - trim_w + 7), (x + 16, h - trim_w)], fill=shade(trim, 0.7))
    if dark_bottom:
        for y in range(h // 2, h - (trim_w if trim else 0)):
            k = (y - h / 2) / (h / 2) * 0.18
            if not pattern: d.line([0, y, w, y], fill=shade(base, 1 - k))
    return im

def tex_wrap_top(base, collar, trim, w=256, h=256):
    """çapraz yakalı üst (ön ortada V yaka); u=0.5 ön."""
    im = tex_cloth(base, None, dark_bottom=False); d = ImageDraw.Draw(im)
    c = w / 2
    d.polygon([(c - 46, 0), (c - 26, 0), (c + 30, h * 0.62), (c + 12, h * 0.62)], fill=hexc(collar))
    d.polygon([(c + 46, 0), (c + 26, 0), (c - 18, h * 0.5), (c - 30, h * 0.44)], fill=shade(collar, 0.8))
    d.rectangle([0, h - 30, w, h], fill=hexc(trim))
    return im

def tex_metal(color, trim, w=128, h=128, lines=True):
    im = Image.new('RGBA', (w, h), hexc(color)); d = ImageDraw.Draw(im)
    for y in range(h):
        k = 0.82 + 0.35 * math.sin(y / h * PI) ** 2
        d.line([0, y, w, y], fill=shade(color, k))
    if trim:
        d.rectangle([0, h - 12, w, h], fill=hexc(trim)); d.rectangle([0, 0, w, 6], fill=hexc(trim))
    if lines:
        for x in range(0, w, w // 4): d.line([x, 6, x, h - 12], fill=shade(color, 0.7), width=1)
    return im

def tex_plume(c1, c2, w=128, h=256):
    im = Image.new('RGBA', (w, h), hexc(c1)); d = ImageDraw.Draw(im)
    for x in range(0, w, 6): d.line([x, 0, x + 10, h], fill=shade(c1, 0.75 if (x // 6) % 2 else 1.15), width=3)
    for y in range(int(h * 0.75), h): d.line([0, y, w, y], fill=hexc(c2))
    return im

def tex_hair(c, w=128, h=256):
    im = Image.new('RGBA', (w, h), hexc(c)); d = ImageDraw.Draw(im)
    for x in range(0, w, 5): d.line([x, 0, x + 3, h], fill=shade(c, 0.7 if (x // 5) % 2 else 1.25), width=2)
    for x in range(0, w, 17): d.line([x, 0, x, h], fill=shade(c, 1.6), width=1)
    return im

def tex_face(eye, brow, lip, skin='#f1c9a5', male=False, liner='#1a1010', paint=None):
    """512x512; u=0.5 ön, göz v≈0.39, ağız v≈0.15 (v: çene 0 → tepe 1, glTF'de satır = v*H)."""
    W = H = 512
    im = Image.new('RGBA', (W, H), hexc(skin)); d = ImageDraw.Draw(im)
    R = lambda v: v * H           # satır
    ey = R(0.40)
    for side in (-1, 1):
        cx = 256 + side * 92
        if male:
            # dar, keskin gözler; kalın, yukarı kalkık kaşlar
            d.polygon([(cx - 34 * side, ey + 2), (cx, ey + 10), (cx + 30 * side, ey + 2), (cx, ey - 7)], fill=(250, 248, 240, 255))
            d.ellipse([cx - 9, ey - 6, cx + 9, ey + 10], fill=hexc(eye)); d.ellipse([cx - 4, ey - 1, cx + 4, ey + 6], fill=(15, 10, 10, 255))
            d.line([(cx - 36 * side, ey + 3), (cx, ey + 12), (cx + 32 * side, ey + 1)], fill=hexc(liner), width=5)
            d.polygon([(cx - 42 * side, R(0.47)), (cx + 34 * side, R(0.535)), (cx + 38 * side, R(0.505)), (cx - 40 * side, R(0.455))], fill=hexc(brow))
        else:
            d.ellipse([cx - 34, ey - 16, cx + 34, ey + 22], fill=(252, 250, 246, 255))
            d.ellipse([cx - 18, ey - 15, cx + 18, ey + 22], fill=hexc(eye))
            d.ellipse([cx - 10, ey - 8, cx + 10, ey + 12], fill=shade(eye, 0.35))
            d.ellipse([cx + 3, ey + 5, cx + 11, ey + 13], fill=(255, 255, 255, 255))
            # üst kirpik (yüzde yukarısı = büyük satır)
            d.line([(cx - 38 * side, ey + 12), (cx - 8 * side, ey + 24), (cx + 24 * side, ey + 22), (cx + 44 * side, ey + 32)], fill=hexc(liner), width=7)
            d.line([(cx - 26 * side, ey - 14), (cx + 20 * side, ey - 13)], fill=shade(liner, 2.5), width=2)
            d.line([(cx - 30 * side, R(0.49)), (cx + 6 * side, R(0.515)), (cx + 34 * side, R(0.5))], fill=hexc(brow), width=4)
    # burun
    d.line([(256, R(0.29)), (262, R(0.255))], fill=shade(skin, 0.75), width=3)
    # ağız
    if male:
        d.line([(232, R(0.165)), (280, R(0.165))], fill=shade(lip, 0.8), width=4)
        for k in range(160):   # sakal gölgesi
            x = 200 + (k * 37) % 112; y = R(0.05) + (k * 53) % int(R(0.1))
            d.point((x, y), fill=shade(skin, 0.78))
    else:
        d.ellipse([240, R(0.145), 272, R(0.175)], fill=hexc(lip))
    if paint:   # yüz boyası / işaret
        paint(d, R)
    return im

def tex_leather(c, w=256, h=256, stitch='#d9c08a'):
    im = Image.new('RGBA', (w, h), hexc(c)); d = ImageDraw.Draw(im)
    import random; rnd = random.Random(3)
    for k in range(400):
        x, y = rnd.randrange(w), rnd.randrange(h); d.point((x, y), fill=shade(c, rnd.uniform(0.8, 1.2)))
    for y in range(24, h, 48):
        d.rectangle([0, y, w, y + 30], fill=shade(c, 1.08))
        for x in range(0, w, 10): d.line([x, y + 2, x + 5, y + 2], fill=hexc(stitch), width=1); d.line([x, y + 28, x + 5, y + 28], fill=hexc(stitch), width=1)
    return im

# ---------------- ortak parçalar ----------------
TORSO_BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'LeftShoulder', 'RightShoulder', 'LeftUpLeg', 'RightUpLeg']

def torso(prof, seg_n=28, cz=0.0):
    p = lathe(prof, seg_n, c=(0, cz))
    return skin_auto(p, TORSO_BONES, power=3)

def panels(y0, y1, r0, r1, pieces, z0=0.0, seg_n=8, lift=0.0):
    """etek parçaları; pieces: [(merkez açı, genişlik açı, 'L'|'R'|'B')]"""
    out = []
    for (ac, aw, side) in pieces:
        prof = [(y0 - (y0 - y1) * t, (r0 + (r1 - r0) * t, (r0 + (r1 - r0) * t) * 0.8)) for t in np.linspace(0, 1, 6)]
        p = lathe(prof, seg_n, c=(0, z0), a0=ac - aw / 2, a1=ac + aw / 2)
        def fn(v, side=side):
            t = min(1, max(0, (y0 - v[1]) / (y0 - y1)))
            if side == 'L': return {'Hips': 1 - t * 0.85, 'LeftUpLeg': t * 0.85}
            if side == 'R': return {'Hips': 1 - t * 0.85, 'RightUpLeg': t * 0.85}
            return {'Hips': 1 - t * 0.6, 'LeftUpLeg': t * 0.3, 'RightUpLeg': t * 0.3}
        out.append(skin_fn(p, fn))
    return merge(out)

def limb_tube(bone, t0, t1, r0, r1, seg_n=12, out=0.0):
    a, b = seg(bone); p0 = a + (b - a) * t0; p1 = a + (b - a) * t1
    p = tube(p0, p1, [(0, r0), (0.15, r0 * 1.06), (0.85, r1 * 1.04), (1, r1)], seg_n)
    return skin_rigid(p, bone)

def pauldron(side, color_layers=3, r=(0.115, 0.075, 0.1), drop=0.032, tilt=0.55, y=1.395, x=0.2):
    parts = []
    for k in range(color_layers):
        e = ellipsoid((0, 0, 0), (r[0] * (1 - k * 0.06), r[1], r[2] * (1 - k * 0.05)), 14, 6, 0.0, 0.52)
        xform(e, rotm((0, 0, 1), -tilt * side), (x * side + side * k * 0.022, y - k * drop, 0))
        parts.append(e)
    p = merge(parts)
    b = 'LeftArm' if side > 0 else 'RightArm'; s = 'LeftShoulder' if side > 0 else 'RightShoulder'
    return skin_fn(p, lambda v: {b: 0.75, s: 0.25})

def base_body(skin_color, legs_color, boots_color):
    body = src_part('fire-mage.body'); head = src_part('fire-mage.head'); legs = src_part('fire-mage.trousers'); boots = src_part('fire-mage.boots')
    return body, head, legs, boots

def hair_cap(color_y=1.6, r_pad=0.012, v1=0.55, front_cut=0.0):
    """kafayı saran saç başlığı (ön yüz açık)"""
    c = (0, 1.535, -0.006)
    a0, a1 = (front_cut, 2 * PI - front_cut) if front_cut else (0, 2 * PI)
    e = ellipsoid(c, (0.072 + r_pad, 0.102 + r_pad, 0.09 + r_pad), 20, 10, 0.0, v1, a0=a0 + PI, a1=a1 + PI)
    return e

def chain_tube(points, radii, seg_n=10):
    parts = []
    for i in range(len(points) - 1):
        parts.append(tube(points[i], points[i + 1], [(0, radii[i]), (1, radii[i + 1])], seg_n))
    return merge_geo(parts)

def merge_geo(parts):
    V, F, UV, off = [], [], [], 0
    for p in parts: V.append(p.V); F.append(p.F + off); UV.append(p.UV); off += len(p.V)
    return Part(np.concatenate(V), np.concatenate(F), np.concatenate(UV))

def hang_fn(top_bone='Head', y_hi=1.45, y_lo=1.2):
    def fn(v):
        t = min(1, max(0, (y_hi - v[1]) / (y_hi - y_lo)))
        if t < 0.5: return {top_bone: 1 - t, 'Neck': t}
        return {'Neck': 1 - t, 'Spine2': t}
    return fn

def cape(width_top, width_bot, y_top, y_bot, z_top, z_bot, curve=0.06, rows=10, cols=9, x0=0.0):
    R = []
    for i in range(rows):
        t = i / (rows - 1); y = y_top + (y_bot - y_top) * t
        w = width_top + (width_bot - width_top) * t; zc = z_top + (z_bot - z_top) * t ** 1.3
        row = []
        for k in range(cols):
            s = k / (cols - 1) * 2 - 1
            row.append((x0 + s * w / 2, y, zc + curve * (1 - s * s) * -1 + 0.03 * s * s))
        R.append(row)
    p = sheet(R)
    def fn(v):
        y = v[1]
        if y > 1.25: return {'Spine2': 1.0}
        if y > 1.05: t = (1.25 - y) / 0.2; return {'Spine2': 1 - t, 'Spine1': t}
        if y > 0.9: t = (1.05 - y) / 0.15; return {'Spine1': 1 - t, 'Spine': t}
        return {'Spine': 0.7, 'Hips': 0.3}
    return skin_fn(p, fn)

def build(cls, title, spec, path):
    w = Writer(title)
    mats = {}
    def M(key, **kw):
        if key not in mats: mats[key] = w.material(key, **kw)
        return mats[key]
    parts = spec()
    out_parts = []
    for name, p, matkey, matkw, outl in parts:
        w.mesh(name, p, M(matkey, **matkw))
        if outl: out_parts.append(p)
    ol = outline(out_parts, 0.0065)
    w.mesh('outline', ol, M('ink', color='#120a08', unlit=True))
    n = w.save(path)
    return n
