// Nesne Market (Ejder Parası ile), süreli eşyalar (otomatik iksirler, tecrübe yüzüğü) ve balık açma.
// Süreli etkiler karakterin görevlerinde saklanır: p.quests.timed = { autohp, automp, expring } (bitiş zamanı, ms).
// Süre gerçek zamanla işler (çevrimdışıyken de azalır), aynı eşya tekrar kullanılırsa süreye eklenir.
const R = require('./rules');

const TIMED_NAMES = { autohp: 'Otomatik Kırmızı İksir', automp: 'Otomatik Mavi İksir', expring: 'Tecrübe Yüzüğü' };
const EXP_RING = 0.25;

// Nesne Market: [anahtar, Ejder Parası, bölüm]
const MALL = [
  ['exp_yuzuk_1g', 20, 'Güçlendirme'], ['exp_yuzuk_7g', 100, 'Güçlendirme'], ['exp_yuzuk_30g', 300, 'Güçlendirme'],
  ['oto_hp_1s', 5, 'Güçlendirme'], ['oto_hp_1g', 30, 'Güçlendirme'], ['oto_hp_20g', 250, 'Güçlendirme'],
  ['oto_mp_1s', 5, 'Güçlendirme'], ['oto_mp_1g', 30, 'Güçlendirme'], ['oto_mp_20g', 250, 'Güçlendirme'],
  ['pet_kurt', 100, 'Evcil hayvan'], ['pet_tilki', 100, 'Evcil hayvan'], ['pet_ayi', 100, 'Evcil hayvan'], ['pet_baykus', 100, 'Evcil hayvan'],
  ['pet_yilan', 100, 'Evcil hayvan'], ['pet_uzayli', 150, 'Evcil hayvan'], ['pet_horoz', 100, 'Evcil hayvan'], ['pet_tavuk', 100, 'Evcil hayvan'], ['pet_fantazi_tilki', 180, 'Evcil hayvan'], ['pet_ejder', 400, 'Evcil hayvan'], ['pet_sandik', 40, 'Evcil hayvan'],
  ['kostum_altin', 50, 'Kostüm'], ['kostum_gece', 50, 'Kostüm'], ['kostum_kar', 50, 'Kostüm'], ['kostum_kizil', 50, 'Kostüm'],
  ['kostum_orman', 50, 'Kostüm'], ['kostum_gok', 50, 'Kostüm'],
  ['kanat_peri', 150, 'Kanat'], ['kanat_kugu', 120, 'Kanat'], ['kanat_yarasa', 180, 'Kanat'], ['kanat_isik', 350, 'Kanat'],
  ['efsun', 3, 'Eşya'], ['efsun_degis', 5, 'Eşya'], ['kutsama', 8, 'Eşya'],
].filter(([k]) => R.ITEMS[k]);

const POTS = [[1, 'p_hp1', 'p_mp1'], [20, 'p_hp2', 'p_mp2'], [40, 'p_hp3', 'p_mp3'], [70, 'p_hp4', 'p_mp4']];
const potFor = (lv, mp) => { let k = mp ? 'p_mp1' : 'p_hp1'; for (const [l, h, m] of POTS) if (lv >= l) k = mp ? m : h; return k; };
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
// otomatik iksir: süreye göre şans (1 saatlik sık, 20 günlük çok nadir)
function autoPotionRoll(scale = 1) {
  const r = Math.random(), k = Math.random() < 0.5 ? 'hp' : 'mp';
  if (r < 0.002 * scale) return `oto_${k}_20g`;
  if (r < 0.017 * scale) return `oto_${k}_1g`;
  if (r < 0.077 * scale) return `oto_${k}_1s`;
  return null;
}

function createPremium(W) {
  const { db, players, notice, sendInv, addItem, freeSlotsFor, save, sendHp, sendMp } = W;
  const timed = (p) => { p.quests.timed = p.quests.timed || {}; return p.quests.timed; };
  function sendTimed(p) {
    const t = timed(p), now = Date.now(), list = {};
    for (const [k, until] of Object.entries(t)) if (until > now) list[k] = { left: Math.round((until - now) / 1000), name: TIMED_NAMES[k] };
    p.socket.emit('timed', list);
  }
  const active = (p, kind) => (timed(p)[kind] || 0) > Date.now();

  // süreli eşyayı kullan
  function useTimed(p, it, def) {
    const t = timed(p), now = Date.now(), k = def.timed.kind;
    t[k] = Math.max(now, t[k] || 0) + def.timed.sec * 1000;
    it.n = (it.n || 1) - 1; if (it.n <= 0) p.inventory.splice(p.inventory.indexOf(it), 1);
    const left = t[k] - now, d = Math.floor(left / 86400e3), h = Math.floor((left % 86400e3) / 3600e3), m = Math.round((left % 3600e3) / 60e3);
    notice(p, `${TIMED_NAMES[k]} etkin: ${d ? d + ' gün ' : ''}${h ? h + ' saat ' : ''}${!d && m ? m + ' dakika ' : ''}kaldı.`);
    sendInv(p); sendTimed(p); save(p);
  }

  // balık aç: her içerik ayrı şansla (efsun %25, değiştirme %25, yaprak %30, pet sandığı %15, iksir çoğu zaman, az yang)
  function openFish(p, it, def, count) {
    const n = Math.max(1, Math.min(count || 1, it.n || 1, 50));
    const got = new Map(); let yang = 0, opened = 0, full = false;
    const give = (key, q = 1) => { if (!R.ITEMS[key]) return true; if (!freeSlotsFor(p, key, q)) return false; addItem(p, key, q); got.set(key, (got.get(key) || 0) + q); return true; };
    for (let i = 0; i < n; i++) {
      const roll = [];
      if (Math.random() < 0.25) roll.push(['efsun', 1]);
      if (Math.random() < 0.25) roll.push(['efsun_degis', 1]);
      if (Math.random() < 0.30) roll.push([R.LEAVES[Math.floor(Math.random() * R.LEAVES.length)], rnd(1, 2)]);
      if (Math.random() < 0.15) roll.push(['pet_sandik', 1]);
      if (Math.random() < 0.75) roll.push([potFor(p.level, Math.random() < 0.4), rnd(1, 3)]);
      const ap = autoPotionRoll(); if (ap) roll.push([ap, 1]);
      // eşyalar sığmıyorsa bu balık açılmaz
      const sim = { inventory: p.inventory.map((x) => ({ ...x })), nextUid: p.nextUid, quests: p.quests };
      if (!roll.every(([k, q]) => !R.ITEMS[k] || addItem(sim, k, q))) { full = true; break; }
      it.n = (it.n || 1) - 1; if (it.n <= 0) p.inventory.splice(p.inventory.indexOf(it), 1);
      for (const [k, q] of roll) give(k, q);
      if (Math.random() < 0.45) yang += rnd(10, 40) * (def.open || 1);     // biraz para (çok değil)
      opened++;
      if (it.n <= 0) break;
    }
    if (!opened) { notice(p, 'Envanterin dolu! Balığı açmak için yer aç.'); return; }
    p.yang += yang;
    const parts = [...got].map(([k, q]) => `${R.ITEMS[k].name}${q > 1 ? ' x' + q : ''}`);
    if (yang) parts.unshift(`${yang.toLocaleString('tr-TR')} yang`);
    notice(p, `${opened} ${def.name} açıldı: ${parts.join(', ') || 'boş çıktı'}${full ? ' (envanter doldu)' : ''}.`);
    if (got.has('pet_sandik') && p.zone) p.zone.emit('announce', `${p.name} balığın içinden Pet Sandığı çıkardı!`);
    const rare = [...got.keys()].find((k) => /_20g$/.test(k));
    if (rare && p.zone) p.zone.emit('announce', `${p.name} balığın içinden ${R.ITEMS[rare].name} çıkardı!`);
    p.socket.emit('fishOpened', { n: opened, yang, items: [...got] });
    sendInv(p); save(p);
  }

  // ---------- Nesne Market ----------
  async function getEp(p) {
    try { const r = await db.query('SELECT ep FROM accounts WHERE id = $1', [p.accountId]); p.ep = r.rows[0] ? Number(r.rows[0].ep) || 0 : 0; } catch (e) { console.error('EP', e.message); }
    return p.ep || 0;
  }
  const mallList = () => MALL.map(([key, price, cat]) => ({ key, price, cat }));
  async function sendMall(p) { await getEp(p); p.socket.emit('mall', { ep: p.ep, items: mallList() }); }
  async function buy(p, key, n) {
    const row = MALL.find((x) => x[0] === key); if (!row) return;
    const def = R.ITEMS[key]; n = def.stack ? Math.max(1, Math.min(20, Math.floor(Number(n) || 1))) : 1;
    const cost = row[1] * n;
    if (!freeSlotsFor(p, key, n)) { notice(p, 'Envanterin dolu!'); return; }
    let ok = false;
    try {
      const r = await db.query('UPDATE accounts SET ep = ep - $2 WHERE id = $1 AND ep >= $2 RETURNING ep', [p.accountId, cost]);
      if (r.rows[0]) { ok = true; p.ep = Number(r.rows[0].ep); }
    } catch (e) { console.error('market', e.message); }
    if (!ok) { await getEp(p); notice(p, `Yeterli Ejder Paran yok (${cost} EP gerekli, sende ${p.ep || 0} EP var).`); p.socket.emit('mall', { ep: p.ep || 0, items: mallList() }); return; }
    addItem(p, key, n);
    notice(p, `${def.name}${n > 1 ? ' x' + n : ''} satın aldın (${cost} EP).`);
    sendInv(p); save(p);
    p.socket.emit('mall', { ep: p.ep, items: mallList() });
  }
  async function grantEp(name, amount) {
    const r = await db.query('UPDATE accounts SET ep = GREATEST(0, ep + $2) WHERE id = (SELECT account_id FROM characters WHERE lower(name) = lower($1) LIMIT 1) RETURNING id, ep', [name, amount]);
    const row = r.rows[0]; if (!row) return null;
    for (const o of Object.values(players)) if (o.accountId === row.id) { o.ep = Number(row.ep); o.socket.emit('mall', { ep: o.ep, items: mallList() }); }
    return Number(row.ep);
  }
  async function addEp(p, amount) {
    try { const r = await db.query('UPDATE accounts SET ep = ep + $2 WHERE id = $1 RETURNING ep', [p.accountId, amount]); if (r.rows[0]) p.ep = Number(r.rows[0].ep); } catch (e) { console.error('EP', e.message); }
  }

  // her saniye: otomatik iksirler ve biten süreler
  setInterval(() => {
    const now = Date.now();
    for (const p of Object.values(players)) {
      if (p.dead || !p.quests || !p.quests.timed) continue;
      const t = p.quests.timed;
      if ((t.autohp || 0) > now && p.hp < p.maxHp * 0.7 && now - (p.lastAutoHp || 0) >= 1000) {
        p.lastAutoHp = now; p.hp = Math.min(p.maxHp, p.hp + Math.round(p.maxHp * 0.1 + p.level * 4)); sendHp(p);
        if (p.zone) p.zone.emit('autoPot', { id: p.id, kind: 'hp' });
      }
      if ((t.automp || 0) > now && p.mp < p.maxMp * 0.5 && now - (p.lastAutoMp || 0) >= 1000) {
        p.lastAutoMp = now; p.mp = Math.min(p.maxMp, p.mp + Math.round(p.maxMp * 0.1 + p.level * 2)); sendMp(p);
      }
      let ended = false;
      for (const [k, until] of Object.entries(t)) if (until && until <= now) { delete t[k]; ended = true; notice(p, `${TIMED_NAMES[k] || k} süresi doldu.`); }
      if (ended) sendTimed(p);
    }
  }, 500);

  // world.js useItem'dan önce sorulur: bu eşyayı biz mi kullanıyoruz?
  function use(p, it, count) {
    const def = R.ITEMS[it.key]; if (!def) return false;
    if (def.timed) { useTimed(p, it, def); return true; }
    if (def.slot === 'fish' && def.open) { openFish(p, it, def, count); return true; }
    return false;
  }
  return {
    MALL, autoPotionRoll, use,
    expBonus: (p) => (active(p, 'expring') ? EXP_RING : 0),
    onConnect(p, socket) {
      sendTimed(p);
      socket.on('mallGet', () => sendMall(p));
      socket.on('mallBuy', (d) => buy(p, String(d && d.key), d && d.n));
      socket.on('openAll', (uid) => { const it = p.inventory.find((i) => i.uid === Number(uid)); if (it && !p.dead) use(p, it, 50); });
    },
    grantEp, addEp, getEp,
  };
}

module.exports = { createPremium };
