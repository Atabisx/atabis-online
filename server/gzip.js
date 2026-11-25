// Statik dosyaları sıkıştırarak gönderir (ek paket gerektirmez, Node'un zlib'i).
// 3D modeller (glb), oyun kodu ve veriler ilk istekte bir kez sıkıştırılıp diske yazılır, sonra hazır dosya gönderilir.
// Karakter modelleri gibi büyük dosyalar yaklaşık yarı boyuta iner; telefonda iniş süresi kısalır.
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const crypto = require('crypto');

const TYPES = {
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.json': 'application/json; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.bin': 'application/octet-stream',
};
const CACHE = path.join(os.tmpdir(), 'atabis-gz');
const pending = new Map();

function gzFile(file, st) {
  const key = crypto.createHash('sha1').update(`${file}:${st.size}:${st.mtimeMs}`).digest('hex');
  const out = path.join(CACHE, key + '.gz');
  if (fs.existsSync(out)) return Promise.resolve(out);
  if (pending.has(out)) return pending.get(out);
  const p = new Promise((resolve, reject) => {
    fs.mkdirSync(CACHE, { recursive: true });
    const tmp = out + '.' + process.pid + '.tmp';
    fs.createReadStream(file).pipe(zlib.createGzip({ level: 6 })).pipe(fs.createWriteStream(tmp))
      .on('finish', () => { fs.renameSync(tmp, out); resolve(out); })
      .on('error', reject);
  }).finally(() => pending.delete(out));
  pending.set(out, p);
  return p;
}

module.exports = function gzipStatic(root) {
  root = path.resolve(root);
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    if (!/\bgzip\b/.test(req.headers['accept-encoding'] || '')) return next();
    let rel;
    try { rel = decodeURIComponent(req.path); } catch (e) { return next(); }
    if (rel.endsWith('/')) rel += 'index.html';
    const ext = path.extname(rel).toLowerCase();
    if (!TYPES[ext]) return next();
    const file = path.join(root, rel);
    if (!file.startsWith(root + path.sep)) return next();
    fs.stat(file, (err, st) => {
      if (err || !st.isFile() || st.size < 1024) return next();
      const etag = `"gz-${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`;
      res.setHeader('Vary', 'Accept-Encoding');
      res.setHeader('ETag', etag);
      res.setHeader('Cache-Control', 'no-cache');            // her seferinde ETag ile sorulur, değişmediyse 304
      if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); }
      gzFile(file, st).then((gz) => {
        const gst = fs.statSync(gz);
        res.setHeader('Content-Type', TYPES[ext]);
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Length', gst.size);
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(gz).pipe(res);
      }).catch(() => next());
    });
  };
};
