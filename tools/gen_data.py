#!/usr/bin/env python3
"""ATABİS ONLINE oyun verisi üretici.

Eşyaları, yaratıkları ve haritaları tek yerden, tutarlı sayılarla üretir.
Çalıştırma:  python3 tools/gen_data.py
Çıktı:       shared/items.json, shared/mobs.json, shared/maps.json
Denge ayarı için bu dosyadaki formülleri değiştir ve yeniden çalıştır.
"""
import json, os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'shared')

# ---------------------------------------------------------------- kademeler
# (seviye, isim, renk) – her harita bir kademeye karşılık gelir
TIERS = [
    (1, 'Acemi', '#b08a5a'), (8, 'Demir', '#c9d1d9'), (15, 'Çelik', '#a9b8c9'), (22, 'Gümüş', '#e3e8ee'),
    (29, 'Kızıl', '#c0392b'), (36, 'Kum', '#d9b56a'), (43, 'Akrep', '#8e6b3a'), (50, 'Zehir', '#6fd36f'),
    (57, 'Buz', '#9fd8ff'), (64, 'Kristal', '#c8d0ff'), (71, 'Ayaz', '#bfe6ff'), (78, 'Kara', '#4a5060'),
    (85, 'Magma', '#ff5a2a'), (92, 'İblis', '#b0362b'), (99, 'Ejder', '#ffb347'), (106, 'İmparator', '#ffd700'),
]

WEAPONS = [  # (tür, ad, sınıflar, uzunluk)
    # sadece 3D modeli olan silahlar: hançer ve yay kaldırıldı, Akıncı ve Avcı da kılıç kullanır
    ('sword', 'Kılıç', ['savasci', 'sura', 'ninja', 'okcu', 'saman'], 0.95),
    ('staff', 'Asa', ['saman'], 1.55),
]
GEAR = [  # (yuva, ad, fiyat çarpanı)
    ('armor', 'Zırh', 0.9), ('helmet', 'Miğfer', 0.6), ('shoes', 'Çizme', 0.5),
    ('bracelet', 'Bilezik', 0.7), ('earring', 'Küpe', 0.7), ('shield', 'Kalkan', 0.65), ('necklace', 'Kolye', 0.7),
]
# Metin2 gibi evrim: +9 olan eşya demircide bir üst kademedeki eşyaya dönüşür (Sv. 70-99 sunucusu: 9. kademeden 14.'ye)
EVOLVE_FROM, EVOLVE_TO = 9, 14


# Kullanıcının eklediği 3D modeller (client/models/items/*.glb): hangi kademede hangisi görünür
def weapon_model(wtype, i):
    # kullanıcının getirdiği silah modelleri (client/models/items/<ad>.glb)
    if wtype == 'staff':
        return {9: 'zumrut_asa', 10: 'kok_asa', 11: 'ayaz_asa', 12: 'maymun_asa', 13: 'magma_asa', 14: 'ejderbuz_asa'}.get(i, 'kraliyet_asasi')
    if wtype != 'sword':
        return None
    # 9-14: Sv. 70-99 evrim zinciri, her basamak farklı ve daha gösterişli (Ayaz -> Magma -> Ejderarması)
    return {0: 'sade_kilic', 1: 'kivrik_kilic', 2: 'katana', 3: 'katana', 4: 'lav_kilic', 5: 'lav_kilic',
            6: 'gumus_kilic', 7: 'mor_kilic', 8: 'kanatli_kilic', 9: 'kristal_kilic',
            10: 'ayaz_kilic', 11: 'kizil_kilic', 12: 'magma_kilic', 13: 'alev_kilic', 14: 'ejder_cekic'}.get(i, 'buz_balta')


def helmet_model(i):
    # kullanıcının getirdiği 9 miğfer (deri -> demir -> gümüş -> altın -> kara boynuzlu)
    return 'migfer' + str({0: 2, 1: 2, 2: 1, 3: 1, 4: 3, 5: 3, 6: 4, 7: 4, 8: 5, 9: 5, 10: 6, 11: 6, 12: 7, 13: 8, 14: 8}.get(i, 9))


def shield_model(i):
    # kullanıcının getirdiği 9 runik kalkan (tahta -> demir -> gümüş -> altın -> kara)
    return 'kalkan' + str({0: 1, 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 4, 8: 5, 9: 6, 10: 6, 11: 7, 12: 7, 13: 8, 14: 8}.get(i, 9))


def bracelet_model(i):
    # kullanıcının getirdiği bilezikler: kırmızı boncuklu -> boho zincir -> altın yılan
    return 'kirmizi_bilezik' if i <= 4 else 'boho_bilezik' if i <= 9 else 'yilan_bilezik'


def earring_model(i):
    # kullanıcının getirdiği küpeler: damla zincir -> güneş halka -> boho taşlı halka
    return 'damla_kupe' if i <= 4 else 'gunes_kupe' if i <= 9 or i in (11, 13) else 'boho_kupe'


# Sv. 70-99 evrim zinciri: her basamakta başka bir tam zırh (karakterin üstünde giyili görünür)
EVO_ARMORS = {9: 'zirh_paladin', 10: 'zirh_altin_pul', 11: 'zirh_kizil_pul', 12: 'zirh_yildiz', 13: 'zirh_altin_paladin', 14: 'zirh_ejderplaka'}


def armor_model(i):
    if i in EVO_ARMORS:
        return EVO_ARMORS[i]
    if i <= 1:
        return 'demir_zirh'
    if 2 <= i <= 5:
        return 'yelek'
    if 6 <= i <= 10:
        return 'gogusluk'
    if i >= 11:
        return 'celik_zirh'
    return None


def price(i, factor):
    return int(round(50 * (i + 1) ** 2.2 * factor / 10.0)) * 10


# ruh taşları: anahtar, ad, takıldığı yer, etkilediği değer, +0..+4 değerleri, renk, açıklama
STONES = [
    ('kirma', 'Kırma Taşı', 'weapon', 'crit', [1, 2, 3, 4, 5], '#ff6a5a', 'Kritik vuruş şansı +%{v}.'),
    ('delme', 'Delme Taşı', 'weapon', 'pierce', [1, 2, 3, 4, 5], '#f2c94c', '%{v} şansla savunmayı deler.'),
    ('guc', 'Güç Taşı', 'weapon', 'atk', [6, 12, 20, 30, 42], '#e67e22', 'Saldırı gücü +{v}.'),
    ('ceviklik', 'Çeviklik Taşı', 'weapon', 'atkspeed', [2, 4, 6, 8, 10], '#16a085', 'Saldırı hızı +%{v}.'),
    ('avci', 'Canavar Taşı', 'weapon', 'monster', [2, 4, 6, 8, 10], '#8d6e63', 'Canavarlara karşı güç +%{v}.'),
    ('savasci', 'Şövalye Taşı', 'weapon', 'vs_savasci', [2, 4, 6, 8, 10], '#c0392b', 'Şövalyelere karşı güç +%{v}.'),
    ('ninja', 'Suikastçı Taşı', 'weapon', 'vs_ninja', [2, 4, 6, 8, 10], '#5a5f73', 'Suikastçılara karşı güç +%{v}.'),
    ('sura', 'Lanetli Taşı', 'weapon', 'vs_sura', [2, 4, 6, 8, 10], '#8e44ad', 'Lanetlilere karşı güç +%{v}.'),
    ('saman', 'Büyücü Taşı', 'weapon', 'vs_saman', [2, 4, 6, 8, 10], '#27ae60', 'Büyücülere karşı güç +%{v}.'),
    ('okcu', 'Fatih Taşı', 'weapon', 'vs_okcu', [2, 4, 6, 8, 10], '#b8860b', 'Fatihlere karşı güç +%{v}.'),
    ('hayat', 'Hayat Taşı', 'armor', 'hp', [80, 150, 250, 350, 500], '#e74c3c', 'Maks. Can +{v}.'),
    ('savunma', 'Savunma Taşı', 'armor', 'def', [8, 15, 22, 30, 40], '#7f8c8d', 'Savunma +{v}.'),
    ('hiz', 'Hız Taşı', 'armor', 'movespeed', [2, 4, 6, 8, 10], '#3498db', 'Hareket hızı +%{v}.'),
    ('kacinma', 'Kaçınma Taşı', 'armor', 'dodge', [1, 2, 3, 4, 5], '#1abc9c', '%{v} şansla saldırıdan kaçar.'),
    ('buyu', 'Büyü Taşı', 'armor', 'mp', [50, 100, 150, 200, 300], '#2f7fd0', 'Maks. Mana +{v}.'),
]

def build_items():
    items = {}
    for i, (lv, tname, color) in enumerate(TIERS):
        for legendary in (False, True):
            m = 1.35 if legendary else 1.0
            pre = 'Efsanevi ' if legendary else ''
            suf = '_L' if legendary else ''
            rarity = 2 if legendary else (1 if i >= 11 else 0)
            for wtype, wname, classes, length in WEAPONS:
                if wtype == 'sword' and i >= 10:
                    wname = {10: 'Kılıç', 11: 'Büyük Kılıç', 12: 'Kılıç', 13: 'Büyük Kılıç', 14: 'Savaş Çekici'}.get(i, 'Balta')          # üst kademelerde savaşçı ve sura balta taşır
                items[f'{wtype}{i}{suf}'] = {
                    'name': f'{pre}{tname} {wname}', 'slot': 'weapon', 'type': wtype, 'classes': classes,
                    'lv': lv, 'tier': i, 'atk': round((6 + 9 * i + 0.6 * i * i) * m), 'rarity': rarity,
                    'color': color, 'len': length, 'glow': legendary or i >= 10,
                    'price': 0 if legendary else price(i, 1.0),
                }
                if weapon_model(wtype, i):
                    items[f'{wtype}{i}{suf}']['model'] = weapon_model(wtype, i)
            for slot, gname, factor in GEAR:
                it = {'name': f'{pre}{tname} {gname}', 'slot': slot, 'lv': lv, 'tier': i, 'rarity': rarity,
                      'color': color, 'price': 0 if legendary else price(i, factor)}
                if slot == 'armor':
                    it['def'] = round((3 + 6 * i + 0.4 * i * i) * m)
                    it['plate'] = color
                    if i >= 4:
                        it['trim'] = '#e8b54a' if not legendary else '#fff1b8'
                    if armor_model(i):
                        it['model'] = armor_model(i)
                if slot == 'helmet':
                    it['model'] = helmet_model(i)
                    it['def'] = round((3 + 6 * i + 0.4 * i * i) * 0.6 * m)
                elif slot == 'shield':
                    it['model'] = shield_model(i)
                    it['def'] = round((3 + 6 * i + 0.4 * i * i) * 0.5 * m)
                    it['hp'] = round((15 + 12 * i) * m)
                elif slot == 'shoes':
                    it['def'] = round((3 + 6 * i + 0.4 * i * i) * 0.4 * m)
                elif slot == 'bracelet':
                    it['model'] = bracelet_model(i)
                    it['atk'] = round((2 + 3 * i) * m)
                    it['hp'] = round((20 + 15 * i) * m)
                elif slot == 'earring':
                    it['model'] = earring_model(i)
                    it['hp'] = round((30 + 25 * i) * m)
                    it['def'] = round((1 + 1.5 * i) * m)
                elif slot == 'necklace':
                    # kolye: can ve mana (Metin2 gibi)
                    it['hp'] = round((40 + 30 * i) * m)
                    it['mp'] = round((25 + 18 * i) * m)
                items[f'{slot}{i}{suf}'] = it

    # iksirler (üst üste biner)
    potions = [('p_hp1', 'Küçük Kırmızı İksir', 120, 15, 1), ('p_hp2', 'Kırmızı İksir', 400, 45, 15),
               ('p_hp3', 'Büyük Kırmızı İksir', 1200, 120, 40), ('p_hp4', 'Dev Kırmızı İksir', 3500, 300, 75)]
    for key, name, heal, cost, lv in potions:
        items[key] = {'name': name, 'slot': 'potion', 'heal': heal, 'lv': lv, 'price': cost,
                      'rarity': 0, 'color': '#e5533d', 'stack': 200}
    mana = [('p_mp1', 'Küçük Mavi İksir', 80, 15, 1), ('p_mp2', 'Mavi İksir', 250, 45, 15),
            ('p_mp3', 'Büyük Mavi İksir', 700, 120, 40), ('p_mp4', 'Dev Mavi İksir', 2000, 300, 75)]
    for key, name, mp, cost, lv in mana:
        items[key] = {'name': name, 'slot': 'potion', 'mana': mp, 'lv': lv, 'price': cost,
                      'rarity': 0, 'color': '#3d7fc4', 'stack': 200}
    # süreli güçlendirme iksirleri (5 dakika)
    items['p_green'] = {'name': 'Yeşil İksir', 'slot': 'potion', 'buff': {'stat': 'atk', 'value': 120, 'dur': 300},
                        'desc': '5 dakika saldırı gücü +120. Metin taşlarından düşer.', 'lv': 1, 'price': 150, 'rarity': 1, 'color': '#4fbf5a', 'stack': 200}
    items['p_speed'] = {'name': 'Hız İksiri', 'slot': 'potion', 'buff': {'stat': 'movespeed', 'value': 25, 'dur': 300},
                        'desc': '5 dakika hareket hızı +%25', 'lv': 1, 'price': 150, 'rarity': 1, 'color': '#f2c94c', 'stack': 200}

    # efsun nesnesi: sadece metin taşlarından düşer
    items['efsun'] = {'name': 'Efsun Nesnesi', 'slot': 'use', 'desc': 'Bir ekipmana rastgele bir efsun ekler (en fazla 5).',
                      'lv': 1, 'price': 0, 'rarity': 2, 'color': '#c86bff', 'stack': 200, 'model': 'efsun_nesnesi'}
    # efsun değiştirme: sadece boss'lardan düşer
    items['efsun_degis'] = {'name': 'Efsun Değiştirme Nesnesi', 'slot': 'use',
                            'desc': 'Efsunlu bir ekipmanın tüm efsunlarını yeniden belirler (efsun sayısı aynı kalır).',
                            'lv': 1, 'price': 0, 'rarity': 2, 'color': '#4fd1c5', 'stack': 200, 'model': 'efsun_degistirme'}
    # balıkçılık
    items['olta'] = {'name': 'Olta', 'slot': 'use', 'desc': 'Gümüş Göl kıyısında balık tutmak için.', 'lv': 30, 'price': 0, 'rarity': 1, 'color': '#8a6440'}
    items['yem'] = {'name': 'Solucan Yem', 'slot': 'use', 'desc': 'Her atışta bir yem harcanır.', 'lv': 1, 'price': 8, 'rarity': 0, 'color': '#b0726a', 'stack': 200}
    fish = [('b_hamsi', 'Hamsi', 20), ('b_sazan', 'Sazan', 45), ('b_alabalik', 'Alabalık', 90), ('b_levrek', 'Levrek', 160),
            ('b_yayin', 'Yayın Balığı', 600), ('b_cizme', 'Eski Çizme', 2)]
    for key, name, value in fish:
        items[key] = {'name': name, 'slot': 'fish', 'lv': 1, 'price': value * 4, 'rarity': 1 if value >= 600 else 0,
                      'color': {'b_hamsi': '#4f8fb8', 'b_sazan': '#c9a24a', 'b_alabalik': '#c98a9a', 'b_levrek': '#8a9aa6',
                                'b_yayin': '#4a4e44'}.get(key, '#6b4a2e'), 'stack': 200}
        if key != 'b_cizme':
            items[key]['fish'] = key[2:]       # 3D görünüş türü (her balık farklı)
            items[key]['open'] = {'b_hamsi': 1, 'b_sazan': 2, 'b_alabalik': 3, 'b_levrek': 4, 'b_yayin': 6}[key]
            items[key]['desc'] = 'Aç: içinden efsun nesneleri, yaprak, iksir, %25 inci, biraz yang ve şanslıysan Pet Sandığı ya da otomatik iksir çıkar. İstersen balıkçıya sat.'
    # süreli eşyalar: kullanınca süre başlar (çevrimdışıyken de işler), üst üste kullanılırsa süre uzar
    for kind, nm, color in [('hp', 'Kırmızı', '#e0453a'), ('mp', 'Mavi', '#3d8fe0')]:
        for suf, label, sec in [('1s', '1 saat', 3600), ('1g', '1 gün', 86400), ('20g', '20 gün', 20 * 86400)]:
            items[f'oto_{kind}_{suf}'] = {'name': f'Otomatik {nm} İksir ({label})', 'slot': 'use', 'timed': {'kind': 'auto' + kind, 'sec': sec},
                'desc': f'Kullanınca {label} boyunca {"canın %70" if kind == "hp" else "manan %50"}\'in altına düşünce kendiliğinden {"can" if kind == "hp" else "mana"} doldurur. Metin taşlarından ve balıklardan düşer.',
                'lv': 1, 'price': 0, 'rarity': 2 if suf == '20g' else 1, 'color': color, 'stack': 20}
    for suf, label, sec in [('1g', '1 gün', 86400), ('7g', '7 gün', 7 * 86400), ('30g', '30 gün', 30 * 86400)]:
        items[f'exp_yuzuk_{suf}'] = {'name': f'Tecrübe Yüzüğü ({label})', 'slot': 'use', 'timed': {'kind': 'expring', 'sec': sec},
            'desc': f'Kullanınca {label} boyunca canavarlardan %25 fazla tecrübe kazanırsın. Nesne Market\'te satılır.',
            'lv': 1, 'price': 0, 'rarity': 2, 'color': '#ffd23f', 'stack': 20}
    items['pet_sandik'] = {'name': 'Pet Sandığı', 'slot': 'use', 'desc': 'Aç: içinden rastgele bir evcil hayvan çıkar (Ejder Yavrusu çok nadir). Balık tutarken nadiren takılır.', 'lv': 1, 'price': 0, 'rarity': 2, 'color': '#b48ad9', 'stack': 50}
    items['pet_yumurta'] = {'name': 'Pet Yumurtası', 'slot': 'use', 'desc': 'Aç: yumurtadan rastgele bir evcil hayvan çıkar; niteliği Sıradan, Güçlü ya da Mükemmel olabilir. Boss, metin taşı ve balık tutarken düşer.', 'lv': 1, 'price': 0, 'rarity': 1, 'color': '#f2e7c9', 'stack': 50}
    items['kanat_tuyu'] = {'name': 'Kanat Tüyü', 'slot': 'material', 'desc': 'Kanatları evrimleştirmek için gerekir. Boss ve metin taşlarından düşer.', 'lv': 1, 'price': 0, 'rarity': 2, 'color': '#ffe9a8', 'stack': 200}
    # ---------- meslekler: madencilik, simya, zanaat ----------
    items['kazma'] = {'name': 'Kazma', 'slot': 'use', 'desc': 'Madenci kazması. Taş, kanyon, dağ ve mağara haritalarında Kaz düğmesiyle cevher çıkarırsın.', 'lv': 10, 'price': 0, 'rarity': 1, 'color': '#b0b6bd'}
    for key, name, color in [('cevher_bakir', 'Bakır Cevheri', '#c97b4a'), ('cevher_demir', 'Demir Cevheri', '#9aa3ab'), ('cevher_gumus', 'Gümüş Cevheri', '#e3e8ee'),
                             ('cevher_altin', 'Altın Cevheri', '#ffd23f'), ('cevher_mithril', 'Mithril Cevheri', '#7fe3ff')]:
        items[key] = {'name': name, 'slot': 'material', 'desc': 'Madencilikle çıkar. Zanaat pencerelerinde kullanılır.', 'lv': 1, 'price': 0, 'rarity': 1, 'color': color, 'stack': 200}
    for key, name, color in [('ot_sifa', 'Şifa Otu', '#6fe06f'), ('ot_guc', 'Güç Otu', '#ff7a5a'), ('ot_ruh', 'Ruh Çiçeği', '#b98aff')]:
        items[key] = {'name': name, 'slot': 'material', 'desc': 'Yaratıklardan düşer. Simya için kullanılır.', 'lv': 1, 'price': 0, 'rarity': 1, 'color': color, 'stack': 200}
    for key, name, stat, val, color in [('el_guc', 'Güç İksiri', 'atk', 250, '#ff6a4a'), ('el_savun', 'Taş Deri İksiri', 'def', 180, '#9aa3ab'),
                                       ('el_can', 'Can İksiri', 'hp', 1800, '#6fe06f'), ('el_hiz', 'Rüzgar İksiri', 'movespeed', 35, '#9fd8ff')]:
        items[key] = {'name': name, 'slot': 'potion', 'buff': {'stat': stat, 'value': val, 'dur': 1800}, 'desc': 'Simyacı iksiri: 30 dakika boyunca etki eder.', 'lv': 1, 'price': 0, 'rarity': 2, 'color': color, 'stack': 50}
    items['istiridye'] = {'name': 'İstiridye', 'slot': 'use', 'desc': 'Aç: içinden nadiren inci çıkar.', 'lv': 1, 'price': 40, 'rarity': 1, 'color': '#c8c0b0', 'stack': 200}
    for key, name, value, color in [('inci_beyaz', 'Beyaz İnci', 3000, '#f4f1e8'), ('inci_mavi', 'Mavi İnci', 9000, '#7fb3ff'), ('inci_kirmizi', 'Kırmızı İnci', 30000, '#ff6a5a')]:
        items[key] = {'name': name, 'slot': 'gem', 'lv': 1, 'price': value * 4, 'rarity': 2, 'color': color, 'stack': 200,
                      'desc': 'Balıklardan (%25) ve istiridyeden çıkar. 5 tanesi demircide +9 evrimi için gerekir. ' + {
                          'inci_beyaz': '5 Beyaz İnci → 1 Mavi İnci dönüştürülebilir.', 'inci_mavi': '5 Mavi İnci → 1 Kırmızı İnci dönüştürülebilir.',
                          'inci_kirmizi': '5 Kırmızı İnci → 3 Kutsama Kağıdı ve 2 Efsun Değiştirme dönüştürülebilir.'}[key]}
    # at
    # Işınlanma Yüzüğü: her yerden ışınlanma penceresi; kullanınca bitmez, pahalı
    items['isin_yuzugu'] = {'name': 'Işınlanma Yüzüğü', 'slot': 'use', 'desc': 'Her yerden ışınlanma penceresini açar. Kullanınca bitmez.',
                            'lv': 1, 'price': 2500000, 'rarity': 3, 'color': '#4fd1c5'}
    items['at_muhru'] = {'name': 'At Mührü', 'slot': 'use', 'desc': 'Kullanınca atına biner ya da iner. Atlıyken %60 daha hızlısın.',
                         'lv': 25, 'price': 0, 'rarity': 2, 'color': '#c9a35a'}
    items['savas_muhru'] = {'name': 'Savaş Kaplanı Mührü', 'slot': 'use', 'desc': 'Kullanınca zırhlı savaş kaplanına biner ya da iner. Kaplanın üstünde saldırabilirsin; kaplan %76 daha hızlıdır.', 'lv': 50, 'price': 0, 'rarity': 2, 'color': '#e8b54a'}

    # ruh taşları (Metin2 gibi): metin taşlarından düşer, silah/zırh yuvalarına takılır, demircide +4'e kadar yükselir
    for key, name, target, stat, vals, color, desc in STONES:
        for g in range(5):
            items[f'tas_{key}_{g}'] = {'name': f'{name} +{g}', 'slot': 'stone', 'stone': {'type': key, 'for': target, 'stat': stat, 'value': vals[g], 'grade': g},
                                       'desc': desc.format(v=vals[g]) + (' Silaha takılır.' if target == 'weapon' else ' Zırha takılır.'),
                                       'lv': 1, 'price': 2000 * (g + 1) ** 2, 'rarity': 1 if g < 2 else 2, 'color': color, 'stack': 200,
                                       **({'model': {'kirma': 'tas_kritik', 'delme': 'tas_deli', 'hiz': 'tas_hiz'}[key]} if key in ('kirma', 'delme', 'hiz') else {})}
    # demirci yaprakları: 30. seviye ve üstü eşyaları +6'dan sonra yükseltmek için (metin taşlarından düşer)
    # görünüş eşyaları: kanat (az stat), kostüm (sadece görünüş, rengi boyar), evcil hayvan (tecrübe bonusu, peşinden gelir)
    # kanatlar: yalnız kullanıcının getirdiği modeller (client/models/wings/*.glb)
    WINGS = [
             ('kanat_peri', 'Peri Kanadı', 'model', '#b9a2e8', '#ffd6f0', 35, 700000, 1, {'hp': 250, 'mp': 200, 'def': 6}),
             ('kanat_kugu', 'Kuğu Kanadı', 'model', '#f4f1ea', '#fff8e0', 30, 600000, 1, {'hp': 220, 'def': 7}),
             ('kanat_yarasa', 'Yarasa Kanadı', 'model', '#5a1420', '#ff3b2f', 45, 1300000, 1, {'atk': 16, 'hp': 150}),
             ('kanat_isik', 'Işık Kanadı', 'model', '#fff6d8', '#ffd27a', 55, 0, 2, {'atk': 22, 'hp': 300, 'mp': 200}),
             ('kanat_ibris', 'Yanardöner Kanat', 'model', '#e8f4ff', '#b8e6ff', 65, 0, 2, {'atk': 28, 'hp': 340, 'mp': 250, 'def': 10}),
             ('kanat_karanlik', 'Düşmüş Melek Kanadı', 'model', '#2a2a30', '#c0183e', 80, 0, 2, {'atk': 38, 'hp': 420, 'def': 16})]
    for key, name, kind, color, glow, lv, pr, rar, st in WINGS:
        items[key] = {'name': name, 'slot': 'wings', 'lv': lv, 'price': pr or 5000000, 'rarity': rar, 'color': color,
                      'wing': {'kind': kind, 'color': color, 'glow': glow, **({'model': key, 'scale': 1.15} if kind == 'model' else {})}, 'desc': 'Sırtına takılan kanat. ' + ('Sadece boss\'lardan düşer.' if not pr else 'Kostümcüden alınır, boss\'lardan da düşebilir.'), **st}
    # taçlar (kullanıcının getirdiği modeller): miğfer yerine takılır, sadece boss'lardan nadiren düşer
    # (fiyat dükkânda satılmaz, sadece NPC'ye satarken çeyreği alınır; 'tier' yok ki sıradan düşme listelerine girmesin)
    CROWNS = [('tac_gumus', 'Mücevherli Gümüş Taç', 'gumus_tac', '#c9cdd8', 43, 400000, {'def': 42, 'hp': 160, 'mp': 100}),
              ('tac_kutsal', 'Kutsal Altın Taç', 'kutsal_tac', '#e8b54a', 71, 1200000, {'def': 85, 'hp': 320, 'mp': 200})]
    for key, name, model, color, lv, pr, st in CROWNS:
        items[key] = {'name': name, 'slot': 'helmet', 'lv': lv, 'rarity': 2, 'color': color, 'price': pr, 'model': model,
                      'desc': 'Başa takılan taç. Sadece boss\'lardan düşer.', **st}
    COSTUMES = [('kostum_altin', 'Altın Kostüm', '#e8b54a', 250000), ('kostum_gece', 'Gece Kostümü', '#2b2445', 250000),
                ('kostum_kar', 'Kar Kostümü', '#eef4ff', 250000), ('kostum_kizil', 'Kızıl Kostüm', '#b8321f', 250000),
                ('kostum_orman', 'Orman Kostümü', '#3f7a3a', 250000), ('kostum_gok', 'Gök Kostümü', '#3d8fe0', 250000)]
    for key, name, color, pr in COSTUMES:
        items[key] = {'name': name, 'slot': 'costume', 'lv': 1, 'price': pr, 'rarity': 1, 'color': color, 'tint': color,
                      'desc': 'Zırhının görünüşünü değiştirir (istatistik vermez). Kostümcüden alınır.'}
    # özel zırhlar (kullanıcının getirdiği modeller): 30. seviyeden sonra her 15 seviyede bir, sonra 95-110; bütün sınıflar giyer.
    # Sadece metin taşlarından, nadiren düşer (taşın seviyesi zırhın seviyesi ile +14 arasındaysa).
    # Yükseltmenin her basamağı üç renk yapraktan 5'er tane ister ('leaves').
    SPECIAL_ARMORS = [('zirh_kemik', 'Kemik Hayalet Göğüslüğü', 30, '#d8d4c8'), ('zirh_paladin', 'Gök Paladin Zırhı', 45, '#5aa0e0'),
                      ('zirh_altin_pul', 'Altın Pullu Zırh', 60, '#e8b54a'), ('zirh_kizil_pul', 'Kızıl Pullu Savaş Zırhı', 75, '#c0392b'),
                      ('zirh_agir_plaka', 'Ağır Plaka Zırh', 90, '#c9ccd2'),
                      # yüksek seviye tam takımlar (miğferli): Kara Taht / Ejder Vadisi metinlerinden
                      ('zirh_yildiz', 'Yıldızdökme Muhafız Zırhı', 95, '#8fb8ff'), ('zirh_auric', 'Altın Nöbetçi Zırhı', 100, '#d08a2a'),
                      ('zirh_altin_paladin', 'Altın Paladin Zırhı', 105, '#e8cf8a'), ('zirh_ejderplaka', 'Ejder Plaka Zırhı', 110, '#6a6f7a')]
    for key, name, lv, color in SPECIAL_ARMORS:
        i = (lv - 1) / 7.0   # bu seviyedeki sıradan zırh kademesi
        items[key] = {'name': name, 'slot': 'armor', 'lv': lv, 'rarity': 2, 'color': color, 'price': lv * 20000, 'model': key,   # fiyat sadece NPC'ye satış için (dükkânda yok)
                     
                      'def': round((3 + 6 * i + 0.4 * i * i) * 1.5), 'hp': lv * 10, 'leaves': 5, 'stoneDrop': [lv, lv + 14],
                      'desc': f'Bütün sınıflar giyer. Sadece Sv. {lv}-{lv + 14} metin taşlarından nadiren düşer. Her yükseltme 5\'er Mor, Mavi ve Kırmızı Yaprak ister.'}
    # kullanıcının getirdiği silah takımları ve Ejderarması Çekici: metin taşlarından nadiren düşer (özel zırhlar gibi)
    # Ayaz takımı Sv. 80, Magma takımı Sv. 90, Ejderarması Savaş Çekici Sv. 100; Ejder Derisi Zırh Sv. 70
    SPECIAL_WEAPONS = []
    for pre, setname, lv, color, atk in [('ayaz', 'Ayaz', 80, '#bfe6ff', 258), ('magma', 'Magma', 90, '#ff5a2a', 312)]:
        SPECIAL_WEAPONS += [
            (f'{pre}_kilic', f'{setname} Kılıcı', 'sword', ['savasci', 'sura', 'ninja', 'okcu', 'saman'], lv, color, atk),
            (f'{pre}_buyukkilic', f'{setname} Büyük Kılıcı', 'sword', ['savasci', 'sura', 'saman'], lv, color, atk + 12),
            (f'{pre}_balta', f'{setname} Baltası', 'sword', ['savasci'], lv, color, atk + 14),
            (f'{pre}_gurz', f'{setname} Gürzü', 'sword', ['savasci', 'sura', 'saman'], lv, color, atk + 8),
            (f'{pre}_hancer', f'{setname} Hançeri', 'sword', ['ninja'], lv, color, atk + 10),
            (f'{pre}_yay', f'{setname} Yayı', 'sword', ['okcu'], lv, color, atk + 10),
            (f'{pre}_asa', f'{setname} Asası', 'staff', ['saman'], lv, color, atk + 10)]
    # kullanıcının getirdiği 4 yeni silah (metin taşlarından nadiren düşer)
    SPECIAL_WEAPONS += [
        ('kok_asa', 'Kök Asa', 'staff', ['saman'], 70, '#7fbf5a', 205),
        ('kizil_kilic', 'Kızıl Kılıç', 'sword', ['savasci', 'sura', 'ninja', 'okcu', 'saman'], 75, '#e0453a', 225),
        ('alev_kilic', 'Alev Kılıcı', 'sword', ['savasci', 'sura', 'ninja', 'okcu', 'saman'], 95, '#ff7a2a', 345),
        ('ejderbuz_asa', 'Ejder Buz Asası', 'staff', ['saman'], 100, '#3fd0ff', 372),
        ('zumrut_asa', 'Zümrüt Küre Asası', 'staff', ['saman'], 60, '#5fd35a', 180),
        ('maymun_asa', 'Efsane Maymun Asası', 'staff', ['saman'], 85, '#e8c25a', 300),
        ('kristal_kilic', 'Kristal Kılıç', 'sword', ['savasci', 'sura', 'ninja', 'okcu', 'saman'], 65, '#ff8fc0', 235)]
    SPECIAL_WEAPONS.append(('ejder_cekic', 'Ejderarması Savaş Çekici', 'sword', ['savasci', 'sura'], 100, '#b06bff', 385))
    CLS_TR = {'savasci': 'Şövalye', 'sura': 'Lanetli', 'ninja': 'Suikastçı', 'okcu': 'Fatih', 'saman': 'Büyücü'}
    for key, name, wtype, classes, lv, color, atk in SPECIAL_WEAPONS:
        items[key] = {'name': name, 'slot': 'weapon', 'type': wtype, 'classes': classes, 'lv': lv, 'rarity': 2, 'color': color,
                      'atk': atk, 'glow': True, 'price': lv * 25000, 'model': key, 'leaves': 5, 'stoneDrop': [lv, lv + 14],
                      'len': 1.55 if wtype == 'staff' else 0.95,
                      'desc': f"{', '.join(CLS_TR[c] for c in classes)} kullanır. Sadece Sv. {lv}-{lv + 14} metin taşlarından nadiren düşer. Her yükseltme 5'er Mor, Yeşil ve Kırmızı Yaprak ister."}
    for pre, setname, lv, color, df, hp in [('ayaz', 'Ayaz', 80, '#bfe6ff', 104, 250), ('magma', 'Magma', 90, '#ff5a2a', 122, 290)]:
        items[f'{pre}_kalkan'] = {'name': f'{setname} Kalkanı', 'slot': 'shield', 'lv': lv, 'rarity': 2, 'color': color, 'price': lv * 20000,
                                  'model': f'{pre}_kalkan', 'def': df, 'hp': hp, 'leaves': 5, 'stoneDrop': [lv, lv + 14],
                                  'desc': f"Sadece Sv. {lv}-{lv + 14} metin taşlarından nadiren düşer. Her yükseltme 5'er Mor, Yeşil ve Kırmızı Yaprak ister."}
    i70 = (70 - 1) / 7.0
    items['zirh_ejderderi'] = {'name': 'Ejder Derisi Zırh', 'slot': 'armor', 'lv': 70, 'rarity': 2, 'color': '#2c3f8a', 'price': 70 * 20000,
                               'model': 'zirh_ejderderi', 'def': round((3 + 6 * i70 + 0.4 * i70 * i70) * 1.5), 'hp': 700, 'leaves': 5, 'stoneDrop': [70, 84],
                               'desc': "Bütün sınıflar giyer. Sadece Sv. 70-84 metin taşlarından nadiren düşer. Her yükseltme 5'er Mor, Yeşil ve Kırmızı Yaprak ister."}
    # Uşak Ceketi: istatistik veren kostüm (efsunda çıkabilen en yüksek Maks. Can + saldırı 50)
    items['kostum_usak'] = {'name': 'Uşak Ceketi', 'slot': 'costume', 'lv': 1, 'price': 3000000, 'rarity': 2, 'color': '#2a2a30',
                            'tint': '#2a2a30', 'model': 'kostum_usak', 'atk': 50, 'hp': 600,
                            'desc': 'Siyah kuyruklu uşak ceketi. Saldırı +50, Maks. Can +600 (efsunun en yüksek değeri). Kostümcüden alınır.'}
    # evcil hayvanlar metin taşlarından düşer; her biri farklı bir güç verir
    # sadece kullanıcının getirdiği modellerle evcil hayvanlar (anahtarlar eski kayıtlar bozulmasın diye korunur)
    PETS = [('pet_kurt', 'Kurt Yavrusu', 'wolf', '#8a8f99', {'crit': 5}, 'Kritik vuruş +%5', 'kurt'),
            ('pet_tilki', 'Tilki Yavrusu', 'dog', '#d9762b', {'pierce': 5}, 'Delici vuruş +%5', 'kopek'),
            ('pet_yilan', 'Yılan', 'snake', '#4f7a2a', {'dodge': 5, 'pierce': 3}, 'Kaçınma +%5, delici +%3', 'yilan'),
            ('pet_ayi', 'Sekreter Kuşu', 'flyer', '#c9c2b0', {'hp': 600, 'def': 12}, 'Can +600, savunma +12', 'sekreter'),
            ('pet_baykus', 'Kuzgun', 'flyer', '#3a3550', {'atkspeed': 6, 'mp': 300}, 'Saldırı hızı +%6, mana +300', 'kuzgun'),
            ('pet_uzayli', 'Uzaylı Yaratık', 'dog', '#3a4430', {'atk': 25, 'dodge': 4}, 'Saldırı +25, kaçınma +%4', 'uzayli'),
            ('pet_ejder', 'Ejder Yavrusu', 'dragon', '#5a1a14', {'atk': 40, 'crit': 4, 'hp': 400}, 'Saldırı +40, kritik +%4, can +400', 'ejder_yavru'),
            ('pet_horoz', 'Horoz', 'frog', '#c0392b', {'atk': 15, 'crit': 3}, 'Saldırı +15, kritik +%3', 'horoz'),
            ('pet_tavuk', 'Tavuk', 'frog', '#f4f1e8', {'hp': 300, 'mp': 150}, 'Can +300, mana +150', 'tavuk'),
            ('pet_fantazi_tilki', 'Masal Tilkisi', 'dog', '#e07a2a', {'crit': 4, 'dodge': 4, 'mp': 200}, 'Kritik +%4, kaçınma +%4, mana +200', 'masal_tilki')]
    PET_SCALE = {'horoz': 2.4, 'tavuk': 2.6, 'masal_tilki': 0.9}   # küçük modeller pet olunca büyütülür
    for key, name, shape, color, bonus, text, model in PETS:
        items[key] = {'name': name, 'slot': 'pet', 'lv': 1, 'price': 5000000, 'rarity': 2 if key == 'pet_ejder' else 1, 'color': color,
                      'pet': {'shape': 'worm' if shape == 'snake' else shape, 'color': color, 'model': model, **({'scale': PET_SCALE[model]} if model in PET_SCALE else {})}, 'bonus': bonus,
                      'desc': f'Peşinden gelen evcil hayvan. {text}. Metin taşlarından düşer' + (' (çok nadir).' if key == 'pet_ejder' else '.')}
    for key, name, color in [('yaprak_mor', 'Mor Yaprak', '#9b59d0'), ('yaprak_mavi', 'Yeşil Yaprak', '#4fbf5a'), ('yaprak_kirmizi', 'Kırmızı Yaprak', '#e0453a')]:
        items[key] = {'name': name, 'slot': 'material', 'desc': "Demircide eşyaları +6'dan sonra yükseltmek ve +9'dan sonra evrimleştirmek için gerekir. Metin taşlarından düşer.",
                      'lv': 1, 'price': 400, 'rarity': 1, 'color': color, 'stack': 200}
    # Kutsama Kağıdı: demircide yükseltme başarısız olursa eşya seviyesi düşmez
    items['kutsama'] = {'name': 'Kutsama Kağıdı', 'slot': 'use', 'desc': 'Demircide yükseltme başarısız olursa eşyanın artısı düşmez (kağıt harcanır).',
                        'lv': 1, 'price': 75000, 'rarity': 2, 'color': '#f2e2a0', 'stack': 200}

    # ---- silah dönüşüm zincirleri (kullanıcı belirledi): +9'da demircide sıradaki silaha dönüşür ----
    # (anahtar, ad, sv, saldırı); ilk basamak metin taşından düşer, diğerleri sadece evrimle elde edilir
    SW5 = ['savasci', 'sura', 'ninja', 'okcu', 'saman']
    EVO_WEAPON_CHAINS = [
        ('sword', SW5, '#c9d1d9', [('gumus_kilic', 'Gümüş Kılıç', 40, 140), ('kivrik_kilic', 'Kıvrık Kılıç', 55, 195), ('alev_kilic', 'Alev Kılıcı', 70, 260), ('kanatli_kilic', 'Kanatlı Kılıç', 85, 335)]),
        ('sword', ['ninja'], '#8a7dff', [('ayaz_hancer', 'Ayaz Hançeri', 40, 150), ('katana', 'Katana', 55, 205), ('magma_hancer', 'Magma Hançeri', 70, 270), ('lav_kilic', 'Lav Kılıcı', 85, 345)]),
        ('staff', ['saman'], '#5fd35a', [('kok_asa', 'Kök Asa', 35, 135), ('maymun_asa', 'Efsane Maymun Asası', 50, 185), ('ejderbuz_asa', 'Ejder Buz Asası', 65, 245), ('zumrut_asa', 'Zümrüt Küre Asası', 80, 310), ('magma_asa', 'Magma Asası', 95, 380)]),
        ('sword', ['savasci', 'sura'], '#e8b54a', [('ayaz_gurz', 'Ayaz Gürzü', 35, 140), ('ayaz_balta', 'Ayaz Baltası', 50, 195), ('buz_balta', 'Buz Baltası', 65, 250), ('magma_gurz', 'Magma Gürzü', 80, 315), ('ejder_cekic', 'Ejderarması Savaş Çekici', 95, 385), ('magma_balta', 'Magma Baltası', 100, 420)]),
        ('sword', SW5, '#ff8fc0', [('kristal_kilic', 'Kristal Kılıç', 30, 130), ('magma_kilic', 'Magma Kılıcı', 45, 175), ('ayaz_buyukkilic', 'Ayaz Büyük Kılıcı', 60, 230), ('kizil_kilic', 'Kızıl Kılıç', 75, 290), ('mor_kilic', 'Mor Kılıç', 90, 360), ('magma_buyukkilic', 'Magma Büyük Kılıcı', 100, 415)]),
    ]
    for wtype, classes, color, steps in EVO_WEAPON_CHAINS:
        for n, (key, name, lv, atk) in enumerate(steps):
            it = items.get(key)
            if it is None:
                it = items[key] = {'name': name, 'slot': 'weapon', 'type': wtype, 'rarity': 2, 'color': color, 'glow': True, 'model': key,
                                   'len': 1.55 if wtype == 'staff' else 0.95, 'leaves': 5}
            it.update({'name': name, 'classes': classes, 'lv': lv, 'atk': atk, 'price': lv * 25000, 'type': wtype})
            first = n == 0
            if first: it['stoneDrop'] = [lv, lv + 14]
            else: it.pop('stoneDrop', None)
            if n + 1 < len(steps): it['evolve'] = steps[n + 1][0]
            else: it.pop('evolve', None)
            if not first: it['evolved'] = True
            else: it.pop('evolved', None)
            where = 'Metin taşlarından nadiren düşer.' if first else 'Sadece evrimle elde edilir.'
            nxt = f" +9'da {steps[n + 1][1]} olur." if n + 1 < len(steps) else ' Zincirin son silahı.'
            it['desc'] = f"{', '.join(CLS_TR[c] for c in classes)} kullanır. {where}{nxt} Her yükseltme 5'er Mor, Yeşil ve Kırmızı Yaprak ister."
    # evrim zinciri: kademe i (+9) -> kademe i+1 (+0); efsanevi (_L) olanlar efsanevi olana
    for k, v in list(items.items()):
        t = v.get('tier')
        if t is None or not (EVOLVE_FROM <= t < EVOLVE_TO) or (v.get('slot') == 'weapon' and v.get('type') in ('sword', 'staff')):
            continue
        base = k[:-2] if k.endswith('_L') else k
        nxt = base[:len(base) - len(str(t))] + str(t + 1) + ('_L' if k.endswith('_L') else '')
        if nxt in items and items[nxt]['slot'] == v['slot']:
            v['evolve'] = nxt
            items[nxt]['evolved'] = True     # sadece evrimle elde edilir: boss, metin, canavar, dükkân vermez

    # eski sürümden kalan eşyalar (var olan karakterler bozulmasın)
    legacy = json.load(open(os.path.join(ROOT, 'items.json'), encoding='utf8')) if os.path.exists(
        os.path.join(ROOT, 'items.json')) else {}
    for k, v in legacy.items():
        if k in items or not ('_' in k and k.split('_')[0] in ('w', 's', 'a', 'h')):
            continue      # eski hançer ve yaylar (d_, b_) kaldırıldı: sunucu yüklerken kılıca çevirir
        v = dict(v)
        v.setdefault('lv', 1)
        v['price'] = 0
        v['legacy'] = True
        # eski kılıçlar da kullanıcının modelleriyle görünür
        LEG = {'w_wood': 'sade_kilic', 'w_iron': 'kivrik_kilic', 'w_steel': 'katana', 'w_shadow': 'mor_kilic', 'w_dragon': 'kanatli_kilic'}
        if k in LEG: v['model'] = LEG[k]; v['classes'] = ['savasci', 'sura', 'ninja', 'okcu', 'saman']
        if k.startswith('s_'): v['model'] = 'kraliyet_asasi'
        if k.startswith('h_'): v['model'] = 'kask'
        if k.startswith('a_'): v['model'] = {'a_cloth': 'demir_zirh', 'a_leather': 'yelek', 'a_iron': 'yelek', 'a_crimson': 'gogusluk', 'a_gold': 'celik_zirh'}.get(k, 'yelek')
        items[k] = v
    return items


# ---------------------------------------------------------------- yaratıklar
def mob_stats(lv, boss=False):
    hp = 100 + lv * lv * 2.5 + lv * 20
    atk = 8 + lv * 6 + lv * lv * 0.12
    d = {
        'lv': lv, 'hp': int(hp * (20 if boss else 1)), 'atk': int(atk * (1.4 if boss else 1)),
        'def': int(lv * 1.5 * (2.2 if boss else 1)),
        'exp': int((20 + lv * 9 + lv * lv * 0.35) * (15 if boss else 1)),
        'yang': [int((5 + lv * 4) * (10 if boss else 1)), int((15 + lv * 9) * (12 if boss else 1))],
    }
    return d


# (anahtar, ad, seviye, şekil, renk, ölçek, saldırganlık yarıçapı, hız, menzil)
# bütün yaratıklar kullanıcının getirdiği modellerle (kodla çizilen yaratık yok)
MAPS = [
    {'name': 'Atabis Köyü', 'lv': 1, 'theme': 'village_winter', 'village': True,
     # köy hayvanları: gerçek boylarında, uysal (sen vurmadan saldırmazlar)
     # 9. alan: {'model': client/models/mobs/<ad>.glb} – kullanıcının eklediği modeller
     # tavuk ve horoz modelleri küçük olduğu için büyütüldü; vuruş menzili boydan bağımsız ('range')
     # köyde canavar ve metin taşı yok: sadece köy
     'mobs': [], 'stones': 0,
     # köprünün ötesinde kullanıcının boss modelinden düşük seviyeli boss ('n' tane); her haritada tek tür boss
     # Sv. 70-99 sunucusu: köyde boss doğmaz ('n': 0), verisi korunur
     'bosses': [('kaplanadam', 'Kaplan Adam', 8, 'humanoid', '#e67e22', 1.4, {'model': 'kaplan_adam', 'aura': '#ffb347', 'n': 0})]},
    {'name': 'Kızılçam Ormanı', 'lv': 15, 'theme': 'pine_forest',
     'mobs': [('vkurt', 'Vahşi Kurt', 15, 'wolf', '#5a4a3a', 1.15, 10, 5.8, {'model': 'kurt'}),
              ('kkaplan', 'Benekli Kaplan', 17, 'wolf', '#e67e22', 1.1, 8, 5.2, {'model': 'kaplan'}),
              ('kertyavru', 'Ateş Kertenkelesi Yavrusu', 19, 'frog', '#b0362b', 1.0, 8, 4.6, {'model': 'kertenkele'})],
     'bosses': [('cehennemsov', 'Cehennem Şövalyesi', 19, 'humanoid', '#2a2522', 1.35, {'model': 'cehennem_sovalyesi', 'aura': '#ff6a3d', 'n': 2})]},
    {'name': 'Sisli Orman', 'lv': 22, 'theme': 'forest_mist',
     'mobs': [('sisorumcek', 'Sis Kuzgunu', 22, 'flyer', '#5a5e6a', 1.0, 9, 5.5, {'model': 'kuzgun', 'tint': '#8a90a0'}),
              ('golgekurt', 'Gölge Kurdu', 24, 'wolf', '#2c2f3a', 1.15, 11, 6.0, {'model': 'kurt', 'tint': '#5a5f78'}),
              ('agacruhu', 'Ağaç Ruhu', 26, 'golem', '#4a6a35', 1.0, 7, 3.8, {'model': 'yaratik', 'tint': '#7a9a5a'})],
     'bosses': [('suelementi', 'Su Elementali', 26, 'golem', '#4fa3ff', 1.6, {'model': 'su_elementi', 'aura': '#4fa3ff', 'n': 2})]},
    {'name': 'Taş Vadisi', 'lv': 29, 'theme': 'rocky',
     'mobs': [('tasgolem', 'Taş Golem', 29, 'golem', '#8d8a82', 0.9, 7, 3.6, {'model': 'golem'}),
              ('kayaakrep', 'Kaya Kertenkelesi', 31, 'frog', '#6a5a4a', 1.1, 9, 5.0, {'model': 'kertenkele', 'tint': '#9a8a78'}),
              ('haydut', 'Vadi Haydudu', 33, 'humanoid', '#6b4a2e', 1.0, 11, 5.4, {'model': 'savasci', 'tint': '#a07850'})],
     'bosses': [('devgolem', 'Kadim Taş Golem', 33, 'golem', '#8d8a82', 1.7, {'model': 'golem', 'aura': '#9fff7f', 'hitR': 2.6, 'n': 2})]},
    {'name': 'Kuru Çöl', 'lv': 36, 'theme': 'desert_dunes',
     'mobs': [('kumakrep', 'Kum Kertenkelesi', 36, 'frog', '#c9a35a', 1.05, 9, 5.2, {'model': 'kertenkele', 'tint': '#e0c080'}),
              ('colkurt', 'Benekli Sırtlan', 38, 'wolf', '#c9a36a', 1.0, 11, 6.2, {'model': 'sirtlan'}),
              ('solucan', 'Kum Yılanı', 40, 'worm', '#b08a5a', 1.1, 8, 4.4, {'model': 'yilan', 'tint': '#d8b070'})],
     'bosses': [('sirtlanreis', 'Sırtlan Reisi Kahkaha', 40, 'wolf', '#c9a36a', 2.4, {'model': 'sirtlan', 'aura': '#ffb347', 'hitR': 2.4, 'n': 2})]},
    {'name': 'Kızıl Kanyon', 'lv': 43, 'theme': 'desert_canyon',
     'mobs': [('colhaydut', 'Çöl Haydudu', 43, 'humanoid', '#c9a35a', 1.0, 11, 5.6, {'model': 'savasci', 'tint': '#d8b880'}),
              ('mumya', 'Mumya', 45, 'humanoid', '#d9cfb8', 1.0, 8, 3.8, {'model': 'mumya'}),
              ('akbaba', 'Akbaba', 47, 'flyer', '#3a2a1c', 1.0, 12, 6.5, {'model': 'sekreter', 'tint': '#6a5040'})],
     'bosses': [('lavcanavari', 'Lav Canavarı', 47, 'frog', '#b0362b', 2.0, {'model': 'lav_canavari', 'aura': '#ff3b2f', 'breath': '#ff6a3d', 'n': 2})]},
    {'name': 'Kara Bataklık', 'lv': 50, 'theme': 'swamp',
     'mobs': [('kurbaga', 'Boynuzlu Bataklık Kurbağası', 50, 'frog', '#4a6a35', 1.0, 8, 5.0, {'model': 'kurbaga'}),
              ('yilan', 'Zehirli Yılan', 52, 'worm', '#3f7535', 0.9, 10, 5.6, {'model': 'yilan', 'tint': '#6fbf5a'}),
              ('camur', 'Çamur Golemi', 54, 'golem', '#4a3a2a', 1.0, 7, 3.8, {'model': 'golem', 'tint': '#7a6048'})],
     'bosses': [('kurbagakral', 'Kurbağa Kralı Vırak', 54, 'frog', '#4a6a35', 3.2, {'model': 'kurbaga', 'aura': '#9fff7f', 'hitR': 2.6, 'n': 2})]},
    {'name': 'Karlı Dağlar', 'lv': 57, 'theme': 'snow',
     'mobs': [('karkurt', 'Kar Kurdu', 57, 'wolf', '#e8eef2', 1.15, 12, 6.2, {'model': 'kurt', 'tint': '#f0f4ff'}),
              ('buzayi', 'Kar Kaplanı', 59, 'wolf', '#dfe8ee', 1.2, 9, 4.8, {'model': 'kaplan', 'tint': '#eef2ff'}),
              ('yeti', 'Yeti', 61, 'humanoid', '#f4f6f8', 1.25, 9, 4.6, {'model': 'yaratik', 'tint': '#ffffff'})],
     'bosses': [('buzdevi', 'Buz Devi', 61, 'golem', '#9fd8ff', 2.6, {'model': 'su_elementi', 'aura': '#9fd8ff', 'tint': '#bfe6ff', 'hitR': 2.6, 'n': 2})]},
    {'name': 'Buz Mağarası', 'lv': 64, 'theme': 'ice_cave',
     'mobs': [('buzorumcek', 'Buz Yaratığı', 64, 'spider', '#9fd8ff', 1.0, 10, 5.6, {'model': 'uzayli', 'tint': '#a8d8ff'}),
              ('kristalgolem', 'Kristal Golem', 66, 'golem', '#c8d0ff', 1.0, 7, 3.8, {'model': 'golem', 'tint': '#a8c4ff'}),
              ('ayazruhu', 'Ayaz Ruhu', 68, 'ghost', '#e8f4ff', 0.8, 12, 5.8, {'model': 'su_elementi', 'tint': '#e0f0ff'})],
     'bosses': [('ayazkralice', 'Ayaz Kraliçesi', 68, 'ghost', '#7fb3ff', 1.6, {'model': 'buyucu', 'aura': '#7fb3ff', 'tint': '#a8ccff', 'n': 2})]},
    {'name': 'Volkan Eteği', 'lv': 71, 'theme': 'volcanic',
     'mobs': [('atesbocek', 'Ateş Tükürgeci', 71, 'humanoid', '#3d6b38', 1.0, 10, 6.0, {'model': 'ates_tukurgec'}),
              ('lavgolem', 'Lav Golemi', 73, 'golem', '#5a2a1c', 1.05, 7, 3.6, {'model': 'golem', 'tint': '#ff8a5a'}),
              ('korkurt', 'Kor Kurdu', 75, 'wolf', '#c0392b', 1.2, 12, 6.4, {'model': 'kurt', 'tint': '#ff7a5a'})],
     'bosses': [('ejderyavru', 'Ateş Ejderhası', 75, 'dragon', '#c0392b', 1.4, {'model': 'ejder', 'aura': '#ff6a3d', 'breath': '#ff6a3d', 'hitR': 2.4, 'n': 2})]},
    {'name': 'Ejder Kalesi', 'lv': 78, 'theme': 'castle',
     'mobs': [('muhafiz', 'Kale Muhafızı', 78, 'humanoid', '#7d7f86', 1.0, 10, 5.2, {'model': 'kara_sovalye', 'tint': '#c8ccd8'}),
              ('karasovalye', 'Lanetli Şövalye', 80, 'humanoid', '#2a2a2a', 1.0, 11, 5.4, {'model': 'lanetli_sovalye'}),
              ('gargoyl', 'Gargoyl', 82, 'flyer', '#5a5e6a', 1.25, 12, 6.2, {'model': 'kuzgun', 'tint': '#7a7e8a'})],
     'bosses': [('sovalyelord', 'Kara Şövalye Lordu', 82, 'humanoid', '#1a1a1a', 1.5, {'model': 'kara_sovalye', 'aura': '#8a7dff', 'n': 2})]},
    {'name': 'Lanetli Harabeler', 'lv': 85, 'theme': 'ruins',
     'mobs': [('iskelet', 'Kemik Şövalye', 85, 'humanoid', '#e8e2d0', 1.0, 11, 5.4, {'model': 'kara_sovalye', 'tint': '#e8e2d0'}),
              ('hayalet', 'Hayalet', 87, 'ghost', '#c8d0ff', 1.0, 12, 5.8, {'model': 'su_elementi', 'tint': '#c8b8ff'}),
              ('buyucu', 'Yozlaştırıcı', 89, 'humanoid', '#6c3483', 1.0, 13, 5.0, {'model': 'yozlastirici'})],
     'bosses': [('curukagac', 'Çürük Ağaç Ruhu', 89, 'humanoid', '#5a6a2a', 1.5, {'model': 'curuk_agac', 'aura': '#9aff5a', 'hitR': 2.6, 'n': 2})]},
    {'name': 'İblis Kulesi', 'lv': 92, 'theme': 'demon',
     'mobs': [('iblismuhafiz', 'İblis Muhafız', 92, 'humanoid', '#4a4a8a', 1.0, 11, 5.4, {'model': 'iblis'}),
              ('alevib', 'Alev İblisi', 94, 'ghost', '#ff6a3d', 0.8, 12, 6.0, {'model': 'iblis', 'tint': '#ff8a50'}),
              ('suikastci', 'Solgun Elf Suikastçı', 96, 'humanoid', '#1a1a1a', 1.0, 14, 7.0, {'model': 'solgun_elf'})],
     'bosses': [('iblislord', 'Mor İblis Lordu', 96, 'humanoid', '#6a3a9a', 1.8, {'model': 'iblis_mor', 'aura': '#b06bff', 'hitR': 2.4, 'n': 2})]},
    {'name': 'Ejder Vadisi', 'lv': 99, 'theme': 'dragon_valley',
     'mobs': [('gencejder', 'Genç Ejder', 99, 'dragon', '#3f7535', 0.7, 12, 6.0, {'model': 'ejder', 'tint': '#7fcf6a'}),
              ('ejdermuhafiz', 'Ejder Muhafızı', 101, 'frog', '#ffb347', 1.4, 11, 5.4, {'model': 'kertenkele', 'tint': '#ffc870'}),
              ('ejderbuyucu', 'Ejder Büyücüsü', 103, 'ghost', '#ffb347', 1.1, 13, 5.6, {'model': 'buyucu', 'tint': '#ffc870'})],
     'bosses': [('gokejder', 'Gök Ejderi', 103, 'dragon', '#7fb3ff', 1.9, {'model': 'ejder', 'aura': '#7fb3ff', 'tint': '#1f6fff', 'breath': '#7fb3ff', 'hitR': 3.0, 'n': 2})]},
    {'name': 'Kara Taht', 'lv': 106, 'theme': 'dark_throne',
     'mobs': [('karaasker', 'Kara Ordu Askeri', 106, 'humanoid', '#2a2a2a', 1.0, 12, 5.6, {'model': 'savasci', 'tint': '#5a5a66'}),
              ('karakomutan', 'Kara Ordu Komutanı', 108, 'humanoid', '#4a1a1a', 1.15, 12, 5.6, {'model': 'kara_sovalye', 'tint': '#c86a6a'}),
              ('hiclik', 'Hiçlik Yozlaştırıcısı', 110, 'humanoid', '#3a1a4a', 1.15, 14, 6.0, {'model': 'yozlastirici', 'tint': '#c8a0ff'})],
     'bosses': [('hiclikejder', 'Hiçlik Ejderi', 110, 'dragon', '#3a1a4a', 2.4, {'model': 'ejder', 'aura': '#8a5aff', 'tint': '#3a1a5a', 'breath': '#b06bff', 'hitR': 3.6, 'n': 2})]},
]

# ---------------------------------------------------------------- Sv. 70-99 sunucusu
# Oyunda açık haritalar (bu sırayla geçitlerle bağlı): köy, 3 metin haritası, 2 boss (level atlama) haritası.
# Diğer haritalar ve boss'ları silinmez; 'hidden' olur, yaratık çıkmaz (veriler mobs.json'da kalır).
ACTIVE = [0, 9, 12, 10, 13, 11]   # seviyeye göre: metin 70 -> boss 70 -> metin 80 -> boss 85 -> metin 90
METIN_MAPS = {  # harita sırası -> (ad, en düşük seviye, taş seviye aralığı, eşya kademesi)
    9: ('Volkan Metin Ovası', 70, [70, 79], 10),
    10: ('Kale Metin Meydanı', 80, [80, 89], 11),
    11: ('Lanetli Metin Harabesi', 90, [90, 99], 13),
}
# level atlama haritaları: oyundaki en iyi boss modelleri, çok sayıda, hızlı doğar ve bol tecrübe verir
LEVEL_MAPS = {
    12: ('Boss Vadisi', 70, 'demon', 11, [
        ('lb_ejder', 'Ateş Ejderhası', 74, 'dragon', '#c0392b', 1.5, {'model': 'ejder', 'aura': '#ff6a3d', 'breath': '#ff6a3d', 'hitR': 2.4, 'n': 3}),
        ('lb_sovalye', 'Kara Şövalye Lordu', 77, 'humanoid', '#1a1a1a', 1.6, {'model': 'kara_sovalye', 'aura': '#8a7dff', 'n': 3}),
        ('lb_agac', 'Çürük Ağaç Ruhu', 80, 'humanoid', '#5a6a2a', 1.6, {'model': 'curuk_agac', 'aura': '#9aff5a', 'hitR': 2.6, 'n': 3}),
        ('lb_lav', 'Lav Canavarı', 83, 'frog', '#b0362b', 2.1, {'model': 'lav_canavari', 'aura': '#ff3b2f', 'breath': '#ff6a3d', 'n': 3})]),
    13: ('Ejder Boss Vadisi', 85, 'dragon_valley', 13, [
        ('lb_iblis', 'Mor İblis Lordu', 87, 'humanoid', '#6a3a9a', 1.9, {'model': 'iblis_mor', 'aura': '#b06bff', 'hitR': 2.4, 'n': 3}),
        ('lb_kaplan', 'Kaplan Adam Kral', 90, 'humanoid', '#e67e22', 1.8, {'model': 'kaplan_adam', 'aura': '#ffb347', 'n': 3}),
        ('lb_gokejder', 'Gök Ejderi', 94, 'dragon', '#7fb3ff', 1.9, {'model': 'ejder', 'aura': '#7fb3ff', 'tint': '#1f6fff', 'breath': '#7fb3ff', 'hitR': 3.0, 'n': 3}),
        ('lb_hiclik', 'Hiçlik Ejderi', 98, 'dragon', '#3a1a4a', 2.3, {'model': 'ejder', 'aura': '#8a5aff', 'tint': '#3a1a5a', 'breath': '#b06bff', 'hitR': 3.4, 'n': 3})]),
}
# metin haritalarının dev boss'ları: para ve level kasılır (her harita farklı, 3'er tane, çok büyük)
GIANT_BOSSES = {
    9: ('dev_golem', 'Dev Kadim Golem', 76, 'golem', '#8d5a42', 4.2, {'model': 'golem', 'aura': '#ff6a3d', 'tint': '#a0522d', 'hitR': 4.2, 'n': 3, 'giant': True}),
    10: ('dev_cehennem', 'Dev Cehennem Şövalyesi', 86, 'humanoid', '#2a2522', 3.6, {'model': 'cehennem_sovalyesi', 'aura': '#ff3b2f', 'hitR': 3.4, 'n': 3, 'giant': True}),
    11: ('dev_buz', 'Dev Buz Elementali', 96, 'golem', '#6a4aff', 4.6, {'model': 'su_elementi', 'aura': '#b06bff', 'tint': '#7a5aff', 'hitR': 4.4, 'n': 3, 'giant': True}),
}
GIANT_YANG = 1_000_000   # her ölümde kesin 1M Yang
GIANT_LEAF = 0.10        # her yaprak rengi %10
LEVEL_BOSS_EXP = 2.2    # sıradan boss tecrübesinin katı
LEVEL_BOSS_HP = 0.6     # sıradan boss canının katı (hızlı kesilsin)
LEVEL_BOSS_RESPAWN = 40  # saniye

# tek köy var: bütün alışveriş Atabis Köyü'nde (harita sırası -> (iksirler, satılan kademeler))
SHOPS = {
    # kırmızı ve mavi iksirler satıcıda; yeşil iksir sadece metin taşlarından düşer. Eşyalar 9-10. kademe (gerisi evrimle)
    0: (['p_hp2', 'p_hp3', 'p_hp4', 'p_mp2', 'p_mp3', 'p_mp4', 'p_speed', 'kutsama', 'isin_yuzugu'], [9]),
}

# harita sınırları: köy haritası orta boy, vahşi haritalar büyük
VILLAGE_BOUNDS = [-150, 210]   # ilk köy haritası (diğerlerinden büyük)
# köy haritası: köyün doğusunda köprülü nehir; boss'lar köprünün ötesinde
VILLAGE_RIVER = {'x': 100, 'w': 12, 'bridge': [20, 30]}
VILLAGE_RADIUS = 62
WILD_BOUNDS = [-65, 115]


def tier_for_map(i):
    return min(i + 1, len(TIERS) - 1) if i > 0 else 0


def build(items):
    mobs, maps = {}, []
    for i, m in enumerate(MAPS):
        m = dict(m)
        if i in METIN_MAPS:
            m['name'], m['lv'], m['stoneLv'], m['tier'] = METIN_MAPS[i]
            m['mobCount'], m['stones'] = 0, 28      # sadece metin taşları, haritaya dengeli dağılmış
            m['bosses'] = [GIANT_BOSSES[i]] + [b[:6] + ({**b[6], 'n': 0},) for b in m['bosses']]   # eski boss'lar doğmaz, yerine dev boss
        if i in LEVEL_MAPS:
            m['name'], m['lv'], m['theme'], m['tier'], new = LEVEL_MAPS[i]
            # eski boss'lar ve yaratıklar doğmaz ama verileri kalır
            m['bosses'] = list(new) + [b[:6] + ({**b[6], 'n': 0},) for b in m['bosses']]
            m['mobCount'], m['levelMap'], m['stones'] = 0, True, 0
        tier = m.get('tier', tier_for_map(i))
        spawns, bosses = [], []
        # evrimle dönüşen eşyalar (10-14. kademe) hiçbir yerden düşmez; onların yerine 9. kademe temel eşyalar düşer
        ok = lambda v: not v.get('evolved')
        base_t = tier if any(v.get('tier') == tier and ok(v) for v in items.values()) else EVOLVE_FROM
        own = [k for k, v in items.items() if v.get('tier') == base_t and ok(v) and not k.endswith('_L')]
        nxt = [k for k, v in items.items() if v.get('tier') == min(tier + 1, len(TIERS) - 1) and ok(v) and not k.endswith('_L')]
        leg = [k for k, v in items.items() if v.get('tier') == base_t and ok(v) and k.endswith('_L')]
        low = [k for k, v in items.items() if v.get('tier') == max(0, tier - 1) and ok(v) and not k.endswith('_L')]
        for t in m['mobs']:
            key, name, lv, shape, color, scale, aggro, speed = t[:8]
            d = mob_stats(lv)
            style = dict(t[8]) if len(t) > 8 else None
            rng = style.pop('range', None) if style else None
            if style:
                d['style'] = style
            d.update({'name': name, 'shape': shape, 'color': color, 'scale': scale, 'aggro': aggro,
                      'speed': speed, 'range': rng or 2.4 * max(1, scale), 'cd': 1600, 'boss': False,
                      'drops': [[k, 0.012] for k in own] + [[k, 0.02] for k in low],
                      'potions': [[('p_hp1' if lv < 15 else 'p_hp2' if lv < 40 else 'p_hp3' if lv < 75 else 'p_hp4'), 0.08],
                                  [('p_mp1' if lv < 15 else 'p_mp2' if lv < 40 else 'p_mp3' if lv < 75 else 'p_mp4'), 0.05]]})
            mobs[key] = d
            if m.get('mobCount', 1):
                spawns.append({'mob': key, 'count': m.get('mobCount', 26 if i == 0 else 20)})
        for key, name, lv, shape, color, scale, style in m['bosses']:
            d = mob_stats(lv, boss=True)
            style = dict(style); hit_r = style.pop('hitR', None)   # çok büyük boss'larda gövde yarıçapı
            copies = style.pop('n', 1)                              # haritada kaç tane
            giant = style.pop('giant', False)
            d.update({'name': name, 'shape': shape, 'color': color, 'scale': scale, 'aggro': 0,
                      'speed': 5.2, 'range': min(6.0, 2.6 * scale), 'cd': 2000, 'boss': True, 'respawn': 120,
                      'drops': [[k, 0.28] for k in own] + [[k, 0.12] for k in nxt] + [[k, 0.035] for k in leg]
                               + [['kanat_isik', 0.003], ['kanat_ibris', 0.002], ['kanat_karanlik', 0.0015], ['kanat_yarasa', 0.005], ['kanat_kugu', 0.01], ['kanat_peri', 0.006], ['pet_ejder', 0.005], ['pet_kurt', 0.01],
                                  ['tac_gumus', 0.006], ['tac_kutsal', 0.003]],
                      'potions': [[('p_hp2' if lv < 40 else 'p_hp3' if lv < 75 else 'p_hp4'), 1.0],
                                  [('p_mp2' if lv < 40 else 'p_mp3' if lv < 75 else 'p_mp4'), 1.0],
                                  ['p_green', 0.3], ['p_speed', 0.3], ['efsun_degis', 0.2]],
                      'style': style})
            if hit_r:
                d['hitR'] = hit_r
                d['range'] = hit_r + 3.0
            if giant:
                d['exp'] = int(d['exp'] * 1.5)                # level kasılır (normal boss'un 1,5 katı)
                d['hp'] = int(d['hp'] * 1.6)
                d['atk'] = int(d['atk'] * 1.15)
                d['yang'] = [GIANT_YANG, GIANT_YANG]          # para her zaman 1M
                d['potions'] = d['potions'] + [[k, GIANT_LEAF] for k in ('yaprak_kirmizi', 'yaprak_mavi', 'yaprak_mor')]
                d['respawn'] = 75
                d['giant'] = True
            if m.get('levelMap') and copies:
                d['exp'] = int(d['exp'] * LEVEL_BOSS_EXP)
                d['hp'] = int(d['hp'] * LEVEL_BOSS_HP)
                d['respawn'] = LEVEL_BOSS_RESPAWN
            mobs[key] = d
            bosses.extend([key] * copies)
        lo, hi = VILLAGE_BOUNDS if m.get('village') else WILD_BOUNDS
        entry = {
            'id': i, 'name': m['name'], 'minLevel': m['lv'], 'theme': m['theme'],
            'village': bool(m.get('village')), 'tier': tier, 'seed': 1000 + i * 97,
            'bounds': [lo, hi],
            'spawns': spawns, 'bosses': bosses,
            'stoneDrops': own, 'stones': m.get('stones', 6 if m.get('village') else 5),
            'spawn': [25, 29] if m.get('village') else [lo + 8, 25],
            'portals': [],
        }
        if i in ACTIVE:
            k = ACTIVE.index(i)
            if k > 0: entry['portals'].append({'to': ACTIVE[k - 1], 'x': lo + 3, 'z': 25})
            if k < len(ACTIVE) - 1: entry['portals'].append({'to': ACTIVE[k + 1], 'x': hi - 3, 'z': 25})
        else:
            # oyunda olmayan eski harita: gizli ve boş (yaratık ve boss verileri mobs.json'da kalır)
            entry.update({'hidden': True, 'retired': True, 'spawns': [], 'bosses': [], 'stones': 0})
        if m.get('stoneLv'):
            entry['stoneLv'] = m['stoneLv']
            entry['metin'] = True
        if m.get('levelMap'):
            entry['levelMap'] = True
        if m.get('village'):
            entry['river'] = VILLAGE_RIVER
            entry['villageR'] = VILLAGE_RADIUS
        if i == 1:
            # Kızılçam Ormanı: ortasında kullanıcının getirdiği Uyanış Adası modeli (tools/takiglb.py + tools/mapglb.py)
            entry['model'] = {'file': 'ada_koy', 'scale': 70, 'x': 25, 'z': 25}
        if i in SHOPS:
            potions, tiers = SHOPS[i]
            entry['shop'] = {
                'potions': potions,
                'weapons': [k for k, v in items.items() if v['slot'] == 'weapon' and v.get('tier') in tiers and not k.endswith('_L')],
                'armor': [k for k, v in items.items() if v['slot'] in ('armor', 'helmet', 'shoes', 'bracelet', 'earring', 'shield', 'necklace')
                          and v.get('tier') in tiers and not k.endswith('_L')],
                'cosmetics': [k for k, v in items.items() if v['slot'] in ('costume', 'wings', 'pet') and v['price'] < 5000000],
            }
        maps.append(entry)
    # balık tutma haritası: yaratık yok, sadece ışınlayıcıyla gelinir
    maps.append({'id': len(maps), 'name': 'Gümüş Göl', 'minLevel': 30, 'theme': 'lake', 'village': False, 'fishing': True,
                 'safe': True, 'tier': 0, 'seed': 4242, 'bounds': [-15, 65], 'spawns': [], 'bosses': [], 'stoneDrops': [], 'stones': 0,
                 'spawn': [25, 22], 'portals': [], 'lake': {'x': 25, 'z': 44, 'r': 15},
                 'shop': {'potions': ['yem', 'p_hp1', 'p_mp1'], 'weapons': [], 'armor': []}})
    # krallık savaşı meydanı: sadece savaş sırasında girilir, üç krallığın üssü üç köşede
    # model: kullanıcının getirdiği Nexus Arena; üsler arenanın kuzey meydanında ve iki güney yolunun ucunda
    maps.append({'id': len(maps), 'name': 'Savaş Meydanı', 'minLevel': 20, 'theme': 'arena', 'village': False, 'hidden': True, 'war': True,
                 'tier': 0, 'seed': 5151, 'bounds': [-15, 65], 'spawns': [], 'bosses': [], 'stoneDrops': [], 'stones': 0,
                 'spawn': [25, 24.7], 'portals': [], 'bases': {'1': [24.9, 4.7], '2': [-0.6, 55.2], '3': [49.9, 55.2]},
                 'model': {'file': 'arena', 'scale': 45, 'x': 25, 'z': 25}})
    # grup zindanı: Karanlık Mağara (dalgalar + kraliçe), zindan kapısından girilir
    mobs['zorumcek'] = dict(mob_stats(32), name='Mağara Yaratığı', shape='spider', color='#3a2f45', scale=0.8, aggro=12, speed=6.2,
                            range=2.2, cd=1300, respawn=0, drops=[], potions=[['p_hp2', 0.15]], style={'model': 'uzayli', 'tint': '#8a6aa0'})
    mobs['zzehir'] = dict(mob_stats(35), name='Zehirli Yaratık', shape='spider', color='#4f8a2a', scale=0.95, aggro=12, speed=5.8,
                          range=2.4, cd=1400, respawn=0, drops=[], potions=[['p_hp2', 0.2]], style={'model': 'uzayli', 'tint': '#7fcf4a', 'aura': '#7dff3a'})
    q = mob_stats(40, boss=True)
    q.update({'name': 'Mağara Canavarı', 'shape': 'spider', 'color': '#5a1a4a', 'scale': 2.6, 'aggro': 0, 'speed': 4.6, 'range': 6.0, 'cd': 1800,
              'boss': True, 'respawn': 0, 'hitR': 3.2, 'drops': [], 'potions': [['p_hp3', 1.0]], 'style': {'model': 'uzayli', 'aura': '#c03aff', 'breath': '#9dff3a'}})
    q['hp'] = q['hp'] * 3
    mobs['zkralice'] = q
    maps.append({'id': len(maps), 'name': 'Karanlık Mağara', 'minLevel': 30, 'theme': 'swamp', 'village': False, 'hidden': True, 'dungeon': True,
                 'tier': 4, 'seed': 6161, 'bounds': [-15, 65], 'spawns': [], 'bosses': [], 'stoneDrops': [], 'stones': 0,
                 'spawn': [25, -8], 'portals': []})
    # dünya boss'u: haftada bir (Pazar 21:00) bütün sunucu birlikte vurur; can katılanların gücüne göre büyür
    w = mob_stats(70, boss=True)
    w.update({'name': 'Kadim Lav Ejderi', 'shape': 'bear', 'color': '#5a2a1a', 'scale': 6.5, 'aggro': 0, 'speed': 0, 'range': 9.0, 'cd': 2200,
              'boss': True, 'respawn': 0, 'hitR': 5.2, 'drops': [], 'potions': [], 'worldBoss': True,
              'style': {'model': 'lav_canavari', 'aura': '#ff5a1a', 'breath': '#ff7a2a'}})
    mobs['dunyaboss'] = w
    maps.append({'id': len(maps), 'name': 'Ejder Yuvası', 'minLevel': 10, 'theme': 'volcanic', 'village': False, 'hidden': True, 'worldBoss': True,
                 'tier': 10, 'seed': 7171, 'bounds': [-25, 75], 'spawns': [], 'bosses': [], 'stoneDrops': [], 'stones': 0,
                 'spawn': [25, -14], 'portals': []})
    return mobs, maps


# ---------------------------------------------------------------- beceriler
# 5. seviyede açılır; her seviyede 1 puan; beceri seviyesi 1-17, sonra M1-M3 (18-20)
def sk(key, name, desc, target, mp, mpLv, cd, color, **kw):
    d = {'key': key, 'name': name, 'desc': desc, 'target': target, 'mp': mp, 'mpLv': mpLv, 'cd': cd, 'color': color}
    d.update(kw)
    return d

SKILLS = {
    'savasci': [
        sk('s_ucluk', 'Kartal Pençesi', 'Önündeki düşmanlara üç yönlü güçlü bir kesik.', 'front', 15, 3, 6, '#ff6a5a', radius=5, mult=1.6, multLv=0.12, combo=1),
        sk('s_firtina', 'Kasırga', 'Havaya sıçrayıp dönerek yere çakılır; çevresindekileri biçer ve 1 saniye sersemletir.', 'aoe', 25, 4, 10, '#e8b54a', radius=4.5, mult=1.3, multLv=0.1, combo=1, stun=1.2),
        sk('s_hamle', 'Yıldırım Atılışı', 'İleri atılır, vardığı yerdeki düşmanlara vurur.', 'dash', 20, 3, 12, '#ffb347', radius=3, dist=7, mult=1.8, multLv=0.14, combo=2),
        sk('s_demir', 'Tunç Deri', '60 saniye savunmanı artırır.', 'self', 30, 3, 60, '#c9d1d9', buff={'stat': 'def', 'base': 10, 'perLv': 4, 'dur': 60}),
    ],
    'ninja': [
        sk('n_golge', 'Gölge Darbesi', 'Hedefin arkasına sıçrar; her zaman kritik vuran, kısa süre sersemleten sinsi bir darbe.', 'single', 18, 3, 7, '#8a7dff', range=4.8, mult=2.0, multLv=0.15, crit=True, combo=2, stun=0.8),
        sk('n_zehir', 'Zehirli Hançer', 'Vurur ve 8 saniye zehirler.', 'single', 15, 2, 9, '#6fd36f', range=4.8, mult=1.0, multLv=0.06, dot={'mult': 0.45, 'multLv': 0.05, 'sec': 8}, combo=0),
        sk('n_yagmur', 'Hançer Yağmuru', 'Çevresine hançer yağdırır.', 'aoe', 28, 4, 12, '#c9d1d9', radius=5, mult=1.2, multLv=0.1, combo=1),
        sk('n_adim', 'Kaçış Adımı', '30 saniye hareket ve saldırı hızını artırır.', 'self', 25, 2, 45, '#7be08f', buff={'stat': 'movespeed', 'base': 15, 'perLv': 1, 'dur': 30, 'extra': {'atkspeed': 10}}),
    ],
    'sura': [
        sk('u_kara', 'Karanlık Kılıç', '60 saniye saldırı gücünü artırır.', 'self', 30, 3, 60, '#8e44ad', buff={'stat': 'atk', 'base': 8, 'perLv': 5, 'dur': 60}),
        sk('u_emme', 'Ruh Emme', 'Vurduğu hasarın %30\'u kadar can çalar.', 'single', 20, 3, 8, '#b06bff', range=5.5, mult=1.7, multLv=0.12, lifesteal=0.3, combo=2),
        sk('u_alev', 'Kara Alev', 'Çevresini kara alevlerle yakar.', 'aoe', 35, 5, 12, '#6c3483', radius=5.5, mult=1.5, multLv=0.12, dot={'mult': 0.3, 'multLv': 0.03, 'sec': 5}, combo=1),
        sk('u_kalkan', 'Gölge Kalkanı', '60 saniye savunmanı artırır.', 'self', 25, 3, 60, '#5a5e6a', buff={'stat': 'def', 'base': 8, 'perLv': 3, 'dur': 60}),
    ],
    'saman': [
        sk('m_ejdatis', 'Boşluk Mızrağı', 'Gökten kara-mor mızraklar yağdırır; çarptığı yerde yer yarılır, çevresine de vurur ve 6 saniye yakar.', 'single', 24, 3, 7, '#9b4dff', range=6.5, splash=3.0, mult=2.4, multLv=0.17, dot={'mult': 0.35, 'multLv': 0.03, 'sec': 6}, combo=1),
        sk('m_kukreme', 'Kara Delik', 'Çevrendeki her şeyi içine çeken bir girdap açar, sonra dört halkalı kara patlamayla ezer ve sersemletir.', 'aoe', 42, 5, 14, '#7a2cff', radius=6.5, mult=1.9, multLv=0.14, stun=1.0, combo=1),
        sk('m_cagir', 'Portal Çöküşü', 'Hedefin üstünde devasa bir boşluk portalı açar; yıldırımlar ve kristal enkaz düşer, çevreyi sarsar ve sersemletir.', 'single', 36, 4, 12, '#b57bff', range=6.5, splash=3.6, mult=2.6, multLv=0.18, stun=1.3, combo=1),
        sk('m_pence', 'Ruh Zincirleri', 'Mor ruh zincirleri düşmandan düşmana sıçrar (3 hedef, 10. seviyede 4, M1\'de 5); her hedefi pençe izleriyle yırtar.', 'chain', 28, 3, 9, '#d9a8ff', range=6.5, mult=1.6, multLv=0.13, combo=1),
    ],
    'okcu': [
        sk('o_coklu', 'Üçlü Kılıç Dalgası', 'Kılıcını savurup aynı anda 3 hedefe kılıç dalgası fırlatır.', 'multi', 18, 3, 5, '#f4e2b8', range=12, mult=1.2, multLv=0.1, count=3),
        sk('o_zehirli', 'Buz Dalgası', 'Buzdan bir kılıç dalgası fırlatır; hedefi 2 saniye dondurur.', 'single', 15, 2, 8, '#9fd8ff', range=12, mult=1.3, multLv=0.09, stun=2.0, freeze=True),
        sk('o_ates', 'Ateş Dalgası', 'Patlayan ateş dalgası: hedefin çevresine de hasar verir.', 'single', 28, 4, 10, '#ff6a3d', range=13, mult=2.2, multLv=0.17, splash=2.8),
        sk('o_hafif', 'Hafif Adım', '40 saniye hareket ve saldırı hızını artırır.', 'self', 20, 2, 45, '#7be08f', buff={'stat': 'movespeed', 'base': 20, 'perLv': 1.5, 'dur': 40, 'extra': {'atkspeed': 8}}),
    ],
}

if __name__ == '__main__':
    items = build_items()
    mobs, maps = build(items)
    for m_ in maps:
        if m_['name'] in ('Taş Vadisi', 'Kızıl Kanyon', 'Karlı Dağlar', 'Buz Mağarası', 'Volkan Metin Ovası', 'Karanlık Mağara'): m_['mining'] = True
    for name, data in (('items.json', items), ('mobs.json', mobs), ('maps.json', maps), ('skills.json', SKILLS)):
        with open(os.path.join(ROOT, name), 'w', encoding='utf8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(items)} eşya, {len(mobs)} yaratık, {len(maps)} harita yazıldı.')
