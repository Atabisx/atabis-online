// Lonca: kurma, davet, rütbeler, lonca sohbeti (%), depo, lonca yangı, lonca seviyesi.
// Lonca bilgisi veritabanında tutulur; üyelerinden biri oyuna girince belleğe yüklenir.
const R = require('./rules');

const CREATE_LEVEL = 20, CREATE_COST = 100000;
const NAME_RE = /^[a-zA-Z0-9çğıöşüÇĞİÖŞÜ ]{3,16}$/;
const MAX_LEVEL = 20;
const RANKS = ['Üye', 'Subay', 'Lider'];
const needExp = (lv) => 40000 * lv * lv;
const capOf = (g) => Math.min(40, 10 + 3 * (g.level - 1));
const storeCap = (g) => Math.min(48, 16 + 4 * (g.level - 1));
// lonca seviyesi başına üyelere +%1 tecrübe (en fazla %15)
const expBonus = (g) => (g ? Math.min(15, g.level - 1) : 0);

function createGuilds(W) {
  const { db, players, notice, sendInv, addItem, save } = W;
  const guilds = new Map();            // id -> lonca
  const loading = new Map();
  let dirty = new Set();

  const onlineOf = (g) => Object.values(players).filter((p) => p.guild === g);
  const byChar = (charId) => Object.values(players).find((p) => p.charId === charId);

  async function load(id) {
    if (guilds.has(id)) return guilds.get(id);
    if (loading.has(id)) return loading.get(id);
    const pr = (async () => {
      const r = await db.query('SELECT * FROM guilds WHERE id = $1', [id]);
      if (!r.rows[0]) return null;
      const row = r.rows[0];
      const m = await db.query('SELECT id, name, class, level, guild_rank FROM characters WHERE guild_id = $1', [id]);
      const g = { id, name: row.name, leaderId: row.leader_id, level: row.level, exp: Number(row.exp), storage: row.storage || [],
        yang: Number(row.yang), notice: row.notice || '', wins: row.wins || 0, nextUid: 1,
        members: new Map(m.rows.map((c) => [c.id, { charId: c.id, name: c.name, cls: c.class, level: c.level, rank: c.guild_rank }])) };
      g.nextUid = g.storage.reduce((a, i) => Math.max(a, i.uid + 1), 1);
      guilds.set(id, g);
      return g;
    })();
    loading.set(id, pr);
    try { return await pr; } finally { loading.delete(id); }
  }
  async function persist(g) {
    try {
      await db.query('UPDATE guilds SET level=$2, exp=$3, storage=$4, yang=$5, notice=$6, leader_id=$7, wins=$8 WHERE id=$1',
        [g.id, g.level, g.exp, JSON.stringify(g.storage), g.yang, g.notice, g.leaderId, g.wins]);
    } catch (e) { console.error('lonca kaydı', g.name, e.message); }
  }
  const setMember = (charId, gid, rank) => db.query('UPDATE characters SET guild_id=$2, guild_rank=$3 WHERE id=$1', [charId, gid, rank]).catch((e) => console.error('lonca üyeliği', e.message));

  function view(g, p) {
    const on = new Set(onlineOf(g).map((o) => o.charId));
    return { id: g.id, name: g.name, level: g.level, exp: g.exp, need: needExp(g.level), maxLevel: MAX_LEVEL, cap: capOf(g), storeCap: storeCap(g),
      yang: g.yang, notice: g.notice, wins: g.wins, bonus: expBonus(g), myRank: p.guildRank, ranks: RANKS,
      members: [...g.members.values()].map((m) => ({ ...m, online: on.has(m.charId), map: on.has(m.charId) ? ((byChar(m.charId) || {}).zone || { def: {} }).def.name : null }))
        .sort((a, b) => b.rank - a.rank || b.online - a.online || b.level - a.level),
      storage: g.storage };
  }
  function sendGuild(p) { p.socket.emit('guild', p.guild ? view(p.guild, p) : null); }
  function sendAll(g) { for (const o of onlineOf(g)) sendGuild(o); }
  function tag(p) { if (p.zone) p.zone.emit('playerGuild', { id: p.id, guild: p.guild ? p.guild.name : null }); }
  function tell(g, text) { for (const o of onlineOf(g)) o.socket.emit('chat', { name: 'Lonca', text, channel: 'guild' }); }

  // ---------- olaylar ----------
  function onConnect(p, socket) {
    if (p.guildId) {
      load(p.guildId).then((g) => {
        if (!g || !g.members.has(p.charId)) { p.guildId = null; p.guild = null; return; }
        p.guild = g; const m = g.members.get(p.charId); m.level = p.level; p.guildRank = m.rank;
        tag(p); sendGuild(p);
        for (const o of onlineOf(g)) if (o !== p) sendGuild(o);
      }).catch((e) => console.error('lonca yükleme', e.message));
    } else sendGuild(p);

    socket.on('guildGet', () => sendGuild(p));
    socket.on('guildCreate', async (d) => {
      const name = String((d && d.name) || '').trim().replace(/\s+/g, ' ');
      if (p.guild) { notice(p, 'Zaten bir loncadasın.'); return; }
      if (p.level < CREATE_LEVEL) { notice(p, `Lonca kurmak için ${CREATE_LEVEL}. seviye olmalısın.`); return; }
      if (p.yang < CREATE_COST) { notice(p, `Lonca kurmak ${CREATE_COST.toLocaleString('tr-TR')} yang tutar.`); return; }
      if (!NAME_RE.test(name)) { notice(p, 'Lonca adı 3-16 harf ya da rakam olmalı.'); return; }
      if (p._creating) return; p._creating = true;
      try {
        const r = await db.query('INSERT INTO guilds (name, leader_id) VALUES ($1, $2) RETURNING id', [name, p.charId]);
        p.yang -= CREATE_COST; sendInv(p);
        const id = r.rows[0].id;
        await setMember(p.charId, id, 2);
        p.guildId = id; p.guildRank = 2;
        const g = await load(id);
        p.guild = g; tag(p); sendGuild(p); save(p);
        W.announce(`${p.name}, "${name}" loncasını kurdu!`);
      } catch (e) {
        if (e.code === '23505') notice(p, 'Bu lonca adı alınmış.'); else { console.error('lonca kurma', e); notice(p, 'Lonca kurulamadı.'); }
      } finally { p._creating = false; }
    });
    socket.on('guildInvite', (id) => {
      const g = p.guild, o = players[String(id)];
      if (!g || p.guildRank < 1) { notice(p, 'Davet için lonca lideri ya da subay olmalısın.'); return; }
      if (!o || o === p) return;
      if (o.guild) { notice(p, `${o.name} zaten bir loncada.`); return; }
      if (g.members.size >= capOf(g)) { notice(p, `Lonca dolu (${capOf(g)} kişi). Lonca seviyesi arttıkça yer açılır.`); return; }
      o.guildAsk = { gid: g.id, from: p.name, at: Date.now() };
      o.socket.emit('guildAsk', { name: g.name, from: p.name });
      notice(p, `${o.name} oyuncusu loncaya davet edildi.`);
    });
    socket.on('guildAnswer', async (d) => {
      const ask = p.guildAsk; p.guildAsk = null;
      if (!ask || Date.now() - ask.at > 30000 || !(d && d.ok) || p.guild) return;
      const g = guilds.get(ask.gid); if (!g) return;
      if (g.members.size >= capOf(g)) { notice(p, 'Lonca dolu.'); return; }
      g.members.set(p.charId, { charId: p.charId, name: p.name, cls: p.class, level: p.level, rank: 0 });
      p.guild = g; p.guildId = g.id; p.guildRank = 0;
      await setMember(p.charId, g.id, 0);
      tag(p); tell(g, `${p.name} loncaya katıldı.`); sendAll(g);
    });
    socket.on('guildLeave', async () => {
      const g = p.guild; if (!g) return;
      if (p.guildRank === 2 && g.members.size > 1) { notice(p, 'Lider ayrılamaz. Önce liderliği devret ya da loncayı dağıt.'); return; }
      if (g.members.size <= 1) { await disband(g, p); return; }
      g.members.delete(p.charId); p.guild = null; p.guildId = null; p.guildRank = 0;
      await setMember(p.charId, null, 0);
      tag(p); sendGuild(p); tell(g, `${p.name} loncadan ayrıldı.`); sendAll(g);
    });
    socket.on('guildKick', async (charId) => {
      const g = p.guild; charId = Number(charId);
      const m = g && g.members.get(charId);
      if (!m || charId === p.charId || p.guildRank < 1 || m.rank >= p.guildRank) return;
      g.members.delete(charId);
      await setMember(charId, null, 0);
      const o = byChar(charId);
      if (o) { o.guild = null; o.guildId = null; o.guildRank = 0; tag(o); sendGuild(o); notice(o, `${g.name} loncasından çıkarıldın.`); }
      tell(g, `${m.name} loncadan çıkarıldı.`); sendAll(g);
    });
    socket.on('guildRank', async (d) => {
      const g = p.guild; if (!g || p.guildRank !== 2 || !d) return;
      const charId = Number(d.charId), m = g.members.get(charId);
      if (!m || charId === p.charId) return;
      if (d.rank === 'lead') {
        // liderliği devret
        m.rank = 2; const me = g.members.get(p.charId); me.rank = 1; p.guildRank = 1; g.leaderId = charId;
        const o = byChar(charId); if (o) o.guildRank = 2;
        await setMember(charId, g.id, 2); await setMember(p.charId, g.id, 1); persist(g);
        tell(g, `${m.name} artık lonca lideri.`);
      } else {
        m.rank = m.rank === 1 ? 0 : 1;
        const o = byChar(charId); if (o) o.guildRank = m.rank;
        await setMember(charId, g.id, m.rank);
        tell(g, `${m.name} ${m.rank ? 'subay oldu' : 'artık üye'}.`);
      }
      sendAll(g);
    });
    socket.on('guildDisband', async () => { if (p.guild && p.guildRank === 2) await disband(p.guild, p); });
    socket.on('guildNotice', (t) => {
      const g = p.guild; if (!g || p.guildRank < 1) return;
      g.notice = String(t || '').replace(/[<>]/g, '').slice(0, 140); dirty.add(g); sendAll(g);
    });
    // depo: herkes koyabilir, subay ve lider alabilir
    socket.on('guildDeposit', (uid) => {
      const g = p.guild; if (!g) return;
      const i = p.inventory.findIndex((x) => x.uid === Number(uid)); if (i < 0) return;
      if (g.storage.length >= storeCap(g)) { notice(p, 'Lonca deposu dolu.'); return; }
      const [it] = p.inventory.splice(i, 1);
      g.storage.push({ ...it, uid: g.nextUid++, by: p.name });
      dirty.add(g); sendInv(p); save(p); sendAll(g);
      tell(g, `${p.name} depoya koydu: ${(R.ITEMS[it.key] || {}).name || it.key}${it.n > 1 ? ' x' + it.n : ''}`);
    });
    socket.on('guildWithdraw', (uid) => {
      const g = p.guild; if (!g) return;
      if (p.guildRank < 1) { notice(p, 'Depodan sadece lider ve subaylar alabilir.'); return; }
      const i = g.storage.findIndex((x) => x.uid === Number(uid)); if (i < 0) return;
      const it = g.storage[i], def = R.ITEMS[it.key];
      if (def && def.stack) { if (!addItem(p, it.key, it.n || 1)) { notice(p, 'Çantan dolu.'); return; } }
      else { if (p.inventory.length >= R.INV_SIZE) { notice(p, 'Çantan dolu.'); return; } const { by, ...rest } = it; p.inventory.push({ ...rest, uid: p.nextUid++ }); }
      g.storage.splice(i, 1);
      dirty.add(g); sendInv(p); save(p); sendAll(g);
      tell(g, `${p.name} depodan aldı: ${(def || {}).name || it.key}${it.n > 1 ? ' x' + it.n : ''}`);
    });
    socket.on('guildYang', (d) => {
      const g = p.guild; if (!g || !d) return;
      const n = Math.floor(Number(d.n) || 0); if (n <= 0) return;
      if (d.dir === 'in') { if (n > p.yang) return; p.yang -= n; g.yang += n; tell(g, `${p.name} lonca kasasına ${n.toLocaleString('tr-TR')} yang koydu.`); }
      else { if (p.guildRank !== 2) { notice(p, 'Kasadan sadece lider alabilir.'); return; } if (n > g.yang) return; g.yang -= n; p.yang += n; }
      dirty.add(g); sendInv(p); save(p); sendAll(g);
    });
  }
  async function disband(g, by) {
    for (const o of onlineOf(g)) { o.guild = null; o.guildId = null; o.guildRank = 0; tag(o); sendGuild(o); notice(o, `${g.name} loncası dağıtıldı.`); }
    guilds.delete(g.id);
    try {
      await db.query('UPDATE characters SET guild_id = NULL, guild_rank = 0 WHERE guild_id = $1', [g.id]);
      await db.query('DELETE FROM guilds WHERE id = $1', [g.id]);
    } catch (e) { console.error('lonca dağıtma', e.message); }
    // depodaki eşyalar dağıtan lidere döner (sığmayanlar kaybolmasın diye yere bırakılır)
    if (by) {
      for (const it of g.storage) {
        const { by: _, ...rest } = it;
        const def = R.ITEMS[it.key];
        const ok = def && def.stack ? addItem(by, it.key, it.n || 1) : by.inventory.length < R.INV_SIZE && by.inventory.push({ ...rest, uid: by.nextUid++ });
        if (!ok && by.zone) by.zone.makeDrop(by.x, by.z, by.id, { key: it.key, n: it.n || 1 }, 0, 600000);
      }
      by.yang += g.yang; sendInv(by); save(by);
    }
  }
  function onDisconnect(p) { if (p.guild) { const g = p.guild; setTimeout(() => sendAll(g), 50); } }

  // canavar tecrübesinin %5'i kadar lonca tecrübesi (üyeden düşülmez)
  function addExp(p, amount) {
    const g = p.guild; if (!g || g.level >= MAX_LEVEL) return;
    g.exp += Math.max(1, Math.round(amount * 0.05));
    let up = false;
    while (g.level < MAX_LEVEL && g.exp >= needExp(g.level)) { g.exp -= needExp(g.level); g.level++; up = true; }
    dirty.add(g);
    if (up) { tell(g, `Lonca ${g.level}. seviyeye ulaştı! Üyelere +%${expBonus(g)} tecrübe, ${capOf(g)} kişilik yer.`); W.announce(`${g.name} loncası ${g.level}. seviyeye ulaştı!`); sendAll(g); }
  }
  function chat(p, t) {
    if (t[0] !== '%') return false;
    const text = t.slice(1).trim(); if (!text) return true;
    if (!p.guild) { notice(p, 'Bir loncada değilsin.'); return true; }
    for (const o of onlineOf(p.guild)) o.socket.emit('chat', { name: p.name, text, channel: 'guild' });
    return true;
  }
  function onLevel(p) { if (p.guild) { const m = p.guild.members.get(p.charId); if (m) m.level = p.level; } }
  // 15 saniyede bir değişen loncaları kaydet
  setInterval(() => { const d = dirty; dirty = new Set(); for (const g of d) persist(g); }, 15000);
  async function saveAll() { await Promise.all([...guilds.values()].map(persist)); }

  return { onConnect, onDisconnect, addExp, chat, onLevel, expBonus: (p) => expBonus(p.guild), saveAll, guilds, load, sendAll };
}

module.exports = { createGuilds };
