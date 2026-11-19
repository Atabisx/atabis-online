// Topluluk arayüzü: ana menü, grup çerçeveleri, günlük görevler, giriş ödülü.
// game.js setup(ctx) ile gerekli yardımcıları verir, her bağlantıda bind(socket) çağırır.
let C = null, socket = null;
let party = null, daily = null;
const $ = (id) => document.getElementById(id);

const CLS_COLORS = { savasci: '#e0675a', ninja: '#7be08f', sura: '#b48cff', saman: '#7fb3ff', okcu: '#ffd36b' };

export function setup(ctx) {
  C = ctx;
  // ---------- ana menü ----------
  $('menuBtn').addEventListener('click', () => { C.sfx.click(); openMenu(); });
  $('menuwin').addEventListener('click', (e) => {
    if (e.target.id === 'menuwin' || e.target.closest('#menuX')) { $('menuwin').classList.remove('open'); return; }
    const b = e.target.closest('[data-menu]'); if (!b) return;
    $('menuwin').classList.remove('open'); C.sfx.click();
    const act = b.dataset.menu;
    if (act === 'daily') openDaily();
    else if (C.menuAction) C.menuAction(act);
  });
  // ---------- görevler ----------
  $('dailyX').addEventListener('click', () => $('dailywin').classList.remove('open'));
  $('dailywin').addEventListener('click', (e) => {
    if (e.target.id === 'dailywin') { $('dailywin').classList.remove('open'); return; }
    const b = e.target.closest('[data-claim]'); if (b && socket) { socket.emit('dailyClaim', Number(b.dataset.claim)); C.sfx.click(); }
    if (e.target.closest('#loginClaim') && socket) socket.emit('loginClaim');
  });
  $('rewardOk').addEventListener('click', () => $('rewardwin').classList.remove('open'));
  // ---------- grup çerçeveleri ----------
  $('partyFrames').addEventListener('click', (e) => {
    const row = e.target.closest('[data-pid]'); if (!row || !party) return;
    const id = row.dataset.pid, me = C.myId();
    if (id === me) { C.askBox('Gruptan ayrılmak istiyor musun?', (ok) => ok && socket && socket.emit('partyLeave'), 'Ayrıl', 'Vazgeç', true); return; }
    if (party.leader === me) {
      const m = party.members.find((x) => x.id === id);
      if (m) C.askBox(`${m.name} gruptan atılsın mı?`, (ok) => ok && socket && socket.emit('partyKick', id), 'At', 'Vazgeç', true);
    }
  });
}

function openMenu() { renderMenuBadges(); $('menuwin').classList.add('open'); }
function renderMenuBadges() {
  const n = daily ? daily.list.filter((q) => q.have >= q.need && !q.claimed).length : 0;
  const b = document.querySelector('[data-menu="daily"] i'); if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
  const mb = $('menuBadge'); if (mb) { mb.style.display = n ? '' : 'none'; mb.textContent = n; }
}

export function bind(sock) {
  socket = sock;
  socket.on('party', (v) => { party = v; renderParty(); C.onParty && C.onParty(party); });
  socket.on('partyAsk', ({ name, level }) => C.askBox(`${name} (Sv. ${level}) seni grubuna davet ediyor.`, (ok) => socket.emit('partyAnswer', { ok })));
  socket.on('daily', (d) => { daily = d; renderDaily(); renderMenuBadges(); });
  socket.on('dailyDone', () => { C.sfx.levelUp && C.sfx.levelUp(); });
  socket.on('loginReward', (r) => showLoginReward(r));
}
export const getParty = () => party;
export const inParty = (id) => !!(party && party.members.some((m) => m.id === id));

// ---------- grup ----------
function renderParty() {
  const el = $('partyFrames');
  if (!party) { el.innerHTML = ''; el.style.display = 'none'; return; }
  const me = C.myId();
  el.style.display = '';
  el.innerHTML = party.members.filter((m) => m.id !== me).map((m) => {
    const hp = m.maxHp ? Math.max(0, Math.min(100, 100 * m.hp / m.maxHp)) : 0, mp = m.maxMp ? Math.max(0, Math.min(100, 100 * m.mp / m.maxMp)) : 0;
    return `<button class="pf${m.dead ? ' dead' : ''}" data-pid="${C.esc(m.id)}" aria-label="${C.esc(m.name)}">
      <span class="pfn"><b style="color:${CLS_COLORS[m.cls] || '#fff'}">${party.leader === m.id ? '★ ' : ''}${C.esc(m.name)}</b><small>Sv. ${m.level}</small></span>
      <span class="pfb"><i style="width:${hp}%"></i></span><span class="pfb mp"><i style="width:${mp}%"></i></span></button>`;
  }).join('') + `<button class="pf me" data-pid="${C.esc(me)}">${party.leader === me ? '★ Grup lideri' : 'Grup'} · ayrıl</button>`;
}

// ---------- günlük görevler ----------
function openDaily() { if (socket) socket.emit('dailyGet'); renderDaily(); $('dailywin').classList.add('open'); }
function rewardText(q) {
  const parts = [`${q.exp.toLocaleString('tr-TR')} tecrübe`, `${q.yang.toLocaleString('tr-TR')} yang`];
  for (const [k, n] of q.items) parts.push(`${(C.ITEMS[k] || {}).name || k}${n > 1 ? ' x' + n : ''}`);
  return parts.join(' · ');
}
function renderDaily() {
  if (!daily) return;
  $('dailyList').innerHTML = daily.list.map((q, i) => {
    const pct = Math.round(100 * q.have / q.need), done = q.have >= q.need;
    return `<div class="dq${done ? ' done' : ''}${q.claimed ? ' claimed' : ''}">
      <div class="dqh"><b>${C.esc(q.name)}</b><span>${q.have}/${q.need}</span></div>
      <div class="dqt">${C.esc(q.text)}</div>
      <div class="dqbar"><i style="width:${pct}%"></i></div>
      <div class="dqr"><small>Ödül: ${C.esc(rewardText(q))}</small>
      ${q.claimed ? '<span class="dqok">✔ Alındı</span>' : done ? `<button class="btn" data-claim="${i}">Ödülü al</button>` : ''}</div></div>`;
  }).join('');
  const s = daily.streak || 0, cur = ((Math.max(1, s) - 1) % 7) + 1;
  $('loginDays').innerHTML = [1, 2, 3, 4, 5, 6, 7].map((d) => `<span class="ld${daily.claimedToday && d <= cur ? ' got' : d < cur ? ' got' : ''}${d === cur && daily.claimedToday ? ' today' : ''}">${d}. gün${d === 7 ? '<br>★' : ''}</span>`).join('');
  $('loginInfo').innerHTML = daily.claimedToday ? `Bugünün ödülü alındı. Seri: <b>${s} gün</b>. Yarın tekrar gel!` :
    'Bugünkü giriş ödülün bekliyor. <button id="loginClaim" class="btn alt">Al</button>';
}
function showLoginReward(r) {
  $('rewardTitle').textContent = `${r.day}. GÜN GİRİŞ ÖDÜLÜ`;
  $('rewardItems').innerHTML = `<div class="rwi"><b>${r.yang.toLocaleString('tr-TR')}</b><small>Yang</small></div>` +
    r.items.map((it) => { const d = C.ITEMS[it.key]; return `<div class="rwi">${C.itemIcon(it.key, d, 30)}<small>${C.esc(d ? d.name : it.key)}${it.n > 1 ? ' x' + it.n : ''}</small></div>`; }).join('');
  $('rewardSub').textContent = r.streak >= 7 ? `${r.streak} gündür aralıksız geliyorsun!` : `Her gün gir, 7. gün büyük ödül seni bekliyor (seri: ${r.streak}).`;
  $('rewardwin').classList.add('open');
  C.sfx.levelUp && C.sfx.levelUp();
}
