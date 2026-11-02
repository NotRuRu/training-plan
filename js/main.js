// Start-up. This is the only file index.html loads; it pulls in everything else.
//
//   state.js       saved data            navigation.js   tabs and toggles
//   utils.js       small helpers         ui.js           popups
//   train.js       folders + popup       workout.js      active workout, rest timer
//   history.js     history + calendar    eat.js          meals + shopping list
//   progress.js    overview + heatmap    backup.js       export / import
//   csv-import.js  Strong / Hevy import  migrate.js      old data -> new data

import { state, loadData, saveData, findWorkout } from './state.js';
import { select } from './utils.js';
import { initNavigation, switchTab } from './navigation.js';
import { initTrain } from './train.js';
import { initWorkout } from './workout.js';
import { initHistory } from './history.js';
import { initEat } from './eat.js';
import { initProgress } from './progress.js';
import { registerServiceWorker } from './pwa.js';

state.data = loadData();
saveData();                       // writes converted data straight away
navigator.storage?.persist?.();   // asks the phone not to clear our data when space runs low

initTrain();
initWorkout();
initHistory();
initEat();
initProgress();
initNavigation();

select('#today-date').textContent = new Date()
  .toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

// A workout was still running when the app was closed: reopen it when Train is opened
const session = state.data.activeSession;
if (session && findWorkout(session.workoutId).workout) state.openWorkoutId = session.workoutId;

registerServiceWorker();
switchTab('progress');   // the screen the app opens on: 'train', 'eat' or 'progress'
