// The Progress tab: overview numbers, the activity heatmap, the bodyweight log
// and the backup card.

import { state, saveData } from './state.js';
import { select, escapeHtml, toDateKey, formatDuration, formatVolume } from './utils.js';
import { HEATMAP_WEEKS } from './constants.js';
import { registerRenderer } from './navigation.js';
import { showCalendarPopup } from './history.js';
import { BACKUP_PARTS, exportSelectedData, importBackupFile } from './backup.js';
import { importHistoryCsv } from './csv-import.js';

const getScreen = () => select('#progress-screen');

/* ==========================================================================
   Activity heatmap (one square per day, a column per week)
   ========================================================================== 
*/

/** How bright a day's square is, 0 (rest day) to 4, relative to your biggest day. */
function heatLevel(volume, biggestVolume) {
  if (!volume) return 0;
  const share = volume / biggestVolume;
  if (share >= 0.75) return 4;
  if (share >= 0.5) return 3;
  if (share >= 0.25) return 2;
  return 1;
}

/** Month names above the squares, each centred over its weeks.
 *  A month with only one visible week gets no label (too narrow). 
 */
function renderMonthLabels(weekMonths) {
  let labels = '';
  for (let week = 0; week < weekMonths.length;) {
    let lastWeek = week;
    while (lastWeek + 1 < weekMonths.length
      && weekMonths[lastWeek + 1].getMonth() === weekMonths[week].getMonth()) lastWeek++;

    const weekCount = lastWeek - week + 1;
    if (weekCount >= 2) {
      const name = weekMonths[week].toLocaleDateString(undefined, { month: 'short' });
      labels += `<span style="grid-column:${week + 1}/span ${weekCount}">${name}</span>`;
    }
    week = lastWeek + 1;
  }
  return labels;
}

function buildHeatmap(history) {
  const volumeByDay = {};
  history.forEach(entry => {
    const key = toDateKey(entry.startedAt);
    volumeByDay[key] = (volumeByDay[key] || 0) + entry.volume;
  });
  const biggestVolume = Math.max(1, ...Object.values(volumeByDay));

  const now = new Date();
  const firstSunday = new Date(now);
  firstSunday.setHours(0, 0, 0, 0);
  firstSunday.setDate(firstSunday.getDate() - firstSunday.getDay() - (HEATMAP_WEEKS - 1) * 7);

  let squares = '';
  const weekMonths = [];   // a week belongs to the month its Thursday is in

  for (let week = 0; week < HEATMAP_WEEKS; week++) {
    const sunday = new Date(firstSunday);
    sunday.setDate(firstSunday.getDate() + week * 7);
    const thursday = new Date(sunday);
    thursday.setDate(sunday.getDate() + 4);
    weekMonths.push(thursday);

    for (let weekday = 0; weekday < 7; weekday++) {
      const day = new Date(sunday);
      day.setDate(sunday.getDate() + weekday);
      if (day > now) {
        squares += '<i class="heatmap-day future"></i>';
        continue;
      }
      const level = heatLevel(volumeByDay[toDateKey(day)] || 0, biggestVolume);
      squares += `<i class="heatmap-day ${level ? 'heat-level-' + level : ''}" title="${toDateKey(day)}"></i>`;
    }
  }
  return { squares, monthLabels: renderMonthLabels(weekMonths) };
}

/* ==========================================================================
   Bodyweight table
   ========================================================================== 
*/

function renderBodyweightTable(recentEntries) {
  if (!recentEntries.length) {
    return '<tr><td class="empty-message">No entries yet. Log your first weigh-in above.</td></tr>';
  }

  const rows = recentEntries.map((entry, index) => {
    const earlier = recentEntries[index + 1];   // the list is newest first
    const difference = earlier ? entry.weight - earlier.weight : null;
    const changeText = difference === null ? '–' : (difference > 0 ? '+' : '') + difference.toFixed(1);
    return `
      <tr data-date="${entry.date}">
        <td>${entry.date}</td>
        <td class="number-cell">${entry.weight} kg</td>
        <td class="number-cell">${changeText}</td>
      </tr>`;
  }).join('');

  return `<tr><th>Date</th><th class="number-cell">Weight</th><th class="number-cell">Change</th></tr>${rows}`;
}

/* ==========================================================================
   Drawing the screen
   ========================================================================== 
*/

function renderProgress() {
  const history = state.data.history;
  const totalMilliseconds = history.reduce((sum, entry) => sum + (entry.endedAt - entry.startedAt), 0);
  const totalVolume = history.reduce((sum, entry) => sum + entry.volume, 0);
  const averageDuration = history.length ? formatDuration(totalMilliseconds / history.length) : '–';

  const { squares, monthLabels } = buildHeatmap(history);
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(name => `<span>${name}</span>`).join('');
  const legend = 'Less <i class="heatmap-legend-box"></i><i class="heatmap-legend-box heat-level-1"></i>'
    + '<i class="heatmap-legend-box heat-level-2"></i><i class="heatmap-legend-box heat-level-3"></i>'
    + '<i class="heatmap-legend-box heat-level-4"></i> More';

  const recentWeights = state.data.bodyweight.slice().reverse().slice(0, 12);
  const backupButtons = BACKUP_PARTS.map(part => `
    <button class="backup-part ${state.backupSelection[part.key] ? 'active' : ''}" data-part="${part.key}">${part.label}</button>`).join('');

  getScreen().innerHTML = `
    <div class="card">
      <h2>Overview</h2>
      <div class="stats-row">
        <div class="stat"><b class="stat-value">${history.length}</b><span class="stat-label">Workouts</span></div>
        <div class="stat"><b class="stat-value">${formatDuration(totalMilliseconds)}</b><span class="stat-label">Time spent</span></div>
        <div class="stat"><b class="stat-value">${formatVolume(totalVolume)}</b><span class="stat-label">Volume (kg)</span></div>
      </div>
    </div>

    <div class="card activity-card" data-action="open-calendar" style="--heatmap-weeks:${HEATMAP_WEEKS}">
      <div class="row row-spread activity-header"><h3>Activity</h3><span>Calendar ›</span></div>
      <div class="heatmap-months">${monthLabels}</div>
      <div class="heatmap">
        <div class="heatmap-weekdays">${weekdayNames}</div>
        <div class="heatmap-grid">${squares}</div>
      </div>
      <div class="heatmap-legend">
        <span>Avg: ${averageDuration}</span>
        <span>${legend}</span>
      </div>
    </div>

    <div class="card">
      <h2>Bodyweight</h2>
      <div class="bodyweight-form">
        <input type="date" id="bodyweight-date" value="${toDateKey(Date.now())}">
        <input type="number" id="bodyweight-kg" inputmode="decimal" step="0.1" placeholder="kg">
        <button class="button-primary-small" data-action="log-weight">Log</button>
      </div>
      <table class="weight-table">${renderBodyweightTable(recentWeights)}</table>
      ${recentWeights.length ? '<p class="table-hint">Tap an entry to delete it.</p>' : ''}
    </div>

    <div class="card">
      <h3>Backup</h3>
      <p>Pick what to export or import. Importing adds to what you already have and skips duplicates.</p>
      <div class="backup-parts">${backupButtons}</div>
      <div class="two-columns backup-actions">
        <button class="button-secondary" data-action="export">Export</button>
        <button class="button-secondary" data-action="import">Import</button>
      </div>
      <input type="file" id="backup-file" accept="application/json" hidden>
      <button class="button-secondary csv-import-button" data-action="import-csv">Import history from Strong / Hevy (CSV)</button>
      <input type="file" id="csv-file" accept=".csv,text/csv" hidden>
    </div>`;
}

/* ==========================================================================
   Taps
   ========================================================================== 
*/

function logWeight() {
  const date = select('#bodyweight-date').value;
  const weight = parseFloat(select('#bodyweight-kg').value);
  if (!date || !weight) return;

  // One weigh-in per day: logging the same date again replaces it
  state.data.bodyweight = state.data.bodyweight.filter(entry => entry.date !== date);
  state.data.bodyweight.push({ date, weight });
  state.data.bodyweight.sort((a, b) => a.date.localeCompare(b.date));
  saveData();
  renderProgress();
}

function deleteWeight(date) {
  if (!confirm('Delete this entry?')) return;
  state.data.bodyweight = state.data.bodyweight.filter(entry => entry.date !== date);
  saveData();
  renderProgress();
}

function toggleBackupPart(button) {
  const key = button.dataset.part;
  state.backupSelection[key] = !state.backupSelection[key];
  button.classList.toggle('active', state.backupSelection[key]);
}

function handleClick(event) {
  const target = event.target;
  const partButton = target.closest('[data-part]');
  if (partButton) return toggleBackupPart(partButton);

  const weightRow = target.closest('tr[data-date]');
  if (weightRow) return deleteWeight(weightRow.dataset.date);

  const actionElement = target.closest('[data-action]');
  switch (actionElement?.dataset.action) {
    case 'open-calendar': return showCalendarPopup();
    case 'log-weight': return logWeight();
    case 'export': return exportSelectedData();
    case 'import': return select('#backup-file').click();
    case 'import-csv': return select('#csv-file').click();
  }
}

function handleFilePicked(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;

  if (event.target.id === 'backup-file') importBackupFile(file);
  if (event.target.id === 'csv-file') importHistoryCsv(file);
  event.target.value = '';   // so picking the same file again still triggers
}

export function initProgress() {
  registerRenderer('progress', renderProgress);
  getScreen().addEventListener('click', handleClick);
  getScreen().addEventListener('change', handleFilePicked);
}
