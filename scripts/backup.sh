#!/usr/bin/env bash
# ATABİS ONLINE – veritabanı yedeği
# Kullanım (proje klasöründe):  bash scripts/backup.sh
# Yedekler ~/atabis-yedek klasörüne sıkıştırılmış olarak yazılır; en yeni 14 yedek tutulur.
# Geri yükleme:  gunzip -c ~/atabis-yedek/DOSYA.sql.gz | psql "$DATABASE_URL"
set -e
cd "$(dirname "$0")/.."
if [ ! -f .env ]; then echo "HATA: .env dosyası yok."; exit 1; fi
DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
if [ -z "$DATABASE_URL" ]; then echo "HATA: .env içinde DATABASE_URL yok."; exit 1; fi
DIR="${ATABIS_BACKUP_DIR:-$HOME/atabis-yedek}"
mkdir -p "$DIR"
FILE="$DIR/atabis-$(date +%Y%m%d-%H%M).sql.gz"
pg_dump --no-owner --no-privileges "$DATABASE_URL" | gzip -9 > "$FILE.tmp"
mv "$FILE.tmp" "$FILE"
# eski yedekleri temizle (en yeni 14 kalsın)
ls -1t "$DIR"/atabis-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm -f
echo "Yedek alındı: $FILE ($(du -h "$FILE" | cut -f1))"
