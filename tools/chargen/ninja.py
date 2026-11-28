from classes import *

NAVY = '#1f2333'; DARK = '#15161d'; PLATE = '#3e4452'; RED = '#b3202a'; SILVER = '#b9c0cc'; PURPLE = '#5b3f8a'

def spec():
    P = []
    body, head, legs, boots = base_body(None, None, None)
    P.append(('skin', body, 'skin', dict(color='#f0c4a0'), True))
    P.append(('head', head, 'face', dict(tex=tex_face('#8a5cd6', '#1a1220', '#c56b78', liner='#120a14')), True))
    P.append(('legs', legs, 'cloth', dict(tex=tex_cloth(DARK, dark_bottom=False)), True))
    P.append(('boots', boots, 'boots', dict(color='#1a1a22', rough=0.6), True))
    # ince gövde, çapraz yakalı üst
    top = torso([(0.88, (0.15, 0.11)), (0.98, (0.152, 0.112)), (1.08, (0.118, 0.088)), (1.16, (0.125, 0.1)), (1.24, (0.15, 0.125)), (1.32, (0.16, 0.105)), (1.385, (0.16, 0.09)), (1.415, (0.1, 0.07)), (1.445, (0.04, 0.04))])
    P.append(('top', top, 'top', dict(tex=tex_wrap_top(NAVY, RED, DARK)), True))
    # hafif göğüs zırhı (sadece göğüs ve sırt üstü)
    chest = torso([(1.18, (0.135, 0.112)), (1.26, (0.158, 0.135)), (1.33, (0.168, 0.115)), (1.39, (0.165, 0.098))])
    P.append(('chestplate', chest, 'lamellar', dict(tex=tex_lamellar(PLATE, '#7a1720', SILVER, rows=3, cols=16), rough=0.45, metal=0.5), True))
    # kırmızı kuşak ve kısa zırhlı etek
    obi = torso([(0.95, (0.162, 0.122)), (0.98, (0.165, 0.124)), (1.06, (0.14, 0.104)), (1.09, (0.13, 0.098))])
    P.append(('obi', obi, 'obi', dict(tex=tex_cloth(RED, '#e0b84a', trim_w=8, dark_bottom=False)), True))
    knot = ellipsoid((0.0, 0.0, 0.0), (0.035, 0.03, 0.025), 10, 6)
    xform(knot, None, (-0.12, 1.02, -0.07)); P.append(('knot', skin_rigid(knot, 'Hips'), 'obi', {}, True))
    tails = []
    for k, dx in enumerate((-0.03, 0.03)):
        tl = sheet([[(-0.13 + dx - 0.02, 1.0, -0.1), (-0.13 + dx + 0.02, 1.0, -0.1)], [(-0.15 + dx * 1.5 - 0.022, 0.8, -0.13), (-0.15 + dx * 1.5 + 0.022, 0.8, -0.13)],
                    [(-0.16 + dx * 2 - 0.024, 0.66, -0.15), (-0.16 + dx * 2 + 0.024, 0.66, -0.15)]])
        tails.append(tl)
    P.append(('obitails', skin_fn(merge(tails), lambda v: {'Hips': 1.0}), 'obi_d', dict(tex=tex_cloth(RED, '#e0b84a', trim_w=8), double=True), True))
    skirt = panels(0.97, 0.7, 0.17, 0.215, [(0, 1.0, 'B'), (PI, 1.1, 'B'), (PI / 2 + 0.15, 0.9, 'L'), (-PI / 2 - 0.15, 0.9, 'R')], seg_n=6)
    P.append(('skirt', skirt, 'skirtplate', dict(tex=tex_lamellar(PLATE, NAVY, RED, rows=3, cols=8, trim_top=False), rough=0.45, metal=0.5, double=True), True))
    # sol omuzda tek omuzluk, kollukta gümüş plaka, baldırlık
    P.append(('pauldronL', pauldron(1, 2, r=(0.1, 0.06, 0.09), x=0.19, y=1.395, drop=0.028), 'plate', dict(tex=tex_metal(PLATE, RED), rough=0.4, metal=0.55, double=True), True))
    for s in (1, -1):
        fa = 'LeftForeArm' if s > 0 else 'RightForeArm'
        P.append((f'bracer{s}', limb_tube(fa, 0.1, 0.95, 0.044, 0.039), 'plate', {}, True))
        leg = 'LeftLeg' if s > 0 else 'RightLeg'
        P.append((f'greave{s}', limb_tube(leg, 0.12, 0.7, 0.062, 0.052), 'plate', {}, True))
    # boyun atkısı + arkaya uçan iki uç
    scarf = lathe([(1.37, (0.098, 0.09)), (1.4, (0.1, 0.095)), (1.44, (0.085, 0.085)), (1.46, (0.07, 0.07))], 18, c=(0, -0.008))
    P.append(('scarf', skin_fn(scarf, lambda v: {'Neck': 0.6, 'Spine2': 0.4}), 'scarf', dict(tex=tex_cloth(RED, dark_bottom=False), double=True), True))
    st = []
    for s in (-1, 1):
        R = []
        for i in range(7):
            t = i / 6; y = 1.42 - t * 0.5; z = -0.09 - t * 0.2 - 0.06 * math.sin(t * PI); x = s * (0.03 + t * 0.07); wdt = 0.05 - t * 0.012
            R.append([(x - wdt / 2, y, z), (x + wdt / 2, y + 0.005, z)])
        st.append(sheet(R))
    P.append(('scarftails', skin_fn(merge(st), lambda v: {'Spine2': 1.0} if v[1] > 1.2 else {'Spine2': 0.6, 'Spine1': 0.4}), 'scarf', {}, True))
    # yüz maskesi (burnun altından çeneye)
    prof = []
    for y in np.linspace(1.432, 1.505, 6):
        rx, rf, rb = head_radius(y, 0.006); prof.append((y, (rx, rf)))
    mask = lathe(prof, 16, c=(0, 0.0), a0=-1.75, a1=1.75)
    P.append(('mask', skin_rigid(mask, 'Head'), 'mask', dict(color='#262a38', rough=0.9), True))
    # saç: başlık + alın perçemi + yüksek atkuyruğu
    cap = hair_cap(r_pad=0.008, v1=0.86, front_cut=0.0)
    # ön yüzü açık bırak: önde alnın altındaki yüzleri sil
    keep = []
    for f in cap.F:
        c = cap.V[f].mean(0)
        if not ((c[2] > 0.02 and c[1] < 1.585) or (c[2] > -0.03 and c[1] < 1.5)): keep.append(f)
    cap.F = np.array(keep, np.uint32)
    P.append(('hair', skin_rigid(cap, 'Head'), 'hair', dict(tex=tex_hair('#14121a')), True))
    bangs = []
    for k, x in enumerate((-0.05, -0.025, 0.0, 0.028, 0.052)):
        ln = 0.055 + 0.02 * (k % 2)
        bangs.append(tube((x * 0.9, 1.615, 0.075), (x * 1.15, 1.615 - ln, 0.09), [(0, 0.016), (1, 0.002)], 5))
    P.append(('bangs', skin_rigid(merge_geo(bangs), 'Head'), 'hair', {}, True))
    tie = tube((0, 1.63, -0.075), (0, 1.655, -0.115), [(0, 0.026), (0.5, 0.029), (1, 0.025)], 10)
    P.append(('hairtie', skin_rigid(tie, 'Head'), 'scarf', {}, True))
    tail = chain_tube([(0, 1.64, -0.085), (0, 1.66, -0.13), (0, 1.6, -0.18), (0, 1.5, -0.2), (0, 1.38, -0.19), (0, 1.27, -0.17), (0, 1.17, -0.16)], [0.024, 0.036, 0.04, 0.036, 0.03, 0.02, 0.006], 9)
    P.append(('ponytail', skin_fn(tail, hang_fn('Head', 1.55, 1.3)), 'hair', {}, True))
    return P

if __name__ == '__main__':
    print('bytes', build('ninja', 'ninja', spec, '/tmp/cg/ninja.glb'))
