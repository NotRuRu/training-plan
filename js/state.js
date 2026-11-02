// The app's memory.
//   state.data          everything that is saved on the phone
//   state.openWorkoutId, mealFilter, backupSelection   things that only matter right now
//
// Other files import `state` and read or change state.data, then call saveData().

import { migrateData } from './migrate.js';
import { createExampleData } from './example-data.js';

export const STORAGE_KEY = 'back-to-fit-data';
// Where the app saved data before version 0.5. It is only ever READ, never deleted,
// so the old copy stays on the phone as a safety net.
export const OLD_STORAGE_KEY = 'btf2';

export const state = {
  data: null,
  openWorkoutId: null,   // which workout screen is showing (null = the folder list)
  mealFilter: 'All',     // selected meal tag chip
  backupSelection: { folders: true, history: true, meals: true, shoppingList: true, bodyweight: true },
};

function readSavedJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (error) {
    return null;
  }
}

/** Reads the saved data, converting it if it is in the old format. */
export function loadData() {
  const saved = readSavedJson(STORAGE_KEY);
  if (saved) return migrateData(saved);

  const oldSave = readSavedJson(OLD_STORAGE_KEY);
  if (oldSave) return migrateData(oldSave);

  return createExampleData();
}

export function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
  } catch (error) {
    console.warn('Could not save data', error);
  }
}

/** Looks a workout up by id. Returns { folder, workout }, or {} when it is gone. */
export function findWorkout(workoutId) {
  for (const folder of state.data.folders) {
    const workout = folder.workouts.find(candidate => candidate.id === workoutId);
    if (workout) return { folder, workout };
  }
  return {};
}
