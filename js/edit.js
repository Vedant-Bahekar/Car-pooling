/* ================================================
   Edit page — PIN screen + editor
   ================================================ */

import {
  fetchData, verifyPin, writeAction,
  getToken, setToken, clearToken, isTokenExpired
} from './api.js';
import {
  getCurrentWeekMonday, getWeekDays, formatDate, formatShortDate,
  formatWeekRange, formatCurrency, formatDateTime, getRateForWeek,
  calculateRiderWeek, buildRiderHistory, buildOverallTotals,
  badgeHTML, balanceLabel, today, showToast, getAllWeekMondays
} from './utils.js';

let data = null;
let currentMonday = null;
let thisWeekMonday = null;
let settingsOpen = false;

// Track draft amounts per rider to preserve across re-renders
const draftAmounts = {};

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  thisWeekMonday = getCurrentWeekMonday();
  currentMonday  = new Date(thisWeekMonday);

  if (!isTokenExpired()) {
    showEditor();
  } else {
    clearToken();
    showPinScreen();
  }
});

// ================================================================
//  PIN SCREEN
// ================================================================

function showPinScreen() {
  const app = document.getElementById('app');
  let digits = '';
  let locked = false;

  app.innerHTML = `
    <div class="pin-screen">
      <a href="/" class="home-link" style="position:absolute;top:16px;left:16px;">Home</a>
      <div class="pin-title">Enter PIN</div>
      <div class="pin-dots" id="pin-dots">
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
        <div class="pin-dot"></div>
      </div>
      <div class="pin-error" id="pin-error"></div>
      <div class="numpad" id="numpad">
        ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(k => {
          if (k === '') return '<div class="numpad-btn empty"></div>';
          if (k === '⌫') return `<div class="numpad-btn backspace" data-key="back">⌫</div>`;
          return `<div class="numpad-btn" data-key="${k}">${k}</div>`;
        }).join('')}
      </div>
    </div>`;

  const dots = app.querySelectorAll('.pin-dot');
  const errorEl = document.getElementById('pin-error');

  function updateDots() {
    dots.forEach((d, i) => d.classList.toggle('filled', i < digits.length));
  }

  document.getElementById('numpad').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-key]');
    if (!btn || locked) return;

    const key = btn.dataset.key;

    if (key === 'back') {
      digits = digits.slice(0, -1);
      updateDots();
      errorEl.textContent = '';
      return;
    }

    if (digits.length >= 4) return;
    digits += key;
    updateDots();

    if (digits.length === 4) {
      // Auto-submit
      locked = true;
      try {
        const result = await verifyPin(digits);
        setToken(result.token);
        showEditor();
      } catch (err) {
        // Shake dots
        const dotsContainer = document.getElementById('pin-dots');
        dotsContainer.classList.add('shake');
        setTimeout(() => dotsContainer.classList.remove('shake'), 400);

        errorEl.textContent = err.message || 'Incorrect PIN';
        digits = '';
        updateDots();
        locked = false;

        // If rate-limited, disable for a while
        if (err.status === 429) {
          locked = true;
          setTimeout(() => { locked = false; }, 60000);
        }
      }
    }
  });
}

// ================================================================
//  EDITOR
// ================================================================

async function showEditor() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="container"><p class="loading">Loading…</p></div>';

  try {
    data = await fetchData();
    renderEditor();
  } catch (e) {
    app.innerHTML = '<div class="container"><p class="loading">Failed to load data.</p></div>';
  }
}

async function refreshData() {
  try {
    data = await fetchData();
  } catch { /* keep existing data */ }
}

function renderEditor() {
  const app = document.getElementById('app');
  const mondayStr = formatDate(currentMonday);
  const isCurrent = mondayStr === formatDate(thisWeekMonday);
  const rate = getRateForWeek(currentMonday, data.rates);
  const weekDays = getWeekDays(currentMonday);
  const todayStr = today();

  const riderCalcs = data.riders.map(r => ({
    rider: r,
    calc: calculateRiderWeek(r, currentMonday, data)
  }));

  const totalWeekDue = riderCalcs.reduce((s, rc) => s + rc.calc.weekDue, 0);
  const totalCollected = riderCalcs.reduce((s, rc) => s + rc.calc.paidThisWeek, 0);
  const totalToCollect = riderCalcs.reduce((s, rc) => s + Math.max(0, rc.calc.balance), 0);

  // ── Mark-all pill states ──
  const markAllStates = weekDays.map((d, i) => {
    const dateStr = formatDate(d);
    const presentCount = data.riders.filter(r =>
      data.attendance.some(a => a.rider_id === r.id && a.date === dateStr)
    ).length;
    return { dateStr, presentCount, total: data.riders.length };
  });

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S'];

  app.innerHTML = `
    <div class="container">
      <!-- Header -->
      <div class="header-bar">
        <a href="/" class="home-link">Home</a>
        <div class="header-actions">
          <span class="saved-indicator" id="saved-ind">Saved ✓</span>
          <button class="settings-toggle" id="settings-btn">Settings</button>
        </div>
      </div>
      <h1 class="page-title">Edit</h1>

      <!-- Settings Panel -->
      <div class="settings-panel ${settingsOpen ? 'open' : ''}" id="settings-panel">
        <div class="card">
          ${data.riders.map(r => `
            <div class="setting-group">
              <label class="setting-label">Rider name</label>
              <input class="setting-input" type="text" value="${r.name}" data-rider-id="${r.id}" data-field="name" maxlength="50" />
            </div>
          `).join('')}
          <div class="setting-group">
            <label class="setting-label">Rate per day (₹)</label>
            <input class="setting-input" type="number" id="rate-input" value="${rate}" min="0" max="100000" inputmode="numeric" />
            <div class="setting-help">Applies from the week shown onward</div>
          </div>
          <button class="btn btn-sm btn-outline mt-12" id="export-btn">Export CSV</button>
          <button class="btn btn-sm btn-danger mt-12" id="lock-btn">Lock</button>
        </div>
      </div>

      <!-- Week nav -->
      <div class="week-nav">
        <button class="nav-btn" id="prev-week">‹</button>
        <div class="week-display">
          <span class="week-range" id="week-range">${formatWeekRange(currentMonday)}</span>
          <span class="week-rate">${formatCurrency(rate)} per day</span>
        </div>
        <button class="nav-btn" id="next-week">›</button>
      </div>
      ${isCurrent ? '' : '<a href="#" class="back-link" id="back-to-current">Back to this week</a>'}

      <!-- Summary -->
      <div class="summary-tiles">
        <div class="tile">
          <div class="tile-label">This week</div>
          <div class="tile-value">${formatCurrency(totalWeekDue)}</div>
        </div>
        <div class="tile">
          <div class="tile-label">Collected</div>
          <div class="tile-value">${formatCurrency(totalCollected)}</div>
        </div>
        <div class="tile">
          <div class="tile-label">To collect</div>
          <div class="tile-value">${formatCurrency(totalToCollect)}</div>
        </div>
      </div>

      <!-- Mark everyone -->
      <div class="card">
        <div class="mark-all-label">Mark everyone</div>
        <div class="day-pills">
          ${weekDays.map((d, i) => {
            const dateStr = formatDate(d);
            const st = markAllStates[i];
            let cls = 'pill interactive';
            if (st.presentCount === st.total) cls += ' filled';
            else if (st.presentCount > 0) cls += ' partial-fill';
            if (dateStr === todayStr) cls += ' today';
            return `
              <div class="${cls}" data-action="mark-all" data-date="${dateStr}">
                <span class="pill-label">${DAY_LABELS[i]}</span>
                <span class="pill-date">${d.getDate()}</span>
              </div>`;
          }).join('')}
        </div>
      </div>

      <!-- Rider cards -->
      ${riderCalcs.map(({ rider, calc }) => renderEditRiderCard(rider, calc, todayStr)).join('')}

      <!-- Footer -->
      <div class="page-footer">
        <p>Last updated ${formatDateTime(data.lastModified || new Date().toISOString())}</p>
      </div>
    </div>`;

  bindEditorEvents();
}

function renderEditRiderCard(rider, calc, todayStr) {
  const bl = balanceLabel(calc.balance);
  const prevBl = calc.previousBalance < 0
    ? { label: 'Advance carried', value: formatCurrency(Math.abs(calc.previousBalance)), cls: 'advance' }
    : { label: 'Carried forward', value: formatCurrency(calc.previousBalance), cls: '' };

  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S'];

  const pillsHTML = calc.dayDetails.map(d => {
    let cls = 'pill interactive';
    if (d.present) cls += ' filled';
    if (d.dateStr === todayStr) cls += ' today';
    return `
      <div class="${cls}" data-action="toggle-attendance" data-rider="${rider.id}" data-date="${d.dateStr}">
        <span class="pill-label">${d.label}</span>
        <span class="pill-date">${d.date.getDate()}</span>
      </div>`;
  }).join('');

  const draft = draftAmounts[rider.id] || '';
  const fillAmount = calc.balance > 0 ? calc.balance : '';

  const paymentsHTML = calc.payments.map(p =>
    `<div class="payment-item">
      <span>${formatShortDate(new Date(p.date + 'T00:00:00'))} — ${formatCurrency(p.amount)}</span>
      <button class="payment-remove" data-action="remove-payment" data-payment-id="${p.id}">✕</button>
    </div>`
  ).join('');

  return `
    <div class="card" data-rider-card="${rider.id}">
      <div class="rider-header">
        <span class="rider-name">${rider.name}</span>
        ${badgeHTML(calc.status)}
      </div>
      <div class="day-pills">${pillsHTML}</div>
      <div class="breakdown">
        <div class="breakdown-row">
          <span>${calc.days} day${calc.days !== 1 ? 's' : ''} × ${formatCurrency(calc.rate)}</span>
          <span>${formatCurrency(calc.weekDue)}</span>
        </div>
        <div class="breakdown-row">
          <span>${prevBl.label}</span>
          <span class="${prevBl.cls}">${prevBl.value}</span>
        </div>
        <div class="breakdown-row">
          <span>Paid this week</span>
          <span>${formatCurrency(calc.paidThisWeek)}</span>
        </div>
        <div class="breakdown-row bold">
          <span>${bl.label}</span>
          <span class="${bl.cls}">${bl.value}</span>
        </div>
      </div>
      ${paymentsHTML ? `<div class="payment-list">${paymentsHTML}</div>` : ''}
      <div class="payment-form">
        <input type="number" inputmode="numeric" placeholder="₹ Amount"
               value="${draft}" data-rider-amount="${rider.id}" min="1" max="100000" />
        <button class="btn btn-sm btn-primary" data-action="add-payment" data-rider="${rider.id}">Add</button>
      </div>
      ${fillAmount ? `<button class="fill-btn" data-action="fill-amount" data-rider="${rider.id}" data-amount="${fillAmount}">Fill full ${formatCurrency(fillAmount)}</button>` : ''}
      <button class="btn btn-sm btn-outline reminder-btn" data-action="send-reminder" data-rider="${rider.id}">Send reminder</button>
    </div>`;
}

// ── Event binding ──

function bindEditorEvents() {
  const app = document.getElementById('app');

  // Week navigation
  document.getElementById('prev-week')?.addEventListener('click', () => { currentMonday.setDate(currentMonday.getDate() - 7); renderEditor(); });
  document.getElementById('next-week')?.addEventListener('click', () => { currentMonday.setDate(currentMonday.getDate() + 7); renderEditor(); });
  document.getElementById('back-to-current')?.addEventListener('click', (e) => { e.preventDefault(); currentMonday = new Date(thisWeekMonday); renderEditor(); });

  // Settings toggle
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    settingsOpen = !settingsOpen;
    document.getElementById('settings-panel').classList.toggle('open', settingsOpen);
  });

  // Settings inputs — rider names (blur to save)
  app.querySelectorAll('[data-field="name"]').forEach(input => {
    input.addEventListener('blur', async () => {
      const riderId = input.dataset.riderId;
      const newName = input.value.trim();
      if (!newName) return;
      const rider = data.riders.find(r => r.id === riderId);
      if (rider && rider.name !== newName) {
        try {
          await writeAction('update-rider', { riderId, name: newName });
          rider.name = newName;
          flashSaved();
        } catch (e) { handleWriteError(e); }
      }
    });
  });

  // Rate input (blur to save)
  document.getElementById('rate-input')?.addEventListener('blur', async () => {
    const input = document.getElementById('rate-input');
    const newRate = parseInt(input.value, 10);
    if (isNaN(newRate) || newRate < 0) return;
    const mondayStr = formatDate(currentMonday);
    try {
      await writeAction('update-rate', { from: mondayStr, rate: newRate });
      await refreshData();
      flashSaved();
      renderEditor();
    } catch (e) { handleWriteError(e); }
  });

  // Lock button
  document.getElementById('lock-btn')?.addEventListener('click', () => {
    clearToken();
    showPinScreen();
  });

  // Export CSV
  document.getElementById('export-btn')?.addEventListener('click', exportCSV);

  // Delegated clicks for pills, payments, reminders
  app.addEventListener('click', handleClick);

  // Preserve draft amounts on input
  app.querySelectorAll('[data-rider-amount]').forEach(input => {
    input.addEventListener('input', () => {
      draftAmounts[input.dataset.riderAmount] = input.value;
    });
  });
}

async function handleClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;

  const action = target.dataset.action;

  switch (action) {

    case 'toggle-attendance': {
      const riderId = target.dataset.rider;
      const date = target.dataset.date;
      // Optimistic toggle
      const idx = data.attendance.findIndex(a => a.rider_id === riderId && a.date === date);
      if (idx >= 0) data.attendance.splice(idx, 1);
      else data.attendance.push({ rider_id: riderId, date, id: 'temp-' + Date.now(), created_at: new Date().toISOString() });
      renderEditor();
      try {
        await writeAction('toggle-attendance', { riderId, date });
        await refreshData();
        flashSaved();
        renderEditor();
      } catch (e) { handleWriteError(e); }
      break;
    }

    case 'mark-all': {
      const date = target.dataset.date;
      const allPresent = data.riders.every(r =>
        data.attendance.some(a => a.rider_id === r.id && a.date === date)
      );
      const riderIds = data.riders.map(r => r.id);
      // Optimistic
      if (allPresent) {
        data.attendance = data.attendance.filter(a => a.date !== date);
      } else {
        for (const r of data.riders) {
          if (!data.attendance.some(a => a.rider_id === r.id && a.date === date)) {
            data.attendance.push({ rider_id: r.id, date, id: 'temp-' + Date.now() + r.id, created_at: new Date().toISOString() });
          }
        }
      }
      renderEditor();
      try {
        await writeAction('bulk-attendance', { date, riderIds, present: !allPresent });
        await refreshData();
        flashSaved();
        renderEditor();
      } catch (e) { handleWriteError(e); }
      break;
    }

    case 'add-payment': {
      const riderId = target.dataset.rider;
      const input = document.querySelector(`[data-rider-amount="${riderId}"]`);
      const amount = parseInt(input?.value, 10);
      if (!amount || amount <= 0) { showToast('Enter an amount'); return; }
      const mondayStr = formatDate(currentMonday);
      const dateStr = today();
      // Optimistic
      data.payments.push({ rider_id: riderId, week: mondayStr, date: dateStr, amount, id: 'temp-' + Date.now(), created_at: new Date().toISOString() });
      draftAmounts[riderId] = '';
      renderEditor();
      try {
        await writeAction('add-payment', { riderId, week: mondayStr, date: dateStr, amount });
        await refreshData();
        flashSaved();
        renderEditor();
      } catch (e) { handleWriteError(e); }
      break;
    }

    case 'remove-payment': {
      const paymentId = target.dataset.paymentId;
      if (!confirm('Remove this payment?')) return;
      const idx = data.payments.findIndex(p => p.id === paymentId);
      let removed = null;
      if (idx >= 0) { removed = data.payments.splice(idx, 1)[0]; }
      renderEditor();
      try {
        await writeAction('remove-payment', { paymentId });
        await refreshData();
        flashSaved();
        renderEditor();
      } catch (e) {
        if (removed) data.payments.push(removed);
        handleWriteError(e);
      }
      break;
    }

    case 'fill-amount': {
      const riderId = target.dataset.rider;
      const amount = target.dataset.amount;
      const input = document.querySelector(`[data-rider-amount="${riderId}"]`);
      if (input) { input.value = amount; draftAmounts[riderId] = amount; }
      break;
    }

    case 'send-reminder': {
      const riderId = target.dataset.rider;
      sendReminder(riderId);
      break;
    }
  }
}

// ── Reminder ──

function sendReminder(riderId) {
  const rider = data.riders.find(r => r.id === riderId);
  if (!rider) return;
  const calc = calculateRiderWeek(rider, currentMonday, data);
  const weekLabel = formatWeekRange(currentMonday);

  let msg = `🚗 School Ride — ${weekLabel}\n\n`;
  msg += `${rider.name}\n`;
  msg += `${calc.days} day${calc.days !== 1 ? 's' : ''} × ${formatCurrency(calc.rate)} = ${formatCurrency(calc.weekDue)}\n`;
  if (calc.previousBalance !== 0) {
    msg += calc.previousBalance < 0
      ? `Advance carried: ${formatCurrency(Math.abs(calc.previousBalance))}\n`
      : `Carried forward: ${formatCurrency(calc.previousBalance)}\n`;
  }
  if (calc.paidThisWeek > 0) msg += `Paid this week: ${formatCurrency(calc.paidThisWeek)}\n`;
  msg += `\n`;
  if (calc.balance > 0) msg += `💰 Amount due: ${formatCurrency(calc.balance)}`;
  else if (calc.balance < 0) msg += `✅ Advance: ${formatCurrency(Math.abs(calc.balance))}`;
  else msg += `✅ All settled!`;

  if (navigator.share) {
    navigator.share({ text: msg }).catch(() => {});
  } else {
    navigator.clipboard.writeText(msg).then(() => showToast('Copied!')).catch(() => showToast('Could not copy'));
  }
}

// ── Export CSV ──

function exportCSV() {
  const allWeeks = getAllWeekMondays(data);
  const rows = [['Week Start', 'Rider', 'Days', 'Rate', 'Due', 'Paid', 'Balance']];

  for (const rider of data.riders) {
    let running = 0;
    for (const wStr of allWeeks) {
      const wMon = new Date(wStr + 'T00:00:00');
      const calc = calculateRiderWeek(rider, wMon, data);
      if (calc.days === 0 && calc.paidThisWeek === 0) continue;
      running += calc.weekDue - calc.paidThisWeek;
      rows.push([wStr, rider.name, calc.days, calc.rate, calc.weekDue, calc.paidThisWeek, running]);
    }
  }

  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ride-tracker-${formatDate(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV downloaded');
}

// ── Helpers ──

function flashSaved() {
  const ind = document.getElementById('saved-ind');
  if (!ind) return;
  ind.classList.add('show');
  setTimeout(() => ind.classList.remove('show'), 1500);
}

function handleWriteError(err) {
  if (err.status === 401 || (err.message && err.message.includes('expired'))) {
    clearToken();
    showToast('Session expired. Please enter PIN again.');
    setTimeout(() => showPinScreen(), 1000);
    return;
  }
  showToast(err.message || 'Save failed');
  // Re-fetch to revert optimistic changes
  refreshData().then(renderEditor);
}
