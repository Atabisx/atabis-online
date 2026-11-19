#!/usr/bin/env bash
# ATABİS ONLINE – her gece 04:30'da otomatik yedek kurar (crontab)
# Kullanım (proje klasöründe, bir kez):  bash scripts/install-backup.sh
set -e
cd "$(dirname "$0")/.."
DIR="$(pwd)"
LINE="30 4 * * * cd $DIR && bash scripts/backup.sh >> $HOME/atabis-yedek.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'scripts/backup.sh' ; echo "$LINE" ) | crontab -
echo "Otomatik yedek kuruldu: her gece 04:30 (~/atabis-yedek). Şimdi bir deneme yedeği alınıyor…"
bash scripts/backup.sh
