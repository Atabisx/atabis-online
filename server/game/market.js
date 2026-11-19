// Pazar tezgâhı: köyde tezgâh açılır, eşyalar fiyatlanır; sahibi oyunda olmasa da satış sürer.
// Kazanç tezgâhta birikir; sahibi istediği zaman (her yerden) toplar ya da tezgâhı kapatır.
const R = require('./rules');

const MAX_ITEMS = 12, MAX_PRICE = 2e9, TAX = 0.02, VIEW_RANGE = 7, MIN_GAP = 3.2;
const clean = (t) => String(t || '').replace(/<[^>]*>/g, '').replace(/[<>&"'\\]/g, '').trim().slice(0, 32);

function createMarket(W) {
  const { db, players, notice, sendInv, addItem, save } = W;
  const stalls = new Map();          // charId -> tezgâh
  let ready = false;

  db.query('SELECT * FROM stalls').then((r) => {
    for (const row of r.rows) stalls.set(row.char_id, { charId: row.char_id, owner: row.owner_name, mapId: row.map_id, x: row.x, z: row.z,
      title: row.title, items: row.items || [], earnings: Number(row.earnings), log: row.log || [] });
    ready = true;
    if (stalls.size) console.log(`${stalls.size} pazar tezgâhı yüklendi`);
  }).catch((e) => { console.error('tezgâhlar', e.message); ready = true; });

  const pub = (s) => ({ id: s.charId, owner: s.owner, x: s.x, z: s.z, title: s.title, n: s.items.length });
  const zoneOf = (mapId) => W.zones[mapId];
  const emitZone = (mapId, ev, data) => { const z = zoneOf(mapId); if (z) z.emit(ev, data); };
  async function persist(s) {
    try {
      await db.query(`INSERT INTO stalls (char_id, owner_name, map_id, x, z, title, items, earnings, log) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (char_id) DO UPDATE SET items = $7, earnings = $8, log = $9, title = $6`,
        [s.charId, s.owner, s.mapId, s.x, s.z, s.title, JSON.stringify(s.items), s.earnings, JSON.stringify(s.log.slice(-20))]);
    } catch (e) { console.error('tezgâh kaydı', e.message); }
  }
  const mine = (p) => {
    const s = stalls.get(p.charId);
    p.socket.emit('stallMine', s ? { title: s.title, map: R.MAPS[s.mapId].name, items: s.items, earnings: s.earnings, log: s.log.slice(-10).reverse() } : null);
  };
  const view = (s) => ({ id: s.charId, owner: s.owner, title: s.title, items: s.items.map((x) => ({ sid: x.sid, price: x.price, ...x.item })) });

  function afterMove(p, zone) {
    p.socket.emit('stalls', [...stalls.values()].filter((s) => s.mapId === zone.id).map(pub));
  }

  function onConnect(p, socket) {
    mine(p);
    socket.on('stallMine', () => mine(p));
    socket.on('stallOpen', async (d) => {
      if (!ready) return;
      const z = p.zone;
      if (!z || !z.def.village) { notice(p, 'Tezgâh sadece köylerde açılabilir.'); return; }
      if (stalls.has(p.charId)) { notice(p, 'Zaten açık bir tezgâhın var.'); return; }
      if (p.trade || p.dead) return;
      if (Math.hypot(p.x - 25, p.z - 25) < 6) { notice(p, 'Köy meydanının tam ortasına tezgâh kurulamaz, biraz kenara geç.'); return; }
      for (const s of stalls.values()) if (s.mapId === z.id && Math.hypot(s.x - p.x, s.z - p.z) < MIN_GAP) { notice(p, 'Burada başka bir tezgâh var, biraz uzaklaş.'); return; }
      const list = Array.isArray(d && d.items) ? d.items.slice(0, MAX_ITEMS) : [];
      const picked = [];
      for (const x of list) {
        const it = p.inventory.find((i) => i.uid === Number(x.uid));
        const price = Math.floor(Number(x.price));
        if (!it || picked.some((q) => q.it === it)) continue;
        if (!(price >= 1 && price <= MAX_PRICE)) { notice(p, 'Her eşyaya 1 ile 2 milyar arasında bir fiyat yaz.'); return; }
        picked.push({ it, price });
      }
      if (!picked.length) { notice(p, 'Tezgâha en az bir eşya koymalısın.'); return; }
      const s = { charId: p.charId, owner: p.name, mapId: z.id, x: p.x, z: p.z, title: clean(d.title) || `${p.name} tezgâhı`, items: [], earnings: 0, log: [] };
      let sid = 1;
      for (const { it, price } of picked) {
        p.inventory.splice(p.inventory.indexOf(it), 1);
        const { uid, ...item } = it;
        s.items.push({ sid: sid++, price, item });
      }
      stalls.set(p.charId, s);
      await persist(s);
      sendInv(p); save(p);
      emitZone(z.id, 'stallAdd', pub(s));
      notice(p, `Tezgâhın açıldı (${s.items.length} eşya). Oyundan çıksan da satış sürer; kazancını Menü > Pazar tezgâhı'ndan toplarsın.`);
      mine(p);
    });
    socket.on('stallView', (id) => {
      const s = stalls.get(Number(id));
      if (!s || !p.zone || p.zone.id !== s.mapId) return;
      if (Math.hypot(s.x - p.x, s.z - p.z) > VIEW_RANGE) { notice(p, 'Tezgâha biraz daha yaklaş.'); return; }
      socket.emit('stallView', view(s));
    });
    socket.on('stallBuy', async (d) => {
      const s = stalls.get(Number(d && d.id));
      if (!s || !p.zone || p.zone.id !== s.mapId || p.dead) return;
      if (s.charId === p.charId) { notice(p, 'Kendi tezgâhından alamazsın; tezgâhı kapatınca eşyalar geri gelir.'); return; }
      if (Math.hypot(s.x - p.x, s.z - p.z) > VIEW_RANGE) { notice(p, 'Tezgâha biraz daha yaklaş.'); return; }
      const i = s.items.findIndex((x) => x.sid === Number(d.sid));
      if (i < 0) { notice(p, 'Bu eşya az önce satıldı.'); socket.emit('stallView', view(s)); return; }
      const x = s.items[i];
      if (Number(d.price) !== x.price) { socket.emit('stallView', view(s)); return; }
      if (p.yang < x.price) { notice(p, 'Yeterli yangın yok.'); return; }
      const def = R.ITEMS[x.item.key];
      if (def && def.stack) { if (!addItem(p, x.item.key, x.item.n || 1)) { notice(p, 'Çantan dolu.'); return; } }
      else { if (p.inventory.length >= R.INV_SIZE) { notice(p, 'Çantan dolu.'); return; } p.inventory.push({ ...x.item, uid: p.nextUid++ }); }
      s.items.splice(i, 1);
      p.yang -= x.price;
      const gain = Math.floor(x.price * (1 - TAX));
      s.earnings += gain;
      const name = (def ? def.name : x.item.key) + (x.item.up ? ' +' + x.item.up : '') + ((x.item.n || 1) > 1 ? ' x' + x.item.n : '');
      s.log.push({ t: Date.now(), name, price: x.price, buyer: p.name });
      sendInv(p); save(p);
      await persist(s);
      notice(p, `${name} satın alındı (${x.price.toLocaleString('tr-TR')} yang).`);
      socket.emit('stallView', view(s));
      emitZone(s.mapId, 'stallAdd', pub(s));
      const o = Object.values(players).find((q) => q.charId === s.charId);
      if (o) { notice(o, `Tezgâhından satış: ${name} → ${p.name} (${gain.toLocaleString('tr-TR')} yang kazandın).`); mine(o); }
    });
    socket.on('stallCollect', async () => {
      const s = stalls.get(p.charId); if (!s || !s.earnings) return;
      p.yang += s.earnings; notice(p, `${s.earnings.toLocaleString('tr-TR')} yang kazancını topladın.`);
      s.earnings = 0; await persist(s); sendInv(p); save(p); mine(p);
    });
    socket.on('stallClose', async () => {
      const s = stalls.get(p.charId); if (!s) return;
      // eşyaların çantaya sığıyor mu?
      const sim = { inventory: p.inventory.map((i) => ({ ...i })), nextUid: p.nextUid };
      for (const x of s.items) {
        const def = R.ITEMS[x.item.key];
        if (def && def.stack) { if (!addItem(sim, x.item.key, x.item.n || 1)) { notice(p, 'Tezgâhtaki eşyalar çantana sığmıyor, yer aç.'); return; } }
        else { if (sim.inventory.length >= R.INV_SIZE) { notice(p, 'Tezgâhtaki eşyalar çantana sığmıyor, yer aç.'); return; } sim.inventory.push({ ...x.item, uid: sim.nextUid++ }); }
      }
      p.inventory = sim.inventory; p.nextUid = sim.nextUid;
      p.yang += s.earnings;
      stalls.delete(p.charId);
      try { await db.query('DELETE FROM stalls WHERE char_id = $1', [p.charId]); } catch (e) { console.error('tezgâh silme', e.message); }
      sendInv(p); save(p);
      emitZone(s.mapId, 'stallRemove', { id: s.charId });
      notice(p, `Tezgâhın kapandı.${s.earnings ? ` ${s.earnings.toLocaleString('tr-TR')} yang kazancın eklendi.` : ''}`);
      mine(p);
    });
  }
  return { onConnect, afterMove, stalls };
}

module.exports = { createMarket };
