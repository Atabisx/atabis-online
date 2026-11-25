#!/usr/bin/env bash
# ATABİS ONLINE – alan adı bağlama (nginx + ücretsiz HTTPS sertifikası)
# Kullanım (sunucuda, proje klasöründe, root olarak):
#   bash scripts/domain.sh atabis2.com
#   bash scripts/domain.sh atabis2.com mail@ornek.com      (e-posta isteğe bağlı: sertifika uyarıları için)
# Önce alan adının DNS ayarlarında A kaydı bu sunucunun IP adresine yönlendirilmiş olmalı.
set -e
cd "$(dirname "$0")/.."

DOMAIN="$(echo "${1:-}" | tr 'A-Z' 'a-z' | sed -e 's#^https\?://##' -e 's#/.*##' -e 's#^www\.##')"
EMAIL="${2:-}"
if [ -z "$DOMAIN" ]; then
  echo "Kullanım: bash scripts/domain.sh alanadi.com [e-posta]"; exit 1
fi
if [ "$(id -u)" != "0" ]; then echo "HATA: root olarak çalıştır (sudo bash scripts/domain.sh $DOMAIN)"; exit 1; fi

PORT=$(grep -E '^PORT=' .env 2>/dev/null | cut -d= -f2); PORT=${PORT:-3100}

echo "==> Sunucunun IP adresi bulunuyor"
MYIP=$(curl -4 -fsS https://api.ipify.org || curl -4 -fsS https://ifconfig.me || true)
echo "    Sunucu IP: ${MYIP:-bilinmiyor}"

echo "==> $DOMAIN DNS kaydı kontrol ediliyor"
DNSIP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}')
WWWIP=$(getent ahostsv4 "www.$DOMAIN" | awk 'NR==1{print $1}')
echo "    $DOMAIN -> ${DNSIP:-kayıt yok}    www.$DOMAIN -> ${WWWIP:-kayıt yok}"
if [ -z "$DNSIP" ]; then
  echo "HATA: $DOMAIN henüz hiçbir IP'ye gitmiyor. Alan adını aldığın sitede DNS ayarlarına gir:"
  echo "      Tür: A   Ad: @    Değer: $MYIP"
  echo "      Tür: A   Ad: www  Değer: $MYIP"
  echo "      Kaydettikten sonra 5-30 dakika bekleyip bu komutu tekrar çalıştır."
  exit 1
fi
if [ -n "$MYIP" ] && [ "$DNSIP" != "$MYIP" ]; then
  echo "HATA: $DOMAIN şu an $DNSIP adresine gidiyor ama bu sunucu $MYIP."
  echo "      DNS'teki A kaydını $MYIP yap, birkaç dakika bekle ve tekrar dene."
  exit 1
fi
NAMES="$DOMAIN"; CERTNAMES="-d $DOMAIN"
if [ -n "$WWWIP" ] && [ "$WWWIP" = "$DNSIP" ]; then NAMES="$DOMAIN www.$DOMAIN"; CERTNAMES="-d $DOMAIN -d www.$DOMAIN"; fi

echo "==> 80 numaralı kapı kontrol ediliyor"
USER80=$(ss -ltnp 2>/dev/null | awk '$4 ~ /:80$/' | grep -o 'users:(("[^"]*' | head -1 | cut -d'"' -f2)
# Sunucuda zaten Caddy çalışıyorsa (diğer siteler için) nginx kurmayız: Caddy'ye bu alan adını ekleriz.
# Caddy HTTPS sertifikasını kendisi alır ve socket.io (websocket) bağlantısını kendiliğinden geçirir.
if [ "$USER80" = "caddy" ]; then
  CADDYFILE=$(systemctl cat caddy 2>/dev/null | grep -o -- '--config [^ ]*' | head -1 | awk '{print $2}')
  CADDYFILE=${CADDYFILE:-/etc/caddy/Caddyfile}
  echo "==> Caddy bulundu, ayar dosyası: $CADDYFILE"
  if [ ! -f "$CADDYFILE" ]; then echo "HATA: $CADDYFILE bulunamadı. Bana 'systemctl cat caddy' çıktısını gönder."; exit 1; fi
  if grep -qE "(^|[ ,])$DOMAIN([ ,{]|$)" "$CADDYFILE"; then
    echo "    $DOMAIN zaten Caddyfile içinde, tekrar eklenmiyor."
  else
    BACKUP="$CADDYFILE.yedek-$(date +%Y%m%d%H%M%S)"
    cp "$CADDYFILE" "$BACKUP"
    SITES="$DOMAIN"; [ "$NAMES" != "$DOMAIN" ] && SITES="$DOMAIN, www.$DOMAIN"
    {
      echo ""
      echo "# ATABİS ONLINE – scripts/domain.sh tarafından eklendi"
      echo "$SITES {"
      echo "	encode gzip"
      echo "	reverse_proxy 127.0.0.1:$PORT"
      echo "}"
    } >> "$CADDYFILE"
    if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/tmp/caddy-validate.log 2>&1; then
      cp "$BACKUP" "$CADDYFILE"
      echo "HATA: Caddy ayarı geçersiz çıktı, eski haline döndürüldü. Ayrıntı:"; tail -5 /tmp/caddy-validate.log; exit 1
    fi
  fi
  if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null; fi
  systemctl reload caddy
  echo "==> Caddy yeniden yüklendi; HTTPS sertifikası birkaç saniye içinde kendiliğinden alınır."
  sleep 8
  CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/" || true)
  echo "    https://$DOMAIN cevabı: ${CODE:-yok} (200 ise her şey yolunda)"
  echo ""
  echo "==> Tamam! Oyun artık burada:  https://$DOMAIN"
  echo "    Açılmazsa 1-2 dakika bekle; olmazsa şu komutun çıktısını gönder: journalctl -u caddy --no-pager -n 30"
  exit 0
fi

if [ -n "$USER80" ] && [ "$USER80" != "nginx" ]; then
  echo "HATA: 80 numaralı kapıyı '$USER80' kullanıyor (nginx değil). Önce onu durdur ya da bana yaz."
  exit 1
fi

echo "==> nginx ve certbot kuruluyor"
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nginx certbot python3-certbot-nginx >/dev/null

echo "==> nginx ayarı yazılıyor (oyun: 127.0.0.1:$PORT)"
CONF=/etc/nginx/sites-available/atabis-online
cat > "$CONF" <<EOF
# ATABİS ONLINE – scripts/domain.sh tarafından yazıldı
map \$http_upgrade \$atabis_conn { default upgrade; '' close; }
server {
    listen 80;
    listen [::]:80;
    server_name $NAMES;
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        # socket.io (oyunun canlı bağlantısı) için gerekli
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$atabis_conn;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
EOF
ln -sf "$CONF" /etc/nginx/sites-enabled/atabis-online
nginx -t
systemctl enable --now nginx >/dev/null 2>&1 || true
systemctl reload nginx

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  echo "==> Güvenlik duvarında 80 ve 443 açılıyor"
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi

echo "==> Ücretsiz HTTPS sertifikası alınıyor (Let's Encrypt)"
if [ -n "$EMAIL" ]; then MAILOPT="-m $EMAIL"; else MAILOPT="--register-unsafely-without-email"; fi
certbot --nginx $CERTNAMES --non-interactive --agree-tos $MAILOPT --redirect

systemctl reload nginx
echo ""
echo "==> Tamam! Oyun artık burada:  https://$DOMAIN"
echo "    Sertifika 90 günde bir kendiliğinden yenilenir."
