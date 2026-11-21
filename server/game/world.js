// Oyun dünyası: bağlantılar, oyuncu komutları, envanter, dükkân, haritalar arası geçiş.
const db = require('../db');
const { accountFromToken } = require('../auth');
const R = require('./rules');
const config = require('../config');
const { Zone, boundsOf } = require('./zone');
const { createSocial } = require('./social');
const { createGuilds } = require('./guild');
const { createRealm } = require('./realm');
const { createMarket } = require('./market');
const { createDungeons } = require('./dungeon');
const { createMainQuests } = require('./mainq');
const { createDepot } = require('./depot');
const { createWorldBoss } = require('./worldboss');
const { createPremium } = require('./premium');
const { createEvents, EVENT_TYPES } = require('./events');
const { createRanking } = require('./ranking');

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const VILLAGES = R.MAPS.filter((m) => m.village).map((m) => m.id);
const HORSE_QUEST = { level: 25, mob: 'vkurt', count: 20 };
// balık tutarken takılanlar: balıklar, istiridye, yapraklar, efsun nesneleri ve nadiren pet sandığı
const FISH_TABLE = [['b_hamsi', 34], ['b_sazan', 22], ['b_alabalik', 13], ['b_levrek', 8], ['b_yayin', 3], ['istiridye', 4], ['b_cizme', 5],
  ['yaprak_mor', 4], ['yaprak_mavi', 3], ['yaprak_kirmizi', 2], ['efsun', 2.5], ['efsun_degis', 2], ['pet_sandik', 1]];
const PET_BOX = [['pet_kurt', 20], ['pet_tilki', 20], ['pet_ayi', 17], ['pet_baykus', 17], ['pet_yilan', 14], ['pet_uzayli', 9], ['pet_ejder', 3]];
const PEARLS = [['inci_beyaz', 70], ['inci_mavi', 25], ['inci_kirmizi', 5]];
function z0announce(p, msg) { if (p.zone) p.zone.emit('announce', msg); }
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
    for (const s of ['weapon', 'armor', 'helmet', 'costume', 'wings', 'pet']) l[s] = p.equip[s] ? p.equip[s].key : null;
    // +9 parlaması için silah ve zırhın artısı
    l.up = { weapon: (p.equip.weapon && p.equip.weapon.up) || 0, armor: (p.equip.armor && p.equip.armor.up) || 0 };
    return l;
  }
  const publicPlayer = (p) => ({ id: p.id, name: p.name, cls: p.class, x: p.x, z: p.z, ry: p.ry, level: p.level,
    look: looks(p), hp: p.hp, maxHp: p.maxHp, dead: !!p.dead, mounted: !!p.mounted, gm: !!p.gm,
    guild: p.guild ? p.guild.name : null, empire: p.empire || 0 });
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
      speed: R.speedMul(p), atkCd: R.attackCooldown(p), mounted: !!p.mounted, invSize: R.invSize(p) });
    sendAttrs(p);
    if (p.trade) tradeCheck(p);
  }
  function sendMp(p) { p.socket.emit('mp', { mp: p.mp, max: p.maxMp }); }
  // karakter penceresi: özellikler, boş puan ve hesaplanmış değerler
  function sendAttrs(p) {
    const t = R.totals(p);
    p.socket.emit('attrs', { values: R.statValues(p), base: R.BASE_STATS[p.class], free: R.statPointsFree(p), max: R.STAT_MAX,
      main: R.MAIN_STAT[p.class], bonus: R.statBonus(p),
      atk: R.attackPower(p), def: R.defense(p), maxHp: p.maxHp, maxMp: p.maxMp,
      crit: Math.round(((R.classOf(p).crit || 0.12) * 100) + t.crit), skill: t.skill, atkspeed: t.atkspeed, movespeed: t.movespeed,
      pierce: t.pierce, dodge: t.dodge, monster: t.monster, hpsteal: t.hpsteal, vs: Object.fromEntries(R.CLASS_KEYS.map((c) => [c, t['vs_' + c] || 0])) });
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
        if (p.inventory.length >= R.invSize(p)) return false;
        const add = Math.min(n, def.stack);
        p.inventory.push({ uid: p.nextUid++, key, n: add }); n -= add;
      }
      return true;
    }
    if (p.inventory.length >= R.invSize(p)) return false;
    p.inventory.push({ uid: p.nextUid++, key });
    return true;
  }
  const countItem = (p, key) => p.inventory.reduce((a, i) => a + (i.key === key ? (i.n || 1) : 0), 0);
  // yığınlardan n adet eksilt (biten yığın çantadan çıkar)
  function takeItem(p, key, n) {
    for (let i = p.inventory.length - 1; i >= 0 && n > 0; i--) {
      const it = p.inventory[i];
      if (it.key !== key) continue;
      const t = Math.min(n, it.n || 1);
      it.n = (it.n || 1) - t; n -= t;
      if (it.n <= 0) p.inventory.splice(i, 1);
    }
  }
  function freeSlotsFor(p, key, n) {
    const def = R.ITEMS[key];
    if (!def.stack) return p.inventory.length < R.invSize(p);
    let room = (R.invSize(p) - p.inventory.length) * def.stack;
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
    p.quests.bag = 2;                                   // GM'nin üç envanter sayfası da açık
    if (!p.quests.gmPets) { giveAllPets(p); p.quests.gmPets = 1; }
    if (p.quests.gmKit === 1) return;
    gmTarget = p;
    const cls = R.CLASSES[p.class] || {};
    const wtype = String(cls.startWeapon || 'sword0').replace(/\d+$/, '');
    const top = (base) => (R.ITEMS[base + '15_L'] ? base + '15_L' : base + '15');
    // eski kuşanılanlar çantaya
    for (const slot of R.EQUIP_SLOTS) if (p.equip[slot] && p.inventory.length < R.invSize(p)) p.inventory.push(p.equip[slot]);
    p.equip = { weapon: maxedItem(top(wtype)), armor: maxedItem(top('armor')), helmet: maxedItem(top('helmet')),
      shoes: maxedItem(top('shoes')), bracelet: maxedItem(top('bracelet')), earring: maxedItem(top('earring')) };
    const give = [['isin_yuzugu', 1], ['at_muhru', 1], ['olta', 1], ['yem', 200], ['p_hp4', 200], ['p_mp4', 200], ['p_green', 50], ['p_speed', 50], ['efsun', 100], ['efsun_degis', 100]];
    for (const [key, n] of give) {
      if (!R.ITEMS[key] || p.inventory.some((i) => i.key === key)) continue;
      if (p.inventory.length >= R.invSize(p)) break;
      p.inventory.push({ uid: p.nextUid++, key, n });
    }
    // diğer silah türlerinin en üst kademeleri de (yer varsa)
    for (const t of ['sword', 'dagger', 'bow', 'staff']) {
      if (t === wtype || p.inventory.length >= R.invSize(p)) continue;
      p.inventory.push(maxedItem(top(t)));
    }
    p.yang = Math.max(p.yang, 999999999);
    p.quests.horse = 'done';
    p.quests.rod = true; p.quests.skillHint = true;
    p.quests.gmKit = 1;
    gmTarget = null;
  }
  // bütün evcil hayvanlar (eksik olanlar) çantaya
  function giveAllPets(p) {
    const pets = Object.keys(R.ITEMS).filter((k) => R.ITEMS[k].slot === 'pet');
    let n = 0;
    for (const k of pets) {
      if (p.inventory.some((i) => i.key === k) || (p.equip.pet && p.equip.pet.key === k)) continue;
      if (p.inventory.length >= R.invSize(p)) break;
      p.inventory.push({ uid: p.nextUid++, key: k }); n++;
    }
    return n;
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
      if (p.inventory.length >= R.invSize(p)) { notice(p, 'Çanta dolu.'); return; }
      p.inventory.push(it); sendInv(p); notice(p, R.ITEMS[a0].name + ' verildi.'); return;
    }
    if (cmd === 'savas') { realm.gm(p, args); return; }
    if (cmd === 'etkinlik') { events.gm(p, args); return; }
    if (cmd === 'ep') {
      const n = Number(args[1]);
      if (!a0 || !Number.isFinite(n)) { notice(p, 'Kullanım: /ep <karakter adı> <miktar> (eksi miktar düşer)'); return; }
      premium.grantEp(a0, Math.round(n)).then((left) => notice(p, left == null ? `${a0} bulunamadı.` : `${a0} hesabına ${n} EP verildi (şimdi ${left} EP).`)).catch((e) => notice(p, 'EP verilemedi: ' + e.message));
      return;
    }
    if (cmd === 'dunyaboss') { worldboss.gm(p, args); return; }
    if (cmd === 'petler') { const n = giveAllPets(p); sendInv(p); notice(p, n ? `${n} evcil hayvan çantana kondu.` : 'Bütün petler zaten sende (ya da çanta dolu).'); return; }
    if (cmd === 'silahlar') {
      // /silahlar: kendi sınıfının bütün silahları; /silahlar kilic|hancer|yay|asa|hepsi
      const TYPES = { kilic: 'sword', hancer: 'dagger', yay: 'bow', asa: 'staff' };
      const want = a0 && TYPES[a0];
      if (a0 && !want && a0 !== 'hepsi') { notice(p, 'Kullanım: /silahlar [kilic|hancer|yay|asa|hepsi]'); return; }
      const keys = Object.keys(R.ITEMS).filter((k) => {
        const d = R.ITEMS[k];
        if (d.slot !== 'weapon') return false;
        if (a0 === 'hepsi') return true;
        return want ? d.type === want : (d.classes || []).includes(p.class);
      }).sort((x, y) => (R.ITEMS[x].tier - R.ITEMS[y].tier) || x.localeCompare(y));
      let n = 0;
      gmTarget = p;
      for (const k of keys) {
        if (p.inventory.length >= R.invSize(p)) break;
        p.inventory.push(maxedItem(k)); n++;
      }
      gmTarget = null;
      sendInv(p);
      notice(p, n < keys.length ? `${n} silah çantana kondu, ${keys.length - n} tanesi sığmadı (çanta dolu).` : `${n} silah çantana kondu.`);
      return;
    }
    if (cmd === 'iyiles') { p.hp = p.maxHp; p.mp = p.maxMp; sendHp(p); sendMp(p); return; }
    notice(p, 'GM komutları: /git <harita>, /seviye <n>, /yang <n>, /esya <anahtar> [adet], /silahlar [kilic|hancer|yay|asa|hepsi], /petler, /ep <isim> <miktar>, /iyiles, /savas [bitir], /dunyaboss [bitir], /etkinlik <metin|exp|boss|drop> [dk]');
  }

  // zindan ve savaş meydanı kaydedilmez: oyuncu tekrar girince köyde başlar
  const hiddenMap = (p) => { const id = p.zone ? p.zone.id : p.mapId; return !!(R.MAPS[id] && R.MAPS[id].hidden); };
  async function save(p) {
    try {
      await db.query(
        `UPDATE characters SET level=$2, exp=$3, yang=$4, kills=$5, pos_x=$6, pos_z=$7,
         inventory=$8, equip=$9, next_uid=$10, map_id=$11, hp=$12, mp=$13, skills=$14, quests=$15, stats=$16, friends=$17, last_played=now() WHERE id=$1`,
        [p.charId, p.level, p.exp, p.yang, p.kills, hiddenMap(p) ? null : p.x, hiddenMap(p) ? null : p.z, JSON.stringify(p.inventory), JSON.stringify(p.equip),
         p.nextUid, hiddenMap(p) ? villageFor(0) : p.zone ? p.zone.id : p.mapId, p.dead ? p.maxHp : p.hp, p.mp, JSON.stringify(p.skills), JSON.stringify(p.quests), JSON.stringify(p.stats || {}), JSON.stringify(p.friends || [])]);
    } catch (e) { console.error('Kayıt hatası', p.name, e.message); }
  }

  // ---------- tecrübe, hasar, iyileşme ----------
  // tecrübe çarpanı: lonca seviyesi, etkinlikler, krallık savaşı ödülü
  function expMul(p) { return 1 + guilds.expBonus(p) / 100 + (W.expBonus ? W.expBonus(p) : 0); }
  function expRaw(p, amount, kill, fromMob = true) {
    if (kill) p.kills++;
    if (fromMob) { amount = Math.round(amount * expMul(p)); guilds.addExp(p, amount); }
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
      guilds.onLevel(p);
    }
    sendStats(p, up);
    p.socket.emit('expGain', amount);
  }

  // ---------- bölgelerin ihtiyaç duyduğu işlemler ----------
  const hooks = {
    publicPlayer,
    dropMul: () => events.dropMul(),
    // grup varsa tecrübe yakındaki üyelerle paylaşılır
    giveExp(p, amount) { social.shareExp(p, amount, expRaw); },
    onStoneBroken(p) { social.progress(p, 'stone'); mainq.onStoneBroken(p); },
    // metin taşından ek ganimet: otomatik iksirler
    stoneBonus() { const k = premium.autoPotionRoll(0.6); return k ? [k] : []; },
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
      social.onMobKilled(p, m);
      mainq.onMobKilled(p, m);
    },
    announce(text, zone) { (zone ? zone : io).emit('announce', text); },
    // düello: rakip (geri sayım bittiyse)
    duelOpponent(p) {
      const d = p.duel;
      if (!d || Date.now() < d.start) return null;
      const o = d.with;
      return o && !o.dead && o.zone === p.zone && o.duel && o.duel.with === p ? o : null;
    },
    // vurulabilecek oyuncular: düello rakibi + savaş meydanında düşman krallık
    enemies(p) {
      const list = realm.enemies(p);
      const o = hooks.duelOpponent(p);
      if (o && !list.includes(o)) list.push(o);
      return list;
    },
    pvpDamage(p, t, dmg, crit) {
      if (t.dead) return;
      const inDuel = p.duel && p.duel.with === t;
      if (!inDuel && !realm.isEnemy(p, t)) return;
      if (!inDuel) {
        const left = Math.max(0, t.hp - dmg);
        if (p.zone) p.zone.emit('hit', { id: t.id, kind: 'player', dmg, crit, hp: left, max: t.maxHp, by: p.id });
        if (left <= 0) { realm.onKill(p, t); hooks.damagePlayer(t, dmg); return; }
        t.hp = left; t.lastHurt = Date.now(); sendHp(t);
        return;
      }
      const left = Math.max(0, t.hp - dmg);
      if (p.zone) p.zone.emit('hit', { id: t.id, kind: 'player', dmg, crit, hp: left, max: t.maxHp, by: p.id });
      if (left <= 0) {
        // düelloyu kaybeden ölür (Metin2 gibi); köyde ya da 5 sn sonra burada başlayabilir
        endDuel(p, t, 'win');
        hooks.damagePlayer(t, dmg);
        return;
      }
      t.hp = left; t.lastHurt = Date.now();
      sendHp(t);
    },
  };
  const W = {};      // sonraki aşamaların (krallık, etkinlik) bağlandığı yer
  const social = createSocial({ players, notice, sendInv, addItem, freeSlotsFor, save, sendQuests, giveExpDirect: (p, n) => expRaw(p, n, false, false) });
  const guilds = createGuilds({ db, players, notice, sendInv, addItem, save, announce: (t) => io.emit('announce', t) });
  const realm = createRealm({ db, io, players, notice, moveToZone, sendInv, addItem, save, villageFor });
  const market = createMarket({ db, players, notice, sendInv, addItem, save, zones });
  const dungeons = createDungeons({ io, players, notice, moveToZone, hooks, villageFor });
  const events = createEvents({ io, zones, notice });
  const mainq = createMainQuests({ notice, sendInv, addItem, save });
  const depot = createDepot({ db, notice, sendInv, addItem, freeSlotsFor, save });
  const ranking = createRanking({ db });
  W.expBonus = (p) => realm.expBonus(p) + events.expBonus(p) + premium.expBonus(p);
  for (const def of R.MAPS) zones.push(new Zone(io, def, hooks));
  const premium = createPremium({ db, players, notice, sendInv, addItem, freeSlotsFor, save, sendHp, sendMp });
  const worldboss = createWorldBoss({ db, io, players, zones, notice, moveToZone, sendInv, addItem, save, villageFor, hooks, addEp: (p, n) => premium.addEp(p, n), giveExp: (p, n) => expRaw(p, n, false, false) });

  // seviye ödülleri: 25'te at görevi, 30'da olta
  function levelRewards(p) {
    const q = p.quests;
    if (typeof mainq !== 'undefined' && p.socket) mainq.onLevel(p);
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
    if (p.trade) closeTrade(p, 'Ticaret iptal: harita değişti.');
    const target = mapId && typeof mapId === 'object' ? mapId : zones[mapId];   // zindan kopyası doğrudan verilebilir
    if (!target) return;
    if (p.duel) endDuel(null, p, 'left');
    if (p.zone) p.zone.removePlayer(p);
    p.fish = null;
    if (target.def.safe) p.mounted = false;
    const [sx, sz] = pos || target.def.spawn;
    const jitter = pos ? 0 : 3;
    p.x = target.clampX(sx + (Math.random() - 0.5) * jitter); p.z = target.clampX(sz + (Math.random() - 0.5) * jitter);
    p.lastMove = Date.now();
    target.addPlayer(p);
    p.socket.emit('mapChange', { ...target.snapshot(), you: { x: p.x, z: p.z } });
    market.afterMove(p, target);
  }

  // ---------- ticaret (Metin2 gibi: iki taraf eşya + yang koyar, ikisi de onaylayınca takas olur) ----------
  const TRADE_MAX = 12;
  const tradeView = (side) => ({ items: side.items.map((x) => {
    const it = side.p.inventory.find((i) => i.uid === x.uid) || {};
    return { uid: x.uid, key: x.key, n: x.n, up: it.up || 0, sock: it.sock || [], bon: it.bon || [] };
  }), yang: side.yang, ok: side.ok });
  function sendTrade(t) {
    for (const [me, them] of [[t.a, t.b], [t.b, t.a]]) me.p.socket.emit('tradeState', { me: tradeView(me), them: tradeView(them) });
  }
  function closeTrade(p, msg, done = false) {
    const t = p && p.trade; if (!t) return;
    for (const s of [t.a, t.b]) { s.p.trade = null; s.p.socket.emit('tradeClose', { done, msg }); }
  }
  const sameOffer = (it, x) => it.key === x.key && (it.n || 1) === x.n && (it.up || 0) === x.up && (it.sock || []).length === x.sk;
  // ticaret açıkken çantası değişirse (eşya kuşanıldı, satıldı, yükseltildi) teklif güncellenir ve onaylar sıfırlanır
  function tradeCheck(p) {
    const t = p.trade; if (!t) return;
    const me = t.a.p === p ? t.a : t.b;
    const keep = me.items.filter((x) => { const it = p.inventory.find((i) => i.uid === x.uid); return it && sameOffer(it, x); });
    if (me.yang > p.yang) me.yang = p.yang;
    if (keep.length !== me.items.length || me.yang !== me._y) { me.items = keep; me._y = me.yang; tradeChanged(t); }
  }
  const sideOf = (p) => (p.trade.a.p === p ? p.trade.a : p.trade.b);
  function tradeChanged(t) { t.a.ok = false; t.b.ok = false; sendTrade(t); }
  // takası uygula: önce her şey doğrulanır, sonra iki çanta birden değişir
  function doTrade(t) {
    const sides = [t.a, t.b];
    for (const s of sides) {
      for (const x of s.items) {
        const it = s.p.inventory.find((i) => i.uid === x.uid);
        if (!it || !sameOffer(it, x)) { closeTrade(s.p, 'Ticaret iptal: teklif edilen eşya değişti.'); return; }
      }
      if (s.yang > s.p.yang) { closeTrade(s.p, 'Ticaret iptal: yeterli yang yok.'); return; }
    }
    const next = sides.map((s) => {
      const give = new Set(s.items.map((x) => x.uid));
      return { inventory: s.p.inventory.filter((i) => !give.has(i.uid)).map((i) => ({ ...i })), nextUid: s.p.nextUid, quests: s.p.quests };
    });
    for (let k = 0; k < 2; k++) {
      const to = next[k], from = sides[1 - k];
      for (const x of from.items) {
        const it = from.p.inventory.find((i) => i.uid === x.uid), def = R.ITEMS[it.key];
        if (def && def.stack) { if (!addItem(to, it.key, it.n || 1)) { closeTrade(sides[k].p, `Ticaret iptal: ${sides[k].p.name} oyuncusunun çantası dolu.`); return; } }
        else { if (to.inventory.length >= R.invSize(to)) { closeTrade(sides[k].p, `Ticaret iptal: ${sides[k].p.name} oyuncusunun çantası dolu.`); return; }
          to.inventory.push({ ...it, uid: to.nextUid++ }); }
      }
    }
    for (let k = 0; k < 2; k++) {
      const s = sides[k], o = sides[1 - k];
      s.p.inventory = next[k].inventory; s.p.nextUid = next[k].nextUid;
      s.p.yang = s.p.yang - s.yang + o.yang;
    }
    const names = (s) => s.items.map((x) => (R.ITEMS[x.key] || {}).name + (x.n > 1 ? ` x${x.n}` : '')).join(', ') || '-';
    console.log(`Ticaret: ${t.a.p.name} [${names(t.a)} + ${t.a.yang} yang] <-> ${t.b.p.name} [${names(t.b)} + ${t.b.yang} yang]`);
    closeTrade(t.a.p, 'Ticaret tamamlandı.', true);
    for (const s of sides) { sendInv(s.p); save(s.p); }
  }

  // ---------- düello ----------
  function endDuel(winner, loser, why) {
    const a = loser, b = a.duel ? a.duel.with : null;
    if (a) a.duel = null;
    if (b) b.duel = null;
    const z = (winner || a).zone;
    if (why === 'win' && winner) {
      notice(winner, `Düelloyu kazandın! (${loser.name})`);
      winner.quests.duelWins = (winner.quests.duelWins || 0) + 1; social.progress(winner, 'duel'); notice(loser, `Düelloyu kaybettin. Kazanan: ${winner.name}`);
      if (z) { z.emit('duelEnd', { a: winner.id, b: loser.id, winner: winner.id }); hooks.announce(`${winner.name}, düelloda ${loser.name} karşısında kazandı!`, z); }
    } else {
      for (const o of [a, b]) if (o) { notice(o, 'Düello sona erdi.'); }
      if (z && b) z.emit('duelEnd', { a: a.id, b: b.id, winner: null });
    }
  }
  const byName = (name) => Object.values(players).find((o) => o.name.toLocaleLowerCase('tr-TR') === String(name || '').toLocaleLowerCase('tr-TR'));
  function sendFriends(p) {
    p.socket.emit('friends', (p.friends || []).map((n) => {
      const o = byName(n);
      return { name: n, online: !!o, map: o && o.zone ? o.zone.def.name : null, level: o ? o.level : null, cls: o ? o.class : null };
    }));
  }
  // arkadaşlara giriş/çıkış haberi
  function tellFriends(p, on) {
    for (const n of p.friends || []) {
      const o = byName(n);
      if (o && o !== p && (o.friends || []).includes(p.name)) { notice(o, `Arkadaşın ${p.name} ${on ? 'oyuna girdi' : 'oyundan çıktı'}.`); sendFriends(o); }
    }
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
      id: socket.id, socket, charId: row.id, accountId: row.account_id, name: row.name, class: row.class,
      x: 0, z: 0, ry: 0, moving: false, lastAttack: 0, lastMove: Date.now(), combo: 0, lastPotion: 0,
      level: row.level, exp: row.exp, yang: Number(row.yang), kills: row.kills,
      inventory: row.inventory || [], equip: row.equip || {}, nextUid: row.next_uid,
      mapId: R.MAPS[row.map_id] && !R.MAPS[row.map_id].hidden ? row.map_id : 0, hp: row.hp, dead: false, zone: null,
      mp: row.mp, skills: row.skills || {}, quests: row.quests || {}, stats: row.stats || {}, buffs: {}, skillCd: {}, mounted: false,
      fish: null, facing: 0, friends: Array.isArray(row.friends) ? row.friends : [], duel: null,
      guildId: row.guild_id || null, guildRank: row.guild_rank || 0, guild: null, empire: row.empire || 0,
    };
    if (prev) {
      for (const k of ['level', 'exp', 'yang', 'kills', 'inventory', 'equip', 'nextUid', 'hp', 'mp', 'skills', 'quests', 'stats', 'buffs', 'friends']) p[k] = prev[k];
      if (prev.zone) p.mapId = prev.zone.instance ? prev.zone : prev.zone.id;
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
      id: socket.id, cls: p.class, name: p.name, empire: p.empire || 0,
      stats: { level: p.level, exp: p.exp, need: R.expForLevel(p.level) },
      villages: VILLAGES,
    });
    moveToZone(p, p.mapId, startPos);
    sendInv(p);
    sendFriends(p); tellFriends(p, true);
    sendHp(p); sendMp(p); sendSkills(p); sendQuests(p); sendBuffs(p);
    social.onConnect(p, socket);
    mainq.onConnect(p, socket);
    depot.onConnect(p, socket);
    worldboss.onConnect(p, socket);
    premium.onConnect(p, socket);
    guilds.onConnect(p, socket);
    realm.onConnect(p, socket);
    market.onConnect(p, socket);
    dungeons.onConnect(p, socket);
    events.onConnect(p, socket);
    ranking.onConnect(p, socket);

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
      if (p.quests.warhorse !== 'done') setMounted(p, false);   // savaş atıyla atın üstünde vurulabilir
      p.combo = now - p.lastAttack < 1200 ? (p.combo + 1) % 3 : 0;
      p.lastAttack = now;
      p.zone.attack(p, p.combo);
    });

    socket.on('pickup', (dropId) => {
      const z = p.zone; if (!z || p.dead) return;
      const d = z.drops.get(Number(dropId));
      if (!d || Math.hypot(d.x - p.x, d.z - p.z) > 3) return;
      const owner = d.owner != null ? players[d.owner] : null;
      if (d.owner !== p.id && Date.now() < d.ownerUntil && !social.sameParty(owner, p)) { notice(p, 'Bu ganimet başkasına ait. Biraz bekle.'); return; }
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
      if (p.inventory.length >= R.invSize(p)) { notice(p, 'Envanterin dolu!'); return; }
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
      if (premium.use(p, it, 1)) return;          // süreli eşyalar ve balık açma
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
      if (it.key === 'pet_sandik') {
        const pet = roll(PET_BOX);
        consume(it);
        if (!addItem(p, pet, 1)) { addItem(p, 'pet_sandik', 1); notice(p, 'Envanterin dolu!'); sendInv(p); return; }
        notice(p, `Pet Sandığından ${R.ITEMS[pet].name} çıktı!`);
        if (p.zone) p.zone.emit('announce', `${p.name} Pet Sandığından ${R.ITEMS[pet].name} çıkardı!`);
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
      if (it.key === 'at_muhru' || it.key === 'savas_muhru') {
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
      if (!def || !R.GEAR_SLOTS.includes(def.slot)) return null;
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
      if (sk.target !== 'self' && sk.target !== 'heal' && !p.zone.hasSkillTarget(p, sk)) { notice(p, 'Hedef yok.'); return; }
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
      p.zone.emit('skillFx', { id: p.id, key, targets, x: p.x, z: p.z, lv });
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
      socket.emit('fishEnd', { ok: true, msg: R.ITEMS[key].slot === 'fish' ? `${R.ITEMS[key].name} tuttun!` : `Oltana ${R.ITEMS[key].name} takıldı!`, key });
      if (key === 'pet_sandik') z0announce(p, `${p.name} oltasıyla bir Pet Sandığı çıkardı!`);
      if (!key.startsWith('b_cizme')) social.progress(p, 'fish');
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
      if (![...shop.potions, ...shop.weapons, ...shop.armor, ...(shop.cosmetics || [])].includes(key)) return;
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
      if (target.hidden && !p.gm) { notice(p, `${target.name} buradan gidilemez.`); return; }
      if (!p.gm && p.level < target.minLevel) { notice(p, `${target.name} için en az ${target.minLevel}. seviye olmalısın.`); return; }
      moveToZone(p, target.id);
    });

    // yeniden doğ: köyde (hemen) ya da burada (Metin2 gibi 5 saniye sonra, yarım canla)
    socket.on('respawn', (opt) => {
      if (!p.dead) return;
      const here = opt && opt.here;
      if (here && Date.now() - (p.diedAt || 0) < 5000) { notice(p, 'Burada başlamak için biraz bekle.'); return; }
      p.dead = false; p.mounted = false;
      const warPos = realm.respawnPos(p) || worldboss.respawnPos(p);   // savaş meydanı ve ejder yuvası kendi başlangıcında
      if (warPos) { p.x = warPos[0]; p.z = warPos[1]; }
      if ((here || warPos) && p.zone) {
        p.hp = Math.round(p.maxHp * (warPos ? 1 : 0.5)); p.mp = Math.round(p.maxMp * (warPos ? 1 : 0.5));
        sendHp(p); sendMp(p);
        p.zone.emit('playerRevive', { id: p.id, x: p.x, z: p.z });
        socket.emit('revived', { x: p.x, z: p.z });
        return;
      }
      p.hp = p.maxHp; p.mp = p.maxMp; sendMp(p);
      moveToZone(p, villageFor(p.zone ? p.zone.id : 0));
      sendHp(p);
    });

    // ---------- demirci ----------
    // eşyayı +1 yükselt (ya da ruh taşının derecesini artır). { slot } | { uid }, scroll: Kutsama Kağıdı kullan
    socket.on('upgrade', (data) => {
      const z = p.zone; if (!z || !z.def.shop) { notice(p, 'Demirci sadece köyde.'); return; }
      let target = null;
      if (data && data.slot && R.EQUIP_SLOTS.includes(data.slot)) target = p.equip[data.slot];
      else if (data && data.uid != null) target = p.inventory.find((i) => i.uid === Number(data.uid));
      const def = target && R.ITEMS[target.key];
      if (!def) return;
      // ruh taşı: +0..+4, başarısızsa taş kırılır
      if (def.stone) {
        const g = def.stone.grade;
        if (g >= 4) { notice(p, 'Bu taş zaten en yüksek derecede (+4).'); return; }
        const cost = R.stoneUpCost(g);
        if (p.yang < cost) { notice(p, `Yeterli Yang yok (${cost.toLocaleString('tr-TR')} gerekli).`); return; }
        p.yang -= cost;
        const ok = Math.random() * 100 < R.STONE_UP_CHANCE[g];
        // yığından bir taş al
        if ((target.n || 1) > 1) target.n--; else p.inventory.splice(p.inventory.indexOf(target), 1);
        const nk = `tas_${def.stone.type}_${g + 1}`;
        if (ok) addItem(p, nk, 1);
        notice(p, ok ? `Başarılı! ${R.ITEMS[nk].name} oldu.` : `Başarısız… ${def.name} kırıldı.`);
        socket.emit('upgraded', { ok, name: ok ? R.ITEMS[nk].name : def.name, stone: true });
        sendInv(p);
        return;
      }
      if (!R.GEAR_SLOTS.includes(def.slot)) { notice(p, 'Bu eşya yükseltilemez.'); return; }
      const up = target.up || 0;
      if (up >= R.MAX_UP) { notice(p, `${def.name} zaten +${R.MAX_UP}.`); return; }
      const cost = R.upgradeCost(def, up);
      if (p.yang < cost) { notice(p, `Yeterli Yang yok (${cost.toLocaleString('tr-TR')} gerekli).`); return; }
      const scroll = data && data.scroll ? p.inventory.find((i) => i.key === 'kutsama') : null;
      if (data && data.scroll && !scroll) { notice(p, 'Kutsama Kağıdın yok.'); return; }
      // yapraklar (Sv. 30+ eşya, +6 ve üstü)
      const need = R.leafNeed(def, up);
      if (need) {
        const miss = R.LEAVES.filter((k) => countItem(p, k) < need);
        if (miss.length) { notice(p, `Bu yükseltme için ${need}'şer ${R.LEAVES.map((k) => R.ITEMS[k].name).join(', ')} gerekir. Eksik: ${miss.map((k) => R.ITEMS[k].name).join(', ')}.`); return; }
        for (const k of R.LEAVES) takeItem(p, k, need);
      }
      p.yang -= cost;
      const ok = Math.random() * 100 < R.UP_CHANCE[up];
      let msg;
      if (ok) { target.up = up + 1; msg = `Başarılı! ${def.name} +${target.up} oldu.`; }
      else if (scroll) { consume(scroll); msg = `Başarısız… Kutsama Kağıdı eşyanı korudu (+${up}).`; }
      else if (up >= 4) { target.up = up - 1; msg = `Başarısız… ${def.name} +${target.up} seviyesine düştü.`; }
      else msg = `Başarısız… ${def.name} +${up} olarak kaldı.`;
      notice(p, msg);
      socket.emit('upgraded', { ok, name: def.name, up: target.up || 0 });
      social.progress(p, 'upgrade');
      recalc(p); sendInv(p); sendHp(p); sendMp(p);
      if (p.zone) p.zone.emit('look', { id: p.id, look: looks(p) });   // +9 parlaması herkese görünsün
      if (ok && target.up >= 7 && p.zone) hooks.announce(`${p.name}, ${def.name} eşyasını +${target.up} yaptı!`, p.zone);
    });
    // ruh taşı tak: { stone: uid, slot | uid }
    socket.on('socketStone', (data) => {
      const st = p.inventory.find((i) => i.uid === Number(data && data.stone));
      const sd = st && R.ITEMS[st.key] && R.ITEMS[st.key].stone;
      if (!sd) return;
      let target = null;
      if (data.slot && R.EQUIP_SLOTS.includes(data.slot)) target = p.equip[data.slot];
      else if (data.uid != null) target = p.inventory.find((i) => i.uid === Number(data.uid));
      const def = target && R.ITEMS[target.key];
      if (!def || def.slot !== sd.for) { notice(p, sd.for === 'weapon' ? 'Bu taş sadece silaha takılır.' : 'Bu taş sadece zırha takılır.'); return; }
      target.sock = target.sock || [];
      if (target.sock.length >= (R.SOCKETS[def.slot] || 0)) { notice(p, 'Bu eşyanın taş yuvaları dolu.'); return; }
      if (target.sock.some((k) => R.ITEMS[k] && R.ITEMS[k].stone.type === sd.type)) { notice(p, 'Aynı türden taş bir eşyaya bir kez takılır.'); return; }
      const ok = Math.random() * 100 < R.STONE_ADD_CHANCE[sd.grade];
      const name = R.ITEMS[st.key].name;
      if (ok) target.sock.push(st.key);
      consume(st);
      notice(p, ok ? `${name} ${def.name} eşyasına takıldı.` : `Başarısız… ${name} kırıldı.`);
      socket.emit('socketed', { ok });
      recalc(p); sendInv(p); sendHp(p); sendMp(p);
    });

    // ---------- düello, arkadaşlık, fısıltı ----------
    const other = (id) => { const o = players[String(id)]; return o && o !== p && o.zone === p.zone ? o : null; };
    // ---------- ticaret ----------
    socket.on('tradeRequest', (id) => {
      const o = other(id);
      if (!o) { notice(p, 'Oyuncu bulunamadı.'); return; }
      if (p.dead || o.dead) return;
      if (p.trade || o.trade) { notice(p, p.trade ? 'Zaten ticaret yapıyorsun.' : `${o.name} şu an başkasıyla ticaret yapıyor.`); return; }
      if (p.duel || o.duel) { notice(p, 'Düello sırasında ticaret yapılamaz.'); return; }
      if (Math.hypot(o.x - p.x, o.z - p.z) > 10) { notice(p, 'Ticaret için yakın olmalısınız.'); return; }
      o.tradeAsk = { from: p.id, at: Date.now() };
      o.socket.emit('tradeAsk', { id: p.id, name: p.name, level: p.level });
      notice(p, `${o.name} oyuncusuna ticaret isteği gönderildi.`);
    });
    socket.on('tradeAnswer', (data) => {
      const ask = p.tradeAsk; p.tradeAsk = null;
      const o = ask && Date.now() - ask.at < 20000 ? other(ask.from) : null;
      if (!o) return;
      if (!(data && data.ok)) { notice(o, `${p.name} ticaret isteğini reddetti.`); return; }
      if (p.trade || o.trade || p.dead || o.dead || p.duel || o.duel) { notice(p, 'Ticaret başlatılamadı.'); return; }
      const t = { a: { p: o, items: [], yang: 0, _y: 0, ok: false }, b: { p, items: [], yang: 0, _y: 0, ok: false } };
      o.trade = p.trade = t;
      o.socket.emit('tradeOpen', { id: p.id, name: p.name, level: p.level });
      socket.emit('tradeOpen', { id: o.id, name: o.name, level: o.level });
      sendTrade(t);
    });
    socket.on('tradeAdd', (uid) => {
      if (!p.trade) return;
      const me = sideOf(p), it = p.inventory.find((i) => i.uid === Number(uid));
      if (!it || me.items.some((x) => x.uid === it.uid)) return;
      if (me.items.length >= TRADE_MAX) { notice(p, `En fazla ${TRADE_MAX} eşya koyabilirsin.`); return; }
      me.items.push({ uid: it.uid, key: it.key, n: it.n || 1, up: it.up || 0, sk: (it.sock || []).length });
      tradeChanged(p.trade);
    });
    socket.on('tradeRemove', (uid) => {
      if (!p.trade) return;
      const me = sideOf(p), i = me.items.findIndex((x) => x.uid === Number(uid));
      if (i < 0) return;
      me.items.splice(i, 1); tradeChanged(p.trade);
    });
    socket.on('tradeYang', (n) => {
      if (!p.trade) return;
      const v = Math.max(0, Math.min(p.yang, Math.floor(Number(n) || 0)));
      const me = sideOf(p); if (me.yang === v) { sendTrade(p.trade); return; }
      me.yang = v; me._y = v; tradeChanged(p.trade);
    });
    socket.on('tradeAccept', () => {
      const t = p.trade; if (!t) return;
      sideOf(p).ok = true;
      if (t.a.ok && t.b.ok) doTrade(t); else sendTrade(t);
    });
    socket.on('tradeCancel', () => { if (p.trade) closeTrade(p, `${p.name} ticareti iptal etti.`); });
    socket.on('duelRequest', (id) => {
      const o = other(id);
      if (!o) { notice(p, 'Oyuncu bulunamadı.'); return; }
      if (p.dead || o.dead) return;
      if (p.zone.def.safe) { notice(p, 'Burada düello yapılamaz.'); return; }
      if (p.duel || o.duel) { notice(p, 'Biriniz zaten düelloda.'); return; }
      if (Math.hypot(o.x - p.x, o.z - p.z) > 20) { notice(p, 'Düello için yakın olmalısınız.'); return; }
      o.duelAsk = { from: p.id, at: Date.now() };
      o.socket.emit('duelAsk', { id: p.id, name: p.name, level: p.level });
      notice(p, `${o.name} oyuncusuna düello isteği gönderildi.`);
    });
    socket.on('duelAnswer', (data) => {
      const ask = p.duelAsk; p.duelAsk = null;
      const o = ask && Date.now() - ask.at < 20000 ? other(ask.from) : null;
      if (!o || String(data && data.id) !== o.id) return;
      if (!(data && data.ok)) { notice(o, `${p.name} düelloyu reddetti.`); return; }
      if (p.duel || o.duel || p.dead || o.dead) return;
      const start = Date.now() + 3000;
      p.duel = { with: o, start, until: start + 180000 };
      o.duel = { with: p, start, until: start + 180000 };
      p.zone.emit('duelStart', { a: p.id, b: o.id, in: 3 });
    });
    socket.on('friendRequest', (id) => {
      const o = other(id) || players[String(id)];
      if (!o || o === p) return;
      if ((p.friends || []).includes(o.name)) { notice(p, `${o.name} zaten arkadaşın.`); return; }
      if ((p.friends || []).length >= 50) { notice(p, 'Arkadaş listen dolu (50).'); return; }
      o.friendAsk = { from: p.id, at: Date.now() };
      o.socket.emit('friendAsk', { id: p.id, name: p.name, level: p.level });
      notice(p, `${o.name} oyuncusuna arkadaşlık isteği gönderildi.`);
    });
    socket.on('friendAnswer', (data) => {
      const ask = p.friendAsk; p.friendAsk = null;
      const o = ask && Date.now() - ask.at < 60000 ? players[ask.from] : null;
      if (!o || String(data && data.id) !== o.id) return;
      if (!(data && data.ok)) { notice(o, `${p.name} arkadaşlık isteğini reddetti.`); return; }
      for (const [a, b] of [[p, o], [o, p]]) {
        a.friends = a.friends || [];
        if (!a.friends.includes(b.name) && a.friends.length < 50) a.friends.push(b.name);
        notice(a, `${b.name} artık arkadaşın.`); sendFriends(a); save(a);
      }
    });
    socket.on('friendRemove', (name) => {
      p.friends = (p.friends || []).filter((n) => n !== String(name));
      sendFriends(p);
    });
    socket.on('friendsGet', () => sendFriends(p));
    socket.on('whisper', (data) => {
      const t = String((data && data.text) || '').replace(/[<>&"'\\]/g, '').trim().slice(0, 80);
      const o = byName(data && data.to);
      if (!t) return;
      if (!o) { notice(p, `${String((data && data.to) || '').slice(0, 14)} çevrimiçi değil.`); return; }
      const msg = { from: p.name, to: o.name, text: t };
      o.socket.emit('whisper', msg); if (o !== p) socket.emit('whisper', msg);
    });

    socket.on('chat', (text) => {
      const t = String(text || '').replace(/[<>&"'\\]/g, '').trim().slice(0, 80);
      if (p.gm && t.startsWith('/')) { gmCommand(p, t); return; }
      if (t && (social.chat(p, t) || guilds.chat(p, t))) return;
      if (t && p.zone) p.zone.emit('chat', { name: p.name, text: t, gm: !!p.gm });
    });

    socket.on('disconnect', () => {
      if (p.replaced || players[socket.id] !== p) return;
      delete players[socket.id];
      if (p.duel) endDuel(null, p, 'left');
      if (p.trade) closeTrade(p, `${p.name} oyundan çıktı, ticaret iptal.`);
      social.onDisconnect(p); guilds.onDisconnect(p);
      if (p.zone) { p.mapId = p.zone.id; p.zone.removePlayer(p); p.zone = null; }
      tellFriends(p, false);
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
    dungeons.tickAll(dt);
  }, 100);
  setInterval(() => { for (const p of Object.values(players)) save(p); }, 20000);
  // her saniye: mana yenilenmesi, biten güçlendirmeler
  setInterval(() => {
    const now = Date.now();
    social.tick();
    for (const p of Object.values(players)) {
      // düello: süre doldu ya da çok uzaklaştılar
      if (p.duel) {
        const o = p.duel.with;
        if (!o || o.zone !== p.zone || now > p.duel.until || Math.hypot(o.x - p.x, o.z - p.z) > 45) endDuel(null, p, 'left');
      }
      if (p.trade) {
        const o = (p.trade.a.p === p ? p.trade.b : p.trade.a).p;
        if (p.dead || o.dead || o.zone !== p.zone || Math.hypot(o.x - p.x, o.z - p.z) > 15) closeTrade(p, 'Ticaret iptal: oyuncular uzaklaştı.');
      }
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


  // ---------- yönetim paneli (/admin) için işlemler ----------
  // Oyundaki karakter bellekte değiştirilir (kayıt onu yazar); oyunda değilse doğrudan veritabanı güncellenir.
  const findOnline = (name) => Object.values(players).find((o) => o.name.toLocaleLowerCase('tr-TR') === String(name).toLocaleLowerCase('tr-TR'));
  async function charRow(name) {
    const r = await db.query(`SELECT c.*, a.username, a.ep FROM characters c JOIN accounts a ON a.id = c.account_id WHERE lower(c.name) = lower($1)`, [String(name)]);
    return r.rows[0] || null;
  }
  const admin = {
    online() {
      return Object.values(players).map((o) => ({ name: o.name, cls: o.class, level: o.level, map: o.zone ? o.zone.id : o.mapId, hp: o.hp, maxHp: o.maxHp, yang: o.yang, gm: !!o.gm }));
    },
    async character(name) {
      const row = await charRow(name); if (!row) return null;
      const o = findOnline(row.name);
      const src = o || { level: row.level, exp: row.exp, yang: Number(row.yang), kills: row.kills, inventory: row.inventory, equip: row.equip, mapId: row.map_id, quests: row.quests, class: row.class };
      return { name: row.name, cls: src.class, username: row.username, ep: row.ep || 0, online: !!o, level: src.level, exp: src.exp, yang: src.yang, kills: src.kills,
        map: o ? (o.zone ? o.zone.id : o.mapId) : row.map_id, inventory: src.inventory, equip: src.equip, bag: R.invSize({ quests: src.quests || {} }),
        timed: (src.quests && src.quests.timed) || {}, created: row.created_at, lastPlayed: row.last_played, empire: row.empire };
    },
    async give(name, key, n = 1, maxed = true) {
      const def = R.ITEMS[key]; if (!def) throw new Error('Böyle bir eşya yok: ' + key);
      n = Math.max(1, Math.min(def.stack || 1, Number(n) || 1));
      const o = findOnline(name);
      if (o) {
        if (o.inventory.length >= R.invSize(o)) throw new Error(`${o.name} adlı oyuncunun çantası dolu.`);
        gmTarget = o; const it = maxed ? maxedItem(key) : { uid: o.nextUid++, key }; gmTarget = null;
        if (def.stack) it.n = n;
        o.inventory.push(it); sendInv(o); notice(o, `Yönetici sana ${def.name}${n > 1 ? ' x' + n : ''} gönderdi.`);
        return `${o.name} adlı oyuncuya ${def.name} verildi (oyunda).`;
      }
      const row = await charRow(name); if (!row) throw new Error(`${name} adında karakter yok.`);
      const inv = row.inventory || [];
      if (inv.length >= R.invSize({ quests: row.quests || {} })) throw new Error(`${row.name} adlı oyuncunun çantası dolu.`);
      let uid = row.next_uid;
      const it = { uid: uid++, key };
      if (def.stack) it.n = n;
      if (maxed && R.EQUIP_SLOTS.includes(def.slot)) {
        const types = Object.keys(R.BONUS_TYPES).filter((t) => t !== 'movespeed').slice(0, 5);
        it.bon = types.map((t) => [t, R.maxBonus(t, def.tier)]);
      }
      inv.push(it);
      await db.query('UPDATE characters SET inventory = $2, next_uid = $3 WHERE id = $1', [row.id, JSON.stringify(inv), uid]);
      return `${row.name} adlı oyuncuya ${def.name} verildi (oyunda değil, girince çantasında).`;
    },
    async removeItem(name, uid) {
      uid = Number(uid);
      const o = findOnline(name);
      if (o) {
        const k = o.inventory.findIndex((i) => i.uid === uid); if (k < 0) throw new Error('Eşya bulunamadı.');
        const [it] = o.inventory.splice(k, 1); sendInv(o); return `${R.ITEMS[it.key] ? R.ITEMS[it.key].name : it.key} silindi.`;
      }
      const row = await charRow(name); if (!row) throw new Error(`${name} adında karakter yok.`);
      const inv = row.inventory || []; const k = inv.findIndex((i) => i.uid === uid); if (k < 0) throw new Error('Eşya bulunamadı.');
      const [it] = inv.splice(k, 1);
      await db.query('UPDATE characters SET inventory = $2 WHERE id = $1', [row.id, JSON.stringify(inv)]);
      return `${R.ITEMS[it.key] ? R.ITEMS[it.key].name : it.key} silindi.`;
    },
    async setLevel(name, lv) {
      lv = Math.max(1, Math.min(R.MAX_LEVEL, Math.round(Number(lv) || 1)));
      const o = findOnline(name);
      if (o) { o.level = lv; o.exp = 0; recalc(o); sendInv(o); sendHp(o); sendSkills(o); sendStats(o, true); return `${o.name} artık ${lv}. seviye.`; }
      const r = await db.query('UPDATE characters SET level = $2, exp = 0 WHERE lower(name) = lower($1) RETURNING name', [String(name), lv]);
      if (!r.rows[0]) throw new Error(`${name} adında karakter yok.`);
      return `${r.rows[0].name} artık ${lv}. seviye.`;
    },
    async setYang(name, y) {
      y = Math.max(0, Math.min(1e12, Math.round(Number(y) || 0)));
      const o = findOnline(name);
      if (o) { o.yang = y; sendInv(o); return `${o.name}: ${y.toLocaleString('tr-TR')} yang.`; }
      const r = await db.query('UPDATE characters SET yang = $2 WHERE lower(name) = lower($1) RETURNING name', [String(name), y]);
      if (!r.rows[0]) throw new Error(`${name} adında karakter yok.`);
      return `${r.rows[0].name}: ${y.toLocaleString('tr-TR')} yang.`;
    },
    async ep(name, n) {
      const left = await premium.grantEp(name, Math.round(Number(n) || 0));
      if (left == null) throw new Error(`${name} adında karakter yok.`);
      return `${name} hesabında artık ${left} EP var.`;
    },
    teleport(name, mapId) {
      const o = findOnline(name); if (!o) throw new Error(`${name} şu an oyunda değil.`);
      if (!R.MAPS[mapId]) throw new Error('Böyle bir harita yok.');
      moveToZone(o, Number(mapId)); return `${o.name} ${R.MAPS[mapId].name} haritasına ışınlandı.`;
    },
    kick(name) {
      const o = findOnline(name); if (!o) throw new Error(`${name} şu an oyunda değil.`);
      o.socket.emit('kicked', 'Yönetici tarafından oyundan çıkarıldın.'); o.socket.disconnect(true);
      return `${o.name} oyundan çıkarıldı.`;
    },
    announce(text) {
      text = String(text || '').trim().slice(0, 200); if (!text) throw new Error('Duyuru boş.');
      io.emit('announce', '📢 ' + text); return 'Duyuru bütün oyunculara gönderildi.';
    },
    event(type, minutes, stop) {
      if (!EVENT_TYPES[type]) throw new Error('Etkinlik türleri: ' + Object.keys(EVENT_TYPES).join(', '));
      if (stop) { events.stop(type); return `${EVENT_TYPES[type].name} bitirildi.`; }
      events.start(type, Number(minutes) || 0); return `${EVENT_TYPES[type].name} başlatıldı.`;
    },
    eventTypes: () => Object.fromEntries(Object.entries(EVENT_TYPES).map(([k, t]) => [k, { name: t.name, icon: t.icon, min: t.min, desc: t.desc }])),
    events: () => events.list(),
    worldBoss(action) {
      const said = [];
      const fake = { name: 'Yönetici', socket: { emit: (e, d) => said.push(d) } };
      worldboss.gm(fake, action === 'bitir' ? ['bitir'] : ['buradan']);
      return said.length ? said.join(' ') : (action === 'bitir' ? 'Dünya boss\'u bitirildi.' : 'Dünya boss\'u uyandırıldı.');
    },
  };
  return {
    admin,
    async saveAll() { await Promise.all(Object.values(players).map(save)); await guilds.saveAll(); },
    online: () => Object.keys(players).length,
    zones,       // testler için
    players,
  };
}

module.exports = { createWorld };
