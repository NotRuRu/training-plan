// The active workout screen: ticking off sets, the rest timers between sets,
// editing exercises, and finishing (which saves the workout to History).

import { state, saveData, findWorkout } from './state.js';
import {
  select, createId, escapeHtml, formatClock, parseClockTime, repRangeBottom,
} from './utils.js';
import { DEFAULT_REST_SECONDS } from './constants.js';
import { showForm } from './ui.js';
import { updateExerciseAfterWorkout } from './progression.js';
import { renderScreen, setSegmentView } from './navigation.js';

const getView = () => select('#workouts-view');

/* ==========================================================================
   Starting and leaving a workout
   ========================================================================== 
*/

/** Opens a workout. Returns false when the person cancelled. */
export function startWorkout(workoutId) {
  const session = state.data.activeSession;
  const anotherIsRunning = session && session.workoutId !== workoutId;
  if (anotherIsRunning && !confirm('Another workout is in progress. Discard it and start this one?')) return false;

  if (!session || anotherIsRunning) {
    state.data.activeSession = { workoutId, startedAt: null, rest: null, setsByExercise: {} };
  }
  state.openWorkoutId = workoutId;
  saveData();
  renderScreen('train');
  return true;
}

function leaveWorkout() {
  state.openWorkoutId = null;
  renderScreen('train');
}

function discardSession() {
  if (!confirm('Discard this session? Logged sets will be lost.')) return;
  state.data.activeSession = null;
  leaveWorkout();
  saveData();
}

/* ==========================================================================
   Sets of the running session
   ========================================================================== 
*/

const createEmptySet = kg => ({ kg, reps: '', done: false, warmup: false });

/** The sets logged so far for an exercise (created on first use). */
function getSessionSets(exercise) {
  const setsByExercise = state.data.activeSession.setsByExercise;
  if (!setsByExercise[exercise.id]) {
    setsByExercise[exercise.id] = Array.from({ length: exercise.sets }, () => createEmptySet(exercise.weight));
  }
  return setsByExercise[exercise.id];
}

function toggleSetDone(exercise, setIndex) {
  const session = state.data.activeSession;
  const set = getSessionSets(exercise)[setIndex];
  set.done = !set.done;

  if (set.done) {
    // An empty reps box means "same as last time" (or the bottom of the range the first time)
    if (set.reps === '') set.reps = exercise.lastSets?.[setIndex]?.reps ?? repRangeBottom(exercise.repRange);
    if (!session.startedAt) session.startedAt = Date.now();
    session.rest = {
      exerciseId: exercise.id,
      setIndex,
      startedAt: Date.now(),
      totalSeconds: exercise.restSeconds || DEFAULT_REST_SECONDS,
      finished: false,
    };
  } else if (session.rest?.exerciseId === exercise.id && session.rest.setIndex === setIndex) {
    session.rest = null;   // unticking a set cancels its rest timer
  }
  saveData();
  renderWorkoutScreen();
}

function toggleWarmup(exercise, setIndex) {
  const set = getSessionSets(exercise)[setIndex];
  set.warmup = !set.warmup;
  saveData();
  renderWorkoutScreen();
}

function addSet(exercise) {
  const sets = getSessionSets(exercise);
  const kg = sets.length ? sets[sets.length - 1].kg : exercise.weight;
  sets.push(createEmptySet(kg));
  saveData();
  renderWorkoutScreen();
}

/* ==========================================================================
   Drawing the screen
   ========================================================================== 
*/

/** The line between two sets: planned rest time, or the running countdown. */
function renderRestTimer(exercise, setIndex) {
  const rest = state.data.activeSession.rest;
  const isRunning = rest && rest.exerciseId === exercise.id && rest.setIndex === setIndex;

  if (!isRunning) {
    const seconds = exercise.restSeconds || DEFAULT_REST_SECONDS;
    return `<div class="rest-timer" data-action="edit-rest"><span>${formatClock(seconds)}</span></div>`;
  }
  // The text and bar width are filled in by updateTimers()
  return '<div class="rest-timer running" data-action="edit-rest"><div class="rest-timer-fill"></div><span></span></div>';
}

function renderSetRow(exercise, set, index) {
  const previous = exercise.lastSets?.[index];
  const repsHint = previous ? previous.reps : repRangeBottom(exercise.repRange);

  return `
    <div class="set-row ${set.done ? 'done' : ''}" data-set-index="${index}">
      <div class="set-number ${set.warmup ? 'warmup' : ''}" data-action="toggle-warmup">${set.warmup ? 'W' : index + 1}</div>
      <input type="number" inputmode="decimal" step="any" data-field="kg" value="${set.kg || ''}" placeholder="BW">
      <input type="number" inputmode="numeric" data-field="reps" value="${set.reps}" placeholder="${repsHint}">
      <div class="set-check ${set.done ? 'done' : ''}" data-action="toggle-done">✓</div>
    </div>
    ${renderRestTimer(exercise, index)}`;
}

function renderExercise(exercise) {
  const previous = exercise.lastSets;
  const lastText = previous
    ? ' · last: ' + previous.map(set => (set.kg ? set.kg + '×' : 'BW×') + set.reps).join(', ')
    : '';
  const setRows = getSessionSets(exercise).map((set, index) => renderSetRow(exercise, set, index)).join('');

  return `
    <div class="exercise" data-exercise-id="${exercise.id}">
      <button class="exercise-name" data-action="edit-exercise">${escapeHtml(exercise.name)}</button>
      <div class="exercise-meta">${exercise.sets} × ${escapeHtml(exercise.repRange)}${lastText}</div>
      <div class="set-row set-row-header"><span>Set</span><span>kg</span><span>Reps</span><span>✓</span></div>
      ${setRows}
      <button class="button-add add-set-button" data-action="add-set">+ Add set</button>
    </div>`;
}

export function renderWorkoutScreen() {
  const { workout } = findWorkout(state.openWorkoutId);
  if (!workout) {
    state.openWorkoutId = null;
    return renderScreen('train');
  }

  const exercises = workout.exercises.map(renderExercise).join('');

  getView().innerHTML = `
    <div class="row row-spread workout-header">
      <button class="button-link" data-action="back">‹ Back</button>
      <h2>${escapeHtml(workout.name)}</h2>
      <button class="button-link" data-action="edit-workout">Edit workout</button>
    </div>
    <div class="workout-bar">
      <span id="workout-clock">⏱ 0:00</span>
      <button class="button-primary-small" data-action="finish">Finish</button>
    </div>
    <div class="card workout-exercises">${exercises || '<div class="empty-message">No exercises yet.</div>'}</div>
    <button class="button-add add-exercise-button" data-action="add-exercise">+ Add exercise</button>
    <button class="button-secondary button-danger" data-action="discard">Discard session</button>`;

  keepScreenAwake();
  updateTimers();
}

/* ==========================================================================
   Clock and rest timer (updated every second without redrawing the screen)
   ========================================================================== 
*/

function keepScreenAwake() {
  try {
    navigator.wakeLock?.request('screen').catch(() => {});
  } catch (error) { /* not supported: fine */ }
}

function updateTimers() {
  const session = state.data.activeSession;
  const clock = select('#workout-clock');
  if (!session || !clock) return;

  clock.textContent = '⏱ ' + (session.startedAt ? formatClock((Date.now() - session.startedAt) / 1000) : '0:00');

  const bar = select('.rest-timer.running');
  const rest = session.rest;
  if (!bar || !rest) return;

  const secondsLeft = rest.totalSeconds - (Date.now() - rest.startedAt) / 1000;
  const isOvertime = secondsLeft <= 0;

  bar.querySelector('.rest-timer-fill').style.width = (isOvertime ? 100 : (secondsLeft / rest.totalSeconds) * 100) + '%';
  bar.querySelector('span').textContent = isOvertime ? '+' + formatClock(-secondsLeft) : formatClock(Math.ceil(secondsLeft));
  bar.classList.toggle('overtime', isOvertime);

  if (isOvertime && !rest.finished) {   // buzz once when the time is up (Android only)
    rest.finished = true;
    saveData();
    navigator.vibrate?.([200, 100, 200]);
  }
}

function showRestForm(exercise) {
  showForm({
    title: 'Rest timer',
    fields: [{
      name: 'time',
      label: 'Rest between sets (e.g. 1:30, or 90 for seconds)',
      value: formatClock(exercise.restSeconds || DEFAULT_REST_SECONDS),
    }],
    onSave: values => {
      const seconds = parseClockTime(values.time);
      if (!seconds) return;
      exercise.restSeconds = seconds;
      const rest = state.data.activeSession.rest;
      if (rest && rest.exerciseId === exercise.id) rest.totalSeconds = seconds;
      saveData();
      renderWorkoutScreen();
    },
  });
}

/* ==========================================================================
   Editing exercises and the workout itself
   ========================================================================== 
*/

/** Add or edit an exercise. `afterChange` redraws whatever screen opened the form. */
export function showExerciseForm(workout, exercise, afterChange = renderWorkoutScreen) {
  const session = state.data.activeSession;

  showForm({
    title: exercise ? 'Edit exercise' : 'Add exercise',
    fields: [
      { name: 'name', label: 'Name', value: exercise?.name || '' },
      { name: 'sets', label: 'Sets', type: 'number', value: exercise?.sets || 3 },
      { name: 'repRange', label: 'Rep range (e.g. 8-10)', value: exercise?.repRange || '8-10' },
      { name: 'weight', label: 'Weight (kg, 0 = bodyweight)', type: 'number', value: exercise?.weight ?? 0 },
      { name: 'increment', label: 'Jump when progressing (kg)', type: 'number', value: exercise?.increment ?? 2.5 },
      { name: 'restSeconds', label: 'Rest between sets (seconds)', type: 'number', value: exercise?.restSeconds || DEFAULT_REST_SECONDS },
    ],
    onSave: values => {
      if (!values.name) return;
      values.sets = Math.max(1, Math.round(values.sets));
      if (exercise) {
        Object.assign(exercise, values);
        if (session) delete session.setsByExercise[exercise.id];
      } else {
        workout.exercises.push({ id: createId(), ...values, hitStreak: 0, missStreak: 0, lastSets: null });
      }
      saveData();
      afterChange();
    },
    onDelete: exercise ? () => {
      workout.exercises = workout.exercises.filter(candidate => candidate !== exercise);
      if (session) delete session.setsByExercise[exercise.id];
      saveData();
      afterChange();
    } : null,
  });
}

function showEditWorkoutForm(workout, folder) {
  showForm({
    title: 'Edit workout',
    fields: [{ name: 'name', label: 'Name', value: workout.name }],
    onSave: values => {
      if (!values.name) return;
      workout.name = values.name;
      saveData();
      renderWorkoutScreen();
    },
    onDelete: () => {
      folder.workouts = folder.workouts.filter(candidate => candidate !== workout);
      if (state.data.activeSession?.workoutId === workout.id) state.data.activeSession = null;
      saveData();
      leaveWorkout();
    },
  });
}

/* ==========================================================================
   Finishing: save to History and update the weights for next time
   ========================================================================== 
*/

function finishWorkout(workout) {
  const session = state.data.activeSession;
  const loggedExercises = [];
  let volume = 0;

  workout.exercises.forEach(exercise => {
    const doneSets = (session.setsByExercise[exercise.id] || []).filter(set => set.done);
    if (!doneSets.length) return;

    loggedExercises.push({
      name: exercise.name,
      sets: doneSets.map(set => ({ kg: set.kg || 0, reps: set.reps || 0, warmup: set.warmup })),
    });
    doneSets
      .filter(set => !set.warmup)
      .forEach(set => { volume += (set.kg || 0) * (set.reps || 0); });

    updateExerciseAfterWorkout(exercise, doneSets);
  });

  if (!loggedExercises.length) return alert('Tick at least one set before finishing.');

  state.data.history.unshift({
    id: createId(),
    name: workout.name,
    startedAt: session.startedAt,
    endedAt: Date.now(),
    exercises: loggedExercises,
    volume,
  });
  state.data.activeSession = null;
  state.openWorkoutId = null;
  saveData();

  setSegmentView('train-segments', 'history');
  renderScreen('train');
}

/* ==========================================================================
   Taps and typing
   ========================================================================== 
*/

function handleClick(event) {
  if (!state.openWorkoutId) return;
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const { folder, workout } = findWorkout(state.openWorkoutId);
  const exerciseElement = target.closest('.exercise');
  const exercise = exerciseElement
    && workout.exercises.find(candidate => candidate.id === exerciseElement.dataset.exerciseId);
  const setIndex = Number(target.closest('.set-row')?.dataset.setIndex);

  switch (target.dataset.action) {
    case 'back': return leaveWorkout();
    case 'edit-workout': return showEditWorkoutForm(workout, folder);
    case 'add-exercise': return showExerciseForm(workout, null);
    case 'edit-exercise': return showExerciseForm(workout, exercise);
    case 'discard': return discardSession();
    case 'finish': return finishWorkout(workout);
    case 'edit-rest': return showRestForm(exercise);
    case 'add-set': return addSet(exercise);
    case 'toggle-warmup': return toggleWarmup(exercise, setIndex);
    case 'toggle-done': return toggleSetDone(exercise, setIndex);
  }
}

/** Saves kg / reps as soon as you leave a box. */
function handleInput(event) {
  const input = event.target;
  if (!input.dataset.field || !state.openWorkoutId) return;

  const { workout } = findWorkout(state.openWorkoutId);
  const exercise = workout.exercises.find(
    candidate => candidate.id === input.closest('.exercise').dataset.exerciseId);
  const set = getSessionSets(exercise)[Number(input.closest('.set-row').dataset.setIndex)];

  set[input.dataset.field] = input.value === '' ? '' : parseFloat(input.value);
  saveData();
}

export function initWorkout() {
  getView().addEventListener('click', handleClick);
  getView().addEventListener('change', handleInput);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.openWorkoutId) keepScreenAwake();
  });
  setInterval(() => {
    if (state.openWorkoutId) updateTimers();
  }, 1000);
}
