/* ================================================
   View page — read-only weekly breakdown
   ================================================ */

import { fetchData } from './api.js';
import {
  getCurrentWeekMonday, getWeekDays, formatDate, formatShortDate,
  formatWeekRange, formatCurrency, formatDateTime, getRateForWeek,
  calculateRiderWeek, buildRiderHistory, buildOverallTotals,
  badgeHTML, balanceLabel, today
} from './utils.js';

let data = null;
let currentMonday = null;
let thisWeekMonday = null;

// ── Boot ──
document.addEventListener('DOMContentLoaded', init);

async function init() {
  thisWeekMonday = getCurrentWeekMonday();
  currentMonday  = new Date(thisWeekMonday);

  document.getElementById('prev-week').addEventListener('click', () => navigateWeek(-1));
  document.getElementById('next-week').addEventListener('click', () => navigateWeek(1));
  document.getElementById('back-to-current').addEventListener('click', (e) => {
    e.preventDefault();
    currentMonday = new Date(thisWeekMonday);
    render();
  });

  try {
    data = await fetchData();
    render();
  } catch (e) {
    document.getElementById('app').innerHTML =
      '<p class="loading">Could not load data. Please try again.</p>';
  }
}

function navigateWeek(direction) {
  currentMonday.setDate(currentMonday.getDate() + direction * 7);
  render();
}

// ── Render ──

function render() {
  const mondayStr = formatDate(currentMonday);
  const isCurrent = mondayStr === formatDate(thisWeekMonday);
  const rate = getRateForWeek(currentMonday, data.rates);

  // Week header
  document.getElementById('week-range').textContent = formatWeekRange(currentMonday);
  document.getElementById('week-rate').textContent = `${formatCurrency(rate)} per day`;
  document.getElementById('back-to-current').style.display = isCurrent ? 'none' : 'inline-block';

  // Calculate per rider
  const riderCalcs = data.riders.map(r => ({
    rider: r,
    calc: calculateRiderWeek(r, currentMonday, data)
  }));

  // Summary tiles
  const totalWeekDue = riderCalcs.reduce((s, rc) => s + rc.calc.weekDue, 0);
  const totalCollected = riderCalcs.reduce((s, rc) => s + rc.calc.paidThisWeek, 0);
  const totalToCollect = riderCalcs.reduce((s, rc) => s + Math.max(0, rc.calc.balance), 0);

  document.getElementById('total-due').textContent = formatCurrency(totalWeekDue);
  document.getElementById('total-collected').textContent = formatCurrency(totalCollected);
  document.getElementById('total-to-collect').textContent = formatCurrency(totalToCollect);

  // Rider cards
  const cardsHTML = riderCalcs.map(({ rider, calc }) => renderRiderCard(rider, calc)).join('');
  document.getElementById('rider-cards').innerHTML = cardsHTML;

  // History
  renderHistory();

  // Overall
  renderOverall();

  // Footer
  document.getElementById('last-updated').textContent =
    `Last updated ${formatDateTime(data.lastModified || new Date().toISOString())}`;
}

function renderRiderCard(rider, calc) {
  const bl = balanceLabel(calc.balance);
  const pillsHTML = calc.dayDetails.map(d => {
    const classes = ['pill'];
    if (d.present) classes.push('filled');
    return `
      <div class="${classes.join(' ')}">
        <span class="pill-label">${d.label}</span>
        <span class="pill-date">${d.date.getDate()}</span>
      </div>`;
  }).join('');

  const paymentsHTML = calc.payments.length > 0
    ? `<div class="payment-list">
        ${calc.payments.map(p =>
          `<div class="payment-item">
            <span>${formatShortDate(new Date(p.date + 'T00:00:00'))}</span>
            <span>${formatCurrency(p.amount)}</span>
          </div>`
        ).join('')}
       </div>`
    : '';

  // Previous balance label
  const prevBl = calc.previousBalance < 0
    ? { label: 'Advance carried', value: formatCurrency(Math.abs(calc.previousBalance)), cls: 'advance' }
    : { label: 'Carried forward', value: formatCurrency(calc.previousBalance), cls: '' };

  return `
    <div class="card">
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
      ${paymentsHTML}
    </div>`;
}

// ── History ──

function renderHistory() {
  const container = document.getElementById('history-section');
  let html = '<h2 class="history-title">Week-by-week history</h2>';

  for (const rider of data.riders) {
    const rows = buildRiderHistory(rider, data);
    if (rows.length === 0) continue;

    // Totals
    const totalDue  = rows.reduce((s, r) => s + r.due, 0);
    const totalPaid = rows.reduce((s, r) => s + r.paid, 0);
    const outstanding = totalDue - totalPaid;

    html += `
      <div class="card" style="padding:0;">
        <div class="collapsible-header" onclick="this.classList.toggle('open');this.nextElementSibling.classList.toggle('open')" style="padding:12px 16px;">
          <span class="rider-name">${rider.name}</span>
          <span class="chevron">›</span>
        </div>
        <div class="collapsible-body" style="padding:0 16px 12px;">
          <table class="history-table">
            <thead>
              <tr><th>Week</th><th>Days</th><th>Rate</th><th>Due</th><th>Paid</th><th>Balance</th></tr>
            </thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td>${r.weekLabel.split('–')[0].trim()}</td>
                  <td>${r.days}</td>
                  <td>${formatCurrency(r.rate)}</td>
                  <td>${formatCurrency(r.due)}</td>
                  <td>${formatCurrency(r.paid)}</td>
                  <td>${r.balance < 0 ? '<span class="advance">' + formatCurrency(Math.abs(r.balance)) + ' adv</span>' : formatCurrency(r.balance)}</td>
                </tr>
              `).join('')}
              <tr class="totals-row">
                <td>Total</td><td></td><td></td>
                <td>${formatCurrency(totalDue)}</td>
                <td>${formatCurrency(totalPaid)}</td>
                <td>${outstanding < 0 ? '<span class="advance">' + formatCurrency(Math.abs(outstanding)) + ' adv</span>' : formatCurrency(outstanding)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }

  container.innerHTML = html;
}

// ── Overall ──

function renderOverall() {
  const totals = buildOverallTotals(data);
  let grandOutstanding = 0;

  let html = `
    <div class="card">
      <div class="overall-title">Overall</div>`;

  for (const { rider, totalDue, totalPaid, outstanding } of totals) {
    grandOutstanding += outstanding;
    const bl = outstanding < 0
      ? `<span class="advance">Advance ${formatCurrency(Math.abs(outstanding))}</span>`
      : formatCurrency(outstanding);
    html += `
      <div class="overall-row">
        <span>${rider.name}</span>
        <span>Due ${formatCurrency(totalDue)} · Paid ${formatCurrency(totalPaid)} · ${outstanding < 0 ? 'Adv' : 'Bal'} ${formatCurrency(Math.abs(outstanding))}</span>
      </div>`;
  }

  const grandLabel = grandOutstanding < 0
    ? `Advance ${formatCurrency(Math.abs(grandOutstanding))}`
    : `To collect ${formatCurrency(grandOutstanding)}`;
  html += `
      <div class="overall-row grand">
        <span>Grand total</span>
        <span>${grandLabel}</span>
      </div>
    </div>`;

  document.getElementById('overall-card').innerHTML = html;
}
