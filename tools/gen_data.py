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
    (57, 'Buz', '#9fd8ff'), (64, 'Kristal', '#c8d0ff'), (71, 'Alev', '#ff6a3d'), (78, 'Kara', '#4a5060'),
    (85, 'Lanetli', '#8a7dff'), (92, 'İblis', '#b0362b'), (99, 'Ejder', '#ffb347'), (106, 'İmparator', '#ffd700'),
]

WEAPONS = [  # (tür, ad, sınıflar, uzunluk)
    ('sword', 'Kılıç', ['savasci', 'sura'], 0.95),
    ('dagger', 'Hançer', ['ninja'], 0.45),
    ('bow', 'Yay', ['okcu'], 1.25),
    ('staff', 'Asa', ['saman'], 1.55),
]
GEAR = [  # (yuva, ad, fiyat çarpanı)
    ('armor', 'Zırh', 0.9), ('helmet', 'Miğfer', 0.6), ('shoes', 'Çizme', 0.5),
    ('bracelet', 'Bilezik', 0.7), ('earring', 'Küpe', 0.7),
]


def price(i, factor):
    return int(round(50 * (i + 1) ** 2.2 * factor / 10.0)) * 10


def build_items():
    items = {}
    for i, (lv, tname, color) in enumerate(TIERS):
        for legendary in (False, True):
            m = 1.35 if legendary else 1.0
            pre = 'Efsanevi ' if legendary else ''
            suf = '_L' if legendary else ''
            rarity = 2 if legendary else (1 if i >= 11 else 0)
            for wtype, wname, classes, length in WEAPONS:
                items[f'{wtype}{i}{suf}'] = {
                    'name': f'{pre}{tname} {wname}', 'slot': 'weapon', 'type': wtype, 'classes': classes,
                    'lv': lv, 'tier': i, 'atk': round((6 + 9 * i + 0.6 * i * i) * m), 'rarity': rarity,
                    'color': color, 'len': length, 'glow': legendary or i >= 10,
                    'price': 0 if legendary else price(i, 1.0),
                }
            for slot, gname, factor in GEAR:
                it = {'name': f'{pre}{tname} {gname}', 'slot': slot, 'lv': lv, 'tier': i, 'rarity': rarity,
                      'color': color, 'price': 0 if legendary else price(i, factor)}
                if slot == 'armor':
                    it['def'] = round((3 + 6 * i + 0.4 * i * i) * m)
                    it['plate'] = color
                    if i >= 4:
                        it['trim'] = '#e8b54a' if not legendary else '#fff1b8'
                elif slot == 'helmet':
                    it['def'] = round((3 + 6 * i + 0.4 * i * i) * 0.6 * m)
                    if i >= 4:
                        it['plume'] = '#e8b54a'
                elif slot == 'shoes':
                    it['def'] = round((3 + 6 * i + 0.4 * i * i) * 0.4 * m)
                elif slot == 'bracelet':
                    it['atk'] = round((2 + 3 * i) * m)
                    it['hp'] = round((20 + 15 * i) * m)
                elif slot == 'earring':
                    it['hp'] = round((30 + 25 * i) * m)
                    it['def'] = round((1 + 1.5 * i) * m)
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
    items['p_green'] = {'name': 'Yeşil İksir', 'slot': 'potion', 'buff': {'stat': 'atkspeed', 'value': 20, 'dur': 300},
                        'desc': '5 dakika saldırı hızı +%20', 'lv': 1, 'price': 150, 'rarity': 1, 'color': '#4fbf5a', 'stack': 200}
    items['p_speed'] = {'name': 'Hız İksiri', 'slot': 'potion', 'buff': {'stat': 'movespeed', 'value': 25, 'dur': 300},
                        'desc': '5 dakika hareket hızı +%25', 'lv': 1, 'price': 150, 'rarity': 1, 'color': '#f2c94c', 'stack': 200}

    # efsun nesnesi: sadece metin taşlarından düşer
    items['efsun'] = {'name': 'Efsun Nesnesi', 'slot': 'use', 'desc': 'Bir ekipmana rastgele bir efsun ekler (en fazla 5).',
                      'lv': 1, 'price': 0, 'rarity': 2, 'color': '#c86bff', 'stack': 200}
    # efsun değiştirme: sadece boss'lardan düşer
    items['efsun_degis'] = {'name': 'Efsun Değiştirme Nesnesi', 'slot': 'use',
                            'desc': 'Efsunlu bir ekipmanın tüm efsunlarını yeniden belirler (efsun sayısı aynı kalır).',
                            'lv': 1, 'price': 0, 'rarity': 2, 'color': '#4fd1c5', 'stack': 200}
    # balıkçılık
    items['olta'] = {'name': 'Olta', 'slot': 'use', 'desc': 'Gümüş Göl kıyısında balık tutmak için.', 'lv': 30, 'price': 0, 'rarity': 1, 'color': '#8a6440'}
    items['yem'] = {'name': 'Solucan Yem', 'slot': 'use', 'desc': 'Her atışta bir yem harcanır.', 'lv': 1, 'price': 8, 'rarity': 0, 'color': '#b0726a', 'stack': 200}
    fish = [('b_hamsi', 'Hamsi', 20), ('b_sazan', 'Sazan', 45), ('b_alabalik', 'Alabalık', 90), ('b_levrek', 'Levrek', 160),
            ('b_yayin', 'Yayın Balığı', 600), ('b_cizme', 'Eski Çizme', 2)]
    for key, name, value in fish:
        items[key] = {'name': name, 'slot': 'fish', 'lv': 1, 'price': value * 4, 'rarity': 1 if value >= 600 else 0,
                      'color': '#7fb3c4' if key != 'b_cizme' else '#6b4a2e', 'stack': 200}
    items['istiridye'] = {'name': 'İstiridye', 'slot': 'use', 'desc': 'Aç: içinden nadiren inci çıkar.', 'lv': 1, 'price': 40, 'rarity': 1, 'color': '#c8c0b0', 'stack': 200}
    for key, name, value, color in [('inci_beyaz', 'Beyaz İnci', 3000, '#f4f1e8'), ('inci_mavi', 'Mavi İnci', 9000, '#7fb3ff'), ('inci_kirmizi', 'Kırmızı İnci', 30000, '#ff6a5a')]:
        items[key] = {'name': name, 'slot': 'gem', 'lv': 1, 'price': value * 4, 'rarity': 2, 'color': color, 'stack': 200}
    # at
    items['at_muhru'] = {'name': 'At Mührü', 'slot': 'use', 'desc': 'Kullanınca atına biner ya da iner. Atlıyken %60 daha hızlısın.',
                         'lv': 25, 'price': 0, 'rarity': 2, 'color': '#c9a35a'}

    # eski sürümden kalan eşyalar (var olan karakterler bozulmasın)
    legacy = json.load(open(os.path.join(ROOT, 'items.json'), encoding='utf8')) if os.path.exists(
        os.path.join(ROOT, 'items.json')) else {}
    for k, v in legacy.items():
        if k in items or not ('_' in k and k.split('_')[0] in ('w', 'd', 'b', 's', 'a', 'h')):
            continue
        v = dict(v)
        v.setdefault('lv', 1)
        v['price'] = 0
        v['legacy'] = True
        items[k] = v
    return items


# ---------------------------------------------------------------- yaratıklar
def mob_stats(lv, boss=False):
    hp = 100 + lv * lv * 2.5 + lv * 20
    atk = 8 + lv * 6 + lv * lv * 0.12
    d = {
        'lv': lv, 'hp': int(hp * (8 if boss else 1)), 'atk': int(atk * (1.4 if boss else 1)),
        'def': int(lv * 1.5 * (1.5 if boss else 1)),
        'exp': int((20 + lv * 9 + lv * lv * 0.35) * (15 if boss else 1)),
        'yang': [int((5 + lv * 4) * (10 if boss else 1)), int((15 + lv * 9) * (12 if boss else 1))],
    }
    return d


# (anahtar, ad, seviye, şekil, renk, ölçek, saldırganlık yarıçapı, hız, menzil)
MAPS = [
    {'name': 'Atabis Köyü', 'lv': 1, 'theme': 'village_winter', 'village': True,
     'mobs': [('kopek', 'Sokak Köpeği', 1, 'dog', '#8a6a4a', 0.8, 0, 4.5),
              ('kurt', 'Gri Kurt', 3, 'wolf', '#7d7f86', 1.0, 9, 5.5),
              ('domuz', 'Yaban Domuzu', 5, 'boar', '#5a4535', 1.05, 7, 5.0)],
     'bosses': [('bozkurt', 'Kurt Lideri Bozkurt', 10, 'wolf', '#d9d4c7', 1.9, {'mane': '#f4f1e8', 'eyes': '#7fd4ff', 'aura': '#9fd8ff'}),
                ('tonguz', 'Dev Domuz Tonguz', 13, 'boar', '#3a2a1c', 2.1, {'tusks': '#f4efe4', 'spikes': '#1e140c', 'eyes': '#ff3b2f'})]},
    {'name': 'Kızılçam Ormanı', 'lv': 15, 'theme': 'pine_forest',
     'mobs': [('vkurt', 'Vahşi Kurt', 15, 'wolf', '#5a4a3a', 1.1, 10, 5.8),
              ('kdomuz', 'Kara Domuz', 17, 'boar', '#2a2522', 1.15, 8, 5.2),
              ('ayi', 'Orman Ayısı', 19, 'bear', '#4a3020', 1.3, 8, 4.6)],
     'bosses': [('kizilayi', 'Kızıl Ayı', 24, 'bear', '#8e2a21', 2.2, {'plates': '#4a2418', 'horns': '#d9cfb8', 'eyes': '#ff6a3d', 'aura': '#ff6a3d'})]},
    {'name': 'Sisli Orman', 'lv': 22, 'theme': 'forest_mist',
     'mobs': [('sisorumcek', 'Sis Örümceği', 22, 'spider', '#5a5e6a', 1.0, 9, 5.5),
              ('golgekurt', 'Gölge Kurdu', 24, 'wolf', '#2c2f3a', 1.15, 11, 6.0),
              ('agacruhu', 'Ağaç Ruhu', 26, 'golem', '#4a6a35', 1.1, 7, 3.8)],
     'bosses': [('orumcekkr', 'Örümcek Kraliçesi', 31, 'spider', '#6c3483', 2.4, {'crown': '#ffd700', 'eyes': '#d07bff', 'spikes': '#2a0f3a', 'aura': '#b06bff'})]},
    {'name': 'Taş Vadisi', 'lv': 29, 'theme': 'rocky',
     'mobs': [('tasgolem', 'Taş Golem', 29, 'golem', '#8d8a82', 1.15, 7, 3.6),
              ('kayaakrep', 'Kaya Akrebi', 31, 'scorpion', '#6a5a4a', 1.0, 9, 5.0),
              ('haydut', 'Vadi Haydudu', 33, 'humanoid', '#6b4a2e', 1.0, 11, 5.4)],
     'bosses': [('karatug', 'Haydut Reisi Kara Tuğ', 38, 'humanoid', '#2a2522', 1.5, {'plume': '#c0392b', 'cape': '#7d1f16', 'weapon': '#d9d4c7'})]},
    {'name': 'Kuru Çöl', 'lv': 36, 'theme': 'desert_dunes',
     'mobs': [('kumakrep', 'Kum Akrebi', 36, 'scorpion', '#c9a35a', 1.05, 9, 5.2),
              ('colkurt', 'Çöl Kurdu', 38, 'wolf', '#c9a36a', 1.1, 11, 6.2),
              ('solucan', 'Kum Solucanı', 40, 'worm', '#b08a5a', 1.1, 8, 4.4)],
     'bosses': [('devsolucan', 'Dev Kum Solucanı', 45, 'worm', '#8a6440', 2.6, {'spikes': '#e8d5a8', 'crystals': '#ffb347', 'eyes': '#ff3b2f'})]},
    {'name': 'Kızıl Kanyon', 'lv': 43, 'theme': 'desert_canyon',
     'mobs': [('colhaydut', 'Çöl Haydudu', 43, 'humanoid', '#c9a35a', 1.0, 11, 5.6),
              ('mumya', 'Mumya', 45, 'humanoid', '#d9cfb8', 1.05, 8, 3.8),
              ('akbaba', 'Akbaba', 47, 'flyer', '#3a2a1c', 1.1, 12, 6.5)],
     'bosses': [('yagmaci', 'Kervan Yağmacısı', 52, 'humanoid', '#8e2a21', 1.6, {'cape': '#c9a35a', 'eyes': '#ffd23f', 'orbs': '#ffb347', 'weapon': '#ffd700'})]},
    {'name': 'Kara Bataklık', 'lv': 50, 'theme': 'swamp',
     'mobs': [('kurbaga', 'Bataklık Kurbağası', 50, 'frog', '#4a6a35', 1.0, 8, 5.0),
              ('yilan', 'Zehirli Yılan', 52, 'worm', '#3f7535', 0.9, 10, 5.6),
              ('camur', 'Çamur Canavarı', 54, 'golem', '#4a3a2a', 1.2, 7, 3.8)],
     'bosses': [('cadi', 'Bataklık Cadısı', 59, 'ghost', '#6fd36f', 1.8, {'hat': '#1a2a1a', 'flames': '#6fd36f', 'orbs': '#9fff7f', 'aura': '#6fd36f'})]},
    {'name': 'Karlı Dağlar', 'lv': 57, 'theme': 'snow',
     'mobs': [('karkurt', 'Kar Kurdu', 57, 'wolf', '#e8eef2', 1.15, 12, 6.2),
              ('buzayi', 'Buz Ayısı', 59, 'bear', '#dfe8ee', 1.35, 9, 4.8),
              ('yeti', 'Yeti', 61, 'humanoid', '#f4f6f8', 1.4, 9, 4.6)],
     'bosses': [('buzdevi', 'Buz Devi', 66, 'golem', '#9fd8ff', 2.6, {'crystals': '#9fd8ff', 'spikes': '#e8f4ff', 'eyes': '#7fd4ff', 'aura': '#9fd8ff'})]},
    {'name': 'Buz Mağarası', 'lv': 64, 'theme': 'ice_cave',
     'mobs': [('buzorumcek', 'Buz Örümceği', 64, 'spider', '#9fd8ff', 1.05, 10, 5.6),
              ('kristalgolem', 'Kristal Golem', 66, 'golem', '#c8d0ff', 1.2, 7, 3.8),
              ('ayazruhu', 'Ayaz Ruhu', 68, 'ghost', '#e8f4ff', 1.0, 12, 5.8)],
     'bosses': [('ayazkralice', 'Ayaz Kraliçesi', 73, 'ghost', '#7fb3ff', 2.0, {'crown': '#e8f4ff', 'crystals': '#7fb3ff', 'orbs': '#c8e8ff', 'aura': '#7fb3ff'})]},
    {'name': 'Volkan Eteği', 'lv': 71, 'theme': 'volcanic',
     'mobs': [('atesbocek', 'Ateş Böceği', 71, 'spider', '#ff6a3d', 0.95, 10, 6.0),
              ('lavgolem', 'Lav Golemi', 73, 'golem', '#5a2a1c', 1.25, 7, 3.6),
              ('korkurt', 'Kor Kurdu', 75, 'wolf', '#c0392b', 1.2, 12, 6.4)],
     'bosses': [('ejderyavru', 'Ateş Ejderhası Yavrusu', 80, 'dragon', '#c0392b', 1.8, {'flames': '#ff6a3d', 'horns': '#2a1a14', 'eyes': '#ffd23f'})]},
    {'name': 'Ejder Kalesi', 'lv': 78, 'theme': 'castle',
     'mobs': [('muhafiz', 'Kale Muhafızı', 78, 'humanoid', '#7d7f86', 1.05, 10, 5.2),
              ('karasovalye', 'Kara Şövalye', 80, 'humanoid', '#2a2a2a', 1.1, 11, 5.4),
              ('gargoyl', 'Gargoyl', 82, 'flyer', '#5a5e6a', 1.25, 12, 6.2)],
     'bosses': [('sovalyelord', 'Kara Şövalye Lordu', 87, 'humanoid', '#1a1a1a', 1.7, {'cape': '#1a1a1a', 'horns': '#2a2a2a', 'eyes': '#ff3b2f', 'plates': '#3a3a40', 'weapon': '#8a7dff'})]},
    {'name': 'Lanetli Harabeler', 'lv': 85, 'theme': 'ruins',
     'mobs': [('iskelet', 'İskelet Savaşçı', 85, 'skeleton', '#e8e2d0', 1.0, 11, 5.4),
              ('hayalet', 'Hayalet', 87, 'ghost', '#c8d0ff', 1.0, 12, 5.8),
              ('buyucu', 'Lanetli Büyücü', 89, 'humanoid', '#6c3483', 1.0, 13, 5.0)],
     'bosses': [('lichkral', 'Lich Kral', 94, 'skeleton', '#8a7dff', 1.9, {'crown': '#8a7dff', 'cape': '#2a1a3a', 'orbs': '#8a7dff', 'aura': '#8a7dff', 'eyes': '#b0a8ff'})]},
    {'name': 'İblis Kulesi', 'lv': 92, 'theme': 'demon',
     'mobs': [('iblismuhafiz', 'İblis Muhafız', 92, 'humanoid', '#8e2a21', 1.15, 11, 5.4),
              ('alevib', 'Alev İblisi', 94, 'ghost', '#ff6a3d', 1.1, 12, 6.0),
              ('suikastci', 'Gölge Suikastçı', 96, 'humanoid', '#1a1a1a', 1.0, 14, 7.0)],
     'bosses': [('kuleefendisi', 'Kule Efendisi', 101, 'humanoid', '#b0362b', 1.9, {'horns': '#1a0a0a', 'wings': '#5a1010', 'flames': '#ff6a3d', 'eyes': '#ffd23f', 'weapon': '#ff6a3d'})]},
    {'name': 'Ejder Vadisi', 'lv': 99, 'theme': 'dragon_valley',
     'mobs': [('gencejder', 'Genç Ejder', 99, 'dragon', '#3f7535', 1.0, 12, 6.0),
              ('ejdermuhafiz', 'Ejder Muhafızı', 101, 'humanoid', '#ffb347', 1.15, 11, 5.4),
              ('ejderbuyucu', 'Ejder Büyücüsü', 103, 'ghost', '#ffb347', 1.1, 13, 5.6)],
     'bosses': [('gokejder', 'Gök Ejderi', 108, 'dragon', '#7fb3ff', 2.3, {'horns': '#e8f4ff', 'crystals': '#9fd8ff', 'spikes': '#c8e8ff', 'aura': '#7fb3ff'})]},
    {'name': 'Kara Taht', 'lv': 106, 'theme': 'dark_throne',
     'mobs': [('karaasker', 'Kara Ordu Askeri', 106, 'humanoid', '#2a2a2a', 1.05, 12, 5.6),
              ('karakomutan', 'Kara Ordu Komutanı', 108, 'humanoid', '#4a1a1a', 1.2, 12, 5.6),
              ('hiclik', 'Hiçlik Yaratığı', 110, 'ghost', '#3a1a4a', 1.2, 14, 6.0)],
     'bosses': [('karaimparator', 'Kara İmparator', 115, 'humanoid', '#ffd700', 2.0, {'crown': '#ffd700', 'cape': '#4a1a6a', 'plates': '#c9a35a', 'aura': '#ffd700', 'weapon': '#ffd700'}),
                ('hiclikejder', 'Hiçlik Ejderi', 120, 'dragon', '#3a1a4a', 2.6, {'horns': '#0a0010', 'spikes': '#8a5aff', 'flames': '#8a5aff', 'eyes': '#d07bff', 'aura': '#5a2a8a'})]},
]

# tek köy var: bütün alışveriş Atabis Köyü'nde (harita sırası -> (iksirler, satılan kademeler))
SHOPS = {
    0: (['p_hp1', 'p_hp2', 'p_hp3', 'p_hp4', 'p_mp1', 'p_mp2', 'p_mp3', 'p_mp4', 'p_green', 'p_speed'], list(range(0, 11))),
}

# harita sınırları: köy haritası orta boy, vahşi haritalar büyük
VILLAGE_BOUNDS = [-25, 75]
WILD_BOUNDS = [-45, 95]


def tier_for_map(i):
    return min(i + 1, len(TIERS) - 1) if i > 0 else 0


def build(items):
    mobs, maps = {}, []
    for i, m in enumerate(MAPS):
        tier = tier_for_map(i)
        spawns, bosses = [], []
        own = [k for k, v in items.items() if v.get('tier') == tier and not k.endswith('_L')]
        nxt = [k for k, v in items.items() if v.get('tier') == min(tier + 1, len(TIERS) - 1) and not k.endswith('_L')]
        leg = [k for k, v in items.items() if v.get('tier') == tier and k.endswith('_L')]
        low = [k for k, v in items.items() if v.get('tier') == max(0, tier - 1) and not k.endswith('_L')]
        for key, name, lv, shape, color, scale, aggro, speed in m['mobs']:
            d = mob_stats(lv)
            d.update({'name': name, 'shape': shape, 'color': color, 'scale': scale, 'aggro': aggro,
                      'speed': speed, 'range': 2.4 * max(1, scale), 'cd': 1600, 'boss': False,
                      'drops': [[k, 0.012] for k in own] + [[k, 0.02] for k in low],
                      'potions': [[('p_hp1' if lv < 15 else 'p_hp2' if lv < 40 else 'p_hp3' if lv < 75 else 'p_hp4'), 0.08],
                                  [('p_mp1' if lv < 15 else 'p_mp2' if lv < 40 else 'p_mp3' if lv < 75 else 'p_mp4'), 0.05]]})
            mobs[key] = d
            spawns.append({'mob': key, 'count': 10 if i == 0 else 14})
        for key, name, lv, shape, color, scale, style in m['bosses']:
            d = mob_stats(lv, boss=True)
            d.update({'name': name, 'shape': shape, 'color': color, 'scale': scale, 'aggro': 0,
                      'speed': 5.2, 'range': 2.6 * scale, 'cd': 2000, 'boss': True, 'respawn': 120,
                      'drops': [[k, 0.28] for k in own] + [[k, 0.12] for k in nxt] + [[k, 0.035] for k in leg],
                      'potions': [[('p_hp2' if lv < 40 else 'p_hp3' if lv < 75 else 'p_hp4'), 1.0],
                                  [('p_mp2' if lv < 40 else 'p_mp3' if lv < 75 else 'p_mp4'), 1.0],
                                  ['p_green', 0.3], ['p_speed', 0.3], ['efsun_degis', 0.2]],
                      'style': style})
            mobs[key] = d
            bosses.append(key)
        lo, hi = VILLAGE_BOUNDS if m.get('village') else WILD_BOUNDS
        entry = {
            'id': i, 'name': m['name'], 'minLevel': m['lv'], 'theme': m['theme'],
            'village': bool(m.get('village')), 'tier': tier, 'seed': 1000 + i * 97,
            'bounds': [lo, hi],
            'spawns': spawns, 'bosses': bosses,
            'stoneDrops': own, 'stones': 5,
            'spawn': [25, 29] if m.get('village') else [lo + 8, 25],
            'portals': ([{'to': i - 1, 'x': lo + 3, 'z': 25}] if i > 0 else []) +
                       ([{'to': i + 1, 'x': hi - 3, 'z': 25}] if i < len(MAPS) - 1 else []),
        }
        if i in SHOPS:
            potions, tiers = SHOPS[i]
            entry['shop'] = {
                'potions': potions,
                'weapons': [k for k, v in items.items() if v['slot'] == 'weapon' and v.get('tier') in tiers and not k.endswith('_L')],
                'armor': [k for k, v in items.items() if v['slot'] in ('armor', 'helmet', 'shoes', 'bracelet', 'earring')
                          and v.get('tier') in tiers and not k.endswith('_L')],
            }
        maps.append(entry)
    # balık tutma haritası: yaratık yok, sadece ışınlayıcıyla gelinir
    maps.append({'id': len(maps), 'name': 'Gümüş Göl', 'minLevel': 30, 'theme': 'lake', 'village': False, 'fishing': True,
                 'safe': True, 'tier': 0, 'seed': 4242, 'bounds': [-15, 65], 'spawns': [], 'bosses': [], 'stoneDrops': [], 'stones': 0,
                 'spawn': [25, 22], 'portals': [], 'lake': {'x': 25, 'z': 44, 'r': 15},
                 'shop': {'potions': ['yem', 'p_hp1', 'p_mp1'], 'weapons': [], 'armor': []}})
    return mobs, maps


# ---------------------------------------------------------------- beceriler
# 5. seviyede açılır; her seviyede 1 puan; beceri seviyesi 1-17, sonra M1-M3 (18-20)
def sk(key, name, desc, target, mp, mpLv, cd, color, **kw):
    d = {'key': key, 'name': name, 'desc': desc, 'target': target, 'mp': mp, 'mpLv': mpLv, 'cd': cd, 'color': color}
    d.update(kw)
    return d

SKILLS = {
    'savasci': [
        sk('s_ucluk', 'Üçlü Kesik', 'Önündeki düşmanlara üç yönlü güçlü bir kesik.', 'front', 15, 3, 6, '#ff6a5a', radius=5, mult=1.6, multLv=0.12, combo=1),
        sk('s_firtina', 'Kılıç Fırtınası', 'Etrafında dönerek çevresindeki herkesi biçer.', 'aoe', 25, 4, 10, '#e8b54a', radius=4.5, mult=1.3, multLv=0.1, combo=1),
        sk('s_hamle', 'Saldırı Hamlesi', 'İleri atılır, vardığı yerdeki düşmanlara vurur.', 'dash', 20, 3, 12, '#ffb347', radius=3, dist=7, mult=1.8, multLv=0.14, combo=2),
        sk('s_demir', 'Demir Beden', '60 saniye savunmanı artırır.', 'self', 30, 3, 60, '#c9d1d9', buff={'stat': 'def', 'base': 10, 'perLv': 4, 'dur': 60}),
    ],
    'ninja': [
        sk('n_golge', 'Gölge Darbesi', 'Tek hedefe her zaman kritik vuran sinsi bir darbe.', 'single', 18, 3, 7, '#8a7dff', range=4.8, mult=2.0, multLv=0.15, crit=True, combo=2),
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
        sk('m_sifa', 'Şifa', 'Kendini ve 8 metre içindeki oyuncuları iyileştirir.', 'heal', 30, 3, 8, '#7be08f', heal={'base': 80, 'perLv': 14, 'perLevel': 8}, radius=8),
        sk('m_simsek', 'Şimşek', 'Hedeften hedefe sıçrayan yıldırım (3 hedef, 10. seviyede 4, M1\'de 5).', 'chain', 22, 3, 6, '#9fd8ff', range=11, mult=1.5, multLv=0.12),
        sk('m_kutsama', 'Kutsama', '90 saniye kendinin ve yakınındakilerin savunmasını artırır.', 'self', 35, 3, 60, '#ffd23f', buff={'stat': 'def', 'base': 6, 'perLv': 3, 'dur': 90}, radius=10),
        sk('m_kukreme', 'Ejder Kükremesi', 'Çevresine ateşli bir kükreme salar.', 'aoe', 40, 5, 14, '#ff6a3d', radius=6, mult=1.6, multLv=0.13, combo=1),
    ],
    'okcu': [
        sk('o_coklu', 'Çoklu Ok', 'Aynı anda 3 hedefe ok atar.', 'multi', 18, 3, 5, '#f4e2b8', range=12, mult=1.2, multLv=0.1, count=3),
        sk('o_zehirli', 'Zehirli Ok', 'Vurur ve 8 saniye zehirler.', 'single', 15, 2, 8, '#6fd36f', range=12, mult=1.0, multLv=0.08, dot={'mult': 0.5, 'multLv': 0.05, 'sec': 8}),
        sk('o_ates', 'Ateşli Ok', 'Patlayan ok: hedefin çevresine de hasar verir.', 'single', 28, 4, 10, '#ff6a3d', range=13, mult=2.2, multLv=0.17, splash=2.8),
        sk('o_hafif', 'Hafif Adım', '40 saniye hareket ve saldırı hızını artırır.', 'self', 20, 2, 45, '#7be08f', buff={'stat': 'movespeed', 'base': 20, 'perLv': 1.5, 'dur': 40, 'extra': {'atkspeed': 8}}),
    ],
}

if __name__ == '__main__':
    items = build_items()
    mobs, maps = build(items)
    for name, data in (('items.json', items), ('mobs.json', mobs), ('maps.json', maps), ('skills.json', SKILLS)):
        with open(os.path.join(ROOT, name), 'w', encoding='utf8') as f:
            json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(items)} eşya, {len(mobs)} yaratık, {len(maps)} harita yazıldı.')
