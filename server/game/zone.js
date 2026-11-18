// Bir harita (bölge): yaratıklar, metin taşları, yerdeki ganimet ve o haritadaki oyuncular.
// Her bölge kendi Socket.io odasına yayın yapar.
const R = require('./rules');

const BOUNDS = { min: -15, max: 65 };
const VILLAGE_CENTER = { x: 25, z: 25 };
const LEASH = 28;                 // yaratık evinden bu kadar uzaklaşınca geri döner
const BOSS_SPOTS = [[52, 52], [52, -2], [-2, 52], [48, 10]];
const STONE_SPOTS = [[40.5, 8], [55, 22.5], [52.5, 40], [7.5, 55], [-5, 10], [37.5, 52.5], [60, 5], [-7.5, 37.5]];

const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

class Zone {
  constructor(io, def, hooks) {
    this.io = io;
    this.def = def;
    this.id = def.id;
    this.room = 'map:' + def.id;
    this.hooks = hooks;            // world.js'ten gelen: onMobKilled, onPlayerDied, givePlayerDrop...
    this.players = new Map();      // socket.id -> oyuncu
    this.mobs = new Map();
    this.stones = new Map();
    this.drops = new Map();
    this.nextId = 1;
    this.alive = true;
    for (const sp of def.spawns) for (let i = 0; i < sp.count; i++) this.spawnMob(sp.mob, null);
    def.bosses.forEach((key, i) => this.spawnMob(key, BOSS_SPOTS[i % BOSS_SPOTS.length]));
    for (let i = 0; i < 3; i++) this.spawnStone();
  }

  emit(ev, data) { this.io.to(this.room).emit(ev, data); }

  // ---------- konum seçimi ----------
  safeFrom(x, z) {
    if (this.def.village && Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.z) < 22) return false;
    if (Math.hypot(x - this.def.spawn[0], z - this.def.spawn[1]) < 12) return false;
    for (const p of this.def.portals) if (Math.hypot(x - p.x, z - p.z) < 8) return false;
    return true;
  }
  randomSpot() {
    for (let i = 0; i < 60; i++) {
      const x = rand(BOUNDS.min + 5, BOUNDS.max - 5), z = rand(BOUNDS.min + 5, BOUNDS.max - 5);
      if (this.safeFrom(x, z)) return [x, z];
    }
    return [50, 50];
  }

  // ---------- yaratıklar ----------
  spawnMob(key, spot) {
    const d = R.MOBS[key];
    const [x, z] = spot || this.randomSpot();
    const id = this.nextId++;
    const m = { id, key, d, x, z, homeX: x, homeZ: z, hp: d.hp, max: d.hp, state: 'idle', target: null,
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
    const free = STONE_SPOTS.map((_, i) => i).filter((i) => !used.has(i) && this.safeFrom(...STONE_SPOTS[i]));
    if (!free.length) return;
    const spot = free[Math.floor(Math.random() * free.length)];
    const lv = this.def.minLevel + 4;
    const purple = Math.random() < 0.3;
    const hp = Math.round((100 + lv * lv * 2.5 + lv * 20) * (purple ? 7 : 5));
    const id = this.nextId++;
    const s = { id, spot, x: STONE_SPOTS[spot][0], z: STONE_SPOTS[spot][1], lv, hp, max: hp,
                name: purple ? 'Gölge Metini' : 'Ölüm Metini', color: purple ? 'purple' : 'red' };
    this.stones.set(id, s);
    this.emit('stoneSpawn', s);
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
  rollLoot(x, z, owner, drops, potions, yangRange) {
    if (yangRange) this.makeDrop(x, z, owner, null, Math.round(rand(yangRange[0], yangRange[1])));
    for (const [key, chance] of drops || []) {
      if (R.ITEMS[key] && Math.random() < chance) this.makeDrop(x, z, owner, { key });
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
      const d = dist(m, p) - m.d.scale * 0.6;
      if (d < range && d < bestD) { best = m; bestD = d; kind = 'mob'; }
    }
    for (const s of this.stones.values()) {
      const d = dist(s, p) - 1.2;
      if (d < range && d < bestD) { best = s; bestD = d; kind = 'stone'; }
    }
    this.emit('swing', { id: p.id, combo, target: best ? best.id : null });
    if (!best) return;
    const { dmg, crit } = R.playerDamage(p, kind === 'mob' ? best.d.def : 0, combo);
    best.hp = Math.max(0, best.hp - dmg);
    this.emit('hit', { id: best.id, kind, dmg, crit, hp: best.hp, by: p.id });
    if (kind === 'mob') {
      best.dmgBy.set(p.id, (best.dmgBy.get(p.id) || 0) + dmg);
      if (best.state !== 'chase') { best.state = 'chase'; best.target = p; }
      if (best.hp <= 0) this.killMob(best);
    } else if (best.hp <= 0) {
      this.stones.delete(best.id);
      this.emit('stoneDown', { id: best.id, by: p.id, name: p.name, stoneName: best.name });
      const exp = Math.round((20 + best.lv * 9 + best.lv * best.lv * 0.35) * 5);
      this.hooks.giveExp(p, R.expGain(best.lv, p.level, exp));
      const own = this.def.stoneDrops;
      const n = best.color === 'purple' ? 2 : 1;
      for (let i = 0; i < n; i++) if (Math.random() < 0.6) this.makeDrop(best.x, best.z, p.id, { key: own[Math.floor(Math.random() * own.length)] });
      this.makeDrop(best.x, best.z, p.id, null, Math.round((50 + best.lv * 30) * (n + Math.random())));
      setTimeout(() => this.spawnStone(), 15000);
    }
  }

  killMob(m) {
    this.mobs.delete(m.id);
    // en çok hasar vuran oyuncu ganimetin ve tecrübenin sahibi
    let ownerId = null, top = -1;
    for (const [id, v] of m.dmgBy) if (v > top && this.players.has(id)) { top = v; ownerId = id; }
    const owner = ownerId ? this.players.get(ownerId) : null;
    this.emit('mobDie', { id: m.id, by: ownerId, name: owner ? owner.name : '', mobName: m.d.name, boss: m.d.boss });
    if (owner) this.hooks.giveExp(owner, R.expGain(m.d.lv, owner.level, m.d.exp));
    this.rollLoot(m.x, m.z, ownerId, m.d.drops, m.d.potions, m.d.yang);
    const delay = (m.d.respawn || 12) * 1000;
    setTimeout(() => { if (this.alive) this.spawnMob(m.key, m.spot); }, delay);
    if (m.d.boss) this.hooks.announce(`${m.d.name} ${owner ? owner.name + ' tarafından ' : ''}yenildi! ${m.d.respawn || 120} saniye sonra geri dönecek.`, this);
  }

  // ---------- zaman adımı ----------
  tick(dt) {
    const now = Date.now();
    const alivePlayers = [...this.players.values()].filter((p) => !p.dead);
    // haritada kimse yoksa yaratıklar bekler (işlemciyi boşa harcamaz)
    if (this.players.size) for (const m of this.mobs.values()) {
      const d = m.d;
      let tx = null, tz = null, speed = d.speed;
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
              const dmg = R.mobDamage(d, t);
              this.emit('mobAttack', { id: m.id, target: t.id, dmg });
              this.hooks.damagePlayer(t, dmg, m);
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
          m.x = Math.max(BOUNDS.min, Math.min(BOUNDS.max, m.x + dx / len * step));
          m.z = Math.max(BOUNDS.min, Math.min(BOUNDS.max, m.z + dz / len * step));
          m.ry = Math.atan2(dx, dz);
          m.moving = true;
        }
      }
    }
    // can yenilenmesi (5 saniye hasar almayınca)
    for (const p of alivePlayers) {
      if (now - (p.lastHurt || 0) > 5000 && p.hp < p.maxHp) {
        p.regenAcc = (p.regenAcc || 0) + p.maxHp * 0.02 * dt;
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

Zone.BOUNDS = BOUNDS;
module.exports = { Zone };
