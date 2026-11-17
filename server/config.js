// .env dosyasını okur (ek paket gerektirmez).
// .env her zaman önceliklidir: sunucuda başka projelerden kalma ortam değişkenleri olsa bile bu projeninkiler kullanılır.
const fs = require('fs');
const path = require('path');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

module.exports = {
  port: Number(process.env.PORT) || 3100,
  databaseUrl: process.env.DATABASE_URL,
  sessionDays: 30,
  maxCharactersPerAccount: 4,
};
