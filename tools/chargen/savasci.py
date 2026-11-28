from classes import *

STEEL = '#9aa4b0'; LACE = '#8a1c1c'; GOLD = '#d4a94a'; RED = '#9e1f1f'; DARK = '#2a2226'; LEATHER = '#5a3c26'

def spec():
    P = []
    body, head, legs, boots = base_body(None, None, None)
    P.append(('skin', body, 'skin', dict(color='#e9b48f'), True))
    P.append(('head', head, 'face', dict(tex=tex_face('#6b3a1e', '#1c1410', '#9a5a50', male=True)), True))
    P.append(('legs', legs, 'cloth', dict(tex=tex_cloth(DARK, dark_bottom=False)), True))
    P.append(('boots', boots, 'boots', dict(color='#3a2a20', rough=0.7), True))
    # alt gömlek + lamel göğüs zırhı (geniş omuzlu erkek gövdesi)
    shirt = torso([(0.86, (0.165, 0.12)), (0.98, (0.17, 0.12)), (1.1, (0.15, 0.105)), (1.22, (0.18, 0.12)), (1.33, (0.2, 0.115)), (1.39, (0.19, 0.1)), (1.42, (0.11, 0.075)), (1.45, (0.045, 0.045))])
    P.append(('shirt', shirt, 'shirt', dict(tex=tex_cloth(RED, dark_bottom=False)), True))
    cuir = torso([(0.9, (0.19, 0.142)), (1.0, (0.188, 0.138)), (1.1, (0.172, 0.128)), (1.2, (0.198, 0.142)), (1.3, (0.215, 0.135)), (1.37, (0.205, 0.12)), (1.405, (0.15, 0.1))])
    P.append(('cuirass', cuir, 'lamellar', dict(tex=tex_lamellar(STEEL, LACE, GOLD, rows=7, cols=18), rough=0.5, metal=0.45), True))
    # göğüs aynası (altın kenarlı yuvarlak plaka)
    mirror = ellipsoid((0, 0, 0), (0.07, 0.07, 0.025), 18, 5, 0.0, 0.5)
    xform(mirror, rotm((1, 0, 0), PI / 2), (0, 1.25, 0.128))
    P.append(('mirror', skin_rigid(mirror, 'Spine2'), 'mirror', dict(tex=tex_metal('#c8ced6', GOLD, lines=False), rough=0.3, metal=0.8), True))
    # kemer
    belt = torso([(0.9, (0.198, 0.15)), (0.94, (0.2, 0.152)), (0.99, (0.196, 0.148)), (1.02, (0.19, 0.144))])
    P.append(('belt', belt, 'belt', dict(tex=tex_cloth(LEATHER, GOLD, trim_w=10, dark_bottom=False)), True))
    buckle = box((0, 0.955, 0.152), (0.075, 0.06, 0.02)); P.append(('buckle', skin_rigid(buckle, 'Hips'), 'gold', dict(color=GOLD, rough=0.35, metal=0.9), True))
    # etek parçaları (önde, arkada, yanlarda lamel)
    skirt = panels(0.97, 0.52, 0.2, 0.27, [(0, 1.15, 'B'), (PI, 1.25, 'B'), (PI / 2, 1.0, 'L'), (-PI / 2, 1.0, 'R')], seg_n=7)
    P.append(('tassets', skirt, 'lamellar_s', dict(tex=tex_lamellar(STEEL, LACE, GOLD, rows=5, cols=10, trim_top=False), rough=0.5, metal=0.45, double=True), True))
    # omuzluklar
    for s in (1, -1):
        P.append((f'pauldron{s}', pauldron(s, 3, r=(0.13, 0.08, 0.115), x=0.215, y=1.405), 'plate', dict(tex=tex_metal(STEEL, GOLD), rough=0.45, metal=0.55, double=True), True))
        # kolluk ve dizlik
        fa = 'LeftForeArm' if s > 0 else 'RightForeArm'
        P.append((f'bracer{s}', limb_tube(fa, 0.15, 0.95, 0.048, 0.043), 'plate', {}, True))
        leg = 'LeftLeg' if s > 0 else 'RightLeg'
        P.append((f'greave{s}', limb_tube(leg, 0.08, 0.72, 0.068, 0.058), 'plate', {}, True))
        kn = ellipsoid((0, 0, 0), (0.06, 0.055, 0.04), 12, 5, 0.0, 0.55)
        xform(kn, rotm((1, 0, 0), PI / 2), (BW[leg][0], BW[leg][1] + 0.02, 0.05))
        P.append((f'knee{s}', skin_rigid(kn, leg), 'gold', {}, True))
    # miğfer: kubbe, siperlik, ense koruyucu, yanaklık, altın alın süsü, kırmızı sorguç
    hc = (0, 1.548, -0.004)
    dome = ellipsoid(hc, (0.094, 0.104, 0.104), 20, 9, 0.0, 0.5)
    P.append(('helm', skin_rigid(dome, 'Head'), 'helmmetal', dict(tex=tex_metal(STEEL, GOLD), rough=0.4, metal=0.6), True))
    brim = lathe([(1.555, (0.1, 0.11)), (1.545, (0.118, 0.13)), (1.538, (0.118, 0.13))], 24, c=(0, -0.004))
    P.append(('brim', skin_rigid(brim, 'Head'), 'gold', {}, True))
    neck_g = lathe([(1.55, (0.1, 0.11)), (1.48, (0.13, 0.14)), (1.42, (0.16, 0.17))], 16, c=(0, -0.01), a0=PI - 2.0, a1=PI + 2.0)
    P.append(('neckguard', skin_fn(neck_g, lambda v: {'Head': 0.8, 'Neck': 0.2}), 'lamellar_n', dict(tex=tex_lamellar(STEEL, LACE, GOLD, rows=3, cols=8, trim_top=False), rough=0.5, metal=0.45, double=True), True))
    crest = chain_tube([(-0.06, 1.66, 0.09), (-0.03, 1.69, 0.1), (0, 1.7, 0.105), (0.03, 1.69, 0.1), (0.06, 1.66, 0.09)], [0.008, 0.011, 0.013, 0.011, 0.008], 6)
    crest2 = chain_tube([(0, 1.6, 0.098), (0, 1.66, 0.104)], [0.012, 0.01], 6)
    P.append(('crest', skin_rigid(merge_geo([crest, crest2]), 'Head'), 'gold', {}, True))
    plume = chain_tube([(0, 1.65, 0.0), (0, 1.71, -0.03), (0, 1.73, -0.09), (0, 1.69, -0.17), (0, 1.6, -0.22), (0, 1.48, -0.24)], [0.022, 0.03, 0.034, 0.032, 0.026, 0.012], 8)
    P.append(('plume', skin_fn(plume, hang_fn('Head', 1.6, 1.45)), 'plume', dict(tex=tex_plume('#c0221c', '#7a0f0f')), True))
    # pelerin
    cp = cape(0.36, 0.5, 1.39, 0.5, -0.115, -0.26, curve=0.05)
    P.append(('cape', cp, 'cape', dict(tex=tex_cloth('#8e1616', GOLD, pattern='cloud', trim_w=12), double=True), True))
    return P

if __name__ == '__main__':
    n = build('savasci', 'savasci', spec, '/tmp/cg/savasci.glb'); print('bytes', n)
