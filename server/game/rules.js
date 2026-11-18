// Oyun kuralları: veriler, karakter değerleri, tecrübe, hasar formülleri, efsunlar
const ITEMS = require('../../shared/items.json');
const CLASSES = require('../../shared/classes.json');
const MOBS = require('../../shared/mobs.json');
const MAPS = require('../../shared/maps.json');
const SKILLS = require('../../shared/skills.json');

const MAX_LEVEL = 120;
const INV_SIZE = 32;
const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'shoes', 'bracelet', 'earring'];
const BASE_SPEED = 6;          // m/sn
const MELEE_RANGE = 4.4;
const SKILL_UNLOCK = 5;        // beceriler bu seviyede açılır
const SKILL_MAX = 20;          // 1-17, sonra M1-M3
const MOUNT_SPEED = 1.6;

// ilk 25 seviye normal, sonrası giderek zorlaşır
function expForLevel(lv) {
  const base = 100 + lv * 60 + lv * lv * 4;
  return Math.round(lv > 25 ? base * (1 + (lv - 25) * 0.05) : base);
}
const classOf = (p) => CLASSES[p.class] || CLASSES.savasci;
const skillsOf = (p) => SKILLS[p.class] || [];
const skillPoints = (p) => Math.max(0, p.level - (SKILL_UNLOCK - 1)) - Object.values(p.skills || {}).reduce((a, b) => a + b, 0);

// ---------- efsunlar ----------
const BONUS_TYPES = {
  maxhp:     { name: 'Maks. Can', unit: '', roll: (t) => 40 + t * 35 },
  maxmp:     { name: 'Maks. Mana', unit: '', roll: (t) => 20 + t * 15 },
  atk:       { name: 'Saldırı Değeri', unit: '', roll: (t) => 2 + t * 3 },
  def:       { name: 'Savunma', unit: '', roll: (t) => 2 + t * 3 },
  crit:      { name: 'Kritik Vuruş Şansı', unit: '%', roll: () => 2 + Math.floor(Math.random() * 7) },
  atkspeed:  { name: 'Saldırı Hızı', unit: '%', roll: () => 2 + Math.floor(Math.random() * 7) },
  movespeed: { name: 'Hareket Hızı', unit: '%', roll: () => 2 + Math.floor(Math.random() * 5) },
  monster:   { name: 'Canavarlara Karşı Güç', unit: '%', roll: () => 2 + Math.floor(Math.random() * 9) },
  hpsteal:   { name: 'Can Çalma', unit: '%', roll: () => 1 + Math.floor(Math.random() * 4) },
};
// efsunun alabileceği en yüksek değer (GM eşyaları için)
const BONUS_MAX = { crit: 8, atkspeed: 8, movespeed: 6, monster: 10, hpsteal: 4 };
function maxBonus(type, tier) {
  if (BONUS_MAX[type] != null) return BONUS_MAX[type];
  return Math.round(BONUS_TYPES[type].roll(tier || 0) * 1.2);
}
function rollBonus(type, tier) {
  const b = BONUS_TYPES[type];
  const base = b.roll(tier || 0);
  return b.unit === '%' ? base : Math.round(base * (0.6 + Math.random() * 0.6));
}

// ekipman + efsunlar + güçlendirmeler
// ---------- durum puanları (Metin2 gibi): GÜÇ, CAN, ZEKA, ÇEV ----------
// Her seviyede 3 puan; bir özellik en fazla 90 olur. Ana saldırı özelliği sınıfa göre değişir.
const STAT_KEYS = ['str', 'vit', 'int', 'dex'];
const STAT_MAX = 90;
const STAT_PER_LEVEL = 3;
const BASE_STATS = {
  savasci: { str: 6, vit: 4, int: 3, dex: 3 }, ninja: { str: 4, vit: 3, int: 3, dex: 6 },
  sura: { str: 5, vit: 3, int: 5, dex: 3 }, saman: { str: 3, vit: 4, int: 6, dex: 3 }, okcu: { str: 3, vit: 3, int: 3, dex: 7 },
};
const MAIN_STAT = { savasci: 'str', sura: 'str', ninja: 'dex', okcu: 'dex', saman: 'int' };
function statValues(p) {
  const base = BASE_STATS[p.class] || BASE_STATS.savasci, spent = p.stats || {}, out = {};
  for (const k of STAT_KEYS) out[k] = Math.min(STAT_MAX, base[k] + (spent[k] || 0));
  return out;
}
function statPointsFree(p) {
  const spent = STAT_KEYS.reduce((a, k) => a + ((p.stats || {})[k] || 0), 0);
  return Math.max(0, (p.level - 1) * STAT_PER_LEVEL - spent);
}
// özelliklerin etkisi
function statBonus(p) {
  const v = statValues(p), main = v[MAIN_STAT[p.class] || 'str'];
  return {
    atk: Math.round(main * 1.2 + (MAIN_STAT[p.class] === 'str' ? v.dex : v.str) * 0.25),
    hp: Math.round(v.vit * (14 + p.level * 0.4)),
    def: Math.round(v.vit * 0.6 + v.dex * 0.2),
    mp: Math.round(v.int * (10 + p.level * 0.3)),
    crit: +(v.dex * 0.15).toFixed(1),
    skill: +(v.int * 0.8).toFixed(1),     // beceri hasarı %
  };
}
function skillMul(p) { return 1 + (totals(p).skill || 0) / 100; }

function totals(p) {
  const s = { atk: 0, def: 0, hp: 0, mp: 0, crit: 0, atkspeed: 0, movespeed: 0, monster: 0, hpsteal: 0, skill: 0 };
  const sb = statBonus(p);
  for (const k of Object.keys(sb)) s[k] += sb[k];
  for (const slot of EQUIP_SLOTS) {
    const it = p.equip[slot];
    const def = it && ITEMS[it.key];
    if (!def) continue;
    s.atk += def.atk || 0; s.def += def.def || 0; s.hp += def.hp || 0;
    for (const [type, v] of it.bon || []) {
      if (type === 'maxhp') s.hp += v; else if (type === 'maxmp') s.mp += v; else s[type] = (s[type] || 0) + v;
    }
  }
  const now = Date.now();
  for (const [stat, b] of Object.entries(p.buffs || {})) if (b.until > now) s[stat] = (s[stat] || 0) + b.value;
  return s;
}
function maxHp(p) {
  const c = classOf(p);
  return Math.round(c.hp + p.level * (c.hp / 8) + p.level * p.level * 0.6 + totals(p).hp);
}
function maxMp(p) {
  const c = classOf(p);
  return Math.round(c.mp + p.level * (c.mp / 9) + p.level * p.level * 0.15 + totals(p).mp);
}
function defense(p) { return (classOf(p).def || 0) + totals(p).def; }
function attackPower(p) { return totals(p).atk; }
function speedMul(p) {
  return (classOf(p).speed || 1) * (1 + totals(p).movespeed / 100) * (p.mounted ? MOUNT_SPEED : 1);
}
function attackCooldown(p) {
  const base = p.class === 'ninja' ? 400 : 480;
  return Math.round(base / (1 + totals(p).atkspeed / 100));
}

// oyuncunun vurduğu hasar (mult: beceri çarpanı)
function playerDamage(p, targetDef, combo, mult = 1, forceCrit = false) {
  const c = classOf(p), t = totals(p);
  const crit = forceCrit || Math.random() < (c.crit || 0.12) + t.crit / 100;
  const base = 40 + p.level * 15 + t.atk * 4 + Math.random() * (20 + p.level * 2);
  let dmg = base * (c.atk || 1) * (combo === 2 ? 1.3 : 1) * mult * (1 + t.monster / 100) - targetDef;
  dmg = Math.max(1, Math.round(dmg * (crit ? 2 : 1)));
  return { dmg, crit, steal: t.hpsteal };
}
function mobDamage(mob, p) {
  const raw = mob.atk * (0.9 + Math.random() * 0.2) - defense(p);
  return Math.max(1, Math.round(raw));
}
function expGain(mobLv, playerLv, base) {
  const diff = mobLv - playerLv;
  if (diff < -15) return Math.round(base * 0.05);
  if (diff < -8) return Math.round(base * 0.3);
  if (diff > 10) return Math.round(base * 1.3);
  return base;
}
const skillLabel = (lv) => (lv > 17 ? 'M' + (lv - 17) : String(lv));

module.exports = {
  ITEMS, CLASSES, MOBS, MAPS, SKILLS, MAX_LEVEL, INV_SIZE, EQUIP_SLOTS, BASE_SPEED, MELEE_RANGE, SKILL_UNLOCK, SKILL_MAX,
  BONUS_TYPES, rollBonus, maxBonus, expForLevel, STAT_KEYS, STAT_MAX, STAT_PER_LEVEL, BASE_STATS, MAIN_STAT, statValues, statPointsFree, statBonus, skillMul, classOf, skillsOf, skillPoints, totals, maxHp, maxMp, defense, attackPower,
  speedMul, attackCooldown, playerDamage, mobDamage, expGain, skillLabel,
};
