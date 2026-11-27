// Başarımlar, unvanlar, haftalık görevler ve koleksiyon.
// Veritabanı tablosu gerekmez: her şey oyuncunun kayıtlı `quests` verisinin içinde (quests.ach) tutulur.
const R = require('./rules');

// İstanbul saatine göre haftanın pazartesi günü (haftalık görevler pazartesi yenilenir)
const weekKey = (ms = Date.now()) => {
  const d = new Date(ms + 3 * 3600e3), back = (d.getUTCDay() + 6) % 7;
  return new Date(d.getTime() - back * 86400e3).toISOString().slice(0, 10);
};
const PET_KEYS = Object.keys(R.ITEMS).filter((k) => R.ITEMS[k].slot === 'pet');
const FISH_KEYS = ['b_hamsi', 'b_sazan', 'b_alabalik', 'b_levrek', 'b_yayin'];

// goals: kademe hedefleri; titles: her kademede açılan unvan; stat: sayacın nereden okunacağı
const ACH = [
  { key: 'kill', name: 'Canavar Avcısı', text: (n) => `${n} canavar öldür`, goals: [100, 1000, 10000], titles: ['Avcı', 'Kasap', 'Kıyamet'], stat: (p) => p.kills || 0 },
  { key: 'boss', name: 'Boss Katili', text: (n) => `${n} boss yen`, goals: [1, 25, 250], titles: ['Cesur', 'Ejder Kıran', 'Efsane Avcısı'], stat: (p, a) => a.stats.boss || 0 },
  { key: 'stone', name: 'Metin Kırıcı', text: (n) => `${n} metin taşı kır`, goals: [10, 200, 2000], titles: ['Taş Kırıcı', 'Metin Ustası', 'Taş Efendisi'], stat: (p, a) => a.stats.stone || 0 },
  { key: 'fish', name: 'Usta Balıkçı', text: (n) => `${n} balık tut`, goals: [10, 200, 2000], titles: ['Olta Ustası', 'Denizci', 'Deniz Efendisi'], stat: (p, a) => a.stats.fish || 0 },
  { key: 'duel', name: 'Düellocu', text: (n) => `${n} düello kazan`, goals: [1, 20, 100], titles: ['Meydan Okuyan', 'Kılıç Ustası', 'Yenilmez'], stat: (p) => (p.quests && p.quests.duelWins) || 0 },
  { key: 'smith', name: 'Demirci Müşterisi', text: (n) => `Demircide ${n} yükseltme dene`, goals: [10, 100, 500], titles: ['Çırak', 'Demirci', 'Usta Demirci'], stat: (p, a) => a.stats.upgrade || 0 },
  { key: 'plus', name: 'Parlak Silah', text: (n) => `Bir eşyayı +${n} yap`, goals: [7, 9, 12, 15], titles: ['Parlak', 'Işıltılı', 'Alevli', 'Efsunlu'], stat: (p) => maxUp(p) },
  { key: 'level', name: 'Yükseliş', text: (n) => `${n}. seviyeye ulaş`, goals: [75, 85, 99], titles: ['Kıdemli', 'Kahraman', 'Efsane'], stat: (p) => p.level },
  { key: 'petlv', name: 'Pet Dostu', text: (n) => `Bir evcil hayvanı ${n}. seviyeye çıkar`, goals: [10, 20, 30], titles: ['Pet Dostu', 'Pet Ustası', 'Canavar Terbiyecisi'], stat: (p) => maxPetLv(p) },
  { key: 'collpet', name: 'Pet Koleksiyoncusu', text: (n) => `${n} farklı evcil hayvan edin`, goals: [3, 6, PET_KEYS.length], titles: ['Hayvansever', 'Koleksiyoncu', 'Pet Efendisi'], stat: (p, a) => a.pets.length },
  { key: 'collfish', name: 'Balık Koleksiyoncusu', text: (n) => `${n} farklı balık türü tut`, goals: [2, 4, FISH_KEYS.length], titles: ['Meraklı', 'Balık Bilgini', 'Su Bilgesi'], stat: (p, a) => a.fish.length },
  { key: 'weekly', name: 'Çalışkan', text: (n) => `${n} haftalık görev tamamla`, goals: [3, 15, 50], titles: ['Çalışkan', 'Azimli', 'Vazgeçmez'], stat: (p, a) => a.stats.weekly || 0 },
];
// kademe ödülü: [yang, [[eşya, adet]...]]
const TIER_REWARD = [
  [50000, [['efsun', 1]]],
  [250000, [['kutsama', 2], ['pet_yumurta', 1]]],
  [1000000, [['efsun_degis', 3], ['pet_yumurta', 2]]],
  [3000000, [['efsun_degis', 5], ['pet_yumurta', 3], ['kutsama', 3]]],
];
// haftalık görev şablonları
const WEEKLY = {
  kill: { name: 'Büyük Av', text: (n) => `Seviyene yakın ${n} canavar öldür`, need: 600 },
  stone: { name: 'Metin Yağmuru', text: (n) => `${n} metin taşı kır`, need: 40 },
  boss: { name: 'Boss Seferi', text: (n) => `${n} boss yen`, need: 12 },
  fish: { name: 'Balık Haftası', text: (n) => `${n} balık tut`, need: 60, needs: (p) => !!(p.quests && p.quests.rod) },
  upgrade: { name: 'Demirci Haftası', text: (n) => `Demircide ${n} yükseltme dene`, need: 20 },
  duel: { name: 'Arena Haftası', text: (n) => `${n} düello kazan`, need: 5 },
  party: { name: 'Dostlarla', text: (n) => `Bir grupla birlikte ${n} canavar öldür`, need: 200 },
};

function maxUp(p) {
  let m = 0;
  for (const it of [...Object.values(p.equip || {}), ...(p.inventory || [])]) if (it && it.up > m) m = it.up;
  return m;
}
function maxPetLv(p) {
  let m = 0;
  for (const it of [...Object.values(p.equip || {}), ...(p.inventory || [])]) {
    const d = it && R.ITEMS[it.key];
    if (d && d.slot === 'pet') m = Math.max(m, R.petLv(it));
  }
  return m;
}

function createAchieve(W) {
  const { notice, addItem, sendInv, save, players } = W;
  const state = (p) => {
    p.quests = p.quests || {};
    const a = p.quests.ach || (p.quests.ach = {});
    a.claimed = a.claimed || {}; a.stats = a.stats || {}; a.pets = a.pets || []; a.fish = a.fish || [];
    return a;
  };
  const tierOf = (def, v) => def.goals.filter((g) => v >= g).length;           // ulaşılan kademe sayısı

  // koleksiyonu güncelle ve yeni tamamlanan başarımları duyur
  function check(p) {
    if (!p || !p.quests) return;
    const a = state(p);
    for (const it of [...Object.values(p.equip || {}), ...p.inventory]) if (it && PET_KEYS.includes(it.key) && !a.pets.includes(it.key)) { a.pets.push(it.key); notice(p, `Koleksiyona yeni evcil hayvan: ${R.ITEMS[it.key].name}`); }
    a.seen = a.seen || {};
    for (const def of ACH) {
      const t = tierOf(def, def.stat(p, a));
      if (t > (a.seen[def.key] || 0)) {
        if (a.seen[def.key] !== undefined || t > 0) { notice(p, `Başarım: ${def.name} (${def.titles[t - 1]})! Başarımlar penceresinden ödülünü al.`); p.socket.emit('achDone', def.name); }
        a.seen[def.key] = t;
      }
    }
  }
  function weeklyEnsure(p) {
    const a = state(p), wk = weekKey();
    if (a.weekly && a.weekly.week === wk) return false;
    const lv = p.level;
    const pool = Object.keys(WEEKLY).filter((k) => !WEEKLY[k].needs || WEEKLY[k].needs(p));
    const picks = ['kill', 'stone'];
    const rest = pool.filter((k) => !picks.includes(k)).sort(() => Math.random() - 0.5).slice(0, 2);
    a.weekly = {
      week: wk,
      list: [...picks, ...rest].map((type) => {
        const t = WEEKLY[type];
        return { type, name: t.name, text: t.text(t.need), need: t.need, have: 0, claimed: false, yang: 200000 + lv * 4000, exp: Math.round(R.expForLevel(lv) * 0.4), items: [['efsun_degis', 1], ['pet_yumurta', 1], ['kutsama', 2]] };
      }),
    };
    return true;
  }
  // olay: kill, stone, boss, fish, upgrade, duel, party
  function event(p, type, n = 1) {
    if (!p || !p.quests) return;
    const a = state(p);
    if (['boss', 'stone', 'fish', 'upgrade'].includes(type)) a.stats[type] = (a.stats[type] || 0) + n;
    if (weeklyEnsure(p)) send(p);
    for (const q of a.weekly.list) {
      if (q.type !== type || q.have >= q.need) continue;
      q.have = Math.min(q.need, q.have + n);
      if (q.have >= q.need) { notice(p, `Haftalık görev tamamlandı: ${q.name}! Başarımlar penceresinden ödülünü al.`); p.socket.emit('achDone', q.name); }
    }
    check(p);
  }
  function fishCaught(p, key) {
    const a = state(p);
    if (FISH_KEYS.includes(key) && !a.fish.includes(key)) { a.fish.push(key); notice(p, `Koleksiyona yeni balık: ${R.ITEMS[key].name}`); }
  }
  function canFit(p, items) {
    const sim = { inventory: p.inventory.map((i) => ({ ...i })), nextUid: p.nextUid, quests: p.quests };
    for (const [k, n] of items) if (R.ITEMS[k] && !addItem(sim, k, n)) return false;
    return true;
  }
  function view(p) {
    const a = state(p); weeklyEnsure(p); check(p);
    const list = ACH.map((def) => {
      const have = def.stat(p, a), done = tierOf(def, have), got = a.claimed[def.key] || 0;
      return { key: def.key, name: def.name, goals: def.goals, titles: def.titles, have, done, got, text: def.text(def.goals[Math.min(done, def.goals.length - 1)]) };
    });
    const titles = [];
    for (const def of ACH) for (let i = 0; i < (a.claimed[def.key] || 0); i++) titles.push(def.titles[i]);
    return { list, weekly: a.weekly, weekEnds: weekKey(Date.now() + 7 * 86400e3), titles, title: a.title || null,
      coll: { pets: PET_KEYS.map((k) => ({ key: k, name: R.ITEMS[k].name, have: a.pets.includes(k) })), fish: FISH_KEYS.map((k) => ({ key: k, name: R.ITEMS[k].name, have: a.fish.includes(k) })) } };
  }
  function send(p) { p.socket.emit('ach', view(p)); }
  function claim(p, key) {
    const a = state(p), def = ACH.find((d) => d.key === key); if (!def) return;
    const done = tierOf(def, def.stat(p, a)), got = a.claimed[key] || 0;
    if (got >= done) { notice(p, 'Alınacak başarım ödülü yok.'); return; }
    const [yang, items] = TIER_REWARD[Math.min(got, TIER_REWARD.length - 1)];
    if (!canFit(p, items)) { notice(p, 'Ödül için çantanda yer aç.'); return; }
    a.claimed[key] = got + 1;
    for (const [k, n] of items) if (R.ITEMS[k]) addItem(p, k, n);
    p.yang += yang;
    notice(p, `${def.name} ödülü: ${yang.toLocaleString('tr-TR')} yang, eşyalar ve "${def.titles[got]}" unvanı!`);
    sendInv(p); send(p); save(p);
  }
  function claimWeekly(p, idx) {
    const a = state(p); weeklyEnsure(p);
    const q = a.weekly.list[Number(idx)];
    if (!q || q.claimed) return;
    if (q.have < q.need) { notice(p, 'Bu görev henüz tamamlanmadı.'); return; }
    if (!canFit(p, q.items)) { notice(p, 'Ödül için çantanda yer aç.'); return; }
    q.claimed = true; a.stats.weekly = (a.stats.weekly || 0) + 1;
    for (const [k, n] of q.items) if (R.ITEMS[k]) addItem(p, k, n);
    p.yang += q.yang; W.giveExpDirect(p, q.exp);
    notice(p, `${q.name} ödülü: ${q.exp.toLocaleString('tr-TR')} tecrübe, ${q.yang.toLocaleString('tr-TR')} yang ve eşyalar.`);
    check(p); sendInv(p); send(p); save(p);
  }
  function setTitle(p, title) {
    const a = state(p);
    const own = [];
    for (const def of ACH) for (let i = 0; i < (a.claimed[def.key] || 0); i++) own.push(def.titles[i]);
    if (title && !own.includes(title)) return;
    a.title = title || null;
    if (p.zone) p.zone.emit('playerTitle', { id: p.id, title: a.title });
    send(p);
  }
  function onConnect(p, socket) {
    state(p); weeklyEnsure(p);
    socket.on('achGet', () => send(p));
    socket.on('achClaim', (key) => claim(p, String(key)));
    socket.on('weeklyClaim', (i) => claimWeekly(p, i));
    socket.on('titleSet', (t) => setTitle(p, t ? String(t) : null));
  }
  const titleOf = (p) => (p.quests && p.quests.ach && p.quests.ach.title) || null;
  return { onConnect, event, check, fishCaught, titleOf };
}

module.exports = { createAchieve };
