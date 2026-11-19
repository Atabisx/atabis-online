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
  setupGuild();
  $('empirePick').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emp]'); if (!b || !socket) return;
    const k = Number(b.dataset.emp);
    C.askBox(`${EMPIRES[k].name} krallığına katılmak istiyor musun? Sonradan değiştirilemez.`, (ok) => { if (ok) { socket.emit('chooseEmpire', k); $('empirewin').classList.remove('open'); } }, 'Katıl', 'Vazgeç');
  });
  $('eventX').addEventListener('click', () => $('eventwin').classList.remove('open'));
  $('eventwin').addEventListener('click', (e) => { if (e.target.id === 'eventwin') $('eventwin').classList.remove('open'); });
  $('warJoin').addEventListener('click', () => { if (socket) socket.emit('warJoin'); $('eventwin').classList.remove('open'); $('menuwin').classList.remove('open'); });
  setInterval(() => { renderWarHud(); if ($('eventwin').classList.contains('open')) renderEvents(); }, 5000);
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

// ---------- krallık ve etkinlikler ----------
export const EMPIRES = { 1: { name: 'Kızıl Ejder', color: '#e0453a' }, 2: { name: 'Altın Kartal', color: '#e8b54a' }, 3: { name: 'Gök Kurt', color: '#3d8fe0' } };
let war = null, events = null;
export const warState = () => war;
export function askEmpire() {
  $('empirePick').innerHTML = Object.entries(EMPIRES).map(([k, e]) => `<button data-emp="${k}" style="color:${e.color}"><i style="background:${e.color}"></i><span style="color:#f4f1e8">${e.name}</span><small>${C.esc(EMP_TEXT[k])}</small></button>`).join('');
  $('empirewin').classList.add('open');
}
const EMP_TEXT = { 1: 'Ateşin ve cesaretin krallığı', 2: 'Bilgeliğin ve zenginliğin krallığı', 3: 'Göklerin ve bozkırın krallığı' };
export function openEvents() { if (socket) { socket.emit('warGet'); socket.emit('eventsGet'); } renderEvents(); $('eventwin').classList.add('open'); }
const fmtLeft = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m >= 60 * 24 ? `${Math.floor(m / 1440)} gün ${Math.floor((m % 1440) / 60)} sa` : m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`; };
function renderEvents() {
  if (war) {
    const now = Date.now();
    document.querySelector('.evcard.war').classList.toggle('on', war.active);
    $('warStatus').innerHTML = war.active ? `<b style="color:#ff6a3d">SÜRÜYOR</b> · ${fmtLeft(war.ends - now)} kaldı` : war.next ? `Sonraki: ${fmtLeft(war.next - now)} sonra` : '';
    $('warScore').innerHTML = [1, 2, 3].map((e) => `<div style="color:${EMPIRES[e].color}${war.winner === e ? ';box-shadow:0 0 0 2px ' + EMPIRES[e].color : ''}"><b>${war.score[e] || 0}</b>${EMPIRES[e].name}${war.winner === e ? '<br><small>+%20 tecrübe</small>' : ''}</div>`).join('');
    $('warJoin').style.display = war.active ? '' : 'none';
  }
  $('eventList').innerHTML = (events || []).map((e) => `<div class="evcard${e.active ? ' on' : ''}"><div class="evh"><b>${C.esc(e.icon + ' ' + e.name)}</b><span>${e.active ? `<b style="color:#ff6a3d">SÜRÜYOR</b> · ${fmtLeft(e.ends - Date.now())} kaldı` : e.next ? `Sonraki: ${fmtLeft(e.next - Date.now())} sonra` : ''}</span></div><small class="gtxt">${C.esc(e.desc)}</small></div>`).join('');
}
function renderWarHud() {
  const el = $('warHud');
  if (!war || !war.active || !C.inWarMap()) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = [1, 2, 3].map((e) => `<span style="color:${EMPIRES[e].color}">${war.score[e] || 0}</span>`).join('<small>·</small>') + `<small>${fmtLeft(war.ends - Date.now())}</small>`;
}
export function refreshWar() { renderWarHud(); }

// ---------- lonca ----------
let guild = null, gTab = 'members';
export const getGuild = () => guild;
export function openGuild() { if (socket) socket.emit('guildGet'); renderGuild(); $('guildwin').classList.add('open'); }
function setupGuild() {
  $('guildX').addEventListener('click', () => $('guildwin').classList.remove('open'));
  $('guildwin').addEventListener('click', (e) => { if (e.target.id === 'guildwin') $('guildwin').classList.remove('open'); });
  $('gCreate').addEventListener('click', () => { const n = $('gName').value.trim(); if (n && socket) socket.emit('guildCreate', { name: n }); });
  document.querySelector('.gtabs').addEventListener('click', (e) => { const b = e.target.closest('[data-gt]'); if (!b) return; gTab = b.dataset.gt; C.sfx.click(); renderGuild(); });
  $('gtMembers').addEventListener('click', (e) => {
    const b = e.target.closest('[data-ga]'); if (!b || !socket || !guild) return;
    const id = Number(b.dataset.id), m = guild.members.find((x) => x.charId === id); if (!m) return;
    if (b.dataset.ga === 'kick') C.askBox(`${m.name} loncadan çıkarılsın mı?`, (ok) => ok && socket.emit('guildKick', id), 'Çıkar', 'Vazgeç', true);
    if (b.dataset.ga === 'rank') socket.emit('guildRank', { charId: id });
    if (b.dataset.ga === 'lead') C.askBox(`Liderliği ${m.name} oyuncusuna devretmek istiyor musun?`, (ok) => ok && socket.emit('guildRank', { charId: id, rank: 'lead' }), 'Devret', 'Vazgeç', true);
  });
  $('gStore').addEventListener('click', (e) => { const b = e.target.closest('[data-uid]'); if (b && socket) { socket.emit('guildWithdraw', Number(b.dataset.uid)); C.sfx.click(); } });
  $('gInv').addEventListener('click', (e) => { const b = e.target.closest('[data-uid]'); if (b && socket) { socket.emit('guildDeposit', Number(b.dataset.uid)); C.sfx.click(); } });
  $('gYangIn').addEventListener('click', () => socket && socket.emit('guildYang', { dir: 'in', n: Number($('gYangN').value) || 0 }));
  $('gYangOut').addEventListener('click', () => socket && socket.emit('guildYang', { dir: 'out', n: Number($('gYangN').value) || 0 }));
  $('gNoticeSet').addEventListener('click', () => socket && socket.emit('guildNotice', $('gNoticeIn').value));
  $('gLeave').addEventListener('click', () => C.askBox('Loncadan ayrılmak istiyor musun?', (ok) => ok && socket.emit('guildLeave'), 'Ayrıl', 'Vazgeç', true));
  $('gDisband').addEventListener('click', () => C.askBox('Lonca tamamen dağıtılsın mı? Depodaki eşyalar ve kasa sana kalır.', (ok) => ok && socket.emit('guildDisband'), 'Dağıt', 'Vazgeç', true));
}
const CLS_NAMES = { savasci: 'Savaşçı', ninja: 'Ninja', sura: 'Sura', saman: 'Şaman', okcu: 'Okçu' };
function slotHtml(it) {
  const d = C.ITEMS[it.key] || { name: '?', rarity: 0 };
  return `<button class="slot" data-uid="${it.uid}" aria-label="${C.esc(d.name)}" title="${C.esc(d.name + (it.by ? ' · ' + it.by : ''))}">${C.itemIcon(it.key, d)}${it.n > 1 ? `<i class="cnt">${it.n}</i>` : ''}${it.up ? `<i class="upb">+${it.up}</i>` : ''}</button>`;
}
function renderGuild() {
  $('gNone').style.display = guild ? 'none' : '';
  $('gHas').style.display = guild ? '' : 'none';
  if (!guild) { $('gTitle').textContent = 'LONCA'; $('gSub').textContent = ''; return; }
  const g = guild, mine = g.myRank;
  $('gTitle').textContent = g.name.toLocaleUpperCase('tr-TR');
  $('gSub').textContent = g.ranks[mine] || '';
  $('gLv').textContent = g.level; $('gCnt').textContent = `${g.members.length}/${g.cap}`; $('gBonus').textContent = `+%${g.bonus}`;
  $('gYang').textContent = g.yang.toLocaleString('tr-TR');
  $('gExp').style.width = (g.level >= g.maxLevel ? 100 : Math.min(100, 100 * g.exp / g.need)) + '%';
  $('gNotice').textContent = g.notice || '';
  for (const b of document.querySelectorAll('.gtabs [data-gt]')) b.classList.toggle('on', b.dataset.gt === gTab);
  $('gtMembers').style.display = gTab === 'members' ? '' : 'none';
  $('gtStore').style.display = gTab === 'store' ? '' : 'none';
  $('gtManage').style.display = gTab === 'manage' ? '' : 'none';
  $('gtMembers').innerHTML = g.members.map((m) => `<div class="gmem${m.online ? ' on' : ''}"><span class="dot"></span>
      <span class="nm"><b>${C.esc(m.name)}</b> <span class="rk">${m.rank ? g.ranks[m.rank] : ''}</span><small>${CLS_NAMES[m.cls] || ''} · Sv. ${m.level}${m.online && m.map ? ' · ' + C.esc(m.map) : m.online ? '' : ' · çevrimdışı'}</small></span>
      ${mine === 2 && m.rank < 2 ? `<button data-ga="rank" data-id="${m.charId}">${m.rank ? 'Üye yap' : 'Subay yap'}</button><button data-ga="lead" data-id="${m.charId}">Lider yap</button>` : ''}
      ${mine >= 1 && m.rank < mine ? `<button data-ga="kick" data-id="${m.charId}">Çıkar</button>` : ''}</div>`).join('');
  $('gStore').innerHTML = g.storage.map(slotHtml).join('') + `<small style="grid-column:1/-1;color:#8b877c">${g.storage.length}/${g.storeCap} yuva</small>`;
  $('gInv').innerHTML = (C.inventory() || []).map(slotHtml).join('');
  $('gDisband').style.display = mine === 2 ? '' : 'none';
  $('gNoticeIn').disabled = $('gNoticeSet').disabled = mine < 1;
  if (document.activeElement !== $('gNoticeIn')) $('gNoticeIn').value = g.notice || '';
}
export function refreshGuild() { if ($('guildwin').classList.contains('open')) renderGuild(); }

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
  socket.on('guild', (g) => { guild = g; renderGuild(); });
  socket.on('warState', (w) => { war = w; renderEvents(); renderWarHud(); C.onWar && C.onWar(w); });
  socket.on('events', (list) => { events = list; renderEvents(); });
  socket.on('empire', (n) => C.onEmpire && C.onEmpire(n));
  socket.on('guildAsk', ({ name, from }) => C.askBox(`${from} seni "${name}" loncasına davet ediyor.`, (ok) => socket.emit('guildAnswer', { ok })));
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
