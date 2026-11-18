// Oyun dünyası: bağlantılar, oyuncu komutları, envanter, dükkân, haritalar arası geçiş.
const db = require('../db');
const { accountFromToken } = require('../auth');
const R = require('./rules');
const config = require('../config');
const { Zone, boundsOf } = require('./zone');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const VILLAGES = R.MAPS.filter((m) => m.village).map((m) => m.id);
const HORSE_QUEST = { level: 25, mob: 'vkurt', count: 20 };
const FISH_TABLE = [['b_hamsi', 38], ['b_sazan', 25], ['b_alabalik', 15], ['b_levrek', 9], ['b_yayin', 3], ['istiridye', 4], ['b_cizme', 6]];
const PEARLS = [['inci_beyaz', 70], ['inci_mavi', 25], ['inci_kirmizi', 5]];
function roll(table) {
  const total = table.reduce((a, [, w]) => a + w, 0);
  let r = Math.random() * total;
  for (const [k, w] of table) { r -= w; if (r <= 0) return k; }
  return table[0][0];
}

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
    look: looks(p), hp: p.hp, maxHp: p.maxHp, dead: !!p.dead, mounted: !!p.mounted, gm: !!p.gm });
  function recalc(p) {
    p.maxHp = R.maxHp(p);
    p.maxMp = R.maxMp(p);
    p.hp = Math.min(p.hp, p.maxHp);
    if (p.mp != null) p.mp = Math.min(p.mp, p.maxMp);
  }
  function sendInv(p) {
    const t = R.totals(p);
    p.socket.emit('inv', { inventory: p.inventory, equip: p.equip, yang: p.yang,
      atk: R.attackPower(p), def: R.defense(p), maxHp: p.maxHp, maxMp: p.maxMp,
      crit: Math.round(((R.classOf(p).crit || 0.12) * 100) + t.crit), atkspeed: t.atkspeed, movespeed: t.movespeed,
      speed: R.speedMul(p), atkCd: R.attackCooldown(p), mounted: !!p.mounted });
    sendAttrs(p);
  }
  function sendMp(p) { p.socket.emit('mp', { mp: p.mp, max: p.maxMp }); }
  // karakter penceresi: özellikler, boş puan ve hesaplanmış değerler
  function sendAttrs(p) {
    const t = R.totals(p);
    p.socket.emit('attrs', { values: R.statValues(p), base: R.BASE_STATS[p.class], free: R.statPointsFree(p), max: R.STAT_MAX,
      main: R.MAIN_STAT[p.class], bonus: R.statBonus(p),
      atk: R.attackPower(p), def: R.defense(p), maxHp: p.maxHp, maxMp: p.maxMp,
      crit: Math.round(((R.classOf(p).crit || 0.12) * 100) + t.crit), skill: t.skill, atkspeed: t.atkspeed, movespeed: t.movespeed });
  }
  function sendSkills(p) {
    p.socket.emit('skills', { levels: p.skills, points: R.skillPoints(p), unlock: R.SKILL_UNLOCK });
  }
  function sendBuffs(p) {
    const now = Date.now(), list = {};
    for (const [stat, b] of Object.entries(p.buffs)) if (b.until > now) list[stat] = { value: b.value, left: Math.round((b.until - now) / 1000), src: b.src };
    p.socket.emit('buffs', list);
  }
  function sendQuests(p) { p.socket.emit('quests', p.quests); }
  function addBuff(p, stat, value, sec, src) {
    p.buffs[stat] = { value, until: Date.now() + sec * 1000, src };
    recalc(p); sendInv(p); sendBuffs(p);
  }
  function setMounted(p, on) {
    if (!!p.mounted === on) return;
    p.mounted = on;
    sendInv(p);
    if (p.zone) p.zone.emit('mount', { id: p.id, on });
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

  // ---------- GM (oyun yöneticisi) ----------
  // Son seviye; ilk girişte en üst kademe efsanevi eşyalar (5 en yüksek efsunla), ışınlanma yüzüğü ve bolca iksir.
  function maxedItem(key) {
    const def = R.ITEMS[key];
    const it = { uid: p_nextUid(), key };
    if (def && R.EQUIP_SLOTS.includes(def.slot)) {
      const types = Object.keys(R.BONUS_TYPES).filter((t) => t !== 'movespeed').slice(0, 5);
      it.bon = types.map((t) => [t, R.maxBonus(t, def.tier)]);
    }
    return it;
  }
  let gmTarget = null;
  function p_nextUid() { return gmTarget.nextUid++; }
  function setupGm(p) {
    p.level = R.MAX_LEVEL; p.exp = 0;
    p.quests = p.quests || {};
    if (p.quests.gmKit === 1) return;
    gmTarget = p;
    const cls = R.CLASSES[p.class] || {};
    const wtype = String(cls.startWeapon || 'sword0').replace(/\d+$/, '');
    const top = (base) => (R.ITEMS[base + '15_L'] ? base + '15_L' : base + '15');
    // eski kuşanılanlar çantaya
    for (const slot of R.EQUIP_SLOTS) if (p.equip[slot] && p.inventory.length < R.INV_SIZE) p.inventory.push(p.equip[slot]);
    p.equip = { weapon: maxedItem(top(wtype)), armor: maxedItem(top('armor')), helmet: maxedItem(top('helmet')),
      shoes: maxedItem(top('shoes')), bracelet: maxedItem(top('bracelet')), earring: maxedItem(top('earring')) };
    const give = [['isin_yuzugu', 1], ['at_muhru', 1], ['olta', 1], ['yem', 200], ['p_hp4', 200], ['p_mp4', 200], ['p_green', 50], ['p_speed', 50], ['efsun', 100], ['efsun_degis', 100]];
    for (const [key, n] of give) {
      if (!R.ITEMS[key] || p.inventory.some((i) => i.key === key)) continue;
      if (p.inventory.length >= R.INV_SIZE) break;
      p.inventory.push({ uid: p.nextUid++, key, n });
    }
    // diğer silah türlerinin en üst kademeleri de (yer varsa)
    for (const t of ['sword', 'dagger', 'bow', 'staff']) {
      if (t === wtype || p.inventory.length >= R.INV_SIZE) continue;
      p.inventory.push(maxedItem(top(t)));
    }
    p.yang = Math.max(p.yang, 999999999);
    p.quests.horse = 'done';
    p.quests.rod = true; p.quests.skillHint = true;
    p.quests.gmKit = 1;
    gmTarget = null;
  }
  function gmCommand(p, text) {
    const [cmd, ...args] = text.slice(1).split(/\s+/);
    const a0 = args[0];
    if (cmd === 'git' || cmd === 'tp') {
      const id = Number(a0); if (!R.MAPS[id]) { notice(p, 'Harita: 0-' + (R.MAPS.length - 1)); return; }
      moveToZone(p, id); return;
    }
    if (cmd === 'seviye') { p.level = Math.max(1, Math.min(R.MAX_LEVEL, Number(a0) || R.MAX_LEVEL)); p.exp = 0; recalc(p); sendInv(p); sendHp(p); sendSkills(p); sendStats(p, true); return; }
    if (cmd === 'yang') { p.yang = Math.max(0, Number(a0) || 0); sendInv(p); return; }
    if (cmd === 'esya' || cmd === 'item') {
      if (!R.ITEMS[a0]) { notice(p, 'Böyle bir eşya yok: ' + a0); return; }
      gmTarget = p; const it = maxedItem(a0); gmTarget = null;
      if (R.ITEMS[a0].stack) it.n = Math.max(1, Math.min(200, Number(args[1]) || 1));
      if (p.inventory.length >= R.INV_SIZE) { notice(p, 'Çanta dolu.'); return; }
      p.inventory.push(it); sendInv(p); notice(p, R.ITEMS[a0].name + ' verildi.'); return;
    }
    if (cmd === 'iyiles') { p.hp = p.maxHp; p.mp = p.maxMp; sendHp(p); sendMp(p); return; }
    notice(p, 'GM komutları: /git <harita>, /seviye <n>, /yang <n>, /esya <anahtar> [adet], /iyiles');
  }

  async function save(p) {
    try {
      await db.query(
        `UPDATE characters SET level=$2, exp=$3, yang=$4, kills=$5, pos_x=$6, pos_z=$7,
         inventory=$8, equip=$9, next_uid=$10, map_id=$11, hp=$12, mp=$13, skills=$14, quests=$15, stats=$16, last_played=now() WHERE id=$1`,
        [p.charId, p.level, p.exp, p.yang, p.kills, p.x, p.z, JSON.stringify(p.inventory), JSON.stringify(p.equip),
         p.nextUid, p.zone ? p.zone.id : p.mapId, p.dead ? p.maxHp : p.hp, p.mp, JSON.stringify(p.skills), JSON.stringify(p.quests), JSON.stringify(p.stats || {})]);
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
      if (up) {
        recalc(p); p.hp = p.maxHp; p.mp = p.maxMp; sendHp(p); sendMp(p); sendInv(p); sendSkills(p);
        notice(p, `+${R.STAT_PER_LEVEL || 3} durum puanı kazandın. Karakter penceresinden (K) dağıt.`);
        levelRewards(p);
      }
      sendStats(p, up);
      p.socket.emit('expGain', amount);
    },
    damagePlayer(p, dmg) {
      if (p.dead) return;
      p.hp = Math.max(0, p.hp - dmg);
      p.lastHurt = Date.now();
      sendHp(p);
      if (p.hp <= 0) {
        p.dead = true; p.diedAt = Date.now();
        p.moving = false;
        p.mounted = false; p.fish = null;
        p.zone.emit('playerDied', { id: p.id });
        p.socket.emit('died', { village: R.MAPS[villageFor(p.zone.id)].name });
      }
    },
    heal(p, amount) {
      if (p.dead || p.hp >= p.maxHp) return;
      p.hp = Math.min(p.maxHp, p.hp + amount);
      sendHp(p);
    },
    onMobKilled(p, m) {
      const q = p.quests;
      if (q.horse === 'active' && m.key === HORSE_QUEST.mob) {
        q.horseKills = (q.horseKills || 0) + 1;
        if (q.horseKills >= HORSE_QUEST.count) { q.horse = 'ready'; notice(p, 'At görevi tamamlandı! Ödülünü almak için Seyis\'e git.'); }
        sendQuests(p);
      }
    },
    announce(text, zone) { (zone ? zone : io).emit('announce', text); },
  };
  for (const def of R.MAPS) zones.push(new Zone(io, def, hooks));

  // seviye ödülleri: 25'te at görevi, 30'da olta
  function levelRewards(p) {
    const q = p.quests;
    if (p.level >= 5 && !q.skillHint) { q.skillHint = true; notice(p, 'Becerilerin açıldı! Beceri penceresinden puan ver.'); }
    if (p.level >= HORSE_QUEST.level && !q.horse) { q.horse = 'available'; notice(p, 'Köydeki Seyis seninle konuşmak istiyor: at görevi!'); sendQuests(p); }
    if (p.level >= 30 && !q.rod) {
      if (addItem(p, 'olta', 1)) {
        addItem(p, 'yem', 20);
        q.rod = true;
        notice(p, 'Oltanı aldın! Işınlayıcıyla Gümüş Göl\'e gidip balık tutabilirsin.');
        sendInv(p);
      } else notice(p, 'Oltanı verebilmek için envanterinde yer aç.');
    }
  }

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
    p.fish = null;
    if (target.def.safe) p.mounted = false;
    const [sx, sz] = pos || target.def.spawn;
    const jitter = pos ? 0 : 3;
    p.x = target.clampX(sx + (Math.random() - 0.5) * jitter); p.z = target.clampX(sz + (Math.random() - 0.5) * jitter);
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
      mp: row.mp, skills: row.skills || {}, quests: row.quests || {}, stats: row.stats || {}, buffs: {}, skillCd: {}, mounted: false,
      fish: null, facing: 0,
    };
    if (prev) {
      for (const k of ['level', 'exp', 'yang', 'kills', 'inventory', 'equip', 'nextUid', 'hp', 'mp', 'skills', 'quests', 'stats', 'buffs']) p[k] = prev[k];
      if (prev.zone) p.mapId = prev.zone.id;
    }
    for (const s of R.EQUIP_SLOTS) if (p.equip[s] === undefined) p.equip[s] = null;
    p.gm = config.gmNames.includes(String(p.name).toLocaleLowerCase('tr-TR'));
    if (p.gm) setupGm(p);
    recalc(p);
    if (!p.hp || p.hp <= 0) p.hp = p.maxHp;
    if (p.mp == null) p.mp = p.maxMp;
    players[socket.id] = p;
    levelRewards(p);

    const startPos = prev ? [prev.x, prev.z] : (row.pos_x != null ? [row.pos_x, row.pos_z] : null);
    socket.emit('welcome', { gm: !!p.gm,
      id: socket.id, cls: p.class, name: p.name,
      stats: { level: p.level, exp: p.exp, need: R.expForLevel(p.level) },
      villages: VILLAGES,
    });
    moveToZone(p, p.mapId, startPos);
    sendInv(p);
    sendHp(p); sendMp(p); sendSkills(p); sendQuests(p); sendBuffs(p);

    socket.on('move', (m) => {
      if (!m || p.dead) return;
      const nx = Number(m.x), nz = Number(m.z);
      if (!isFinite(nx) || !isFinite(nz)) return;
      const now = Date.now();
      const dt = Math.max(0.05, (now - p.lastMove) / 1000);
      const d = Math.hypot(nx - p.x, nz - p.z);
      const maxD = R.BASE_SPEED * R.speedMul(p) * 1.4 * dt + 1;   // hız hilesi koruması
      if (d > maxD) {
        const k = maxD / d;
        p.x += (nx - p.x) * k; p.z += (nz - p.z) * k;
        socket.emit('correct', { x: p.x, z: p.z });
      } else { p.x = nx; p.z = nz; }
      if (p.zone) { p.x = p.zone.clampX(p.x); p.z = p.zone.clampX(p.z); }
      p.ry = Number(m.ry) || 0;
      if (isFinite(Number(m.f))) p.facing = Number(m.f);
      p.moving = !!m.moving;
      p.lastMove = now;
      if (p.fish && p.moving) { p.fish = null; socket.emit('fishEnd', { ok: false, msg: 'Hareket ettin, olta toplandı.' }); }
    });

    socket.on('attack', () => {
      if (p.dead || !p.zone) return;
      const now = Date.now();
      const cd = R.attackCooldown(p);
      if (now - p.lastAttack < cd) return;
      if (p.zone.def.safe) return;
      setMounted(p, false);
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
      if (!p.gm && def.classes && !def.classes.includes(p.class)) { notice(p, `${def.name} senin sınıfına uygun değil.`); return; }
      if (!p.gm && p.level < (def.lv || 1)) { notice(p, `${def.name} için en az ${def.lv}. seviye olmalısın.`); return; }
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

    // hızlı iksir butonları: kind = 'hp' ya da 'mp'
    const POTS = { hp: ['p_hp1', 'p_hp2', 'p_hp3', 'p_hp4'], mp: ['p_mp1', 'p_mp2', 'p_mp3', 'p_mp4'] };
    socket.on('usePotion', (kind) => {
      const order = POTS[kind === 'mp' ? 'mp' : 'hp'];
      const it = order.map((k) => p.inventory.find((i) => i.key === k)).find(Boolean);
      if (!it) { notice(p, kind === 'mp' ? 'Mavi iksirin kalmadı.' : 'Kırmızı iksirin kalmadı. Köydeki marketten alabilirsin.'); return; }
      useItem(it);
    });
    socket.on('useItem', (uid) => {
      const it = p.inventory.find((i) => i.uid === Number(uid));
      if (it) useItem(it);
    });
    function consume(it) {
      it.n = (it.n || 1) - 1;
      if (it.n <= 0) p.inventory.splice(p.inventory.indexOf(it), 1);
    }
    function useItem(it) {
      if (p.dead) return;
      const def = R.ITEMS[it.key];
      if (!def) return;
      const now = Date.now();
      if (def.slot === 'potion') {
        if (now - p.lastPotion < 600) return;
        if (def.heal && p.hp >= p.maxHp) { notice(p, 'Canın zaten dolu.'); return; }
        if (def.mana && p.mp >= p.maxMp) { notice(p, 'Manan zaten dolu.'); return; }
        p.lastPotion = now;
        consume(it);
        if (def.heal) hooks.heal(p, def.heal);
        if (def.mana) { p.mp = Math.min(p.maxMp, p.mp + def.mana); sendMp(p); }
        if (def.buff) { addBuff(p, def.buff.stat, def.buff.value, def.buff.dur, def.name); notice(p, `${def.name}: ${def.desc}`); }
        sendInv(p);
        return;
      }
      if (it.key === 'istiridye') {
        consume(it);
        if (Math.random() < 0.12) {
          const pearl = roll(PEARLS);
          addItem(p, pearl, 1);
          notice(p, `İstiridyeden ${R.ITEMS[pearl].name} çıktı!`);
          if (p.zone) p.zone.emit('announce', `${p.name} bir ${R.ITEMS[pearl].name} buldu!`);
        } else notice(p, 'İstiridye boş çıktı.');
        sendInv(p);
        return;
      }
      if (it.key === 'at_muhru') {
        if (p.zone && p.zone.def.safe && !p.mounted) { notice(p, 'Burada ata binemezsin.'); return; }
        setMounted(p, !p.mounted);
        notice(p, p.mounted ? 'Atına bindin.' : 'Atından indin.');
        return;
      }
      if (it.key === 'olta' || it.key === 'yem') { notice(p, 'Balık tutmak için Gümüş Göl kıyısına git.'); return; }
      if (it.key === 'efsun') { notice(p, 'Efsunlamak istediğin ekipmana dokun ve "Efsunla"ya bas.'); return; }
      if (it.key === 'isin_yuzugu') { socket.emit('openTeleport'); return; }
      if (it.key === 'efsun_degis') { notice(p, 'Efsunlu bir ekipmana dokun ve "Efsun Değiştir"e bas.'); return; }
    }

    function gearTarget(data) {
      let target = null;
      if (data && data.slot && R.EQUIP_SLOTS.includes(data.slot)) target = p.equip[data.slot];
      else if (data && data.uid != null) target = p.inventory.find((i) => i.uid === Number(data.uid));
      const def = target && R.ITEMS[target.key];
      if (!def || !R.EQUIP_SLOTS.includes(def.slot)) return null;
      target.bon = target.bon || [];
      return { target, def };
    }
    // efsun nesnesi (metin taşlarından): ekipmana yeni bir efsun ekler, en fazla 5
    socket.on('enchant', (data) => {
      const ef = p.inventory.find((i) => i.key === 'efsun');
      if (!ef) { notice(p, 'Efsun nesnen yok.'); return; }
      const g = gearTarget(data);
      if (!g) { notice(p, 'Sadece ekipmanlar efsunlanabilir.'); return; }
      const { target, def } = g;
      if (target.bon.length >= 5) { notice(p, 'Bu eşyada 5 efsun var. Değiştirmek için Efsun Değiştirme Nesnesi gerekir (boss\'lardan düşer).'); return; }
      const types = Object.keys(R.BONUS_TYPES);
      const free = types.filter((t) => !target.bon.some((b) => b[0] === t));
      const t = free[Math.floor(Math.random() * free.length)];
      const v = R.rollBonus(t, def.tier);
      target.bon.push([t, v]);
      const b = R.BONUS_TYPES[t];
      notice(p, `Yeni efsun: ${b.name} +${v}${b.unit}`);
      consume(ef);
      recalc(p); sendInv(p); sendHp(p); sendMp(p);
      socket.emit('enchanted', { kind: 'add' });
    });
    // efsun değiştirme nesnesi (boss'lardan): var olan efsunların hepsini yeniden belirler
    socket.on('reroll', (data) => {
      const ef = p.inventory.find((i) => i.key === 'efsun_degis');
      if (!ef) { notice(p, 'Efsun Değiştirme Nesnen yok. Boss\'lardan düşer.'); return; }
      const g = gearTarget(data);
      if (!g) { notice(p, 'Sadece ekipmanların efsunu değiştirilebilir.'); return; }
      const { target, def } = g;
      if (!target.bon.length) { notice(p, 'Bu eşyada değiştirilecek efsun yok. Önce Efsun Nesnesi ile efsunla.'); return; }
      const n = target.bon.length;
      const pick = Object.keys(R.BONUS_TYPES).sort(() => Math.random() - 0.5).slice(0, n);
      target.bon = pick.map((t) => [t, R.rollBonus(t, def.tier)]);
      notice(p, `${def.name}: ${n} efsun yeniden belirlendi.`);
      consume(ef);
      recalc(p); sendInv(p); sendHp(p); sendMp(p);
      socket.emit('enchanted', { kind: 'reroll' });
    });

    // ---------- beceriler ----------
    // durum puanı ver: { stat: 'str'|'vit'|'int'|'dex', n }
    socket.on('statUp', (data) => {
      const stat = data && data.stat;
      if (!R.STAT_KEYS.includes(stat)) return;
      const want = Math.max(1, Math.min(10, Math.floor(Number(data.n) || 1)));
      const free = R.statPointsFree(p), cur = R.statValues(p)[stat];
      const n = Math.min(want, free, R.STAT_MAX - cur);
      if (n <= 0) { notice(p, free <= 0 ? 'Boş durum puanın yok.' : `Bu özellik en fazla ${R.STAT_MAX} olabilir.`); return; }
      p.stats = p.stats || {};
      p.stats[stat] = (p.stats[stat] || 0) + n;
      const hpFrac = p.hp / Math.max(1, p.maxHp), mpFrac = p.mp / Math.max(1, p.maxMp);
      recalc(p);
      p.hp = Math.max(1, Math.round(p.maxHp * hpFrac)); p.mp = Math.round(p.maxMp * mpFrac);
      sendInv(p); sendHp(p); sendMp(p);
    });
    socket.on('skillUp', (key) => {
      const sk = R.skillsOf(p).find((s) => s.key === key);
      if (!sk) return;
      if (p.level < R.SKILL_UNLOCK) { notice(p, `Beceriler ${R.SKILL_UNLOCK}. seviyede açılır.`); return; }
      if (R.skillPoints(p) <= 0) { notice(p, 'Beceri puanın yok. Seviye atladıkça puan kazanırsın.'); return; }
      const lv = p.skills[key] || 0;
      if (lv >= R.SKILL_MAX) { notice(p, 'Bu beceri en yüksek seviyede.'); return; }
      p.skills[key] = lv + 1;
      sendSkills(p);
    });
    socket.on('skill', (data) => {
      const key = data && data.key;
      const sk = R.skillsOf(p).find((s) => s.key === key);
      if (!sk || p.dead || !p.zone) return;
      if (p.zone.def.safe) { notice(p, 'Burada beceri kullanılamaz.'); return; }
      const lv = p.skills[key] || 0;
      if (!lv) { notice(p, `${sk.name} henüz öğrenilmedi. Beceri penceresinden puan ver.`); return; }
      const now = Date.now();
      if (now < (p.skillCd[key] || 0)) return;
      const cost = sk.mp + sk.mpLv * (lv - 1);
      if (p.mp < cost) { notice(p, 'Yeterli manan yok.'); return; }
      if (isFinite(Number(data.f))) p.facing = Number(data.f);
      setMounted(p, false);
      p.mp -= cost; sendMp(p);
      p.skillCd[key] = now + sk.cd * 1000;
      let targets = [];
      if (sk.target === 'self' || sk.target === 'heal') {
        const radius = sk.radius || 0;
        const group = radius ? [...p.zone.players.values()].filter((o) => !o.dead && Math.hypot(o.x - p.x, o.z - p.z) <= radius) : [p];
        if (sk.buff) {
          const value = Math.round(sk.buff.base + sk.buff.perLv * (lv - 1));
          for (const o of group) {
            addBuff(o, sk.buff.stat, value, sk.buff.dur, sk.name);
            for (const [st, v] of Object.entries(sk.buff.extra || {})) addBuff(o, st, v, sk.buff.dur, sk.name);
          }
        }
        if (sk.heal) {
          const amount = Math.round(sk.heal.base + sk.heal.perLv * (lv - 1) + sk.heal.perLevel * p.level);
          for (const o of group) hooks.heal(o, amount);
        }
        targets = group.map((o) => o.id);
      } else {
        targets = p.zone.useSkill(p, sk, lv);
      }
      p.zone.emit('skillFx', { id: p.id, key, targets, x: p.x, z: p.z });
      socket.emit('skillCd', { key, until: sk.cd });
    });

    // ---------- balık tutma ----------
    socket.on('fishCast', () => {
      const z = p.zone;
      if (!z || !z.def.fishing || p.dead) { notice(p, 'Balık sadece Gümüş Göl\'de tutulur.'); return; }
      if (!p.inventory.some((i) => i.key === 'olta')) { notice(p, 'Oltan yok. 30. seviyede oltanı alırsın.'); return; }
      const lake = z.def.lake;
      const d = Math.hypot(p.x - lake.x, p.z - lake.z);
      if (d > lake.r + 4 || d < lake.r - 2.5) { notice(p, 'Gölün kıyısına git.'); return; }
      const yem = p.inventory.find((i) => i.key === 'yem');
      if (!yem) { notice(p, 'Yemin bitti. Balıkçıdan yem alabilirsin.'); return; }
      if (p.fish) return;
      consume(yem); sendInv(p);
      p.fish = { biteAt: Date.now() + 3000 + Math.random() * 5000, bitten: false };
      socket.emit('fishWait');
      z.emit('fishing', { id: p.id, on: true });
    });
    socket.on('fishPull', () => {
      const f = p.fish; if (!f) return;
      p.fish = null;
      if (p.zone) p.zone.emit('fishing', { id: p.id, on: false });
      const now = Date.now();
      if (!f.bitten || now > f.biteAt + 1800) { socket.emit('fishEnd', { ok: false, msg: f.bitten ? 'Geç kaldın, balık kaçtı.' : 'Erken çektin, balık kaçtı.' }); return; }
      const key = roll(FISH_TABLE);
      if (!addItem(p, key, 1)) { socket.emit('fishEnd', { ok: false, msg: 'Envanterin dolu!' }); return; }
      sendInv(p);
      socket.emit('fishEnd', { ok: true, msg: `${R.ITEMS[key].name} tuttun!`, key });
    });

    // ---------- at görevi ----------
    socket.on('quest', (act) => {
      const q = p.quests;
      if (!p.zone || !p.zone.def.village) return;
      if (act === 'accept' && q.horse === 'available') {
        q.horse = 'active'; q.horseKills = 0;
        notice(p, `Görev: Kızılçam Ormanı'ndaki ${HORSE_QUEST.count} Vahşi Kurt'u yen.`);
      } else if (act === 'claim' && q.horse === 'ready') {
        if (!addItem(p, 'at_muhru', 1)) { notice(p, 'Envanterinde yer aç.'); return; }
        q.horse = 'done';
        notice(p, 'At Mührü\'nü aldın! Envanterden kullanarak atına binebilirsin.');
        sendInv(p);
      }
      sendQuests(p);
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
      if (!p.gm && p.level < target.minLevel) { notice(p, `${target.name} için en az ${target.minLevel}. seviye olmalısın.`); return; }
      const forward = portal.to > z.id;
      const b = boundsOf(target);
      moveToZone(p, portal.to, forward ? [b.min + 8, 25] : [b.max - 8, 25]);
    });

    // köylerdeki ışınlayıcı
    socket.on('teleport', (to) => {
      const z = p.zone; if (!z || p.dead) return;
      const ring = p.gm || p.inventory.some((i) => i.key === 'isin_yuzugu');
      if (!z.def.village && !z.def.fishing && !ring) { notice(p, 'Işınlayıcı sadece köyde var. Işınlanma Yüzüğü ile her yerden ışınlanabilirsin.'); return; }
      const target = R.MAPS[Number(to)];
      if (!target || target.id === z.id) return;
      if (!p.gm && p.level < target.minLevel) { notice(p, `${target.name} için en az ${target.minLevel}. seviye olmalısın.`); return; }
      moveToZone(p, target.id);
    });

    // yeniden doğ: köyde (hemen) ya da burada (Metin2 gibi 5 saniye sonra, yarım canla)
    socket.on('respawn', (opt) => {
      if (!p.dead) return;
      const here = opt && opt.here;
      if (here && Date.now() - (p.diedAt || 0) < 5000) { notice(p, 'Burada başlamak için biraz bekle.'); return; }
      p.dead = false; p.mounted = false;
      if (here && p.zone) {
        p.hp = Math.round(p.maxHp * 0.5); p.mp = Math.round(p.maxMp * 0.5);
        sendHp(p); sendMp(p);
        p.zone.emit('playerRevive', { id: p.id, x: p.x, z: p.z });
        socket.emit('revived', { x: p.x, z: p.z });
        return;
      }
      p.hp = p.maxHp; p.mp = p.maxMp; sendMp(p);
      moveToZone(p, villageFor(p.zone ? p.zone.id : 0));
      sendHp(p);
    });

    socket.on('chat', (text) => {
      const t = String(text || '').replace(/[<>&"'\\]/g, '').trim().slice(0, 80);
      if (p.gm && t.startsWith('/')) { gmCommand(p, t); return; }
      if (t && p.zone) p.zone.emit('chat', { name: p.name, text: t, gm: !!p.gm });
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
  // her saniye: mana yenilenmesi, biten güçlendirmeler
  setInterval(() => {
    const now = Date.now();
    for (const p of Object.values(players)) {
      if (p.dead) continue;
      if (p.mp < p.maxMp) {
        const rate = now - (p.lastHurt || 0) > 5000 ? 0.04 : 0.015;
        p.mp = Math.min(p.maxMp, p.mp + Math.max(1, Math.round(p.maxMp * rate)));
        sendMp(p);
      }
      let expired = false;
      for (const [stat, b] of Object.entries(p.buffs)) if (b.until <= now) { delete p.buffs[stat]; expired = true; }
      if (expired) { recalc(p); sendInv(p); sendBuffs(p); sendHp(p); sendMp(p); }
    }
  }, 1000);
  // balık oltaya geldi mi?
  setInterval(() => {
    const now = Date.now();
    for (const p of Object.values(players)) {
      if (p.fish && !p.fish.bitten && now >= p.fish.biteAt) { p.fish.bitten = true; p.socket.emit('fishBite'); }
      if (p.fish && p.fish.bitten && now > p.fish.biteAt + 1800) {
        p.fish = null; p.socket.emit('fishEnd', { ok: false, msg: 'Geç kaldın, balık kaçtı.' });
        if (p.zone) p.zone.emit('fishing', { id: p.id, on: false });
      }
    }
  }, 100);

  return {
    async saveAll() { await Promise.all(Object.values(players).map(save)); },
    online: () => Object.keys(players).length,
    zones,       // testler için
    players,
  };
}

module.exports = { createWorld };
