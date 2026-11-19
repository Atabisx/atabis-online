# Atabis Online özgün müzikleri: giriş, köy, orman, çöl, kar, karanlık bölgeler.
# Çalıştır: python3 tools/music/compose.py  -> client/audio/music/*.mp3 (ffmpeg gerekir)
import os, subprocess, sys, wave
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from synth import *

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'client', 'audio', 'music')

def parse(s):
    out = []
    for tok in s.split():
        n, d = tok.split(':'); out.append((None if n == 'r' else n, float(d)))
    return out
def seq(mx, bpm, start_beat, notes, fn, vol=1.0, pan=0.0, rev=0.3, legato=1.0, **kw):
    b = 60 / bpm; t = start_beat; prev = None
    for n, d in parse(notes) if isinstance(notes, str) else notes:
        if n:
            if fn is erhu: sig = erhu(n, d * b * legato + 0.05, prev=prev)
            else: sig = fn(n, d * b * legato + 0.02, **kw)
            mx.add(sig, t * b, vol, pan, rev); prev = n
        t += d
    return t
def chords_pad(mx, bpm, chords, beats=4, vol=0.25, cut=1100, fn=None, rev=0.5):
    b = 60 / bpm
    for i, ch in enumerate(chords):
        sig = (fn or pad)(ch.split(), beats * b, **({'cut': cut} if fn is None else {}))
        mx.add(sig, i * beats * b, vol, 0, rev)
def arp(mx, bpm, chords, pattern, beats=4, step=0.5, vol=0.3, pan=0.0, bright=0.5, oct_up=0, rev=0.35, start=0, upto=None):
    b = 60 / bpm
    for i, ch in enumerate(chords):
        if i < start or (upto is not None and i >= upto): continue
        ns = ch.split()
        for k in range(int(beats / step)):
            idx = pattern[k % len(pattern)]
            if idx is None: continue
            note = midi(ns[idx % len(ns)]) + 12 * (idx // len(ns)) + 12 * oct_up
            mx.add(pluck(note, step * b * 2.2, bright=bright), (i * beats + k * step) * b, vol, pan, rev)
def drums(mx, bpm, bars, pattern, fn, vol=0.5, pan=0.0, rev=0.2, start=0, beats=4, step=0.5):
    b = 60 / bpm
    for bar in range(start, bars):
        for k, hit in enumerate(pattern):
            if hit: mx.add(fn() if callable(fn) else fn, (bar * beats + k * step) * b, vol * hit, pan, rev)

def save(name, out):
    os.makedirs(OUT, exist_ok=True)
    wav = f'/tmp/_{name}.wav'
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((out * 32767).astype(np.int16).tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-c:a', 'libmp3lame', '-b:a', '112k', os.path.join(OUT, name + '.mp3')], check=True)
    os.remove(wav); print(name, round(len(out) / SR, 1), 's')

# ---------- 1. Giriş ve karakter seçimi: destansı, hüzünlü (Re minör, 72 BPM) ----------
def lobby():
    bpm = 72; bars = 16; mx = Mix(bars * 4 * 60 / bpm)
    ch = ['D3 A3 D4 F4', 'D3 A3 D4 F4', 'Bb2 F3 Bb3 D4', 'C3 G3 C4 E4', 'D3 A3 D4 F4', 'Bb2 F3 Bb3 D4', 'F2 C3 F3 A3', 'C3 G3 C4 E4',
          'D3 A3 D4 F4', 'Bb2 F3 Bb3 D4', 'G2 D3 G3 Bb3', 'A2 E3 A3 C#4', 'D3 A3 D4 F4', 'Bb2 F3 Bb3 D4', 'C3 G3 C4 E4', 'A2 E3 A3 C#4']
    chords_pad(mx, bpm, [' '.join(c.split()[1:]) for c in ch], vol=0.2, cut=900)
    seq(mx, bpm, 0, ' '.join(f'{c.split()[0]}:4' for c in ch), bass, vol=0.35, rev=0.2)
    arp(mx, bpm, ch, [0, 1, 2, 3, 2, 1, 3, 2], vol=0.22, pan=-0.35, bright=0.45, oct_up=1)
    drums(mx, bpm, bars, [1, 0, 0, 0, 0, 0, 0.5, 0], lambda: taiko(1.4), vol=0.5, start=4)
    drums(mx, bpm, bars, [0, 0, 0, 0, 0.6, 0, 0, 0.35], lambda: taiko(0.8), vol=0.35, start=8, pan=0.2)
    mel = ('A4:1.5 C5:0.5 D5:2 F5:1 E5:0.5 D5:0.5 C5:2 D5:1 A4:1 G4:1 F4:1 A4:4 '
           'D5:1.5 F5:0.5 G5:2 A5:1 G5:0.5 F5:0.5 D5:2 F5:1 E5:1 C5:1 E5:1 D5:4')
    seq(mx, bpm, 16, mel, erhu, vol=0.32, pan=0.1, rev=0.45)
    seq(mx, bpm, 48, 'A5:2 G5:1 F5:1 E5:2 D5:2 F5:1 G5:1 A5:1 C6:1 C#6:3 r:1', flute, vol=0.3, pan=0.25, rev=0.5)
    for k, n in enumerate(['D6', 'A5', 'F6', 'D6']): mx.add(bell(n, 3, 0.25), (48 + k * 4) * 60 / bpm, 1, -0.3, 0.6)
    mx.add(gong(6), 0, 0.35, 0, 0.5)
    save('giris', mx.render(2.8))

# ---------- 2. Köy: huzurlu, neşeli (Sol majör pentatonik, 92 BPM) ----------
def koy():
    bpm = 92; bars = 16; mx = Mix(bars * 4 * 60 / bpm)
    ch = ['G3 B3 D4', 'E3 G3 B3', 'C3 E3 G3', 'D3 F#3 A3'] * 4
    chords_pad(mx, bpm, ch, vol=0.12, cut=1400)
    seq(mx, bpm, 0, ' '.join(f'{c.split()[0][:-1]}2:2 {c.split()[0][:-1]}3:2' for c in ch), bass, vol=0.28, rev=0.15)
    arp(mx, bpm, ch, [0, 2, 1, 2, 0, 2, 1, 2], vol=0.2, pan=-0.3, bright=0.55, oct_up=1)
    drums(mx, bpm, bars, [1, 0, 0, 0.5, 0, 0, 0.7, 0], hand_drum, vol=0.35, pan=0.25)
    drums(mx, bpm, bars, [0, 1, 0, 1, 0, 1, 0, 1], shaker, vol=0.6, pan=0.4, start=4)
    mel = ('D5:1 E5:0.5 G5:0.5 A5:1 G5:1 E5:1.5 D5:0.5 B4:2 C5:1 E5:1 D5:1 B4:1 A4:4 '
           'B4:1 D5:0.5 E5:0.5 G5:1 A5:1 B5:1.5 A5:0.5 G5:2 E5:1 D5:1 E5:0.5 D5:0.5 B4:1 G4:4')
    seq(mx, bpm, 0, mel, flute, vol=0.3, pan=0.15, rev=0.4)
    seq(mx, bpm, 32, mel, lambda n, d: pluck(midi(n), d * 1.6, bright=0.6), vol=0.28, pan=0.3, rev=0.35)
    seq(mx, bpm, 32, 'G4:4 E4:4 E4:4 F#4:4 G4:4 B4:4 C5:4 B4:4', flute, vol=0.14, pan=-0.2, rev=0.5)
    save('koy', mx.render(2.2, loud=1.8))

# ---------- 3. Orman ve ovalar: maceracı (La minör, 100 BPM) ----------
def orman():
    bpm = 100; bars = 16; mx = Mix(bars * 4 * 60 / bpm)
    ch = ['A2 E3 A3 C4', 'F2 C3 F3 A3', 'G2 D3 G3 B3', 'E2 B2 E3 G#3'] * 2 + ['A2 E3 A3 C4', 'F2 C3 F3 A3', 'C3 G3 C4 E4', 'G2 D3 G3 B3', 'A2 E3 A3 C4', 'F2 C3 F3 A3', 'G2 D3 G3 B3', 'E2 B2 E3 G#3']
    chords_pad(mx, bpm, [' '.join(c.split()[1:]) for c in ch], vol=0.14, cut=1300)
    b = 60 / bpm
    for i, c in enumerate(ch):
        r = c.split()[0]
        for k in range(8): mx.add(strings_stacc(midi(r) + (12 if k % 2 else 0), 0.5 * b * 0.6), (i * 4 + k * 0.5) * b, 0.16, -0.2, 0.25)
    arp(mx, bpm, ch, [1, 2, 3, 2, 1, 3, 2, 3], vol=0.17, pan=0.35, bright=0.6, oct_up=1)
    drums(mx, bpm, bars, [1, 0, 0, 0.6, 0.8, 0, 0, 0.4], lambda: taiko(0.7), vol=0.42)
    drums(mx, bpm, bars, [0, 0.5, 0.3, 0.5, 0, 0.5, 0.3, 0.6], shaker, vol=0.7, pan=-0.4)
    mel = ('E5:1 A5:1 G5:0.5 E5:0.5 D5:1 C5:1.5 D5:0.5 E5:2 F5:1 E5:1 D5:1 B4:1 E5:4 '
           'A5:1 C6:1 B5:0.5 A5:0.5 G5:1 F5:1.5 G5:0.5 A5:2 G5:1 E5:1 D5:1 E5:1 A4:4')
    seq(mx, bpm, 16, mel, erhu, vol=0.27, pan=0.05, rev=0.38)
    seq(mx, bpm, 48, 'A5:2 G5:2 F5:2 E5:2 E5:1 G5:1 B5:1 G#5:1 A5:4', flute, vol=0.24, pan=0.2, rev=0.45)
    save('orman', mx.render(2.0))

# ---------- 4. Çöl ve kanyon: Hicaz havası (Mi, 96 BPM) ----------
def col():
    bpm = 96; bars = 16; mx = Mix(bars * 4 * 60 / bpm); b = 60 / bpm
    for i in range(bars): mx.add(pad(['E2', 'B2', 'E3'], 4 * b, cut=700), i * 4 * b, 0.2, 0, 0.4)
    drums(mx, bpm, bars, [1, 0, 0, 1, 0, 0, 1, 0], lambda: frame_drum('dum'), vol=0.5)
    drums(mx, bpm, bars, [0, 0, 1, 0, 0, 1, 0, 1], lambda: frame_drum('tek'), vol=0.42, pan=0.3)
    drums(mx, bpm, bars, [0, 0.4, 0, 0.4, 0, 0.4, 0, 0.4], shaker, vol=0.5, pan=-0.4, start=4)
    oud = lambda n, d: pluck(midi(n), d * 1.2, bright=0.75, decay=0.993, body=0.6)
    riff = 'E3:0.5 F3:0.5 G#3:0.5 A3:0.5 G#3:0.5 F3:0.5 E3:1 '
    seq(mx, bpm, 0, riff * 16, oud, vol=0.22, pan=-0.3, rev=0.25)
    mel = ('B4:1 C5:0.5 B4:0.5 A4:1 G#4:1 A4:0.5 B4:0.5 C5:1 B4:2 E5:1 D5:0.5 C5:0.5 B4:1 A4:1 G#4:1 F4:1 E4:2 '
           'G#4:0.5 A4:0.5 B4:1 C5:1 D5:1 E5:2 F5:1 E5:1 D5:1 C5:0.5 B4:0.5 C5:1 B4:1 A4:1 G#4:1 E4:2')
    seq(mx, bpm, 16, mel, erhu, vol=0.27, pan=0.1, rev=0.4)
    seq(mx, bpm, 48, 'E5:1 F5:1 G#5:1 A5:1 B5:2 A5:1 G#5:1 F5:1 E5:1 F5:1 G#5:1 E5:4', flute, vol=0.22, pan=0.25, rev=0.45)
    save('col', mx.render(2.0))

# ---------- 5. Kar ve buz: dingin, buz gibi (Mi minör, 66 BPM) ----------
def kar():
    bpm = 66; bars = 12; mx = Mix(bars * 4 * 60 / bpm); b = 60 / bpm
    ch = ['E3 B3 G4', 'C3 G3 E4', 'G3 D4 B4', 'D3 A3 F#4'] * 3
    chords_pad(mx, bpm, ch, vol=0.2, cut=1600)
    chords_pad(mx, bpm, ch, vol=0.1, fn=lambda ns, d: choir(ns, d))
    seq(mx, bpm, 0, ' '.join(f'{c.split()[0][:-1]}2:4' for c in ch), bass, vol=0.24, rev=0.4)
    for i, c in enumerate(ch):
        for k, idx in enumerate([2, 1, 2, 0]):
            mx.add(bell(midi(c.split()[idx]) + 12, 3.2, 0.22), (i * 4 + k) * b, 1, (-0.4 if k % 2 else 0.4), 0.7)
    mel = 'B4:2 D5:1 E5:1 G5:3 F#5:1 E5:2 D5:2 B4:4 r:4 G5:2 A5:1 B5:1 D6:3 B5:1 A5:2 F#5:2 E5:4'
    seq(mx, bpm, 8, mel, flute, vol=0.27, pan=0.1, rev=0.6, vib=0.008)
    save('kar', mx.render(3.5, loud=1.6))

# ---------- 6. Volkan, kale, harabe, iblis kulesi, ejder: karanlık savaş (Re minör, 108 BPM) ----------
def karanlik():
    bpm = 108; bars = 16; mx = Mix(bars * 4 * 60 / bpm); b = 60 / bpm
    ch = ['D2', 'D2', 'Bb1', 'C2', 'D2', 'D2', 'G1', 'A1'] * 2
    for i, r in enumerate(ch):
        root = midi(r)
        for k, iv in enumerate([0, 0, 12, 0, 7, 0, 12, 10]):
            mx.add(strings_stacc(root + 12 + iv, 0.5 * b * 0.55), (i * 4 + k * 0.5) * b, 0.22, (-0.25 if k % 2 else 0.25), 0.25)
        mx.add(bass(root + 12, 4 * b), i * 4 * b, 0.3, 0, 0.1)
        mx.add(choir([root + 24, root + 31, root + 36], 4 * b), i * 4 * b, 0.13 if i >= 4 else 0.07, 0, 0.5)
    drums(mx, bpm, bars, [1, 0, 0.6, 0, 1, 0, 0.6, 0.6], lambda: taiko(1.1), vol=0.5)
    drums(mx, bpm, bars, [0, 0, 0, 0.7, 0, 0.5, 0, 0], lambda: taiko(0.6), vol=0.4, pan=0.3, start=4)
    seq(mx, bpm, 0, 'D4:3 F4:1 A4:4 Bb4:3 A4:1 G4:2 E4:2 D4:3 F4:1 A4:2 D5:2 C#5:8', brass, vol=0.22, pan=-0.05, rev=0.4)
    seq(mx, bpm, 32, 'A4:1 Bb4:1 A4:1 G4:1 F4:2 E4:2 D4:1 E4:1 F4:1 G4:1 A4:4 '
                     'D5:1 C5:1 Bb4:1 A4:1 G4:2 F4:2 E4:2 F4:1 E4:1 D4:4', erhu, vol=0.3, pan=0.1, rev=0.4)
    for k in range(0, bars, 8): mx.add(gong(5), k * 4 * b, 0.4, 0, 0.5)
    save('karanlik', mx.render(2.4))

if __name__ == '__main__':
    which = sys.argv[1:] or ['giris', 'koy', 'orman', 'col', 'kar', 'karanlik']
    for w in which: {'giris': lobby, 'koy': koy, 'orman': orman, 'col': col, 'kar': kar, 'karanlik': karanlik}[w]()
