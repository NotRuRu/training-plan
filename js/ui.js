// Popups that every screen uses: a form (with Save / Delete / Cancel),
// a list of actions, and the plain popup frame they are built from.

import { escapeHtml } from './utils.js';

/**
 * Opens a popup that slides up from the bottom.
 * Returns { backdrop, close }. Give `backdrop.onclick` your own click handling.
 */
export function createModal(innerHtml, { tagName = 'div', sheetClass = '' } = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `<${tagName} class="sheet ${sheetClass}">${innerHtml}</${tagName}>`;
  document.body.appendChild(backdrop);
  return { backdrop, close: () => backdrop.remove() };
}

/** True when the click was on the dark background or on a button marked data-action="close". */
export function isCloseClick(event, backdrop) {
  return event.target === backdrop || Boolean(event.target.closest('[data-action="close"]'));
}

function renderField(field) {
  const name = escapeHtml(field.name);
  let control;

  if (field.type === 'select') {
    const options = field.options.map(option =>
      `<option ${option == field.value ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('');
    control = `<select name="${name}">${options}</select>`;
  } else if (field.type === 'textarea') {
    control = `<textarea name="${name}" rows="5">${escapeHtml(field.value)}</textarea>`;
  } else {
    const numberAttributes = field.type === 'number' ? 'step="any" inputmode="decimal"' : '';
    control = `<input name="${name}" type="${field.type || 'text'}" ${numberAttributes} value="${escapeHtml(field.value)}">`;
  }
  return `<label>${escapeHtml(field.label)}${control}</label>`;
}

/**
 * A form popup.
 *   fields:   [{ name, label, type: 'text' | 'number' | 'select' | 'textarea', value, options }]
 *   onSave:   called with an object of the typed values, keyed by field name
 *   onDelete: optional. Adds a Delete button (with a confirmation).
 */
export function showForm({ title, fields, onSave, onDelete }) {
  const { backdrop, close } = createModal(`
    <h2>${escapeHtml(title)}</h2>
    ${fields.map(renderField).join('')}
    <button class="button-primary">Save</button>
    ${onDelete ? '<button type="button" class="button-secondary button-danger" data-action="delete">Delete</button>' : ''}
    <button type="button" class="button-secondary" data-action="close">Cancel</button>`,
  { tagName: 'form' });

  backdrop.onclick = event => {
    if (isCloseClick(event, backdrop)) close();
    if (event.target.dataset.action === 'delete' && confirm('Delete this?')) {
      close();
      onDelete();
    }
  };

  backdrop.querySelector('form').onsubmit = event => {
    event.preventDefault();
    const values = {};
    fields.forEach(field => {
      const text = backdrop.querySelector(`[name="${field.name}"]`).value;
      values[field.name] = field.type === 'number' ? (parseFloat(text) || 0) : text.trim();
    });
    close();
    onSave(values);
  };

  const firstInput = backdrop.querySelector('input');
  if (firstInput && !firstInput.value) firstInput.focus();
}

/**
 * A popup with a list of buttons.
 *   actions: [{ label, run, danger }]
 */
export function showActionSheet(title, actions) {
  const buttons = actions.map((action, index) =>
    `<button class="button-secondary ${action.danger ? 'button-danger' : ''}" data-index="${index}">${escapeHtml(action.label)}</button>`);

  const { backdrop, close } = createModal(`
    <h2>${escapeHtml(title)}</h2>
    ${buttons.join('')}
    <button class="button-secondary" data-action="close">Cancel</button>`);

  backdrop.onclick = event => {
    if (isCloseClick(event, backdrop)) return close();
    const button = event.target.closest('[data-index]');
    if (button) {
      close();
      actions[Number(button.dataset.index)].run();
    }
  };
}
