// Backup: export chosen parts of your data to a file, and import a file
// by ADDING what is missing (nothing is ever overwritten or deleted).

import { state, saveData } from './state.js';
import { createId, sameText, toDateKey } from './utils.js';
import { MEAL_TAGS } from './constants.js';
import { migrateData } from './migrate.js';
import { renderScreen } from './navigation.js';

// The buttons in the Backup card. `key` is the name of the part inside state.data.
export const BACKUP_PARTS = [
  { key: 'folders', label: 'Workouts' },
  { key: 'history', label: 'History' },
  { key: 'meals', label: 'Meals' },
  { key: 'shoppingList', label: 'Shoplist' },
  { key: 'bodyweight', label: 'Bodyweight' },
];

const selectedKeys = () => BACKUP_PARTS
  .map(part => part.key)
  .filter(key => state.backupSelection[key]);

const summaryLine = (label, added, skipped) =>
  `${label}: ${added} added${skipped ? `, ${skipped} skipped` : ''}`;

/* ==========================================================================
   Export
   ========================================================================== 
*/

export function exportSelectedData() {
  const keys = selectedKeys();
  if (!keys.length) return alert('Select at least one thing to export.');

  const backup = { app: 'back-to-fit', version: 3, exportedAt: Date.now() };
  keys.forEach(key => { backup[key] = state.data[key]; });
  if (keys.includes('shoppingList')) backup.currency = state.data.currency;

  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([JSON.stringify(backup)], { type: 'application/json' }));
  link.download = 'back-to-fit-' + toDateKey(Date.now()) + '.json';
  link.click();
}

/* ==========================================================================
   Import
   ========================================================================== 
*/

export function importBackupFile(file) {
  file.text().then(text => {
    let backup = null;
    try { backup = migrateData(JSON.parse(text)); } catch (error) { /* handled below */ }

    const hasAnyPart = backup && BACKUP_PARTS.some(part => Array.isArray(backup[part.key]));
    if (!hasAnyPart) return alert('That file is not a Back to Fit backup.');

    const keys = selectedKeys().filter(key => Array.isArray(backup[key]));
    if (!keys.length) return alert('The file has nothing that matches your selection.');

    // Take over the file's currency only when your own list is still empty
    if (keys.includes('shoppingList') && !state.data.shoppingList.length && backup.currency) {
      state.data.currency = backup.currency;
    }

    const report = [];
    if (keys.includes('folders')) report.push(mergeWorkouts(backup.folders));
    if (keys.includes('history')) report.push(mergeHistory(backup.history));
    if (keys.includes('meals')) report.push(mergeMeals(backup.meals));
    if (keys.includes('shoppingList')) report.push(mergeShoppingList(backup.shoppingList));
    if (keys.includes('bodyweight')) report.push(mergeBodyweight(backup.bodyweight));

    saveData();
    renderScreen('progress');
    alert('Import finished\n\n' + report.join('\n'));
  });
}

/* ----- The merge functions. Each returns a one-line summary. ----- */

/** Folders are matched by name (or position). A workout is skipped when you already
 *  have one with the same name and the same exercises, and added as "(imported)"
 *  when only the name matches. 
 */
export function mergeWorkouts(importedFolders) {
  const exerciseSignature = exercises => exercises.map(exercise => String(exercise.name).trim().toLowerCase()).join('|');
  let added = 0;
  let skipped = 0;

  importedFolders.forEach((importedFolder, index) => {
    if (!importedFolder || !Array.isArray(importedFolder.workouts)) return;
    const target = state.data.folders.find(folder => sameText(folder.name, importedFolder.name))
      || state.data.folders[index]
      || state.data.folders[0];

    importedFolder.workouts.forEach(workout => {
      if (!workout || !workout.name || !Array.isArray(workout.exercises)) return;

      const exercises = workout.exercises.filter(exercise => exercise && exercise.name).map(exercise => ({
        id: createId(),
        name: String(exercise.name),
        sets: +exercise.sets || 3,
        repRange: String(exercise.repRange || '8-10'),
        weight: +exercise.weight || 0,
        increment: +exercise.increment || 0,
        restSeconds: +exercise.restSeconds || 90,
        hitStreak: +exercise.hitStreak || 0,
        missStreak: +exercise.missStreak || 0,
        lastSets: Array.isArray(exercise.lastSets) ? exercise.lastSets : null,
      }));

      const sameNamed = target.workouts.filter(existing =>
        sameText(existing.name, workout.name) || sameText(existing.name, workout.name + ' (imported)'));
      if (sameNamed.some(existing => exerciseSignature(existing.exercises) === exerciseSignature(exercises))) {
        skipped++;   // you already have this exact workout
        return;
      }

      const nameTaken = target.workouts.some(existing => sameText(existing.name, workout.name));
      target.workouts.push({ id: createId(), name: nameTaken ? workout.name + ' (imported)' : workout.name, exercises });
      added++;
    });
  });
  return summaryLine('Workouts', added, skipped);
}

/** A workout is a duplicate when its id or its start time is already in your history. */
export function mergeHistory(importedEntries) {
  const seen = new Set(state.data.history.flatMap(entry => [entry.id, entry.startedAt]));
  let added = 0;

  importedEntries.forEach(entry => {
    const isValid = entry && typeof entry.startedAt === 'number' && typeof entry.endedAt === 'number'
      && Array.isArray(entry.exercises);
    if (!isValid || seen.has(entry.id) || seen.has(entry.startedAt)) return;

    state.data.history.push({ ...entry, volume: +entry.volume || 0 });
    seen.add(entry.id);
    seen.add(entry.startedAt);
    added++;
  });
  state.data.history.sort((a, b) => b.startedAt - a.startedAt);   // newest first
  return summaryLine('History', added, importedEntries.length - added);
}

/** A meal is a duplicate when you already have one with the same title. */
export function mergeMeals(importedMeals) {
  let added = 0;
  importedMeals.forEach(meal => {
    if (!meal || !meal.name || state.data.meals.some(existing => sameText(existing.name, meal.name))) return;
    state.data.meals.push({
      id: createId(),
      name: String(meal.name),
      description: String(meal.description || ''),
      tag: MEAL_TAGS.includes(meal.tag) ? meal.tag : 'Lunch',
      calories: +meal.calories || 0,
      protein: +meal.protein || 0,
      details: String(meal.details || ''),
    });
    added++;
  });
  return summaryLine('Meals', added, importedMeals.length - added);
}

/** An item is a duplicate when you already have one with the same name. Imported items arrive unchecked. */
export function mergeShoppingList(importedItems) {
  let added = 0;
  importedItems.forEach(item => {
    if (!item || !item.name || state.data.shoppingList.some(existing => sameText(existing.name, item.name))) return;
    state.data.shoppingList.push({ id: createId(), name: String(item.name), price: +item.price || 0, checked: false });
    added++;
  });
  return summaryLine('Shoplist', added, importedItems.length - added);
}

/** A weigh-in is a duplicate when you already logged that date. Your own value wins. */
export function mergeBodyweight(importedEntries) {
  const loggedDates = new Set(state.data.bodyweight.map(entry => entry.date));
  let added = 0;

  importedEntries.forEach(entry => {
    const isValid = entry && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && +entry.weight > 0;
    if (!isValid || loggedDates.has(entry.date)) return;
    state.data.bodyweight.push({ date: entry.date, weight: +entry.weight });
    loggedDates.add(entry.date);
    added++;
  });
  state.data.bodyweight.sort((a, b) => a.date.localeCompare(b.date));
  return summaryLine('Bodyweight', added, importedEntries.length - added);
}
