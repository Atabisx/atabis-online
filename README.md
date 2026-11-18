# ATABİS ONLINE

Tarayıcıda, telefondan oynanan 3D MMORPG. Metin2'den ilham alır; içerik, kod ve tasarım projenin kendisine aittir.

## Durum

### Aşama 3.7 (bu sürüm): ustalık renkleri, tam hareketli beceriler, dev köy boss'ları

- **Ustalık renkleri:** beceri M1'de mavi, M2'de mor, M3'te kızıl olur. Bütün parçacıklar, halkalar ve ışıklar o renge boyanır; düğme de aynı renkte parlar. M seviyelerinde efekt büyür: M1 çift büyü çemberi ve sarmal, M2 ışık sütunu ve dönen küreler, M3 gökten inen kızıl yıldırımlar ve alev halkası.
- **Her beceri tam hareketli:** her beceriden önce karakterin çevresinde büyü toplanır, hedefte çarpma ışığı ve şok dalgası çıkar. Demir Beden, Gölge Kalkanı, Karanlık Kılıç ve Kaçış/Hafif Adım'da dönen rün halkaları ve küreler; Hamle'de hız izi ve taş parçaları; Zehirli Hançer'de dönen hançer ve damlayan zehir; Ruh Emme'de hedefte girdap.
- **Karakter pozları:** buff ve şifada iki kol havaya kalkar, şimşekte sağ kol öne uzanır, okçunun bütün oklu becerilerinde yay gerilir.
- **Atabis Köyü:** Dev Horoz yaklaşık 10 m, Deli Boğa yaklaşık 11 m boyunda; vuruş mesafeleri gövde büyüklüğüne göre ayarlandı. Tavuk 1,5, horoz 2 kat büyüdü.

### Aşama 3.6: sınıflara özel Uzak Doğu zırh takımları

- **Her sınıfın kendi takımı (`client/js/entities/outfits.js`):** plaka sıralı lamel göğüslük, katlı omuzluklar, kol ve baldır zırhları, bel kuşağı, uyluk plakaları ve sınıf başlığı. Tasarımlar projeye özgüdür; Metin2 dosyası kullanılmaz.
  - **Savaşçı:** gümüş-çelik ağır lamel, kırmızı ön/arka etek, tüylü miğfer.
  - **Ninja:** koyu, hafif zırh; kırmızı atkı, maske.
  - **Sura:** kara-mor zırh, boynuzlu miğfer, kızıl pelerin.
  - **Şaman:** altın işlemeli beyaz cüppe, boncuk kolye, taç.
  - **Okçu:** kahverengi deri lamel, yeşil pelerin, sırtta ok kılıfı.
- Giyilen zırhın rengi takıma karışır; Sv. 43+ zırhlarda süslemeler altın olur. Kask takılıysa sınıf başlığı yerine kask görünür.
- Zırh GLB modelleri artık gövdeye giydirilmiyor (sıkışıp taşıyordu); envanter simgelerinde kullanılıyor.

### Aşama 3.5: silah ve zırh aurası

- Sv. 43+ eşyalar parlar: mavi (Sv. 43+), mor (Sv. 64+), kızıl (Sv. 85+), altın (son kademe ve efsanevi). Silahın üstünde parlayan kabuk ve bıçak boyunca kıvılcımlar; zırhta gövdeyi saran yükselen ışık sarmalı ve ayak altında dönen halka.

### Aşama 3.4: büyük köy, GM, ışınlanma yüzüğü, telefona yükleme

- **Atabis Köyü haritası 270×270 m:** köyün çevresinde ikinci ev halkası, dört kapılı ahşap çit, doğusunda buzlu nehir ve köprü. Boss'lar köprünün ötesinde (Metin2 gibi); hayvanlar suya girmez. Köy boss'ları daha da büyüdü (Dev Horoz 9 kat, Deli Boğa 4,8 kat).
- **Kızılçam Ormanı:** sadece kullanıcının modelleri: Vahşi Kurt, Benekli Kaplan, Ateş Kertenkelesi Yavrusu, boss'lar ve metin taşları.
- **Ölünce:** "Köyde başla" (tam can) ve 5 saniye sonra açılan "Burada başla" (yarım can).
- **Işınlanma Yüzüğü:** markette 2.500.000 Yang; her yerden ışınlanma penceresini açar, bitmez.
- **GM:** `.env` içindeki `GM_NAMES` (varsayılan `Atabis`) adlı karakterler GM'dir: başında altın GM rozeti, son seviye, her haritaya girer, her eşyayı giyer; ilk girişte en üst kademe efsanevi eşyalar (5 en yüksek efsun), yüzük, at, iksirler. Sohbet komutları: `/git <harita>`, `/seviye <n>`, `/yang <n>`, `/esya <anahtar> [adet]`, `/iyiles`.
- **Ata binme:** karakter eyere oturur (bacaklar atın iki yanında), dik durur, dizgin tutar gibi.
- **Sınıflar farklı görünür:** savaşçı iri ve kürk yakalı, ninja ince ve maskeli/atkılı, sura pelerinli ve boynuzlu omuzluklu, şaman cüppeli ve tüylü başlıklı, okçu sadaklı ve başlıklı.
- **Telefona yükleme (PWA):** giriş ekranında "Telefona yükle"; ana ekran simgesi, tam ekran, yatay. Oyun içinde tam ekran düğmesi. Gerçek uygulama kurulumu için sunucuda HTTPS gerekir (HTTP'de simge eklenir ama tarayıcıda açılır).

### Aşama 3.3: karakter puanları, 3D simgeler, Metin2 tarzı taşlar

- **Durum puanları (K tuşu / sol üstteki kişi düğmesi):** GÜÇ, CANLILIK, ZEKA, ÇEVİKLİK. Her seviyede +3 puan, bir özellik en fazla 90. Ana saldırı özelliği sınıfa göre: savaşçı/sura GÜÇ, ninja/okçu ÇEVİKLİK, şaman ZEKA. Canlılık can ve savunma, Zeka mana ve beceri hasarı, Çeviklik kritik verir. Puanlar veritabanında `characters.stats` sütununda.
- **Nefes:** karakter dururken göğsü kalkıp iner, omuzları hafifçe oynar.
- **Seviye atlama:** ekranda "SEVİYE ATLADIN" yazısı; karakterin çevresinde iki altın sarmal, ışınlar, ışık sütunu ve yıldız patlaması.
- **3D envanter simgeleri (`client/js/icons.js`):** her eşya kendi 3D modeliyle ışıklandırılıp resme çevrilir (kılıç, balta, zırhlar, kask, çizme, bilezik, küpe, iksir şişesi, kristal, balık, inci...).
- **Yeni modeller:** Kızılçam Ormanı boss'ları Cehennem Şövalyesi, Kaplan Adam, Lav Canavarı. Kask modeli Sv. 36+ miğferlerde, demir zırh Sv. 1-8 zırhlarda. Önceki boss'lar Sisli Orman ve Taş Vadisi'ne taşındı. Köy boss'ları büyüdü (Dev Horoz 5 kat, Deli Boğa 3 kat).
- **Beceri düğmeleri:** saldırı düğmesinin çevresinde altın çerçeveli, simgeli düğmeler; saat gibi kararan bekleme kadranı, kalan saniye, seviye ve mana rozeti.
- **Sesler:** Metin2 gibi dolgun vuruş (kesik + et + metal çınlaması + gümleme), kritikte "şiing", beceride kısa "hah!".
- **Metin taşları:** kırık yüzlü sivri taş, parlayan oyma rünler ve çatlaklar, moloz, dönen kristal kırıkları, ışık zerreleri; vuruldukça parlar, kırılınca parçaları saçılır.

### Aşama 3.2: köy hayvanları, büyük haritalar, Metin2 tarzı beceri efektleri

- **Atabis Köyü:** köpek ve kurtlar kalktı; yerine gerçek boylarında Tavuk, Horoz, Domuz ve İnek (uysal, sen vurmadan saldırmaz). Tavuk/horoz yürür, kanat çırpar, yere gagalar; inek/domuz başını eğip otlar. Köy boss'ları: Dev Horoz ve Deli Boğa.
- **Kızılçam Ormanı:** Kurt Lideri Bozkurt, Kuduz Benekli ve Alaca Kaplan buraya taşındı; yeni boss Ateş Kertenkelesi (saldırırken ateş püskürtür). Haritada 6 boss var, birbirinden uzak yerlerde.
- **Haritalar büyüdü:** köy haritası 130×130 m, vahşi haritalar 180×180 m (her yaratık türünden 20).
- **Beceri efektleri (`client/js/fx.js`):** her becerinin kendi görüntüsü: hilal kılıç izleri, karakteri saran dönen kılıç fırtınası, gökten yağan hançerler, dallanan şimşek, alev halkaları, ruh emme küreleri, ışık sütunları, dönen büyü çemberleri; buff süresince karakterin altında aura. Beceride karakter döner/sıçrar; normal vuruşta kıvılcım, kritikte parlama; seviye atlamada altın ışık sütunu.
- FBX modeller GLB'ye çevrildi (`client/models/mobs`: tavuk, horoz, domuz, inek, kertenkele).

### Aşama 3.1: eklenen 3D modeller

- **Yeni boss'lar (hazır modeller):** Atabis Köyü: Kurt Lideri Bozkurt, Kuduz Benekli (köpek), Alaca Kaplan. Kızılçam Ormanı: Kristal Yılan, Savaşçı Alp Bey. Sisli Orman: Su Elementali, Sis Büyücüsü. Taş Vadisi: Kadim Mumya.
- **Hareket:** modellerin iskeleti yok; `client/js/entities/models.js` bacak, kol, baş ve kuyruğu modelin şeklinden ayırıp ekran kartında döndürür: yürürken çapraz adım, kol sallama, kuyruk sallama; saldırıda ısırma, kılıç indirme, kollarını kaldırma; büyücü süzülür, yılan kıvrılır.
- **At:** binek atı artık heybeli at modeli, yürürken adım atar.
- **Silahlar:** savaşçı/sura kılıçları Sv. 29-64 arası Lav Kılıcı görünümünde; Sv. 71 ve üstü Buz Baltası (bu kademelerin adı artık "Balta").
- **Zırhlar:** Sv. 15-36 Yelek, Sv. 43-71 Bronz Göğüslük, Sv. 78 ve üstü Çelik Zırh görünümünde.
- Model dosyaları `client/models/mobs` ve `client/models/items` altında; telefon için sıkıştırıldı (kaplama JPEG, geometri KHR_mesh_quantization). Model yüklenemezse eski kodla çizilmiş görünüm kalır.

### Aşama 3

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
