// Bir harita (bölge): yaratıklar, metin taşları, yerdeki ganimet ve o haritadaki oyuncular.
// Her bölge kendi Socket.io odasına yayın yapar.
const R = require('./rules');

const DEFAULT_BOUNDS = [-15, 65];
const VILLAGE_CENTER = { x: 25, z: 25 };
const LEASH = 28;                 // yaratık evinden bu kadar uzaklaşınca geri döner

// haritanın sınırları (gen_data.py: köy orta boy, vahşi haritalar büyük)
function boundsOf(def) {
  const [min, max] = def.bounds || DEFAULT_BOUNDS;
  return { min, max };
}
// boss'lar haritanın uzak (doğu) yarısında, girişten ve köyden uzakta
function bossSpots(b, n = 3, river = null) {
  // köy haritası: hepsi köprünün ötesinde (Metin2 gibi), birbirinden uzak
  if (river) {
    const x0 = river.x + river.w / 2 + 18, spots = [];
    const cands = [];
    for (let x = x0; x <= b.max - 12; x += 4) for (let z = b.min + 12; z <= b.max - 12; z += 4) if (Math.abs(z - 25) > 10) cands.push([x, z]);
    spots.push([Math.min(b.max - 15, x0 + 20), b.max - 25]);
    while (spots.length < n) {
      let best = null, bd = -1;
      for (const c of cands) { const d = Math.min(...spots.map((s) => Math.hypot(s[0] - c[0], s[1] - c[1]))); if (d > bd) { bd = d; best = c; } }
      spots.push(best);
    }
    return spots;
  }
  // ilk ikisi doğu köşelerinde; üçüncüsü karşı köşede (köy haritasında köyden uzak)
  const spots = [[b.max - 12, b.max - 12], [b.max - 12, b.min + 12], [b.min + 12, b.max - 12]];
  // daha fazla boss varsa haritanın doğu yarısında birbirinden en uzak noktalara dağıt
  const mid = (b.min + b.max) / 2;
  while (spots.length < n) {
    let best = null, bestD = -1;
    for (let x = mid; x <= b.max - 10; x += 4) {
      for (let z = b.min + 10; z <= b.max - 10; z += 4) {
        if (Math.abs(z - 25) < 10) continue;   // ana yol ve doğu geçidinin önü boş kalsın
        const d = Math.min(...spots.map((s) => Math.hypot(s[0] - x, s[1] - z)));
        if (d > bestD) { bestD = d; best = [x, z]; }
      }
    }
    spots.push(best);
  }
  return spots;
}
// harita tohumundan, her açılışta aynı çıkan sabit rastgele sayı
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Metin2'deki taş adları (seviyeye göre), rün rengi, kaya rengi ve biçim
const STONE_TYPES_BY_LV = [
  [10, 'Keder Metini', '#7fd0ff', '#5a5e66', 0], [30, 'Savaş Metini', '#ff8a3d', '#5c5650', 1], [50, 'Açgözlülük Metini', '#ffd23f', '#5a5448', 2],
  [70, 'Gölge Metini', '#b07bff', '#3e3a48', 3], [75, 'Sertlik Metini', '#5fe0a0', '#4a4f4c', 0], [80, 'Şeytan Metini', '#ff3b2f', '#3a2c2c', 1],
  [85, 'Düşüş Metini', '#7fb3ff', '#3c4250', 2], [90, 'Ölüm Metini', '#d0d0ff', '#2c2c34', 3], [95, 'Katliam Metini', '#ff4a8a', '#3a2a34', 0],
  [999, 'Pung-Ma Metini', '#ffb347', '#2a2622', 1]];
function stoneType(lv) {
  const t = STONE_TYPES_BY_LV.find((r) => lv < r[0]);
  return { name: t[1], rune: t[2], rock: t[3], shape: t[4] };
}

class Zone {
  constructor(io, def, hooks, opts = {}) {
    this.io = io;
    this.def = def;
    this.id = def.id;
    this.room = opts.room || 'map:' + def.id;     // zindan kopyaları kendi odalarını kullanır
    this.noRespawn = !!opts.noRespawn;
    this.hooks = hooks;            // world.js'ten gelen: onMobKilled, onPlayerDied, givePlayerDrop...
    this.players = new Map();      // socket.id -> oyuncu
    this.mobs = new Map();
    this.stones = new Map();
    this.drops = new Map();
    this.nextId = 1;
    this.alive = true;
    this.bounds = boundsOf(def);
    this.river = def.river || null;
    this.villageR = def.villageR || 22;
    this.bossSpots = bossSpots(this.bounds, Math.max(3, def.bosses.length), this.river);
    this.stoneSpots = this.makeStoneSpots((def.stones ?? 5) + 3);
    for (const sp of def.spawns) for (let i = 0; i < sp.count; i++) this.spawnMob(sp.mob, null);
    def.bosses.forEach((key, i) => this.spawnMob(key, this.bossSpots[i % this.bossSpots.length]));
    for (let i = 0; i < (def.stones ?? 5); i++) this.spawnStone();
  }

  clampX(v) { return Math.max(this.bounds.min, Math.min(this.bounds.max, v)); }
  // nehir bandı (köprü hariç)
  inRiver(x, z, pad = 0) {
    const r = this.river; if (!r) return false;
    if (Math.abs(x - r.x) > r.w / 2 + pad) return false;
    return !(z > r.bridge[0] + 1 && z < r.bridge[1] - 1);
  }

  // metin taşı yerleri: haritaya yayılmış, birbirinden uzak, yollardan ve girişlerden uzak
  makeStoneSpots(n) {
    const rnd = seeded((this.def.seed || 1) * 31 + 7);
    const b = this.bounds, spots = [];
    // metin haritası: taşlar haritanın her yerine dengeli dağılır (karelere bölünmüş ızgara, her karede biraz kaydırılmış)
    if (this.def.metin) {
      const k = Math.ceil(Math.sqrt(n * 1.25)), cell = (b.max - b.min - 16) / k;
      const cells = [];
      for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) cells.push([i, j]);
      for (const [i, j] of cells) {
        for (let t = 0; t < 12; t++) {
          const x = b.min + 8 + (i + 0.2 + rnd() * 0.6) * cell, z = b.min + 8 + (j + 0.2 + rnd() * 0.6) * cell;
          if (Math.abs(z - 25) < 5 || !this.safeFrom(x, z)) continue;
          spots.push([+x.toFixed(1), +z.toFixed(1)]); break;
        }
      }
      return spots;
    }
    const gap = (b.max - b.min) * 0.2;
    for (let tries = 0; spots.length < n && tries < 2000; tries++) {
      const x = b.min + 8 + rnd() * (b.max - b.min - 16), z = b.min + 8 + rnd() * (b.max - b.min - 16);
      if (Math.abs(z - 25) < 6) continue;   // ana yolun üstüne değil
      if (!this.safeFrom(x, z)) continue;
      if (spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < (tries < 1500 ? gap : 10))) continue;
      spots.push([+x.toFixed(1), +z.toFixed(1)]);
    }
    return spots;
  }

  emit(ev, data) { this.io.to(this.room).emit(ev, data); }

  // ---------- konum seçimi ----------
  safeFrom(x, z) {
    if (this.def.village && Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < this.villageR) return false;
    if (this.inRiver(x, z, 3)) return false;
    if (Math.hypot(x - this.def.spawn[0], z - this.def.spawn[1]) < 12) return false;
    for (const b of this.bossSpots) if (Math.hypot(x - b[0], z - b[1]) < 8) return false;
    for (const p of this.def.portals) if (Math.hypot(x - p.x, z - p.z) < 8) return false;
    return true;
  }
  randomSpot() {
    // spawnBox: [x0, z0, x1, z1] – yaratıklar haritanın bu bölgesinde doğar (köy hayvanları köprü yakasında)
    const sb = this.def.spawnBox;
    for (let i = 0; i < 60; i++) {
      const x = sb ? rand(Math.max(sb[0], this.bounds.min + 5), Math.min(sb[2], this.bounds.max - 5)) : rand(this.bounds.min + 5, this.bounds.max - 5);
      const z = sb ? rand(Math.max(sb[1], this.bounds.min + 5), Math.min(sb[3], this.bounds.max - 5)) : rand(this.bounds.min + 5, this.bounds.max - 5);
      if (this.safeFrom(x, z)) return [x, z];
    }
    return [this.bounds.max - 15, this.bounds.max - 15];
  }

  // ---------- yaratıklar ----------
  spawnMob(key, spot) {
    const d = R.MOBS[key];
    const [x, z] = spot || this.randomSpot();
    const id = this.nextId++;
    const m = { id, key, d, x, z, homeX: x, homeZ: z, hp: d.hp, max: d.hp, state: 'idle', target: null, dots: [],
                nextWander: Date.now() + rand(1000, 5000), wx: x, wz: z, lastAttack: 0, ry: rand(0, 6.28),
                moving: false, dmgBy: new Map(), spot };
    this.mobs.set(id, m);
    this.emit('mobSpawn', this.publicMob(m));
    return m;
  }
  publicMob(m) {
    return { id: m.id, key: m.key, x: +m.x.toFixed(2), z: +m.z.toFixed(2), ry: +m.ry.toFixed(2), hp: m.hp, max: m.max };
  }

  // ---------- metin taşları ----------
  spawnStone() {
    const used = new Set([...this.stones.values()].map((s) => s.spot));
    const free = this.stoneSpots.map((_, i) => i).filter((i) => !used.has(i));
    if (!free.length) return;
    const spot = free[Math.floor(Math.random() * free.length)];
    const s = this.makeStone(this.stoneSpots[spot][0], this.stoneSpots[spot][1]);
    s.spot = spot;
    this.stones.set(s.id, s);
    this.emit('stoneSpawn', s);
  }
  // Metin2 gibi: taşın adı ve rün rengi seviyesinden gelir; metin haritalarında seviye aralıktan rastgele
  makeStone(x, z) {
    const r = this.def.stoneLv;
    const lv = r ? r[0] + Math.floor(Math.random() * (r[1] - r[0] + 1)) : this.def.minLevel + 4;
    const big = Math.random() < 0.2;    // büyük taş: daha dayanıklı, iki kat ganimet
    const t = stoneType(lv);
    const hp = Math.round((100 + lv * lv * 2.5 + lv * 20) * (big ? 16 : 12));
    return { id: this.nextId++, spot: -1, x, z, lv, hp, max: hp, name: (big ? 'Büyük ' : '') + t.name, color: big ? 'purple' : 'red',
             rune: t.rune, rock: t.rock, shape: t.shape, big };
  }
  // etkinlik metini: rastgele yerde, kırılınca yeniden çıkmaz
  spawnExtraStone() {
    const [x, z] = this.randomSpot();
    const s = this.makeStone(x, z);
    s.extra = true;
    this.stones.set(s.id, s);
    this.emit('stoneSpawn', s);
    return s;
  }
  removeExtras() {
    for (const s of [...this.stones.values()]) if (s.extra) { this.stones.delete(s.id); this.emit('stoneGone', { id: s.id }); }
    for (const m of [...this.mobs.values()]) if (m.event) { this.mobs.delete(m.id); this.emit('mobGone', { id: m.id }); }
  }

  // ---------- ganimet ----------
  publicDrop(d) { return { id: d.id, x: d.x, z: d.z, owner: d.owner, key: d.item ? d.item.key : null, n: d.item ? d.item.n || 1 : 0, yang: d.yang }; }
  makeDrop(x, z, owner, item, yang, ownerMs = 15000) {
    const id = this.nextId++;
    const a = Math.random() * Math.PI * 2, r = 1.8 + Math.random() * 1.8;
    const d = { id, x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, owner, ownerUntil: Date.now() + ownerMs,
                expires: Date.now() + 90000, item: item || null, yang: yang || 0 };
    this.drops.set(id, d);
    this.emit('drop', this.publicDrop(d));
  }
  rollLoot(x, z, owner, drops, potions, yangRange, dropM = 1, yangM = 1) {
    if (yangRange) this.makeDrop(x, z, owner, null, Math.round(rand(yangRange[0], yangRange[1]) * yangM));
    for (const [key, chance] of drops || []) {
      if (R.ITEMS[key] && Math.random() < chance * dropM * (this.hooks.dropMul ? this.hooks.dropMul() : 1)) this.makeDrop(x, z, owner, { key });
    }
    for (const [key, chance] of potions || []) {
      if (R.ITEMS[key] && Math.random() < chance) this.makeDrop(x, z, owner, { key, n: 1 + Math.floor(Math.random() * 3) });
    }
  }

  // ---------- oyuncular ----------
  addPlayer(p) {
    this.players.set(p.id, p);
    p.zone = this;
    p.socket.join(this.room);
    p.socket.to(this.room).emit('playerJoin', this.hooks.publicPlayer(p));
  }
  removePlayer(p) {
    this.players.delete(p.id);
    p.socket.leave(this.room);
    this.emit('playerLeave', { id: p.id });
    for (const m of this.mobs.values()) if (m.target === p) { m.target = null; m.state = 'return'; }
  }
  snapshot() {
    const players = {};
    for (const o of this.players.values()) players[o.id] = this.hooks.publicPlayer(o);
    return {
      map: this.def.id, players,
      mobs: [...this.mobs.values()].map((m) => this.publicMob(m)),
      stones: [...this.stones.values()],
      drops: [...this.drops.values()].map((d) => this.publicDrop(d)),
    };
  }

  // ---------- oyuncu saldırısı ----------
  attack(p, combo) {
    const range = R.classOf(p).range || R.MELEE_RANGE;
    let best = null, bestD = Infinity, kind = null;
    for (const m of this.mobs.values()) {
      const d = dist(m, p) - (m.d.hitR || m.d.scale * 0.6);
      if (d < range && d < bestD) { best = m; bestD = d; kind = 'mob'; }
    }
    for (const s of this.stones.values()) {
      const d = dist(s, p) - 1.2;
      if (d < range && d < bestD) { best = s; bestD = d; kind = 'stone'; }
    }
    // düello rakibi ve krallık savaşında düşmanlar
    for (const opp of this.hooks.enemies ? this.hooks.enemies(p) : []) { const d = dist(opp, p) - 0.6; if (d < range && d < bestD) { best = opp; bestD = d; kind = 'player'; } }
    this.emit('swing', { id: p.id, combo, target: best ? best.id : null });
    if (!best) return;
    if (kind === 'player') { this.pvpHit(p, best, combo, 1, false); return; }
    const { dmg, crit, steal } = R.playerDamage(p, kind === 'mob' ? best.d.def : 0, combo);
    if (steal) this.hooks.heal(p, Math.round(dmg * steal / 100));
    if (kind === 'mob') this.damageMob(best, p, dmg, crit);
    else this.damageStone(best, p, dmg, crit);
  }

  // düelloda oyuncuya vuruş: savunma ve sınıf taşı hesaba katılır, kaçınma şansı var
  pvpHit(p, t, combo, mult, forceCrit) {
    const tt = R.totals(t);
    if (tt.dodge && Math.random() * 100 < tt.dodge) { this.emit('hit', { id: t.id, kind: 'player', dmg: 0, miss: true, hp: t.hp, max: t.maxHp, by: p.id }); return; }
    const { dmg, crit } = R.playerDamage(p, R.defense(t) * 2, combo, mult * 0.55, forceCrit, t.class);
    this.hooks.pvpDamage(p, t, dmg, crit);
  }

  damageMob(m, p, dmg, crit) {
    if (!this.mobs.has(m.id)) return;
    m.hp = Math.max(0, m.hp - dmg);
    this.emit('hit', { id: m.id, kind: 'mob', dmg, crit, hp: m.hp, by: p.id });
    m.dmgBy.set(p.id, (m.dmgBy.get(p.id) || 0) + dmg);
    if (m.state !== 'chase' && !p.dead) { m.state = 'chase'; m.target = p; }
    if (m.hp <= 0) this.killMob(m);
  }

  damageStone(best, p, dmg, crit) {
    if (!this.stones.has(best.id)) return;
    dmg = Math.max(1, Math.round(dmg * 0.65));     // metin taşı sert: hasarın %35'i emilir
    best.hp = Math.max(0, best.hp - dmg);
    this.emit('hit', { id: best.id, kind: 'stone', dmg, crit, hp: best.hp, by: p.id });
    if (best.hp <= 0) {
      this.stones.delete(best.id);
      this.emit('stoneDown', { id: best.id, by: p.id, name: p.name, stoneName: best.name });
      const exp = Math.round((20 + best.lv * 9 + best.lv * best.lv * 0.35) * 7);   // metin taşı: 7 canavar tecrübesi
      this.hooks.giveExp(p, R.expGain(best.lv, p.level, exp));
      if (this.hooks.onStoneBroken) this.hooks.onStoneBroken(p);
      const own = this.def.stoneDrops;
      const n = best.color === 'purple' ? 2 : 1;
      for (let i = 0; i < n; i++) if (Math.random() < 0.6) this.makeDrop(best.x, best.z, p.id, { key: own[Math.floor(Math.random() * own.length)] });
      // Metin2 gibi taş ganimeti: efsun nesnesi, efsun değiştirme, yeşil (saldırı gücü), kırmızı ve mavi iksir
      if (Math.random() < 0.22) this.makeDrop(best.x, best.z, p.id, { key: 'efsun', n: 1 });
      if (Math.random() < 0.10) this.makeDrop(best.x, best.z, p.id, { key: 'efsun_degis', n: 1 });
      if (Math.random() < 0.30) this.makeDrop(best.x, best.z, p.id, { key: 'p_green', n: 1 + Math.floor(Math.random() * 2) });
      if (Math.random() < 0.45) this.makeDrop(best.x, best.z, p.id, { key: best.lv >= 75 ? 'p_hp4' : 'p_hp3', n: 2 + Math.floor(Math.random() * 4) });
      if (Math.random() < 0.35) this.makeDrop(best.x, best.z, p.id, { key: best.lv >= 75 ? 'p_mp4' : 'p_mp3', n: 2 + Math.floor(Math.random() * 4) });
      // ruh taşları (Metin2 gibi sadece metinlerden): üst haritalarda daha yüksek dereceli
      const STONE_TYPES = R.STONE_TYPES;
      if (Math.random() < (best.color === 'purple' ? 0.55 : 0.35)) {
        const tier = this.def.tier || 0;
        let g = 0; const r = Math.random();
        if (r < 0.04 + tier * 0.006) g = 2; else if (r < 0.25 + tier * 0.02) g = 1;
        if (tier >= 10 && Math.random() < 0.05) g = 3;
        this.makeDrop(best.x, best.z, p.id, { key: `tas_${STONE_TYPES[Math.floor(Math.random() * STONE_TYPES.length)]}_${g}`, n: 1 });
      }
      if (Math.random() < 0.03) this.makeDrop(best.x, best.z, p.id, { key: 'kutsama', n: 1 });
      // özel zırhlar: taşın seviyesine uyanlar, her biri %1,5 (zor) şansla
      for (const [key, lo, hi] of R.STONE_SPECIALS) {
        if (best.lv < lo || best.lv > hi || Math.random() >= 0.015) continue;
        this.makeDrop(best.x, best.z, p.id, { key });
        this.hooks.announce(`${p.name}, ${best.name} kırarak ${R.ITEMS[key].name} buldu!`, this);
      }
      // demirci yaprakları (kırmızı, yeşil, mor): %50 şansla 1-3 adet (rengi rastgele)
      if (Math.random() < 0.5) this.makeDrop(best.x, best.z, p.id, { key: R.LEAVES[Math.floor(Math.random() * 3)], n: 1 + Math.floor(Math.random() * 3) });
      if (Math.random() < 0.08) this.makeDrop(best.x + 0.6, best.z, p.id, { key: 'kanat_tuyu', n: 1 });
      if (Math.random() < 0.04) { this.makeDrop(best.x, best.z, p.id, { key: 'pet_yumurta' }); this.hooks.announce(`${p.name}, ${best.name} kırarak Pet Yumurtası buldu!`, this); }
      // evcil hayvan: %1,5 şans (Ejder Yavrusu bunların içinde çok nadir)
      if (Math.random() < 0.015) {
        const pets = ['pet_kurt', 'pet_tilki', 'pet_ayi', 'pet_baykus', 'pet_yilan', 'pet_uzayli', 'pet_horoz', 'pet_tavuk', 'pet_fantazi_tilki'];
        const key = Math.random() < 0.05 ? 'pet_ejder' : pets[Math.floor(Math.random() * pets.length)];
        if (R.ITEMS[key]) { this.makeDrop(best.x, best.z, p.id, { key }); this.hooks.announce(`${p.name}, ${best.name} kırarak ${R.ITEMS[key].name} buldu!`, this); }
      }
      if (this.hooks.stoneBonus) for (const k of this.hooks.stoneBonus()) this.makeDrop(best.x, best.z, p.id, { key: k, n: 1 });
      this.makeDrop(best.x, best.z, p.id, null, Math.round((50 + best.lv * 30) * (n + Math.random())));
      if (!best.extra) setTimeout(() => this.spawnStone(), 15000);
    }
  }

  killMob(m) {
    this.mobs.delete(m.id);
    // en çok hasar vuran oyuncu ganimetin ve tecrübenin sahibi
    let ownerId = null, top = -1;
    for (const [id, v] of m.dmgBy) if (v > top && this.players.has(id)) { top = v; ownerId = id; }
    const owner = ownerId ? this.players.get(ownerId) : null;
    this.emit('mobDie', { id: m.id, by: ownerId, name: owner ? owner.name : '', mobName: m.d.name, boss: m.d.boss });
    if (owner) { this.hooks.giveExp(owner, R.expGain(m.d.lv, owner.level, m.d.exp)); this.hooks.onMobKilled(owner, m); }
    const lt = owner ? R.totals(owner) : null;
    this.rollLoot(m.x, m.z, ownerId, m.d.drops, m.d.potions, m.d.yang, lt ? 1 + lt.drop / 100 : 1, lt ? 1 + lt.yang / 100 : 1);
    const delay = (m.d.respawn || 12) * 1000;
    if (!this.noRespawn && !m.event) setTimeout(() => { if (this.alive) this.spawnMob(m.key, m.spot); }, delay);
    if (this.onKill) this.onKill(m, owner);
    if (m.d.boss && !this.noRespawn && !m.event) this.hooks.announce(`${m.d.name} ${owner ? owner.name + ' tarafından ' : ''}yenildi! ${m.d.respawn || 120} saniye sonra geri dönecek.`, this);
  }

  // ---------- beceriler ----------
  targetsAround(x, z, r, p = null) {
    const list = [];
    for (const m of this.mobs.values()) if (Math.hypot(m.x - x, m.z - z) - (m.d.hitR || m.d.scale * 0.6) < r) list.push(['mob', m]);
    for (const s of this.stones.values()) if (Math.hypot(s.x - x, s.z - z) - 1.2 < r) list.push(['stone', s]);
    if (p && this.hooks.enemies) for (const opp of this.hooks.enemies(p)) if (Math.hypot(opp.x - x, opp.z - z) - 0.6 < r) list.push(['player', opp]);
    return list;
  }
  // beceri için menzilde hedef var mı (Metin2 gibi: hedef yoksa beceri çıkmaz)
  hasSkillTarget(p, sk) {
    const r = sk.target === 'dash' ? (sk.dist || 0) + (sk.radius || 3) : sk.target === 'single' || sk.target === 'multi' || sk.target === 'chain' ? (sk.range || 6) : (sk.radius || sk.range || 6);
    return this.targetsAround(p.x, p.z, r + 1, p).length > 0;
  }
  nearestTarget(p, range) {
    let best = null, bd = Infinity;
    for (const t of this.targetsAround(p.x, p.z, range, p)) {
      const d = Math.hypot(t[1].x - p.x, t[1].z - p.z);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  // beceriyi uygula; vurulan hedeflerin listesini döndürür
  useSkill(p, sk, lv) {
    const mult = (sk.mult || 0) + (sk.multLv || 0) * (lv - 1);
    let targets = [];
    if (sk.target === 'aoe') targets = this.targetsAround(p.x, p.z, sk.radius, p);
    else if (sk.target === 'front') {
      const fx = Math.sin(p.facing || 0), fz = Math.cos(p.facing || 0);
      targets = this.targetsAround(p.x, p.z, sk.radius, p).filter(([, t]) => {
        const dx = t.x - p.x, dz = t.z - p.z, d = Math.hypot(dx, dz) || 1;
        return (dx * fx + dz * fz) / d > 0.2;
      });
    } else if (sk.target === 'single') {
      const t = this.nearestTarget(p, sk.range); if (t) targets = [t];
      if (t && sk.splash) targets = targets.concat(this.targetsAround(t[1].x, t[1].z, sk.splash, p).filter((o) => o[1] !== t[1]));
    } else if (sk.target === 'multi') {
      targets = this.targetsAround(p.x, p.z, sk.range, p).sort((a, b) => Math.hypot(a[1].x - p.x, a[1].z - p.z) - Math.hypot(b[1].x - p.x, b[1].z - p.z)).slice(0, sk.count || 3);
    } else if (sk.target === 'chain') {
      const first = this.nearestTarget(p, sk.range);
      if (first) {
        const max = 3 + (lv >= 10 ? 1 : 0) + (lv >= 18 ? 1 : 0);
        targets = [first];
        let cur = first[1];
        while (targets.length < max) {
          const next = this.targetsAround(cur.x, cur.z, 7, p).filter((t) => !targets.some((o) => o[1] === t[1]))
            .sort((a, b) => Math.hypot(a[1].x - cur.x, a[1].z - cur.z) - Math.hypot(b[1].x - cur.x, b[1].z - cur.z))[0];
          if (!next) break;
          targets.push(next); cur = next[1];
        }
      }
    } else if (sk.target === 'dash') {
      const fx = Math.sin(p.facing || 0), fz = Math.cos(p.facing || 0);
      p.x = this.clampX(p.x + fx * sk.dist);
      p.z = this.clampX(p.z + fz * sk.dist);
      p.socket.emit('correct', { x: p.x, z: p.z });
      targets = this.targetsAround(p.x, p.z, sk.radius, p);
    }
    for (const [kind, t] of targets) {
      if (kind === 'player') { this.pvpHit(p, t, 0, mult * R.skillMul(p), !!sk.crit); continue; }
      const { dmg, crit, steal } = R.playerDamage(p, kind === 'mob' ? t.d.def : 0, 0, mult * R.skillMul(p), !!sk.crit);
      const heal = Math.round(dmg * ((sk.lifesteal || 0) + (steal || 0) / 100));
      if (heal) this.hooks.heal(p, heal);
      if (kind === 'mob') {
        // sersemletme / dondurma: yaratık kısa süre kıpırdayamaz (boss'larda yarı süre)
        if (sk.stun && this.mobs.has(t.id)) {
          const sec = sk.stun * (t.d.boss ? 0.5 : 1);
          t.stunUntil = Date.now() + sec * 1000;
          this.emit('mobStun', { id: t.id, sec, kind: sk.freeze ? 'freeze' : 'stun' });
        }
        if (sk.dot && this.mobs.has(t.id)) {
          const per = Math.max(1, Math.round(dmg * ((sk.dot.mult || 0) + (sk.dot.multLv || 0) * (lv - 1)) / (crit ? 2 : 1)));
          t.dots = t.dots.filter((d) => d.key !== sk.key);
          t.dots.push({ key: sk.key, owner: p, per, until: Date.now() + sk.dot.sec * 1000, next: Date.now() + 1000 });
        }
        this.damageMob(t, p, dmg, crit);
      } else this.damageStone(t, p, dmg, crit);
    }
    return targets.map(([, t]) => t.id);
  }

  // ---------- zaman adımı ----------
  tick(dt) {
    const now = Date.now();
    const alivePlayers = [...this.players.values()].filter((p) => !p.dead);
    // haritada kimse yoksa yaratıklar bekler (işlemciyi boşa harcamaz)
    if (this.players.size) for (const m of [...this.mobs.values()]) {
      const d = m.d;
      // zehir / yanık hasarı
      if (m.dots.length) {
        for (const dot of m.dots) {
          if (now >= dot.next && now <= dot.until + 50) {
            dot.next += 1000;
            if (dot.owner.zone === this) this.damageMob(m, dot.owner, dot.per, false);
          }
        }
        m.dots = m.dots.filter((dot) => now <= dot.until);
        if (!this.mobs.has(m.id)) continue;
      }
      let tx = null, tz = null, speed = d.speed;
      if (m.stunUntil && now < m.stunUntil) { if (m.moving) { m.moving = false; } continue; }
      if (d.worldBoss) continue;   // dünya boss'unun yapay zekâsı worldboss.js'te
      // saldırgan yaratık yakındaki oyuncuyu fark eder
      if (m.state === 'idle' && d.aggro > 0) {
        let best = null, bd = d.aggro;
        for (const p of alivePlayers) { const dd = dist(m, p); if (dd < bd) { best = p; bd = dd; } }
        if (best) { m.state = 'chase'; m.target = best; }
      }
      if (m.state === 'chase') {
        const t = m.target;
        const home = Math.hypot(m.x - m.homeX, m.z - m.homeZ);
        if (!t || t.dead || t.zone !== this || home > LEASH) { m.state = 'return'; m.target = null; }
        else {
          const dd = dist(m, t);
          if (dd > d.range) { tx = t.x; tz = t.z; }
          else {
            m.ry = Math.atan2(t.x - m.x, t.z - m.z);
            if (now - m.lastAttack >= d.cd) {
              m.lastAttack = now;
              const dodge = R.totals(t).dodge;
              if (dodge && Math.random() * 100 < dodge) { this.emit('mobAttack', { id: m.id, target: t.id, dmg: 0, miss: true }); continue; }
              const dmg = R.mobDamage(d, t);
              this.emit('mobAttack', { id: m.id, target: t.id, dmg });
              this.hooks.damagePlayer(t, dmg, m);
              const refl = Math.min(60, R.totals(t).reflect || 0);          // Yansıtma: hasarın bir kısmı saldırana döner
              if (refl > 0 && this.mobs.has(m.id)) this.damageMob(m, t, Math.max(1, Math.round(dmg * refl / 100)), false);
            }
          }
        }
      }
      if (m.state === 'return') {
        tx = m.homeX; tz = m.homeZ; speed = d.speed * 1.5;
        if (Math.hypot(m.x - m.homeX, m.z - m.homeZ) < 1) {
          m.state = 'idle'; m.hp = m.max; m.dmgBy.clear();
          this.emit('mobHeal', { id: m.id, hp: m.hp });
        }
      }
      if (m.state === 'idle') {
        if (now > m.nextWander) {
          m.nextWander = now + rand(3000, 8000);
          const a = rand(0, Math.PI * 2), r = rand(1, 6);
          m.wx = m.homeX + Math.cos(a) * r; m.wz = m.homeZ + Math.sin(a) * r;
        }
        if (Math.hypot(m.x - m.wx, m.z - m.wz) > 0.4) { tx = m.wx; tz = m.wz; speed = d.speed * 0.35; }
      }
      m.moving = false;
      if (tx !== null) {
        const dx = tx - m.x, dz = tz - m.z, len = Math.hypot(dx, dz);
        if (len > 0.05) {
          const step = Math.min(len, speed * dt);
          const nx = this.clampX(m.x + dx / len * step), nz = this.clampX(m.z + dz / len * step);
          if (this.inRiver(nx, nz) && !this.inRiver(m.x, m.z)) { if (m.state === 'chase') m.state = 'return'; m.wx = m.x; m.wz = m.z; }
          else { m.x = nx; m.z = nz; }
          m.ry = Math.atan2(dx, dz);
          m.moving = true;
        }
      }
    }
    // can yenilenmesi (5 saniye hasar almayınca)
    for (const p of alivePlayers) {
      if (now - (p.lastHurt || 0) > 5000 && p.hp < p.maxHp) {
        p.regenAcc = (p.regenAcc || 0) + p.maxHp * (0.02 + (R.totals(p).hpregen || 0) / 1000) * dt;
        if (p.regenAcc >= 1) { const g = Math.floor(p.regenAcc); p.regenAcc -= g; this.hooks.heal(p, g); }
      }
    }
    // eski ganimet
    for (const d of this.drops.values()) if (now > d.expires) { this.drops.delete(d.id); this.emit('dropGone', { id: d.id }); }
    // konum yayını
    if (this.players.size) {
      this.emit('state', {
        p: [...this.players.values()].map((p) => ({ id: p.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), ry: +p.ry.toFixed(2), moving: p.moving })),
        m: [...this.mobs.values()].map((m) => [m.id, +m.x.toFixed(2), +m.z.toFixed(2), +m.ry.toFixed(2), m.moving ? 1 : 0]),
      });
    }
  }
}

module.exports = { Zone, boundsOf };
