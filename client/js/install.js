// Telefona yükleme (PWA) ve tam ekran.
// Not: tarayıcılar gerçek uygulama kurulumunu (ve servis çalışanını) sadece HTTPS adreslerinde açar.
// HTTP'de "Ana ekrana ekle" yine çalışır ama oyun tarayıcı sekmesi gibi açılır.
const isStandalone = () => window.matchMedia('(display-mode: fullscreen)').matches || window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
if (isStandalone()) document.body.classList.add('standalone');

if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('Servis çalışanı kaydedilemedi', e));
}

let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
window.addEventListener('appinstalled', () => { deferred = null; const b = document.getElementById('installBtn'); if (b) b.style.display = 'none'; });

const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
const btn = document.getElementById('installBtn');
const help = document.getElementById('installHelp');
if (btn) {
  if (isStandalone()) btn.style.display = 'none';
  btn.addEventListener('click', async () => {
    if (deferred) {
      deferred.prompt();
      try { await deferred.userChoice; } catch (e) { /* yok say */ }
      deferred = null;
      return;
    }
    const secure = window.isSecureContext;
    document.getElementById('installText').innerHTML = ios
      ? `<b>iPhone / iPad (Safari):</b><ol><li>Alttaki <b>Paylaş</b> düğmesine dokun (kare ve yukarı ok).</li><li><b>Ana Ekrana Ekle</b>'yi seç.</li><li>Sağ üstte <b>Ekle</b>'ye dokun.</li></ol>`
      : `<b>Android (Chrome):</b><ol><li>Sağ üstteki <b>⋮</b> menüsünü aç.</li><li><b>Uygulamayı yükle</b> ya da <b>Ana ekrana ekle</b>'ye dokun.</li><li><b>Yükle / Ekle</b> ile onayla.</li></ol>` +
        (secure ? '' : `<div class="warn">Bu adres HTTPS değil. Simge ana ekrana eklenir ama oyun tam uygulama gibi değil, tarayıcı içinde açılır. Tam uygulama için sunucuya bir alan adı ve HTTPS gerekir.</div>`);
    help.classList.add('open');
  });
}
const closeBtn = document.getElementById('installClose');
if (closeBtn) closeBtn.addEventListener('click', () => help.classList.remove('open'));

// oyun içi tam ekran düğmesi: tam ekran + yatay kilit
const fs = document.getElementById('fsBtn');
if (fs) fs.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement);
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } else await document.exitFullscreen();
  } catch (e) { /* bazı tarayıcılar desteklemez */ }
});
