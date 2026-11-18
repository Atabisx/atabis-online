// Oyun dünyası: bağlantılar, oyuncu komutları, envanter, dükkân, haritalar arası geçiş.
const db = require('../db');
const { accountFromToken } = require('../auth');
const R = require('./rules');
const { Zone } = require('./zone');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const VILLAGES = R.MAPS.filter((m) => m.village).map((m) => m.id);

function createWorld(io) {
  const players = {};                 // socket.id -> oyuncu
  const zones = [];

  // ---------- oyuncu yardımcıları ----------
  function looks(p) {
    const l = {};
    for (const s of ['weapon', 'armor', 'helmet']) l[s] = p.equip[s] ? p.equip[s].key : null;
    return l;
  }
  const publicPlayer = (p) => ({ id: p.id, name: p.name, cls: p.class, x: p.x, z: p.z, ry: p.ry, level: p.level,
    look: looks(p), hp: p.hp, maxHp: p.maxHp, dead: !!p.dead });
  function recalc(p) {
    p.maxHp = R.maxHp(p);
    p.hp = Math.min(p.hp, p.maxHp);
  }
  function sendInv(p) {
    p.socket.emit('inv', { inventory: p.inventory, equip: p.equip, yang: p.yang,
      atk: R.attackPower(p), def: R.defense(p), maxHp: p.maxHp });
  }
  function sendHp(p) {
    p.socket.emit('hp', { hp: p.hp, max: p.maxHp });
    if (p.zone) p.zone.emit('playerHp', { id: p.id, hp: p.hp, max: p.maxHp });
  }
  function sendStats(p, up) {
    const data = { id: p.id, level: p.level, exp: p.exp, need: R.expForLevel(p.level), up };
    p.socket.emit('stats', data);
    if (up && p.zone) p.zone.emit('playerLevel', { id: p.id, level: p.level });
  }
  const notice = (p, text) => p.socket.emit('notice', text);

  function addItem(p, key, n = 1) {
    const def = R.ITEMS[key];
    if (!def) return false;
    if (def.stack) {
      for (const it of p.inventory) {
        if (it.key === key && (it.n || 1) < def.stack) {
          const add = Math.min(n, def.stack - (it.n || 1));
          it.n = (it.n || 1) + add; n -= add;
          if (n <= 0) return true;
        }
      }
      while (n > 0) {
        if (p.inventory.length >= R.INV_SIZE) return false;
        const add = Math.min(n, def.stack);
        p.inventory.push({ uid: p.nextUid++, key, n: add }); n -= add;
      }
      return true;
    }
    if (p.inventory.length >= R.INV_SIZE) return false;
    p.inventory.push({ uid: p.nextUid++, key });
    return true;
  }
  function freeSlotsFor(p, key, n) {
    const def = R.ITEMS[key];
    if (!def.stack) return p.inventory.length < R.INV_SIZE;
    let room = (R.INV_SIZE - p.inventory.length) * def.stack;
    for (const it of p.inventory) if (it.key === key) room += def.stack - (it.n || 1);
    return room >= n;
  }
  function sellValue(def) {
    if (def.price) return Math.floor(def.price * 0.25);
    if (def.tier != null) return 100 * (def.tier + 1) * (def.tier + 1);
    return 10;
  }

  async function save(p) {
    try {
      await db.query(
        `UPDATE characters SET level=$2, exp=$3, yang=$4, kills=$5, pos_x=$6, pos_z=$7,
         inventory=$8, equip=$9, next_uid=$10, map_id=$11, hp=$12, last_played=now() WHERE id=$1`,
        [p.charId, p.level, p.exp, p.yang, p.kills, p.x, p.z, JSON.stringify(p.inventory), JSON.stringify(p.equip),
         p.nextUid, p.zone ? p.zone.id : p.mapId, p.dead ? p.maxHp : p.hp]);
    } catch (e) { console.error('Kayıt hatası', p.name, e.message); }
  }

  // ---------- bölgelerin ihtiyaç duyduğu işlemler ----------
  const hooks = {
    publicPlayer,
    giveExp(p, amount) {
      p.kills++;
      if (p.level >= R.MAX_LEVEL) return;
      p.exp += amount;
      let up = false;
      while (p.level < R.MAX_LEVEL && p.exp >= R.expForLevel(p.level)) {
        p.exp -= R.expForLevel(p.level); p.level++; up = true;
      }
      if (up) { recalc(p); p.hp = p.maxHp; sendHp(p); sendInv(p); }
      sendStats(p, up);
      p.socket.emit('expGain', amount);
    },
    damagePlayer(p, dmg) {
      if (p.dead) return;
      p.hp = Math.max(0, p.hp - dmg);
      p.lastHurt = Date.now();
      sendHp(p);
      if (p.hp <= 0) {
        p.dead = true;
        p.moving = false;
        p.zone.emit('playerDied', { id: p.id });
        p.socket.emit('died', { village: R.MAPS[villageFor(p.zone.id)].name });
      }
    },
    heal(p, amount) {
      if (p.dead || p.hp >= p.maxHp) return;
      p.hp = Math.min(p.maxHp, p.hp + amount);
      sendHp(p);
    },
    announce(text, zone) { (zone ? zone : io).emit('announce', text); },
  };
  for (const def of R.MAPS) zones.push(new Zone(io, def, hooks));

  function villageFor(mapId) {
    let v = 0;
    for (const id of VILLAGES) if (id <= mapId) v = id;
    return v;
  }

  // oyuncuyu başka haritaya taşı
  function moveToZone(p, mapId, pos) {
    const target = zones[mapId];
    if (!target) return;
    if (p.zone) p.zone.removePlayer(p);
    const [sx, sz] = pos || target.def.spawn;
    const jitter = pos ? 0 : 3;
    p.x = sx + (Math.random() - 0.5) * jitter; p.z = sz + (Math.random() - 0.5) * jitter;
    p.lastMove = Date.now();
    target.addPlayer(p);
    p.socket.emit('mapChange', { ...target.snapshot(), you: { x: p.x, z: p.z } });
  }

  // ---------- bağlantı ----------
  io.use(async (socket, next) => {
    try {
      const { token, characterId } = socket.handshake.auth || {};
      const account = await accountFromToken(token);
      if (!account) return next(new Error('auth'));
      const r = await db.query('SELECT * FROM characters WHERE id = $1 AND account_id = $2', [Number(characterId), account.id]);
      if (!r.rows[0]) return next(new Error('character'));
      socket.data.row = r.rows[0];
      next();
    } catch (e) { console.error('bağlantı', e); next(new Error('server')); }
  });

  io.on('connection', (socket) => {
    const row = socket.data.row;
    // aynı karakter başka yerde açıksa eskisini kapat ve son durumunu devral
    let prev = null;
    for (const o of Object.values(players)) {
      if (o.charId !== row.id) continue;
      prev = o;
      o.replaced = true;
      delete players[o.id];
      if (o.zone) o.zone.removePlayer(o);
      o.socket.emit('kicked', 'Bu karakterle başka bir yerden giriş yapıldı.');
      o.socket.disconnect(true);
    }
    const p = {
      id: socket.id, socket, charId: row.id, name: row.name, class: row.class,
      x: 0, z: 0, ry: 0, moving: false, lastAttack: 0, lastMove: Date.now(), combo: 0, lastPotion: 0,
      level: row.level, exp: row.exp, yang: Number(row.yang), kills: row.kills,
      inventory: row.inventory || [], equip: row.equip || {}, nextUid: row.next_uid,
      mapId: R.MAPS[row.map_id] ? row.map_id : 0, hp: row.hp, dead: false, zone: null,
    };
    if (prev) {
      for (const k of ['level', 'exp', 'yang', 'kills', 'inventory', 'equip', 'nextUid', 'hp']) p[k] = prev[k];
      if (prev.zone) p.mapId = prev.zone.id;
    }
    for (const s of R.EQUIP_SLOTS) if (p.equip[s] === undefined) p.equip[s] = null;
    recalc(p);
    if (!p.hp || p.hp <= 0) p.hp = p.maxHp;
    players[socket.id] = p;

    const startPos = prev ? [prev.x, prev.z] : (row.pos_x != null ? [row.pos_x, row.pos_z] : null);
    socket.emit('welcome', {
      id: socket.id, cls: p.class, name: p.name,
      stats: { level: p.level, exp: p.exp, need: R.expForLevel(p.level) },
      villages: VILLAGES,
    });
    moveToZone(p, p.mapId, startPos);
    sendInv(p);
    sendHp(p);

    socket.on('move', (m) => {
      if (!m || p.dead) return;
      const nx = Number(m.x), nz = Number(m.z);
      if (!isFinite(nx) || !isFinite(nz)) return;
      const now = Date.now();
      const dt = Math.max(0.05, (now - p.lastMove) / 1000);
      const d = Math.hypot(nx - p.x, nz - p.z);
      const maxD = R.BASE_SPEED * (R.classOf(p).speed || 1) * 1.4 * dt + 1;   // hız hilesi koruması
      if (d > maxD) {
        const k = maxD / d;
        p.x += (nx - p.x) * k; p.z += (nz - p.z) * k;
        socket.emit('correct', { x: p.x, z: p.z });
      } else { p.x = nx; p.z = nz; }
      p.x = clamp(p.x, Zone.BOUNDS.min, Zone.BOUNDS.max); p.z = clamp(p.z, Zone.BOUNDS.min, Zone.BOUNDS.max);
      p.ry = Number(m.ry) || 0;
      p.moving = !!m.moving;
      p.lastMove = now;
    });

    socket.on('attack', () => {
      if (p.dead || !p.zone) return;
      const now = Date.now();
      const cd = p.class === 'ninja' ? 400 : 480;
      if (now - p.lastAttack < cd) return;
      p.combo = now - p.lastAttack < 1200 ? (p.combo + 1) % 3 : 0;
      p.lastAttack = now;
      p.zone.attack(p, p.combo);
    });

    socket.on('pickup', (dropId) => {
      const z = p.zone; if (!z || p.dead) return;
      const d = z.drops.get(Number(dropId));
      if (!d || Math.hypot(d.x - p.x, d.z - p.z) > 3) return;
      if (d.owner !== p.id && Date.now() < d.ownerUntil) { notice(p, 'Bu ganimet başkasına ait. Biraz bekle.'); return; }
      if (d.item && !freeSlotsFor(p, d.item.key, d.item.n || 1)) { notice(p, 'Envanterin dolu!'); return; }
      z.drops.delete(d.id);
      z.emit('dropGone', { id: d.id });
      if (d.item) {
        addItem(p, d.item.key, d.item.n || 1);
        notice(p, `${R.ITEMS[d.item.key].name}${(d.item.n || 1) > 1 ? ' x' + d.item.n : ''} aldın!`);
      } else {
        p.yang += d.yang;
        notice(p, `${d.yang} Yang aldın.`);
      }
      sendInv(p);
    });

    socket.on('equip', (uid) => {
      const idx = p.inventory.findIndex((i) => i.uid === Number(uid));
      if (idx < 0) return;
      const item = p.inventory[idx];
      const def = R.ITEMS[item.key];
      if (!def || !R.EQUIP_SLOTS.includes(def.slot)) return;
      if (def.classes && !def.classes.includes(p.class)) { notice(p, `${def.name} senin sınıfına uygun değil.`); return; }
      if (p.level < (def.lv || 1)) { notice(p, `${def.name} için en az ${def.lv}. seviye olmalısın.`); return; }
      const old = p.equip[def.slot];
      p.inventory.splice(idx, 1);
      if (old) p.inventory.push(old);
      p.equip[def.slot] = item;
      recalc(p); sendInv(p); sendHp(p);
      if (p.zone) p.zone.emit('look', { id: p.id, look: looks(p) });
    });

    socket.on('unequip', (slot) => {
      if (!R.EQUIP_SLOTS.includes(slot) || !p.equip[slot]) return;
      if (p.inventory.length >= R.INV_SIZE) { notice(p, 'Envanterin dolu!'); return; }
      p.inventory.push(p.equip[slot]);
      p.equip[slot] = null;
      recalc(p); sendInv(p); sendHp(p);
      if (p.zone) p.zone.emit('look', { id: p.id, look: looks(p) });
    });

    socket.on('dropItem', (uid) => {
      const idx = p.inventory.findIndex((i) => i.uid === Number(uid));
      if (idx < 0 || !p.zone) return;
      const [item] = p.inventory.splice(idx, 1);
      p.zone.makeDrop(p.x, p.z, p.id, { key: item.key, n: item.n }, 0, 0);
      sendInv(p);
    });

    socket.on('usePotion', (key) => {
      if (p.dead) return;
      const now = Date.now();
      if (now - p.lastPotion < 800) return;
      // istenen iksir yoksa elindeki ilk kırmızı iksiri kullan (küçükten büyüğe)
      const order = ['p_hp1', 'p_hp2', 'p_hp3', 'p_hp4'];
      const it = p.inventory.find((i) => i.key === key) || order.map((k) => p.inventory.find((i) => i.key === k)).find(Boolean);
      if (!it) { notice(p, 'İksirin kalmadı. Köydeki marketten alabilirsin.'); return; }
      if (p.hp >= p.maxHp) { notice(p, 'Canın zaten dolu.'); return; }
      p.lastPotion = now;
      it.n = (it.n || 1) - 1;
      if (it.n <= 0) p.inventory.splice(p.inventory.indexOf(it), 1);
      hooks.heal(p, R.ITEMS[it.key].heal);
      sendInv(p);
    });

    socket.on('buy', (data) => {
      const z = p.zone; if (!z || !z.def.shop) { notice(p, 'Burada dükkân yok.'); return; }
      const key = String(data && data.key);
      const n = clamp(Math.floor(Number(data && data.n) || 1), 1, 200);
      const shop = z.def.shop;
      if (![...shop.potions, ...shop.weapons, ...shop.armor].includes(key)) return;
      const def = R.ITEMS[key];
      const count = def.stack ? n : 1;
      const cost = def.price * count;
      if (p.yang < cost) { notice(p, `Yeterli Yang yok (${cost.toLocaleString('tr-TR')} gerekli).`); return; }
      if (!freeSlotsFor(p, key, count)) { notice(p, 'Envanterin dolu!'); return; }
      p.yang -= cost;
      addItem(p, key, count);
      notice(p, `${def.name}${count > 1 ? ' x' + count : ''} satın aldın.`);
      sendInv(p);
    });

    socket.on('sell', (uid) => {
      const z = p.zone; if (!z || !z.def.shop) { notice(p, 'Satmak için köydeki bir dükkâna git.'); return; }
      const idx = p.inventory.findIndex((i) => i.uid === Number(uid));
      if (idx < 0) return;
      const it = p.inventory[idx];
      const def = R.ITEMS[it.key];
      const value = sellValue(def) * (it.n || 1);
      p.inventory.splice(idx, 1);
      p.yang += value;
      notice(p, `${def.name} satıldı: +${value.toLocaleString('tr-TR')} Yang`);
      sendInv(p);
    });

    // haritanın kenarındaki geçitten komşu haritaya
    socket.on('travel', (to) => {
      const z = p.zone; if (!z || p.dead) return;
      const portal = z.def.portals.find((pt) => pt.to === Number(to));
      if (!portal || Math.hypot(portal.x - p.x, portal.z - p.z) > 5) return;
      const target = R.MAPS[portal.to];
      if (p.level < target.minLevel) { notice(p, `${target.name} için en az ${target.minLevel}. seviye olmalısın.`); return; }
      const forward = portal.to > z.id;
      moveToZone(p, portal.to, forward ? [-6, 25] : [56, 25]);
    });

    // köylerdeki ışınlayıcı
    socket.on('teleport', (to) => {
      const z = p.zone; if (!z || p.dead) return;
      if (!z.def.village) { notice(p, 'Işınlayıcı sadece köylerde var.'); return; }
      const target = R.MAPS[Number(to)];
      if (!target || target.id === z.id) return;
      if (p.level < target.minLevel) { notice(p, `${target.name} için en az ${target.minLevel}. seviye olmalısın.`); return; }
      moveToZone(p, target.id);
    });

    socket.on('respawn', () => {
      if (!p.dead) return;
      p.dead = false;
      p.hp = p.maxHp;
      moveToZone(p, villageFor(p.zone ? p.zone.id : 0));
      sendHp(p);
    });

    socket.on('chat', (text) => {
      const t = String(text || '').replace(/[<>&"'\\]/g, '').trim().slice(0, 80);
      if (t && p.zone) p.zone.emit('chat', { name: p.name, text: t });
    });

    socket.on('disconnect', () => {
      if (p.replaced || players[socket.id] !== p) return;
      delete players[socket.id];
      if (p.zone) { p.mapId = p.zone.id; p.zone.removePlayer(p); p.zone = null; }
      save(p);
    });
  });

  // ---------- zaman döngüsü ----------
  let last = Date.now();
  setInterval(() => {
    const now = Date.now();
    const dt = Math.min(0.25, (now - last) / 1000);
    last = now;
    for (const z of zones) z.tick(dt);
  }, 100);
  setInterval(() => { for (const p of Object.values(players)) save(p); }, 20000);

  return {
    async saveAll() { await Promise.all(Object.values(players).map(save)); },
    online: () => Object.keys(players).length,
    zones,       // testler için
    players,
  };
}

module.exports = { createWorld };
