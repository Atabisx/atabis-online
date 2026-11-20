# Vuruş bağırışları ("kia!", "ha!", "hiya!", "ya!", "hah!", "eya!"): kadın sesi, formant sentezi.
# Ses tellerinden gelen darbe dizisi (titreşimli, hafif pürüzlü) + nefes gürültüsü,
# zamanla kayan ağız boşluğu rezonanslarından (formant) geçirilir. Ünsüzler kısa gürültü patlamaları.
# Çalıştır: python3 tools/music/voice.py -> client/audio/sfx/shout_*.wav
import os, wave
import numpy as np
from scipy.signal import lfilter, fftconvolve
SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'client', 'audio', 'sfx')
rng = np.random.default_rng(11)
# kadın sesi ünlü formantları (F1, F2, F3, F4) ve bant genişlikleri; bağırırken F1 yükselir
V = {'i': (390, 2700, 3300, 4300), 'a': (950, 1350, 2900, 4100), 'e': (650, 2250, 3000, 4200),
     'o': (620, 1050, 2800, 4000), 'h': (950, 1500, 2900, 4100), 'y': (360, 2600, 3200, 4300)}
BW = (110, 140, 200, 260)

def glottal(f0_curve, breath=0.12):
    """f0 eğrisinden darbe dizisi (Rosenberg darbesi), titreşim (jitter) ve genlik dalgalanması (shimmer)"""
    n = len(f0_curve); out = np.zeros(n); ph = 0.0
    jit = 1 + 0.012 * np.convolve(rng.standard_normal(n), np.ones(400) / 400, 'same') * 20
    for i in range(n):
        ph += f0_curve[i] * jit[i] / SR
        if ph >= 1: ph -= 1
        tp, tn = 0.42, 0.16          # açılma / kapanma oranı
        if ph < tp: out[i] = 0.5 * (1 - np.cos(np.pi * ph / tp))
        elif ph < tp + tn: out[i] = np.cos(np.pi / 2 * (ph - tp) / tn)
        else: out[i] = 0
    out = np.diff(out, prepend=0) * 30                    # akış türevi: daha parlak, gerçekçi
    out += rng.standard_normal(n) * breath * np.abs(out).mean() * 6
    return out

def resonator(x, f, bw):
    """zamanla değişen 2. derece rezonatör (blok blok)"""
    y = np.zeros_like(x); blk = 220; z1 = z2 = 0.0
    for s in range(0, len(x), blk):
        fc = float(np.mean(f[s:s + blk])); r = np.exp(-np.pi * bw / SR)
        a1, a2 = -2 * r * np.cos(2 * np.pi * fc / SR), r * r; g = 1 - r
        seg = x[s:s + blk]; o = np.empty_like(seg)
        for i, v in enumerate(seg):
            yv = g * v - a1 * z1 - a2 * z2; z2 = z1; z1 = yv; o[i] = yv
        y[s:s + blk] = o
    return y

def formant_track(segs, n):
    """[(ünlü, süre_oranı), ...] -> her formant için örnek başı frekans eğrisi (yumuşak geçişli)"""
    tr = np.zeros((4, n)); pos = 0
    keys = []
    for v, frac in segs:
        m = int(frac * n); keys.append((pos, V[v])); pos += m
    keys.append((n, keys[-1][1]))
    for j in range(4):
        xs = [k[0] for k in keys]; ys = [k[1][j] for k in keys]
        tr[j] = np.interp(np.arange(n), xs, ys)
    k = np.ones(1600) / 1600
    for j in range(4): tr[j] = np.convolve(np.pad(tr[j], 800, mode='edge'), k, 'valid')[:n]
    return tr

def voice(dur, f0s, segs, effort=1.0):
    n = int(dur * SR); t = np.arange(n) / n
    f0 = np.interp(t, np.linspace(0, 1, len(f0s)), f0s) * (1 + 0.015 * np.sin(2 * np.pi * 5.5 * t * dur))
    src = glottal(f0, breath=0.10 + 0.06 * effort)
    tr = formant_track(segs, n)
    y = sum(resonator(src, tr[j], BW[j]) * g for j, g in enumerate((1.0, 0.75, 0.42, 0.22)))
    # genlik zarfı: hızlı giriş, dolgun gövde, düşen kuyruk
    env = np.minimum(1, t / 0.06) * np.where(t < 0.5, 1, np.exp(-(t - 0.5) * 7)) * np.clip((1 - t) / 0.18, 0, 1) ** 1.5
    return y * env

def burst(d, lo, hi, amp=1.0):
    n = int(d * SR); x = rng.standard_normal(n)
    from scipy.signal import butter
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band'); x = lfilter(b, a, x)
    return x * np.exp(-np.linspace(0, 6, n)) * amp

def aspir(d, vowel, amp=0.5):
    """h sesi: ünlünün formantlarından geçen nefes"""
    n = int(d * SR); x = rng.standard_normal(n) * 0.25
    tr = np.array([np.full(n, f) for f in V[vowel]])
    y = sum(resonator(x, tr[j], BW[j] * 1.6) * g for j, g in enumerate((1.0, 0.8, 0.5, 0.3)))
    return y * np.minimum(1, np.linspace(0, 3, n)) * amp

def room(x, wet=0.10):
    n = int(0.35 * SR); t = np.arange(n) / SR
    ir = rng.standard_normal(n) * np.exp(-t * 14); ir[0] = 0
    y = fftconvolve(x, ir)[: len(x) + int(0.2 * SR)] * wet / np.abs(ir).sum() * 30
    return np.pad(x, (0, len(y) - len(x))) + y

def master(x):
    x = x - np.mean(x)
    x = np.tanh(x / (np.abs(x).max() + 1e-9) * 2.2) / np.tanh(2.2)   # bağırış doygunluğu
    from scipy.signal import butter
    b, a = butter(2, 120 / (SR / 2), 'high'); x = lfilter(b, a, x)
    return room(x)

def save(name, x, gain=0.85):
    os.makedirs(OUT, exist_ok=True)
    x = x / (np.abs(x).max() + 1e-9) * gain
    fl = int(0.01 * SR); x[-fl:] *= np.linspace(1, 0, fl)
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x * 32767).astype(np.int16).tobytes())

def cat(*parts):
    return np.concatenate(parts)

# "kia!": k patlaması + i'den a'ya kayan, perdesi yükselip düşen
save('shout_kia', master(cat(burst(0.018, 1800, 4200, 0.9), aspir(0.025, 'i', 0.4),
                             voice(0.34, [430, 520, 500, 380], [('i', 0.25), ('y', 0.1), ('a', 0.65)], 1.2))))
# "ha!": nefesli giriş + kısa a
save('shout_ha', master(cat(aspir(0.06, 'h', 0.7), voice(0.24, [400, 460, 330], [('a', 1.0)], 1.0))))
# "hiya!": h + i (kısa) + ya (uzun, yükselen-düşen)
save('shout_hiya', master(cat(aspir(0.05, 'i', 0.6), voice(0.12, [380, 420], [('i', 1.0)], 0.9),
                              voice(0.30, [430, 540, 470, 360], [('y', 0.2), ('a', 0.8)], 1.3))))
# "ya!": kısa ve keskin
save('shout_ya', master(voice(0.22, [470, 520, 380], [('y', 0.22), ('a', 0.78)], 1.1)))
# "hah!": çok kısa, nefesli (sıradan vuruşlar için)
save('shout_hah', master(cat(aspir(0.04, 'h', 0.6), voice(0.14, [360, 390, 300], [('a', 1.0)], 0.8))))
# "eya!": e'den ya'ya
save('shout_eya', master(voice(0.34, [400, 450, 520, 380], [('e', 0.3), ('y', 0.15), ('a', 0.55)], 1.2)))
print('bağırışlar yazıldı')
