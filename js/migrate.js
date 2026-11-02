// Converts saved data from the old format (short names like "n", "w", "hist")
// to the current format (full names like "name", "workouts", "history").
//
// It runs on the data saved in the phone AND on old backup files.
// Safe to run twice: data that is already current is returned untouched.

import { DEFAULT_REST_SECONDS } from './constants.js';

export const CURRENT_VERSION = 3;

const convertExercise = old => ({
  id: old.id,
  name: old.n,
  sets: old.s,
  repRange: old.r,
  weight: old.w,
  increment: old.inc,
  restSeconds: old.rest || DEFAULT_REST_SECONDS,
  hitStreak: old.h || 0,
  missStreak: old.f || 0,
  lastSets: old.last ? old.last.map(set => ({ kg: set.k, reps: set.r })) : null,
});

const convertWorkout = old => ({
  id: old.id,
  name: old.n,
  exercises: (old.ex || []).map(convertExercise),
});

const convertFolder = old => ({
  name: old.n,
  workouts: (old.w || []).map(convertWorkout),
});

const convertHistoryEntry = old => ({
  id: old.id,
  name: old.n,
  startedAt: old.t0,
  endedAt: old.t1,
  volume: old.vol,
  exercises: (old.ex || []).map(exercise => ({
    name: exercise.n,
    sets: (exercise.sets || []).map(set => ({ kg: set.k, reps: set.r, warmup: !!set.wu })),
  })),
});

const convertMeal = old => ({
  id: old.id,
  name: old.n,
  description: old.d,
  tag: old.tag,
  calories: old.kcal,
  protein: old.p,
  details: old.det,
});

const convertShoppingItem = old => ({
  id: old.id,
  name: old.n,
  price: old.p,
  checked: !!old.c,
});

function convertSession(old) {
  if (!old) return null;
  const hasRunningTimer = old.rest && old.rest.e;   // very old sessions stored a bare number
  return {
    workoutId: old.wid,
    startedAt: old.t0,
    rest: hasRunningTimer ? {
      exerciseId: old.rest.e,
      setIndex: old.rest.i,
      startedAt: old.rest.t,
      totalSeconds: old.rest.total,
      finished: !!old.rest.done,
    } : null,
    setsByExercise: Object.fromEntries(Object.entries(old.s || {}).map(([exerciseId, sets]) => [
      exerciseId,
      sets.map(set => ({ kg: set.k, reps: set.r, done: !!set.d, warmup: !!set.wu })),
    ])),
  };
}

/**
 * Accepts a full save or a (partial) backup file, in the old or the current format.
 * Returns it in the current format.
 */
export function migrateData(raw) {
  if (!raw || typeof raw !== 'object') return raw;
  if (raw.version === CURRENT_VERSION) return raw;

  const data = { version: CURRENT_VERSION };
  if ('app' in raw) data.app = raw.app;
  if ('exported' in raw) data.exportedAt = raw.exported;
  if (Array.isArray(raw.folders)) data.folders = raw.folders.map(convertFolder);
  if (Array.isArray(raw.hist)) data.history = raw.hist.map(convertHistoryEntry);
  if (Array.isArray(raw.meals)) data.meals = raw.meals.map(convertMeal);
  if (Array.isArray(raw.shop)) data.shoppingList = raw.shop.map(convertShoppingItem);
  if (Array.isArray(raw.bw)) data.bodyweight = raw.bw;
  if ('cur' in raw) data.currency = raw.cur;
  if ('open' in raw) data.openFolderIndex = raw.open;
  if ('sess' in raw) data.activeSession = convertSession(raw.sess);
  return data;
}
