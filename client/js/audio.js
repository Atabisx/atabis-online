// Oyun sesleri: hepsi WebAudio ile anında üretilir, indirilecek ses dosyası yoktur.
// Tarayıcılar sesi ancak ilk dokunuştan sonra açtığı için unlock() ilk dokunuşta çağrılır.

let ctx = null, master = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('atabis_mute') === '1'; } catch (e) { /* gizli sekme */ }

function init() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  // ani tepe noktalarını yumuşatır, telefonda cızırtı olmaz
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlock() {
  const c = init();
  if (c && c.state === 'suspended') c.resume();
}
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('atabis_mute', m ? '1' : '0'); } catch (e) { /* yok say */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.55, ctx.currentTime, 0.02);
}

// uzaklığa göre ses seviyesi (dinleyici = kendi karakterin)
let listener = { x: 0, z: 0 };
export function setListener(x, z) { listener = { x, z }; }
function near(pos, range = 32) {
  if (!pos) return 1;
  const d = Math.hypot(pos.x - listener.x, pos.z - listener.z);
  return Math.max(0, 1 - d / range);
}
function ready() { return ctx && ctx.state === 'running' && !muted; }

// ---------- yapı taşları ----------
function env(gain, t, a, peak, dur) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
}
function tone({ type = 'sine', f0, f1, t = 0, dur = 0.2, vol = 0.3, a = 0.005, filter }) {
  const now = ctx.currentTime + t;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, now);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, now + dur);
  env(g, now, a, vol, dur);
  let node = o;
  if (filter) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = filter; node.connect(fl); node = fl; }
  node.connect(g); g.connect(master);
  o.start(now); o.stop(now + dur + 0.05);
}
function noise({ t = 0, dur = 0.2, vol = 0.3, type = 'bandpass', f0 = 1000, f1, q = 1, a = 0.005 }) {
  const now = ctx.currentTime + t;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf;
  const fl = ctx.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f0, now);
  if (f1) fl.frequency.exponentialRampToValueAtTime(f1, now + dur);
  const g = ctx.createGain();
  env(g, now, a, vol, dur);
  s.connect(fl); fl.connect(g); g.connect(master);
  s.start(now, Math.random() * 0.5); s.stop(now + dur + 0.05);
}
const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

// ---------- oyun sesleri ----------
// kılıç/hançer savurma, yay gerilmesi, asa vuruşu
export function swing(cls, pos, combo = 0) {
  if (!ready()) return;
  const v = near(pos); if (v <= 0) return;
  if (cls === 'okcu') {
    tone({ type: 'triangle', f0: 180, f1: 120, dur: 0.18, vol: 0.25 * v });
    noise({ dur: 0.12, vol: 0.18 * v, f0: 3000, f1: 1200, q: 2 });
    return;
  }
  if (cls === 'saman') {
    noise({ dur: 0.25, vol: 0.18 * v, f0: 600, f1: 2400, q: 3 });
    tone({ type: 'sine', f0: 500, f1: 900, dur: 0.2, vol: 0.08 * v });
    return;
  }
  const quick = cls === 'ninja';
  noise({ dur: quick ? 0.12 : 0.2, vol: (0.32 + combo * 0.06) * v, f0: quick ? 4200 : 3000, f1: quick ? 1500 : 700, q: 1.4 });
}
// isabet: yaratığa ya da taşa
export function hit(kind, crit, pos) {
  if (!ready()) return;
  const v = near(pos); if (v <= 0) return;
  if (kind === 'stone') {
    tone({ type: 'square', f0: 620, f1: 560, dur: 0.12, vol: 0.09 * v, filter: 2500 });
    tone({ type: 'square', f0: 870, f1: 800, dur: 0.1, vol: 0.06 * v, filter: 2500 });
    noise({ dur: 0.08, vol: 0.25 * v, type: 'highpass', f0: 1500 });
  } else {
    tone({ type: 'sine', f0: 160, f1: 55, dur: 0.14, vol: 0.45 * v });
    noise({ dur: 0.07, vol: 0.3 * v, type: 'lowpass', f0: 1800 });
  }
  if (crit) {
    tone({ type: 'triangle', f0: 1400, f1: 1100, t: 0.01, dur: 0.22, vol: 0.12 * v });
    tone({ type: 'sine', f0: 90, f1: 40, dur: 0.25, vol: 0.35 * v });
  }
}
// karakterin hasar alması
export function hurt() {
  if (!ready()) return;
  tone({ type: 'sawtooth', f0: 140, f1: 70, dur: 0.16, vol: 0.14, filter: 700 });
  noise({ dur: 0.1, vol: 0.2, type: 'lowpass', f0: 900 });
}
// yaratık saldırısı (pençe/ısırık)
export function mobAttack(pos) {
  if (!ready()) return;
  const v = near(pos, 20); if (v <= 0) return;
  noise({ dur: 0.14, vol: 0.18 * v, f0: 1800, f1: 600, q: 2 });
}
// yaratık ölümü; boss için derin gümbürtü
export function die(boss, pos) {
  if (!ready()) return;
  const v = boss ? 1 : near(pos); if (v <= 0) return;
  tone({ type: 'sawtooth', f0: boss ? 220 : 340, f1: boss ? 40 : 90, dur: boss ? 0.9 : 0.35, vol: (boss ? 0.25 : 0.14) * v, filter: 1200 });
  if (boss) {
    noise({ dur: 1.2, vol: 0.35, type: 'lowpass', f0: 600, f1: 80, a: 0.02 });
    [0, 4, 7, 12].forEach((n, i) => tone({ type: 'triangle', f0: NOTE(67 + n), t: 0.5 + i * 0.09, dur: 0.4, vol: 0.12 }));
  }
}
// metin taşı kırıldı
export function stoneBreak(pos) {
  if (!ready()) return;
  const v = near(pos, 40); if (v <= 0) return;
  noise({ dur: 0.7, vol: 0.45 * v, type: 'lowpass', f0: 3000, f1: 150, a: 0.003 });
  tone({ type: 'sine', f0: 110, f1: 35, dur: 0.6, vol: 0.4 * v });
  [0, 5, 9].forEach((n, i) => tone({ type: 'triangle', f0: NOTE(79 + n), t: 0.25 + i * 0.07, dur: 0.3, vol: 0.06 * v }));
}
// ganimet toplama: yang için para sesi
export function pickup(yang) {
  if (!ready()) return;
  if (yang) { tone({ type: 'square', f0: 1320, dur: 0.06, vol: 0.06, filter: 4000 }); tone({ type: 'square', f0: 1760, t: 0.06, dur: 0.12, vol: 0.06, filter: 4000 }); }
  else { tone({ type: 'triangle', f0: 660, dur: 0.08, vol: 0.18 }); tone({ type: 'triangle', f0: 990, t: 0.07, dur: 0.14, vol: 0.18 }); }
}
// iksir içme: fokurtu
export function potion() {
  if (!ready()) return;
  for (let i = 0; i < 4; i++) tone({ type: 'sine', f0: 300 + i * 120, f1: 600 + i * 150, t: i * 0.06, dur: 0.07, vol: 0.12 });
}
// beceri sesi: türüne göre
export function skill(sk, pos) {
  if (!ready() || !sk) return;
  const v = near(pos); if (v <= 0) return;
  if (sk.target === 'heal') { [0, 4, 7, 12].forEach((n, i) => tone({ type: 'sine', f0: NOTE(72 + n), t: i * 0.07, dur: 0.35, vol: 0.12 * v })); return; }
  if (sk.target === 'self') { tone({ type: 'triangle', f0: 220, f1: 660, dur: 0.45, vol: 0.14 * v }); noise({ dur: 0.45, vol: 0.12 * v, f0: 800, f1: 4000, q: 4 }); return; }
  if (sk.target === 'chain') { for (let i = 0; i < 3; i++) noise({ t: i * 0.06, dur: 0.1, vol: 0.3 * v, type: 'highpass', f0: 2500 }); tone({ type: 'sawtooth', f0: 900, f1: 120, dur: 0.3, vol: 0.1 * v, filter: 3000 }); return; }
  if (sk.target === 'aoe') { noise({ dur: 0.5, vol: 0.35 * v, f0: 400, f1: 3000, q: 1.5 }); tone({ type: 'sine', f0: 120, f1: 50, dur: 0.4, vol: 0.35 * v }); return; }
  if (sk.target === 'dash') { noise({ dur: 0.3, vol: 0.35 * v, f0: 5000, f1: 600, q: 1 }); tone({ type: 'sine', f0: 150, f1: 50, t: 0.15, dur: 0.25, vol: 0.4 * v }); return; }
  noise({ dur: 0.25, vol: 0.28 * v, f0: 2500, f1: 800, q: 2 });
  tone({ type: 'triangle', f0: 400, f1: 900, dur: 0.2, vol: 0.12 * v });
}
// seviye atlama: kısa zafer melodisi
export function levelUp() {
  if (!ready()) return;
  const seq = [[60, 0], [64, 0.1], [67, 0.2], [72, 0.3], [76, 0.42], [79, 0.54]];
  for (const [n, t] of seq) {
    tone({ type: 'triangle', f0: NOTE(n), t, dur: 0.35, vol: 0.2 });
    tone({ type: 'square', f0: NOTE(n + 12), t, dur: 0.18, vol: 0.04, filter: 3000 });
  }
  [72, 76, 79, 84].forEach((n) => tone({ type: 'sine', f0: NOTE(n), t: 0.7, dur: 1.1, vol: 0.1, a: 0.02 }));
  noise({ t: 0.7, dur: 1.0, vol: 0.08, type: 'highpass', f0: 6000 });
}
// efsun: parıltı
export function enchant() {
  if (!ready()) return;
  [84, 88, 91, 96, 91, 96].forEach((n, i) => tone({ type: 'sine', f0: NOTE(n), t: i * 0.06, dur: 0.25, vol: 0.1 }));
}
// balık oltaya geldi: suya düşen damla
export function fishBite() {
  if (!ready()) return;
  tone({ type: 'sine', f0: 900, f1: 250, dur: 0.18, vol: 0.3 });
  noise({ dur: 0.15, vol: 0.15, type: 'lowpass', f0: 1200 });
}
// arayüz tıklaması (satın alma vb.)
export function click() {
  if (!ready()) return;
  tone({ type: 'triangle', f0: 1100, dur: 0.05, vol: 0.08 });
}
