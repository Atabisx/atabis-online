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

// ---------- demirci: +0..+9 yükseltme ve ruh taşları ----------
const MAX_UP = 9;
const UP_CHANCE = [95, 90, 85, 75, 65, 55, 45, 35, 25];          // +1 ... +9 başarı yüzdesi
const STONE_UP_CHANCE = [70, 60, 50, 40];                         // taş +1 ... +4
const STONE_ADD_CHANCE = [95, 85, 75, 65, 55];                    // taş takma (+0 ... +4); başarısızsa taş kırılır
const SOCKETS = { weapon: 3, armor: 3 };
function upgradeCost(def, up) { return Math.round((2000 + (def.lv || 1) * 300) * (up + 1) * (1 + up * 0.35)); }
function stoneUpCost(g) { return 5000 * (g + 1) * (g + 1); }
// 30. seviye ve üstü eşyalarda +6'dan sonra her yükseltme üç renk yapraktan istenir: +6→+7 7'şer, +7→+8 8'er, +8→+9 9'ar
const LEAVES = ['yaprak_mor', 'yaprak_mavi', 'yaprak_kirmizi'];
function leafNeed(def, up) { return (def.lv || 1) >= 30 && up >= 6 ? up + 1 : 0; }
// yükseltmenin eşyaya kattığı değerler
function upBonus(def, up) {
  if (!up) return { atk: 0, def: 0, hp: 0 };
  return {
    atk: def.atk ? Math.round(def.atk * 0.08 * up + up * 2) : 0,
    def: def.def ? Math.round(def.def * 0.1 * up + up) : 0,
    hp: def.hp ? Math.round(def.hp * 0.08 * up) : 0,
  };
}
const CLASS_KEYS = ['savasci', 'ninja', 'sura', 'saman', 'okcu'];

function totals(p) {
  const s = { atk: 0, def: 0, hp: 0, mp: 0, crit: 0, atkspeed: 0, movespeed: 0, monster: 0, hpsteal: 0, skill: 0, pierce: 0, dodge: 0 };
  for (const c of CLASS_KEYS) s['vs_' + c] = 0;
  const sb = statBonus(p);
  for (const k of Object.keys(sb)) s[k] += sb[k];
  for (const slot of EQUIP_SLOTS) {
    const it = p.equip[slot];
    const def = it && ITEMS[it.key];
    if (!def) continue;
    s.atk += def.atk || 0; s.def += def.def || 0; s.hp += def.hp || 0;
    const ub = upBonus(def, it.up || 0);
    s.atk += ub.atk; s.def += ub.def; s.hp += ub.hp;
    for (const sk of it.sock || []) {
      const st = ITEMS[sk] && ITEMS[sk].stone;
      if (st) s[st.stat] = (s[st.stat] || 0) + st.value;
    }
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
// vsClass: rakip oyuncunun sınıfı (düello) — o sınıfa karşı taş/efsun gücü uygulanır, canavar gücü uygulanmaz
function playerDamage(p, targetDef, combo, mult = 1, forceCrit = false, vsClass = null) {
  const c = classOf(p), t = totals(p);
  const crit = forceCrit || Math.random() < (c.crit || 0.12) + t.crit / 100;
  const base = 40 + p.level * 15 + t.atk * 4 + Math.random() * (20 + p.level * 2);
  if (t.pierce && Math.random() * 100 < t.pierce) targetDef = 0;          // delici vuruş
  const vs = vsClass ? 1 + (t['vs_' + vsClass] || 0) / 100 : 1 + t.monster / 100;
  let dmg = base * (c.atk || 1) * (combo === 2 ? 1.3 : 1) * mult * vs - targetDef;
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
  BONUS_TYPES, rollBonus, maxBonus, MAX_UP, LEAVES, leafNeed, UP_CHANCE, STONE_UP_CHANCE, STONE_ADD_CHANCE, SOCKETS, upgradeCost, stoneUpCost, upBonus, expForLevel, STAT_KEYS, STAT_MAX, STAT_PER_LEVEL, BASE_STATS, MAIN_STAT, statValues, statPointsFree, statBonus, skillMul, classOf, skillsOf, skillPoints, totals, maxHp, maxMp, defense, attackPower,
  speedMul, attackCooldown, playerDamage, mobDamage, expGain, skillLabel,
};
