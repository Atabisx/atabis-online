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
    const mb = e.target.closest('[data-mclaim]'); if (mb && socket) { socket.emit('mainClaim', mb.dataset.mclaim); C.sfx.click(); }
    if (e.target.closest('#loginClaim') && socket) socket.emit('loginClaim');
  });
  $('rewardOk').addEventListener('click', () => $('rewardwin').classList.remove('open'));
  $('wbJoinBtn').addEventListener('click', () => { if (socket) socket.emit('wbJoin'); $('eventwin').classList.remove('open'); C.sfx.click(); });
  $('wbLeave').addEventListener('click', () => { if (socket) socket.emit('wbLeave'); C.sfx.click(); });
  setInterval(() => { if (wbs && wbs.active) { renderWbHud(); if ($('eventwin').classList.contains('open')) renderWb(); } }, 1000);
  setupGuild();
  setupStalls();
  setupDungeon();
  $('helpX').addEventListener('click', () => $('helpwin').classList.remove('open'));
  $('helpwin').addEventListener('click', (e) => { if (e.target.id === 'helpwin') $('helpwin').classList.remove('open'); });
  $('tutRestart').addEventListener('click', () => { $('helpwin').classList.remove('open'); startTutorial(0); });
  $('tutSkip').addEventListener('click', () => { tutStep = -1; showTut(); if (socket) socket.emit('tutorial', 'done'); });
  setInterval(tickTut, 400);
  setInterval(renderMenuBadges, 1500);
  $('rankX').addEventListener('click', () => $('rankwin').classList.remove('open'));
  $('rankwin').addEventListener('click', (e) => { if (e.target.id === 'rankwin') $('rankwin').classList.remove('open'); });
  document.querySelector('.rtabs').addEventListener('click', (e) => { const b = e.target.closest('[data-rt]'); if (!b) return; rankTab = b.dataset.rt; C.sfx.click(); loadRank(); });
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
export function openEvents() { if (socket) { socket.emit('warGet'); socket.emit('eventsGet'); socket.emit('wbGet'); } renderEvents(); $('eventwin').classList.add('open'); }
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
// ---------- dünya boss'u ----------
let wbs = null, wbr = null;
export const wbState = () => wbs;
function renderWb() {
  if (!wbs) return;
  const now = Date.now();
  document.querySelector('.evcard.wb').classList.toggle('on', wbs.active);
  $('wbStatus').innerHTML = wbs.active ? `<b style="color:#ff6a3d">UYANDI</b> · ${fmtLeft(wbs.ends - now)} kaldı · ${wbs.count} kahraman` : wbs.next ? `Sonraki: ${fmtLeft(wbs.next - now)} sonra` : '';
  $('wbJoinBtn').style.display = wbs.active && !C.inWbMap() ? '' : 'none';
  const l = wbs.last;
  $('wbLast').innerHTML = l ? `<b>Geçen hafta:</b> ${l.killed ? 'yenildi' : 'kaçtı'} (${l.count} kahraman). ` +
    (l.top || []).slice(0, 3).map((r, i) => `${i + 1}. ${C.esc(r.name)} <small>%${r.pct}</small>`).join(' · ') + (l.lastHit ? ` · Son vuruş: ${C.esc(l.lastHit)}` : '') : '';
}
function renderWbHud() {
  const on = !!(wbs && wbs.active && C.inWbMap() && wbr);
  $('wbHud').style.display = on ? 'flex' : 'none';
  if (!on) return;
  const pct = wbr.max ? 100 * wbr.hp / wbr.max : 0;
  $('wbBar').style.width = pct.toFixed(2) + '%';
  $('wbPct').textContent = `${wbr.hp.toLocaleString('tr-TR')} / ${wbr.max.toLocaleString('tr-TR')} (%${pct.toFixed(1)})`;
  $('wbTime').textContent = fmtLeft(wbr.ends - Date.now()) + ' kaldı';
  $('wbN').textContent = `${wbr.n} kahraman`;
  $('wbTop').innerHTML = wbr.top.slice(0, 3).map((r, i) => `<span>${i + 1}. <span style="color:${CLS_COLORS[r.cls] || '#f4f1e8'}">${C.esc(r.name)}</span> <small>%${r.pct}</small></span>`).join('');
  $('wbMe').textContent = wbr.me ? `Sen: ${wbr.me.rank}. (%${wbr.me.pct})` : 'Vur ve sıralamaya gir!';
}
export function refreshWb() { renderWb(); renderWbHud(); }
function showWbReward(r) {
  $('rewardTitle').textContent = r.killed ? 'KADİM LAV EJDERİ YENİLDİ!' : 'EJDER KAÇTI';
  $('rewardItems').innerHTML = (r.yang ? `<div class="rwi"><b>${r.yang.toLocaleString('tr-TR')}</b><small>Yang</small></div>` : '') +
    (r.exp ? `<div class="rwi"><b>${r.exp.toLocaleString('tr-TR')}</b><small>Tecrübe</small></div>` : '') +
    (r.ep ? `<div class="rwi"><b>💎 ${r.ep}</b><small>Ejder Parası</small></div>` : '') +
    r.items.map(([k, n]) => { const d = C.ITEMS[k]; return `<div class="rwi">${C.itemIcon(k, d, 30)}<small>${C.esc(d ? d.name : k)}${n > 1 ? ' x' + n : ''}</small></div>`; }).join('');
  $('rewardSub').textContent = `Hasar sıran: ${r.rank}. (%${r.share} · ${r.dmg.toLocaleString('tr-TR')} hasar)${r.lastHit ? ' · SON VURUŞ SENİN!' : ''}`;
  $('rewardwin').classList.add('open');
  C.sfx.levelUp && C.sfx.levelUp();
}
function renderWarHud() {
  const el = $('warHud');
  if (!war || !war.active || !C.inWarMap()) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = [1, 2, 3].map((e) => `<span style="color:${EMPIRES[e].color}">${war.score[e] || 0}</span>`).join('<small>·</small>') + `<small>${fmtLeft(war.ends - Date.now())}</small>`;
}
export function refreshWar() { renderWarHud(); }

// ---------- öğretici ----------
const TUT = [
  { text: 'Hoş geldin, kahraman! Sol alttaki çubuğu sürükleyerek yürü.', hl: '#joy', done: (s) => s.moved > 6 },
  { text: 'Sağ üstteki çanta düğmesine bas ve eşyalarına bak.', hl: '#invbtn', done: (s) => s.invOpened },
  { text: 'Köyün doğusundaki geçitten çık ve bir canavar öldür. Saldırmak için sağ alttaki kılıç düğmesi.', hl: '#atk', done: (s) => s.kills > 0 },
  { text: '☰ Menü\'yü aç: görevler, lonca, zindan ve sıralama burada.', hl: '#menuBtn', done: () => menuOpened },
  { text: 'Görevler\'e dokun: her gün yeni görevler ve giriş ödülü var!', hl: '[data-menu="daily"]', done: () => dailyOpened },
];
let tutStep = -1, menuOpened = false, dailyOpened = false, tutHl = null;
export function startTutorial(from = 0) { tutStep = from; menuOpened = false; dailyOpened = false; showTut(); }
function showTut() {
  const box = $('tutBox');
  if (tutHl) { tutHl.classList.remove('tut-hl'); tutHl = null; }
  if (tutStep < 0 || tutStep >= TUT.length) { box.style.display = 'none'; return; }
  const st = TUT[tutStep];
  box.style.display = 'flex';
  $('tutStep').textContent = `${tutStep + 1}/${TUT.length}`;
  $('tutText').textContent = st.text;
  tutHl = document.querySelector(st.hl); if (tutHl) tutHl.classList.add('tut-hl');
}
function tickTut() {
  if (tutStep < 0 || tutStep >= TUT.length) return;
  if (TUT[tutStep].done(C.tutStats())) {
    tutStep++;
    if (socket) socket.emit('tutorial', tutStep >= TUT.length ? 'done' : tutStep + 1);
    C.sfx.click();
    if (tutStep >= TUT.length) { tutStep = -1; C.toast('Öğretici tamamlandı! Rehber her zaman Menü › Rehber\'de.'); }
    showTut();
  }
}
export function openHelp() { $('helpwin').classList.add('open'); }

// ---------- sıralama ----------
let rankTab = 'level', rankData = null;
export function openRank() { $('rankwin').classList.add('open'); loadRank(); }
function loadRank() { if (socket) socket.emit('rankGet', rankTab); for (const b of document.querySelectorAll('.rtabs [data-rt]')) b.classList.toggle('on', b.dataset.rt === rankTab); $('rankList').innerHTML = '<p class="gtxt">Yükleniyor…</p>'; }
function renderRank() {
  if (!rankData || rankData.tab !== rankTab) return;
  const rows = rankData.rows, me = C.myName();
  const emp = (e) => (e && EMPIRES[e] ? `<span class="emp" style="display:inline-block;width:8px;height:8px;transform:rotate(45deg);margin-right:5px;background:${EMPIRES[e].color}"></span>` : '');
  $('rankMine').textContent = rankData.mine ? `Senin sıran: ${rankData.mine}.` : '';
  if (!rows.length) { $('rankList').innerHTML = '<p class="gtxt">Henüz kimse yok. İlk sen ol!</p>'; return; }
  if (rankTab === 'empire') {
    const max = Math.max(1, ...rows.map((r) => r.levels));
    $('rankList').innerHTML = rows.map((r) => `<div class="rk" style="flex-direction:column;align-items:stretch"><div style="display:flex;justify-content:space-between"><b style="color:${EMPIRES[r.empire].color}">${EMPIRES[r.empire].name}</b><span class="vl">${r.players} oyuncu</span></div>
      <small style="color:#a8a290">Toplam seviye ${r.levels.toLocaleString('tr-TR')} · En yüksek Sv. ${r.top}${war && war.winner === r.empire ? ' · Savaş galibi (+%20 tecrübe)' : ''}</small><div class="empbar" style="width:${100 * r.levels / max}%;background:${EMPIRES[r.empire].color}"></div></div>`).join('');
    return;
  }
  $('rankList').innerHTML = rows.map((r, i) => {
    if (rankTab === 'guild') return `<div class="rk"><span class="no">${i + 1}</span><span class="nm"><b>${C.esc(r.name)}</b><small>Lider ${C.esc(r.leader || '-')} · ${r.members} üye</small></span><span class="vl">Sv. ${r.level}</span></div>`;
    const val = rankTab === 'level' ? `Sv. ${r.level}` : rankTab === 'kills' ? `${Number(r.value).toLocaleString('tr-TR')} av` : `${r.value} galibiyet`;
    return `<div class="rk${r.name === me ? ' me' : ''}"><span class="no">${i + 1}</span><span class="nm">${emp(r.empire)}<b>${C.esc(r.name)}</b><small>${CLS_NAMES[r.class] || ''}${rankTab !== 'level' ? ' · Sv. ' + r.level : ''}${r.guild ? ' · [' + C.esc(r.guild) + ']' : ''}</small></span><span class="vl">${val}</span></div>`;
  }).join('');
}

// ---------- zindan ----------
let dun = null, dunInfo = null;
export function clearDungeon() { dun = null; renderDunHud(); }
export function openDungeon() { if (socket) socket.emit('dungeonInfo'); renderDungeon(); $('dungeonwin').classList.add('open'); }
function renderDungeon() {
  if (dunInfo) $('dunWaves').innerHTML = dunInfo.waves.map((w, i) => `<span>${i + 1}. ${C.esc(w)}</span>`).join('');
  $('dunInfo').innerHTML = dun ? 'Şu an zindandasın.' : dunInfo && dunInfo.cooldown > 0 ? `Tekrar girebilmen için <b>${Math.ceil(dunInfo.cooldown / 60000)} dk</b> beklemen gerekiyor.` : dunInfo ? `Temizlediğin zindan: <b>${dunInfo.runs}</b>` : '';
  $('dunEnter').style.display = dun ? 'none' : ''; $('dunLeave').style.display = dun ? '' : 'none';
}
function renderDunHud() {
  const el = $('dunHud');
  if (!dun) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  el.innerHTML = `<b>${C.esc(dun.name)} · ${dun.done ? 'TEMİZLENDİ' : `${dun.stage}/${dun.stages} ${C.esc(dun.wave)}`}</b><small>${dun.done ? 'Köye dönüş' : `Kalan düşman ${dun.left}`} · ${fmtLeft(dun.ends - Date.now())}</small>`;
}
function setupDungeon() {
  $('dungeonX').addEventListener('click', () => $('dungeonwin').classList.remove('open'));
  $('dungeonwin').addEventListener('click', (e) => { if (e.target.id === 'dungeonwin') $('dungeonwin').classList.remove('open'); });
  $('dunEnter').addEventListener('click', () => { if (socket) socket.emit('dungeonEnter'); $('dungeonwin').classList.remove('open'); });
  $('dunLeave').addEventListener('click', () => C.askBox('Zindandan çıkmak istiyor musun? Bekleme süresi sıfırlanmaz.', (ok) => { if (ok && socket) socket.emit('dungeonLeave'); $('dungeonwin').classList.remove('open'); }, 'Çık', 'Kal', true));
  setInterval(renderDunHud, 1000);
}

// ---------- pazar ----------
let stallSeen = null, myStall = null;
const stIcon = (it) => { const d = C.ITEMS[it.key] || { name: '?' }; return `<span class="ic">${C.itemIcon(it.key, d, 26)}${it.n > 1 ? `<i class="cnt">${it.n}</i>` : ''}${it.up ? `<i class="upb">+${it.up}</i>` : ''}</span>`; };
const stName = (it) => { const d = C.ITEMS[it.key] || { name: it.key }; return d.name + (it.up ? ' +' + it.up : '') + (it.n > 1 ? ' x' + it.n : ''); };
const stSub = (it) => { const d = C.ITEMS[it.key]; if (!d) return ''; const parts = []; if (d.lv > 1) parts.push('Sv. ' + d.lv); if ((it.sock || []).length) parts.push(it.sock.length + ' taş'); if ((it.bon || []).length) parts.push(it.bon.length + ' efsun'); return parts.join(' · ') || (d.desc || '').slice(0, 60); };
export function openMyStall() { if (socket) socket.emit('stallMine'); renderMyStall(); $('mystallwin').classList.add('open'); }
function renderStall() {
  if (!stallSeen) return;
  $('stTitle').textContent = stallSeen.title; $('stOwner').textContent = stallSeen.owner;
  $('stYang').textContent = (C.yang() || 0).toLocaleString('tr-TR');
  $('stItems').innerHTML = stallSeen.items.length ? stallSeen.items.map((it) => `<button class="st buy" data-sid="${it.sid}" data-price="${it.price}">${stIcon(it)}<span class="nm"><b>${C.esc(stName(it))}</b><small>${C.esc(stSub(it))}</small></span><span class="pr">${it.price.toLocaleString('tr-TR')}</span></button>`).join('')
    : '<p class="gtxt">Tezgâh boş, her şey satılmış.</p>';
}
function renderMyStall() {
  $('msNone').style.display = myStall ? 'none' : ''; $('msHas').style.display = myStall ? '' : 'none';
  if (myStall) {
    $('msMap').textContent = myStall.map; $('msEarn').textContent = myStall.earnings.toLocaleString('tr-TR');
    $('msItems').innerHTML = myStall.items.map((x) => `<div class="st">${stIcon(x.item)}<span class="nm"><b>${C.esc(stName(x.item))}</b></span><span class="pr">${x.price.toLocaleString('tr-TR')}</span></div>`).join('') || '<p class="gtxt">Her şey satıldı! Kazancını topla ve tezgâhı kapat.</p>';
    $('msLog').innerHTML = myStall.log.map((l) => `<span>${new Date(l.t).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · ${C.esc(l.name)} → ${C.esc(l.buyer)} · ${l.price.toLocaleString('tr-TR')}</span>`).join('') || '<span>Henüz satış yok.</span>';
    return;
  }
  const keep = {}; for (const el of document.querySelectorAll('#msPick .st')) keep[el.dataset.uid] = { on: el.querySelector('input[type=checkbox]').checked, price: el.querySelector('input[type=number]').value };
  $('msPick').innerHTML = (C.inventory() || []).map((it) => { const k = keep[it.uid] || {};
    return `<label class="st" data-uid="${it.uid}"><input type="checkbox" ${k.on ? 'checked' : ''} aria-label="Seç">${stIcon(it)}<span class="nm"><b>${C.esc(stName(it))}</b><small>${C.esc(stSub(it))}</small></span><input type="number" min="1" inputmode="numeric" placeholder="Fiyat" value="${k.price || ''}" aria-label="Fiyat"></label>`; }).join('') || '<p class="gtxt">Çantan boş.</p>';
}
export function refreshStallWins() { if ($('stallwin').classList.contains('open')) renderStall(); if ($('mystallwin').classList.contains('open') && !myStall) renderMyStall(); }
function setupStalls() {
  $('stallX').addEventListener('click', () => $('stallwin').classList.remove('open'));
  $('mystallX').addEventListener('click', () => $('mystallwin').classList.remove('open'));
  for (const id of ['stallwin', 'mystallwin']) $(id).addEventListener('click', (e) => { if (e.target.id === id) $(id).classList.remove('open'); });
  $('stItems').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sid]'); if (!b || !socket || !stallSeen) return;
    const it = stallSeen.items.find((x) => x.sid === Number(b.dataset.sid)); if (!it) return;
    C.askBox(`${stName(it)} için ${it.price.toLocaleString('tr-TR')} yang ödensin mi?`, (ok) => ok && socket.emit('stallBuy', { id: stallSeen.id, sid: it.sid, price: it.price }), 'Satın al', 'Vazgeç');
  });
  $('msPick').addEventListener('input', (e) => { const row = e.target.closest('.st'); if (row && e.target.type === 'number' && e.target.value) row.querySelector('input[type=checkbox]').checked = true; });
  $('msOpen').addEventListener('click', () => {
    const items = [...document.querySelectorAll('#msPick .st')].filter((el) => el.querySelector('input[type=checkbox]').checked)
      .map((el) => ({ uid: Number(el.dataset.uid), price: Number(el.querySelector('input[type=number]').value) }));
    if (!items.length) { C.toast('Satmak istediğin eşyaları seç.'); return; }
    if (items.some((x) => !(x.price >= 1))) { C.toast('Seçtiğin her eşyaya fiyat yaz.'); return; }
    socket.emit('stallOpen', { title: $('msTitle').value, items });
  });
  $('msCollect').addEventListener('click', () => socket && socket.emit('stallCollect'));
  $('msClose').addEventListener('click', () => C.askBox('Tezgâh kapatılsın mı? Satılmayan eşyalar çantana döner.', (ok) => ok && socket.emit('stallClose'), 'Kapat', 'Vazgeç'));
}

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
const CLS_NAMES = { savasci: 'Alp', ninja: 'Akıncı', sura: 'Yalaz', saman: 'Kam', okcu: 'Avcı' };
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

function openMenu() { menuOpened = true; renderMenuBadges(); $('menuwin').classList.add('open'); if (tutStep >= 0) setTimeout(showTut, 50); }
function renderMenuBadges() {
  const n = (daily ? daily.list.filter((q) => q.have >= q.need && !q.claimed).length : 0) + mainQ.filter((q) => q.st === 'ready').length;
  const b = document.querySelector('[data-menu="daily"] i'); if (b) { b.textContent = n; b.style.display = n ? '' : 'none'; }
  // dağıtılmamış karakter ve beceri puanları da menüde gösterilir
  const pts = (id) => { const e = $(id); return e && e.style.display !== 'none' ? Number(e.textContent) || 0 : 0; };
  const cp = pts('charPts'), sp = pts('skillPts');
  for (const [id, v] of [['mbChar', cp], ['mbSkill', sp]]) { const e = $(id); if (e) { e.textContent = v; e.style.display = v ? '' : 'none'; } }
  const mb = $('menuBadge'), tot = n + (cp ? 1 : 0) + (sp ? 1 : 0);
  if (mb) { mb.style.display = tot ? '' : 'none'; mb.textContent = n + cp + sp > 99 ? '99+' : n + cp + sp; }
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
  socket.on('wbState', (w) => { wbs = w; if (!w.active) wbr = null; renderWb(); renderWbHud(); });
  socket.on('wbRank', (r) => { wbr = r; renderWbHud(); });
  socket.on('wbEnd', (r) => { wbr = null; renderWbHud(); showWbReward(r); });
  socket.on('wbStart', (w) => {
    wbs = w; renderWb();
    if (C.myLevel() >= w.minLevel && !C.inWbMap() && !C.inWarMap()) C.askBox(`${w.name} uyandı! Bütün sunucu Ejder Yuvası'nda toplanıyor. Katılmak ister misin?`, (ok) => { if (ok && socket) socket.emit('wbJoin'); }, 'Katıl', 'Sonra', true);
  });
  socket.on('rank', (d) => { rankData = d; renderRank(); });
  socket.on('dungeon', (d) => { dun = d; renderDunHud(); });
  socket.on('dungeonInfo', (d) => { dunInfo = d; renderDungeon(); });
  socket.on('stallView', (v) => { stallSeen = v; renderStall(); $('stallwin').classList.add('open'); });
  socket.on('stallMine', (v) => { myStall = v; renderMyStall(); });
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
function openDaily() { dailyOpened = true; if (socket) { socket.emit('dailyGet'); socket.emit('mainGet'); } renderDaily(); $('dailywin').classList.add('open'); }
function rewardText(q) {
  const parts = [`${q.exp.toLocaleString('tr-TR')} tecrübe`, `${q.yang.toLocaleString('tr-TR')} yang`];
  for (const [k, n] of q.items) parts.push(`${(C.ITEMS[k] || {}).name || k}${n > 1 ? ' x' + n : ''}`);
  return parts.join(' · ');
}
// ana görevler: envanter sayfaları ve savaş atı
let mainQ = [];
export function setMainQuests(list) { mainQ = list || []; renderMain(); renderMenuBadges(); }
function renderMain() {
  const el = $('mainList'); if (!el) return;
  el.innerHTML = mainQ.map((q) => {
    const pct = q.need ? Math.round(100 * q.have / q.need) : 0;
    const st = q.st === 'locked' ? `<small>${q.lv}. seviyede açılır</small>` : q.st === 'wait' ? '<small>Önceki görevi bitir</small>'
      : q.st === 'ready' ? `<button class="btn" data-mclaim="${q.id}">Ödülü al</button>` : q.st === 'done' ? '<span class="dqok">✔ Tamamlandı</span>' : '';
    return `<div class="dq${q.st === 'ready' ? ' done' : ''}${q.st === 'done' ? ' claimed' : ''}${q.st === 'locked' || q.st === 'wait' ? ' locked' : ''}">
      <div class="dqh"><b>${C.esc(q.name)}</b><span>${q.st === 'active' || q.st === 'ready' ? C.esc(q.parts) : 'Sv. ' + q.lv}</span></div>
      <div class="dqt">${C.esc(q.text)}</div>
      ${q.st === 'active' || q.st === 'ready' ? `<div class="dqbar"><i style="width:${pct}%"></i></div>` : ''}
      <div class="dqr"><small>Ödül: ${C.esc(q.reward)}</small>${st}</div></div>`;
  }).join('');
}
function renderDaily() {
  renderMain();
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
  $('rewardItems').innerHTML = (r.yang ? `<div class="rwi"><b>${r.yang.toLocaleString('tr-TR')}</b><small>Yang</small></div>` : '') +
    r.items.map((it) => { const d = C.ITEMS[it.key]; return `<div class="rwi">${C.itemIcon(it.key, d, 30)}<small>${C.esc(d ? d.name : it.key)}${it.n > 1 ? ' x' + it.n : ''}</small></div>`; }).join('');
  $('rewardSub').textContent = r.streak >= 7 ? `${r.streak} gündür aralıksız geliyorsun!` : `Her gün gir, 7. gün büyük ödül seni bekliyor (seri: ${r.streak}).`;
  $('rewardwin').classList.add('open');
  C.sfx.levelUp && C.sfx.levelUp();
}
