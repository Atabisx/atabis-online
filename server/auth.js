// Hesap sistemi: kayıt, giriş, oturum anahtarları
const crypto = require('crypto');
const { promisify } = require('util');
const db = require('./db');
const config = require('./config');

const scrypt = promisify(crypto.scrypt);

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
async function checkPassword(password, stored) {
  const [algo, saltHex, keyHex] = String(stored).split('$');
  if (algo !== 'scrypt') return false;
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64);
  const expected = Buffer.from(keyHex, 'hex');
  return expected.length === key.length && crypto.timingSafeEqual(expected, key);
}

const USERNAME_RE = /^[a-zA-Z0-9_çğıöşüÇĞİÖŞÜ]{3,20}$/;

// basit deneme sınırı: aynı IP'den dakikada en fazla 10 deneme
const attempts = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const list = (attempts.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now);
  attempts.set(ip, list);
  return list.length > 10;
}
setInterval(() => attempts.clear(), 10 * 60000).unref();

async function createSession(accountId) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO sessions (token, account_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)`,
    [token, accountId, String(config.sessionDays)]);
  return token;
}

async function accountFromToken(token) {
  if (typeof token !== 'string' || !/^[0-9a-f]{64}$/.test(token)) return null;
  const r = await db.query(
    `SELECT a.id, a.username FROM sessions s JOIN accounts a ON a.id = s.account_id
     WHERE s.token = $1 AND s.expires_at > now()`, [token]);
  return r.rows[0] || null;
}

function routes(app) {
  app.post('/api/register', async (req, res) => {
    try {
      if (rateLimited(req.ip)) return res.status(429).json({ error: 'Çok fazla deneme. Bir dakika bekle.' });
      const { username, password } = req.body || {};
      if (!USERNAME_RE.test(String(username || ''))) {
        return res.status(400).json({ error: 'Kullanıcı adı 3-20 karakter olmalı; harf, rakam ve _ kullanılabilir.' });
      }
      if (typeof password !== 'string' || password.length < 6 || password.length > 100) {
        return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı.' });
      }
      const exists = await db.query('SELECT 1 FROM accounts WHERE lower(username) = lower($1)', [username]);
      if (exists.rowCount) return res.status(409).json({ error: 'Bu kullanıcı adı alınmış.' });
      const hash = await hashPassword(password);
      const r = await db.query(
        'INSERT INTO accounts (username, password_hash, last_login) VALUES ($1, $2, now()) RETURNING id', [username, hash]);
      const token = await createSession(r.rows[0].id);
      res.json({ token, username });
    } catch (e) {
      console.error('register', e);
      res.status(500).json({ error: 'Sunucu hatası.' });
    }
  });

  app.post('/api/login', async (req, res) => {
    try {
      if (rateLimited(req.ip)) return res.status(429).json({ error: 'Çok fazla deneme. Bir dakika bekle.' });
      const { username, password } = req.body || {};
      const r = await db.query('SELECT id, username, password_hash FROM accounts WHERE lower(username) = lower($1)', [String(username || '')]);
      const acc = r.rows[0];
      if (!acc || !(await checkPassword(String(password || ''), acc.password_hash))) {
        return res.status(401).json({ error: 'Kullanıcı adı veya şifre yanlış.' });
      }
      await db.query('UPDATE accounts SET last_login = now() WHERE id = $1', [acc.id]);
      const token = await createSession(acc.id);
      res.json({ token, username: acc.username });
    } catch (e) {
      console.error('login', e);
      res.status(500).json({ error: 'Sunucu hatası.' });
    }
  });

  app.post('/api/logout', async (req, res) => {
    const token = req.get('authorization')?.replace(/^Bearer /, '');
    if (token) await db.query('DELETE FROM sessions WHERE token = $1', [token]).catch(() => {});
    res.json({ ok: true });
  });
}

// istek başlığındaki anahtarı kontrol eden ara katman
async function requireAuth(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer /, '');
  const account = await accountFromToken(token).catch(() => null);
  if (!account) return res.status(401).json({ error: 'Oturum süresi doldu. Tekrar giriş yap.' });
  req.account = account;
  return next();
}

module.exports = { routes, requireAuth, accountFromToken, hashPassword, checkPassword };
