// PostgreSQL bağlantısı ve şemanın kurulması
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');

if (!config.databaseUrl) {
  console.error('HATA: .env dosyasında DATABASE_URL yok. README.md içindeki kurulum adımlarına bak.');
  process.exit(1);
}

const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  await pool.query(sql);
  await pool.query('DELETE FROM sessions WHERE expires_at < now()');
}

module.exports = { pool, migrate, query: (text, params) => pool.query(text, params) };
