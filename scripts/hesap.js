// Hesap aracı (sunucuda, proje klasöründe çalıştır):
//   node scripts/hesap.js gm                      -> GM karakterleri ve sahibi olan hesaplar
//   node scripts/hesap.js bul <karakter adı>      -> karakterin hangi hesapta olduğu
//   node scripts/hesap.js sifre <kullanıcı> <yeni şifre>  -> hesabın şifresini değiştirir (oturumları kapatır)
const config = require('../server/config');
const db = require('../server/db');
const { hashPassword } = require('../server/auth');

async function owner(name) {
  const r = await db.query(`SELECT c.name, c.class, c.level, a.username FROM characters c JOIN accounts a ON a.id = c.account_id
    WHERE lower(c.name) = lower($1)`, [name]);
  return r.rows[0];
}
(async () => {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'gm') {
      console.log('GM sayılan karakter adları (.env GM_NAMES):', config.gmNames.join(', '));
      for (const n of config.gmNames) {
        const o = await owner(n);
        console.log(o ? `  ${o.name} (Sv. ${o.level}) -> kullanıcı adı: ${o.username}` : `  ${n} -> henüz bu adla karakter açılmamış`);
      }
    } else if (cmd === 'bul' && a) {
      const o = await owner(a);
      console.log(o ? `${o.name} (Sv. ${o.level}) -> kullanıcı adı: ${o.username}` : `${a} adında karakter yok.`);
    } else if (cmd === 'sifre' && a && b) {
      if (b.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');
      const r = await db.query('UPDATE accounts SET password_hash = $2 WHERE lower(username) = lower($1) RETURNING id, username', [a, await hashPassword(b)]);
      if (!r.rows[0]) throw new Error(`${a} adında hesap yok.`);
      await db.query('DELETE FROM sessions WHERE account_id = $1', [r.rows[0].id]);
      console.log(`${r.rows[0].username} hesabının şifresi değiştirildi. Yeni şifreyle giriş yapabilirsin.`);
    } else {
      console.log('Kullanım:\n  node scripts/hesap.js gm\n  node scripts/hesap.js bul <karakter adı>\n  node scripts/hesap.js sifre <kullanıcı adı> <yeni şifre>');
    }
  } catch (e) { console.error('HATA:', e.message); process.exitCode = 1; }
  if (typeof db.pool.end === 'function') await db.pool.end(); else process.exit();
})();
