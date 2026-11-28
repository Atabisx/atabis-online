// Yönetim paneli: oyuncular, eşyalar (3D önizleme), yaratıklar (animasyonlu), haritalar, duyuru ve etkinlikler.
// Sunucu tarafı: server/admin.js (/api/admin/*). Giriş GM karakteri olan hesapla yapılır.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ITEM_MODELS, MOB_MODELS, itemModel } from './entities/models.js';
import { buildMob } from './entities/mobs.js';
import { buildWings, buildPet } from './entities/cosmetics.js';
import { bootsMesh, braceletMesh, earringMesh, necklaceMesh, potionMesh, crystalMesh, fishMesh, pearlMesh } from './icons.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('tr-TR');
const CLS = { savasci: 'Şövalye', ninja: 'Suikastçı', sura: 'Lanetli', saman: 'Büyücü', okcu: 'Ejder Fatihi' };
const TOKEN_KEY = 'atabis_admin_token';
let token = localStorage.getItem(TOKEN_KEY);
let ITEMS = {}, MOBS = {}, MAPS = [];

// ---------- sunucu ----------
async function api(path, body) {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) { logout(); throw new Error(j.error || 'Oturum kapandı.'); }
  if (!r.ok) throw new Error(j.error || 'Sunucu hatası.');
  return j;
}
let toastT = 0;
function toast(msg, bad) {
  const t = $('toast'); t.textContent = msg; t.className = bad ? 'bad' : '';
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hide'), 3500);
}
async function run(path, body, after) {
  try { const r = await api(path, body); toast(r.msg || 'Tamam.'); if (after) after(r); return r; }
  catch (e) { toast(e.message, true); return null; }
}

// ---------- giriş ----------
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault(); $('lerr').textContent = '';
  try {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: $('lu').value, password: $('lp').value }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Giriş yapılamadı.');
    token = j.token; localStorage.setItem(TOKEN_KEY, token);
    await start();
  } catch (err) { $('lerr').textContent = err.message; }
});
function logout() {
  localStorage.removeItem(TOKEN_KEY); token = null;
  $('app').classList.add('hide'); $('login').classList.remove('hide');
}
$('logout').onclick = () => { fetch('/api/logout', { method: 'POST', headers: { authorization: 'Bearer ' + token } }).catch(() => {}); logout(); };

async function start() {
  try {
    const me = await api('/api/admin/me');
    $('who').textContent = me.username;
  } catch (e) { logout(); $('lerr').textContent = e.message; return; }
  [ITEMS, MOBS, MAPS] = await Promise.all(['items', 'mobs', 'maps'].map((n) => fetch(`/shared/${n}.json`).then((r) => r.json())));
  $('login').classList.add('hide'); $('app').classList.remove('hide');
  show(location.hash.slice(1) || 'ozet');
}
document.querySelectorAll('#tabs button').forEach((b) => (b.onclick = () => show(b.dataset.t)));
function show(t) {
  if (!PAGES[t]) t = 'ozet';
  history.replaceState(null, '', '#' + t);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  $('main').innerHTML = '<div class="muted">Yükleniyor…</div>';
  PAGES[t]().catch((e) => { $('main').innerHTML = `<div class="card">${esc(e.message)}</div>`; });
}

// ---------- eşya yardımcıları ----------
const CATS = [
  ['hepsi', 'Hepsi', () => true],
  ['silah', 'Silahlar', (d) => d.slot === 'weapon'],
  ['zirh', 'Zırh', (d) => d.slot === 'armor'],
  ['kask', 'Kask', (d) => d.slot === 'helmet'],
  ['kalkan', 'Kalkan', (d) => d.slot === 'shield'],
  ['taki', 'Ayakkabı ve Takı', (d) => ['shoes', 'bracelet', 'earring', 'necklace'].includes(d.slot)],
  ['kozmetik', 'Kanat, Kostüm, Pet', (d) => ['wings', 'costume', 'pet'].includes(d.slot)],
  ['iksir', 'İksir ve Kullanılan', (d) => ['potion', 'use'].includes(d.slot)],
  ['diger', 'Diğer', (d) => ['stone', 'gem', 'material', 'fish'].includes(d.slot) || !d.slot],
];
const SLOT_ICON = { weapon: '⚔️', armor: '🛡️', helmet: '⛑️', shield: '🛡️', shoes: '👢', bracelet: '📿', earring: '💎', necklace: '📿', wings: '🪽', costume: '👘', pet: '🐾', potion: '🧪', use: '📜', stone: '🔮', gem: '💠', material: '🧱', fish: '🐟' };
const WEAPON_ICON = { sword: '⚔️', dagger: '🗡️', bow: '🏹', staff: '🪄' };
const ORDER = ['weapon:sword', 'weapon:dagger', 'weapon:bow', 'weapon:staff', 'armor', 'helmet', 'shield', 'shoes', 'bracelet', 'earring', 'necklace', 'wings', 'costume', 'pet', 'potion', 'use', 'stone', 'gem', 'material', 'fish'];
const SLOT_ORDER = (d) => { const k = d.slot === 'weapon' ? 'weapon:' + d.type : d.slot; const i = ORDER.indexOf(k); return i < 0 ? 99 : i; };
const SLOT_NAME = { weapon: 'Silah', armor: 'Zırh', helmet: 'Kask', shield: 'Kalkan', shoes: 'Ayakkabı', bracelet: 'Bilezik', earring: 'Küpe', necklace: 'Kolye', wings: 'Kanat', costume: 'Kostüm', pet: 'Evcil hayvan', potion: 'İksir', use: 'Kullanılan', stone: 'Taş', gem: 'Mücevher', material: 'Malzeme', fish: 'Balık' };
const has3D = (d) => !!((d.model && ITEM_MODELS[d.model]) || d.wing || d.pet || ['shoes', 'bracelet', 'earring', 'necklace', 'potion', 'fish', 'weapon', 'gem', 'stone'].includes(d.slot));
function icon(d) {
  const e = d.slot === 'weapon' ? WEAPON_ICON[d.type] || '⚔️' : SLOT_ICON[d.slot] || '📦';
  const border = d.rarity >= 2 ? '#e8b54a' : d.rarity === 1 ? '#6fb3ff' : d.color || '#333';
  return `<div class="ic" style="border-color:${esc(border)};box-shadow:inset 0 0 14px ${esc(d.color || '#000')}55">${e}${d.model && ITEM_MODELS[d.model] ? '<i>3D</i>' : ''}</div>`;
}
const classNames = (d) => (d.classes || []).map((c) => CLS[c] || c).join(', ');
function itemCard(key, extra = '') {
  const d = ITEMS[key] || { name: key };
  const sub = [d.lv ? 'Sv. ' + d.lv : '', d.slot === 'weapon' ? classNames(d) : SLOT_NAME[d.slot] || ''].filter(Boolean).join(' · ');
  return `<div class="it" data-item="${esc(key)}">${icon(d)}<div class="t"><b>${esc(d.name)}</b><span>${esc(sub)}</span></div>${extra}</div>`;
}

// ---------- sayfalar ----------
const PAGES = {
  async ozet() {
    const s = await api('/api/admin/summary');
    const tot = s.classes.reduce((a, c) => a + c.n, 0) || 1;
    $('main').innerHTML = `
      <div class="grid stats">
        ${[['Şu an oyunda', s.online.length], ['Hesap', s.accounts], ['Karakter', s.characters], ['Bugün oynayan', s.activeToday], ['Son 7 günde yeni hesap', s.newAccounts], ['En yüksek seviye', s.topLevel], ['Toplam yang', fmt(s.totalYang)]]
          .map(([k, v]) => `<div class="card stat"><b>${v}</b><span>${k}</span></div>`).join('')}
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));margin-top:10px">
        <div class="card"><h3 style="margin-top:0">Oyundakiler</h3>${s.online.length ? `<table><tr><th>Ad</th><th>Sınıf</th><th>Sv.</th><th>Harita</th></tr>${s.online.map((o) => `<tr class="click" data-p="${esc(o.name)}"><td><span class="dot on"></span>${esc(o.name)}${o.gm ? ' <span class="pill r2">GM</span>' : ''}</td><td>${CLS[o.cls] || o.cls}</td><td>${o.level}</td><td class="muted">${esc(MAPS[o.map] ? MAPS[o.map].name : o.map)}</td></tr>`).join('')}</table>` : '<div class="muted">Şu an kimse oyunda değil.</div>'}</div>
        <div class="card"><h3 style="margin-top:0">En yüksek seviyeler</h3><table>${s.top.map((c, i) => `<tr class="click" data-p="${esc(c.name)}"><td class="muted">${i + 1}</td><td>${esc(c.name)}</td><td>${CLS[c.class] || c.class}</td><td>Sv. ${c.level}</td></tr>`).join('')}</table></div>
        <div class="card"><h3 style="margin-top:0">Sınıf dağılımı</h3>${s.classes.map((c) => `<div class="row" style="margin:8px 0"><span style="width:70px">${CLS[c.class] || c.class}</span><div class="bar"><div style="width:${100 * c.n / tot}%"></div></div><span class="muted" style="width:30px;text-align:right">${c.n}</span></div>`).join('')}</div>
      </div>`;
    bindPlayers();
  },

  async oyuncular(q = '') {
    const r = await api('/api/admin/players?q=' + encodeURIComponent(q));
    $('main').innerHTML = `
      <div class="row" style="margin-bottom:10px"><input class="in" id="pq" placeholder="Karakter ya da kullanıcı adı ara…" value="${esc(q)}" style="flex:1;min-width:180px"><button class="btn gold" id="pgo">Ara</button></div>
      <div class="card" style="padding:4px 10px;overflow-x:auto"><table>
        <tr><th>Karakter</th><th>Sınıf</th><th>Sv.</th><th>Yang</th><th>Hesap</th><th>Son giriş</th></tr>
        ${r.players.map((p) => `<tr class="click" data-p="${esc(p.name)}"><td><span class="dot ${p.online ? 'on' : ''}"></span>${esc(p.name)}</td><td>${CLS[p.class] || p.class}</td><td>${p.level}</td><td>${fmt(p.yang)}</td><td class="muted">${esc(p.username)}</td><td class="muted">${p.last_played ? new Date(p.last_played).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' }) : '-'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Karakter bulunamadı.</td></tr>'}
      </table></div>`;
    const go = () => PAGES.oyuncular($('pq').value.trim());
    $('pgo').onclick = go; $('pq').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    bindPlayers();
  },

  async esyalar() {
    let cat = 'silah', cls = '', q = '';
    $('main').innerHTML = `
      <div class="row" style="margin-bottom:8px"><input class="in" id="iq" placeholder="Eşya adı ya da anahtarı ara… (ör. katana, sword7)" style="flex:1;min-width:180px">
        <select class="in" id="icls" style="width:auto"><option value="">Bütün sınıflar</option>${Object.entries(CLS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="chips" id="icats">${CATS.map(([k, n]) => `<button data-c="${k}" class="${k === cat ? 'on' : ''}">${n}</button>`).join('')}</div>
      <div class="muted" id="icount" style="margin:6px 0 10px"></div>
      <div class="grid items" id="ilist"></div>`;
    const draw = () => {
      const f = CATS.find((c) => c[0] === cat)[2];
      const qq = q.toLocaleLowerCase('tr-TR');
      const keys = Object.keys(ITEMS).filter((k) => {
        const d = ITEMS[k];
        if (!f(d)) return false;
        if (cls && d.classes && !d.classes.includes(cls)) return false;
        if (cls && !d.classes && d.slot === 'weapon') return false;
        return !qq || k.toLowerCase().includes(qq) || String(d.name).toLocaleLowerCase('tr-TR').includes(qq) || String(d.model || '').includes(qq);
      }).sort((a, b) => SLOT_ORDER(ITEMS[a]) - SLOT_ORDER(ITEMS[b]) || (ITEMS[a].lv || 0) - (ITEMS[b].lv || 0) || (ITEMS[a].rarity || 0) - (ITEMS[b].rarity || 0) || a.localeCompare(b));
      $('icount').textContent = `${keys.length} eşya · 3D işaretli olanlar kullanıcının eklediği modeller`;
      $('ilist').innerHTML = keys.map((k) => itemCard(k)).join('');
    };
    $('icats').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; cat = b.dataset.c; $('icats').querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(); };
    $('icls').onchange = (e) => { cls = e.target.value; draw(); };
    $('iq').oninput = (e) => { q = e.target.value.trim(); draw(); };
    $('ilist').onclick = (e) => { const c = e.target.closest('[data-item]'); if (c) openItem(c.dataset.item); };
    draw();
  },

  async yaratiklar() {
    const byMap = MAPS.map((m) => ({ m, keys: [...new Set([...m.spawns.map((s) => s.mob), ...m.bosses])] })).filter((x) => x.keys.length);
    const placed = new Set(byMap.flatMap((x) => x.keys));
    const other = Object.keys(MOBS).filter((k) => !placed.has(k));
    const card = (k) => {
      const d = MOBS[k]; const model = d.style && d.style.model;
      const anim = model && MOB_MODELS[model] && MOB_MODELS[model].kind === 'skel';
      return `<div class="it" data-mob="${esc(k)}"><div class="ic" style="border-color:${esc(d.color)}">${d.boss ? '👑' : '🐾'}${model ? `<i>${anim ? 'ANİM' : '3D'}</i>` : ''}</div><div class="t"><b>${esc(d.name)}</b><span>Sv. ${d.lv} · ${fmt(d.hp)} can${d.boss ? ' · boss' : ''}</span></div></div>`;
    };
    $('main').innerHTML = `<div class="muted" style="margin-bottom:6px">${Object.keys(MOBS).length} yaratık. Dokununca 3D görünümü açılır; ANİM işaretliler kendi animasyonlarıyla hareket eder.</div>` +
      byMap.map(({ m, keys }) => `<h3>${esc(m.name)} <span class="muted" style="font-weight:400">· Sv. ${m.minLevel}+</span></h3><div class="grid items">${keys.map(card).join('')}</div>`).join('') +
      (other.length ? `<h3>Özel (zindan, dünya boss'u)</h3><div class="grid items">${other.map(card).join('')}</div>` : '');
    $('main').onclick = (e) => { const c = e.target.closest('[data-mob]'); if (c) openMob(c.dataset.mob); };
  },

  async haritalar() {
    $('main').innerHTML = `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${MAPS.map((m) => `
      <div class="card">
        <div class="row"><b style="font-size:15px">${m.id}. ${esc(m.name)}</b><span class="sp" style="flex:1"></span><span class="pill">Sv. ${m.minLevel}+</span>
          ${m.village ? '<span class="pill r1">köy</span>' : ''}${m.hidden ? '<span class="pill">gizli</span>' : ''}${m.safe ? '<span class="pill">güvenli</span>' : ''}${m.dungeon ? '<span class="pill boss">zindan</span>' : ''}${m.worldBoss ? '<span class="pill boss">dünya boss\'u</span>' : ''}</div>
        <div class="muted" style="margin:4px 0 8px;font-size:12px">Tema: ${esc(m.theme)} · ${m.stones} metin taşı</div>
        ${m.spawns.length ? `<div style="font-size:13px">${m.spawns.map((s) => `<span class="pill" style="margin:2px">${esc(MOBS[s.mob] ? MOBS[s.mob].name : s.mob)} ×${s.count}</span>`).join('')}</div>` : ''}
        ${m.bosses.length ? `<div style="font-size:13px;margin-top:4px">${[...new Set(m.bosses)].map((b) => `<span class="pill boss" style="margin:2px">👑 ${esc(MOBS[b] ? MOBS[b].name : b)}${m.bosses.filter((x) => x === b).length > 1 ? ' ×' + m.bosses.filter((x) => x === b).length : ''}</span>`).join('')}</div>` : ''}
      </div>`).join('')}</div>`;
  },

  async duyuru() {
    const s = await api('/api/admin/summary');
    $('main').innerHTML = `
      <div class="card"><h3 style="margin-top:0">Bütün oyunculara duyuru</h3>
        <textarea class="in" id="ann" rows="3" maxlength="200" placeholder="Ör. Bu akşam 21:00'de bakım yapılacak."></textarea>
        <div class="row" style="margin-top:8px"><button class="btn gold" id="annGo">Duyuruyu gönder</button><span class="muted">Ekranın ortasında yazı olarak çıkar.</span></div></div>
      <div class="card" style="margin-top:10px"><h3 style="margin-top:0">✨ Tecrübe (EXP) oranı</h3>
        <div style="margin-bottom:8px">Şu an: ${s.expRate && s.expRate.mul > 1 ? `<span class="pill r2">x${s.expRate.mul}${s.expRate.until ? ` · ${new Date(s.expRate.until).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' })}'e kadar` : ' · süresiz'}</span>` : '<span class="pill">x1 (normal)</span>'}</div>
        <div class="row" style="flex-wrap:wrap;gap:6px">${[1, 1.5, 2, 3, 5, 10].map((m) => `<button class="btn sm ${m === 1 ? '' : 'gold'}" data-rate="${m}">x${m}</button>`).join('')}</div>
        <div class="row" style="margin-top:8px;gap:6px;align-items:center">Oran <input class="in" id="rateMul" type="number" min="1" max="20" step="0.5" value="${s.expRate && s.expRate.mul > 1 ? s.expRate.mul : 2}" style="width:70px;padding:6px">
          Süre <input class="in" id="rateMin" type="number" min="0" max="43200" value="60" style="width:80px;padding:6px"> dk <button class="btn sm gold" id="rateGo">Uygula</button></div>
        <div class="muted" style="font-size:12px;margin-top:6px">Süre 0 ise oran sen kapatana kadar sürer. Canavar tecrübesine uygulanır; lonca, krallık ve Tecrübe Şöleni bonuslarıyla çarpılır. Oyunculara duyurulur, ekranda rozet çıkar.</div></div>
      <div class="card" style="margin-top:10px"><h3 style="margin-top:0">Etkinlikler</h3>
        <table>${s.events.map((e) => `<tr><td>${e.icon || ''} <b>${esc(e.name)}</b><div class="muted" style="font-size:12px">${esc(e.desc || '')}</div></td>
          <td>${e.active ? `<span class="pill r2">Sürüyor · ${new Date(e.ends).toLocaleTimeString('tr-TR', { timeStyle: 'short' })}'e kadar</span>` : '<span class="pill">kapalı</span>'}</td>
          <td style="white-space:nowrap">${e.active ? `<button class="btn sm red" data-ev="${e.key}" data-stop="1">Bitir</button>` : `<input class="in" style="width:64px;padding:6px" type="number" min="5" max="600" value="${(s.eventTypes[e.key] || {}).min || 30}" id="evm_${e.key}"> dk <button class="btn sm gold" data-ev="${e.key}">Başlat</button>`}</td></tr>`).join('')}</table></div>
      <div class="card" style="margin-top:10px"><h3 style="margin-top:0">Dünya boss'u (Kadim Lav Ejderi)</h3>
        <div class="row"><button class="btn gold" id="wbGo">Şimdi uyandır</button><button class="btn red" id="wbEnd">Bitir</button><span class="muted">Herkese duyurulur, Ejder Yuvası'nda doğar.</span></div></div>`;
    $('annGo').onclick = () => run('/api/admin/announce', { text: $('ann').value }, () => { $('ann').value = ''; });
    $('main').querySelectorAll('[data-ev]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.ev;
      run('/api/admin/event', { type: k, stop: !!b.dataset.stop, minutes: Number(($('evm_' + k) || {}).value) || 0 }, () => setTimeout(() => show('duyuru'), 300));
    }));
    const setRate = (mul, minutes) => run('/api/admin/exprate', { mul, minutes }, () => setTimeout(() => show('duyuru'), 300));
    $('main').querySelectorAll('[data-rate]').forEach((b) => (b.onclick = () => setRate(Number(b.dataset.rate), Number($('rateMin').value) || 0)));
    $('rateGo').onclick = () => setRate(Number($('rateMul').value), Number($('rateMin').value) || 0);
    $('wbGo').onclick = () => run('/api/admin/worldboss', { action: 'baslat' });
    $('wbEnd').onclick = () => run('/api/admin/worldboss', { action: 'bitir' });
  },
};
function bindPlayers() {
  $('main').querySelectorAll('[data-p]').forEach((r) => (r.onclick = () => openPlayer(r.dataset.p)));
}

// ---------- oyuncu ayrıntısı ----------
async function openPlayer(name) {
  let c;
  try { c = await api('/api/admin/player/' + encodeURIComponent(name)); } catch (e) { toast(e.message, true); return; }
  const eq = Object.entries(c.equip || {}).filter(([, v]) => v);
  const timed = Object.entries(c.timed || {}).filter(([, t]) => t > Date.now());
  const TN = { autohp: 'Oto kırmızı iksir', automp: 'Oto mavi iksir', expring: 'Tecrübe yüzüğü' };
  openModal(`
    <div class="mhead"><h2><span class="dot ${c.online ? 'on' : ''}"></span>${esc(c.name)}</h2><button class="btn sm" data-close>Kapat</button></div>
    <div class="kv">
      ${[['Sınıf', CLS[c.cls] || c.cls], ['Seviye', c.level], ['Yang', fmt(c.yang)], ['EP (hesap)', fmt(c.ep)], ['Hesap', c.username], ['Harita', MAPS[c.map] ? MAPS[c.map].name : c.map], ['Öldürme', fmt(c.kills)], ['Durum', c.online ? 'Oyunda' : 'Çevrimdışı']]
        .map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}
    </div>
    ${timed.length ? `<div class="row" style="margin-top:8px">${timed.map(([k, t]) => `<span class="pill r1">${TN[k] || k}: ${Math.ceil((t - Date.now()) / 3600e3)} saat</span>`).join('')}</div>` : ''}
    <h3>İşlemler</h3>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      <div class="row"><input class="in" id="aLv" type="number" min="1" max="120" value="${c.level}" style="width:90px"><button class="btn" id="bLv">Seviyeyi yap</button></div>
      <div class="row"><input class="in" id="aYang" type="number" min="0" value="${c.yang}" style="width:140px"><button class="btn" id="bYang">Yangı yap</button></div>
      <div class="row"><input class="in" id="aEp" type="number" value="100" style="width:90px"><button class="btn" id="bEp">EP ekle</button></div>
      ${c.online ? `<div class="row"><select class="in" id="aMap" style="width:150px">${MAPS.map((m) => `<option value="${m.id}" ${m.id === c.map ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select><button class="btn" id="bTp">Işınla</button></div>
      <div class="row"><button class="btn red" id="bKick">Oyundan at</button></div>` : ''}
    </div>
    <h3>Eşya ver</h3>
    <div class="row"><input class="in" id="gKey" list="itemList" placeholder="Eşya adı ya da anahtarı (ör. sword7)" style="flex:1;min-width:180px">
      <input class="in" id="gN" type="number" min="1" max="200" value="1" style="width:70px">
      <label class="muted" style="font-size:12px"><input type="checkbox" id="gMax" checked> en iyi efsun</label>
      <button class="btn gold" id="gGo">Ver</button></div>
    <datalist id="itemList">${Object.entries(ITEMS).map(([k, d]) => `<option value="${esc(k)}">${esc(d.name)}</option>`).join('')}</datalist>
    <h3>Kuşanılanlar</h3>
    <div class="grid inv">${eq.map(([slot, it]) => itemCard(it.key, `<span class="pill">${esc(SLOT_NAME[slot] || slot)}</span>`)).join('') || '<div class="muted">Yok.</div>'}</div>
    <h3>Çanta (${c.inventory.length}/${c.bag})</h3>
    <div class="grid inv">${c.inventory.map((it) => itemCard(it.key, `${it.n > 1 ? `<span class="pill">×${it.n}</span>` : ''}${it.plus ? `<span class="pill r2">+${it.plus}</span>` : ''}<button class="btn sm red x" data-del="${it.uid}">Sil</button>`)).join('') || '<div class="muted">Boş.</div>'}</div>
  `);
  const box = $('mbox');
  const again = () => openPlayer(c.name);
  $('bLv').onclick = () => run('/api/admin/level', { name: c.name, level: Number($('aLv').value) }, again);
  $('bYang').onclick = () => run('/api/admin/yang', { name: c.name, yang: Number($('aYang').value) }, again);
  $('bEp').onclick = () => run('/api/admin/ep', { name: c.name, amount: Number($('aEp').value) }, again);
  if ($('bTp')) $('bTp').onclick = () => run('/api/admin/teleport', { name: c.name, map: Number($('aMap').value) }, again);
  if ($('bKick')) $('bKick').onclick = () => { if (confirm(c.name + ' oyundan atılsın mı?')) run('/api/admin/kick', { name: c.name }, again); };
  $('gGo').onclick = () => {
    let key = $('gKey').value.trim();
    if (!ITEMS[key]) { const f = Object.keys(ITEMS).find((k) => ITEMS[k].name.toLocaleLowerCase('tr-TR') === key.toLocaleLowerCase('tr-TR')); if (f) key = f; }
    run('/api/admin/give', { name: c.name, key, n: Number($('gN').value) || 1, maxed: $('gMax').checked }, again);
  };
  box.querySelectorAll('[data-del]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation();
    if (confirm('Bu eşya silinsin mi?')) run('/api/admin/remove', { name: c.name, uid: Number(b.dataset.del) }, again);
  }));
  box.querySelectorAll('.it[data-item]').forEach((x) => { x.style.cursor = 'pointer'; x.onclick = () => openItem(x.dataset.item, c.name); });
}

// ---------- eşya ayrıntısı ----------
const STAT_NAMES = { atk: 'Saldırı', def: 'Savunma', hp: 'Can', mp: 'Mana', heal: 'Can doldurur', mana: 'Mana doldurur', price: 'Dükkân fiyatı', tier: 'Kademe', len: 'Boy (m)', speed: 'Hız' };
function openItem(key, forPlayer) {
  const d = ITEMS[key]; if (!d) return;
  const rows = [['Anahtar', key], ['Tür', d.slot === 'weapon' ? (d.type === 'sword' ? 'Kılıç' : d.type === 'dagger' ? 'Hançer' : d.type === 'bow' ? 'Yay' : 'Asa') : SLOT_NAME[d.slot] || d.slot || '-'], ['Seviye', d.lv || 1]];
  if (d.classes) rows.push(['Sınıflar', classNames(d)]);
  for (const [k, n] of Object.entries(STAT_NAMES)) if (d[k] != null && typeof d[k] !== 'object') rows.push([n, k === 'price' ? fmt(d[k]) : d[k]]);
  if (d.bonus) for (const [k, v] of Object.entries(d.bonus)) rows.push(['Bonus: ' + k, '+' + v]);
  if (d.model) rows.push(['Model', d.model + (ITEM_MODELS[d.model] ? '' : ' (yok)')]);
  if (d.stack) rows.push(['Yığın', d.stack]);
  rows.push(['Nadirlik', ['Sıradan', 'Nadir', 'Efsanevi', 'Destansı'][d.rarity || 0] || d.rarity]);
  openModal(`
    <div class="mhead">${icon(d)}<h2>${esc(d.name)}</h2><button class="btn sm" data-close>Kapat</button></div>
    ${has3D(d) ? '<div class="view" id="view"><div class="hint">Parmağınla çevir, iki parmakla yakınlaş</div></div>' : ''}
    ${d.desc ? `<div class="muted" style="margin-bottom:10px">${esc(d.desc)}</div>` : ''}
    <div class="kv">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
    <h3>Oyuncuya ver</h3>
    <div class="row"><input class="in" id="giveTo" placeholder="Karakter adı" value="${esc(forPlayer || '')}" style="flex:1;min-width:140px">
      ${d.stack ? '<input class="in" id="giveN" type="number" min="1" max="200" value="1" style="width:70px">' : ''}
      <button class="btn gold" id="giveGo">Ver</button></div>`);
  $('giveGo').onclick = () => run('/api/admin/give', { name: $('giveTo').value.trim(), key, n: d.stack ? Number($('giveN').value) || 1 : 1 });
  if (has3D(d)) viewer($('view'), () => itemObject(d, key));
}

// kodla çizilen silahlar (modeli olmayanlar için önizleme)
const std = (c, m = 0.6, r = 0.35, e) => new THREE.MeshStandardMaterial({ color: c, metalness: m, roughness: r, emissive: e || '#000', emissiveIntensity: e ? 0.5 : 0 });
function simpleWeapon(d) {
  const g = new THREE.Group(), glow = d.glow ? d.color : null;
  if (d.type === 'bow') {
    const len = d.len || 1.2;
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -len / 2, 0), new THREE.Vector3(0, 0, 0.28), new THREE.Vector3(0, len / 2, 0));
    g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.02, 6, false), std(d.color, 0.2, 0.6, glow)));
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, len, 3), std('#e8e2d0', 0, 0.8)));
    return g;
  }
  if (d.type === 'staff') {
    const len = d.len || 1.5;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.028, len, 8), std('#6b4a2e', 0, 0.8)); shaft.position.y = len / 2 - 0.35;
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.075, 1), std(d.color, 0, 0.2, d.color)); orb.position.y = len - 0.3;
    g.add(shaft, orb); return g;
  }
  const len = d.len || (d.type === 'dagger' ? 0.42 : 0.9);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, len, 0.012), std(d.color, 0.7, 0.3, glow)); blade.position.y = 0.06 + len / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.12, 4), std(d.color, 0.7, 0.3, glow)); tip.position.y = 0.12 + len; tip.scale.z = 0.3;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.035, 0.05), std('#6b5530', 0.5, 0.5)); guard.position.y = 0.04;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6), std('#3a2a1c', 0, 0.8)); handle.position.y = -0.05;
  g.add(blade, tip, guard, handle); return g;
}
function itemObject(d, key) {
  if (d.model && ITEM_MODELS[d.model]) return { obj: itemModel(d.model) };
  if (d.wing) { const w = buildWings(d.wing); return { obj: w, tick: (t) => w.userData.flap && w.userData.flap(t, false) }; }
  if (d.pet) { const v = buildPet(d); return { obj: v.root, tick: (t, dt) => v.update && v.update(t, false, 0, dt) }; }
  if (d.slot === 'weapon') return { obj: simpleWeapon(d) };
  if (d.slot === 'shoes') return { obj: bootsMesh(d) };
  if (d.slot === 'bracelet') return { obj: braceletMesh(d) };
  if (d.slot === 'earring') return { obj: earringMesh(d) };
  if (d.slot === 'necklace') return { obj: necklaceMesh(d) };
  if (d.slot === 'potion') return { obj: potionMesh(d) };
  if (d.slot === 'fish') return { obj: fishMesh(d) };
  if (d.slot === 'gem') return { obj: pearlMesh(d.color || '#fff') };
  return { obj: crystalMesh(d.color || '#8a7dff', true) };
}

// ---------- yaratık ayrıntısı (animasyonlu) ----------
function openMob(key) {
  const d = MOBS[key]; if (!d) return;
  const model = d.style && d.style.model; const spec = model && MOB_MODELS[model];
  const where = MAPS.filter((m) => m.spawns.some((s) => s.mob === key) || m.bosses.includes(key)).map((m) => m.name).join(', ') || 'Özel';
  const rows = [['Anahtar', key], ['Seviye', d.lv], ['Can', fmt(d.hp)], ['Saldırı', d.atk], ['Savunma', d.def], ['Tecrübe', fmt(d.exp)], ['Yang', (d.yang || []).map(fmt).join(' - ')], ['Hız', d.speed], ['Saldırganlık', d.aggro ? d.aggro + ' m' : 'uysal'], ['Nerede', where]];
  if (model) rows.push(['Model', model + (spec && spec.kind === 'skel' ? ' (iskeletli, animasyonlu)' : '')]);
  const drops = [...new Map((d.drops || []).map(([k, p]) => [k, p])).entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
  openModal(`
    <div class="mhead"><div class="ic" style="border-color:${esc(d.color)}">${d.boss ? '👑' : '🐾'}</div><h2>${esc(d.name)}</h2>${d.boss ? '<span class="pill boss">boss</span>' : ''}<button class="btn sm" data-close>Kapat</button></div>
    <div class="view" id="view"><div class="clips">
      <button class="btn sm" data-a="idle">Boşta</button><button class="btn sm" data-a="walk">Yürü</button><button class="btn sm" data-a="atk">Saldır</button>${spec && spec.kind === 'skel' ? '<button class="btn sm" data-a="hit">Darbe</button><button class="btn sm" data-a="die">Öl</button>' : ''}
    </div><div class="hint">Parmağınla çevir, iki parmakla yakınlaş</div></div>
    <div class="kv">${rows.map(([k, v]) => `<div><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</div>
    ${drops.length ? `<h3>Düşürdükleri (en yüksek şans)</h3><div class="grid inv">${drops.map(([k, p]) => itemCard(k, `<span class="pill">%${(p * 100).toFixed(1)}</span>`)).join('')}</div>` : ''}`);
  const state = { moving: false, atk: 0 };
  let v = null;
  const make = () => {
    v = buildMob({ ...d, boss: false }, null);
    return { obj: v.root, tick: (t, dt) => {
      if (state.atk > 0) state.atk = Math.max(0, state.atk - dt);
      const a = state.atk > 0 ? Math.sin((1 - state.atk / 0.4) * Math.PI) : 0;
      if (v.update) v.update(t, state.moving, a, dt);
    } };
  };
  const view = viewer($('view'), make, { ground: true });
  $('view').querySelectorAll('[data-a]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.a;
    if (a === 'idle') state.moving = false;
    if (a === 'walk') state.moving = true;
    if (a === 'atk') state.atk = 0.4;
    if (a === 'hit' && v.hit) { for (let i = 0; i < 5 && v.hit; i++) v.hit(); }
    if (a === 'die') { if (v.die && !v.die()) view.rebuild(); }
  }));
  $('mbox').querySelectorAll('.it[data-item]').forEach((x) => (x.onclick = () => openItem(x.dataset.item)));
}

// ---------- 3D görüntüleyici ----------
let active = null;
function viewer(el, build, opt = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  el.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#fff6e8', '#3a3328', 1.6));
  const key = new THREE.DirectionalLight('#fff1d6', 2.6); key.position.set(2, 4, 4); scene.add(key);
  const rim = new THREE.DirectionalLight('#9fc8ff', 1.4); rim.position.set(-3, 2, -3); scene.add(rim);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 500);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.autoRotate = true; controls.autoRotateSpeed = 1.6;
  controls.addEventListener('start', () => (controls.autoRotate = false));
  let cur = null, framed = false, t = 0;
  const holder = new THREE.Group(); scene.add(holder);
  if (opt.ground) {
    const g = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.35 }));
    g.rotation.x = -Math.PI / 2; g.userData.ground = true; scene.add(g);
  }
  function rebuild() {
    if (cur) holder.remove(cur.obj);
    cur = build(); holder.add(cur.obj); framed = false;
    const ready = []; cur.obj.traverse((o) => o.userData && o.userData.ready && ready.push(o.userData.ready));
    Promise.all(ready).then(() => setTimeout(() => (framed = false), 50));
    setTimeout(() => (framed = false), 900);   // yaratık modeli geç yüklenir: yeniden çerçevele
  }
  function frame() {
    holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(holder, true);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const r = Math.max(s.x, s.y, s.z) * 0.6 || 1;
    const dist = r / Math.tan(camera.fov * Math.PI / 360) * 1.25;
    controls.target.copy(c);
    camera.position.set(c.x + dist * 0.55, c.y + dist * 0.35, c.z + dist * 0.85);
    camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
    scene.children.forEach((o) => { if (o.userData.ground) { o.scale.setScalar(Math.max(s.x, s.z) * 0.8); o.position.y = box.min.y + 0.01; } });
    framed = true;
  }
  rebuild();
  let last = performance.now(), raf = 0;
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const w = el.clientWidth, h = el.clientHeight;
    if (renderer.domElement.width !== Math.round(w * renderer.getPixelRatio())) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    if (cur && cur.tick) cur.tick(t, dt);
    if (!framed) frame();
    controls.update();
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);
  active = { stop() { cancelAnimationFrame(raf); controls.dispose(); renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); } };
  return { rebuild };
}

// ---------- pencere ----------
function openModal(html) {
  if (active) { active.stop(); active = null; }
  $('mbox').innerHTML = html; $('modal').classList.remove('hide');
  $('mbox').querySelectorAll('[data-close]').forEach((b) => (b.onclick = closeModal));
}
function closeModal() {
  if (active) { active.stop(); active = null; }
  $('modal').classList.add('hide'); $('mbox').innerHTML = '';
}
$('modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

if (token) start(); else $('login').classList.remove('hide');
