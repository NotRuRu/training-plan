// Switching between the three tabs (Train / Eat / Progress) and the
// two-button toggles inside them (Workouts | History, Meals | Shop).
//
// Screens do not import each other to redraw. Each screen registers its draw
// function here, and anyone can ask for a redraw with renderScreen('train').
// That keeps the files independent.

import { state } from './state.js';
import { select, selectAll } from './utils.js';

const renderers = {};

export function registerRenderer(screenName, renderFunction) {
  renderers[screenName] = renderFunction;
}

export function renderScreen(screenName) {
  const render = renderers[screenName];
  if (render) render();
}

export function switchTab(tabName) {
  selectAll('.tab-button').forEach(button => {
    button.classList.toggle('active', button.dataset.tab === tabName);
  });
  selectAll('.screen').forEach(screen => {
    screen.classList.toggle('active', screen.id === `${tabName}-screen`);
  });
  renderScreen(tabName);
}

/** Which view a toggle is showing, e.g. getSegmentView('train-segments') -> 'history' */
export function getSegmentView(segmentsId) {
  return select(`#${segmentsId} .active`).dataset.view;
}

/** Shows one view of a toggle and hides the other. */
export function setSegmentView(segmentsId, viewName) {
  selectAll(`#${segmentsId} button`).forEach(button => {
    const isSelected = button.dataset.view === viewName;
    button.classList.toggle('active', isSelected);
    select(`#${button.dataset.view}-view`).hidden = !isSelected;
  });
}

export function initNavigation() {
  selectAll('.tab-button').forEach(button => {
    button.addEventListener('click', () => switchTab(button.dataset.tab));
  });

  selectAll('.segmented').forEach(segments => {
    segments.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;

      setSegmentView(segments.id, button.dataset.view);

      const screenName = segments.id.replace('-segments', '');   // 'train-segments' -> 'train'
      if (screenName === 'train') state.openWorkoutId = null;
      renderScreen(screenName);
    });
  });
}
