from classes import *

GREEN = '#2f5f2c'; DGREEN = '#1f3f1d'; LEATHER = '#6b4a2b'; DLEATHER = '#4a321d'; GOLD = '#c9a14a'; CREAM = '#e8dcc0'

def spec():
    P = []
    body, head, legs, boots = base_body(None, None, None)
    P.append(('skin', body, 'skin', dict(color='#f1c6a2'), True))
    P.append(('head', head, 'face', dict(tex=tex_face('#3f9a4a', '#5a3a1e', '#c96f6a', liner='#2a1a10')), True))
    P.append(('legs', legs, 'cloth', dict(tex=tex_cloth('#3a2e22', dark_bottom=False)), True))
    P.append(('boots', boots, 'boots', dict(color=DLEATHER, rough=0.8), True))
    # yeşil tunik gövde + deri lamel yelek
    tunic = torso([(0.88, (0.155, 0.112)), (0.98, (0.155, 0.112)), (1.08, (0.12, 0.09)), (1.16, (0.127, 0.102)), (1.24, (0.15, 0.125)), (1.32, (0.16, 0.105)), (1.385, (0.16, 0.09)), (1.415, (0.1, 0.07)), (1.445, (0.04, 0.04))])
    P.append(('tunic', tunic, 'tunic', dict(tex=tex_wrap_top(GREEN, CREAM, DGREEN)), True))
    vest = torso([(0.97, (0.165, 0.124)), (1.06, (0.138, 0.104)), (1.15, (0.135, 0.11)), (1.24, (0.158, 0.135)), (1.32, (0.168, 0.116)), (1.38, (0.166, 0.1))])
    # önü açık yelek: önde dar bir şeridi sil
    keep = [f for f in vest.F if not (abs(vest.V[f].mean(0)[0]) < 0.035 and vest.V[f].mean(0)[2] > 0)]
    vest.F = np.array(keep, np.uint32)
    P.append(('vest', vest, 'vest', dict(tex=tex_lamellar(LEATHER, DLEATHER, GOLD, rows=6, cols=14, rivet='#d8b56a'), rough=0.8, double=True), True))
    belt = torso([(0.93, (0.17, 0.128)), (0.96, (0.172, 0.13)), (1.0, (0.168, 0.126)), (1.02, (0.162, 0.122))])
    P.append(('belt', belt, 'belt', dict(tex=tex_leather(DLEATHER)), True))
    buckle = box((0, 0.975, 0.13), (0.05, 0.045, 0.016)); P.append(('buckle', skin_rigid(buckle, 'Hips'), 'gold', dict(color=GOLD, rough=0.35, metal=0.9), True))
    # dize kadar tunik eteği (4 parça, yürürken bacakla açılır)
    skirt = panels(0.97, 0.52, 0.168, 0.235, [(0, 1.05, 'B'), (PI, 1.2, 'B'), (PI / 2, 1.05, 'L'), (-PI / 2, 1.05, 'R')], seg_n=6)
    P.append(('skirt', skirt, 'skirt', dict(tex=tex_cloth(GREEN, GOLD, pattern='diamond', trim_w=14), double=True), True))
    # kısa yeşil pelerin + kapüşon yakası
    cp = cape(0.33, 0.42, 1.39, 0.82, -0.105, -0.2, curve=0.045, rows=8)
    P.append(('cape', cp, 'cape', dict(tex=tex_cloth(DGREEN, GOLD, trim_w=10), double=True), True))
    hood = lathe([(1.37, (0.12, 0.11)), (1.41, (0.125, 0.12)), (1.46, (0.11, 0.115))], 18, c=(0, -0.02), a0=PI - 2.2, a1=PI + 2.2)
    P.append(('hood', skin_fn(hood, lambda v: {'Spine2': 0.6, 'Neck': 0.4}), 'cape', {}, True))
    # sırtta ok kılıfı ve oklar
    q0 = np.array([0.11, 1.34, -0.2]); q1 = np.array([-0.07, 0.99, -0.215])
    quiv = tube(q1, q0, [(0, 0.04), (0.1, 0.046), (0.9, 0.05), (1, 0.052)], 10)
    P.append(('quiver', skin_fn(quiv, lambda v: {'Spine2': 0.7, 'Spine1': 0.3} if v[1] > 1.15 else {'Spine1': 0.6, 'Spine': 0.4}), 'quiver', dict(tex=tex_leather(LEATHER)), True))
    d = (q0 - q1) / np.linalg.norm(q0 - q1)
    arrows, fl = [], []
    for k, off in enumerate([(-0.018, 0, 0.01), (0.015, 0, 0.012), (0.0, 0, -0.015), (0.022, 0, -0.008), (-0.02, 0, -0.01)]):
        a0 = q0 + np.array(off) - d * 0.05; a1 = a0 + d * (0.13 + 0.02 * (k % 2))
        arrows.append(tube(a0, a1, [(0, 0.004), (1, 0.004)], 4))
        # tüy: iki çapraz üçgen
        for rot in (0, PI / 2):
            x, y, z = frame_from(d); side = x * math.cos(rot) + z * math.sin(rot)
            fl.append(sheet([[a1 - d * 0.06, a1 - d * 0.06 + side * 0.012], [a1, a1 + side * 0.016]]))
    P.append(('arrows', skin_rigid(merge_geo(arrows), 'Spine2'), 'shaft', dict(color='#c8b48a'), True))
    P.append(('fletch', skin_rigid(merge_geo(fl), 'Spine2'), 'fletch', dict(color='#e8e2d4', double=True), False))
    # kolluklar (sol kolda uzun okçu korumalığı), baldır sargıları
    for s in (1, -1):
        fa = 'LeftForeArm' if s > 0 else 'RightForeArm'
        P.append((f'bracer{s}', limb_tube(fa, 0.05 if s > 0 else 0.4, 0.95, 0.047 if s > 0 else 0.042, 0.041), 'bracer', dict(tex=tex_leather(LEATHER)), True))
        leg = 'LeftLeg' if s > 0 else 'RightLeg'
        P.append((f'wrap{s}', limb_tube(leg, 0.15, 0.72, 0.06, 0.052), 'bracer', {}, True))
    for s in (1, -1):
        P.append((f'pauldron{s}', pauldron(s, 1, r=(0.085, 0.05, 0.08), x=0.185, y=1.39), 'vest', {}, True))
    # saç: başlık, perçem, yan tutamlar, uzun örgü + alın bandı
    cap = hair_cap(r_pad=0.008, v1=0.86)
    keep = []
    for f in cap.F:
        c = cap.V[f].mean(0)
        if not ((c[2] > 0.02 and c[1] < 1.585) or (c[2] > -0.03 and c[1] < 1.5)): keep.append(f)
    cap.F = np.array(keep, np.uint32)
    P.append(('hair', skin_rigid(cap, 'Head'), 'hair', dict(tex=tex_hair('#5a3518')), True))
    locks = []
    for s in (-1, 1):
        locks.append(chain_tube([(s * 0.072, 1.6, 0.03), (s * 0.08, 1.52, 0.04), (s * 0.078, 1.44, 0.03), (s * 0.07, 1.39, 0.03)], [0.016, 0.018, 0.014, 0.004], 6))
    for k, x in enumerate((-0.045, -0.015, 0.02, 0.048)):
        locks.append(tube((x, 1.62, 0.07), (x * 1.3 + 0.01, 1.565, 0.09), [(0, 0.017), (1, 0.003)], 5))
    P.append(('locks', skin_rigid(merge_geo(locks), 'Head'), 'hair', {}, True))
    band = lathe([(1.588, (0.083, 0.098)), (1.6, (0.084, 0.099)), (1.612, (0.082, 0.097))], 22, c=(0, -0.005))
    P.append(('band', skin_rigid(band, 'Head'), 'band', dict(tex=tex_cloth(DGREEN, GOLD, trim_w=60, dark_bottom=False)), True))
    pts = [(0, 1.56, -0.1), (0, 1.47, -0.145), (0, 1.36, -0.185), (0, 1.24, -0.205), (0, 1.12, -0.22), (0, 1.03, -0.23)]
    beads = []
    for i in range(len(pts) - 1):
        a, b = np.array(pts[i]), np.array(pts[i + 1])
        for k in range(2):
            c = a + (b - a) * (k + 0.5) / 2
            e = ellipsoid(tuple(c), (0.028 - i * 0.003, 0.034, 0.024 - i * 0.002), 8, 5); beads.append(e)
    tie = ellipsoid((0, 1.0, -0.232), (0.014, 0.02, 0.012), 8, 4); beads.append(tie)
    P.append(('braid', skin_fn(merge_geo(beads), hang_fn('Head', 1.52, 1.3)), 'hair', {}, True))
    return P

if __name__ == '__main__':
    print('bytes', build('okcu', 'okcu', spec, '/tmp/cg/okcu.glb'))
