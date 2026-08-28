import { uid, toggleForm, fmtMoney, escapeHtml, parseId } from '../../core/utils.js';
import { categorySpent } from '../../domain/finance.service.js';

export function initCategoriesModule(store, charts) {
  const categoriesBody = document.getElementById('categories-body');
  const goalsContainer = document.getElementById('goals-container');
  const goalCategorySelect = document.getElementById('goal-category-select');

  function renderCategories() {
    if (!categoriesBody || !store.currentUserData) return;
    categoriesBody.innerHTML = store.currentUserData.categories.map(cat => {
      const spent = categorySpent(store.currentUserData.txs, cat.id);
      const goal = store.currentUserData.goals.find(g => g.categoryId === cat.id);
      return `
        <tr>
          <td><span class="cat-color" style="background:${escapeHtml(cat.color)}"></span>${escapeHtml(cat.name)}</td>
          <td>${fmtMoney(spent)}</td>
          <td>${goal ? fmtMoney(goal.limit) : '-'}</td>
          <td><button type="button" class="cat-del" data-id="${cat.id}">Del</button></td>
        </tr>
      `;
    }).join('');
  }

  function renderGoals() {
    if (!goalsContainer || !store.currentUserData) return;
    goalsContainer.innerHTML = store.currentUserData.goals.map(goal => {
      const cat = store.currentUserData.categories.find(c => c.id === goal.categoryId);
      const spent = categorySpent(store.currentUserData.txs, goal.categoryId);
      const pct = Math.min(100, Math.round((spent / goal.limit) * 100));
      return `
        <div class="goal-card">
          <div class="goal-card__header">
            <strong>${cat ? escapeHtml(cat.name) : 'Sem categoria'}</strong>
            <span>${fmtMoney(spent)} / ${fmtMoney(goal.limit)}</span>
          </div>
          <div class="goal-card__bar"><div class="goal-card__fill" style="width:${pct}%"></div></div>
          <small class="goal-card__pct">${pct}% da meta</small>
        </div>
      `;
    }).join('');
  }

  function renderCategorySelects() {
    if (!goalCategorySelect || !store.currentUserData) return;
    goalCategorySelect.innerHTML = store.currentUserData.categories.map(cat =>
      `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`
    ).join('');
  }

  function updateCharts() {
    if (!store.currentUserData) return;
    charts.updateCategories(store.currentUserData.categories, store.currentUserData.txs);
  }

  const openAddCategory = document.getElementById('open-add-category');
  const addCategoryForm = document.getElementById('add-category-form');
  const cancelAddCategory = document.getElementById('cancel-add-category');

  openAddCategory?.addEventListener('click', () => toggleForm(addCategoryForm, openAddCategory, true));
  cancelAddCategory?.addEventListener('click', () => {
    addCategoryForm?.reset();
    toggleForm(addCategoryForm, openAddCategory, false);
  });

  addCategoryForm?.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(addCategoryForm);
    store.mutate(data => {
      data.categories.push({ id: uid(), name: f.get('name'), color: f.get('color') });
    });
    refresh();
    addCategoryForm.reset();
    toggleForm(addCategoryForm, openAddCategory, false);
  });

  categoriesBody?.addEventListener('click', e => {
    if (!e.target.classList.contains('cat-del')) return;
    const id = parseId(e.target.dataset.id);
    store.mutate(data => {
      data.categories = data.categories.filter(c => c.id !== id);
      data.goals = data.goals.filter(g => g.categoryId !== id);
      data.txs.forEach(t => { if (t.categoryId === id) t.categoryId = undefined; });
    });
    refresh();
  });

  const openAddGoal = document.getElementById('open-add-goal');
  const addGoalForm = document.getElementById('add-goal-form');
  const cancelAddGoal = document.getElementById('cancel-add-goal');

  openAddGoal?.addEventListener('click', () => toggleForm(addGoalForm, openAddGoal, true));
  cancelAddGoal?.addEventListener('click', () => {
    addGoalForm?.reset();
    toggleForm(addGoalForm, openAddGoal, false);
  });

  addGoalForm?.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(addGoalForm);
    const categoryId = parseId(f.get('categoryId'));
    const limit = parseFloat(f.get('limit')) || 0;
    store.mutate(data => {
      const existing = data.goals.find(g => g.categoryId === categoryId);
      data.goals = data.goals.filter(g => g.categoryId !== categoryId);
      data.goals.push({ id: existing?.id || uid(), categoryId, limit });
    });
    renderGoals();
    addGoalForm.reset();
    toggleForm(addGoalForm, openAddGoal, false);
  });

  function refresh() {
    renderCategories();
    renderGoals();
    renderCategorySelects();
    updateCharts();
  }

  return { renderCategories, renderGoals, renderCategorySelects, updateCharts, refresh };
}
