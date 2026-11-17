#!/usr/bin/env bash
# ATABİS ONLINE – güncelleme betiği
# Kullanım (sunucuda, proje klasöründe):  bash scripts/update.sh
set -e
cd "$(dirname "$0")/.."

echo "==> GitHub'dan son sürüm alınıyor"
git pull --ff-only

echo "==> Paketler kuruluyor"
npm install --omit=dev --no-audit --no-fund

MODEL=client/models/Soldier.glb
if [ ! -s "$MODEL" ]; then
  echo "==> Karakter modeli indiriliyor"
  mkdir -p client/models
  curl -fL -o "$MODEL" https://raw.githubusercontent.com/mrdoob/three.js/r170/examples/models/gltf/Soldier.glb \
    || echo "UYARI: Model indirilemedi. Oyun basit karakterlerle açılır."
fi

if [ ! -f .env ]; then
  echo "HATA: .env dosyası yok. README.md içindeki 'İlk kurulum' adımlarını yap."
  exit 1
fi

echo "==> Oyun yeniden başlatılıyor"
# Not: sunucuda "atabis" adında başka bir uygulama olabilir, ona dokunmamak için ayrı isim kullanıyoruz
APP=atabis-online
if pm2 describe "$APP" >/dev/null 2>&1; then
  pm2 restart "$APP"
else
  pm2 start server/index.js --name "$APP" --cwd "$(pwd)"
fi
pm2 save
echo "==> Tamam. Kayıtlar için: pm2 logs $APP --lines 30 --nostream"
