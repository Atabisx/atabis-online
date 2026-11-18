// Oyun kuralları: veriler, karakter değerleri, tecrübe, hasar formülleri
const ITEMS = require('../../shared/items.json');
const CLASSES = require('../../shared/classes.json');
const MOBS = require('../../shared/mobs.json');
const MAPS = require('../../shared/maps.json');

const MAX_LEVEL = 120;
const INV_SIZE = 32;
const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'shoes', 'bracelet', 'earring'];
const BASE_SPEED = 6;          // m/sn
const MELEE_RANGE = 4.4;

const expForLevel = (lv) => 100 + lv * 60 + lv * lv * 4;
const classOf = (p) => CLASSES[p.class] || CLASSES.savasci;

// ekipmandan gelen toplam değerler
function gearStats(p) {
  const s = { atk: 0, def: 0, hp: 0 };
  for (const slot of EQUIP_SLOTS) {
    const it = p.equip[slot] && ITEMS[p.equip[slot].key];
    if (!it) continue;
    s.atk += it.atk || 0; s.def += it.def || 0; s.hp += it.hp || 0;
  }
  return s;
}
function maxHp(p) {
  const c = classOf(p);
  return Math.round(c.hp + p.level * (c.hp / 8) + p.level * p.level * 0.6 + gearStats(p).hp);
}
function defense(p) { return (classOf(p).def || 0) + gearStats(p).def; }
function attackPower(p) { return gearStats(p).atk; }

// oyuncunun vurduğu hasar
function playerDamage(p, targetDef, combo) {
  const c = classOf(p);
  const crit = Math.random() < (c.crit || 0.12);
  const base = 40 + p.level * 15 + attackPower(p) * 4 + Math.random() * (20 + p.level * 2);
  let dmg = base * (c.atk || 1) * (combo === 2 ? 1.3 : 1) - targetDef;
  dmg = Math.max(1, Math.round(dmg * (crit ? 2 : 1)));
  return { dmg, crit };
}
// yaratığın oyuncuya vurduğu hasar
function mobDamage(mob, p) {
  const raw = mob.atk * (0.9 + Math.random() * 0.2) - defense(p);
  return Math.max(1, Math.round(raw));
}
// seviye farkına göre tecrübe
function expGain(mobLv, playerLv, base) {
  const diff = mobLv - playerLv;
  if (diff < -15) return Math.round(base * 0.05);
  if (diff < -8) return Math.round(base * 0.3);
  if (diff > 10) return Math.round(base * 1.3);
  return base;
}

module.exports = {
  ITEMS, CLASSES, MOBS, MAPS, MAX_LEVEL, INV_SIZE, EQUIP_SLOTS, BASE_SPEED, MELEE_RANGE,
  expForLevel, classOf, gearStats, maxHp, defense, attackPower, playerDamage, mobDamage, expGain,
};
