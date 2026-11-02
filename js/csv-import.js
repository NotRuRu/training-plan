// Imports workout history from a Strong or Hevy CSV export.
// The reading functions are plain (no screen code) so they can be tested.

import { state, saveData } from './state.js';
import { formatVolume, findBestSet } from './utils.js';
import { POUNDS_TO_KG } from './constants.js';
import { showForm } from './ui.js';
import { renderScreen } from './navigation.js';
import { mergeHistory } from './backup.js';

/* ==========================================================================
   Reading the file
   ========================================================================== 
*/

/** Reads CSV text into a list of rows, each row an object keyed by the header names. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let insideQuotes = false;
  text = text.replace(/^\uFEFF/, '');   // some apps start the file with an invisible marker

  for (let index = 0; index < text.length; index++) {
    const character = text[index];

    if (insideQuotes) {
      if (character !== '"') cell += character;
      else if (text[index + 1] === '"') { cell += '"'; index++; }   // "" inside quotes means one quote
      else insideQuotes = false;
    } else if (character === '"') {
      insideQuotes = true;
    } else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(cell);
      cell = '';
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
    } else {
      cell += character;
    }
  }
  row.push(cell);
  if (row.some(value => value !== '')) rows.push(row);

  const headers = (rows.shift() || []).map(header => header.trim());
  return rows.map(values => Object.fromEntries(
    headers.map((header, index) => [header, (values[index] ?? '').trim()])));
}

const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Reads the date formats of Strong ("2025-05-15 05:55:55") and Hevy ("15 May 2025, 05:55"). */
export function parseDateTime(text) {
  let match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match) return new Date(+match[1], match[2] - 1, +match[3], +match[4], +match[5], +(match[6] || 0)).getTime();

  match = text.match(/^(\d{1,2}) ([A-Za-z]{3})\w* (\d{4}),? (\d{1,2}):(\d{2})/);
  if (match) {
    const month = MONTH_NAMES.indexOf(match[2].toLowerCase());
    if (month >= 0) return new Date(+match[3], month, +match[1], +match[4], +match[5]).getTime();
  }

  const parsed = Date.parse(text);
  return isNaN(parsed) ? null : parsed;
}

/** "1h 15m" -> milliseconds */
export function parseDuration(text) {
  const read = pattern => +(String(text).match(pattern)?.[1] || 0);
  const hours = read(/(\d+)\s*h/);
  const minutes = read(/(\d+)\s*m/);
  const seconds = read(/(\d+)\s*s/);
  return ((hours * 60 + minutes) * 60 + seconds) * 1000;
}

/**
 * Turns the CSV rows into history entries.
 *   isStrong: true for a Strong file, false for Hevy
 *   unit:     'kg' or 'lb' (the weights in the file)
 */
export function buildHistoryFromRows(rows, isStrong, unit) {
  const kgPerUnit = unit === 'lb' ? POUNDS_TO_KG : 1;
  const workouts = new Map();   // one entry per start time + workout name

  rows.forEach(row => {
    const startedAt = parseDateTime((isStrong ? row['Date'] : row['start_time']) || '');
    const exerciseName = isStrong ? row['Exercise Name'] : row['exercise_title'];
    if (startedAt === null || !exerciseName) return;

    let warmup, weight, reps, seconds;
    if (isStrong) {
      if (row['Set Order'] === 'Rest Timer') return;   // not a real set
      warmup = row['Set Order'] === 'W';
      weight = parseFloat(row['Weight']);
      reps = parseFloat(row['Reps']);
      seconds = parseFloat(row['Seconds']);
    } else {
      warmup = row['set_type'] === 'warmup';
      weight = parseFloat('weight_kg' in row ? row['weight_kg'] : row['weight_lbs']);
      reps = parseFloat(row['reps']);
      seconds = parseFloat(row['duration_seconds']);
    }

    // Holds like a plank have no reps: store the seconds instead
    const isTimed = !(reps > 0) && seconds > 0;
    const amount = Math.round(reps > 0 ? reps : seconds || 0);
    if (!(amount > 0)) return;

    const workoutName = ((isStrong ? row['Workout Name'] : row['title']) || 'Workout').trim();
    const key = startedAt + '|' + workoutName;
    if (!workouts.has(key)) {
      const duration = isStrong
        ? parseDuration(row['Duration'])
        : (parseDateTime(row['end_time'] || '') ?? startedAt) - startedAt;
      workouts.set(key, { startedAt, name: workoutName, duration, exercises: new Map() });
    }

    const workout = workouts.get(key);
    if (!workout.exercises.has(exerciseName)) workout.exercises.set(exerciseName, []);
    workout.exercises.get(exerciseName).push({
      kg: Math.round((weight || 0) * kgPerUnit * 100) / 100,
      reps: amount,
      warmup,
      isTimed,
    });
  });

  return [...workouts.values()].map(workout => {
    let volume = 0;
    const exercises = [...workout.exercises].map(([name, sets]) => {
      sets.forEach(set => { if (!set.warmup && !set.isTimed) volume += set.kg * set.reps; });
      const allTimed = sets.every(set => set.isTimed);
      return {
        name: allTimed ? name + ' (sec)' : name,
        sets: sets.map(set => ({ kg: set.kg, reps: set.reps, warmup: set.warmup })),
      };
    });

    return {
      id: 'import-' + workout.startedAt,
      name: workout.name,
      startedAt: workout.startedAt,
      endedAt: workout.startedAt + Math.max(workout.duration || 0, 0),
      exercises,
      volume: Math.round(volume),
    };
  }).filter(entry => entry.exercises.length);
}

/* ==========================================================================
   The import flow: pick file -> (ask the unit) -> preview -> import
   ========================================================================== 
*/

function confirmAndImport(entries) {
  if (!entries.length) return alert('No workouts found in that file.');

  const formatDay = time => new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  const oldest = Math.min(...entries.map(entry => entry.startedAt));
  const newest = entries.reduce((latest, entry) => entry.startedAt > latest.startedAt ? entry : latest);
  const firstExercise = newest.exercises[0];
  const topSet = findBestSet(firstExercise.sets);

  const agreed = confirm(
    `Found ${entries.length} workouts (${formatDay(oldest)} to ${formatDay(newest.startedAt)}).\n\n`
    + `Most recent: ${newest.name}\n${firstExercise.name}: ${topSet.kg} kg × ${topSet.reps}\n\n`
    + 'Does that weight look right? Import these into your history?');
  if (!agreed) return;

  const summary = mergeHistory(entries);
  saveData();
  renderScreen('progress');
  alert('Import finished\n\n' + summary);
}

export function importHistoryCsv(file) {
  file.text().then(text => {
    let rows = [];
    try { rows = parseCsv(text); } catch (error) { /* handled below */ }

    const headers = rows[0] || {};
    const isStrong = 'Workout Name' in headers && 'Exercise Name' in headers;
    const isHevy = 'exercise_title' in headers && 'start_time' in headers;
    if (!isStrong && !isHevy) return alert("That doesn't look like a Strong or Hevy export.");

    if (isHevy) {
      // Hevy names the unit in the column header: weight_kg or weight_lbs
      confirmAndImport(buildHistoryFromRows(rows, false, 'weight_lbs' in headers ? 'lb' : 'kg'));
    } else {
      // Strong does not say which unit the file uses, so ask
      showForm({
        title: 'Import from Strong',
        fields: [{ name: 'unit', label: 'Which unit does this file use for weight?', type: 'select', options: ['kg', 'lb'], value: 'kg' }],
        onSave: values => confirmAndImport(buildHistoryFromRows(rows, true, values.unit)),
      });
    }
  });
}
