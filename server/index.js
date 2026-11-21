// ATABİS ONLINE – sunucu giriş noktası
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const config = require('./config');
const db = require('./db');
const auth = require('./auth');
const characters = require('./characters');
const admin = require('./admin');
const { createWorld } = require('./game/world');

async function main() {
  await db.migrate();

  const app = express();
  app.set('trust proxy', true);
  app.use(express.json({ limit: '20kb' }));
  app.use(express.static(path.join(__dirname, '..', 'client')));
  app.use('/shared', express.static(path.join(__dirname, '..', 'shared')));
  auth.routes(app);
  characters.routes(app);
  app.get('/api/status', (req, res) => res.json({ ok: true, online: world.online() }));
  app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'client', 'admin.html')));

  const server = http.createServer(app);
  const io = new Server(server);
  const world = createWorld(io);
  admin.routes(app, world);

  const shutdown = async () => {
    console.log('Kapanıyor, oyuncular kaydediliyor…');
    await world.saveAll();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  server.listen(config.port, () => console.log(`ATABİS ONLINE çalışıyor: port ${config.port}`));
}

main().catch((e) => {
  console.error('Başlatılamadı:', e.message);
  if (e.code === 'ECONNREFUSED' || e.code === '28P01' || e.code === '3D000') {
    console.error('Veritabanına bağlanılamadı. .env içindeki DATABASE_URL değerini kontrol et.');
  }
  process.exit(1);
});
