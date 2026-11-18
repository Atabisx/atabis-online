# ATABİS ONLINE

Tarayıcıda, telefondan oynanan 3D MMORPG. Metin2'den ilham alır; içerik, kod ve tasarım projenin kendisine aittir.

## Durum

### Aşama 3 (bu sürüm)

- **Tek köy:** sadece Atabis Köyü köy. Kış teması: karlı zemin, karlı çatılar, kardan adamlar ve sürekli kar yağışı. Bütün dükkânlar (iksir, kendi sınıfına göre silah, zırh/takı) ve ışınlayıcı burada. Ölünce burada doğarsın.
- **Büyük haritalar:** köy dışındaki 14 harita 140×140 metre (eskiden 80×80), her birinde 42 yaratık. Eski köyler vahşi bölge oldu: Kızılçam Ormanı, Kızıl Kanyon, Ejder Kalesi.
- **İki farklı çöl:** Kuru Çöl (sarı kum tepeleri, kaktüs, kemik) ve Kızıl Kanyon (kızıl kaya kuleleri, kuru çalı, turuncu gökyüzü).
- **Her boss farklı görünür:** 17 boss'un her birinin kendi süsü var (boynuz, taç, pelerin, kanat, alev, kristal, diken, yele, cadı şapkası, etrafında dönen küreler, renkli aura).
- **Efsun Değiştirme Nesnesi:** sadece boss'lardan %20 düşer; eşyadaki efsunların hepsini yeniden belirler. Efsun Nesnesi artık sadece ekler (en fazla 5).
- **Işınlayıcı NPC'si** artık mor bir ruh modeli (`client/models/npc/isinlayici.glb`): havada süzülür, yerde mor ışık halkası var, yaklaşınca sana döner.
- **Sesler:** kılıç savurma, ok, büyü, isabet, kritik, hasar alma, yaratık ölümü, boss düşüşü, metin taşı kırılması, ganimet ve para, iksir, beceriler, balık, efsun ve **seviye atlama melodisi**. Ses dosyası yok, tarayıcıda üretilir. Sol üstteki hoparlör butonu sesi kapatır/açar.

### Aşama 2

- **Beceriler:** her sınıfın 4 kendi becerisi var, 5. seviyede açılır. Her seviyede 1 beceri puanı; beceriler 1-17, sonra M1-M3'e kadar yükselir. Sol üstteki şimşek simgesi beceri penceresini açar; beceri butonları saldırı butonunun solunda.
- **Mana (MP):** beceriler mana harcar; mana kendiliğinden dolar.
- **İksirler:** kırmızı (can), mavi (mana), yeşil (5 dk saldırı hızı +%20), hız iksiri (5 dk hareket hızı +%25). Hepsi markette ucuz fiyata; boss'lardan da düşer.
- **Efsun Nesnesi:** sadece metin taşlarından %15 ihtimalle düşer. Ekipmana rastgele efsun ekler (en fazla 5): maks. can/mana, saldırı, savunma, kritik, saldırı ve hareket hızı, canavarlara karşı güç, can çalma. 
- **At:** 25. seviyede köydeki Seyis'ten görev al (20 Vahşi Kurt), ödül At Mührü. Atlıyken %60 daha hızlısın.
- **Balık tutma:** 30. seviyede olta ve 20 yem otomatik verilir. Işınlayıcıdan Gümüş Göl'e git, kıyıda "Olta at"a bas, buton "ÇEK!" olunca dokun. İstiridyeden nadiren inci çıkar.
- Boss'lar köprünün ötesinde ve önce sen saldırmadıkça saldırmaz. Her haritada 5 metin taşı var.
- Seviye atlama ışık efekti, oyuncuların başında can barı. İlk 25 seviye aynı hızda; sonrası giderek zorlaşır.

### Aşama 1

- **15 harita**, her biri bir seviye bölgesi: Atabis Köyü (Sv. 1) → Kızılçam Köyü (Sv. 15) → Sisli Orman (22) → Taş Vadisi (29) → Kuru Çöl (36) → Çöl Kervansarayı (43) → Kara Bataklık (50) → Karlı Dağlar (57) → Buz Mağarası (64) → Volkan Eteği (71) → Ejder Kalesi Kasabası (78) → Lanetli Harabeler (85) → İblis Kulesi (92) → Ejder Vadisi (99) → Kara Taht (106).
- Haritalar kenarlarındaki **geçitlerle** birbirine bağlı; seviyen yetmezse geçemezsin. Köylerdeki **Işınlayıcı** ile açtığın haritalara doğrudan gidebilirsin.
- **45 yaratık türü ve 17 boss.** İlk köyde köpek, kurt ve yaban domuzu; her haritada daha güçlüleri. Saldırgan olanlar seni görünce saldırır, pasifler vurunca karşılık verir. Boss'lar 2 dakikada bir yeniden doğar ve nadir eşya düşürür.
- **Can sistemi:** yaratıklar vurur, ölünce köyde yeniden doğarsın. 5 saniye hasar almazsan can kendiliğinden dolar.
- **Kırmızı iksirler** (4 boy), sağ alttaki butonla içilir.
- **Köy dükkânları** (Yang ile): Market (iksir), Silahçı, Zırhçı (zırh, miğfer, ayakkabı, bilezik, küpe). Eşya satabilirsin.
- **6 ekipman yeri:** silah, zırh, miğfer, ayakkabı, bilezik, küpe. Her eşyanın **seviye şartı** var.
- 16 eşya kademesi (Acemi → İmparator) ve her kademenin **Efsanevi** sürümü (sadece boss'lardan düşer).
- Kamera: tek parmakla sürükleyerek döndür, iki parmakla yakınlaştır.

**Bilinen sınırlar:** Yaratıklar ve at kodla çizilmiş basit 3D şekiller; atın üstünde karakter ayakta duruyor (oturma animasyonu yok). Ayakkabı, bilezik ve küpe karakterin üstünde görünmüyor. Grup, lonca, ticaret ve PvP henüz yok.

### Aşama 0

Hesap sistemi (şifreler `scrypt` ile), hesap başına 4 karakter, 5 sınıf (Savaşçı, Ninja, Sura, Şaman, Okçu), metin taşları, kombo, kritik vuruş, PostgreSQL kayıt.

## Denge ve içerik

Tüm eşya, yaratık ve harita verisi `tools/gen_data.py` ile üretilir. Sayıları değiştirmek için o dosyayı düzenle ve çalıştır: `python3 tools/gen_data.py`

## Klasörler

```
server/            sunucu (Node.js)
  index.js         giriş noktası: web sunucusu + Socket.io
  config.js        .env okuma
  db.js            PostgreSQL bağlantısı, şema kurulumu
  auth.js          kayıt, giriş, oturum
  characters.js    karakter listeleme, oluşturma, silme
  game/rules.js    formüller: can, hasar, tecrübe
  game/zone.js     bir harita: yaratık yapay zekası, metin taşları, ganimet
  game/world.js    bağlantılar, envanter, dükkân, iksir, geçitler, kayıt
client/            tarayıcı tarafı
  index.html       ekranlar ve arayüz
  css/style.css    görünüm
  js/main.js       giriş → karakter seçimi → oyun akışı
  js/game.js       3D sahne, karakterler, kontroller, envanter, dükkân
  js/world/map.js  harita oluşturucu (15 tema)
  js/entities/mobs.js  yaratık modelleri ve hareketleri
  js/util.js       ortak yardımcılar
shared/            sunucu ve istemcinin ortak verileri (tools/gen_data.py üretir)
  classes.json     sınıflar
  items.json       eşyalar ve iksirler
  mobs.json        yaratıklar ve boss'lar
  maps.json        haritalar, dükkânlar, geçitler
  skills.json      sınıf becerileri
db/schema.sql      veritabanı tabloları
scripts/update.sh  tek komutla güncelleme
```

## İlk kurulum (sunucuda bir kez)

```bash
# 1) Kodu indir
cd ~/atabis && git clone https://github.com/Atabisx/atabis-online.git && cd atabis-online

# 2) Veritabanı ve kullanıcı oluştur (rastgele şifreyle)
PW=$(openssl rand -hex 16)
su - postgres -c "psql -c \"CREATE USER atabis_online WITH PASSWORD '$PW';\""
su - postgres -c "createdb -O atabis_online atabis_online"

# 3) Ayar dosyası
echo "PORT=3100" > .env
echo "DATABASE_URL=postgres://atabis_online:$PW@127.0.0.1:5432/atabis_online" >> .env

# 4) Başlat (pm2'de 'atabis-online' adıyla çalışır)
bash scripts/update.sh
```

Tarayıcıda: `http://SUNUCU_IP:3100`

## Güncelleme (her yeni aşamada)

```bash
cd ~/atabis/atabis-online && bash scripts/update.sh
```

## Sorun giderme

- Kayıtlara bak: `pm2 logs atabis-online --lines 30 --nostream`
- Veritabanına bağlanamıyorsa `.env` içindeki `DATABASE_URL` değerini kontrol et.
- Karakter modeli: `client/models/Soldier.glb` (three.js örnek modeli, ilk güncellemede otomatik iner).
