// Zindan: Örümcek Mağarası. Her grup kendi kopyasına girer: 3 dalga, sonunda Örümcek Kraliçe.
// Menü > Zindan'dan grup lideri (ya da tek başına oyuncu) yakındaki grup üyeleriyle girer. 25 dakika süre, 30 dakika bekleme.
const R = require('./rules');
const { Zone } = require('./zone');

const MAP = R.MAPS.findIndex((m) => m.dungeon);
const DEF = R.MAPS[MAP];
const MIN_LEVEL = 30, TIME_LIMIT = 25 * 60e3, COOLDOWN = 30 * 60e3, EXIT_AFTER = 60e3, GATHER = 25;
const WAVES = [
  { name: 'Mağaranın girişi', mobs: [['zorumcek', 12]] },
  { name: 'Zehirli yuvalar', mobs: [['zorumcek', 8], ['zzehir', 6]] },
  { name: 'Kraliçenin odası', mobs: [['zkralice', 1], ['zzehir', 4]], boss: 'zkralice' },
];
// kraliçenin sandığı: her üyeye ayrı ganimet
const CHEST = [['kutsama', 1, 0.8], ['efsun', 2, 0.6], ['tas_*_1', 1, 0.5], ['tas_*_2', 1, 0.12], ['yaprak_*', 4, 0.7], ['p_hp3', 10, 1], ['efsun_degis', 2, 0.3]];
const GEAR = ['sword6', 'dagger6', 'bow6', 'staff6', 'armor6', 'helmet6', 'shoes6', 'bracelet6', 'earring6'];

function createDungeons(W) {
  const { io, players, notice, moveToZone, hooks, zonesTick, villageFor } = W;
  const runs = new Set();
  let nextId = 1;

  const state = (run) => ({ name: DEF.name, stage: run.stage + 1, stages: WAVES.length, wave: WAVES[run.stage] ? WAVES[run.stage].name : 'Temizlendi',
    left: run.zone.mobs.size, ends: run.ends, done: run.done });
  const send = (run) => run.zone.emit('dungeon', state(run));
  function spawnWave(run) {
    const w = WAVES[run.stage];
    for (const [key, n] of w.mobs) for (let i = 0; i < n; i++) {
      const boss = key === w.boss;
      const spot = boss ? [25, 42] : [25 + (Math.random() - 0.5) * 50, 18 + Math.random() * 34];
      run.zone.spawnMob(key, spot);
    }
    run.zone.emit('announce', `${run.stage + 1}. dalga: ${w.name}!${w.boss ? ' Örümcek Kraliçe uyandı!' : ''}`);
    send(run);
  }
  function onKill(run, m, owner) {
    send(run);
    if (run.done || run.zone.mobs.size > 0) return;
    if (run.stage < WAVES.length - 1) {
      run.stage++;
      run.zone.emit('announce', 'Dalga temizlendi! Sıradaki 5 saniye içinde geliyor…');
      run.timer = setTimeout(() => { if (run.zone.alive) spawnWave(run); }, 5000);
      return;
    }
    // zindan bitti: ödüller
    run.done = true;
    const names = [...run.zone.players.values()].map((p) => p.name);
    io.emit('announce', `${names.join(', ')} ${DEF.name}'nı temizledi ve Örümcek Kraliçe'yi yendi!`);
    for (const p of run.zone.players.values()) {
      p.quests.dungeonDone = Date.now(); p.quests.dungeons = (p.quests.dungeons || 0) + 1;
      for (const [key, n, ch] of CHEST) {
        if (Math.random() > ch) continue;
        let k = key;
        if (k.includes('*')) k = k.startsWith('tas_') ? k.replace('*', R.STONE_TYPES[Math.floor(Math.random() * R.STONE_TYPES.length)]) : R.LEAVES[Math.floor(Math.random() * R.LEAVES.length)];
        if (R.ITEMS[k]) run.zone.makeDrop(m.x, m.z, p.id, { key: k, n }, 0, 120000);
      }
      if (Math.random() < 0.35) run.zone.makeDrop(m.x, m.z, p.id, { key: GEAR[Math.floor(Math.random() * GEAR.length)] }, 0, 120000);
      run.zone.makeDrop(m.x, m.z, p.id, null, 30000 + Math.floor(Math.random() * 30000), 120000);
      W.onDungeonDone && W.onDungeonDone(p);
    }
    run.zone.emit('announce', 'Zindan temizlendi! Ganimetini topla, 60 saniye sonra köye döneceksin.');
    run.ends = Date.now() + EXIT_AFTER;
    send(run);
  }
  function close(run, why) {
    if (!runs.has(run)) return;
    runs.delete(run);
    clearTimeout(run.timer);
    run.zone.alive = false;
    for (const p of [...run.zone.players.values()]) {
      if (why) notice(p, why);
      p.socket.emit('dungeon', null);
      moveToZone(p, villageFor(run.from));
    }
  }

  function onConnect(p, socket) {
    socket.on('dungeonInfo', () => socket.emit('dungeonInfo', { name: DEF.name, minLevel: MIN_LEVEL, waves: WAVES.map((w) => w.name),
      cooldown: Math.max(0, (p.quests.dungeonAt || 0) + COOLDOWN - Date.now()), runs: p.quests.dungeons || 0 }));
    socket.on('dungeonEnter', () => {
      if (MAP < 0 || !p.zone || p.dead) return;
      if (p.zone.instance) { notice(p, 'Zaten bir zindandasın.'); return; }
      if (p.party && p.party.leader !== p) { notice(p, 'Zindana grup lideri girer, seni de yanında götürür.'); return; }
      if (p.zone.def.war) return;
      const group = p.party ? p.party.members.filter((m) => m.zone === p.zone && !m.dead && Math.hypot(m.x - p.x, m.z - p.z) < GATHER) : [p];
      const low = group.filter((m) => m.level < MIN_LEVEL && !m.gm);
      if (low.length) { notice(p, `Zindan için ${MIN_LEVEL}. seviye gerekir: ${low.map((m) => m.name).join(', ')}`); return; }
      const wait = group.filter((m) => !m.gm && (m.quests.dungeonAt || 0) + COOLDOWN > Date.now());
      if (wait.length) { notice(p, `Bekleme süresi dolmamış: ${wait.map((m) => `${m.name} (${Math.ceil(((m.quests.dungeonAt || 0) + COOLDOWN - Date.now()) / 60000)} dk)`).join(', ')}`); return; }
      const zone = new Zone(io, DEF, hooks, { room: 'zindan:' + nextId++, noRespawn: true });
      zone.instance = true;
      const run = { zone, stage: 0, ends: Date.now() + TIME_LIMIT, done: false, from: p.zone.id, timer: null };
      zone.onKill = (m, owner) => onKill(run, m, owner);
      runs.add(run);
      for (const m of group) {
        m.quests.dungeonAt = Date.now();
        moveToZone(m, zone, [25 + (Math.random() - 0.5) * 4, DEF.spawn[1] + Math.random() * 2]);
      }
      if (p.party && group.length < p.party.members.length) notice(p, 'Uzaktaki grup üyeleri zindana alınmadı (yanında olmalılar).');
      setTimeout(() => { if (runs.has(run)) spawnWave(run); }, 4000);
      send(run);
    });
    socket.on('dungeonLeave', () => { if (p.zone && p.zone.instance) moveToZone(p, villageFor(0)); });
  }
  // her saniye: süre ve boşalan kopyalar
  setInterval(() => {
    const now = Date.now();
    for (const run of runs) {
      if (run.zone.players.size === 0) { close(run); continue; }
      if (now > run.ends) close(run, run.done ? 'Zindandan çıktın.' : 'Zindan süresi doldu!');
    }
  }, 1000);
  const tickAll = (dt) => { for (const run of runs) run.zone.tick(dt); };
  // zindandan çıkış konumu (kayıt için): zindan haritası kaydedilmez
  const saveMap = (p) => (p.zone && p.zone.instance ? villageFor(0) : null);
  return { onConnect, tickAll, saveMap, runs, MAP };
}

module.exports = { createDungeons };
