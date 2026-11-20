// Kişisel depo: hesabın bütün karakterleri ortak kullanır (45 yuva + yang). Sadece köylerde açılır.
// Hesap başına bellekte bir kopya tutulur; her işlemden sonra veritabanına yazılır.
const R = require('./rules');
const DEPOT_SIZE = 45;
const MAX_YANG = 2e9;

function createDepot(W) {
  const { db, notice, sendInv, addItem, freeSlotsFor, save } = W;
  const cache = new Map();          // hesap -> { items, yang, ready }
  async function load(acc) {
    let d = cache.get(acc);
    if (d) { await d.ready; return d; }
    d = { items: [], yang: 0 };
    d.ready = db.query('SELECT items, yang FROM depots WHERE account_id = $1', [acc]).then((r) => {
      if (r.rows[0]) { d.items = r.rows[0].items || []; d.yang = Number(r.rows[0].yang) || 0; }
    }).catch((e) => console.error('depo yüklenemedi', e.message));
    cache.set(acc, d);
    await d.ready;
    return d;
  }
  async function store(acc, d) {
    try {
      await db.query(`INSERT INTO depots (account_id, items, yang) VALUES ($1, $2, $3)
        ON CONFLICT (account_id) DO UPDATE SET items = EXCLUDED.items, yang = EXCLUDED.yang`, [acc, JSON.stringify(d.items), d.yang]);
    } catch (e) { console.error('depo kaydı', e.message); }
  }
  const send = (p, d) => p.socket.emit('depot', { items: d.items, yang: d.yang, size: DEPOT_SIZE });
  const inVillage = (p) => p.zone && p.zone.def.village;
  // aynı işlem üst üste gelmesin (hesap başına sıra)
  const busy = new Set();
  async function op(p, fn) {
    if (!p.accountId) return;
    if (!inVillage(p)) { notice(p, 'Depo sadece köylerde açılır.'); return; }
    if (busy.has(p.accountId)) return;
    busy.add(p.accountId);
    try {
      const d = await load(p.accountId);
      const changed = fn(d);
      if (changed) { await store(p.accountId, d); sendInv(p); save(p); }
      send(p, d);
    } finally { busy.delete(p.accountId); }
  }
  return {
    onConnect(p, socket) {
      socket.on('depotOpen', () => op(p, () => false));
      socket.on('depotPut', (uid) => op(p, (d) => {
        const idx = p.inventory.findIndex((i) => i.uid === Number(uid)); if (idx < 0) return false;
        const it = p.inventory[idx], def = R.ITEMS[it.key];
        if (!def) return false;
        if (it.key === 'at_muhru' || it.key === 'savas_muhru') { notice(p, 'Binek mührü depoya konmaz.'); return false; }
        // yığılabilen eşya: önce depodaki aynı yığına ekle, artanı yeni yuvaya koy
        if (def.stack) {
          let left = it.n || 1;
          for (const x of d.items) {
            if (x.key !== it.key || (x.n || 1) >= def.stack) continue;
            const add = Math.min(def.stack - (x.n || 1), left); x.n = (x.n || 1) + add; left -= add;
            if (!left) break;
          }
          if (left && d.items.length < DEPOT_SIZE) { d.items.push({ key: it.key, n: left }); left = 0; }
          if (left === (it.n || 1)) { notice(p, 'Depo dolu.'); return false; }
          if (left) it.n = left; else p.inventory.splice(idx, 1);
          return true;
        }
        if (d.items.length >= DEPOT_SIZE) { notice(p, 'Depo dolu.'); return false; }
        const { uid: _u, ...rest } = it;
        d.items.push(rest);
        p.inventory.splice(idx, 1);
        return true;
      }));
      socket.on('depotTake', (index) => op(p, (d) => {
        const i = Number(index), it = d.items[i]; if (!it) return false;
        const def = R.ITEMS[it.key];
        if (def && def.stack) { if (!freeSlotsFor(p, it.key, it.n || 1)) { notice(p, 'Envanterin dolu!'); return false; } addItem(p, it.key, it.n || 1); }
        else { if (p.inventory.length >= R.invSize(p)) { notice(p, 'Envanterin dolu!'); return false; } p.inventory.push({ ...it, uid: p.nextUid++ }); }
        d.items.splice(i, 1);
        return true;
      }));
      socket.on('depotYang', (data) => op(p, (d) => {
        const n = Math.floor(Number(data && data.n) || 0); if (n <= 0) return false;
        if (data.dir === 'put') { if (p.yang < n) { notice(p, 'Bu kadar yangın yok.'); return false; } if (d.yang + n > MAX_YANG) { notice(p, 'Depoya bu kadar yang sığmaz.'); return false; } p.yang -= n; d.yang += n; return true; }
        if (d.yang < n) { notice(p, 'Depoda bu kadar yang yok.'); return false; }
        p.yang += n; d.yang -= n; return true;
      }));
    },
    DEPOT_SIZE,
  };
}
module.exports = { createDepot };
