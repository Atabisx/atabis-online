// Yönetim paneli API'si (/admin sayfası bunu kullanır).
// Sadece GM karakteri (.env GM_NAMES) olan hesaplar girebilir.
const db = require('./db');
const config = require('./config');
const { requireAuth } = require('./auth');

async function isAdmin(accountId) {
  const r = await db.query('SELECT name FROM characters WHERE account_id = $1', [accountId]);
  return r.rows.some((c) => config.gmNames.includes(String(c.name).toLocaleLowerCase('tr-TR')));
}

function routes(app, world) {
  const A = world.admin;
  const guard = [requireAuth, async (req, res, next) => {
    try {
      if (!(await isAdmin(req.account.id))) return res.status(403).json({ error: 'Bu hesap yönetici değil. GM karakteri olan hesapla giriş yap.' });
      return next();
    } catch (e) { res.status(500).json({ error: 'Sunucu hatası.' }); }
  }];
  // hata yakalayan sarmalayıcı: işlem mesajı { ok, msg } olarak döner
  const act = (fn) => async (req, res) => {
    try { const out = await fn(req.body || {}, req); res.json(typeof out === 'string' ? { ok: true, msg: out } : out); }
    catch (e) { res.status(400).json({ error: e.message || 'İşlem yapılamadı.' }); }
  };

  app.get('/api/admin/me', ...guard, (req, res) => res.json({ username: req.account.username }));

  app.get('/api/admin/summary', ...guard, act(async () => {
    const q = async (sql) => (await db.query(sql)).rows[0];
    const acc = await q('SELECT count(*)::int AS n FROM accounts');
    const ch = await q('SELECT count(*)::int AS n, coalesce(max(level), 0) AS top, coalesce(sum(yang), 0)::text AS yang FROM characters');
    const today = await q("SELECT count(*)::int AS n FROM characters WHERE last_played > now() - interval '1 day'");
    const newAcc = await q("SELECT count(*)::int AS n FROM accounts WHERE created_at > now() - interval '7 days'");
    const cls = (await db.query('SELECT class, count(*)::int AS n FROM characters GROUP BY class ORDER BY n DESC')).rows;
    const top = (await db.query('SELECT name, class, level FROM characters ORDER BY level DESC, exp DESC LIMIT 10')).rows;
    return { accounts: acc.n, characters: ch.n, topLevel: ch.top, totalYang: ch.yang, activeToday: today.n, newAccounts: newAcc.n, classes: cls, top,
      online: A.online(), events: A.events(), eventTypes: A.eventTypes(), expRate: A.expRate() };
  }));

  app.get('/api/admin/players', ...guard, act(async (b, req) => {
    const s = String((req.query || {}).q || '').trim();
    const r = await db.query(
      `SELECT c.name, c.class, c.level, c.yang::text AS yang, c.map_id, c.last_played, a.username FROM characters c JOIN accounts a ON a.id = c.account_id
       WHERE $1 = '' OR c.name ILIKE '%' || $1 || '%' OR a.username ILIKE '%' || $1 || '%'
       ORDER BY c.last_played DESC NULLS LAST LIMIT 200`, [s]);
    const on = new Set(A.online().map((o) => o.name));
    return { players: r.rows.map((x) => ({ ...x, online: on.has(x.name) })) };
  }));

  app.get('/api/admin/player/:name', ...guard, act(async (b, req) => {
    const c = await A.character(req.params.name);
    if (!c) throw new Error(`${req.params.name} adında karakter yok.`);
    return c;
  }));

  app.post('/api/admin/give', ...guard, act((b) => A.give(String(b.name || ''), String(b.key || ''), b.n, b.maxed !== false)));
  app.post('/api/admin/remove', ...guard, act((b) => A.removeItem(String(b.name || ''), b.uid)));
  app.post('/api/admin/level', ...guard, act((b) => A.setLevel(String(b.name || ''), b.level)));
  app.post('/api/admin/yang', ...guard, act((b) => A.setYang(String(b.name || ''), b.yang)));
  app.post('/api/admin/ep', ...guard, act((b) => A.ep(String(b.name || ''), b.amount)));
  app.post('/api/admin/teleport', ...guard, act((b) => A.teleport(String(b.name || ''), Number(b.map))));
  app.post('/api/admin/kick', ...guard, act((b) => A.kick(String(b.name || ''))));
  app.post('/api/admin/announce', ...guard, act((b) => A.announce(b.text)));
  app.post('/api/admin/exprate', ...guard, act((b) => A.setExpRate(b.mul, b.minutes)));
  app.post('/api/admin/event', ...guard, act((b) => A.event(String(b.type || ''), b.minutes, !!b.stop)));
  app.post('/api/admin/worldboss', ...guard, act((b) => A.worldBoss(b.action)));
}

module.exports = { routes };
