// Dünya boss'u: Kadim Lav Ejderi. Her Pazar 21:00'de (İstanbul) Ejder Yuvası'nda uyanır, 30 dakika kalır.
// Bütün sunucu birlikte vurur; canı katılan her oyuncunun gücüne göre büyür.
// Saldırıları oyuncunun canının yüzdesi kadar vurur (düşük seviyeler de katılabilsin), büyük saldırılar
// yere kırmızı daireyle önceden haber verilir: dışarı kaçan kurtulur.
// Bitince herkes hasar payına göre ödül alır; ilk 3, ilk 10 ve son vuruş ayrıca ödüllenir.
const R = require('./rules');

const WB_MAP = R.MAPS.findIndex((m) => m.worldBoss);
const WB_KEY = 'dunyaboss';
const MIN_LEVEL = 10, MINUTES = 30;
const SCHEDULE = [{ day: 0, hour: 21 }];                 // Pazar
const ist = (ms = Date.now()) => new Date(ms + 3 * 3600e3);
const BASE_HP = 300000;

function createWorldBoss(W) {
  const { db, io, players, zones, notice, moveToZone, sendInv, addItem, save, giveExp, villageFor } = W;
  const wb = { active: false, ends: 0, mob: null, names: new Map(), joined: new Set(), lastHit: null, lastKey: null, warned: null, nextSkill: 0, skillN: 0 };
  let last = null;      // son sonuç (kalıcı)

  db.query('CREATE TABLE IF NOT EXISTS world_state (key TEXT PRIMARY KEY, value JSONB NOT NULL)')
    .then(() => db.query("SELECT value FROM world_state WHERE key = 'worldboss'"))
    .then((r) => { if (r.rows[0]) last = r.rows[0].value; })
    .catch((e) => console.error('dünya boss durumu', e.message));
  const persist = () => db.query("INSERT INTO world_state (key, value) VALUES ('worldboss', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value", [JSON.stringify(last)])
    .catch((e) => console.error('dünya boss kaydı', e.message));

  const zone = () => zones[WB_MAP];
  function nextAt() {
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
  const m = () => (wb.mob && zone() && zone().mobs.has(wb.mob.id) ? wb.mob : null);
  const state = () => {
    const b = m();
    return { active: wb.active, ends: wb.ends, next: nextAt(), map: WB_MAP, minLevel: MIN_LEVEL, hp: b ? b.hp : 0, max: b ? b.max : 0,
      count: wb.joined.size, name: R.MOBS[WB_KEY].name, last };
  };
  const broadcast = () => io.emit('wbState', state());

  // ---------- sıralama ----------
  function ranking() {
    const b = wb.mob; if (!b) return [];
    const by = new Map();      // karakter -> hasar (yeniden bağlananlar birleşsin)
    for (const [sid, dmg] of b.dmgBy) {
      const info = wb.names.get(sid); if (!info) continue;
      const r = by.get(info.charId) || { charId: info.charId, name: info.name, cls: info.cls, dmg: 0 };
      r.dmg += dmg; by.set(info.charId, r);
    }
    return [...by.values()].sort((a, b2) => b2.dmg - a.dmg);
  }
  function sendRank() {
    const z = zone(); const b = m(); if (!z || !b) return;
    const list = ranking(), total = list.reduce((a, r) => a + r.dmg, 0) || 1;
    const top = list.slice(0, 5).map((r) => ({ name: r.name, cls: r.cls, dmg: r.dmg, pct: +(100 * r.dmg / total).toFixed(1) }));
    for (const p of z.players.values()) {
      const i = list.findIndex((r) => r.charId === p.charId);
      p.socket.emit('wbRank', { hp: b.hp, max: b.max, ends: wb.ends, n: list.length, top,
        me: i >= 0 ? { rank: i + 1, dmg: list[i].dmg, pct: +(100 * list[i].dmg / total).toFixed(1) } : null });
    }
  }

  // ---------- başlangıç / bitiş ----------
  function start(by) {
    if (wb.active || WB_MAP < 0 || !zone()) return;
    const z = zone();
    for (const old of [...z.mobs.values()]) z.mobs.delete(old.id);
    wb.active = true; wb.ends = Date.now() + MINUTES * 60e3; wb.names = new Map(); wb.joined = new Set(); wb.lastHit = null; wb.skillN = 0;
    wb.nextSkill = Date.now() + 9000;
    const b = z.spawnMob(WB_KEY, [25, 32]);
    b.max = b.hp = BASE_HP; b.event = true; b.ry = Math.PI;      // girişe (güneye) bakar
    z.emit('mobHeal', { id: b.id, hp: b.hp, max: b.max });
    wb.mob = b;
    io.emit('announce', `${R.MOBS[WB_KEY].name} UYANDI! ${MINUTES} dakika içinde yenilmeli. Menü › Etkinlikler'den Ejder Yuvası'na git (Sv. ${MIN_LEVEL}+).`);
    io.emit('wbStart', state());
    console.log('Dünya boss\'u başladı', by || 'zamanlayıcı');
    broadcast();
  }
  function join(p) {
    if (!wb.active || !m()) { notice(p, 'Şu an dünya boss\'u yok.'); return; }
    if (p.level < MIN_LEVEL && !p.gm) { notice(p, `Katılmak için ${MIN_LEVEL}. seviye olmalısın.`); return; }
    if (p.dead || p.trade || p.duel) return;
    if (p.zone && (p.zone.def.dungeon || p.zone.def.war)) { notice(p, 'Önce bulunduğun yerden çık.'); return; }
    if (!wb.joined.has(p.charId)) {
      // her yeni katılan, boss'un canını kendi gücü kadar büyütür: tek başına yaklaşık 7 dakikalık vuruşu
      const b = m();
      let hit = 0; for (let i = 0; i < 6; i++) hit += R.playerDamage(p, b.d.def, i % 3).dmg; hit /= 6;
      const add = Math.round(hit * (1000 / Math.max(250, R.attackCooldown(p))) * 1.5 * 420);
      b.max += add; b.hp += add;
      zone().emit('mobHeal', { id: b.id, hp: b.hp, max: b.max });
      wb.joined.add(p.charId);
    }
    moveToZone(p, WB_MAP);
    setTimeout(() => { sendRank(); p.socket.emit('wbState', state()); }, 300);
  }
  function reward(p, row, rank, share, killed) {
    const items = [];
    const give = (key, n = 1) => { if (R.ITEMS[key] && addItem(p, key, n)) items.push([key, n]); };
    let yang = Math.round((killed ? 60000 : 25000) + (killed ? 2500000 : 800000) * share);
    if (killed) {
      if (rank === 1) { yang += 1500000; give('pet_sandik', 2); give('efsun_degis', 5); if (Math.random() < 0.25) give('kanat_ejder', 1); }
      else if (rank <= 3) { yang += 700000; give('pet_sandik', 1); give('efsun_degis', 3); }
      else if (rank <= 10) { yang += 250000; give('efsun_degis', 2); give('efsun', 2); }
      give('kutsama', 1); give('efsun', 1);
      if (wb.lastHit === p.charId) { give('pet_sandik', 1); }
      give(R.LEAVES[Math.floor(Math.random() * R.LEAVES.length)], 3);
    } else give('kutsama', 1);
    p.yang += yang;
    const exp = Math.round(R.expForLevel(p.level) * (killed ? 0.08 + Math.min(0.25, share * 2) : 0.03));
    if (exp > 0) giveExp(p, exp);
    sendInv(p); save(p);
    p.socket.emit('wbEnd', { killed, rank, share: +(share * 100).toFixed(1), dmg: row.dmg, yang, exp, items, lastHit: wb.lastHit === p.charId, top: last && last.top });
  }
  function end(killed) {
    if (!wb.active) return;
    wb.active = false;
    const z = zone(), b = wb.mob;
    const list = ranking(), total = list.reduce((a, r) => a + r.dmg, 0) || 1;
    const lastHitter = list.find((r) => r.charId === wb.lastHit);
    last = { at: Date.now(), killed, top: list.slice(0, 10).map((r) => ({ name: r.name, cls: r.cls, dmg: r.dmg, pct: +(100 * r.dmg / total).toFixed(1) })),
      lastHit: lastHitter ? lastHitter.name : null, count: list.length };
    persist();
    if (b && z && z.mobs.has(b.id)) { z.mobs.delete(b.id); z.emit('mobDie', { id: b.id, by: null, name: '', mobName: b.d.name, boss: true, flee: true }); }
    wb.mob = null;
    const t3 = last.top.slice(0, 3).map((r, i) => `${i + 1}. ${r.name}`).join(', ');
    io.emit('announce', killed ? `${R.MOBS[WB_KEY].name} YENİLDİ! ${list.length} kahraman katıldı. En çok hasar: ${t3 || '-'}${last.lastHit ? `. Son vuruş: ${last.lastHit}` : ''}.`
      : `${R.MOBS[WB_KEY].name} yenilemedi ve uykusuna döndü. Haftaya tekrar!`);
    for (const p of Object.values(players)) {
      const i = list.findIndex((r) => r.charId === p.charId);
      if (i < 0) continue;
      reward(p, list[i], i + 1, list[i].dmg / total, killed);
    }
    // 20 saniye sonra yuvadakiler köye döner
    setTimeout(() => { const zz = zone(); if (!zz || wb.active) return; for (const p of [...zz.players.values()]) moveToZone(p, villageFor(0)); }, 20000);
    broadcast();
  }

  // ---------- boss'un saldırıları ----------
  const pctHit = (p, pct) => {
    // savunma biraz korur (en fazla %35), ama düşük seviyeler de tek vuruşta ölmesin diye can yüzdesi
    const red = Math.min(0.35, R.defense(p) / (R.defense(p) + 900));
    return Math.max(1, Math.round(p.maxHp * pct * (1 - red) * (0.9 + Math.random() * 0.2)));
  };
  function hurt(p, dmg) {
    const dodge = R.totals(p).dodge;
    if (dodge && Math.random() * 100 < dodge * 0.5) { zone().emit('mobAttack', { id: wb.mob.id, target: p.id, dmg: 0, miss: true }); return; }
    W.hooks.damagePlayer(p, dmg, wb.mob);
  }
  function tick() {
    const b = m(), z = zone(); if (!b || !z) return;
    const now = Date.now();
    if (b.stunUntil && now < b.stunUntil) return;
    const alive = [...z.players.values()].filter((p) => !p.dead);
    if (!alive.length) return;
    // en çok hasar verene (yakındaysa) döner ve vurur
    const near = alive.filter((p) => Math.hypot(p.x - b.x, p.z - b.z) < b.d.range + 3);
    if (near.length && now - b.lastAttack >= b.d.cd) {
      b.lastAttack = now;
      const t = near.sort((a, c) => (b.dmgBy.get(c.id) || 0) - (b.dmgBy.get(a.id) || 0))[0];
      b.ry = Math.atan2(t.x - b.x, t.z - b.z);
      const dmg = pctHit(t, 0.09);
      z.emit('mobAttack', { id: b.id, target: t.id, dmg });
      hurt(t, dmg);
      // önündeki herkese de değer (pençe savuruşu)
      for (const o of near) if (o !== t && Math.hypot(o.x - t.x, o.z - t.z) < 3) hurt(o, pctHit(o, 0.05));
    }
    // büyük saldırılar: önce yere uyarı dairesi, 1,6 sn sonra hasar
    if (now >= wb.nextSkill) {
      const enraged = b.hp < b.max * 0.3;
      wb.nextSkill = now + (enraged ? 6500 : 9000);
      const kind = wb.skillN++ % 3 === 2 ? 'rain' : 'slam';
      const delay = 1600;
      if (kind === 'slam') {
        const r = 10;
        z.emit('wbCast', { kind, x: b.x, z: b.z, r, delay });
        setTimeout(() => { if (!m()) return; for (const p of z.players.values()) if (!p.dead && Math.hypot(p.x - b.x, p.z - b.z) < r + 0.5) hurt(p, pctHit(p, 0.32)); }, delay);
      } else {
        // ateş yağmuru: rastgele oyuncuların ayağına ve çevresine
        const spots = [];
        const pool = alive.slice().sort(() => Math.random() - 0.5).slice(0, 6);
        for (const p of pool) spots.push([+(p.x + (Math.random() - 0.5) * 2).toFixed(1), +(p.z + (Math.random() - 0.5) * 2).toFixed(1)]);
        while (spots.length < (enraged ? 10 : 7)) spots.push([+(b.x + (Math.random() - 0.5) * 36).toFixed(1), +(b.z - 4 - Math.random() * 22).toFixed(1)]);
        const r = 3.4;
        z.emit('wbCast', { kind, spots, r, delay });
        setTimeout(() => { if (!m()) return; for (const p of z.players.values()) if (!p.dead && spots.some(([x, zz]) => Math.hypot(p.x - x, p.z - zz) < r + 0.4)) hurt(p, pctHit(p, 0.2)); }, delay);
      }
    }
  }

  // zone'dan gelen olaylar
  function onDamage(p) { if (wb.active) wb.names.set(p.id, { charId: p.charId, name: p.name, cls: p.class }); }
  if (zone()) {
    const z = zone();
    z.noRespawn = true;
    const orig = z.damageMob.bind(z);
    z.damageMob = (mob, p, dmg, crit) => {
      if (mob === wb.mob && p) { onDamage(p); if (mob.hp - dmg <= 0) wb.lastHit = p.charId; }
      orig(mob, p, dmg, crit);
    };
    z.onKill = (mob) => { if (mob === wb.mob) { wb.mob = mob; setTimeout(() => end(true), 50); } };
  }

  // zamanlayıcı
  let rankT = 0;
  setInterval(() => {
    const now = Date.now();
    if (wb.active) {
      tick();
      if (now - rankT > 1000) { rankT = now; sendRank(); }
      if (now >= wb.ends) end(false);
      return;
    }
    const nx = nextAt(); if (!nx) return;
    const left = nx - now, key = String(nx);
    if (left <= 10 * 60e3 && left > 9 * 60e3 && wb.warned !== key + '10') { wb.warned = key + '10'; io.emit('announce', `${R.MOBS[WB_KEY].name} 10 dakika sonra uyanıyor! İksirlerini hazırla.`); }
    if (left <= 60e3 && wb.warned !== key + '1') { wb.warned = key + '1'; io.emit('announce', `${R.MOBS[WB_KEY].name} 1 dakika sonra uyanıyor!`); }
    if (left <= 1000 && wb.lastKey !== key) { wb.lastKey = key; start(); }
  }, 250);

  return {
    onConnect(p, socket) {
      socket.emit('wbState', state());
      socket.on('wbJoin', () => join(p));
      socket.on('wbLeave', () => { if (p.zone && p.zone.id === WB_MAP && !p.dead) moveToZone(p, villageFor(0)); });
      socket.on('wbGet', () => socket.emit('wbState', state()));
    },
    respawnPos(p) { return p.zone && p.zone.id === WB_MAP ? R.MAPS[WB_MAP].spawn : null; },
    gm(p, args) { if (args[0] === 'bitir') { if (wb.active) end(!!(args[1] === 'yenildi')); return; } start(p.name); if (args[0] !== 'buradan') join(p); },
    state, WB_MAP, wb,
  };
}

module.exports = { createWorldBoss };
