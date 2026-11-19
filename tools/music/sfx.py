# Vuruş sesleri (Metin2 tarzı dolgun): savurma, kesik, gümleme, metal çınlaması, kritik, taş kırılması.
# Çalıştır: python3 tools/music/sfx.py -> client/audio/sfx/*.wav
import os, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from synth import SR, lp, hp, bp, adsr, make_ir, pluck
from scipy.signal import fftconvolve
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'client', 'audio', 'sfx')
rng = np.random.default_rng(5)
def T(d): return np.arange(int(d * SR)) / SR
def noise(d): return rng.standard_normal(int(d * SR))
def sweep_bp(x, f0, f1, q=2.0, steps=24):
    """zamanla kayan bant geçiren (savurma 'vuuş'u)"""
    n = len(x); out = np.zeros(n); seg = n // steps + 1
    for k in range(steps):
        a, b = k * seg, min(n, (k + 2) * seg)
        f = f0 * (f1 / f0) ** (k / (steps - 1)); lo, hi = f / (1 + 1 / q), f * (1 + 1 / q)
        y = bp(x[a:b], max(40, lo), hi)
        w = np.hanning(b - a); out[a:b] += y * w
    return out
def metal(f, d, decay=9.0, parts=((1, 1), (2.41, .6), (3.9, .4), (5.7, .25), (7.3, .15))):
    t = T(d); return sum(a * np.sin(2 * np.pi * f * m * t + rng.random() * 6) * np.exp(-t * decay * (1 + m * 0.15)) for m, a in parts)
def thump(f0, f1, d, k=14):
    t = T(d); f = f1 + (f0 - f1) * np.exp(-t * k)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * (k * 0.45))
def env_whoosh(d, peak=0.45):
    t = T(d); x = t / d
    return np.where(x < peak, (x / peak) ** 2, ((1 - x) / (1 - peak)) ** 1.5)
def room(x, wet=0.12, sec=0.6):
    ir = make_ir(sec, 4000)[:, 0]; y = fftconvolve(x, ir)[: len(x) + int(0.25 * SR)]
    out = np.pad(x, (0, len(y) - len(x))) + y * wet; return out
def save(name, x, gain=0.9):
    os.makedirs(OUT, exist_ok=True)
    x = x / (np.abs(x).max() + 1e-9) * gain
    fl = int(0.004 * SR); x[-fl:] *= np.linspace(1, 0, fl)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())

def swing(d, f0, f1, ring_f=None, heavy=0.0):
    x = sweep_bp(noise(d), f0, f1, q=1.6) * env_whoosh(d, 0.4)
    x += lp(noise(d), 500) * env_whoosh(d, 0.5) * (0.5 + heavy)           # hava basıncı
    if ring_f: x += metal(ring_f, d, decay=7) * env_whoosh(d, 0.35) * 0.05  # kılıç ağzı ıslığı
    return room(x, 0.1)
for i, (d, f0, f1) in enumerate([(0.24, 900, 4200), (0.22, 1100, 3800), (0.27, 800, 4600)]):
    save(f'swing_sword{i}', swing(d, f0, f1, ring_f=2600 + i * 180))
for i, (d, f0, f1) in enumerate([(0.34, 400, 2200), (0.38, 350, 2600)]):
    save(f'swing_heavy{i}', swing(d, f0, f1, ring_f=1500, heavy=0.8))
for i, (d, f0, f1) in enumerate([(0.13, 1800, 6000), (0.12, 2200, 5500)]):
    save(f'swing_dagger{i}', swing(d, f0, f1, ring_f=3800))
# şaman asası: alçak savurma + büyü pırıltısı
t = T(0.4); sh = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * 7) for f in (1320, 1760, 2217)) * 0.08 * np.clip(t / 0.05, 0, 1)
save('swing_staff', swing(0.4, 300, 1800, heavy=0.5) [:len(t)] + sh)
# yay: kiriş tıngırtısı + ok ıslığı
tw = pluck('E2', 0.3, bright=0.9, decay=0.97) * 0.7 + thump(220, 90, 0.3, 30) * 0.5
wh = sweep_bp(noise(0.3), 3500, 1800, q=4) * env_whoosh(0.3, 0.2) * 0.6
save('bow_shot', room(np.pad(tw, (0, 0)) + wh, 0.08))

def flesh_hit(var, crit=False):
    d = 0.5 if not crit else 0.9; t = T(d)
    crack = hp(noise(d), 2500) * np.exp(-t * 160) * 1.4                       # ilk temas çıtırtısı
    tear = sweep_bp(noise(d), 2600 + var * 200, 700, q=1.4) * np.exp(-t * 22) * 1.0   # kesik
    body = lp(noise(d), 900) * np.exp(-t * 28) * 1.1                          # et
    th = thump(150 + var * 15, 50, d, 16) * 1.2                                # gümleme
    x = crack + tear + body + th + metal(1900 + var * 150, d, 18) * 0.12
    if crit:
        x += metal(2400, d, 5.5) * 0.45 + metal(3100, d, 7) * 0.2            # "şiing"
        x += thump(110, 32, d, 6) * 1.4 + lp(noise(d), 1400) * np.exp(-t * 7) * 0.6
    return room(x, 0.15 if crit else 0.1, 0.9 if crit else 0.5)
for i in range(3): save(f'hit_flesh{i}', flesh_hit(i))
save('hit_crit', flesh_hit(1, True))
# taş kırma: kaya çatırtısı + parçalar + gümleme
d = 0.7; t = T(d)
x = hp(noise(d), 1800) * np.exp(-t * 50) * 1.2 + bp(noise(d), 300, 1500) * np.exp(-t * 14) * 0.9 + thump(110, 40, d, 12) * 1.0
for k in range(7):
    s = int(rng.uniform(0.04, 0.4) * SR); n = int(0.03 * SR)
    x[s:s + n] += bp(noise(0.03), 2000, 7000) * np.exp(-np.arange(n) / SR * 120) * rng.uniform(0.2, 0.5)
save('hit_stone', room(x, 0.12))
# oyuncuya isabet: zırh şangırtısı
d = 0.45; t = T(d)
save('hit_armor', room(metal(820, d, 11) * 0.6 + metal(1370, d, 14) * 0.4 + hp(noise(d), 3000) * np.exp(-t * 90) + thump(130, 60, d, 20) * 0.7, 0.12))
# okun saplanması
d = 0.3; t = T(d)
save('hit_arrow', room(thump(260, 90, d, 35) + hp(noise(d), 2000) * np.exp(-t * 120) * 0.9 + lp(noise(d), 1200) * np.exp(-t * 40) * 0.5, 0.08))
print('ok', sorted(os.listdir(OUT)))
