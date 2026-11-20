// Ana görevler (Menü › Görevler penceresinde): envanterin 2. ve 3. sayfası ile savaş atı.
// Seviyesi gelince görev kendiliğinden başlar; ilerleme canavar, metin taşı ve boss'larla artar.
// Durum karakterin görevlerinde saklanır: p.quests.mq[id] = { st: 'active'|'ready'|'done', c: { sayaçlar } }
const R = require('./rules');

const MAIN = [
  { id: 'bag2', name: 'Çanta Ustası I', lv: 10, text: 'Herhangi bir haritada 150 canavar yen.', goals: { kill: 150 },
    reward: 'Envanterin 2. sayfası açılır (+32 yuva).' },
  { id: 'bag3', name: 'Çanta Ustası II', lv: 30, after: 'bag2', text: '10 metin taşı kır ve 3 boss yen.', goals: { stone: 10, boss: 3 },
    reward: 'Envanterin 3. sayfası açılır (+32 yuva).' },
  { id: 'warhorse', name: 'Savaş Atı', lv: 50, needHorse: true, text: 'Seviyesi 45 ve üstü 100 canavar yen. (Önce Seyis\'in at görevini bitirmiş olmalısın.)',
    goals: { kill45: 100 }, reward: 'Savaş Atı Mührü: atın üstündeyken saldırabilirsin ve atın daha hızlı koşar.' },
];
const LABEL = { kill: 'Canavar', kill45: 'Canavar (Sv. 45+)', stone: 'Metin', boss: 'Boss' };

function createMainQuests(W) {
  const state = (p) => { p.quests.mq = p.quests.mq || {}; return p.quests.mq; };
  function list(p) {
    const mq = state(p);
    return MAIN.map((q) => {
      const s = mq[q.id], c = (s && s.c) || {};
      const need = Object.values(q.goals).reduce((a, b) => a + b, 0);
      const have = Object.entries(q.goals).reduce((a, [k, n]) => a + Math.min(n, c[k] || 0), 0);
      const parts = Object.entries(q.goals).map(([k, n]) => `${LABEL[k]} ${Math.min(n, c[k] || 0)}/${n}`).join(' · ');
      const st = s ? s.st : p.level < q.lv ? 'locked' : 'wait';
      return { id: q.id, name: q.name, lv: q.lv, text: q.text, reward: q.reward, st, have, need, parts };
    });
  }
  function send(p) { if (p.socket) p.socket.emit('mainQuests', list(p)); }
  // seviyesi gelen (ve öncekisi biten) görevleri başlat
  function refresh(p, quiet = false) {
    const mq = state(p);
    for (const q of MAIN) {
      if (mq[q.id] || p.level < q.lv) continue;
      if (q.after && !(mq[q.after] && mq[q.after].st === 'done')) continue;
      if (q.needHorse && p.quests.horse !== 'done') continue;
      mq[q.id] = { st: 'active', c: {} };
      if (!quiet) W.notice(p, `Yeni görev: ${q.name}. Menü › Görevler'e bak.`);
    }
    send(p);
  }
  function bump(p, key, n = 1) {
    const mq = state(p);
    for (const q of MAIN) {
      const s = mq[q.id];
      if (!s || s.st !== 'active' || !q.goals[key]) continue;
      s.c[key] = Math.min(q.goals[key], (s.c[key] || 0) + n);
      if (Object.entries(q.goals).every(([k, v]) => (s.c[k] || 0) >= v)) {
        s.st = 'ready';
        W.notice(p, `${q.name} tamamlandı! Menü › Görevler'den ödülünü al.`);
      }
      send(p);
    }
  }
  function claim(p, id) {
    const q = MAIN.find((x) => x.id === id), mq = state(p), s = q && mq[q.id];
    if (!s || s.st !== 'ready') return;
    if (id === 'bag2') p.quests.bag = Math.max(1, p.quests.bag || 0);
    if (id === 'bag3') p.quests.bag = Math.max(2, p.quests.bag || 0);
    if (id === 'warhorse') {
      // eski At Mührü'nün yerine Savaş Atı Mührü
      const old = p.inventory.findIndex((i) => i.key === 'at_muhru');
      if (old >= 0) p.inventory.splice(old, 1);
      if (!W.addItem(p, 'savas_muhru', 1)) { if (old >= 0) W.addItem(p, 'at_muhru', 1); W.notice(p, 'Envanterinde yer aç.'); return; }
      p.quests.warhorse = 'done';
    }
    s.st = 'done';
    W.notice(p, `${q.name} ödülü: ${q.reward}`);
    W.sendInv(p); W.save(p);
    refresh(p);
  }
  return {
    MAIN,
    onConnect(p, socket) {
      socket.on('mainGet', () => refresh(p, true));
      socket.on('mainClaim', (id) => claim(p, String(id)));
      refresh(p, true);
    },
    onLevel(p) { refresh(p); },
    onMobKilled(p, m) {
      bump(p, 'kill');
      if ((m.d.lv || 0) >= 45) bump(p, 'kill45');
      if (m.d.boss) bump(p, 'boss');
    },
    onStoneBroken(p) { bump(p, 'stone'); },
    refresh,
  };
}

module.exports = { createMainQuests, MAIN };
