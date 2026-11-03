// Imports workout history from a Strong or Hevy CSV export.
// The reading functions are plain (no screen code) so they can be tested.

import { state, saveData } from './state.js';
import { formatVolume, findBestSet } from './utils.js';
import { POUNDS_TO_KG, MAX_PLAUSIBLE_WORKOUT_MS } from './constants.js';
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

/* ==========================================================================
   The file formats app understands
   Each reader turns one CSV row into the same simple shape:
   { startText, workoutName, exerciseName, warmup, weight, reps, seconds, durationMs }
   or returns null for rows that are not a set.
   ========================================================================== 
*/

/** Works out which app made the file. Returns null when it is none app knows.
 *  `unit` is 'kg' or 'lb', or null when the file does not say (app then asks). */
export function detectFormat(headers) {
  if ('exercise_title' in headers && 'start_time' in headers) {
    return { name: 'hevy', unit: 'weight_lbs' in headers ? 'lb' : 'kg' };
  }
  if ('Workout' in headers && 'Exercise' in headers && 'Set' in headers) {
    const weightColumn = Object.keys(headers).find(header => header.startsWith('Weight')) || 'Weight (kg)';
    return { name: 'strong', unit: /lb/i.test(weightColumn) ? 'lb' : 'kg', weightColumn };
  }
  if ('Workout Name' in headers && 'Exercise Name' in headers) {
    return { name: 'strong-classic', unit: null };
  }
  return null;
}

// Strong, current export: Date, Workout, Workout Duration (s), Exercise, Set, Weight (kg), Reps, Duration (s) ...
const readStrongRow = (row, format) => ({
  startText: row['Date'],
  workoutName: row['Workout'],
  exerciseName: row['Exercise'],
  warmup: row['Set'] === 'W',                      // 'D' (drop set) and 'F' (failure) count as normal sets
  weight: parseFloat(row[format.weightColumn]),
  reps: parseFloat(row['Reps']),
  seconds: parseFloat(row['Duration (s)']),
  durationMs: (parseFloat(row['Workout Duration (s)']) || 0) * 1000,
});

// Strong, older export: Date, Workout Name, Duration ("1h 13m"), Exercise Name, Set Order, Weight, Reps, Seconds ...
const readClassicStrongRow = row => {
  if (row['Set Order'] === 'Rest Timer') return null;   // a rest, not a set
  return {
    startText: row['Date'],
    workoutName: row['Workout Name'],
    exerciseName: row['Exercise Name'],
    warmup: row['Set Order'] === 'W',
    weight: parseFloat(row['Weight']),
    reps: parseFloat(row['Reps']),
    seconds: parseFloat(row['Seconds']),
    durationMs: parseDuration(row['Duration']),
  };
};

// Hevy: title, start_time, end_time, exercise_title, set_type, weight_kg / weight_lbs, reps, duration_seconds ...
const readHevyRow = row => {
  const start = parseDateTime(row['start_time'] || '');
  const end = parseDateTime(row['end_time'] || '');
  return {
    startText: row['start_time'],
    workoutName: row['title'],
    exerciseName: row['exercise_title'],
    warmup: row['set_type'] === 'warmup',
    weight: parseFloat('weight_kg' in row ? row['weight_kg'] : row['weight_lbs']),
    reps: parseFloat(row['reps']),
    seconds: parseFloat(row['duration_seconds']),
    durationMs: start !== null && end !== null ? end - start : 0,
  };
};

const ROW_READERS = { 'strong': readStrongRow, 'strong-classic': readClassicStrongRow, 'hevy': readHevyRow };


/**
 * Turns the CSV rows into history entries.
 *   format: what detectFormat() returned
 *   unit:   'kg' or 'lb'. Only needed when the file does not say (format.unit is null).
 */
export function buildHistoryFromRows(rows, format, unit = format.unit) {
  const kgPerUnit = unit === 'lb' ? POUNDS_TO_KG : 1;
  const readRow = ROW_READERS[format.name];
  const workouts = new Map();   // one entry per start time + workout name

  rows.forEach(row => {
    const set = readRow(row, format);
    if (!set) return;
    const startedAt = parseDateTime(set.startText || '');
    if (startedAt === null || !set.exerciseName) return;

    // Holds like a plank have no reps: store the seconds instead
    const isTimed = !(set.reps > 0) && set.seconds > 0;
    const amount = Math.round(set.reps > 0 ? set.reps : set.seconds || 0);
    if (!(amount > 0)) return;

    const workoutName = (set.workoutName || 'Workout').trim();
    const key = startedAt + '|' + workoutName;
    if (!workouts.has(key)) {
      // A timer left running makes an impossible duration: treat it as unknown (0)
      const duration = set.durationMs > MAX_PLAUSIBLE_WORKOUT_MS ? 0 : set.durationMs;
      workouts.set(key, { startedAt, name: workoutName, duration, exercises: new Map() });
    }

    const workout = workouts.get(key);
    if (!workout.exercises.has(set.exerciseName)) workout.exercises.set(set.exerciseName, []);
    workout.exercises.get(set.exerciseName).push({
      kg: Math.round((set.weight || 0) * kgPerUnit * 100) / 100,
      reps: amount,
      warmup: set.warmup,
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
  const withoutDuration = entries.filter(entry => entry.endedAt === entry.startedAt).length;

  const agreed = confirm(
    `Found ${entries.length} workouts (${formatDay(oldest)} to ${formatDay(newest.startedAt)}).\n\n`
    + `Most recent: ${newest.name}\n${firstExercise.name}: ${topSet.kg} kg × ${topSet.reps}\n\n`
    + (withoutDuration ? `${withoutDuration} had no usable duration (such as a timer left running) and will show 0m.\n\n` : '')
    + 'Does that weight look right? Workouts you already have are skipped. Import?');
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

    const format = detectFormat(rows[0] || {});
    if (!format) return alert("That doesn't look like a Strong or Hevy export.");

    if (format.unit) {
      confirmAndImport(buildHistoryFromRows(rows, format));
    } else {
      // The older Strong export does not say which unit it uses, so ask
      showForm({
        title: 'Import from Strong',
        fields: [{ name: 'unit', label: 'Which unit does this file use for weight?', type: 'select', options: ['kg', 'lb'], value: 'kg' }],
        onSave: values => confirmAndImport(buildHistoryFromRows(rows, format, values.unit)),
      });
    }
  });
}
