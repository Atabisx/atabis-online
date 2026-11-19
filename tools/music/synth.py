# Atabis Online müzik/ses sentezleyicisi: telli (Karplus-Strong), flüt, erhu benzeri yaylı, pad, çan, davullar, yankı.
# Tüm sesler burada sıfırdan üretilir; dışarıdan örnek kullanılmaz.
import numpy as np
from scipy.signal import lfilter, butter, sosfilt, fftconvolve, resample_poly

SR = 44100
rng = np.random.default_rng(11)

NOTE_IDX = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}
def midi(n):
    """'A4', 'C#5', 'Bb3' -> midi numarası"""
    if isinstance(n, (int, float)): return n
    k = NOTE_IDX[n[0]]; i = 1
    while n[i] in '#b': k += 1 if n[i] == '#' else -1; i += 1
    return 12 * (int(n[i:]) + 1) + k
def hz(n): return 440.0 * 2 ** ((midi(n) - 69) / 12)

def lp(x, f, order=2):
    return sosfilt(butter(order, min(f, SR * 0.45), 'low', fs=SR, output='sos'), x)
def hp(x, f, order=2):
    return sosfilt(butter(order, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos'), x)
def adsr(n, a=0.01, d=0.1, s=0.7, r=0.2):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    sus = max(0, n - a - d - r)
    e = np.concatenate([np.linspace(0, 1, a + 1)[1:], np.linspace(1, s, d + 1)[1:], np.full(sus, s), np.linspace(s, 0, r + 1)[1:]])
    return np.pad(e, (0, max(0, n - len(e))))[:n]

# ---------- enstrümanlar ----------
def pluck(note, dur, bright=0.5, decay=0.996, body=0.0):
    """Karplus-Strong telli (guzheng/saz/ud). 2x örnekleme ile daha doğru akort."""
    f = hz(note); sr2 = SR * 2; N = max(2, int(round(sr2 / f)))
    n2 = int((dur + 0.05) * sr2)
    exc = rng.uniform(-1, 1, N)
    fc = min(f * (2.5 + 10 * bright), 9000); ca = np.exp(-2 * np.pi * fc / sr2)
    for _ in range(2): exc = lfilter([1 - ca], [1, -ca], np.concatenate([exc, exc]))[N:]   # döngüsel yumuşatma: tını
    exc = exc - exc.mean()
    x = np.zeros(n2); x[:N] = exc
    g = decay
    a = np.zeros(N + 2); a[0] = 1; a[N] = -g * 0.5; a[N + 1] = -g * 0.5
    y = lfilter([1], a, x)
    y = hp(resample_poly(y, 1, 2)[: int(dur * SR)], max(25, f * 0.5))
    y *= adsr(len(y), 0.002, 0.05, 1.0, min(0.3, dur * 0.4))
    if body: y = y + body * lp(y, 400)
    return y / (np.abs(y).max() + 1e-9)

def flute(note, dur, vib=0.006, breath=0.12):
    f = hz(note); n = int(dur * SR); t = np.arange(n) / SR
    v = 1 + vib * np.sin(2 * np.pi * 5.2 * t) * np.clip((t - 0.25) / 0.4, 0, 1)
    ph = 2 * np.pi * np.cumsum(f * v) / SR
    s = np.sin(ph) + 0.18 * np.sin(2 * ph) + 0.06 * np.sin(3 * ph)
    nz = bp(rng.standard_normal(n), f * 0.9, f * 2.6) * breath
    chiff = bp(rng.standard_normal(n), 2000, 6000) * np.exp(-t * 40) * 0.25
    return (s + nz + chiff) * adsr(n, 0.07, 0.1, 0.85, min(0.18, dur * 0.3))

def erhu(note, dur, prev=None, vib=0.012):
    """yaylı (erhu/kemençe): bant sınırlı testere + vibrato + kayma + formant"""
    f = hz(note); n = int(dur * SR); t = np.arange(n) / SR
    f0 = hz(prev) if prev else f
    glide = f0 + (f - f0) * np.clip(t / 0.09, 0, 1)
    v = 1 + vib * np.sin(2 * np.pi * 5.6 * t + rng.random()) * np.clip((t - 0.18) / 0.35, 0, 1)
    ph = 2 * np.pi * np.cumsum(glide * v) / SR
    s = sum(np.sin(k * ph) / k * (0.92 ** k) for k in range(1, 14))
    s = bp(s, 300, 4200) + 0.6 * bp(s, 700, 1100) + 0.35 * bp(s, 2200, 3200)
    s += bp(rng.standard_normal(n), 1500, 5000) * 0.015   # yay hışırtısı
    sw = adsr(n, 0.09, 0.15, 0.8, min(0.2, dur * 0.3)) * (0.85 + 0.15 * np.sin(np.pi * np.clip(t / max(dur, 0.01), 0, 1)))
    return s * sw

def saw_stack(f, n, det=(0, 0.08, -0.09), hmax=16):
    t = np.arange(n) / SR; out = np.zeros(n)
    for d in det:
        ff = f * 2 ** (d / 12); ph = 2 * np.pi * ff * t + rng.random() * 6.28
        for k in range(1, hmax):
            if ff * k > SR * 0.4: break
            out += np.sin(k * ph) / k
    return out / len(det)

def pad(notes, dur, cut=1200, a=0.8, r=1.2):
    n = int((dur + r) * SR)
    s = sum(saw_stack(hz(x), n, hmax=10) for x in notes) / len(notes)
    return lp(s, cut) * adsr(n, a, 0.3, 0.85, r)

def choir(notes, dur, a=0.9, r=1.4):
    """'aaa' koro: formantlı pad"""
    n = int((dur + r) * SR)
    s = sum(saw_stack(hz(x), n, det=(0, 0.12, -0.1, 0.05), hmax=20) for x in notes) / len(notes)
    s = bp(s, 600, 900) * 1.2 + bp(s, 1000, 1300) * 0.7 + bp(s, 2400, 2800) * 0.25
    return s * adsr(n, a, 0.3, 0.9, r)

def bell(note, dur=3.0, vol=1.0):
    f = hz(note); n = int(dur * SR); t = np.arange(n) / SR
    parts = [(1, 1, 1.2), (2.76, 0.5, 2.0), (5.4, 0.25, 3.0), (8.93, 0.12, 4.5), (0.5, 0.3, 0.9)]
    s = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t * k) for m, a, k in parts)
    return s * adsr(n, 0.002, 0.05, 1, 0.3) * vol

def strings_stacc(note, dur):
    n = int(dur * SR); s = saw_stack(hz(note), n, hmax=12)
    return lp(s, 1800) * adsr(n, 0.01, 0.08, 0.5, min(0.08, dur * 0.4))

def brass(note, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    s = saw_stack(hz(note), n, hmax=18)
    cut = 600 + 1800 * np.clip(t / 0.25, 0, 1)
    out = 0.5 * lp(s, 700) + 0.5 * lp(s, 2200) * np.clip(t / 0.25, 0, 1)
    return out * adsr(n, 0.06, 0.2, 0.8, min(0.25, dur * 0.3))

def bass(note, dur):
    f = hz(note); n = int(dur * SR); t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.1 * saw_stack(f, n, det=(0,), hmax=6)
    return lp(s, 900) * adsr(n, 0.01, 0.15, 0.7, min(0.12, dur * 0.3))

def taiko(big=1.0):
    n = int(1.6 * SR); t = np.arange(n) / SR
    f = 52 + 95 * np.exp(-t * 16); ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 4.5 / big)
    skin = lp(rng.standard_normal(n), 1600) * np.exp(-t * 35) * 0.55
    return (body + skin) * 0.9
def frame_drum(kind='dum'):
    """darbuka/def: dum (pes) ve tek (tiz)"""
    n = int(0.6 * SR); t = np.arange(n) / SR
    if kind == 'dum':
        f = 95 + 60 * np.exp(-t * 30); s = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)
        return s + lp(rng.standard_normal(n), 800) * np.exp(-t * 50) * 0.4
    s = bp(rng.standard_normal(n), 1800, 6500) * np.exp(-t * 45) + np.sin(2 * np.pi * 420 * t) * np.exp(-t * 30) * 0.4
    return s * 0.7
def shaker():
    n = int(0.09 * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n), 5000) * np.sin(np.pi * t / t[-1]) ** 2 * 0.3
def hand_drum():
    n = int(0.5 * SR); t = np.arange(n) / SR
    f = 160 + 80 * np.exp(-t * 25)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11) + lp(rng.standard_normal(n), 2500) * np.exp(-t * 60) * 0.3
def gong(dur=5.0):
    n = int(dur * SR); t = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * f * t * (1 + 0.002 * np.sin(2 * np.pi * 0.7 * t))) * np.exp(-t * k)
            for f, a, k in [(65, 1, 0.6), (98, 0.6, 0.8), (143, 0.5, 0.9), (211, 0.35, 1.1), (317, 0.25, 1.4), (467, 0.15, 1.8)])
    s += lp(rng.standard_normal(n), 3000) * np.exp(-t * 6) * 0.3
    return s * adsr(n, 0.01, 0.1, 1, 0.5)

# ---------- yankı ----------
def make_ir(sec=2.4, damp=3000):
    n = int(sec * SR); t = np.arange(n) / SR
    ir = np.stack([rng.standard_normal(n), rng.standard_normal(n)], 1) * np.exp(-t * 6.9 / sec)[:, None]
    ir[:, 0] = lp(ir[:, 0], damp); ir[:, 1] = lp(ir[:, 1], damp)
    ir[: int(0.012 * SR)] = 0
    return ir / np.abs(ir).sum(0).max() * 9

class Mix:
    """parça: enstrüman izleri eklenir, sonda yankı + döngü birleştirme"""
    def __init__(self, seconds, tail=3.5):
        self.loop = int(seconds * SR); self.n = self.loop + int(tail * SR)
        self.dry = np.zeros((self.n, 2)); self.wet = np.zeros((self.n, 2))
    def add(self, sig, t, vol=1.0, pan=0.0, rev=0.25):
        i = int(t * SR)
        if i >= self.n or i < 0: return
        s = sig[: self.n - i] * vol
        l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
        self.dry[i:i + len(s), 0] += s * l * (1 - rev * 0.5); self.dry[i:i + len(s), 1] += s * r * (1 - rev * 0.5)
        self.wet[i:i + len(s), 0] += s * l * rev; self.wet[i:i + len(s), 1] += s * r * rev
    def render(self, ir_sec=2.4, loud=2.2):
        ir = make_ir(ir_sec)
        w = np.stack([fftconvolve(self.wet[:, 0], ir[:, 0])[: self.n], fftconvolve(self.wet[:, 1], ir[:, 1])[: self.n]], 1)
        out = self.dry + w
        # döngü: kuyruktaki ses başa eklenir, böylece tekrar ederken kesilme olmaz
        tail = out[self.loop:]; out = out[: self.loop].copy(); out[: len(tail)] += tail
        out = np.tanh(out / (np.abs(out).max() + 1e-9) * loud) / np.tanh(loud)
        return out * 0.86
