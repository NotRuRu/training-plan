// The Train tab: the four folders, the workout cards inside them,
// and the preview popup you get when you tap a workout.

import { state, saveData, findWorkout } from './state.js';
import { select, createId, escapeHtml } from './utils.js';
import { showForm, showActionSheet, createModal, isCloseClick } from './ui.js';
import { getSegmentView, registerRenderer } from './navigation.js';
import { startWorkout, renderWorkoutScreen, showExerciseForm } from './workout.js';
import { renderHistory } from './history.js';

const getView = () => select('#workouts-view');

/** Decides what the Train tab shows: History, the open workout, or the folder list. */
function renderTrain() {
  const showingHistory = getSegmentView('train-segments') === 'history';
  const showingWorkout = !showingHistory && Boolean(state.openWorkoutId);

  select('#train-segments').hidden = showingWorkout;   // the toggle is hidden while working out

  if (showingHistory) renderHistory();
  else if (showingWorkout) renderWorkoutScreen();
  else renderFolders();
}

/* ==========================================================================
   Folder list
   ========================================================================== 
*/

function renderWorkoutCard(workout) {
  const isRunning = state.data.activeSession?.workoutId === workout.id;
  const exerciseNames = workout.exercises.map(exercise => exercise.name).join(', ') || 'No exercises yet';

  return `
    <div class="card workout-card" data-action="open-workout" data-workout-id="${workout.id}">
      <h3>${escapeHtml(workout.name)}</h3>
      <div class="workout-card-exercises">${escapeHtml(exerciseNames)}</div>
      ${isRunning ? '<span class="tag">In progress</span>' : ''}
    </div>`;
}

function renderFolder(folder, folderIndex) {
  const isOpen = state.data.openFolderIndex === folderIndex;
  const count = `${folder.workouts.length} workout${folder.workouts.length === 1 ? '' : 's'}`;
  const cards = folder.workouts.map(renderWorkoutCard).join('');

  return `
    <div class="folder">
      <div class="folder-header">
        <button class="folder-toggle ${isOpen ? 'open' : ''}" data-action="toggle-folder" data-folder-index="${folderIndex}">
          <span><span class="folder-chevron">›</span> ${escapeHtml(folder.name)}</span>
          <small>${count}</small>
        </button>
        <button class="folder-menu-button" data-action="folder-menu" data-folder-index="${folderIndex}" aria-label="Folder options">•••</button>
      </div>
      ${isOpen ? `
        <div class="workout-grid">
          ${cards}
          <button class="button-add" data-action="add-workout" data-folder-index="${folderIndex}">+ Add workout</button>
        </div>` : ''}
    </div>`;
}

export function renderFolders() {
  getView().innerHTML = state.data.folders.map(renderFolder).join('');
}

/* ==========================================================================
   Folder actions
   ========================================================================== 
*/

function showFolderMenu(folderIndex) {
  const folder = state.data.folders[folderIndex];
  const actions = [
    { label: 'Rename folder', run: () => renameFolder(folderIndex) },
    { label: 'Add workout', run: () => addWorkout(folderIndex) },
  ];
  if (folder.workouts.length) {
    actions.push({ label: 'Delete all workouts', danger: true, run: () => deleteAllWorkouts(folderIndex) });
  }
  showActionSheet(folder.name, actions);
}

function renameFolder(folderIndex) {
  showForm({
    title: 'Rename folder',
    fields: [{ name: 'name', label: 'Name', value: state.data.folders[folderIndex].name }],
    onSave: values => {
      if (!values.name) return;
      state.data.folders[folderIndex].name = values.name;
      saveData();
      renderFolders();
    },
  });
}

function addWorkout(folderIndex) {
  showForm({
    title: 'New workout',
    fields: [{ name: 'name', label: 'Name', value: '' }],
    onSave: values => {
      if (!values.name) return;
      state.data.folders[folderIndex].workouts.push({ id: createId(), name: values.name, exercises: [] });
      state.data.openFolderIndex = folderIndex;
      saveData();
      renderFolders();
    },
  });
}

function deleteAllWorkouts(folderIndex) {
  const folder = state.data.folders[folderIndex];
  const message = `Delete all ${folder.workouts.length} workouts in "${folder.name}"? Your history is kept. This can't be undone.`;
  if (!confirm(message)) return;

  const session = state.data.activeSession;
  if (session && folder.workouts.some(workout => workout.id === session.workoutId)) {
    state.data.activeSession = null;
  }
  folder.workouts = [];
  saveData();
  renderFolders();
}

/* ==========================================================================
   Workout preview popup (exercise list + Start button)
   ========================================================================== 
*/

function describeDaysAgo(timestamp) {
  if (!timestamp) return 'never';
  const days = Math.floor((Date.now() - timestamp) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function showWorkoutPopup(workoutId) {
  const { folder, workout } = findWorkout(workoutId);
  if (!workout) return;

  const lastWorkout = state.data.history.find(entry => entry.name === workout.name);   // history is newest first
  const isRunning = state.data.activeSession?.workoutId === workout.id;
  const reopen = () => { renderFolders(); showWorkoutPopup(workout.id); };

  const exerciseRows = workout.exercises.map(exercise => `
    <div class="preview-exercise" data-action="edit-exercise" data-exercise-id="${exercise.id}">
      <b>${exercise.sets} × ${escapeHtml(exercise.name)}</b>
      <small>${escapeHtml(exercise.repRange)} reps${exercise.weight ? ' · ' + exercise.weight + ' kg' : ''}</small>
    </div>`).join('');

  const { backdrop, close } = createModal(`
    <div class="popup-header">
      <button class="button-link close-button" data-action="close" aria-label="Close">✕</button>
      <h2>${escapeHtml(workout.name)}</h2>
      <button class="button-link" data-action="edit-workout">Edit</button>
    </div>
    <p>Last performed: ${describeDaysAgo(lastWorkout?.startedAt)}</p>
    ${exerciseRows || '<div class="empty-message">No exercises yet. Tap Edit to add some.</div>'}
    ${workout.exercises.length
      ? `<button class="button-primary popup-start-button" data-action="start">${isRunning ? 'Resume workout' : 'Start workout'}</button>`
      : ''}`);

  backdrop.onclick = event => {
    if (isCloseClick(event, backdrop)) return close();

    const target = event.target.closest('[data-action]');
    if (!target) return;

    if (target.dataset.action === 'start') {
      if (startWorkout(workout.id)) close();
    } else if (target.dataset.action === 'edit-workout') {
      close();
      showEditWorkoutMenu(workout, folder, reopen);
    } else if (target.dataset.action === 'edit-exercise') {
      close();
      const exercise = workout.exercises.find(candidate => candidate.id === target.dataset.exerciseId);
      showExerciseForm(workout, exercise, reopen);
    }
  };
}

function showEditWorkoutMenu(workout, folder, reopen) {
  showActionSheet(workout.name, [
    {
      label: 'Rename workout',
      run: () => showForm({
        title: 'Rename workout',
        fields: [{ name: 'name', label: 'Name', value: workout.name }],
        onSave: values => {
          if (values.name) {
            workout.name = values.name;
            saveData();
          }
          reopen();
        },
      }),
    },
    { label: 'Add exercise', run: () => showExerciseForm(workout, null, reopen) },
    {
      label: 'Delete workout',
      danger: true,
      run: () => {
        if (!confirm(`Delete "${workout.name}"?`)) return reopen();
        folder.workouts = folder.workouts.filter(candidate => candidate !== workout);
        if (state.data.activeSession?.workoutId === workout.id) state.data.activeSession = null;
        saveData();
        renderFolders();
      },
    },
  ]);
}

/* ==========================================================================
   Taps on the folder list
   ========================================================================== 
*/

function handleClick(event) {
  if (state.openWorkoutId) return;   // the workout screen handles its own taps

  const target = event.target.closest('[data-action]');
  if (!target) return;
  const folderIndex = Number(target.dataset.folderIndex);

  switch (target.dataset.action) {
    case 'folder-menu': return showFolderMenu(folderIndex);
    case 'add-workout': return addWorkout(folderIndex);
    case 'open-workout': return showWorkoutPopup(target.dataset.workoutId);
    case 'toggle-folder':
      state.data.openFolderIndex = state.data.openFolderIndex === folderIndex ? null : folderIndex;
      saveData();
      renderFolders();
  }
}

export function initTrain() {
  registerRenderer('train', renderTrain);
  getView().addEventListener('click', handleClick);
}
