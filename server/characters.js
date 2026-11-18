// Karakter listeleme, oluşturma, silme
const db = require('./db');
const config = require('./config');
const { requireAuth } = require('./auth');
const CLASSES = require('../shared/classes.json');

const NAME_RE = /^[a-zA-Z0-9_çğıöşüÇĞİÖŞÜ]{3,14}$/;

function publicChar(row) {
  return { id: row.id, name: row.name, class: row.class, level: row.level, equip: row.equip };
}

function routes(app) {
  app.get('/api/characters', requireAuth, async (req, res) => {
    const r = await db.query('SELECT * FROM characters WHERE account_id = $1 ORDER BY id', [req.account.id]);
    res.json({ username: req.account.username, characters: r.rows.map(publicChar) });
  });

  app.post('/api/characters', requireAuth, async (req, res) => {
    try {
      const { name, cls } = req.body || {};
      if (!NAME_RE.test(String(name || ''))) {
        return res.status(400).json({ error: 'Karakter adı 3-14 karakter olmalı; harf, rakam ve _ kullanılabilir.' });
      }
      if (!CLASSES[cls]) return res.status(400).json({ error: 'Geçersiz sınıf.' });
      const count = await db.query('SELECT count(*)::int AS n FROM characters WHERE account_id = $1', [req.account.id]);
      if (count.rows[0].n >= config.maxCharactersPerAccount) {
        return res.status(400).json({ error: `Bir hesapta en fazla ${config.maxCharactersPerAccount} karakter olabilir.` });
      }
      const taken = await db.query('SELECT 1 FROM characters WHERE lower(name) = lower($1)', [name]);
      if (taken.rowCount) return res.status(409).json({ error: 'Bu karakter adı alınmış.' });
      const equip = { weapon: { uid: 1, key: CLASSES[cls].startWeapon }, armor: { uid: 2, key: 'armor0' },
                      helmet: null, shoes: null, bracelet: null, earring: null };
      const inventory = [{ uid: 3, key: 'p_hp1', n: 10 }];   // başlangıç iksirleri
      const r = await db.query(
        'INSERT INTO characters (account_id, name, class, equip, inventory) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [req.account.id, name, cls, JSON.stringify(equip), JSON.stringify(inventory)]);
      res.json({ character: publicChar(r.rows[0]) });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Bu karakter adı alınmış.' });
      console.error('create character', e);
      res.status(500).json({ error: 'Sunucu hatası.' });
    }
  });

  app.delete('/api/characters/:id', requireAuth, async (req, res) => {
    const r = await db.query('DELETE FROM characters WHERE id = $1 AND account_id = $2', [Number(req.params.id), req.account.id]);
    res.json({ ok: r.rowCount > 0 });
  });
}

module.exports = { routes };
