// Ayarlar penceresi: ses, müzik, arayüz boyutu, kamera, grafik, tam ekran, karakter değiştir, çıkış.
// Seçimler bu cihazda saklanır.
const $ = (id) => document.getElementById(id);
let C = null;
const KEY = 'atabis_settings';
let st = { ui: 100, cam: 100, gfx: 1 };
try { st = { ...st, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { /* yok say */ }
const saveSt = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { /* yok say */ } };

// arayüz boyutu: oyun içi düğmeler ve pencereler birlikte büyür/küçülür
function applyUi() {
  const z = st.ui / 100;
  document.documentElement.style.setProperty('--uiz', z);
  for (const el of document.querySelectorAll('#hud, .modal')) el.style.zoom = z;
}
function applyGfx() { if (C && C.setQuality) C.setQuality(st.gfx); }

export function setup(ctx) {
  C = ctx;
  applyUi(); applyGfx();
  if (C.setCamZoom) C.setCamZoom(st.cam / 100);
  const open = () => { refresh(); $('setwin').classList.add('open'); };
  $('setBtn').addEventListener('click', () => { C.sfx.click(); open(); });
  $('setX').addEventListener('click', () => $('setwin').classList.remove('open'));
  $('setwin').addEventListener('click', (e) => { if (e.target.id === 'setwin') $('setwin').classList.remove('open'); });
  $('setSfx').addEventListener('input', (e) => { const v = C.sfx.volumes(); C.sfx.setVolumes(e.target.value / 100 * 0.8, v.m); C.sfx.setMuted(false); refresh(); });
  $('setSfx').addEventListener('change', () => C.sfx.click());
  $('setMusic').addEventListener('input', (e) => { const v = C.sfx.volumes(); const m = e.target.value / 100 * 0.7; C.sfx.setVolumes(v.s, m); C.sfx.setMusicOn(m > 0); refresh(); });
  $('setUi').addEventListener('input', (e) => { st.ui = Number(e.target.value); applyUi(); saveSt(); refresh(); });
  $('setCam').addEventListener('input', (e) => { st.cam = Number(e.target.value); if (C.setCamZoom) C.setCamZoom(st.cam / 100); saveSt(); refresh(); });
  $('setGfx').addEventListener('click', (e) => { const b = e.target.closest('[data-g]'); if (!b) return; st.gfx = Number(b.dataset.g); applyGfx(); saveSt(); refresh(); });
  $('setFs').addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement);
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      } else await document.exitFullscreen();
    } catch (e) { C.toast('Bu tarayıcı tam ekranı desteklemiyor.'); }
  });
  $('setChar').addEventListener('click', () => C.askBox('Karakter seçme ekranına dönülsün mü?', (ok) => { if (!ok) return; C.leave(); location.reload(); }, 'Dön', 'Vazgeç'));
  $('setQuit').addEventListener('click', () => C.askBox('Hesaptan çıkış yapılsın mı?', async (ok) => {
    if (!ok) return;
    let token = null; try { token = localStorage.getItem('atabis_token'); } catch (e) { /* yok */ }
    C.leave();
    try { await fetch('/api/logout', { method: 'POST', headers: token ? { authorization: 'Bearer ' + token } : {} }); } catch (e) { /* yok say */ }
    try { localStorage.removeItem('atabis_token'); } catch (e) { /* yok */ }
    location.reload();
  }, 'Çıkış yap', 'Vazgeç', true));
  // uygulamanın içindeyken indirme düğmesi gerekmez
  if (/AtabisApp/i.test(navigator.userAgent) || window.Capacitor || document.body.classList.contains('standalone')) $('setApk').style.display = 'none';
}
function refresh() {
  const v = C.sfx.volumes();
  const sfx = Math.round(v.s / 0.8 * 100 / 5) * 5, mus = C.sfx.isMusicOn() ? Math.round(v.m / 0.7 * 100 / 5) * 5 : 0;
  $('setSfx').value = sfx; $('setSfxV').textContent = sfx + '%';
  $('setMusic').value = mus; $('setMusicV').textContent = mus ? mus + '%' : 'Kapalı';
  $('setUi').value = st.ui; $('setUiV').textContent = st.ui + '%';
  $('setCam').value = st.cam; $('setCamV').textContent = st.cam + '%';
  for (const b of document.querySelectorAll('#setGfx [data-g]')) b.classList.toggle('on', Number(b.dataset.g) === st.gfx);
  $('setOnline').textContent = `Çevrimiçi: ${document.getElementById('count').textContent}`;
}
export function refreshUi() { applyUi(); }
