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
if pm2 describe atabis >/dev/null 2>&1; then
  pm2 restart atabis
else
  pm2 start server/index.js --name atabis
fi
pm2 save
echo "==> Tamam. Kayıtlar için: pm2 logs atabis --lines 30"
