# ATABİS ONLINE

Tarayıcıda, telefondan oynanan 3D MMORPG. Metin2'den ilham alır; içerik, kod ve tasarım projenin kendisine aittir.

## Durum

### Aşama 5.1 (bu sürüm): Yeni karakterler, petler, ayarlar, beceri hareketleri, Android uygulaması

- **Yeni karakter modelleri:** Savaşçı = barbar kız (kılıç), Ninja = yelpazeli dansçı, Sura = melek kanatlı kız (mızrak), Okçu = iblis avcısı (arbalet). Şaman aynı kaldı.
- **Petler artık metin taşlarından düşer** (her kırılan taşta %1,5; Ejder Yavrusu bunların %5'i). Dükkânda satılmaz. Her pet karaktere özellik verir:
  - Kurt: kritik +5
  - Tilki: delici +5
  - Ayı: can +600, savunma +12
  - Baykuş: saldırı hızı +6, mana +300
  - Yılan: kaçınma +5, delici +3
  - Ejder Yavrusu: saldırı +40, kritik +4, can +400
- **Ayarlar (⚙):** efekt ve müzik ses seviyesi, arayüz büyütme/küçültme, kamera uzaklığı, grafik kalitesi, tam ekran, Android uygulamasını indirme, karakter değiştirme ve çıkış.
- **Sade ekran:** ses, müzik, tam ekran, karakter, arkadaş ve beceri düğmeleri Menü ile Ayarlar'a taşındı. Solda yalnızca Menü, Ayarlar, Sohbet, Binek ve Pazar düğmeleri var.
- **Pazar düğmesi:** köyde soldaki 🏪 düğmesi tezgâhını açar.
- **Metin2 tarzı beceri hareketleri:** karakterler zıplar, döner, takla atar, atılır ve yere vurur. Yerde çatlaklar, toz ve kamera sarsıntısı olur; artık üstten yükselen ışık sütunları yok.
  - **Buz Oku** (Okçu, Zehirli Ok'un yerine): hedefi 2 saniye buz kalıbına hapseder.
  - **Fırtına** (Savaşçı) ve **Gölge** (Ninja) hedefi sersemletir; başında yıldızlar döner. Boss'larda bu süre yarıya iner.
- **Android uygulaması:** aşağıdaki "Android uygulaması (APK)" bölümüne bak.

### Aşama 5.0: Topluluk ve oyunu tutturacak sistemler

Hepsi sol menüdeki **☰ Menü** düğmesinden açılır. Veritabanı tabloları sunucu açılırken kendiliğinden eklenir.

- **Grup:** oyuncuya dokun ve "Gruba davet et"i seç (en fazla 8 kişi). Yakındaki üyeler tecrübeyi seviyeye göre paylaşır, kalabalık grup daha çok kazanır. Üyeler birbirinin ganimetini alabilir. Can çubukları solda görünür, sohbette `#` grup kanalıdır.
- **Günlük görevler:** her gün 3 görev (canavar, metin, boss, demirci, balık, grup, düello) verilir; ödülleri tecrübe, yang ve eşyadır. **7 günlük giriş ödülü** de var; 7. gün kutsama kağıdı ve ruh taşı verir.
- **Lonca:** 20. seviye ve 100.000 yang ile kurulur. Rütbeler lider, subay ve üyedir. Lonca sohbeti (`%`), depo (subay ve lider alabilir), kasa ve lonca seviyesi vardır. Seviye başına üyelere +%1 tecrübe verilir (en fazla %15) ve üye yeri artar.
- **Krallıklar:** Kızıl Ejder, Altın Kartal ve Gök Kurt. Karakter açarken seçilir, eski karakterler ilk girişte seçer. Krallık işareti ismin önünde görünür.
- **Krallık savaşı:** Çarşamba ve Cumartesi 21:00'de 20 dakika sürer, Savaş Meydanı'nda yapılır. Her galibiyet krallığına puan kazandırır. Kazanan krallık 24 saat +%20 tecrübe alır, katılanlar yang ve kutsama kağıdı kazanır. GM komutları: `/savas`, `/savas bitir`.
- **Pazar tezgâhı:** köyde tezgâh açılır, eşyalara fiyat konur. Sahibi oyunda olmasa da satış sürer; kazanç Menü'den toplanır. Her satıştan %2 vergi kesilir.
- **Zindan (Örümcek Mağarası, Sv. 30+):** her grup kendi kopyasına girer. 3 dalga örümceğin ardından Örümcek Kraliçe gelir ve her üyeye ayrı sandık düşer. Süre 25 dakika, bekleme 30 dakikadır.
- **Etkinlikler (İstanbul saatiyle):**
  - Metin Yağmuru: her gün 20:00.
  - Boss İstilası: her gün 22:00.
  - Tecrübe Şöleni (2 kat): Cuma, Cumartesi ve Pazar 19:00.
  - Ganimet Bereketi (2 kat düşme): Salı ve Perşembe 20:30.
  - GM komutu: `/etkinlik <metin|exp|boss|drop> [dakika]`, bitirmek için `/etkinlik bitir <tür>`.
- **Sıralama:** seviye, canavar avcısı, düello, lonca ve krallık.
- **Kostüm, kanat ve evcil hayvan:** köydeki Kostümcü'de 6 kostüm (zırhın rengini değiştirir), 4 kanat (biraz istatistik verir) satılır. Ejder Kanadı sadece boss'lardan düşer. (Evcil hayvanlar 5.1'den beri metin taşlarından düşer.)
- **Öğretici ve Rehber:** yeni oyuncular 5 adımlık öğreticiyi görür ve sonunda küçük bir ödül alır. Menü › Rehber'de tüm sistemlerin açıklaması vardır.
- **Otomatik yedek:** `bash scripts/install-backup.sh` komutu bir kez çalıştırılınca her gece 04:30'da veritabanı yedeği `~/atabis-yedek` klasörüne alınır (en yeni 14 yedek saklanır). Elle yedek almak için `bash scripts/backup.sh`.

### Aşama 4.2: Ticaret, müzikler, vuruş sesleri, ruh taşı özellikleri

- **Ticaret:** oyuncuya dokun → "Ticaret". İki taraf çantasından eşya (en fazla 12) ve yang koyar. Bir taraf teklifini değiştirirse iki tarafın da onayı sıfırlanır. İkisi de "Onayla" deyince takas sunucuda birden yapılır: eşyalar artısı, taşları ve efsunlarıyla geçer. Çanta doluysa, teklif edilen eşya kuşanılır, satılır ya da değişirse, oyuncular uzaklaşırsa, harita değişirse veya biri oyundan çıkarsa ticaret iptal olur.
- **Müzikler (özgün, `tools/music/compose.py` ile bestelendi):** giriş ve karakter seçme (`giris`), köy ve göl (`koy`), ormanlar ve vadiler (`orman`), çöl ve kanyon (`col`), kar ve buz (`kar`), volkan, kale, harabe, iblis kulesi ve ejder bölgeleri (`karanlik`). Bölge değişince yumuşak geçiş yapılır. Sol menüde müzik aç/kapa düğmesi var; ses düğmesi her şeyi kısar.
- **Vuruş sesleri (`tools/music/sfx.py`):** silaha göre savurma sesi (kılıç, ağır balta kombosu, hançer, asa, yay), et ve kesik sesli isabet, kritikte metal "şiing" ve gümleme, oyuncuya isabette zırh şangırtısı, metin taşında kaya çatırtısı.
- **Ruh taşları:** yeni Güç Taşı (saldırı +6…+42), Çeviklik Taşı (saldırı hızı) ve Avcı Taşı (canavarlara karşı güç). Var olanlar: Kırma (kritik), Delme (delici), sınıf taşları, Hayat, Savunma, Hız, Kaçınma, Büyü. Karakter penceresi artık delici vuruş, kaçınma, canavarlara ve sınıflara karşı güç değerlerini de gösteriyor.
- **At:** binici artık atın baktığı yöne oturuyor (önceden ters biniyordu).

### Aşama 4.1: Düelloda ölüm, yere düşen yaratıklar, demirci yaprakları

- **Düello:** canı biten oyuncu artık gerçekten ölür (ölüm ekranı, yeniden doğma). Kazanan duyurulur.
- **Ölen yaratıklar yere yatar:** yan yatarak devrilir, yere çarpınca toz kalkar. Normal yaratıklar 3 saniye, boss'lar 12 saniye yerde kalır, sonra toprağa gömülerek kaybolur. Boss'lar daha yavaş ve gürültülü düşer.
- **Mor, Mavi ve Kırmızı Yaprak:** 30. seviye ve üstü eşyaları +6'dan sonra yükseltmek için her renkten gerekir: +6→+7 için 7'şer, +7→+8 için 8'er, +8→+9 için 9'ar. Yükseltme başarısız olsa da yapraklar harcanır. Yapraklar metin taşlarından %35 şansla 1–3 adet (rastgele renk) düşer. Demirci ekranı eksik yaprakları kırmızıyla gösterir.

### Aşama 4.0: Ataonline girişi, 3D karakter seçimi, demirci, ruh taşları, düello ve arkadaşlar

- **Giriş ekranı:** "ATA ONLINE" logosu; arkada gece vakti taş sunak, yanan mangallar, sancaklar, Uzak Doğu kapısı ve dağlar (`client/js/lobby.js`). Kamera sunağın çevresinde döner.
- **Karakter seçme (Metin2 tarzı):** solda karakter listesi, ortada seçili karakter sunakta ışık sütunu içinde belirir; üç vuruşluk gösteri yapar ve sınıf becerisini M1 renginde kullanır. Boş alanda sürükleyince karakter döner, dokununca gösteriyi tekrarlar. Yeni karakter oluştururken seçilen sınıf sunakta başlangıç eşyalarıyla görünür.
- **Demirci (köyde, örs ve ocağın yanında):** silah, zırh ve takılar +0'dan +9'a yükseltilir. Başarı şansı +1'de %95, +9'da %25. +4'ten sonra başarısız olursa eşya bir seviye düşer; **Kutsama Kağıdı** (dükkânda 75.000 Yang, metinlerden nadiren düşer) kullanılırsa düşmez. Her artı saldırı/savunma/canı artırır; eşya adında "+7" gibi görünür, büyük artılar (+7 ve üstü) haritaya duyurulur.
- **Ruh taşları (sadece metinlerden düşer):** Kırma (kritik), Delme (savunmayı deler), Savaşçı/Ninja/Sura/Şaman/Okçu (o sınıfa karşı güç) silaha; Hayat, Savunma, Hız, Kaçınma, Büyü zırha takılır. Silah ve zırhta 3 yuva var; aynı türden taş bir eşyaya bir kez takılır. Takma şansı +0'da %95, +4'te %55 (başarısızsa taş kırılır). Taşlar demircide +4'e kadar yükseltilir (başarısızsa kırılır). Üst haritalarda daha yüksek dereceli taşlar düşer.
- **Oyuncuya dokununca menü:** Fısılda, Arkadaş ekle, Düello iste. Gelen istekler kabul/ret kutusuyla sorulur.
- **Düello:** 3 saniyelik geri sayım, rakip kırmızı halkayla işaretlenir; vuruşlar ve beceriler rakibe işler (sınıf taşları ve kaçınma geçerli). Canı biten kaybeder ama ölmez; 3 dakika sonra ya da uzaklaşınca düello biter.
- **Sohbet:** sohbet düğmesi ya da Enter; "/w isim mesaj" ile fısıltı, "/r mesaj" ile son fısıldayana cevap. Arkadaş listesi (çevrimiçi durumu, harita, seviye) ve giriş/çıkış haberleri. Arkadaşlar veritabanına kaydedilir.
- **Beceriler:** her beceriye ayırt edici bir imza efekti eklendi (ileri uçan hilal dalgalar, altın hortum, yerden fışkıran kaya ve kristal dikenler, altıgen kalkan kubbesi, şifa nilüferi, kara bulut ve şimşek fırtınası, ejder ateşi konisi, ışık kanatları) ve çevreyi beceri renginde aydınlatan ışık parlamaları. Karlı ve çöl haritalarında efektler artık beyaza dönmüyor, renkleri seçiliyor.

### Aşama 3.9: Savaşçı, Ninja ve Sura için yeni karakter modelleri

- **Savaşçı:** boynuzlu miğferli, kürk pelerinli barbar. Kask eşyası takılınca kendi miğferi gizlenir.
- **Ninja:** kapüşonlu, koyu kıyafetli suikastçı (kask eşyası kapüşonun üstüne giydirilmez).
- **Sura:** kanatlı, altın işlemeli zırhlı savaşçı. Silah takılıyken kendi mızrağı gizlenir.
- Modeller kullanıcının Envato Elements'ten indirdiği paketlerden çevrildi (`tools/fbxskin.py`: iskeletli FBX → GLB, kemikler mixamo adlarına çevrilir, dokular küçültülür).
- Ninja modelinin iskeleti yoktu: savaşçının iskeleti boyuna ve kol açısına göre oturtulup deri ağırlıkları en yakın noktalardan aktarıldı.
- Hepsi bekleme, yürüme, koşma, saldırı ve beceri pozlarıyla çalışır; silah sağ ele oturur.

### Aşama 3.8: Şaman için kendi karakter modeli

- **Ateş Büyücüsü (`client/models/chars/saman.glb`):** Şaman sınıfı artık kullanıcının eklediği, alev işlemeli kırmızı cüppeli karakterle görünür (mixamo iskeleti, yaklaşık 14 bin nokta, dokular dosyanın içinde).
- **Animasyon aktarma (`client/js/entities/retarget.js`):** Bekleme, yürüme ve koşma Soldier modelinden dünya uzayında aktarılır. Kemiklerin dinlenme pozu farklı olsa bile duruş korunur. Silah tutuşu ve kask yeri de aynı düzeltmeyle hesaplanır; saldırı, beceri, nefes ve at pozları aynen çalışır.
- Silah takılıyken modelin kendi asası gizlenir. Bu karaktere zırh takımı ve renk boyası uygulanmaz (kendi kıyafeti var), auralar çalışır.
- Başka sınıflar için yeni model eklemek: `CHAR_MODELS` listesine `{ url, hide, skip }` satırı eklenir.

### Aşama 3.7: ustalık renkleri, tam hareketli beceriler, dev köy boss'ları

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
