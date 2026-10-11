/* Dinlipi mobile — UI layer: tabs, rendering, bottom sheet, dialogs, event wiring, start-up.
   Depends on store.js, stats.js, repo.js, reminders.js, backup.js (and native.bundle.js on the phone). */

const APP_VERSION = '1.0.0';   // keep in sync with package.json and the git tag (see DOCUMENTS.md → Releasing)

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (k, o) => parseKey(k).toLocaleDateString('en-GB', o);
const pct = v => (v == null ? '—' : Math.round(v * 100) + '%');
const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || one + 's')}`;
const daysTxt = n => plural(n, 'day');
const actsTxt = n => plural(n, 'activity', 'activities');
const haptic = () => { if (window.NativeKit) window.NativeKit.tap(); };

const ICON = {
  check: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  bellOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/></svg>',
  trash: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  restore: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
};

const ui = { tab: 'today', viewDay: todayKey(), renderedDay: todayKey(), period: 7, selAct: 'all', charts: {}, notifState: null };

/* ---------- small helpers ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}
function openModal(html) {
  $('#modalBody').innerHTML = html;
  const d = $('#modal');
  if (!d.open) d.showModal();
  return $('#modalBody');
}
function closeModal() { const d = $('#modal'); if (d.open) d.close(); }
function weekOrder() { const ws = Store.data.settings.weekStartsOn; return [0, 1, 2, 3, 4, 5, 6].map(i => (ws + i) % 7); }
function daysLabel(days) {
  if (!days.length || days.length === 7) return 'Every day';
  if (days.length === 6) return 'Every day except ' + WEEKDAYS[[0, 1, 2, 3, 4, 5, 6].find(d => !days.includes(d))];
  return weekOrder().filter(d => days.includes(d)).map(d => WEEKDAYS[d]).join(', ');
}
function reminderLabel(a) {
  if (!a.reminder) return 'off';
  return a.reminderTime || Store.data.settings.reminders.time;
}

/* ---------- tabs ---------- */
function setTab(t) {
  ui.tab = t;
  $$('#navbar button').forEach(b => { if (b.dataset.tab === t) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  ['today', 'stats', 'acts', 'settings'].forEach(x => { $('#v-' + x).hidden = x !== t; });
  $('#fab').hidden = !(t === 'today' || t === 'acts');
  $('#views').scrollTop = 0;
  renderTab();
}
function renderTab() {
  if (ui.tab === 'today') renderToday();
  else if (ui.tab === 'stats') renderStats();
  else if (ui.tab === 'acts') renderActs();
  else renderSettings();
}
const renderAll = renderTab;
$$('#navbar button').forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
$('#fab').onclick = () => openSheet(null);

/* ---------- TODAY ---------- */
function renderToday() {
  const k = ui.viewDay, t = todayKey(), list = Stats.applicable(k);
  $('#dayTitle').textContent = k === t ? 'Today' : k === shiftKey(t, -1) ? 'Yesterday' : fmt(k, { weekday: 'long' });
  $('#daySub').textContent = fmt(k, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const p = Stats.dayPct(k) || 0;
  $('#ringArc').setAttribute('stroke-dashoffset', 138.2 * (1 - p));
  $('#ringPct').textContent = pct(p);

  // 7-day strip around the selected day, never past today
  const end = k >= shiftKey(t, -3) ? t : shiftKey(k, 3), th = Store.data.settings.successThreshold;
  const strip = $('#strip');
  strip.innerHTML = '';
  for (let i = 6; i >= 0; i--) {
    const d = shiftKey(end, -i), dp = Stats.dayPct(d);
    const dot = dp == null ? 'none' : dp >= th ? 'full' : dp >= .4 ? 'mid' : dp > 0 ? 'low' : 'zero';
    const b = document.createElement('button');
    b.type = 'button';
    b.className = d === t ? 'today' : '';
    b.setAttribute('aria-pressed', d === k);
    b.setAttribute('aria-label', fmt(d, { weekday: 'long', day: 'numeric', month: 'long' }));
    b.disabled = d < Store.data.createdAt;
    b.innerHTML = `${WEEKDAYS[parseKey(d).getDay()]}<b>${parseKey(d).getDate()}</b><em class="${dot}"></em>`;
    b.onclick = () => { ui.viewDay = d; renderToday(); };
    strip.appendChild(b);
  }

  const ul = $('#checklist');
  ul.innerHTML = '';
  if (!list.length) {
    ul.innerHTML = `<li class="empty">${Store.active().length ? 'Nothing is scheduled for this day.' : 'No activities yet. Tap + to add your first one.'}</li>`;
  }
  list.forEach(a => {
    const s = Stats.actStreak(a.id), li = document.createElement('li');
    li.innerHTML = `<button class="task" type="button" aria-pressed="${Store.isDone(k, a.id)}"><span class="tk">${ICON.check}</span><span class="nm">${esc(a.name)}<small>${CATEGORIES[a.category]}</small></span><span class="st">${s > 1 ? s + 'd' : ''}</span></button>`;
    li.firstChild.onclick = () => {
      Store.toggle(k, a.id);
      haptic();
      renderToday();
      if (k >= t) Reminders.syncSoon();
    };
    ul.appendChild(li);
  });

  const done = list.filter(a => Store.isDone(k, a.id)).length, need = Math.max(0, Math.ceil(list.length * th) - done);
  $('#todayNote').textContent = !list.length ? '' :
    `${done} of ${list.length} done${p >= th ? ' · successful day' : ` · ${need} more for a successful day`}. Swipe to change the day.`;
  renderTodayBanners();
}

function banner(kind, html, actions = []) {
  const el = document.createElement('div');
  el.className = `banner ${kind}`;
  el.innerHTML = `<p>${html}</p>${actions.length ? `<span class="banner-actions">${actions.map((a, i) => `<button class="btn sm ${a.primary ? 'primary' : ''}" type="button" data-i="${i}">${a.label}</button>`).join('')}</span>` : ''}`;
  el.querySelectorAll('button').forEach(b => { b.onclick = () => actions[b.dataset.i].run(); });
  return el;
}
function renderTodayBanners() {
  const box = $('#todayBanners'), t = todayKey(), y = shiftKey(t, -1), list = [];
  box.innerHTML = '';
  if (Store.loadError) list.push(banner('error', esc(Store.loadError)));
  if (IS_DEMO) list.push(banner('info', 'Demo mode with sample data. Nothing is saved.'));
  if (ui.viewDay === t && Store.data.settings.reminders.enabled && window.NativeKit && ui.notifState && ui.notifState !== 'granted') {
    list.push(banner('warn', 'Reminders are on, but Dinlipi is not allowed to show notifications.', [{ label: 'Allow', primary: true, run: askNotifications }]));
  }
  if (ui.viewDay === t && y >= Store.data.createdAt && Store.data.meta.dismissedMissedFor !== y) {
    const missed = Reminders.missedOn(y);
    if (missed.length) {
      list.push(banner('warn', `<b>Yesterday you missed ${actsTxt(missed.length)}:</b> ${missed.map(a => esc(a.name)).join(', ')}.`, [
        { label: 'Fix yesterday', run: () => { ui.viewDay = y; renderToday(); } },
        { label: 'Dismiss', run: () => { Store.data.meta.dismissedMissedFor = y; Store.saveMeta(); renderToday(); } },
      ]));
    }
  }
  if (ui.viewDay === t && !IS_DEMO && Backup.needsNudge()) {
    const since = Backup.daysSinceBackup();
    list.push(banner('info', since == null ? "You haven't made a backup yet. A backup keeps your history safe if you lose or reset your phone." : `Your last backup was ${daysTxt(since)} ago.`, [
      { label: 'Back up now', primary: true, run: doShare },
      { label: 'Later', run: () => { Store.data.meta.dismissedBackupNudge = t; Store.saveMeta(); renderToday(); } },
    ]));
  }
  list.forEach(el => box.appendChild(el));
}

// Swipe left/right on the Today view to change the day.
(() => {
  let x0 = null, y0 = 0;
  const v = $('#v-today');
  v.addEventListener('touchstart', e => { if (e.target.closest('.strip')) { x0 = null; return; } x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  v.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 60) return;
    const next = shiftKey(ui.viewDay, dx < 0 ? 1 : -1);
    if (next > todayKey() || next < Store.data.createdAt) return;
    ui.viewDay = next;
    haptic();
    renderToday();
  }, { passive: true });
})();

/* ---------- STATS ---------- */
const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
$$('#periodSeg button').forEach(b => {
  b.onclick = () => {
    ui.period = +b.dataset.p;
    $$('#periodSeg button').forEach(x => x.setAttribute('aria-pressed', x === b));
    renderStats();
  };
});
$('#trendSel').onchange = e => { ui.selAct = e.target.value; renderStats(); };

function renderStats() {
  const A = Store.active(), n = ui.period;
  const now = Stats.rangePct(n), prev = Stats.rangePct(n, n);
  $('#kPeriodLabel').textContent = n === 7 ? 'Last 7 days' : 'Last 30 days';
  $('#kEff').textContent = pct(now);
  const d = $('#kEffD');
  if (now == null || prev == null) { d.className = 'muted'; d.textContent = 'Not enough history yet'; }
  else {
    const diff = Math.round((now - prev) * 100);
    d.className = diff >= 0 ? 'up' : 'down';
    d.textContent = `${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}% vs the ${n} days before`;
  }
  $('#kStreak').textContent = daysTxt(Stats.daySuccessStreak());
  $('#kBest').textContent = 'Best: ' + daysTxt(Stats.daySuccessBest());
  $('#periodNote').textContent = n === 7 ? 'Last 7 days' : 'Last 30 days';

  const ranked = A.map(a => ({ ...a, v: Stats.actPct(a.id, n) })).sort((x, y) => (y.v ?? -1) - (x.v ?? -1));
  const ul = $('#actBars');
  ul.innerHTML = ranked.length ? '' : '<li class="empty">No activities yet.</li>';
  ranked.forEach(a => {
    const v = a.v ?? 0, li = document.createElement('li');
    li.innerHTML = `<button class="bar-row" type="button" aria-pressed="${ui.selAct === a.id}"><span>${esc(a.name)}</span><b>${pct(a.v)}</b><span class="track"><span class="fill ${v < .4 ? 'low' : v < .7 ? 'mid' : ''}" style="width:${v * 100}%"></span></span></button>`;
    li.firstChild.onclick = () => { ui.selAct = ui.selAct === a.id ? 'all' : a.id; renderStats(); };
    ul.appendChild(li);
  });
  if (!A.some(a => a.id === ui.selAct)) ui.selAct = 'all';
  $('#trendSel').innerHTML = '<option value="all">Overall only</option>' + A.map(a => `<option value="${esc(a.id)}">Compare: ${esc(a.name)}</option>`).join('');
  $('#trendSel').value = ui.selAct;
  renderHeat();
  drawCharts();
}

function chartMsg(canvas, msg) {
  const el = canvas.parentElement.querySelector('.chart-msg');
  el.hidden = !msg;
  el.textContent = msg || '';
  canvas.style.visibility = msg ? 'hidden' : 'visible';
}
function drawCharts() {
  Object.values(ui.charts).forEach(c => c.destroy());
  ui.charts = {};
  if (!window.Chart) { chartMsg($('#dailyChart'), 'Charts could not load.'); chartMsg($('#trendChart'), 'Charts could not load.'); return; }
  const ink = tok('--ink'), muted = tok('--muted'), line = tok('--line'), acc = tok('--accent'), amb = tok('--amber');
  Chart.defaults.font.family = tok('--font');
  Chart.defaults.color = muted;
  const t = todayKey(), n = ui.period;
  const scaleY = { min: 0, max: 100, ticks: { stepSize: 25, callback: v => v + '%' }, grid: { color: line }, border: { display: false } };

  const days = [...Array(n)].map((_, i) => shiftKey(t, i - n + 1));
  const vals = days.map(k => { const p = Stats.dayPct(k); return p == null ? null : Math.round(p * 100); });
  chartMsg($('#dailyChart'), vals.every(v => v == null) ? 'No data for this period yet.' : '');
  ui.charts.daily = new Chart($('#dailyChart'), {
    type: 'bar',
    data: {
      labels: days.map(k => (n === 7 ? fmt(k, { weekday: 'short' }) : fmt(k, { day: 'numeric' }))),
      datasets: [{ data: vals, backgroundColor: vals.map(v => (v >= 70 ? acc : v >= 40 ? amb : line)), borderRadius: 4, maxBarThickness: 30, minBarLength: 3 }],
    },
    options: {
      maintainAspectRatio: false, animation: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { title: c => fmt(days[c[0].dataIndex], { weekday: 'long', day: 'numeric', month: 'short' }), label: c => ' ' + c.parsed.y + '% done' } } },
      scales: { y: scaleY, x: { grid: { display: false }, border: { color: line }, ticks: { autoSkip: true, maxRotation: 0 } } },
    },
  });

  const weeks = [...Array(12)].map((_, i) => 11 - i);
  const toPct = v => (v == null ? null : Math.round(v * 100));
  const overall = weeks.map(w => toPct(Stats.rangePct(7, 7 * w)));
  const radius = weeks.map((_, i) => (i === 11 ? 4 : 2));
  const sets = [{ label: 'Overall', data: overall, borderColor: acc, backgroundColor: acc + '22', fill: true, tension: .35, pointRadius: radius, pointBackgroundColor: acc }];
  const a = Store.find(ui.selAct);
  if (a) sets.push({ label: a.name, data: weeks.map(w => toPct(Stats.actPct(a.id, 7, 7 * w))), borderColor: amb, backgroundColor: amb, tension: .35, pointRadius: radius, borderDash: [5, 4] });
  chartMsg($('#trendChart'), overall.every(v => v == null) ? 'The trend appears after your first days of tracking.' : '');
  ui.charts.trend = new Chart($('#trendChart'), {
    type: 'line',
    data: { labels: weeks.map(w => fmt(shiftKey(t, -7 * w - 6), { day: 'numeric', month: 'short' })), datasets: sets },
    options: {
      maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: !!a, labels: { color: ink, boxWidth: 10, usePointStyle: true } }, tooltip: { callbacks: { title: c => 'Week of ' + c[0].label, label: c => ' ' + c.dataset.label + ': ' + c.parsed.y + '%' } } },
      scales: { y: scaleY, x: { grid: { display: false }, border: { color: line }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } } },
    },
  });
}
function renderHeat() {
  const h = $('#heat'), t = todayKey(), ws = Store.data.settings.weekStartsOn;
  h.innerHTML = '';
  const back = (parseKey(t).getDay() - ws + 7) % 7, start = shiftKey(shiftKey(t, -back), -7 * 15);
  for (let r = 0; r < 7; r++) {
    const s = document.createElement('span');
    s.className = 'dl';
    s.textContent = r % 2 === 0 ? WEEKDAYS[(ws + r) % 7] : '';
    h.appendChild(s);
  }
  for (let i = 0; i < 16 * 7; i++) {
    const k = shiftKey(start, i), c = document.createElement('span');
    if (k > t) c.className = 'cell future';
    else {
      const p = Stats.dayPct(k);
      c.className = 'cell ' + (p == null ? 'none' : p === 0 ? '' : p < .4 ? 'l1' : p < .7 ? 'l2' : p < .9 ? 'l3' : 'l4');
    }
    h.appendChild(c);
  }
}

/* ---------- ACTIVITIES ---------- */
function actRow(a) {
  const li = document.createElement('li');
  const on = a.reminder;
  li.innerHTML = `<button class="act ${a.archived ? 'is-archived' : ''}" type="button"><span class="nm">${esc(a.name)}<small>${CATEGORIES[a.category]} · ${daysLabel(a.days)}</small></span><span class="bell ${on ? 'on' : ''}">${on ? ICON.bell : ICON.bellOff}${reminderLabel(a)}</span></button>`;
  li.firstChild.onclick = () => openSheet(a.id);
  return li;
}
function renderActs() {
  const A = Store.active(), Z = Store.archived();
  $('#actCount').textContent = actsTxt(A.length);
  const ul = $('#actList');
  ul.innerHTML = A.length ? '' : '<li class="empty">No activities yet. Tap + to add one.</li>';
  A.forEach(a => ul.appendChild(actRow(a)));
  $('#archBox').hidden = !Z.length;
  $('#archSum').textContent = `Archived (${Z.length})`;
  const zl = $('#archList');
  zl.innerHTML = '';
  Z.forEach(a => zl.appendChild(actRow(a)));
}

/* ---------- add / edit bottom sheet ---------- */
const sheetState = {};
function openSheet(id) {
  const a = id ? Store.find(id) : null, s = Store.data.settings.reminders;
  Object.assign(sheetState, {
    id,
    category: a ? a.category : 'other',
    days: new Set(a && a.days.length ? a.days : [0, 1, 2, 3, 4, 5, 6]),
    custom: !!(a && a.reminderTime),
  });
  const form = $('#sheet');
  form.innerHTML = `<span class="grab"></span>
    <h2>${a ? 'Edit activity' : 'New activity'}</h2>
    <div class="field"><label class="lbl" for="fName">Name</label>
      <input class="inp" id="fName" maxlength="80" autocomplete="off" placeholder="e.g. 10 minutes of meditation" value="${a ? esc(a.name) : ''}">
      <span class="err" id="fNameErr" hidden></span></div>
    <div class="field"><span class="lbl">Category</span><div class="chips" id="fCats">${Object.entries(CATEGORIES).map(([k, v]) => `<button type="button" data-c="${k}" aria-pressed="${sheetState.category === k}">${v}</button>`).join('')}</div></div>
    <div class="field"><span class="lbl">Repeat on</span><div class="wd" id="fDays">${weekOrder().map(d => `<button type="button" data-d="${d}" aria-pressed="${sheetState.days.has(d)}" aria-label="${WEEKDAYS[d]}">${WEEKDAYS[d].slice(0, 2)}</button>`).join('')}</div>
      <span class="err" id="fDaysErr" hidden></span></div>
    <div class="row"><label for="fRem">Remind me if not done</label><input type="checkbox" class="switch" id="fRem" ${!a || a.reminder ? 'checked' : ''}></div>
    <div class="field" id="fTimeBox"><span class="lbl">Reminder time</span>
      <div class="chips" id="fTimeMode"><button type="button" data-m="default" aria-pressed="${!sheetState.custom}">Default (${s.time})</button><button type="button" data-m="custom" aria-pressed="${sheetState.custom}">Own time</button></div>
      <input type="time" id="fTime" value="${a && a.reminderTime ? a.reminderTime : s.time}" ${sheetState.custom ? '' : 'hidden'}></div>
    <button class="btn primary wide" type="submit">${a ? 'Save changes' : 'Add activity'}</button>
    ${a ? `<div class="sheet-actions">
      ${a.archived ? '' : '<button class="btn" type="button" data-x="up">Move up</button><button class="btn" type="button" data-x="down">Move down</button>'}
      <button class="btn" type="button" data-x="arch">${a.archived ? 'Restore' : 'Archive'}</button>
      <button class="btn danger" type="button" data-x="del">Delete</button></div>` : ''}`;

  form.querySelectorAll('#fCats button').forEach(b => { b.onclick = () => { sheetState.category = b.dataset.c; form.querySelectorAll('#fCats button').forEach(x => x.setAttribute('aria-pressed', x === b)); }; });
  form.querySelectorAll('#fDays button').forEach(b => {
    b.onclick = () => {
      const d = +b.dataset.d;
      sheetState.days.has(d) ? sheetState.days.delete(d) : sheetState.days.add(d);
      b.setAttribute('aria-pressed', sheetState.days.has(d));
      $('#fDaysErr').hidden = true;
    };
  });
  const syncRem = () => { $('#fTimeBox').hidden = !$('#fRem').checked; };
  $('#fRem').onchange = syncRem;
  syncRem();
  form.querySelectorAll('#fTimeMode button').forEach(b => {
    b.onclick = () => {
      sheetState.custom = b.dataset.m === 'custom';
      form.querySelectorAll('#fTimeMode button').forEach(x => x.setAttribute('aria-pressed', x === b));
      $('#fTime').hidden = !sheetState.custom;
    };
  });
  form.querySelectorAll('[data-x]').forEach(b => {
    b.onclick = () => {
      const x = b.dataset.x;
      if (x === 'up' || x === 'down') { Store.move(id, x === 'up' ? -1 : 1); haptic(); renderAll(); toast(x === 'up' ? 'Moved up' : 'Moved down'); }
      else if (x === 'arch') {
        Store.update(id, { archived: !a.archived });
        closeSheet(); renderAll(); Reminders.syncSoon();
        toast(a.archived ? `Archived "${a.name}". Its history is kept.` : `Restored "${a.name}"`);
      } else if (x === 'del') { closeSheet(); openDelete(id); }
    };
  });
  $('#sheetWrap').hidden = false;
  if (!a) setTimeout(() => $('#fName').focus(), 250);
}
function closeSheet() { $('#sheetWrap').hidden = true; }
$('#sheetDim').onclick = closeSheet;
$('#sheet').addEventListener('submit', e => {
  e.preventDefault();
  const name = $('#fName').value.trim(), err = $('#fNameErr');
  const fail = (el, input, msg) => { el.textContent = msg; el.hidden = false; if (input) { input.setAttribute('aria-invalid', 'true'); input.focus(); } };
  if (!name) return fail(err, $('#fName'), 'Type a name for the activity.');
  if (Store.nameTaken(name, sheetState.id)) return fail(err, $('#fName'), 'An activity with this name already exists. Check the Archived list too.');
  if (!sheetState.days.size) return fail($('#fDaysErr'), null, 'Pick at least one day.');
  const fields = {
    name,
    category: sheetState.category,
    days: sheetState.days.size === 7 ? [] : [...sheetState.days].sort(),
    reminder: $('#fRem').checked,
    reminderTime: $('#fRem').checked && sheetState.custom && isHM($('#fTime').value) ? $('#fTime').value : null,
  };
  if (sheetState.id) { Store.update(sheetState.id, fields); toast('Saved'); }
  else { Store.addActivity(fields); toast(`Added "${name}"`); }
  haptic();
  closeSheet();
  renderAll();
  Reminders.syncSoon();
});

/* ---------- 3-step delete ---------- */
function stepBar(n) { return `<div class="steps">Step ${n} of 3 <i class="on"></i><i class="${n >= 2 ? 'on' : ''}"></i><i class="${n >= 3 ? 'on' : ''}"></i></div>`; }
function openDelete(id) { renderDeleteStep(id, 1); }
function renderDeleteStep(id, n) {
  const a = Store.find(id);
  if (!a) { closeModal(); return; }
  const times = Stats.timesDone(id), first = Stats.firstDone(id);
  const longDate = k => fmt(k, { day: 'numeric', month: 'short', year: 'numeric' });
  let html;
  if (n === 1) {
    html = `${stepBar(1)}<div class="dlg-ico danger">${ICON.trash}</div><h2>Delete "${esc(a.name)}"?</h2>
      <ul class="facts"><li>Checked off <b>${times}</b> ${times === 1 ? 'time' : 'times'}</li><li>Tracked since <b>${longDate(a.createdAt)}</b></li><li>Current streak <b>${daysTxt(Stats.actStreak(id))}</b></li></ul>
      <p class="muted">${a.archived ? 'This activity is archived.' : 'If you only want it off your checklist, archive it instead. Archiving keeps all its history.'}</p>
      <div class="modal-actions"><button class="btn ghost" type="button" data-x="cancel">Cancel</button>${a.archived ? '' : '<button class="btn" type="button" data-x="archive">Archive instead</button>'}<button class="btn danger" type="button" data-x="next">Continue</button></div>`;
  } else if (n === 2) {
    html = `${stepBar(2)}<div class="dlg-ico danger">${ICON.trash}</div><h2>Are you sure?</h2>
      <p>This removes <b>${daysTxt(times)}</b> of check-offs for "${esc(a.name)}"${first ? `, going back to ${longDate(first)}` : ''}. Stats and streaks are recalculated without it.</p>
      <p class="muted">Only a backup made before today can bring it back.</p>
      <div class="modal-actions"><button class="btn ghost" type="button" data-x="cancel">Keep it</button><button class="btn danger" type="button" data-x="next">Yes, I'm sure</button></div>`;
  } else {
    html = `${stepBar(3)}<div class="dlg-ico danger">${ICON.trash}</div><h2>Final confirmation</h2>
      <p>Type <b>${esc(a.name)}</b> to delete it permanently.</p>
      <input class="inp" id="delConfirm" autocomplete="off" aria-label="Type the activity name">
      <div class="modal-actions"><button class="btn ghost" type="button" data-x="cancel">Cancel</button><button class="btn danger-solid" type="button" data-x="delete" id="delFinal" disabled>Delete permanently</button></div>`;
  }
  const body = openModal(html);
  if (n === 3) {
    const inp = $('#delConfirm');
    inp.oninput = () => { $('#delFinal').disabled = inp.value.trim().toLowerCase() !== a.name.toLowerCase(); };
  }
  body.querySelectorAll('[data-x]').forEach(b => {
    b.onclick = () => {
      const x = b.dataset.x;
      if (x === 'cancel') { closeModal(); toast('Nothing was deleted'); }
      else if (x === 'archive') { Store.update(id, { archived: true }); closeModal(); renderAll(); Reminders.syncSoon(); toast(`Archived "${a.name}"`); }
      else if (x === 'next') renderDeleteStep(id, n + 1);
      else if (x === 'delete') { Store.deleteActivity(id); closeModal(); renderAll(); Reminders.syncSoon(); toast(`Deleted "${a.name}"`); }
    };
  });
}

/* ---------- SETTINGS ---------- */
const NOTIF_TEXT = { granted: 'Allowed', denied: 'Blocked. Allow them in Android Settings → Apps → Dinlipi.', prompt: 'Not allowed yet', 'prompt-with-rationale': 'Not allowed yet' };
async function renderSettings() {
  const r = Store.data.settings.reminders, b = Store.data.settings.backup;
  $('#remOn').checked = r.enabled;
  $('#remTime').value = r.time;
  $('#rem2On').checked = r.secondEnabled;
  $('#rem2Time').value = r.secondTime;
  $('#remTime').disabled = $('#rem2On').disabled = $('#rem2Time').disabled = !r.enabled;

  if (window.NativeKit) {
    ui.notifState = await window.NativeKit.notificationPermission().catch(() => null);
    $('#notifState').textContent = NOTIF_TEXT[ui.notifState] || '';
    $('#notifBtn').hidden = ui.notifState === 'granted' || ui.notifState === 'denied';
    const exact = await window.NativeKit.exactAlarmState().catch(() => 'granted');
    $('#exactRow').hidden = exact === 'granted';
  } else {
    $('#notifState').textContent = 'Available in the Android app';
    $('#notifBtn').hidden = true;
  }

  const since = Backup.daysSinceBackup();
  $('#lastBackup').textContent = b.lastBackupDate ? `${fmt(b.lastBackupDate, { day: 'numeric', month: 'short', year: 'numeric' })} (${since === 0 ? 'today' : daysTxt(since) + ' ago'})` : 'Never';
  const snap = Backup.snapshot();
  $('#undoRestore').hidden = !snap;
  if (snap) $('#undoInfo').textContent = `Go back to your data from before the restore on ${new Date(snap.savedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`;
  $('#nudgeDays').value = String(b.remindAfterDays || 0);

  const d = Store.data, storage = IS_DEMO ? 'Demo (not saved)' : window.NativeRepo ? 'SQLite on this phone' : 'Browser storage';
  const rows = [
    ['Tracking since', fmt(d.createdAt, { day: 'numeric', month: 'short', year: 'numeric' })],
    ['Days with check-offs', Object.keys(d.logs).length],
    ['Activities', `${Store.active().length} active, ${Store.archived().length} archived`],
    ['Stored in', storage],
    ['Data version', d.schemaVersion],
    ['App version', APP_VERSION],
  ];
  $('#about').innerHTML = rows.map(([k, v]) => `<div class="about-row"><span>${k}</span><b>${esc(v)}</b></div>`).join('');
}

function saveReminders() { Store.saveSettings(); Reminders.sync(); renderSettings(); }
$('#remOn').onchange = e => { Store.data.settings.reminders.enabled = e.target.checked; saveReminders(); };
$('#remTime').onchange = e => { if (isHM(e.target.value)) { Store.data.settings.reminders.time = e.target.value; saveReminders(); } };
$('#rem2On').onchange = e => { Store.data.settings.reminders.secondEnabled = e.target.checked; saveReminders(); };
$('#rem2Time').onchange = e => { if (isHM(e.target.value)) { Store.data.settings.reminders.secondTime = e.target.value; saveReminders(); } };
$('#nudgeDays').onchange = e => { Store.data.settings.backup.remindAfterDays = +e.target.value; Store.saveSettings(); };

async function askNotifications() {
  if (!window.NativeKit) return;
  const p = await window.NativeKit.requestNotificationPermission().catch(() => 'denied');
  ui.notifState = p;
  if (p === 'granted') { toast('Notifications allowed'); Reminders.sync(); }
  else toast('Notifications are blocked. Allow them in Android Settings → Apps → Dinlipi.');
  renderTab();
}
$('#notifBtn').onclick = askNotifications;
$('#exactBtn').onclick = async () => { await window.NativeKit.openExactAlarmSettings(); renderSettings(); Reminders.sync(); };

async function doShare() {
  try { toast(await Backup.share()); renderTab(); }
  catch (e) { if (!/cancel/i.test(e.message || '')) toast('Could not create the backup: ' + e.message); }
}
$('#bkShare').onclick = doShare;
$('#bkSave').onclick = async () => {
  try { toast(await Backup.saveToPhone()); renderSettings(); }
  catch (e) { toast('Could not save to Documents. Use "Share backup" instead.'); }
};
$('#importFile').onchange = e => {
  const f = e.target.files[0];
  e.target.value = '';
  if (f) confirmImport(f);
};
$('#undoRestore').onclick = () => {
  const snap = Backup.snapshot();
  if (!snap) return;
  const body = openModal(`<div class="dlg-ico accent">${ICON.restore}</div><h2>Undo the last restore?</h2>
    <p>Your data goes back to how it was before the restore. Changes made since then are lost.</p>
    <div class="modal-actions"><button class="btn ghost" type="button" data-x="cancel">Cancel</button><button class="btn primary" type="button" data-x="go">Undo restore</button></div>`);
  body.querySelector('[data-x="cancel"]').onclick = closeModal;
  body.querySelector('[data-x="go"]').onclick = async () => {
    try { await Store.replace(JSON.parse(snap.json)); }
    catch (e) { toast('Could not undo: ' + e.message); return; }
    Backup.clearSnapshot();
    closeModal();
    ui.viewDay = todayKey();
    renderAll();
    Reminders.sync();
    toast('Restore undone');
  };
};

async function confirmImport(file) {
  let raw, preview;
  try { raw = JSON.parse(await file.text()); preview = migrate(JSON.parse(JSON.stringify(raw))); }
  catch (e) { toast(e instanceof SyntaxError ? 'This file is not a Dinlipi backup.' : e.message); return; }
  const dates = Object.keys(preview.logs).sort(), d = k => fmt(k, { day: 'numeric', month: 'short', year: 'numeric' });
  const body = openModal(`<div class="dlg-ico accent">${ICON.restore}</div><h2>Restore from this backup?</h2>
    <ul class="facts"><li>File <b>${esc(file.name)}</b></li>
      ${raw.exportedAt ? `<li>Saved on <b>${new Date(raw.exportedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</b></li>` : ''}
      <li>Activities <b>${preview.activities.length}</b></li>
      <li>History <b>${dates.length ? `${d(dates[0])} – ${d(dates[dates.length - 1])}` : 'none'}</b></li></ul>
    <p>Your current data will be replaced. You can undo this afterwards in Settings.</p>
    <div class="modal-actions"><button class="btn ghost" type="button" data-x="cancel">Cancel</button><button class="btn primary" type="button" data-x="go">Replace my data</button></div>`);
  body.querySelector('[data-x="cancel"]').onclick = closeModal;
  body.querySelector('[data-x="go"]').onclick = async () => {
    Backup.saveSnapshot();
    try { await Store.replace(raw); }
    catch (e) { toast('Restore failed, nothing was changed: ' + e.message); return; }
    closeModal();
    ui.viewDay = todayKey();
    renderAll();
    Reminders.sync();
    toast('Data restored. You can undo this in Settings.');
  };
}

/* ---------- Android hooks (called from native.bundle.js) ---------- */
window.onAndroidBack = () => {
  if ($('#modal').open) { closeModal(); return true; }
  if (!$('#sheetWrap').hidden) { closeSheet(); return true; }
  if (ui.tab !== 'today') { setTab('today'); return true; }
  if (ui.viewDay !== todayKey()) { ui.viewDay = todayKey(); renderToday(); return true; }
  return false;
};
window.onAppResume = () => { tick(); Reminders.sync(); };
window.onReminderTap = () => { ui.viewDay = todayKey(); closeSheet(); closeModal(); setTab('today'); };

/* ---------- start-up and clock ---------- */
function tick() {
  const t = todayKey();
  if (t !== ui.renderedDay) {
    if (ui.viewDay === ui.renderedDay) ui.viewDay = t;
    ui.renderedDay = t;
  }
  renderTab();
}

async function init() {
  Store.onSaveError = e => toast('Could not save your last change: ' + (e && e.message ? e.message : 'unknown error'));
  await Store.load(pickRepo());
  if (IS_DEMO) Store.data = migrate(demoData());
  if (window.NativeKit) {
    ui.notifState = await window.NativeKit.notificationPermission().catch(() => null);
    if (Store.isFirstRun && ui.notifState && ui.notifState !== 'granted') {
      ui.notifState = await window.NativeKit.requestNotificationPermission().catch(() => ui.notifState);
    }
  }
  const startTab = IS_DEMO && new URLSearchParams(location.search).get('tab');   // ?demo&tab=stats (screenshots)
  setTab(['today', 'stats', 'acts', 'settings'].includes(startTab) ? startTab : 'today');
  Reminders.sync();
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (ui.tab === 'stats') drawCharts(); });
}
init();
