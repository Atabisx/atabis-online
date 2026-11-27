// Topluluk sistemleri: grup (parti), günlük görevler, giriş ödülü.
// world.js içindeki yardımcılarla (W) çalışır; kendi soket olaylarını onConnect'te bağlar.
const R = require('./rules');

const PARTY_MAX = 8;
const PARTY_RANGE = 45;          // ortak tecrübe için üyenin uzaklığı
// İstanbul saatine göre gün (görevler gece yarısı yenilenir)
const today = (ms = Date.now()) => new Date(ms + 3 * 3600e3).toISOString().slice(0, 10);
const yesterday = () => today(Date.now() - 86400e3);

// ---------- günlük görev şablonları ----------
const DAILY = {
  kill: { name: 'Canavar Avı', text: (n) => `Seviyene yakın ${n} canavar öldür`, need: (lv) => 25 + Math.min(25, Math.floor(lv / 4)), exp: 0.14 },
  stone: { name: 'Metin Kırıcı', text: (n) => `${n} metin taşı kır`, need: (lv) => (lv < 15 ? 2 : 3), exp: 0.12 },
  boss: { name: 'Boss Avcısı', text: () => 'Bir boss yen', need: () => 1, exp: 0.16, minLv: 15 },
  upgrade: { name: 'Demirci Ziyareti', text: () => 'Demircide bir eşyayı yükselt (sonuç fark etmez)', need: () => 1, exp: 0.08, minLv: 5 },
  fish: { name: 'Balıkçı', text: (n) => `${n} balık tut`, need: () => 5, exp: 0.1, needs: (p) => !!(p.quests && p.quests.rod) },
  party: { name: 'Dost Eli', text: (n) => `Bir grupla birlikte ${n} canavar öldür`, need: () => 20, exp: 0.12, minLv: 5 },
  duel: { name: 'Meydan Okuma', text: () => 'Bir düello kazan', need: () => 1, exp: 0.08, minLv: 10 },
};
const POTION_TIERS = [[1, 'p_hp1'], [20, 'p_hp2'], [40, 'p_hp3'], [60, 'p_hp4']];
const potionFor = (lv) => { let k = 'p_hp1'; for (const [l, key] of POTION_TIERS) if (lv >= l && R.ITEMS[key]) k = key; return k; };
const randStone = (g) => `tas_${R.STONE_TYPES[Math.floor(Math.random() * R.STONE_TYPES.length)]}_${g}`;
const randLeaf = () => R.LEAVES[Math.floor(Math.random() * R.LEAVES.length)];

// 7 günlük giriş ödülü (yang seviyeyle artar)
function loginReward(day, lv) {
  const y = (n) => Math.round(n * (1 + lv / 15));
  return [
    { yang: y(3000), items: [[potionFor(lv), 10]] },
    { yang: y(4000), items: [['efsun', 1]] },
    { yang: y(6000), items: [[randLeaf(), 3]] },
    { yang: y(6000), items: [['kutsama', 1]] },
    { yang: y(8000), items: [[randStone(0), 1]] },
    { yang: y(10000), items: [['p_speed', 5], [potionFor(lv), 15]] },
    { yang: y(25000), items: [['kutsama', 3], [randStone(1), 1], [randLeaf(), 5]] },
  ][(day - 1) % 7];
}

function createSocial(W) {
  const { players, notice, sendInv, addItem, freeSlotsFor, save } = W;
  let nextParty = 1;

  // ================= GRUP =================
  const memberView = (o) => ({ id: o.id, name: o.name, cls: o.class, level: o.level, hp: o.hp, maxHp: o.maxHp, mp: o.mp, maxMp: o.maxMp,
    dead: !!o.dead, map: o.zone ? o.zone.def.name : '' });
  function sendParty(party) {
    const view = party ? { id: party.id, leader: party.leader.id, members: party.members.map(memberView) } : null;
    if (party) for (const m of party.members) m.socket.emit('party', view);
  }
  function leaveParty(p, why) {
    const party = p.party; if (!party) return;
    party.members = party.members.filter((m) => m !== p);
    p.party = null; p.socket.emit('party', null);
    if (why) notice(p, why);
    for (const m of party.members) notice(m, `${p.name} gruptan ${why && why.includes('atıldın') ? 'atıldı' : 'ayrıldı'}.`);
    if (party.members.length < 2) {
      for (const m of party.members) { m.party = null; m.socket.emit('party', null); notice(m, 'Grup dağıldı.'); }
      return;
    }
    if (party.leader === p) { party.leader = party.members[0]; notice(party.leader, 'Artık grup lideri sensin.'); }
    sendParty(party);
  }
  const sameParty = (a, b) => !!(a && b && a.party && a.party === b.party);

  // tecrübe paylaşımı: yakındaki grup üyeleri seviyelerine göre bölüşür, grup büyüdükçe toplam artar
  function shareExp(p, amount, give) {
    const party = p.party;
    const near = party ? party.members.filter((m) => !m.dead && m.zone === p.zone && Math.hypot(m.x - p.x, m.z - p.z) < PARTY_RANGE) : [p];
    if (near.length < 2) { give(p, amount, true); return; }
    const pool = amount * (1 + 0.12 * (near.length - 1));
    const sum = near.reduce((a, m) => a + m.level, 0);
    for (const m of near) give(m, Math.max(1, Math.round(pool * m.level / sum)), m === p);
  }

  // ================= GÜNLÜK GÖREVLER =================
  function rollDaily(p) {
    const lv = p.level;
    const pool = Object.keys(DAILY).filter((k) => !['kill', 'stone'].includes(k) && lv >= (DAILY[k].minLv || 0) && (!DAILY[k].needs || DAILY[k].needs(p)));
    const extra = pool[Math.floor(Math.random() * pool.length)] || 'upgrade';
    const list = ['kill', 'stone', extra].map((type) => {
      const t = DAILY[type], need = t.need(lv);
      const exp = Math.round(R.expForLevel(lv) * t.exp);
      const yang = 1500 + lv * 350;
      const items = [[potionFor(lv), 5]];
      if (type === 'stone') items.push([randLeaf(), 2]);
      if (type === 'boss' || type === 'duel') items.push(['kutsama', 1]);
      if (type === 'party') items.push(['efsun', 1]);
      return { type, name: t.name, text: t.text(need), need, have: 0, exp, yang, items, claimed: false };
    });
    p.quests.daily = { day: today(), list };
  }
  function ensureDaily(p) {
    if (!p.quests.daily || p.quests.daily.day !== today()) { rollDaily(p); return true; }
    return false;
  }
  function sendDaily(p) {
    ensureDaily(p);
    const lr = p.quests.login || {};
    p.socket.emit('daily', { day: p.quests.daily.day, list: p.quests.daily.list, streak: lr.streak || 0, claimedToday: lr.last === today() });
  }
  function progress(p, type, n = 1) {
    if (!p || !p.quests) return;
    if (W.achEvent) W.achEvent(p, type, n);          // başarım / haftalık görev sayaçları
    if (ensureDaily(p)) { sendDaily(p); }
    let changed = false;
    for (const q of p.quests.daily.list) {
      if (q.type !== type || q.have >= q.need) continue;
      q.have = Math.min(q.need, q.have + n); changed = true;
      if (q.have >= q.need) { notice(p, `Günlük görev tamamlandı: ${q.name}! Görevler penceresinden ödülünü al.`); p.socket.emit('dailyDone', q.name); }
    }
    if (changed) sendDaily(p);
  }
  function claimDaily(p, idx) {
    ensureDaily(p);
    const q = p.quests.daily.list[Number(idx)];
    if (!q || q.claimed) return;
    if (q.have < q.need) { notice(p, 'Bu görev henüz tamamlanmadı.'); return; }
    if (!canFit(p, q.items)) { notice(p, 'Ödül için çantanda yer aç.'); return; }
    q.claimed = true;
    for (const [k, n] of q.items) if (R.ITEMS[k]) addItem(p, k, n);
    p.yang += q.yang;
    W.giveExpDirect(p, q.exp);
    notice(p, `${q.name} ödülü: ${q.exp.toLocaleString('tr-TR')} tecrübe, ${q.yang.toLocaleString('tr-TR')} yang ve eşyalar.`);
    sendInv(p); sendDaily(p); save(p);
  }
  function canFit(p, items) {
    const sim = { inventory: p.inventory.map((i) => ({ ...i })), nextUid: p.nextUid, quests: p.quests };
    for (const [k, n] of items) if (R.ITEMS[k] && !addItem(sim, k, n)) return false;
    return true;
  }

  // ================= GİRİŞ ÖDÜLÜ =================
  function checkLogin(p) {
    const lr = p.quests.login || (p.quests.login = { last: null, streak: 0 });
    if (lr.last === today()) return;
    const day = lr.last === yesterday() ? lr.streak + 1 : 1;
    const rw = loginReward(day, p.level);
    // yeni başlayan karaktere para verilmez (ilk giriş ödülü yalnız eşya)
    if (lr.last === null) rw.yang = 0;
    if (!canFit(p, rw.items)) { notice(p, 'Günlük giriş ödülün var ama çantan dolu. Yer açıp Görevler penceresinden al.'); lr.pending = true; return; }
    lr.last = today(); lr.streak = day; lr.pending = false;
    for (const [k, n] of rw.items) if (R.ITEMS[k]) addItem(p, k, n);
    p.yang += rw.yang;
    p.socket.emit('loginReward', { day: ((day - 1) % 7) + 1, streak: day, yang: rw.yang, items: rw.items.map(([k, n]) => ({ key: k, n })) });
    sendInv(p); save(p);
  }

  // ================= BAĞLANTI =================
  function onConnect(p, socket) {
    ensureDaily(p);
    const other = (id) => { const o = players[String(id)]; return o && o !== p ? o : null; };
    socket.on('partyInvite', (id) => {
      const o = other(id);
      if (!o) { notice(p, 'Oyuncu bulunamadı.'); return; }
      if (o.party) { notice(p, `${o.name} zaten bir grupta.`); return; }
      if (p.party && p.party.leader !== p) { notice(p, 'Sadece grup lideri davet edebilir.'); return; }
      if (p.party && p.party.members.length >= PARTY_MAX) { notice(p, `Grup en fazla ${PARTY_MAX} kişi olabilir.`); return; }
      o.partyAsk = { from: p.id, at: Date.now() };
      o.socket.emit('partyAsk', { id: p.id, name: p.name, level: p.level });
      notice(p, `${o.name} oyuncusuna grup daveti gönderildi.`);
    });
    socket.on('partyAnswer', (d) => {
      const ask = p.partyAsk; p.partyAsk = null;
      const o = ask && Date.now() - ask.at < 20000 ? other(ask.from) : null;
      if (!o) return;
      if (!(d && d.ok)) { notice(o, `${p.name} grup davetini reddetti.`); return; }
      if (p.party) return;
      if (o.party && o.party.leader !== o) { notice(p, 'Grup bulunamadı.'); return; }
      if (!o.party) { o.party = { id: nextParty++, leader: o, members: [o] }; }
      if (o.party.members.length >= PARTY_MAX) { notice(p, 'Grup dolu.'); return; }
      o.party.members.push(p); p.party = o.party;
      for (const m of p.party.members) if (m !== p) notice(m, `${p.name} gruba katıldı.`);
      notice(p, `${o.name} grubuna katıldın. Grup sohbeti için mesajın başına # koy.`);
      sendParty(p.party);
    });
    socket.on('partyLeave', () => leaveParty(p, 'Gruptan ayrıldın.'));
    socket.on('partyKick', (id) => {
      const o = other(id);
      if (!p.party || p.party.leader !== p || !o || o.party !== p.party) return;
      leaveParty(o, `${p.name} seni gruptan attı.`);
    });
    socket.on('dailyGet', () => sendDaily(p));
    // öğretici: adımlar istemcide izlenir, bitince bir kez küçük ödül
    socket.on('tutorial', (step) => {
      if (step === 'done') {
        if (p.quests.tutorial === 'done') return;
        p.quests.tutorial = 'done';
        addItem(p, potionFor(p.level), 10); p.yang += 3000;
        notice(p, 'Öğretici tamamlandı! Ödül: 10 iksir ve 3.000 yang. İyi maceralar!');
        sendInv(p); save(p); W.sendQuests(p);
        return;
      }
      const n = Number(step); if (n > 0 && n < 20 && p.quests.tutorial !== 'done') p.quests.tutorial = n;
    });
    socket.on('dailyClaim', (i) => claimDaily(p, i));
    socket.on('loginClaim', () => { if ((p.quests.login || {}).pending) checkLogin(p); sendDaily(p); });
    checkLogin(p);
    sendDaily(p);
  }
  function onDisconnect(p) { if (p.party) leaveParty(p, null); }

  // ================= KANCALAR =================
  function onMobKilled(p, m) {
    // grup üyeleri de seviyelerine yakın canavarlar için görev ilerletir
    const near = p.party ? p.party.members.filter((o) => o.zone === p.zone && Math.hypot(o.x - p.x, o.z - p.z) < PARTY_RANGE) : [p];
    for (const o of near) {
      if (m.d.lv >= o.level - 8) progress(o, 'kill');
      if (near.length >= 2) progress(o, 'party');
      if (m.d.boss) progress(o, 'boss');
    }
  }
  function chat(p, t) {
    if (t[0] !== '#') return false;
    const text = t.slice(1).trim(); if (!text) return true;
    if (!p.party) { notice(p, 'Bir grupta değilsin.'); return true; }
    for (const m of p.party.members) m.socket.emit('chat', { name: p.name, text, channel: 'party' });
    return true;
  }
  let tickN = 0;
  function tick() {
    tickN++;
    // grup can çubukları saniyede bir
    const seen = new Set();
    for (const p of Object.values(players)) if (p.party && !seen.has(p.party)) { seen.add(p.party); sendParty(p.party); }
    // gece yarısı: çevrimiçi oyunculara yeni görevler
    if (tickN % 30 === 0) for (const p of Object.values(players)) if (ensureDaily(p)) { sendDaily(p); notice(p, 'Yeni günlük görevler geldi!'); checkLogin(p); }
  }

  return { onConnect, onDisconnect, onMobKilled, shareExp, sameParty, chat, tick, progress, sendDaily };
}

module.exports = { createSocial, today };
