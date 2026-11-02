// The History list (one card per finished workout) and the calendar popup.

import { state, saveData } from './state.js';
import {
  select, escapeHtml, toDateKey, formatDuration, formatVolume, findBestSet,
} from './utils.js';
import { createModal, isCloseClick } from './ui.js';

const getView = () => select('#history-view');

function renderHistoryCard(entry) {
  const startDate = new Date(entry.startedAt);
  const dateText = startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  const timeText = startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const exerciseLines = entry.exercises.map(exercise => {
    const best = findBestSet(exercise.sets);
    return `
      <div class="history-exercise">
        <span>${exercise.sets.length}× ${escapeHtml(exercise.name)}</span>
        <b>${best.kg ? best.kg + ' kg' : 'BW'} × ${best.reps}</b>
      </div>`;
  }).join('');

  return `
    <div class="card history-card">
      <button class="history-delete-button" data-action="delete-entry" data-entry-id="${entry.id}" aria-label="Delete">×</button>
      <h3>${escapeHtml(entry.name)}</h3>
      <div class="history-date">${dateText} at ${timeText}</div>
      ${exerciseLines}
      <div class="history-footer">${formatDuration(entry.endedAt - entry.startedAt)} · ${formatVolume(entry.volume)} kg</div>
    </div>`;
}

export function renderHistory() {
  if (!state.data.history.length) {
    getView().innerHTML = '<div class="empty-message">No workouts yet. Finish a session and it shows up here.</div>';
    return;
  }
  getView().innerHTML =
    '<button class="button-secondary calendar-button" data-action="open-calendar">📅 Calendar</button>'
    + state.data.history.map(renderHistoryCard).join('');
}

/* ==========================================================================
   Calendar popup: every month since your first workout, with a tick on
   the days you trained. Tap a day to see what you did.
   ========================================================================== 
*/

const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];   // the calendar starts on Monday

/** Groups the history by day: { '2026-10-06': [entry, ...] } */
function groupByDay(history) {
  const byDay = {};
  history.forEach(entry => {
    (byDay[toDateKey(entry.startedAt)] ||= []).push(entry);
  });
  return byDay;
}

function renderCalendarMonth(firstOfMonth, workoutsByDay, todayKey) {
  const year = firstOfMonth.getFullYear();
  const month = firstOfMonth.getMonth();
  const blanksBeforeFirst = (firstOfMonth.getDay() + 6) % 7;   // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  let cells = '<i class="calendar-blank"></i>'.repeat(blanksBeforeFirst);
  for (let day = 1; day <= daysInMonth; day++) {
    const dateKey = toDateKey(new Date(year, month, day));
    const hasWorkout = Boolean(workoutsByDay[dateKey]);
    const classes = 'calendar-day' + (hasWorkout ? ' has-workout' : '') + (dateKey === todayKey ? ' today' : '');
    cells += `<button class="${classes}" data-date="${dateKey}">${day}${hasWorkout ? '<em class="calendar-check">✓</em>' : ''}</button>`;
  }

  const title = firstOfMonth.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  return `<h3 class="calendar-month-title">${title}</h3><div class="calendar-grid">${cells}</div>`;
}

function describeDay(dateKey, workoutsByDay) {
  const [year, month, day] = dateKey.split('-').map(Number);
  const title = new Date(year, month - 1, day)
    .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const workouts = workoutsByDay[dateKey];

  const lines = workouts
    ? workouts.map(entry => `<div>${escapeHtml(entry.name)} · ${formatDuration(entry.endedAt - entry.startedAt)} · ${formatVolume(entry.volume)} kg</div>`).join('')
    : '<div>No workout</div>';
  return `<b class="calendar-info-title">${title}</b>${lines}`;
}

export function showCalendarPopup() {
  const history = state.data.history;
  const workoutsByDay = groupByDay(history);
  const now = new Date();
  const oldest = history.length ? new Date(Math.min(...history.map(entry => entry.startedAt))) : now;
  const todayKey = toDateKey(now);

  let months = '';
  for (let month = new Date(oldest.getFullYear(), oldest.getMonth(), 1); month <= now; month.setMonth(month.getMonth() + 1)) {
    months += renderCalendarMonth(month, workoutsByDay, todayKey);
  }

  const { backdrop, close } = createModal(`
    <div class="popup-header">
      <button class="button-link close-button" data-action="close" aria-label="Close">✕</button>
      <h2>Calendar</h2>
      <span class="popup-header-spacer"></span>
    </div>
    <div class="calendar-weekdays">${WEEKDAY_LETTERS.map(letter => `<span>${letter}</span>`).join('')}</div>
    <div class="calendar-scroll">${months}</div>
    <div class="calendar-info">Tap a day with a ✓ to see what you did.</div>`,
  { sheetClass: 'calendar-sheet' });

  const scroller = backdrop.querySelector('.calendar-scroll');
  scroller.scrollTop = scroller.scrollHeight;   // start on the current month

  backdrop.onclick = event => {
    if (isCloseClick(event, backdrop)) return close();

    const dayButton = event.target.closest('[data-date]');
    if (!dayButton) return;

    backdrop.querySelectorAll('.calendar-day.selected').forEach(day => day.classList.remove('selected'));
    dayButton.classList.add('selected');
    backdrop.querySelector('.calendar-info').innerHTML = describeDay(dayButton.dataset.date, workoutsByDay);
  };
}

/* ==========================================================================
   Taps on the history list
   ========================================================================== 
*/

function handleClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  if (target.dataset.action === 'open-calendar') return showCalendarPopup();

  if (target.dataset.action === 'delete-entry' && confirm('Delete this workout from history?')) {
    state.data.history = state.data.history.filter(entry => entry.id !== target.dataset.entryId);
    saveData();
    renderHistory();
  }
}

export function initHistory() {
  getView().addEventListener('click', handleClick);
}
