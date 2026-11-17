// Oyun dünyası: oyuncular, metin taşları, ganimet, savaş. Sunucu otoriterdir.
const db = require('../db');
const { accountFromToken } = require('../auth');
const ITEMS = require('../../shared/items.json');
const CLASSES = require('../../shared/classes.json');

const S = 2.5;                         // harita ölçeği
const WORLD_MIN = -6 * S, WORLD_MAX = 26 * S;
const SPAWN = { x: 10 * S, z: 11.5 * S };
const INV_SIZE = 24;
const MELEE_RANGE = 4.4;
const BASE_SPEED = 6;                  // m/sn (istemciyle aynı)

const STONE_SPOTS = [
  [16.2, 3.2], [22, 9], [21, 16], [3, 22], [-2, 4], [15, 21], [24, 2], [-3, 15],
].map(([x, z]) => [x * S, z * S]);
const STONE_TYPES = [
  { name: 'Ölüm Metini', lv: 15, hp: 1500, color: 'red' },
  { name: 'Gölge Metini', lv: 20, hp: 2400, color: 'purple' },
];
const DROP_TABLES = {
  red: [['w_iron', 14], ['d_iron', 8], ['b_horn', 8], ['s_moon', 8], ['a_leather', 20], ['h_iron', 15], ['a_iron', 10],
        ['w_steel', 5], ['a_crimson', 4], ['h_crimson', 4], ['w_dragon', 1], ['a_gold', 0.7], ['h_gold', 0.7]],
  purple: [['w_steel', 10], ['d_venom', 6], ['b_storm', 6], ['s_spirit', 6], ['a_iron', 15], ['h_iron', 10], ['w_shadow', 8],
           ['a_crimson', 8], ['h_crimson', 8], ['w_dragon', 3], ['a_gold', 2], ['h_gold', 2]],
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const expForLevel = (lv) => 100 + lv * 60;

function rollTable(table) {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of table) { r -= w; if (r <= 0) return key; }
  return table[0][0];
}

function createWorld(io) {
  const players = {};   // socket.id -> oyuncu
  const stones = {};
  const drops = {};
  let nextStoneId = 1, nextDropId = 1;

  // ---------- yardımcılar ----------
  const cls = (p) => CLASSES[p.class] || CLASSES.savasci;
  const atkOf = (p) => { const w = p.equip.weapon && ITEMS[p.equip.weapon.key]; return w ? w.atk : 0; };
  function defOf(p) {
    let d = cls(p).def || 0;
    for (const s of ['armor', 'helmet']) { const it = p.equip[s] && ITEMS[p.equip[s].key]; if (it) d += it.def || 0; }
    return d;
  }
  function looks(p) {
    return { weapon: p.equip.weapon ? p.equip.weapon.key : null, armor: p.equip.armor ? p.equip.armor.key : null,
             helmet: p.equip.helmet ? p.equip.helmet.key : null };
  }
  const publicPlayer = (p) => ({ id: p.id, name: p.name, cls: p.class, x: p.x, z: p.z, ry: p.ry, level: p.level, look: looks(p) });
  function sendInv(p) {
    p.socket.emit('inv', { inventory: p.inventory, equip: p.equip, yang: p.yang, atk: atkOf(p), def: defOf(p) });
  }
  function canUse(p, def) {
    return !def.classes || def.classes.includes(p.class);
  }

  async function save(p) {
    try {
      await db.query(
        `UPDATE characters SET level=$2, exp=$3, yang=$4, kills=$5, pos_x=$6, pos_z=$7,
         inventory=$8, equip=$9, next_uid=$10, last_played=now() WHERE id=$1`,
        [p.charId, p.level, p.exp, p.yang, p.kills, p.x, p.z, JSON.stringify(p.inventory), JSON.stringify(p.equip), p.nextUid]);
      p.dirty = false;
    } catch (e) { console.error('Kayıt hatası', p.name, e.message); }
  }

  // ---------- metin taşları ----------
  function spawnStone(spotIndex) {
    const t = STONE_TYPES[Math.random() < 0.7 ? 0 : 1];
    const [x, z] = STONE_SPOTS[spotIndex];
    const id = nextStoneId++;
    stones[id] = { id, spot: spotIndex, x, z, name: t.name, lv: t.lv, hp: t.hp, max: t.hp, color: t.color };
    io.emit('stoneSpawn', stones[id]);
  }
  for (let i = 0; i < 5; i++) spawnStone(i);

  // ---------- ganimet ----------
  const publicDrop = (d) => ({ id: d.id, x: d.x, z: d.z, owner: d.owner, key: d.item ? d.item.key : null, yang: d.yang });
  function makeDrop(x, z, owner, item, yang, ownerMs = 15000) {
    const id = nextDropId++;
    const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 1.5;
    drops[id] = { id, x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, owner, ownerUntil: Date.now() + ownerMs,
                  expires: Date.now() + 90000, item: item || null, yang: yang || 0 };
    io.emit('drop', publicDrop(drops[id]));
  }

  // ---------- bağlantı ----------
  io.use(async (socket, next) => {
    try {
      const { token, characterId } = socket.handshake.auth || {};
      const account = await accountFromToken(token);
      if (!account) return next(new Error('auth'));
      const r = await db.query('SELECT * FROM characters WHERE id = $1 AND account_id = $2', [Number(characterId), account.id]);
      if (!r.rows[0]) return next(new Error('character'));
      socket.data.account = account;
      socket.data.row = r.rows[0];
      next();
    } catch (e) { console.error('bağlantı', e); next(new Error('server')); }
  });

  io.on('connection', (socket) => {
    const row = socket.data.row;
    // aynı karakter başka yerde açıksa eskisini at ve son durumunu devral
    let prev = null;
    for (const o of Object.values(players)) {
      if (o.charId === row.id) {
        prev = o;
        o.replaced = true;
        delete players[o.id];
        io.emit('playerLeave', { id: o.id });
        o.socket.emit('kicked', 'Bu karakterle başka bir yerden giriş yapıldı.');
        o.socket.disconnect(true);
      }
    }
    const p = {
      id: socket.id, socket, charId: row.id, name: row.name, class: row.class,
      x: row.pos_x ?? SPAWN.x + (Math.random() - 0.5) * 4, z: row.pos_z ?? SPAWN.z + (Math.random() - 0.5) * 4,
      ry: 0, moving: false, lastAttack: 0, lastMove: Date.now(), combo: 0,
      level: row.level, exp: row.exp, yang: Number(row.yang), kills: row.kills,
      inventory: row.inventory || [], equip: row.equip || {}, nextUid: row.next_uid, dirty: false,
    };
    if (prev) for (const k of ['x', 'z', 'level', 'exp', 'yang', 'kills', 'inventory', 'equip', 'nextUid']) p[k] = prev[k];
    players[socket.id] = p;

    const others = {};
    for (const o of Object.values(players)) others[o.id] = publicPlayer(o);
    socket.emit('welcome', {
      id: socket.id, players: others, stones, drops: Object.values(drops).map(publicDrop),
      me: { level: p.level, exp: p.exp, need: expForLevel(p.level), cls: p.class },
    });
    sendInv(p);
    socket.broadcast.emit('playerJoin', publicPlayer(p));

    socket.on('move', (m) => {
      if (!m) return;
      const nx = Number(m.x), nz = Number(m.z);
      if (!isFinite(nx) || !isFinite(nz)) return;
      const now = Date.now();
      const dt = Math.max(0.05, (now - p.lastMove) / 1000);
      const dist = Math.hypot(nx - p.x, nz - p.z);
      const maxDist = BASE_SPEED * (cls(p).speed || 1) * 1.4 * dt + 1;   // hız hilesi koruması
      if (dist > maxDist) {
        const k = maxDist / dist;
        p.x += (nx - p.x) * k; p.z += (nz - p.z) * k;
        socket.emit('correct', { x: p.x, z: p.z });
      } else { p.x = nx; p.z = nz; }
      p.x = clamp(p.x, WORLD_MIN, WORLD_MAX); p.z = clamp(p.z, WORLD_MIN, WORLD_MAX);
      p.ry = Number(m.ry) || 0;
      p.moving = !!m.moving;
      p.lastMove = now;
    });

    socket.on('attack', () => {
      const now = Date.now();
      const c = cls(p);
      const cooldown = p.class === 'ninja' ? 400 : 480;
      if (now - p.lastAttack < cooldown) return;
      p.combo = now - p.lastAttack < 1200 ? (p.combo + 1) % 3 : 0;
      p.lastAttack = now;
      const range = c.range || MELEE_RANGE;
      let best = null, bestD = range;
      for (const s of Object.values(stones)) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bestD) { best = s; bestD = d; }
      }
      io.emit('swing', { id: p.id, combo: p.combo, target: best ? best.id : null });
      if (!best) return;
      const crit = Math.random() < (c.crit || 0.12);
      const base = 40 + p.level * 15 + atkOf(p) * 4 + Math.random() * 50;
      const dmg = Math.round(base * (c.atk || 1) * (crit ? 2 : 1) * (p.combo === 2 ? 1.3 : 1));
      best.hp = Math.max(0, best.hp - dmg);
      io.emit('hit', { stoneId: best.id, dmg, crit, hp: best.hp, by: p.id, ranged: !!c.range });
      if (best.hp > 0) return;

      delete stones[best.id];
      p.kills++;
      p.exp += 80 + best.lv * 12;
      let up = false;
      while (p.exp >= expForLevel(p.level) && p.level < 120) { p.exp -= expForLevel(p.level); p.level++; up = true; }
      io.emit('stoneDown', { stoneId: best.id, by: p.id, name: p.name, stoneName: best.name });
      io.emit('playerStats', { id: p.id, level: p.level, exp: p.exp, need: expForLevel(p.level), up });
      const table = DROP_TABLES[best.color] || DROP_TABLES.red;
      if (Math.random() < 0.85) makeDrop(best.x, best.z, p.id, { uid: p.nextUid++, key: rollTable(table) });
      if (Math.random() < 0.35) makeDrop(best.x, best.z, p.id, { uid: p.nextUid++, key: rollTable(table) });
      makeDrop(best.x, best.z, p.id, null, Math.round((100 + Math.random() * 300) * best.lv / 15));
      save(p);
      const spot = best.spot;
      setTimeout(() => {
        const used = new Set(Object.values(stones).map((s) => s.spot));
        const free = STONE_SPOTS.map((_, i) => i).filter((i) => !used.has(i));
        spawnStone(free.length ? free[Math.floor(Math.random() * free.length)] : spot);
      }, 12000);
    });

    socket.on('pickup', (dropId) => {
      const d = drops[Number(dropId)];
      if (!d || Math.hypot(d.x - p.x, d.z - p.z) > 3) return;
      if (d.owner !== p.id && Date.now() < d.ownerUntil) { socket.emit('notice', 'Bu ganimet başkasına ait. Biraz bekle.'); return; }
      if (d.item && p.inventory.length >= INV_SIZE) { socket.emit('notice', 'Envanterin dolu!'); return; }
      delete drops[d.id];
      io.emit('dropGone', { id: d.id });
      if (d.item) {
        if (d.owner !== p.id) d.item.uid = p.nextUid++;   // başkasından gelen eşyaya yeni numara
        p.inventory.push(d.item);
        socket.emit('notice', `${ITEMS[d.item.key].name} aldın!`);
      } else {
        p.yang += d.yang;
        socket.emit('notice', `${d.yang} Yang aldın.`);
      }
      p.dirty = true;
      sendInv(p);
    });

    socket.on('equip', (uid) => {
      const idx = p.inventory.findIndex((i) => i.uid === Number(uid));
      if (idx < 0) return;
      const item = p.inventory[idx];
      const def = ITEMS[item.key];
      if (!def) return;
      if (!canUse(p, def)) { socket.emit('notice', `${def.name} senin sınıfına uygun değil.`); return; }
      const old = p.equip[def.slot];
      p.inventory.splice(idx, 1);
      if (old) p.inventory.push(old);
      p.equip[def.slot] = item;
      p.dirty = true;
      sendInv(p);
      io.emit('look', { id: p.id, look: looks(p) });
    });

    socket.on('unequip', (slot) => {
      if (!['weapon', 'armor', 'helmet'].includes(slot) || !p.equip[slot]) return;
      if (p.inventory.length >= INV_SIZE) { socket.emit('notice', 'Envanterin dolu!'); return; }
      p.inventory.push(p.equip[slot]);
      p.equip[slot] = null;
      p.dirty = true;
      sendInv(p);
      io.emit('look', { id: p.id, look: looks(p) });
    });

    socket.on('dropItem', (uid) => {
      const idx = p.inventory.findIndex((i) => i.uid === Number(uid));
      if (idx < 0) return;
      const [item] = p.inventory.splice(idx, 1);
      makeDrop(p.x, p.z, p.id, item, 0, 0);
      p.dirty = true;
      sendInv(p);
    });

    socket.on('chat', (text) => {
      const t = String(text || '').replace(/[<>&"'\\]/g, '').trim().slice(0, 80);
      if (t) io.emit('chat', { name: p.name, text: t });
    });

    socket.on('disconnect', () => {
      if (p.replaced || players[socket.id] !== p) return;
      delete players[socket.id];
      save(p);
      io.emit('playerLeave', { id: socket.id });
    });
  });

  // saniyede 10 kez konum yayını
  setInterval(() => {
    const list = Object.values(players).map((p) => ({
      id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(2), moving: p.moving,
    }));
    io.emit('state', list);
  }, 100);
  // eski ganimetleri temizle, değişenleri kaydet
  setInterval(() => {
    const now = Date.now();
    for (const d of Object.values(drops)) if (now > d.expires) { delete drops[d.id]; io.emit('dropGone', { id: d.id }); }
  }, 5000);
  setInterval(() => { for (const p of Object.values(players)) save(p); }, 20000);   // konum dahil düzenli kayıt

  return {
    async saveAll() { await Promise.all(Object.values(players).map(save)); },
    online: () => Object.keys(players).length,
  };
}

module.exports = { createWorld };
