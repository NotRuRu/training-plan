// The Eat tab: meal cards with tag filters, and the shopping list.

import { state, saveData } from './state.js';
import { select, createId, escapeHtml } from './utils.js';
import { MEAL_TAGS, CURRENCIES } from './constants.js';
import { showForm } from './ui.js';
import { getSegmentView, registerRenderer } from './navigation.js';

function renderEat() {
  if (getSegmentView('eat-segments') === 'shopping') renderShopping();
  else renderMeals();
}

/* ==========================================================================
   Meals
   ========================================================================== 
*/

function renderMealCard(meal) {
  const nutrition = [
    meal.calories ? `${meal.calories} kcal` : '',
    meal.protein ? `${meal.protein}g protein` : '',
  ].filter(Boolean).join(' · ');

  return `
    <div class="card meal-card" data-meal-id="${meal.id}">
      <div class="row row-spread meal-card-title"><h3>${escapeHtml(meal.name)}</h3></div>
      <div class="meal-description">${escapeHtml(meal.description)}</div>
      <div class="meal-nutrition">${nutrition} <span class="tag">${escapeHtml(meal.tag)}</span></div>
      <div class="meal-details">
        <div class="meal-details-text">${escapeHtml(meal.details) || 'No details yet.'}</div>
        <div class="meal-edit-row">
          <button class="button-secondary" data-action="edit-meal" data-meal-id="${meal.id}">Edit meal</button>
        </div>
      </div>
    </div>`;
}

function renderMeals() {
  const filter = state.mealFilter;
  const visibleMeals = state.data.meals.filter(meal => filter === 'All' || meal.tag === filter);

  const chips = ['All', ...MEAL_TAGS].map(tag =>
    `<button class="chip ${tag === filter ? 'active' : ''}" data-tag="${tag}">${tag}</button>`).join('');

  select('#meals-view').innerHTML = `
    <div class="chip-row">${chips}</div>
    ${visibleMeals.length
      ? `<div class="meal-grid">${visibleMeals.map(renderMealCard).join('')}</div>`
      : '<div class="empty-message">No meals here yet.</div>'}
    <button class="button-primary" data-action="add-meal">+ Add meal</button>`;
}

function showMealForm(meal) {
  showForm({
    title: meal ? 'Edit meal' : 'Add meal',
    fields: [
      { name: 'name', label: 'Title', value: meal?.name || '' },
      { name: 'description', label: 'Short description', value: meal?.description || '' },
      { name: 'tag', label: 'Tag', type: 'select', options: MEAL_TAGS, value: meal?.tag || 'Lunch' },
      { name: 'calories', label: 'Calories (kcal)', type: 'number', value: meal?.calories || '' },
      { name: 'protein', label: 'Protein (g)', type: 'number', value: meal?.protein || '' },
      { name: 'details', label: 'Ingredients / recipe', type: 'textarea', value: meal?.details || '' },
    ],
    onSave: values => {
      if (!values.name) return;
      if (meal) Object.assign(meal, values);
      else state.data.meals.push({ id: createId(), ...values });
      saveData();
      renderMeals();
    },
    onDelete: meal ? () => {
      state.data.meals = state.data.meals.filter(candidate => candidate !== meal);
      saveData();
      renderMeals();
    } : null,
  });
}

/** Opens the tapped meal card and closes any other, so only one is open at a time. */
function toggleMealCard(card) {
  const wasOpen = card.classList.contains('open');
  document.querySelectorAll('#meals-view .meal-card.open').forEach(openCard => openCard.classList.remove('open'));

  if (!wasOpen) {
    card.classList.add('open');
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function handleMealsClick(event) {
  const button = event.target.closest('button');

  if (button?.dataset.tag) {
    state.mealFilter = button.dataset.tag;
    return renderMeals();
  }
  if (button?.dataset.action === 'add-meal') return showMealForm(null);
  if (button?.dataset.action === 'edit-meal') {
    return showMealForm(state.data.meals.find(meal => meal.id === button.dataset.mealId));
  }

  const card = event.target.closest('.meal-card');
  if (card) toggleMealCard(card);
}

/* ==========================================================================
   Shopping list
   ========================================================================== 
*/

function formatMoney(amount) {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: state.data.currency || 'EUR' }).format(amount);
  } catch (error) {
    return amount.toFixed(2);
  }
}

function renderShopping() {
  const items = state.data.shoppingList;
  const total = items.reduce((sum, item) => sum + item.price, 0);
  const stillToBuy = items.filter(item => !item.checked).reduce((sum, item) => sum + item.price, 0);

  const itemRows = items.map(item => `
    <div class="shopping-item ${item.checked ? 'checked' : ''}" data-item-id="${item.id}">
      <input type="checkbox" ${item.checked ? 'checked' : ''}>
      <span>${escapeHtml(item.name)}</span>
      <b>${formatMoney(item.price)}</b>
    </div>`).join('');

  const totals = items.length ? `
    <div class="row row-spread shopping-total"><span>Total</span><span>${formatMoney(total)}</span></div>
    <div class="row row-spread shopping-remaining"><span>Still to buy</span><span>${formatMoney(stillToBuy)}</span></div>` : '';

  const extraButtons = items.length ? `
    <button class="button-secondary" data-action="uncheck-all">Uncheck all</button>
    <button class="button-secondary button-danger" data-action="remove-checked">Remove checked items</button>` : '';

  select('#shopping-view').innerHTML = `
    <div class="card">
      ${items.length ? itemRows : '<div class="empty-message">Your list is empty. Add what you need to buy.</div>'}
      ${totals}
    </div>
    <button class="button-primary" data-action="add-item">+ Add item</button>
    ${extraButtons}
    <button class="button-link" data-action="change-currency">Currency: ${escapeHtml(state.data.currency)} (change)</button>`;
}

function showCurrencyForm() {
  const current = state.data.currency || 'EUR';
  const selected = CURRENCIES.find(entry => entry.startsWith(current + ' —')) || CURRENCIES.find(entry => entry.startsWith('EUR —'));

  showForm({
    title: 'Currency',
    fields: [{ name: 'currency', label: 'Choose currency', type: 'select', options: CURRENCIES, value: selected }],
    onSave: values => {
      state.data.currency = (values.currency || 'EUR').slice(0, 3);   // "EUR — Euro (...)" -> "EUR"
      saveData();
      renderShopping();
    },
  });
}

function showItemForm(item) {
  showForm({
    title: item ? 'Edit item' : 'Add item',
    fields: [
      { name: 'name', label: 'Item', value: item?.name || '' },
      { name: 'price', label: 'Price', type: 'number', value: item?.price ?? '' },
    ],
    onSave: values => {
      if (!values.name) return;
      if (item) Object.assign(item, values);
      else state.data.shoppingList.push({ id: createId(), ...values, checked: false });
      saveData();
      renderShopping();
    },
    onDelete: item ? () => {
      state.data.shoppingList = state.data.shoppingList.filter(candidate => candidate !== item);
      saveData();
      renderShopping();
    } : null,
  });
}

function handleShoppingClick(event) {
  const target = event.target;
  const action = target.dataset.action;
  const row = target.closest('.shopping-item');

  if (action === 'add-item') return showItemForm(null);
  if (action === 'change-currency') return showCurrencyForm();

  if (action === 'uncheck-all') {
    state.data.shoppingList.forEach(item => { item.checked = false; });
    saveData();
    return renderShopping();
  }
  if (action === 'remove-checked') {
    state.data.shoppingList = state.data.shoppingList.filter(item => !item.checked);
    saveData();
    return renderShopping();
  }

  if (!row) return;
  const item = state.data.shoppingList.find(candidate => candidate.id === row.dataset.itemId);

  if (target.type === 'checkbox') {
    item.checked = target.checked;
    saveData();
    renderShopping();
  } else {
    showItemForm(item);   // tapping the name or price edits the item
  }
}

export function initEat() {
  registerRenderer('eat', renderEat);
  select('#meals-view').addEventListener('click', handleMealsClick);
  select('#shopping-view').addEventListener('click', handleShoppingClick);
}
