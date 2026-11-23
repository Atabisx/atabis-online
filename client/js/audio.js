// Oyun sesleri: vuruşlar audio/sfx içindeki kısa örneklerden (tools/music/sfx.py ile üretilir), yoksa WebAudio ile anında üretilir.
// Müzik: audio/music içindeki parçalar (tools/music/compose.py ile bestelenir), bölgeye göre yumuşak geçişle değişir.
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
  master.gain.value = muted ? 0 : SFX_VOL;
  // ani tepe noktalarını yumuşatır, telefonda cızırtı olmaz
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4;
  master.connect(comp); comp.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  loadSamples();
  return ctx;
}

// ---------- örnek sesler ----------
const SAMPLE_NAMES = ['swing_sword0', 'swing_sword1', 'swing_sword2', 'swing_heavy0', 'swing_heavy1', 'swing_dagger0', 'swing_dagger1', 'swing_staff',
  'bow_shot', 'hit_flesh0', 'hit_flesh1', 'hit_flesh2', 'hit_crit', 'hit_stone', 'hit_armor', 'hit_arrow',
  ...['hya0', 'hya2', 'hya3', 'hya4', 'hya5', 'hya7', 'sharp1', 'myst0'].map((n) => 'voice_' + n),   // kadın sesleri
  ...['ha0', 'ha1', 'ha2', 'ha3', 'ha4', 'ha6', 'ha7', 'ha8', 'hya1', 'hya6', 'sharp0', 'myst1'].map((n) => 'voice_' + n)];   // erkek (Akıncı)
const samples = {};
function loadSamples() {
  for (const n of SAMPLE_NAMES) {
    fetch(`audio/sfx/${n}.wav`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(r.status)))
      .then((b) => new Promise((res, rej) => ctx.decodeAudioData(b, res, rej)))
      .then((buf) => { samples[n] = buf; }).catch(() => { /* yoksa sentez kullanılır */ });
  }
}
const pick = (base, n) => { const k = base + Math.floor(Math.random() * n); return samples[k] ? k : null; };
// örnek çal: hafif perde ve ses farkıyla her vuruş biraz değişik duyulur
function play(name, vol, t = 0, rate = 1) {
  const buf = name && samples[name]; if (!buf) return false;
  const src = ctx.createBufferSource(); src.buffer = buf;
  src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
  const g = ctx.createGain(); g.gain.value = vol * (0.9 + Math.random() * 0.2);
  src.connect(g); g.connect(master); src.start(ctx.currentTime + t);
  return true;
}

// ---------- müzik ----------
// HTML ses öğesiyle çalınır (uzun parçalar için daha az bellek); iki öğe arasında yumuşak geçiş yapılır
let musicOn = true;
try { musicOn = localStorage.getItem('atabis_music') !== '0'; } catch (e) { /* yok say */ }
let MUSIC_VOL = 0.38, SFX_VOL = 0.55;
try { const v = JSON.parse(localStorage.getItem('atabis_vol') || 'null'); if (v) { MUSIC_VOL = v.m; SFX_VOL = v.s; } } catch (e) { /* yok say */ }
let curTrack = null, curEl = null, fadeTimer = null;
const els = [];
function musicTarget() { return muted || !musicOn ? 0 : MUSIC_VOL; }
function fadeTo(el, to, ms, done) {
  const from = el.volume, t0 = performance.now();
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / ms);
    el.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) el._fade = setTimeout(step, 40); else if (done) done();
  };
  clearTimeout(el._fade); step();
}
export function music(track) {
  if (track === curTrack) { if (curEl && curEl.paused && musicTarget() > 0) curEl.play().catch(() => {}); return; }
  curTrack = track;
  const old = curEl;
  if (old) fadeTo(old, 0, 1500, () => { old.pause(); });
  if (!track) { curEl = null; return; }
  const el = new Audio(`audio/music/${track}.mp3`);
  el.loop = true; el.volume = 0; el.preload = 'auto';
  curEl = el; els.push(el); if (els.length > 3) els.shift();
  if (musicTarget() > 0) el.play().then(() => fadeTo(el, musicTarget(), 2000)).catch(() => { /* ilk dokunuşta yeniden denenir */ });
}
function refreshMusic() {
  if (!curEl) return;
  if (musicTarget() > 0) { if (curEl.paused) curEl.play().catch(() => {}); fadeTo(curEl, musicTarget(), 600); }
  else fadeTo(curEl, 0, 400, () => curEl && curEl.pause());
}
export function isMusicOn() { return musicOn; }
// ayarlar penceresi: efekt ve müzik seviyesi (0..1)
export function volumes() { return { s: SFX_VOL, m: MUSIC_VOL }; }
export function setVolumes(s, m) {
  SFX_VOL = s; MUSIC_VOL = m;
  try { localStorage.setItem('atabis_vol', JSON.stringify({ s, m })); } catch (e) { /* yok say */ }
  if (master && !muted) master.gain.setTargetAtTime(SFX_VOL, ctx.currentTime, 0.05);
  refreshMusic();
}
export function setMusicOn(on) {
  musicOn = on;
  try { localStorage.setItem('atabis_music', on ? '1' : '0'); } catch (e) { /* yok say */ }
  refreshMusic();
}
// haritanın türüne göre müzik
const MAP_MUSIC = { village_winter: 'koy', lake: 'koy', pine_forest: 'orman', forest_mist: 'orman', rocky: 'orman', swamp: 'orman',
  desert_dunes: 'col', desert_canyon: 'col', snow: 'kar', ice_cave: 'kar' };
// Atabis Köyü (ilk harita) kendi müziğini çalar
export function musicForMap(theme, id) { return id === 0 ? 'koy1' : (MAP_MUSIC[theme] || 'karanlik'); }

export function unlock() {
  const c = init();
  if (c && c.state === 'suspended') c.resume();
  if (curEl && curEl.paused && musicTarget() > 0) curEl.play().then(() => fadeTo(curEl, musicTarget(), 1500)).catch(() => {});
}
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('atabis_mute', m ? '1' : '0'); } catch (e) { /* yok say */ }
  if (master) master.gain.setTargetAtTime(m ? 0 : SFX_VOL, ctx.currentTime, 0.02);
  refreshMusic();
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
// rastgele perde: aynı ses üst üste gelince makineli tüfek gibi olmasın
const vary = (f, k = 0.08) => f * (1 + (Math.random() - 0.5) * 2 * k);
// madeni çınlama: uyumsuz kısmi tonlar (gerçek metal gibi)
function ring(base, vol, dur, t = 0) {
  for (const [m, g] of [[1, 1], [2.76, 0.55], [5.4, 0.3], [8.93, 0.15]]) tone({ type: 'sine', f0: base * m, t, dur: dur * (1.2 - m * 0.08), vol: vol * g, a: 0.002 });
}
// kılıç/hançer savurma, yay gerilmesi, asa vuruşu
export function swing(cls, pos, combo = 0) {
  if (!ready()) return;
  const v = near(pos); if (v <= 0) return;
  const smp = cls === 'saman' ? 'swing_staff' : combo >= 2 ? pick('swing_heavy', 2) : pick('swing_sword', 3);
  if (play(smp, (0.55 + combo * 0.08) * v, 0, cls === 'sura' ? 0.92 : 1)) return;
  if (cls === 'saman') {
    noise({ dur: 0.28, vol: 0.2 * v, f0: 500, f1: 2600, q: 3 });
    tone({ type: 'sine', f0: vary(520), f1: 980, dur: 0.22, vol: 0.09 * v });
    return;
  }
  // keskin "vuuş": hızlı süpürülen dar bant gürültü + hava basıncı
  const quick = cls === 'ninja';
  const d = quick ? 0.11 : 0.17 + combo * 0.02;
  noise({ dur: d, vol: (0.38 + combo * 0.06) * v, f0: vary(quick ? 5200 : 3800), f1: quick ? 1600 : 900, q: 2.2 });
  noise({ dur: d * 1.2, vol: 0.16 * v, type: 'lowpass', f0: 700, f1: 200 });
}
// isabet: yaratığa ya da taşa (Metin2 gibi dolgun: kesik + et + metal + gümleme)
export function hit(kind, crit, pos) {
  if (!ready()) return;
  const v = near(pos); if (v <= 0) return;
  if (kind === 'stone' && play('hit_stone', 0.75 * v, 0, crit ? 0.9 : 1)) { if (crit) play('hit_crit', 0.4 * v, 0.01); return; }
  if (kind === 'arrow' && play('hit_arrow', 0.7 * v)) { if (crit) play('hit_crit', 0.6 * v, 0.01); return; }
  if (kind === 'player' && play('hit_armor', 0.55 * v)) { play(crit ? 'hit_crit' : pick('hit_flesh', 3), (crit ? 0.8 : 0.55) * v, 0.005); return; }
  if (kind !== 'stone' && play(crit ? 'hit_crit' : pick('hit_flesh', 3), (crit ? 0.95 : 0.75) * v)) return;
  if (kind === 'stone') {
    ring(vary(620, 0.05), 0.09 * v, 0.35);
    noise({ dur: 0.06, vol: 0.35 * v, type: 'highpass', f0: 1800 });
    noise({ dur: 0.18, vol: 0.25 * v, type: 'lowpass', f0: 900, f1: 200 });
    tone({ type: 'sine', f0: 90, f1: 45, dur: 0.18, vol: 0.3 * v });
  } else {
    noise({ dur: 0.012, vol: 0.5 * v, type: 'highpass', f0: 3000 });                            // ilk temas çıtırtısı
    noise({ dur: 0.13, vol: 0.42 * v, f0: vary(1500), f1: 380, q: 1.6 });                         // kesme/et sesi
    tone({ type: 'sine', f0: vary(150), f1: 48, dur: 0.16, vol: 0.5 * v });                       // gövde gümlemesi
    ring(vary(1900, 0.1), 0.035 * v, 0.16, 0.005);                                                 // kılıç parıltısı
  }
  if (crit) {
    ring(vary(2600, 0.04), 0.09 * v, 0.45);                                                         // "şiing"
    tone({ type: 'sine', f0: 80, f1: 34, dur: 0.35, vol: 0.45 * v });
    noise({ dur: 0.25, vol: 0.22 * v, type: 'lowpass', f0: 1200, f1: 150 });
  }
}
// Metin2 tarzı vuruş bağırışları (gerçek ses kayıtları, audio/sfx/voice_*.wav):
// 'light' sıradan vuruşta ara sıra kısa bağırış, 'strong' 3. kombo ve becerilerde, 'magic' büyülerde.
// Kadın karakterler (Alp, Akıncı, Kam) sadece ince (kadın) kayıtları kullanır, perdeleri kalınlaştırılmaz.
// Yalaz (Altın Fırtına İmparatoru) ve Avcı (Kızıl Gölge Kılıcı) erkek: kalın "ha" kayıtları onlarda.
const FEMALE_LIGHT = ['hya4', 'hya0', 'hya5'];
const FEMALE_STRONG = ['hya0', 'hya2', 'hya3', 'hya4', 'hya5', 'hya7'];
const VOICES = {
  savasci: { light: FEMALE_LIGHT, strong: ['hya2', 'hya3', 'hya7', 'sharp1'], magic: ['sharp1', 'hya7'], rate: 1.0 },
  ninja: { light: FEMALE_LIGHT, strong: ['hya0', 'hya4', 'hya5', 'hya7', 'sharp1'], magic: ['sharp0', 'hya4'], rate: 1.04 },
  sura: { light: ['ha1', 'ha2', 'ha6'], strong: ['ha0', 'ha3', 'ha4', 'ha7', 'ha8', 'hya1', 'hya6'], magic: ['myst0', 'myst1'], rate: 0.95 },
  saman: { light: FEMALE_LIGHT, strong: FEMALE_STRONG, magic: ['myst0', 'sharp1'], rate: 1.05 },
  okcu: { light: ['ha1', 'ha2', 'ha6'], strong: ['ha0', 'ha3', 'ha4', 'ha7', 'ha8', 'hya6'], magic: ['sharp0', 'myst1'], rate: 0.98 },
};
let lastShout = 0;
export function shout(cls, kind = 'light', pos = null) {
  if (!ready()) return;
  if (kind === true) kind = 'strong'; else if (kind === false) kind = 'light';
  const v = near(pos, 26); if (v <= 0) return;
  const now = ctx.currentTime;
  if (now - lastShout < (kind === 'light' ? 0.7 : 0.35)) return;
  const set = VOICES[cls] || VOICES.savasci;
  const list = (set[kind] || set.strong).map((n) => 'voice_' + n).filter((n) => samples[n]);
  if (!list.length) return;
  lastShout = now;
  play(list[Math.floor(Math.random() * list.length)], (kind === 'light' ? 0.5 : 0.7) * v, 0, set.rate);
}
// beceri kullanırken kısa "hah!" (tonlu, ağız boşluğu gibi süzülmüş)
export function grunt(pos, female = false) {
  if (!ready()) return;
  const v = near(pos, 20); if (v <= 0) return;
  const f0 = vary(female ? 260 : 150, 0.06);
  const now = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(f0 * 1.15, now); o.frequency.exponentialRampToValueAtTime(f0 * 0.8, now + 0.22);
  const g = ctx.createGain(); env(g, now, 0.012, 0.22 * v, 0.24);
  const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = female ? 900 : 700; f1.Q.value = 3;
  const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = female ? 1900 : 1250; f2.Q.value = 4;
  o.connect(f1); o.connect(f2); f1.connect(g); f2.connect(g); g.connect(master);
  o.start(now); o.stop(now + 0.3);
  noise({ dur: 0.18, vol: 0.08 * v, f0: 1400, q: 1.2 });   // nefes
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
