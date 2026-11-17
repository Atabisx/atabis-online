# ATABİS ONLINE

Tarayıcıda, telefondan oynanan 3D MMORPG. Metin2'den ilham alır; içerik, kod ve tasarım projenin kendisine aittir.

## Durum: Aşama 0

Bu aşamada **gerçekten çalışanlar**:

- Hesap sistemi: kayıt, giriş, çıkış. Şifreler `scrypt` ile özetlenerek saklanır, düz metin tutulmaz.
- Hesap başına 4 karaktere kadar oluşturma ve silme; 5 sınıf: Savaşçı, Ninja, Sura, Şaman, Okçu.
- Sınıf farkları: başlangıç silahı, saldırı gücü çarpanı, kritik şansı (Ninja %25), hareket hızı (Ninja +%12), saldırı menzili (Okçu 12 m, oklar görünür).
- Silahlar sınıfa göre giyilir (kılıç, hançer, yay, asa).
- Atabis Köyü haritası, metin taşları, 3'lü kombo, kritik vuruş, ganimet, envanter, ekipman.
- Tüm ilerleme (seviye, Yang, eşya, konum) PostgreSQL'e kaydedilir.
- Aynı karakterle ikinci kez girilirse eski oturum kapatılır.

**Henüz olmayanlar** (sonraki aşamalarda): can ve mana, oyuncuya saldıran yaratıklar, sınıfa özel yetenekler ve modeller, kamera döndürme ve yakınlaştırma, görevler, sohbet arayüzü, grup, lonca, ticaret, PvP, zindanlar, kanallar.

## Klasörler

```
server/            sunucu (Node.js)
  index.js         giriş noktası: web sunucusu + Socket.io
  config.js        .env okuma
  db.js            PostgreSQL bağlantısı, şema kurulumu
  auth.js          kayıt, giriş, oturum
  characters.js    karakter listeleme, oluşturma, silme
  game/world.js    oyun dünyası: hareket, savaş, metin taşları, ganimet, kayıt
client/            tarayıcı tarafı
  index.html       ekranlar ve arayüz
  css/style.css    görünüm
  js/main.js       giriş → karakter seçimi → oyun akışı
  js/game.js       3D sahne, karakterler, kontroller, envanter
shared/            sunucu ve istemcinin ortak verileri
  classes.json     sınıflar
  items.json       eşyalar
db/schema.sql      veritabanı tabloları
scripts/update.sh  tek komutla güncelleme
```

## İlk kurulum (sunucuda bir kez)

```bash
# 1) Kodu indir
cd ~/atabis && git clone https://github.com/Atabisx/atabis-online.git && cd atabis-online

# 2) Veritabanı ve kullanıcı oluştur (rastgele şifreyle)
PW=$(openssl rand -hex 16)
su - postgres -c "psql -c \"CREATE USER atabis WITH PASSWORD '$PW';\""
su - postgres -c "createdb -O atabis atabis"

# 3) Ayar dosyası
echo "PORT=3100" > .env
echo "DATABASE_URL=postgres://atabis:$PW@127.0.0.1:5432/atabis" >> .env

# 4) Eski deneme oyununu kapat (varsa) ve başlat
pm2 delete metinio 2>/dev/null; bash scripts/update.sh
```

Tarayıcıda: `http://SUNUCU_IP:3100`

## Güncelleme (her yeni aşamada)

```bash
cd ~/atabis/atabis-online && bash scripts/update.sh
```

## Sorun giderme

- Kayıtlara bak: `pm2 logs atabis --lines 30`
- Veritabanına bağlanamıyorsa `.env` içindeki `DATABASE_URL` değerini kontrol et.
- Karakter modeli: `client/models/Soldier.glb` (three.js örnek modeli, ilk güncellemede otomatik iner).
