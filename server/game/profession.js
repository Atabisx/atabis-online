// Meslekler: madencilik (cevher çıkar), simya (iksir), zanaat (cevherden değerli eşya).
// Veri oyuncunun kayıtlı `quests.prof` alanında tutulur; veritabanı değişikliği gerekmez.
const R = require('./rules');

const MAX_LV = 10;
const need = (lv) => 20 * lv * lv;               // bir sonraki seviye için gereken tecrübe
const PROFS = { mine: 'Madencilik', alch: 'Simya', craft: 'Zanaat' };
const MINE_SEC = (lv) => Math.max(2, 4 - lv * 0.2);
// cevher tablosu: [anahtar, gereken meslek sv., gereken harita sv., ağırlık, tecrübe]
const ORES = [['cevher_bakir', 1, 0, 40, 2], ['cevher_demir', 1, 20, 30, 3], ['cevher_gumus', 3, 36, 18, 5], ['cevher_altin', 5, 50, 9, 8], ['cevher_mithril', 7, 64, 3, 14]];
// tarifler: [anahtar] => { prof, lv, name, cost(yang), in:[[eşya,adet]], out:[eşya,adet], xp }
const RECIPES = {
  a_hp: { prof: 'alch', lv: 1, name: 'Büyük Can İksiri x10', cost: 20000, in: [['ot_sifa', 3]], out: ['p_hp4', 10], xp: 6 },
  a_guc: { prof: 'alch', lv: 2, name: 'Güç İksiri', cost: 60000, in: [['ot_guc', 4], ['ot_sifa', 2]], out: ['el_guc', 1], xp: 10 },
  a_savun: { prof: 'alch', lv: 3, name: 'Taş Deri İksiri', cost: 80000, in: [['ot_guc', 3], ['cevher_demir', 2]], out: ['el_savun', 1], xp: 12 },
  a_can: { prof: 'alch', lv: 4, name: 'Can İksiri', cost: 100000, in: [['ot_sifa', 6], ['ot_ruh', 1]], out: ['el_can', 1], xp: 16 },
  a_hiz: { prof: 'alch', lv: 5, name: 'Rüzgar İksiri', cost: 120000, in: [['ot_ruh', 3]], out: ['el_hiz', 1], xp: 20 },
  c_yaprak: { prof: 'craft', lv: 1, name: 'Yükseltme Yaprağı (3 renk)', cost: 100000, in: [['cevher_bakir', 6]], out: ['yaprak_mor', 1], also: [['yaprak_mavi', 1], ['yaprak_kirmizi', 1]], xp: 8 },
  c_kutsama: { prof: 'craft', lv: 2, name: 'Kutsama Kağıdı', cost: 150000, in: [['cevher_demir', 4], ['cevher_gumus', 2]], out: ['kutsama', 1], xp: 14 },
  c_efsun: { prof: 'craft', lv: 4, name: 'Efsun Değiştirme', cost: 300000, in: [['cevher_gumus', 3], ['cevher_altin', 2]], out: ['efsun_degis', 1], xp: 24 },
  c_yumurta: { prof: 'craft', lv: 6, name: 'Pet Yumurtası', cost: 400000, in: [['cevher_altin', 5], ['cevher_mithril', 1]], out: ['pet_yumurta', 1], xp: 34 },
  c_tuy: { prof: 'craft', lv: 8, name: 'Kanat Tüyü x2', cost: 600000, in: [['cevher_altin', 3], ['cevher_mithril', 3]], out: ['kanat_tuyu', 2], xp: 48 },
};
const HERB_TABLE = [['ot_sifa', 55], ['ot_guc', 35], ['ot_ruh', 10]];

function createProfession(W) {
  const { notice, addItem, sendInv, save, countItem, takeItem } = W;
  const st = (p) => {
    p.quests = p.quests || {};
    const o = p.quests.prof || (p.quests.prof = {});
    for (const k of Object.keys(PROFS)) o[k] = o[k] || { lv: 1, xp: 0 };
    return o;
  };
  function gain(p, prof, xp) {
    const s = st(p)[prof];
    if (s.lv >= MAX_LV) return;
    s.xp += xp;
    while (s.lv < MAX_LV && s.xp >= need(s.lv)) { s.xp -= need(s.lv); s.lv++; notice(p, `${PROFS[prof]} seviye ${s.lv} oldu!`); }
    if (s.lv >= MAX_LV) s.xp = 0;
  }
  function canFit(p, items) {
    const sim = { inventory: p.inventory.map((i) => ({ ...i })), nextUid: p.nextUid, quests: p.quests };
    for (const [k, n] of items) if (!addItem(sim, k, n)) return false;
    return true;
  }
  const view = (p) => {
    const s = st(p);
    return { profs: Object.keys(PROFS).map((k) => ({ key: k, name: PROFS[k], lv: s[k].lv, xp: s[k].xp, need: s[k].lv >= MAX_LV ? 0 : need(s[k].lv), max: MAX_LV })),
      recipes: Object.entries(RECIPES).map(([key, r]) => ({ key, prof: r.prof, lv: r.lv, name: r.name, cost: r.cost, in: r.in.map(([k, n]) => ({ key: k, name: R.ITEMS[k].name, n, have: countItem(p, k) })), out: [r.out, ...(r.also || [])].map(([k, n]) => ({ key: k, name: R.ITEMS[k].name, n })) })),
      pick: countItem(p, 'kazma') > 0 };
  };
  const send = (p) => p.socket.emit('prof', view(p));

  // ---- madencilik ----
  function mineStart(p) {
    const z = p.zone;
    if (!z || p.dead || !z.def.mining) { notice(p, 'Burada maden çıkarılmaz. Dağ, kanyon, mağara ve taş haritalarını dene.'); return; }
    if (countItem(p, 'kazma') < 1) { notice(p, 'Kazman yok. 10. seviyede alırsın.'); return; }
    if (p.mine) return;
    const lv = st(p).mine.lv;
    p.mine = { at: Date.now() + MINE_SEC(lv) * 1000 };
    p.socket.emit('mineWait', Math.round(MINE_SEC(lv) * 1000));
  }
  function mineEnd(p) {
    const m = p.mine; if (!m) return;
    p.mine = null;
    if (!p.zone || !p.zone.def.mining || p.dead) return;
    if (Date.now() < m.at - 400) { p.socket.emit('mineEnd', { ok: false, msg: 'Erken bıraktın.' }); return; }
    const s = st(p).mine, ml = p.zone.def.minLevel || 0;
    const pool = ORES.filter(([, pl, mlv]) => s.lv >= pl && ml >= mlv);
    let r = Math.random() * pool.reduce((a, o) => a + o[3], 0), ore = pool[0];
    for (const o of pool) { r -= o[3]; if (r <= 0) { ore = o; break; } }
    const n = Math.random() < s.lv * 0.05 ? 2 : 1;       // seviye arttıkça çifte cevher şansı
    if (!addItem(p, ore[0], n)) { p.socket.emit('mineEnd', { ok: false, msg: 'Envanterin dolu!' }); return; }
    gain(p, 'mine', ore[4]);
    sendInv(p);
    p.socket.emit('mineEnd', { ok: true, msg: `${R.ITEMS[ore[0]].name} x${n} çıkardın!` });
    if (Math.random() < 0.05) { addItem(p, R.ITEMS.kanat_tuyu ? 'kanat_tuyu' : ore[0], 1); notice(p, 'Kayanın içinden bir Kanat Tüyü çıktı!'); }
  }
  // ---- üretim ----
  function make(p, key) {
    const r = RECIPES[key]; if (!r) return;
    const s = st(p)[r.prof];
    if (s.lv < r.lv) { notice(p, `${PROFS[r.prof]} seviyen ${r.lv} olmalı.`); return; }
    if (p.yang < r.cost) { notice(p, `${r.cost.toLocaleString('tr-TR')} Yang gerekir.`); return; }
    for (const [k, n] of r.in) if (countItem(p, k) < n) { notice(p, `Yetersiz malzeme: ${R.ITEMS[k].name} x${n}`); return; }
    const outs = [r.out, ...(r.also || [])];
    for (const [k, n] of r.in) takeItem(p, k, n);          // malzemeyi önce çek, yer açılmış olabilir
    if (!canFit(p, outs)) { for (const [k, n] of r.in) addItem(p, k, n); sendInv(p); notice(p, 'Çantanda yer aç.'); return; }
    p.yang -= r.cost;
    for (const [k, n] of outs) addItem(p, k, n);
    gain(p, r.prof, r.xp);
    notice(p, `${r.name} hazır!`);
    sendInv(p); send(p); save(p);
  }
  // yaratık kesince nadiren ot düşer
  function onKill(p, m) {
    if (!m || (m.d && m.d.lv < 10)) return;
    if (Math.random() < (m.d.boss ? 0.5 : 0.03)) {
      let r = Math.random() * 100, key = HERB_TABLE[0][0];
      for (const [k, w] of HERB_TABLE) { r -= w; if (r <= 0) { key = k; break; } }
      if (addItem(p, key, m.d.boss ? 3 : 1)) { sendInv(p); }
    }
  }
  function onLevel(p) {
    if (p.level >= 10 && !st(p).given) { if (addItem(p, 'kazma', 1)) { st(p).given = true; notice(p, 'Bir Kazma kazandın! Dağ ve mağara haritalarında Kaz düğmesini kullan.'); sendInv(p); } }
  }
  function onConnect(p, socket) {
    st(p); onLevel(p);
    socket.on('profGet', () => send(p));
    socket.on('mineStart', () => mineStart(p));
    socket.on('mineEnd', () => mineEnd(p));
    socket.on('craftMake', (k) => make(p, String(k)));
  }
  const cancelMine = (p) => { if (p.mine) { p.mine = null; p.socket.emit('mineEnd', { ok: false, msg: 'Hareket ettin, kazı bıraktın.' }); } };
  return { onConnect, onKill, onLevel, cancelMine };
}
module.exports = { createProfession, RECIPES };
