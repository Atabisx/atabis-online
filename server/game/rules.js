// Oyun kuralları: veriler, karakter değerleri, tecrübe, hasar formülleri, efsunlar
const ITEMS = require('../../shared/items.json');
const CLASSES = require('../../shared/classes.json');
const MOBS = require('../../shared/mobs.json');
const MAPS = require('../../shared/maps.json');
const SKILLS = require('../../shared/skills.json');

const MAX_LEVEL = 99;          // Sv. 70-99 sunucusu
const START_LEVEL = 70;         // yeni karakterler bu seviyede başlar
const INV_SIZE = 45;            // bir envanter sayfası (Metin2 gibi 5×9)
// açılmış envanter sayfası kadar yuva (1. sayfa hep açık; 2. ve 3. sayfa görevlerle açılır)
const invSize = (p) => INV_SIZE * (1 + Math.max(0, Math.min(2, (p && p.quests && p.quests.bag) || 0)));
const EQUIP_SLOTS = ['weapon', 'armor', 'helmet', 'shoes', 'bracelet', 'earring', 'shield', 'necklace', 'costume', 'wings', 'pet'];
// yükseltilebilen, efsunlanabilen, taş takılabilen ekipman (görünüş eşyaları hariç)
const GEAR_SLOTS = EQUIP_SLOTS.slice(0, 8);
const BASE_SPEED = 6;          // m/sn
const MELEE_RANGE = 4.4;
const SKILL_UNLOCK = 5;        // beceriler bu seviyede açılır
const SKILL_MAX = 20;          // 1-17, sonra M1-M3
const MOUNT_SPEED = 1.6;

// ilk 25 seviye normal, sonrası giderek zorlaşır
function expForLevel(lv) {
  const base = 100 + lv * 60 + lv * lv * 4;
  // Sv. 70-99 sunucusu: seviye atlamak için gereken tecrübe %45 daha az (daha akıcı gelişim)
  return Math.round((lv > 25 ? base * (1 + (lv - 25) * 0.05) : base) * EXP_NEED_MUL);
}
const EXP_NEED_MUL = 0.55;
const EXP_GAIN_MUL = 2;         // canavar, boss ve metin taşı tecrübesi 2 katı
const classOf = (p) => CLASSES[p.class] || CLASSES.savasci;
const skillsOf = (p) => SKILLS[p.class] || [];
const skillPoints = (p) => Math.max(0, p.level - (SKILL_UNLOCK - 1)) - Object.values(p.skills || {}).reduce((a, b) => a + b, 0);

// ---------- efsunlar ----------
// Metin2'deki gibi: her ekipman türünün kendi efsun havuzu var, her efsunun 5 kademesi var (yüksek kademe nadir)
const GRADE_W = [38, 28, 18, 11, 5];                    // kademe şansları (%)
const FLAT_K = [0.6, 0.8, 1.0, 1.25, 1.5];              // sayı efsunlarında kademe çarpanı
const flat = (base, per) => (t) => FLAT_K.map((k) => Math.round((base + per * t) * k));
const pct = (...v) => () => v;                           // yüzde efsunları sabit kademeler
const CLS_NAMES = { savasci: 'Savaşçılara', ninja: 'Ninjalara', sura: 'Suralara', saman: 'Şamanlara', okcu: 'Fatihlere' };
const BONUS_TYPES = {
  maxhp:     { name: 'Maks. Can', unit: '', grades: flat(40, 35), slots: ['armor', 'helmet', 'shoes', 'bracelet', 'earring', 'shield', 'necklace', 'weapon'] },
  maxmp:     { name: 'Maks. Mana', unit: '', grades: flat(20, 15), slots: ['armor', 'helmet', 'shoes', 'earring', 'necklace'] },
  atk:       { name: 'Saldırı Değeri', unit: '', grades: flat(2, 3), slots: ['weapon', 'bracelet'] },
  def:       { name: 'Savunma', unit: '', grades: flat(2, 3), slots: ['armor', 'helmet', 'shoes', 'bracelet', 'shield', 'necklace'] },
  avgdmg:    { name: 'Ortalama Hasar', unit: '%', grades: pct(3, 6, 9, 12, 15), slots: ['weapon'] },
  skill:     { name: 'Beceri Hasarı', unit: '%', grades: pct(3, 6, 9, 12, 15), slots: ['weapon', 'earring', 'necklace'] },
  pierce:    { name: 'Delici Vuruş', unit: '%', grades: pct(2, 4, 6, 8, 10), slots: ['weapon'] },
  crit:      { name: 'Kritik Vuruş Şansı', unit: '%', grades: pct(2, 4, 6, 8, 10), slots: ['weapon', 'bracelet', 'earring', 'necklace'] },
  atkspeed:  { name: 'Saldırı Hızı', unit: '%', grades: pct(2, 4, 6, 8, 10), slots: ['weapon', 'earring'] },
  monster:   { name: 'Canavarlara Karşı Güç', unit: '%', grades: pct(3, 6, 9, 12, 15), slots: ['weapon'] },
  hpsteal:   { name: 'Can Çalma', unit: '%', grades: pct(1, 2, 3, 4, 5), slots: ['weapon'] },
  avgdef:    { name: 'Ortalama Hasara Dayanıklılık', unit: '%', grades: pct(2, 4, 6, 8, 10), slots: ['armor', 'helmet', 'shield'] },
  dodge:     { name: 'Kaçınma', unit: '%', grades: pct(2, 4, 6, 8, 10), slots: ['armor', 'shoes', 'shield'] },
  hpregen:   { name: 'Can Yenileme', unit: '%', grades: pct(1, 2, 3, 4, 5), slots: ['armor', 'helmet', 'bracelet', 'shield', 'necklace'] },
  movespeed: { name: 'Hareket Hızı', unit: '%', grades: pct(2, 3, 4, 5, 6), slots: ['shoes'] },
  exp:       { name: 'Tecrübe Bonusu', unit: '%', grades: pct(3, 5, 8, 10, 12), slots: ['helmet', 'earring', 'necklace'] },
  yang:      { name: 'Yang Bonusu', unit: '%', grades: pct(5, 10, 15, 20, 25), slots: ['bracelet', 'earring', 'shoes', 'necklace'] },
  drop:      { name: 'Eşya Düşme Şansı', unit: '%', grades: pct(3, 6, 9, 12, 15), slots: ['shoes', 'earring'] },
};
for (const c of CLASS_KEYS_BONUS()) BONUS_TYPES['vs_' + c] = { name: CLS_NAMES[c] + ' Karşı Güç', unit: '%', grades: pct(3, 6, 9, 12, 15), slots: ['weapon'] };
function CLASS_KEYS_BONUS() { return Object.keys(CLS_NAMES); }
// bu ekipman türünde çıkabilecek efsunlar
function bonusPool(slot) { return Object.keys(BONUS_TYPES).filter((k) => BONUS_TYPES[k].slots.includes(slot)); }
function maxBonus(type, tier) { const g = BONUS_TYPES[type].grades(tier || 0); return g[g.length - 1]; }
function rollBonus(type, tier) {
  const g = BONUS_TYPES[type].grades(tier || 0);
  let r = Math.random() * 100, k = 0;
  for (; k < GRADE_W.length - 1; k++) { if (r < GRADE_W[k]) break; r -= GRADE_W[k]; }
  return g[k];
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
const MAX_UP = 9;                // evrimleşen eşyaların sınırı (+9'da bir üst kademeye evrimleşir)
const MAX_UP_PLUS = 15;          // son kademe (evrimi olmayan, Sv. 70+) eşyalar +15'e kadar çıkar
const UP_CHANCE = [95, 90, 85, 75, 65, 55, 45, 35, 25, 20, 15, 12, 9, 6, 4];   // +1 ... +15 başarı yüzdesi
const maxUpOf = (def) => (!def.evolve && (def.lv || 1) >= 70 ? MAX_UP_PLUS : MAX_UP);
const STONE_UP_CHANCE = [70, 60, 50, 40];                         // taş +1 ... +4
const STONE_ADD_CHANCE = [95, 85, 75, 65, 55];                    // taş takma (+0 ... +4); başarısızsa taş kırılır
const SOCKETS = { weapon: 3, armor: 3 };
function upgradeCost(def, up) { return Math.round((2000 + (def.lv || 1) * 300) * (up + 1) * (1 + up * 0.35)); }
function stoneUpCost(g) { return 5000 * (g + 1) * (g + 1); }
// 30. seviye ve üstü eşyalarda +6'dan sonra her yükseltme üç renk yapraktan istenir: +6→+7 7'şer, +7→+8 8'er, +8→+9 9'ar
// metin taşlarından düşen ruh taşı türleri (items.json'daki tüm taşlar)
const STONE_TYPES = [...new Set(Object.values(ITEMS).filter((d) => d.stone).map((d) => d.stone.type))];
const LEAVES = ['yaprak_mor', 'yaprak_mavi', 'yaprak_kirmizi'];
const LEAF_N = 3;              // yapraklar her renkten 3'er istenir
function leafNeed(def, up) { if (up >= 9 && (def.lv || 1) >= 30) return 5; if (def.leaves) return LEAF_N; return (def.lv || 1) >= 30 && up >= 6 ? LEAF_N : 0; }   // +10 ve üstü her renkten 5   // özel eşyalar her basamakta
// metin taşından düşen özel eşyalar: [anahtar, en düşük taş sv, en yüksek taş sv]
const STONE_SPECIALS = Object.entries(ITEMS).filter(([, d]) => d.stoneDrop).map(([k, d]) => [k, d.stoneDrop[0], d.stoneDrop[1]]);
// yükseltmenin eşyaya kattığı değerler
function upBonus(def, up) {
  if (!up) return { atk: 0, def: 0, hp: 0 };
  const e = up <= 9 ? up : 9 + (up - 9) * 1.5;      // +10 ve sonrası daha dik artar
  return {
    atk: def.atk ? Math.round(def.atk * 0.08 * e + e * 2) : 0,
    def: def.def ? Math.round(def.def * 0.1 * e + e) : 0,
    hp: def.hp ? Math.round(def.hp * 0.08 * e) : 0,
  };
}

// ---------- evcil hayvan: seviye, evrim, nitelik, beceri ----------
const PET_MAX = 30;
const PET_STAGES = [
  { name: 'Yavru', lv: 1, mul: 1, scale: 1, cost: 0 },
  { name: 'Genç', lv: 10, mul: 1.35, scale: 1.2, cost: 2000000 },
  { name: 'Olgun', lv: 20, mul: 1.8, scale: 1.45, cost: 10000000 },
  { name: 'Efsanevi', lv: 30, mul: 2.5, scale: 1.75, cost: 50000000 },
];
const PET_QUALITY = [{ name: 'Sıradan', mul: 1, w: 70 }, { name: 'Güçlü', mul: 1.15, w: 25 }, { name: 'Mükemmel', mul: 1.35, w: 5 }];
// her evcil hayvanın kendi becerisi: evrim kademesi 1, 2, 3'te açılır ve güçlenir ([stat, ad, kademe1, kademe2, kademe3])
const PET_SKILLS = {
  pet_kurt: ['monster', 'Av Çığlığı', 3, 6, 10], pet_tilki: ['drop', 'Koku Alma', 3, 6, 10], pet_yilan: ['dodge', 'Sürüngen Çeviklik', 3, 6, 9],
  pet_ayi: ['avgdef', 'Kalın Tüy', 2, 4, 7], pet_baykus: ['skill', 'Kara Büyü', 3, 6, 10], pet_uzayli: ['avgdmg', 'Öte Güç', 2, 4, 7],
  pet_horoz: ['atkspeed', 'Şafak Ötüşü', 3, 6, 10], pet_tavuk: ['hpregen', 'Sıcak Yuva', 3, 6, 10], pet_fantazi_tilki: ['exp', 'Masal Bereketi', 3, 6, 10],
  pet_ejder: ['yang', 'Ejder Hazinesi', 5, 10, 18],
};
const PET_SKILL_TEXT = { monster: 'Canavarlara karşı güç %', drop: 'Eşya düşme şansı %', dodge: 'Kaçınma %', avgdef: 'Ort. savunma %', skill: 'Beceri hasarı %', avgdmg: 'Ort. hasar %', atkspeed: 'Saldırı hızı %', hpregen: 'Can yenileme %', exp: 'Tecrübe %', yang: 'Yang bonusu %' };
const petExpFor = (lv) => 100 + lv * lv * 40;
const petLv = (it) => Math.max(1, Math.min(PET_MAX, (it && it.plv) || 1));
const petEvo = (it) => Math.max(0, Math.min(3, (it && it.evo) || 0));
function petMul(it) { return PET_STAGES[petEvo(it)].mul * (1 + 0.04 * (petLv(it) - 1)) * PET_QUALITY[Math.min(2, (it && it.pq) || 0)].mul; }
function petBonus(it, def) {
  const m = petMul(it), out = {};
  for (const [k, v] of Object.entries(def.bonus || {})) out[k] = Math.round(v * m);
  const sk = PET_SKILLS[it.key], evo = petEvo(it);
  if (sk && evo >= 1) out[sk[0]] = (out[sk[0]] || 0) + sk[1 + evo];
  return out;
}
function petInfo(it) {
  const def = it && ITEMS[it.key]; if (!def || def.slot !== 'pet') return null;
  const lv = petLv(it), evo = petEvo(it), sk = PET_SKILLS[it.key], nx = PET_STAGES[evo + 1];
  return { key: it.key, lv, max: PET_MAX, exp: it.pexp || 0, need: lv >= PET_MAX ? 0 : petExpFor(lv), evo, stage: PET_STAGES[evo].name, quality: PET_QUALITY[Math.min(2, it.pq || 0)].name, pq: it.pq || 0,
    mul: +petMul(it).toFixed(2), bonus: petBonus(it, def),
    skill: sk ? { name: sk[1], stat: sk[0], text: PET_SKILL_TEXT[sk[0]], vals: sk.slice(2), on: evo >= 1 } : null,
    next: nx ? { stage: nx.name, lv: nx.lv, cost: nx.cost } : null };
}
function rollPetQuality() { let r = Math.random() * 100; for (let i = 0; i < PET_QUALITY.length; i++) { r -= PET_QUALITY[i].w; if (r < 0) return i; } return 0; }
// ---------- takım (set) bonusları: aynı kademeden (tier) kuşanılan parça sayısına göre ----------
const SET_STEPS = [2, 4, 6, 8];
function setBonusAt(tier, n) {
  const out = {};
  const add = (k, v) => { out[k] = (out[k] || 0) + v; };
  if (n >= 2) add('hp', tier * 40 + 60);
  if (n >= 4) { add('atk', tier * 5 + 10); add('crit', 3); }
  if (n >= 6) { add('def', tier * 8 + 20); add('avgdmg', Math.round(tier * 0.3 + 2)); }
  if (n >= 8) { add('skill', 8); add('avgdef', 5); add('exp', 5); }
  return out;
}
const SET_TEXT = { hp: 'Can', atk: 'Saldırı', crit: 'Kritik %', def: 'Savunma', avgdmg: 'Ort. hasar %', skill: 'Beceri hasarı %', avgdef: 'Ort. savunma %', exp: 'Tecrübe %' };
const SET_SLOTS = ['weapon', 'armor', 'helmet', 'shoes', 'bracelet', 'earring', 'necklace', 'shield'];
// en çok parçası olan kademe seçilir; {tier, n, name, steps:[{need, text, on}]} ya da null
function setInfo(p) {
  const cnt = {};
  for (const sl of SET_SLOTS) { const d = p.equip[sl] && ITEMS[p.equip[sl].key]; if (d && d.tier != null && d.tier >= 1) cnt[d.tier] = (cnt[d.tier] || 0) + 1; }
  let best = null;
  for (const [t, n] of Object.entries(cnt)) if (!best || n > best.n || (n === best.n && +t > best.tier)) best = { tier: +t, n };
  if (!best || best.n < 2) return null;
  const arm = Object.values(ITEMS).find((d) => d.slot === 'armor' && d.tier === best.tier && (d.rarity || 0) < 2);
  best.name = arm ? arm.name.replace(/ Zırh$/, '') : 'Kademe ' + best.tier;
  best.steps = SET_STEPS.map((need) => {
    const cur = setBonusAt(best.tier, need), prev = need > 2 ? setBonusAt(best.tier, need - 2) : {};
    const parts = Object.entries(cur).filter(([k, v]) => v !== (prev[k] || 0)).map(([k, v]) => `${SET_TEXT[k]} +${v - (prev[k] || 0)}`);
    return { need, text: parts.join(', '), on: best.n >= need };
  });
  return best;
}
const CLASS_KEYS = ['savasci', 'ninja', 'sura', 'saman', 'okcu'];

// ---------- kanat evrimi ve dönüşüm ----------
const WING_STAGES = [
  { name: 'Normal', mul: 1, feather: 0, cost: 0 }, { name: 'Parlak', mul: 1.3, feather: 5, cost: 2e6 },
  { name: 'Kadim', mul: 1.7, feather: 15, cost: 10e6 }, { name: 'Ölümsüz', mul: 2.2, feather: 40, cost: 40e6 }];
const wingEvo = (it) => Math.min(WING_STAGES.length - 1, (it && it.wev) || 0);
const wingMul = (it) => WING_STAGES[wingEvo(it)].mul;
const TF_LEVEL = 30, TF_RAGE = 100, TF_BASE_SEC = 20;
const TF_FORMS = { savasci: 'Kızıl Dev', ninja: 'Gölge Hayalet', sura: 'Karanlık Lord', saman: 'Ejder Ruhu', okcu: 'Kızıl Ejder' };
const tfOn = (p, now = Date.now()) => !!(p.tf && p.tf.until > now);
function totals(p) {
  const s = { atk: 0, def: 0, hp: 0, mp: 0, crit: 0, atkspeed: 0, movespeed: 0, monster: 0, hpsteal: 0, skill: 0, pierce: 0, dodge: 0, avgdmg: 0, avgdef: 0, hpregen: 0, exp: 0, yang: 0, drop: 0 };
  for (const c of CLASS_KEYS) s['vs_' + c] = 0;
  const sb = statBonus(p);
  for (const k of Object.keys(sb)) s[k] += sb[k];
  for (const slot of EQUIP_SLOTS) {
    const it = p.equip[slot];
    const def = it && ITEMS[it.key];
    if (!def) continue;
    const wm = slot === 'wings' ? wingMul(it) : 1;                 // kanat evrimi temel değerleri çarpar
    s.atk += Math.round((def.atk || 0) * wm); s.def += Math.round((def.def || 0) * wm); s.hp += Math.round((def.hp || 0) * wm); s.mp += Math.round((def.mp || 0) * wm);
    // evcil hayvan ve kanat gibi eşyaların özel bonusları (kritik, delici, mana, hız…)
    if (def.bonus) for (const [k, v] of Object.entries(slot === 'pet' ? petBonus(it, def) : def.bonus)) s[k] = (s[k] || 0) + (wm > 1 ? Math.round(v * wm) : v);
    else if (slot === 'pet') for (const [k, v] of Object.entries(petBonus(it, def))) s[k] = (s[k] || 0) + v;
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
  const si = setInfo(p);
  if (si) for (const [k, v] of Object.entries(setBonusAt(si.tier, si.n))) s[k] = (s[k] || 0) + v;
  const now = Date.now();
  for (const [stat, b] of Object.entries(p.buffs || {})) if (b.until > now) s[stat] = (s[stat] || 0) + b.value;
  if (tfOn(p, now)) { for (const k of ['atk', 'def', 'hp']) s[k] = Math.round(s[k] * 1.35); s.movespeed += 15; s.atkspeed += 15; }   // dönüşüm
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
  return (classOf(p).speed || 1) * (1 + totals(p).movespeed / 100) * (p.mounted ? MOUNT_SPEED * (p.quests && p.quests.warhorse === 'done' ? 1.1 : 1) : 1);
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
  let dmg = base * (c.atk || 1) * (combo === 2 ? 1.3 : 1) * mult * vs * (1 + (t.avgdmg || 0) / 100) - targetDef;
  dmg = Math.max(1, Math.round(dmg * (crit ? 2 : 1)));
  return { dmg, crit, steal: t.hpsteal };
}
function mobDamage(mob, p) {
  const raw = mob.atk * (0.9 + Math.random() * 0.2) * (1 - Math.min(60, totals(p).avgdef || 0) / 100) - defense(p);
  return Math.max(1, Math.round(raw));
}
function expGain(mobLv, playerLv, base) {
  const diff = mobLv - playerLv;
  if (diff < -15) return Math.round(base * 0.05);
  if (diff < -8) return Math.round(base * 0.3);
  if (diff > 10) return Math.round(base * 1.3);
  return base;
}
// Kaldırılan eşyalar (hançer, yay) eski kayıtlarda kılıca çevrilir; bilinmeyen anahtarlar atılır
const OLD_KEYS = { d_wood: 'w_wood', d_iron: 'w_iron', d_venom: 'w_shadow', b_wood: 'w_wood', b_horn: 'w_iron', b_storm: 'w_steel',
  // kaldırılan kodla yapılmış kanatlar: elindekiler benzer modelli kanada çevrilir
  kanat_melek: 'kanat_kugu', kanat_buz: 'kanat_peri', kanat_ates: 'kanat_yarasa', kanat_golge: 'kanat_yarasa', kanat_ejder: 'kanat_isik' };
function fixKey(k) {
  if (ITEMS[k]) return k;
  const m = /^(dagger|bow)(\d+)(_L)?$/.exec(String(k));
  if (m) return 'sword' + m[2] + (m[3] || '');
  return OLD_KEYS[k] || k;
}
function fixItems(arr) {
  if (!Array.isArray(arr)) return [];
  for (const it of arr) if (it && it.key) it.key = fixKey(it.key);
  return arr.filter((it) => it && it.key && ITEMS[it.key]);
}
function fixEquip(eq) {
  eq = eq || {};
  for (const slot of Object.keys(eq)) {
    const it = eq[slot]; if (!it) continue;
    it.key = fixKey(it.key);
    if (!ITEMS[it.key]) delete eq[slot];
  }
  return eq;
}
// Metin2 gibi evrim: +9 eşya bir üst kademedeki eşyaya dönüşür (artı sıfırlanır, efsun ve taşlar kalır)
const EVOLVE_CHANCE = 60;
const EVOLVE_LEAVES = 3;       // her renk yapraktan
const EVOLVE_PEARLS = 5;       // herhangi renkten 5 inci (balıklardan çıkar)
const PEARL_KEYS = ['inci_beyaz', 'inci_mavi', 'inci_kirmizi'];
function evolveCost(def) { return Math.round((def.lv || 1) * 12000); }
// başlangıç seti: Sv. 70 karakterin kuşandığı ve çantasındakiler
function startKit(cls) {
  const w = cls === 'saman' ? 'staff9' : 'sword9';
  return {
    // +9 zırh, kolye, küpe, ayakkabı ve silah (görünüşleri uyumlu: Kristal takım); miğfer ve kalkan +0
    equip: { weapon: [w, 9], armor: ['armor9', 9], necklace: ['necklace9', 9], earring: ['earring9', 9], shoes: ['shoes9', 9], helmet: ['helmet9', 0], shield: ['shield9', 0] },
    inv: [['at_muhru', 1], ['isin_yuzugu', 1], ['p_hp3', 100], ['p_mp3', 100], ['p_green', 5]],
  };
}
const skillLabel = (lv) => (lv > 17 ? 'M' + (lv - 17) : String(lv));

module.exports = { WING_STAGES, wingEvo, wingMul, TF_LEVEL, TF_RAGE, TF_BASE_SEC, TF_FORMS, tfOn, EXP_GAIN_MUL, LEAF_N, EVOLVE_PEARLS, PEARL_KEYS, START_LEVEL, EVOLVE_CHANCE, EVOLVE_LEAVES, evolveCost, startKit, STONE_TYPES, STONE_SPECIALS, CLASS_KEYS, fixKey, fixItems, fixEquip,
  ITEMS, CLASSES, MOBS, MAPS, SKILLS, MAX_LEVEL, INV_SIZE, invSize, EQUIP_SLOTS, GEAR_SLOTS, BASE_SPEED, MELEE_RANGE, SKILL_UNLOCK, SKILL_MAX,
  BONUS_TYPES, bonusPool, PET_MAX, PET_STAGES, PET_QUALITY, PET_SKILLS, petExpFor, petLv, petEvo, petInfo, rollPetQuality, MAX_UP_PLUS, maxUpOf, setInfo, setBonusAt, rollBonus, maxBonus, MAX_UP, LEAVES, leafNeed, UP_CHANCE, STONE_UP_CHANCE, STONE_ADD_CHANCE, SOCKETS, upgradeCost, stoneUpCost, upBonus, expForLevel, STAT_KEYS, STAT_MAX, STAT_PER_LEVEL, BASE_STATS, MAIN_STAT, statValues, statPointsFree, statBonus, skillMul, classOf, skillsOf, skillPoints, totals, maxHp, maxMp, defense, attackPower,
  speedMul, attackCooldown, playerDamage, mobDamage, expGain, skillLabel,
};
