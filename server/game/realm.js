// Krallıklar ve krallık savaşı.
// Üç krallık: 1 Kızıl Ejder, 2 Altın Kartal, 3 Gök Kurt. Savaş Çarşamba ve Cumartesi 21:00'de (İstanbul) 20 dakika sürer.
// Savaş Meydanı'nda farklı krallıktan oyuncular birbirine saldırabilir; her öldürme krallığına 1 puan.
// Kazanan krallık 24 saat +%20 tecrübe alır; katılanlara ödül verilir.
const R = require('./rules');

const EMPIRES = { 1: { name: 'Kızıl Ejder', color: '#e0453a' }, 2: { name: 'Altın Kartal', color: '#e8b54a' }, 3: { name: 'Gök Kurt', color: '#3d8fe0' } };
const WAR_MAP = R.MAPS.findIndex((m) => m.war);
const WAR_MIN_LEVEL = 20, WAR_MINUTES = 20, WIN_BONUS = 0.2;
const SCHEDULE = [{ day: 3, hour: 21 }, { day: 6, hour: 21 }];    // Çarşamba, Cumartesi
const ist = (ms = Date.now()) => new Date(ms + 3 * 3600e3);       // İstanbul saati (UTC+3)

function createRealm(W) {
  const { db, io, players, notice, moveToZone, sendInv, addItem, save } = W;
  const war = { active: false, ends: 0, score: { 1: 0, 2: 0, 3: 0 }, kills: new Map(), joined: new Set(), lastKey: null, warned: null };
  let winner = { empire: 0, until: 0 };

  // kalıcı durum (son kazanan)
  db.query('CREATE TABLE IF NOT EXISTS world_state (key TEXT PRIMARY KEY, value JSONB NOT NULL)')
    .then(() => db.query("SELECT value FROM world_state WHERE key = 'war'"))
    .then((r) => { if (r.rows[0]) winner = r.rows[0].value; })
    .catch((e) => console.error('dünya durumu', e.message));
  const persist = () => db.query("INSERT INTO world_state (key, value) VALUES ('war', $1) ON CONFLICT (key) DO UPDATE SET value = $1", [JSON.stringify(winner)])
    .catch((e) => console.error('savaş kaydı', e.message));

  const state = () => ({ active: war.active, ends: war.ends, score: war.score, winner: winner.until > Date.now() ? winner.empire : 0,
    winnerUntil: winner.until, next: nextWar(), map: WAR_MAP, empires: EMPIRES });
  const broadcast = () => io.emit('warState', state());
  function nextWar() {
    const now = ist();
    for (let d = 0; d < 8; d++) {
      const t = new Date(now.getTime() + d * 86400e3);
      for (const s of SCHEDULE) {
        if (t.getUTCDay() !== s.day) continue;
        const at = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate(), s.hour) - 3 * 3600e3;
        if (at > Date.now()) return at;
      }
    }
    return 0;
  }
  const base = (p) => (R.MAPS[WAR_MAP].bases || {})[String(p.empire)] || R.MAPS[WAR_MAP].spawn;

  function start(by) {
    if (war.active || WAR_MAP < 0) return;
    war.active = true; war.ends = Date.now() + WAR_MINUTES * 60e3; war.score = { 1: 0, 2: 0, 3: 0 }; war.kills = new Map(); war.joined = new Set();
    io.emit('announce', `KRALLIK SAVAŞI BAŞLADI! ${WAR_MINUTES} dakika sürecek. Menü > Etkinlikler'den Savaş Meydanı'na katıl (Sv. ${WAR_MIN_LEVEL}+).`);
    console.log('Krallık savaşı başladı', by || 'zamanlayıcı');
    broadcast();
  }
  function end() {
    if (!war.active) return;
    war.active = false;
    const s = war.score, best = Math.max(s[1], s[2], s[3]);
    const tops = [1, 2, 3].filter((e) => s[e] === best);
    const win = best > 0 && tops.length === 1 ? tops[0] : 0;
    if (win) {
      winner = { empire: win, until: Date.now() + 24 * 3600e3 }; persist();
      io.emit('announce', `Krallık savaşını ${EMPIRES[win].name} kazandı! (${s[1]} - ${s[2]} - ${s[3]}) ${EMPIRES[win].name} 24 saat +%${WIN_BONUS * 100} tecrübe kazanıyor.`);
    } else io.emit('announce', `Krallık savaşı berabere bitti (${s[1]} - ${s[2]} - ${s[3]}).`);
    // ödüller ve meydandan çıkış
    for (const p of Object.values(players)) {
      if (!war.joined.has(p.charId)) continue;
      const k = war.kills.get(p.charId) || 0;
      const yang = 20000 + k * 5000 + (p.empire === win ? 50000 : 0);
      p.yang += yang;
      if (p.empire === win) addItem(p, 'kutsama', 2);
      notice(p, `Savaş ödülün: ${yang.toLocaleString('tr-TR')} yang${p.empire === win ? ' ve 2 Kutsama Kağıdı' : ''} (${k} öldürme).`);
      sendInv(p); save(p);
      if (p.zone && p.zone.id === WAR_MAP) moveToZone(p, W.villageFor(0));
    }
    broadcast();
  }

  function onConnect(p, socket) {
    socket.emit('warState', state());
    socket.on('chooseEmpire', async (n) => {
      n = Number(n);
      if (p.empire || !EMPIRES[n]) return;
      p.empire = n;
      try { await db.query('UPDATE characters SET empire = $2 WHERE id = $1', [p.charId, n]); } catch (e) { console.error('krallık', e.message); }
      notice(p, `${EMPIRES[n].name} krallığına katıldın!`);
      socket.emit('empire', n);
      if (p.zone) p.zone.emit('playerEmpire', { id: p.id, empire: n });
    });
    socket.on('warJoin', () => {
      if (!war.active) { notice(p, 'Şu an krallık savaşı yok.'); return; }
      if (!p.empire) { notice(p, 'Önce bir krallık seçmelisin.'); return; }
      if (p.level < WAR_MIN_LEVEL && !p.gm) { notice(p, `Savaşa katılmak için ${WAR_MIN_LEVEL}. seviye olmalısın.`); return; }
      if (p.dead || p.trade) return;
      war.joined.add(p.charId);
      moveToZone(p, WAR_MAP, base(p));
    });
    socket.on('warGet', () => socket.emit('warState', state()));
  }
  // savaş meydanında düşman krallıktan oyuncular
  function enemies(p) {
    if (!war.active || !p.zone || !p.zone.def.war || !p.empire) return [];
    const list = [];
    for (const o of p.zone.players.values()) if (o !== p && !o.dead && o.empire && o.empire !== p.empire) list.push(o);
    return list;
  }
  const isEnemy = (p, t) => !!(war.active && p.zone && p.zone.def.war && t.zone === p.zone && p.empire && t.empire && p.empire !== t.empire);
  function onKill(p, t) {
    war.score[p.empire] = (war.score[p.empire] || 0) + 1;
    war.kills.set(p.charId, (war.kills.get(p.charId) || 0) + 1);
    if (p.zone) p.zone.emit('announce', `${p.name} (${EMPIRES[p.empire].name}), ${t.name} oyuncusunu yendi!`);
    broadcast();
  }
  function respawnPos(p) { return p.zone && p.zone.def.war ? base(p) : null; }
  const expBonus = (p) => (p.empire && winner.empire === p.empire && winner.until > Date.now() ? WIN_BONUS : 0);

  // zamanlayıcı: uyarılar, başlangıç, bitiş
  setInterval(() => {
    const now = Date.now();
    if (war.active) { if (now >= war.ends) end(); else if (Math.floor((war.ends - now) / 1000) % 15 === 0) broadcast(); return; }
    const nx = nextWar(); if (!nx) return;
    const left = nx - now, key = String(nx);
    if (left <= 10 * 60e3 && left > 9 * 60e3 && war.warned !== key + '10') { war.warned = key + '10'; io.emit('announce', 'Krallık savaşı 10 dakika sonra başlıyor! Hazırlan.'); }
    if (left <= 60e3 && war.warned !== key + '1') { war.warned = key + '1'; io.emit('announce', 'Krallık savaşı 1 dakika sonra başlıyor!'); }
    if (left <= 1000 && war.lastKey !== key) { war.lastKey = key; start(); }
  }, 1000);

  function gm(p, args) {
    if (args[0] === 'bitir') { if (war.active) { war.ends = Date.now(); end(); } return; }
    start(p.name);
  }
  return { onConnect, enemies, isEnemy, onKill, respawnPos, expBonus, gm, state, EMPIRES, WAR_MAP, war };
}

module.exports = { createRealm, EMPIRES };
