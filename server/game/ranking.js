// Sıralama tablosu: seviye, canavar avcısı, düello, lonca ve krallık. Sonuçlar 30 saniye önbellekte tutulur.
const config = require('../config');

function createRanking(W) {
  const { db } = W;
  const cache = new Map();
  const gms = config.gmNames || [];
  const QUERIES = {
    level: `SELECT c.name, c.class, c.level, c.empire, g.name AS guild FROM characters c LEFT JOIN guilds g ON g.id = c.guild_id
            WHERE NOT (lower(c.name) = ANY(string_to_array($1, chr(44)))) ORDER BY c.level DESC, c.exp DESC LIMIT 50`,
    kills: `SELECT c.name, c.class, c.level, c.empire, c.kills AS value, g.name AS guild FROM characters c LEFT JOIN guilds g ON g.id = c.guild_id
            WHERE NOT (lower(c.name) = ANY(string_to_array($1, chr(44)))) AND c.kills > 0 ORDER BY c.kills DESC LIMIT 50`,
    duel: `SELECT c.name, c.class, c.level, c.empire, (c.quests->>'duelWins')::int AS value, g.name AS guild FROM characters c LEFT JOIN guilds g ON g.id = c.guild_id
           WHERE NOT (lower(c.name) = ANY(string_to_array($1, chr(44)))) AND (c.quests->>'duelWins') IS NOT NULL ORDER BY (c.quests->>'duelWins')::int DESC LIMIT 50`,
    guild: `SELECT g.name, g.level, g.exp, g.wins, (SELECT count(*)::int FROM characters c WHERE c.guild_id = g.id) AS members,
            (SELECT c.name FROM characters c WHERE c.id = g.leader_id) AS leader FROM guilds g ORDER BY g.level DESC, g.exp DESC LIMIT 50`,
    empire: `SELECT empire, count(*)::int AS players, coalesce(sum(level), 0)::int AS levels, coalesce(max(level), 0)::int AS top
             FROM characters WHERE empire IS NOT NULL AND NOT (lower(name) = ANY(string_to_array($1, chr(44)))) GROUP BY empire ORDER BY empire`,
  };
  async function get(tab) {
    const c = cache.get(tab);
    if (c && Date.now() - c.at < 30000) return c.rows;
    const q = QUERIES[tab]; if (!q) return [];
    const r = await db.query(q, tab === 'guild' ? [] : [gms.join(',')]);
    cache.set(tab, { at: Date.now(), rows: r.rows });
    return r.rows;
  }
  function onConnect(p, socket) {
    socket.on('rankGet', async (tab) => {
      tab = QUERIES[tab] ? tab : 'level';
      try {
        const rows = await get(tab);
        let mine = null;
        if (tab === 'level') {
          const r = await db.query('SELECT count(*)::int + 1 AS n FROM characters WHERE (level > $1 OR (level = $1 AND exp > $2)) AND NOT (lower(name) = ANY(string_to_array($3, chr(44))))', [p.level, p.exp, gms.join(',')]);
          mine = r.rows[0].n;
        }
        socket.emit('rank', { tab, rows, mine });
      } catch (e) { console.error('sıralama', e.message); socket.emit('rank', { tab, rows: [], mine: null }); }
    });
  }
  return { onConnect };
}

module.exports = { createRanking };
