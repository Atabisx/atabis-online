// Ekran akışı: giriş/kayıt → karakter seçimi/oluşturma → oyun
import { ready, startGame, modelLoaded } from './game.js';

const $ = (id) => document.getElementById(id);
const screens = ['authScreen', 'charScreen', 'createScreen'];
function show(id) {
  for (const s of screens) $(s).classList.toggle('show', s === id);
  document.body.classList.toggle('ingame', id === null);
}

// ---------- sunucu istekleri ----------
let token = null;
try { token = localStorage.getItem('atabis_token'); } catch (e) { /* yok */ }
function setToken(t) {
  token = t;
  try { t ? localStorage.setItem('atabis_token', t) : localStorage.removeItem('atabis_token'); } catch (e) { /* yok */ }
}
async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && url !== '/api/login') { setToken(null); show('authScreen'); }
  if (!res.ok) throw new Error(data.error || 'Bir hata oluştu.');
  return data;
}

// ---------- giriş / kayıt ----------
let registerMode = false;
function setMode(reg) {
  registerMode = reg;
  $('tabLogin').classList.toggle('on', !reg);
  $('tabRegister').classList.toggle('on', reg);
  $('password2wrap').style.display = reg ? 'flex' : 'none';
  $('password').autocomplete = reg ? 'new-password' : 'current-password';
  $('authBtn').textContent = reg ? 'Hesap oluştur' : 'Giriş yap';
  $('authMsg').textContent = '';
}
$('tabLogin').addEventListener('click', () => setMode(false));
$('tabRegister').addEventListener('click', () => setMode(true));
$('authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = $('username').value.trim(), password = $('password').value;
  if (registerMode && password !== $('password2').value) { $('authMsg').textContent = 'Şifreler aynı değil.'; return; }
  $('authBtn').disabled = true;
  $('authMsg').textContent = '';
  try {
    const data = await api('POST', registerMode ? '/api/register' : '/api/login', { username, password });
    setToken(data.token);
    $('password').value = $('password2').value = '';
    await openCharacters();
  } catch (err) {
    $('authMsg').textContent = err.message;
  } finally { $('authBtn').disabled = false; }
});

// ---------- karakter seçimi ----------
let CLASSES = {};
let characters = [];
let selectedChar = null;
const classesReady = fetch('/shared/classes.json').then((r) => r.json()).then((j) => { CLASSES = j; });

async function openCharacters() {
  await classesReady;
  const data = await api('GET', '/api/characters');
  characters = data.characters;
  $('accountName').textContent = `Hesap: ${data.username}`;
  if (!characters.find((c) => c.id === selectedChar)) selectedChar = characters[0] ? characters[0].id : null;
  renderCharacters();
  show('charScreen');
}
function renderCharacters() {
  const list = $('charList');
  list.innerHTML = '';
  for (const c of characters) {
    const b = document.createElement('button');
    b.className = 'charcard' + (c.id === selectedChar ? ' sel' : '');
    const cl = CLASSES[c.class] || {};
    b.innerHTML = `<i style="width:28px;height:6px;border-radius:3px;background:${cl.color || '#888'}"></i><b></b><span></span>`;
    b.querySelector('b').textContent = c.name;
    b.querySelector('span').textContent = `${cl.name || c.class} · Sv. ${c.level}`;
    b.addEventListener('click', () => { selectedChar = c.id; renderCharacters(); });
    b.addEventListener('dblclick', () => { selectedChar = c.id; enterGame(); });
    list.appendChild(b);
  }
  if (characters.length < 4) {
    const n = document.createElement('button');
    n.className = 'charcard new';
    n.textContent = '+ Yeni karakter';
    n.addEventListener('click', openCreate);
    list.appendChild(n);
  }
  $('playBtn').disabled = !selectedChar;
  $('deleteBtn').disabled = !selectedChar;
  $('charMsg').textContent = characters.length ? '' : 'Henüz karakterin yok. Yeni bir karakter oluştur.';
}
$('playBtn').addEventListener('click', () => enterGame());
let deleteArmed = false;
$('deleteBtn').addEventListener('click', async () => {
  const c = characters.find((x) => x.id === selectedChar); if (!c) return;
  if (!deleteArmed) {
    deleteArmed = true;
    $('deleteBtn').textContent = `${c.name} silinsin mi? Tekrar bas`;
    setTimeout(() => { deleteArmed = false; $('deleteBtn').textContent = 'Seçili karakteri sil'; }, 4000);
    return;
  }
  deleteArmed = false;
  $('deleteBtn').textContent = 'Seçili karakteri sil';
  try { await api('DELETE', `/api/characters/${c.id}`); selectedChar = null; await openCharacters(); }
  catch (err) { $('charMsg').textContent = err.message; }
});
$('logoutBtn').addEventListener('click', async () => {
  await api('POST', '/api/logout').catch(() => {});
  setToken(null);
  show('authScreen');
});

// ---------- karakter oluşturma ----------
let chosenClass = 'savasci';
function openCreate() {
  const list = $('classList');
  list.innerHTML = '';
  for (const [key, c] of Object.entries(CLASSES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'classbtn' + (key === chosenClass ? ' sel' : '');
    b.innerHTML = `<i style="background:${c.color}"></i><b></b>`;
    b.querySelector('b').textContent = c.name;
    b.addEventListener('click', () => { chosenClass = key; openCreate(); });
    list.appendChild(b);
  }
  $('classdesc').textContent = CLASSES[chosenClass] ? CLASSES[chosenClass].desc : '';
  $('createMsg').textContent = '';
  show('createScreen');
}
$('createBack').addEventListener('click', () => show('charScreen'));
$('createForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const data = await api('POST', '/api/characters', { name: $('charName').value.trim(), cls: chosenClass });
    $('charName').value = '';
    selectedChar = data.character.id;
    await openCharacters();
  } catch (err) { $('createMsg').textContent = err.message; }
});

// ---------- oyuna giriş ----------
let started = false;
async function enterGame() {
  if (!selectedChar || started) return;
  $('playBtn').disabled = true;
  $('charMsg').textContent = 'Oyun yükleniyor…';
  await ready;
  if (!modelLoaded()) console.warn('Karakter modeli yüklenemedi; basit karakter kullanılacak.');
  const socket = io({ auth: { token, characterId: selectedChar }, reconnection: true });
  socket.on('connect_error', (err) => {
    $('charMsg').textContent = err.message === 'auth' ? 'Oturum süresi doldu, tekrar giriş yap.' : 'Sunucuya bağlanılamadı.';
    $('playBtn').disabled = false;
    socket.close();
    if (err.message === 'auth') { setToken(null); show('authScreen'); }
  });
  startGame(socket, {
    onWelcome: () => {
      started = true;
      show(null);
      if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    },
    onKicked: (msg) => { alert(msg); location.reload(); },
  });
}

// ---------- açılış ----------
(async () => {
  if (token) {
    try { await openCharacters(); return; } catch (e) { /* oturum geçersiz */ }
  }
  setMode(false);
  show('authScreen');
})();
