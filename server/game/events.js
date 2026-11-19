// Etkinlikler: Metin Yağmuru, Tecrübe Şöleni, Boss İstilası, Ganimet Bereketi.
// Zamanlayıcı İstanbul saatine göre çalışır; GM "/etkinlik <tür> [dakika]" ile elle başlatabilir, "/etkinlik bitir <tür>" ile bitirir.
const R = require('./rules');

const ist = (ms = Date.now()) => new Date(ms + 3 * 3600e3);
const TYPES = {
  metin: { name: 'Metin Yağmuru', icon: '🪨', min: 15, desc: 'Bütün vahşi haritalara ek metin taşları düşer. Ruh taşı ve yaprak toplamanın tam zamanı!',
    schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], hour: 20, minute: 0 }] },
  exp: { name: 'Tecrübe Şöleni', icon: '✨', min: 60, desc: 'Canavarlardan 2 kat tecrübe kazanılır.',
    schedule: [{ days: [5, 6, 0], hour: 19, minute: 0 }] },
  boss: { name: 'Boss İstilası', icon: '👹', min: 20, desc: 'Her vahşi haritada ek boss\'lar ortaya çıkar. Grubunu topla!',
    schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], hour: 22, minute: 0 }] },
  drop: { name: 'Ganimet Bereketi', icon: '💰', min: 60, desc: 'Canavarlardan eşya düşme şansı 2 katına çıkar.',
    schedule: [{ days: [2, 4], hour: 20, minute: 30 }] },
};

function createEvents(W) {
  const { io, zones } = W;
  const active = {};                     // tür -> bitiş zamanı
  const fired = new Set();
  const wild = () => zones.filter((z) => !z.def.village && !z.def.hidden && !z.def.safe && !z.def.fishing);

  function nextOf(type) {
    const now = ist();
    for (let d = 0; d < 8; d++) {
      const t = new Date(now.getTime() + d * 86400e3);
      let best = 0;
      for (const s of TYPES[type].schedule) {
        if (!s.days.includes(t.getUTCDay())) continue;
        const at = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), s.hour, s.minute) - 3 * 3600e3;
        if (at > Date.now() && (!best || at < best)) best = at;
      }
      if (best) return best;
    }
    return 0;
  }
  const list = () => Object.entries(TYPES).map(([key, t]) => ({ key, name: t.name, icon: t.icon, desc: t.desc, active: !!active[key], ends: active[key] || 0, next: nextOf(key) }));
  const broadcast = () => io.emit('events', list());

  function start(type, minutes) {
    const t = TYPES[type]; if (!t || active[type]) return false;
    active[type] = Date.now() + (minutes || t.min) * 60e3;
    if (type === 'metin') for (const z of wild()) for (let i = 0; i < 6; i++) z.spawnExtraStone();
    if (type === 'boss') for (const z of wild()) for (const key of z.def.bosses) { const m = z.spawnMob(key, null); m.event = true; }
    io.emit('announce', `${t.icon} ${t.name} başladı! ${minutes || t.min} dakika sürecek. ${t.desc}`);
    broadcast();
    return true;
  }
  function stop(type) {
    if (!active[type]) return;
    delete active[type];
    if (type === 'metin' || type === 'boss') for (const z of wild()) z.removeExtras();
    io.emit('announce', `${TYPES[type].name} sona erdi.`);
    broadcast();
  }
  setInterval(() => {
    const now = Date.now();
    for (const type of Object.keys(TYPES)) {
      if (active[type]) { if (now >= active[type]) stop(type); continue; }
      const nx = nextOf(type); if (!nx) continue;
      const left = nx - now;
      if (left <= 5 * 60e3 && left > 4 * 60e3 && !fired.has(type + nx + 'w')) { fired.add(type + nx + 'w'); io.emit('announce', `${TYPES[type].icon} ${TYPES[type].name} 5 dakika sonra başlıyor!`); }
      if (left <= 1000 && !fired.has(type + nx)) { fired.add(type + nx); start(type); }
    }
  }, 1000);

  function onConnect(p, socket) {
    socket.emit('events', list());
    socket.on('eventsGet', () => socket.emit('events', list()));
  }
  function gm(p, args) {
    if (args[0] === 'bitir') { stop(args[1]); return; }
    if (!TYPES[args[0]]) { W.notice(p, 'Etkinlikler: ' + Object.keys(TYPES).join(', ') + ' · /etkinlik <tür> [dakika] · /etkinlik bitir <tür>'); return; }
    start(args[0], Number(args[1]) || 0);
  }
  return {
    onConnect, gm, start, stop, list, active,
    expBonus: () => (active.exp ? 1 : 0),
    dropMul: () => (active.drop ? 2 : 1),
  };
}

module.exports = { createEvents, EVENT_TYPES: TYPES };
