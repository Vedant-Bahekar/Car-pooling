/* ================================================
   Shared utilities — dates, formatting, calculations
   ================================================ */

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S'];

/**
 * Get the Monday of the week containing `date`.
 * If `date` is Sunday, returns the previous Monday (the week that just ended).
 */
export function getMonday(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();            // 0=Sun … 6=Sat
  const offset = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + offset);
  return d;
}

/** Monday of the current week (if Sunday, the week that just ended). */
export function getCurrentWeekMonday() {
  return getMonday(new Date());
}

/** Return six Date objects: Mon – Sat of the week starting at `monday`. */
export function getWeekDays(monday) {
  const days = [];
  for (let i = 0; i < 6; i++) {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}

/** YYYY-MM-DD */
export function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** "5 Oct" */
export function formatShortDate(d) {
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** "5 Oct – 10 Oct 2026" */
export function formatWeekRange(monday) {
  const sat = new Date(monday);
  sat.setDate(sat.getDate() + 5);
  const opts = { day: 'numeric', month: 'short' };
  const monStr = monday.toLocaleDateString('en-IN', opts);
  const satStr = sat.toLocaleDateString('en-IN', { ...opts, year: 'numeric' });
  return `${monStr} – ${satStr}`;
}

/** ₹1,250 (Indian grouping) */
export function formatCurrency(amount) {
  if (amount === 0) return '₹0';
  const prefix = amount < 0 ? '-₹' : '₹';
  return prefix + Math.abs(amount).toLocaleString('en-IN');
}

/** "10 Oct 2026, 4:36 pm" */
export function formatDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

/** Today as YYYY-MM-DD */
export function today() {
  return formatDate(new Date());
}

/** Are two YYYY-MM-DD strings the same? */
export function isSameDate(a, b) {
  return a === b;
}

// ── Rate lookup ──

/** Get the rate that applies to a given week (Monday). */
export function getRateForWeek(monday, rates) {
  const mondayStr = formatDate(monday);
  const sorted = [...rates].sort((a, b) => a.from_date.localeCompare(b.from_date));
  let rate = 0;
  for (const r of sorted) {
    if (r.from_date <= mondayStr) rate = r.rate;
  }
  return rate;
}

// ── Rider calculations ──

/**
 * Compute all values for rider `r` in week starting at `monday`.
 * Returns { days, rate, weekDue, previousBalance, paidThisWeek, total, balance, status, dayDetails, payments }
 */
export function calculateRiderWeek(rider, monday, data) {
  const mondayStr = formatDate(monday);
  const weekDays = getWeekDays(monday);
  const weekDateStrs = weekDays.map(formatDate);

  // Filter data for this rider
  const riderAttendance = data.attendance.filter(a => a.rider_id === rider.id);
  const riderPayments   = data.payments.filter(p => p.rider_id === rider.id);

  // Days rode this week
  const dayDetails = weekDays.map((d, i) => {
    const dateStr = weekDateStrs[i];
    const present = riderAttendance.some(a => a.date === dateStr);
    return { date: d, dateStr, label: DAY_LABELS[i], present };
  });
  const days = dayDetails.filter(d => d.present).length;

  // Rate for this week
  const rate = getRateForWeek(monday, data.rates);
  const weekDue = days * rate;

  // ── Previous balance ──
  // Gather all unique week-Mondays from attendance & payments that are BEFORE this week
  const allWeekMondays = getAllWeekMondays(data);
  let totalDueBefore = 0;
  for (const wStr of allWeekMondays) {
    if (wStr >= mondayStr) continue;
    const wMon = new Date(wStr + 'T00:00:00');
    const wRate = getRateForWeek(wMon, data.rates);
    const wDays = getWeekDays(wMon).map(formatDate);
    const count = wDays.filter(ds => riderAttendance.some(a => a.date === ds)).length;
    totalDueBefore += count * wRate;
  }

  const totalPaidBefore = riderPayments
    .filter(p => p.week < mondayStr)
    .reduce((s, p) => s + p.amount, 0);

  const previousBalance = totalDueBefore - totalPaidBefore;

  // Paid this week
  const weekPayments = riderPayments.filter(p => p.week === mondayStr);
  const paidThisWeek = weekPayments.reduce((s, p) => s + p.amount, 0);

  const total   = previousBalance + weekDue;
  const balance = total - paidThisWeek;

  // Status
  let status;
  if (weekDue === 0 && previousBalance <= 0 && paidThisWeek === 0) {
    status = 'no-rides';
  } else if (balance <= 0 && total > 0) {
    status = 'paid';
  } else if (paidThisWeek > 0 && balance > 0) {
    status = 'partial';
  } else if (balance > 0) {
    status = 'pending';
  } else {
    status = 'no-rides';
  }

  return {
    days, rate, weekDue, previousBalance, paidThisWeek,
    total, balance, status, dayDetails, payments: weekPayments
  };
}

/**
 * Get sorted list of all week-Monday strings present in the data.
 */
export function getAllWeekMondays(data) {
  const set = new Set();
  for (const a of data.attendance) {
    set.add(formatDate(getMonday(new Date(a.date + 'T00:00:00'))));
  }
  for (const p of data.payments) {
    set.add(p.week);
  }
  return Array.from(set).sort();
}

/**
 * Build week-by-week history for a single rider.
 * Returns array of { weekStr, weekLabel, days, rate, due, paid, balance (running) }
 * Newest first. Only weeks with activity.
 */
export function buildRiderHistory(rider, data) {
  const allWeeks = getAllWeekMondays(data);
  const riderAtt = data.attendance.filter(a => a.rider_id === rider.id);
  const riderPay = data.payments.filter(p => p.rider_id === rider.id);

  let runningBalance = 0;
  const rows = [];

  for (const wStr of allWeeks) {
    const wMon = new Date(wStr + 'T00:00:00');
    const rate = getRateForWeek(wMon, data.rates);
    const wDays = getWeekDays(wMon).map(formatDate);
    const dayCount = wDays.filter(ds => riderAtt.some(a => a.date === ds)).length;
    const due = dayCount * rate;
    const paid = riderPay.filter(p => p.week === wStr).reduce((s, p) => s + p.amount, 0);

    if (dayCount === 0 && paid === 0) continue;

    runningBalance += due - paid;

    rows.push({
      weekStr: wStr,
      weekLabel: formatWeekRange(wMon),
      days: dayCount,
      rate,
      due,
      paid,
      balance: runningBalance
    });
  }

  return rows.reverse(); // newest first
}

/**
 * Build overall totals for all riders.
 * Returns array of { rider, totalDue, totalPaid, outstanding }
 */
export function buildOverallTotals(data) {
  return data.riders.map(rider => {
    const riderAtt = data.attendance.filter(a => a.rider_id === rider.id);
    const riderPay = data.payments.filter(p => p.rider_id === rider.id);
    const allWeeks = getAllWeekMondays(data);

    let totalDue = 0;
    for (const wStr of allWeeks) {
      const wMon = new Date(wStr + 'T00:00:00');
      const rate = getRateForWeek(wMon, data.rates);
      const wDays = getWeekDays(wMon).map(formatDate);
      totalDue += wDays.filter(ds => riderAtt.some(a => a.date === ds)).length * rate;
    }

    const totalPaid = riderPay.reduce((s, p) => s + p.amount, 0);
    return { rider, totalDue, totalPaid, outstanding: totalDue - totalPaid };
  });
}

/** Status badge HTML */
export function badgeHTML(status) {
  const map = {
    'paid':     ['Paid',     'badge-paid'],
    'partial':  ['Partial',  'badge-partial'],
    'pending':  ['Pending',  'badge-pending'],
    'no-rides': ['No rides', 'badge-norides']
  };
  const [label, cls] = map[status] || ['—', ''];
  return `<span class="badge ${cls}">${label}</span>`;
}

/** Balance label — shows "Advance" if negative */
export function balanceLabel(balance) {
  if (balance < 0) return { label: 'Advance', value: formatCurrency(Math.abs(balance)), cls: 'advance' };
  return { label: 'Balance due', value: formatCurrency(balance), cls: '' };
}

/** Toast utility */
export function showToast(message, duration = 2000) {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.innerHTML = '';
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, duration);
}
