document.addEventListener('DOMContentLoaded', async () => {
  // utils
  async function hashPassword(pass) {
    const enc = new TextEncoder().encode(pass);
    const buf = await crypto.subtle.digest('SHA-256', enc);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function fmtMoney(v) {
    return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
  }

  function uid() {
    return Math.floor(Math.random() * 1e9);
  }

  // navigation
  const navItems = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');
  function showView(id, push = true) {
    if (!id) id = 'auth';
    views.forEach(v => v.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    navItems.forEach(n => n.classList.toggle('active', n.dataset.view === id));
    if (push) location.hash = '#' + id;
  }

  navItems.forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    showView(h, false);
  });

  // persistence
  const UsersDB = {
    load() {
      return JSON.parse(localStorage.getItem('nexus:users') || '[]');
    },
    save(arr) {
      localStorage.setItem('nexus:users', JSON.stringify(arr));
    }
  };

  const UserDataDB = {
    load(uid) {
      return {
        accounts: JSON.parse(localStorage.getItem(`nexus:user:${uid}:accounts`) || '[]'),
        txs: JSON.parse(localStorage.getItem(`nexus:user:${uid}:txs`) || '[]'),
        cards: JSON.parse(localStorage.getItem(`nexus:user:${uid}:cards`) || '[]'),
        charges: JSON.parse(localStorage.getItem(`nexus:user:${uid}:charges`) || '[]'),
        categories: JSON.parse(localStorage.getItem(`nexus:user:${uid}:categories`) || '[]'),
        goals: JSON.parse(localStorage.getItem(`nexus:user:${uid}:goals`) || '[]'),
        recurring: JSON.parse(localStorage.getItem(`nexus:user:${uid}:recurring`) || '[]'),
        healthHistory: JSON.parse(localStorage.getItem(`nexus:user:${uid}:healthHistory`) || '[]')
      };
    },
    save(uid, data) {
      localStorage.setItem(`nexus:user:${uid}:accounts`, JSON.stringify(data.accounts));
      localStorage.setItem(`nexus:user:${uid}:txs`, JSON.stringify(data.txs));
      localStorage.setItem(`nexus:user:${uid}:cards`, JSON.stringify(data.cards));
      localStorage.setItem(`nexus:user:${uid}:charges`, JSON.stringify(data.charges));
      localStorage.setItem(`nexus:user:${uid}:categories`, JSON.stringify(data.categories));
      localStorage.setItem(`nexus:user:${uid}:goals`, JSON.stringify(data.goals));
      localStorage.setItem(`nexus:user:${uid}:recurring`, JSON.stringify(data.recurring));
      localStorage.setItem(`nexus:user:${uid}:healthHistory`, JSON.stringify(data.healthHistory));
    }
  };

  let users = UsersDB.load();
  if (users.length === 0) {
    const pwHash = await hashPassword('admin');
    users.push({ id: 1, name: 'Admin', email: 'admin@nexus.local', role: 'admin', passwordHash: pwHash });
    UsersDB.save(users);
  }

  let currentUserId = sessionStorage.getItem('nexus:currentUser') ? Number(sessionStorage.getItem('nexus:currentUser')) : null;
  let currentUserData = null;

  function currentUser() {
    return users.find(u => u.id === currentUserId) || null;
  }

  function requireAuth() {
    if (!currentUserId) {
      showView('auth');
      return false;
    }
    return true;
  }

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const btnLogout = document.getElementById('btn-logout');
  const btnLogin = document.getElementById('btn-login');
  const btnCurrentUser = document.getElementById('current-user');

  async function loadCurrentUserData() {
    if (!currentUserId) return;
    currentUserData = UserDataDB.load(currentUserId);
  }

  function saveCurrentUserData() {
    if (!currentUserId || !currentUserData) return;
    UserDataDB.save(currentUserId, currentUserData);
  }

  async function login(email, pass) {
    const user = users.find(u => u.email === email);
    if (!user) return { ok: false, msg: 'Usuário não encontrado' };
    const h = await hashPassword(pass);
    if (h !== user.passwordHash) return { ok: false, msg: 'Senha inválida' };
    currentUserId = user.id;
    sessionStorage.setItem('nexus:currentUser', String(currentUserId));
    loadCurrentUserData();
    refreshAuthUI();
    render();
    showView('dashboard');
    return { ok: true };
  }

  async function register(name, email, pass) {
    if (users.find(u => u.email === email)) return { ok: false, msg: 'Email já cadastrado' };
    const id = Math.floor(Math.random() * 1e9);
    const ph = await hashPassword(pass);
    const u = { id, name, email, role: 'user', passwordHash: ph };
    users.push(u);
    UsersDB.save(users);
    UserDataDB.save(u.id, { accounts: [], txs: [] });
    return { ok: true, user: u };
  }

  function logout() {
    sessionStorage.removeItem('nexus:currentUser');
    currentUserId = null;
    currentUserData = null;
    refreshAuthUI();
    showView('auth');
  }

  function refreshAuthUI() {
    const u = currentUser();
    if (u) {
      if (btnCurrentUser) btnCurrentUser.textContent = u.name;
      if (btnLogout) btnLogout.classList.remove('hidden');
      if (btnLogin) btnLogin.classList.add('hidden');
    } else {
      if (btnCurrentUser) btnCurrentUser.textContent = 'Convidado';
      if (btnLogout) btnLogout.classList.add('hidden');
      if (btnLogin) btnLogin.classList.remove('hidden');
    }
    const usersNav = document.querySelector('.nav-item[data-view="usuarios"]');
    if (usersNav) {
      usersNav.style.display = (u && u.role === 'admin') ? 'block' : 'none';
    }
  }

  if (loginForm) loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(loginForm);
    const r = await login(f.get('email'), f.get('password'));
    if (!r.ok) alert(r.msg);
  });

  if (registerForm) registerForm.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(registerForm);
    const name = f.get('name');
    const email = f.get('email');
    const pass = f.get('password');
    const r = await register(name, email, pass);
    if (!r.ok) alert(r.msg);
    else {
      alert('Cadastro realizado com sucesso. Faça login.');
      registerForm.reset();
      showView('auth');
    }
  });

  if (btnLogout) btnLogout.addEventListener('click', () => logout());
  if (btnLogin) btnLogin.addEventListener('click', () => showView('auth'));

  const accountsBody = document.getElementById('accounts-body');
  const txBody = document.getElementById('tx-body');
  const txBodyMain = document.getElementById('tx-body-main');
  const saldoEl = document.getElementById('saldo');
  const receitasEl = document.getElementById('dashboard-receitas');
  const despesasEl = document.getElementById('dashboard-despesas');
  const accountSelect = document.getElementById('tx-account-select');
  const accountSelectMain = document.getElementById('tx-account-select-main');

  function renderAccountOptions() {
    const fill = select => {
      if (!select) return;
      select.innerHTML = '';
      if (!currentUserData || currentUserData.accounts.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Nenhuma conta disponível';
        select.appendChild(option);
        select.disabled = true;
        return;
      }
      select.disabled = false;
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Selecione a conta';
      select.appendChild(empty);
      currentUserData.accounts.forEach(acc => {
        const opt = document.createElement('option');
        opt.value = String(acc.id);
        opt.textContent = `${acc.name} (${acc.bank})`;
        select.appendChild(opt);
      });
    };
    fill(accountSelect);
    fill(accountSelectMain);
  }

  function renderCategoryOptionsForTx() {
    const select = document.getElementById('tx-category-select');
    if (!select || !currentUserData) return;
    const currentValue = select.value;
    select.innerHTML = '<option value="">Sem categoria</option>';
    currentUserData.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = String(cat.id);
      opt.textContent = cat.name;
      select.appendChild(opt);
    });
    select.value = currentValue;
  }

  function renderAccounts() {
    if (!accountsBody) return;
    accountsBody.innerHTML = '';
    if (!currentUserData) return;
    currentUserData.accounts.forEach(acc => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${acc.name}</td><td>${acc.bank}</td><td>${fmtMoney(acc.balance)}</td><td><button type="button" data-id="${acc.id}" class="acc-del">Remover</button></td>`;
      accountsBody.appendChild(tr);
    });
    saveCurrentUserData();
  }

  const openAddAcc = document.getElementById('open-add-account');
  const accForm = document.getElementById('add-account-form');
  const cancelAddAcc = document.getElementById('cancel-add-account');
  if (openAddAcc) openAddAcc.addEventListener('click', () => {
    if (accForm) accForm.classList.remove('hidden');
    openAddAcc.style.display = 'none';
  });
  if (cancelAddAcc) cancelAddAcc.addEventListener('click', () => {
    if (accForm) {
      accForm.reset();
      accForm.classList.add('hidden');
    }
    openAddAcc.style.display = '';
  });
  if (accForm) accForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!currentUserData) return alert('Faça login');
    const f = new FormData(accForm);
    const name = f.get('name');
    const bank = f.get('bank');
    const balance = parseFloat(f.get('balance')) || 0;
    const acc = { id: uid(), name, bank, balance };
    currentUserData.accounts.push(acc);
    saveCurrentUserData();
    renderAccounts();
    renderAccountOptions();
    accForm.reset();
    accForm.classList.add('hidden');
    openAddAcc.style.display = '';
  });

  if (accountsBody) accountsBody.addEventListener('click', e => {
    if (e.target.classList.contains('acc-del')) {
      const id = Number(e.target.dataset.id);
      if (!currentUserData) return;
      currentUserData.accounts = currentUserData.accounts.filter(a => a.id !== id);
      currentUserData.txs = currentUserData.txs.filter(t => t.accountId !== id);
      saveCurrentUserData();
      renderAccounts();
      renderAccountOptions();
      renderTxs();
      render();
    }
  });

  const usersBody = document.getElementById('users-body');
  function renderUsers() {
    if (!usersBody) return;
    usersBody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td>${u.role}</td><td><button type="button" data-id="${u.id}" class="user-del">Remover</button></td>`;
      usersBody.appendChild(tr);
    });
    UsersDB.save(users);
  }

  const openAddUser = document.getElementById('open-add-user');
  const userForm = document.getElementById('add-user-form');
  const cancelAddUser = document.getElementById('cancel-add-user');
  if (openAddUser) openAddUser.addEventListener('click', () => {
    if (userForm) userForm.classList.remove('hidden');
    openAddUser.style.display = 'none';
  });
  if (cancelAddUser) cancelAddUser.addEventListener('click', () => {
    if (userForm) {
      userForm.reset();
      userForm.classList.add('hidden');
    }
    openAddUser.style.display = '';
  });
  if (userForm) userForm.addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(userForm);
    const name = f.get('name');
    const email = f.get('email');
    const role = f.get('role');
    const pass = Math.random().toString(36).slice(-8);
    const r = await register(name, email, pass);
    if (!r.ok) alert(r.msg);
    else {
      alert('Usuário criado. Senha temporária: ' + pass);
      renderUsers();
      userForm.reset();
      userForm.classList.add('hidden');
      openAddUser.style.display = '';
    }
  });
  if (usersBody) usersBody.addEventListener('click', e => {
    if (e.target.classList.contains('user-del')) {
      const id = Number(e.target.dataset.id);
      users = users.filter(u => u.id !== id);
      UsersDB.save(users);
      renderUsers();
      if (id === currentUserId) logout();
    }
  });

  function renderDashboardMetrics() {
    if (!currentUserData) return;
    const totalCredit = currentUserData.txs.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
    const totalDebit = currentUserData.txs.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
    if (receitasEl) receitasEl.textContent = fmtMoney(totalCredit);
    if (despesasEl) despesasEl.textContent = fmtMoney(totalDebit);
  }

  function updateSaldo() {
    if (!currentUserData) return;
    const credit = currentUserData.txs.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
    const debit = currentUserData.txs.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
    if (saldoEl) saldoEl.textContent = fmtMoney(credit - debit);
  }

  function renderRecentTransactions() {
    if (!currentUserData || !txBody) return;
    txBody.innerHTML = '';
    const recent = currentUserData.txs.slice(-6).reverse();
    recent.forEach(tx => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${tx.date}</td><td>${tx.desc}</td><td>${tx.type === 'credit' ? 'Crédito' : 'Débito'}</td><td class="${tx.type}">${fmtMoney(tx.amount)}</td>`;
      txBody.appendChild(tr);
    });
  }

  function renderTxs(filter) {
    if (!currentUserData || !txBodyMain) return;
    txBodyMain.innerHTML = '';
    const list = currentUserData.txs.slice().sort((a, b) => a.date.localeCompare(b.date));
    const filtered = (filter || list).filter(t => {
      if (!filter) return true;
      if (filter.from && t.date < filter.from) return false;
      if (filter.to && t.date > filter.to) return false;
      return true;
    });
    filtered.forEach(tx => {
      const acc = currentUserData.accounts.find(a => a.id === tx.accountId);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${tx.date}</td><td>${tx.desc}</td><td>${tx.type === 'credit' ? 'Crédito' : 'Débito'}</td><td class="${tx.type}">${fmtMoney(tx.amount)}</td><td>${acc ? acc.name : '-'}</td><td><button type="button" data-id="${tx.id}" class="tx-del">Remover</button></td>`;
      txBodyMain.appendChild(tr);
    });
    saveCurrentUserData();
  }

  const openBtn = document.getElementById('open-add');
  const form = document.getElementById('add-tx-form');
  const cancel = document.getElementById('cancel-add');
  const openBtnLanc = document.getElementById('open-add-lancamento');
  const formLanc = document.getElementById('add-tx-form-lancamentos');
  const cancelLanc = document.getElementById('cancel-add-lancamento');

  const toggleForm = (formElement, openButton, visible) => {
    if (!formElement || !openButton) return;
    if (visible) {
      formElement.classList.remove('hidden');
      openButton.style.display = 'none';
    } else {
      formElement.classList.add('hidden');
      openButton.style.display = '';
    }
  };

  const handleTransactionSubmit = (evt, formElement) => {
    evt.preventDefault();
    if (!currentUserData) return alert('Faça login');
    const f = new FormData(formElement);
    const date = f.get('date');
    const desc = f.get('desc')?.trim();
    const type = f.get('type');
    const amount = parseFloat(f.get('amount')) || 0;
    const accId = Number(f.get('account')) || null;
    const categoryId = f.get('category') ? Number(f.get('category')) : undefined;
    if (!date || !desc || amount <= 0 || !accId) {
      return alert('Preencha todos os campos e selecione a conta.');
    }
    currentUserData.txs.push({ id: uid(), date, desc, type, amount, accountId: accId, categoryId });
    saveCurrentUserData();
    formElement.reset();
    renderAccountOptions();
    render();
  };

  if (openBtn) openBtn.addEventListener('click', () => {
    if (form) renderAccountOptions();
    toggleForm(form, openBtn, true);
  });
  if (cancel) cancel.addEventListener('click', () => {
    if (form) form.reset();
    toggleForm(form, openBtn, false);
  });
  if (form) form.addEventListener('submit', e => handleTransactionSubmit(e, form));

  if (openBtnLanc) openBtnLanc.addEventListener('click', () => {
    if (formLanc) renderAccountOptions();
    toggleForm(formLanc, openBtnLanc, true);
  });
  if (cancelLanc) cancelLanc.addEventListener('click', () => {
    if (formLanc) formLanc.reset();
    toggleForm(formLanc, openBtnLanc, false);
  });
  if (formLanc) formLanc.addEventListener('submit', e => handleTransactionSubmit(e, formLanc));

  const applyFilters = document.getElementById('apply-filters');
  const clearFilters = document.getElementById('clear-filters');
  if (applyFilters) applyFilters.addEventListener('click', () => {
    const from = document.getElementById('filter-date-from').value;
    const to = document.getElementById('filter-date-to').value;
    renderTxs({ from: from || null, to: to || null });
  });
  if (clearFilters) clearFilters.addEventListener('click', () => {
    const fd = document.getElementById('filter-date-from');
    const td = document.getElementById('filter-date-to');
    if (fd) fd.value = '';
    if (td) td.value = '';
    renderTxs();
  });

  if (txBodyMain) txBodyMain.addEventListener('click', e => {
    if (e.target.classList.contains('tx-del')) {
      currentUserData.txs = currentUserData.txs.filter(t => t.id !== Number(e.target.dataset.id));
      saveCurrentUserData();
      render();
    }
  });

  function parseStatementCSV(text) {
    return text.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
      const parts = line.split(/,|;/).map(part => part.trim().replace(/^"|"$/g, ''));
      if (parts.length < 2) return null;
      const date = parts[0];
      const amount = parseFloat(parts[1].replace(',', '.')) || 0;
      const desc = parts.slice(2).join(' ');
      return { date, amount, desc };
    }).filter(Boolean);
  }

  function showReconcileResult(matches) {
    const out = document.getElementById('reconcile-result');
    if (!out) return;
    if (!matches.length) {
      out.innerHTML = '<h4>Resultado</h4><div>Nenhuma linha encontrada no extrato.</div>';
      return;
    }
    out.innerHTML = '<h4>Resultado</h4>' + matches.map(m => `
      <div>${m.stmt.date} ${fmtMoney(m.stmt.amount)} — ${m.tx ? ('Conciliado com: ' + m.tx.desc) : '<b>Não encontrado</b>'}</div>
    `).join('');
  }

  const reconcileBtn = document.getElementById('run-reconcile');
  const reconcileFileInput = document.getElementById('reconcile-file');

  const reconcile = (text) => {
    if (!currentUserData) return alert('Faça login');
    const parsed = parseStatementCSV(text);
    const matches = parsed.map(stmt => {
      const found = currentUserData.txs.find(tx => Math.abs(tx.amount - stmt.amount) < 0.001 && tx.date === stmt.date);
      return { stmt, tx: found || null };
    });
    showReconcileResult(matches);
  };

  if (reconcileBtn) reconcileBtn.addEventListener('click', () => {
    if (!currentUserData) return alert('Faça login');
    const el = document.getElementById('statement-paste');
    const txt = el ? el.value.trim() : '';
    if (!txt) return alert('Cole o CSV do extrato ou carregue um arquivo.');
    reconcile(txt);
  });

  if (reconcileFileInput) reconcileFileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      const textarea = document.getElementById('statement-paste');
      if (textarea) textarea.value = content;
      reconcile(content);
    };
    reader.readAsText(file, 'UTF-8');
  });

  const exportBtn = document.getElementById('export-csv');
  if (exportBtn) exportBtn.addEventListener('click', () => {
    if (!currentUserData) return alert('Faça login');
    const from = document.getElementById('rep-from').value;
    const to = document.getElementById('rep-to').value;
    const rows = [['data', 'descricao', 'tipo', 'valor', 'conta']];
    currentUserData.txs.filter(t => {
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    }).forEach(t => {
      const acc = currentUserData.accounts.find(a => a.id === t.accountId);
      rows.push([t.date, t.desc, t.type, Number(t.amount).toFixed(2), acc ? acc.name : '']);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexus_lancamentos.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  const exportAccountsBtn = document.getElementById('export-accounts-csv');
  if (exportAccountsBtn) exportAccountsBtn.addEventListener('click', () => {
    if (!currentUserData) return alert('Faça login');
    const rows = [['nome', 'banco', 'saldo']];
    currentUserData.accounts.forEach(acc => {
      rows.push([acc.name, acc.bank, Number(acc.balance).toFixed(2)]);
    });
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexus_contas.csv';
    a.click();
    URL.revokeObjectURL(url);
  });

  let monthlyChart = null;
  let summaryChart = null;

  function aggregateByMonth(txs) {
    const map = {};
    txs.forEach(t => {
      const parts = t.date.split('-');
      if (parts.length < 2) return;
      const key = `${parts[0]}-${parts[1]}`;
      if (!map[key]) map[key] = { credit: 0, debit: 0 };
      if (t.type === 'credit') map[key].credit += Number(t.amount);
      else map[key].debit += Number(t.amount);
    });
    const keys = Object.keys(map).sort();
    return {
      labels: keys.map(k => {
        const [y, m] = k.split('-');
        return `${m}/${y}`;
      }),
      credits: keys.map(k => map[k].credit),
      debits: keys.map(k => map[k].debit)
    };
  }

  function initCharts() {
    const ctxM = document.getElementById('chart-monthly')?.getContext('2d');
    const ctxS = document.getElementById('chart-summary')?.getContext('2d');
    if (ctxM) {
      monthlyChart = new Chart(ctxM, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [
            { label: 'Ganhos', data: [], backgroundColor: 'rgba(57,255,20,0.85)' },
            { label: 'Perdas', data: [], backgroundColor: 'rgba(255,107,107,0.85)' }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }
    if (ctxS) {
      summaryChart = new Chart(ctxS, {
        type: 'doughnut',
        data: { labels: ['Ganhos', 'Perdas'], datasets: [{ data: [0, 0], backgroundColor: ['rgba(57,255,20,0.95)', 'rgba(255,107,107,0.95)'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    }
    updateCharts();
  }

  function updateCharts() {
    if (!monthlyChart && !summaryChart) return;
    const txs = currentUserData ? currentUserData.txs : [];
    const agg = aggregateByMonth(txs);
    if (monthlyChart) {
      monthlyChart.data.labels = agg.labels;
      monthlyChart.data.datasets[0].data = agg.credits;
      monthlyChart.data.datasets[1].data = agg.debits;
      monthlyChart.update();
    }
    if (summaryChart) {
      const totalCredit = txs.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
      const totalDebit = txs.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
      summaryChart.data.datasets[0].data = [totalCredit, totalDebit];
      summaryChart.update();
    }
  }

  // CATEGORIAS E METAS
  const categoriesBody = document.getElementById('categories-body');
  const goalsContainer = document.getElementById('goals-container');
  const goalCategorySelect = document.getElementById('goal-category-select');
  const openAddCategory = document.getElementById('open-add-category');
  const addCategoryForm = document.getElementById('add-category-form');
  const cancelAddCategory = document.getElementById('cancel-add-category');
  const openAddGoal = document.getElementById('open-add-goal');
  const addGoalForm = document.getElementById('add-goal-form');
  const cancelAddGoal = document.getElementById('cancel-add-goal');
  let categoriesChart = null;

  function renderCategories() {
    if (!categoriesBody || !currentUserData) return;
    categoriesBody.innerHTML = '';
    currentUserData.categories.forEach(cat => {
      const spent = currentUserData.txs
        .filter(t => t.type === 'debit' && t.categoryId === cat.id)
        .reduce((s, t) => s + Number(t.amount), 0);
      const goal = currentUserData.goals.find(g => g.categoryId === cat.id);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><span style="display:inline-block;width:12px;height:12px;background:${cat.color};border-radius:2px;margin-right:8px;"></span>${cat.name}</td>
        <td>${fmtMoney(spent)}</td>
        <td>${goal ? fmtMoney(goal.limit) : '-'}</td>
        <td><button type="button" class="cat-del" data-id="${cat.id}">Del</button></td>
      `;
      categoriesBody.appendChild(tr);
    });
  }

  function renderGoals() {
    if (!goalsContainer || !currentUserData) return;
    goalsContainer.innerHTML = '';
    currentUserData.goals.forEach(goal => {
      const cat = currentUserData.categories.find(c => c.id === goal.categoryId);
      const spent = currentUserData.txs
        .filter(t => t.type === 'debit' && t.categoryId === goal.categoryId)
        .reduce((s, t) => s + Number(t.amount), 0);
      const pct = Math.min(100, Math.round((spent / goal.limit) * 100));
      const div = document.createElement('div');
      div.style.cssText = 'padding:12px;border-radius:8px;background:rgba(74,194,255,0.1);border:1px solid rgba(74,194,255,0.3);margin-bottom:10px;';
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <strong>${cat ? cat.name : 'Sem categoria'}</strong>
          <span>${fmtMoney(spent)} / ${fmtMoney(goal.limit)}</span>
        </div>
        <div style="width:100%;height:8px;background:rgba(255,255,255,0.1);border-radius:4px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,rgb(57,255,20),rgb(0,229,255));transition:width 0.3s;"></div>
        </div>
        <small style="opacity:0.7;margin-top:6px;display:block;">${pct}% da meta</small>
      `;
      goalsContainer.appendChild(div);
    });
  }

  if (openAddCategory) openAddCategory.addEventListener('click', () => {
    addCategoryForm.classList.remove('hidden');
    openAddCategory.style.display = 'none';
  });
  if (cancelAddCategory) cancelAddCategory.addEventListener('click', () => {
    addCategoryForm.classList.add('hidden');
    openAddCategory.style.display = '';
    addCategoryForm.reset();
  });

  if (addCategoryForm) addCategoryForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(addCategoryForm);
    const name = f.get('name');
    const color = f.get('color');
    const cat = { id: uid(), name, color };
    currentUserData.categories.push(cat);
    saveCurrentUserData();
    renderCategories();
    renderCategorySelects();
    updateChartsCategories();
    addCategoryForm.reset();
    addCategoryForm.classList.add('hidden');
    openAddCategory.style.display = '';
  });

  if (categoriesBody) categoriesBody.addEventListener('click', e => {
    if (e.target.classList.contains('cat-del')) {
      const id = Number(e.target.dataset.id);
      currentUserData.categories = currentUserData.categories.filter(c => c.id !== id);
      currentUserData.goals = currentUserData.goals.filter(g => g.categoryId !== id);
      currentUserData.txs.forEach(t => { if (t.categoryId === id) t.categoryId = undefined; });
      saveCurrentUserData();
      renderCategories();
      renderGoals();
      renderCategorySelects();
      updateChartsCategories();
    }
  });

  if (openAddGoal) openAddGoal.addEventListener('click', () => {
    addGoalForm.classList.remove('hidden');
    openAddGoal.style.display = 'none';
  });
  if (cancelAddGoal) cancelAddGoal.addEventListener('click', () => {
    addGoalForm.classList.add('hidden');
    openAddGoal.style.display = '';
    addGoalForm.reset();
  });

  if (addGoalForm) addGoalForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(addGoalForm);
    const categoryId = Number(f.get('categoryId'));
    const limit = parseFloat(f.get('limit')) || 0;
    currentUserData.goals = currentUserData.goals.filter(g => g.categoryId !== categoryId);
    currentUserData.goals.push({ categoryId, limit });
    saveCurrentUserData();
    renderGoals();
    addGoalForm.reset();
    addGoalForm.classList.add('hidden');
    openAddGoal.style.display = '';
  });

  function renderCategorySelects() {
    if (!goalCategorySelect || !currentUserData) return;
    goalCategorySelect.innerHTML = '';
    currentUserData.categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = cat.name;
      goalCategorySelect.appendChild(opt);
    });
  }

  function updateChartsCategories() {
    if (!currentUserData) return;
    const canvas = document.getElementById('chart-categories');
    if (!canvas) return;

    const labels = currentUserData.categories.map(c => c.name);
    const data = currentUserData.categories.map(c => {
      return currentUserData.txs
        .filter(t => t.type === 'debit' && t.categoryId === c.id)
        .reduce((s, t) => s + Number(t.amount), 0);
    });
    const colors = currentUserData.categories.map(c => c.color);

    if (categoriesChart) {
      categoriesChart.data.labels = labels;
      categoriesChart.data.datasets[0].data = data;
      categoriesChart.data.datasets[0].backgroundColor = colors.map(c => c + 'cc');
      categoriesChart.update();
    } else {
      const ctx = canvas.getContext('2d');
      categoriesChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels,
          datasets: [{ data, backgroundColor: colors.map(c => c + 'cc'), borderColor: '#02050a', borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    }
  }

  // TRANSAÇÕES RECORRENTES
  const recurringBody = document.getElementById('recurring-body');
  const recurringTable = document.getElementById('recurring-table');
  const openAddRecurring = document.getElementById('open-add-recurring');
  const addRecurringForm = document.getElementById('add-recurring-form');
  const cancelAddRecurring = document.getElementById('cancel-add-recurring');
  const generateRecurringBtn = document.getElementById('generate-recurring');
  const recurringStatus = document.getElementById('recurring-status');
  const recurringAccountSelect = document.getElementById('recurring-account-select');

  function renderRecurring() {
    if (!recurringBody || !currentUserData) return;
    recurringBody.innerHTML = '';
    currentUserData.recurring.forEach(rec => {
      const nextDate = new Date(rec.nextOccurrence || rec.startDate).toLocaleDateString('pt-BR');
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${rec.desc}</td>
        <td>${rec.type === 'credit' ? 'Crédito' : 'Débito'}</td>
        <td>${fmtMoney(rec.amount)}</td>
        <td>${rec.frequency}</td>
        <td>${nextDate}</td>
        <td><button type="button" class="rec-del" data-id="${rec.id}">Del</button></td>
      `;
      recurringBody.appendChild(tr);
    });
  }

  if (openAddRecurring) openAddRecurring.addEventListener('click', () => {
    addRecurringForm.classList.remove('hidden');
    openAddRecurring.style.display = 'none';
  });
  if (cancelAddRecurring) cancelAddRecurring.addEventListener('click', () => {
    addRecurringForm.classList.add('hidden');
    openAddRecurring.style.display = '';
    addRecurringForm.reset();
  });

  if (addRecurringForm) addRecurringForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(addRecurringForm);
    const rec = {
      id: uid(),
      desc: f.get('desc'),
      type: f.get('type'),
      amount: parseFloat(f.get('amount')) || 0,
      frequency: f.get('frequency'),
      accountId: Number(f.get('accountId')),
      startDate: f.get('startDate'),
      nextOccurrence: f.get('startDate'),
      active: true
    };
    currentUserData.recurring.push(rec);
    saveCurrentUserData();
    renderRecurring();
    addRecurringForm.reset();
    addRecurringForm.classList.add('hidden');
    openAddRecurring.style.display = '';
  });

  if (recurringBody) recurringBody.addEventListener('click', e => {
    if (e.target.classList.contains('rec-del')) {
      const id = Number(e.target.dataset.id);
      currentUserData.recurring = currentUserData.recurring.filter(r => r.id !== id);
      saveCurrentUserData();
      renderRecurring();
    }
  });

  if (generateRecurringBtn) generateRecurringBtn.addEventListener('click', () => {
    if (!currentUserData) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let generated = 0;

    currentUserData.recurring.forEach(rec => {
      let nextDate = new Date(rec.nextOccurrence || rec.startDate);
      nextDate.setHours(0, 0, 0, 0);
      while (nextDate <= today) {
        const tx = {
          id: uid(),
          date: nextDate.toISOString().split('T')[0],
          type: rec.type,
          amount: rec.amount,
          desc: rec.desc,
          accountId: rec.accountId,
          categoryId: undefined,
          source: 'recurring'
        };
        currentUserData.txs.push(tx);
        generated++;

        if (rec.frequency === 'weekly') nextDate.setDate(nextDate.getDate() + 7);
        else if (rec.frequency === 'biweekly') nextDate.setDate(nextDate.getDate() + 14);
        else nextDate.setMonth(nextDate.getMonth() + 1);
      }
      rec.nextOccurrence = nextDate.toISOString().split('T')[0];
    });

    saveCurrentUserData();
    renderRecurring();
    render();
    if (recurringStatus) recurringStatus.innerHTML = `<p style="color:#39ff14;font-size:14px;">✓ ${generated} lançamentos gerados com sucesso</p>`;
    setTimeout(() => { if (recurringStatus) recurringStatus.innerHTML = ''; }, 3000);
  });

  function populateRecurringAccountSelect() {
    if (!recurringAccountSelect || !currentUserData) return;
    recurringAccountSelect.innerHTML = '';
    currentUserData.accounts.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = acc.name;
      recurringAccountSelect.appendChild(opt);
    });
  }

  // SAÚDE FINANCEIRA
  const healthScoreEl = document.getElementById('health-score');
  const savingsRateEl = document.getElementById('savings-rate');
  const expenseRatioEl = document.getElementById('expense-ratio');
  const healthIndicatorsDiv = document.getElementById('health-indicators');
  const healthRecommendationsDiv = document.getElementById('health-recommendations');
  let healthEvolutionChart = null;
  let healthRatioChart = null;

  function calculateHealthMetrics() {
    if (!currentUserData) return { score: 0, savingsRate: 0, expenseRatio: 0, metrics: {} };

    const credits = currentUserData.txs.filter(t => t.type === 'credit').reduce((s, t) => s + Number(t.amount), 0);
    const debits = currentUserData.txs.filter(t => t.type === 'debit').reduce((s, t) => s + Number(t.amount), 0);
    const savingsRate = credits > 0 ? Math.max(0, Math.min(100, ((credits - debits) / credits) * 100)) : 0;
    const expenseRatio = credits > 0 ? Math.max(0, Math.min(100, (debits / credits) * 100)) : 0;

    let score = 50;
    if (savingsRate > 30) score += 30;
    else if (savingsRate > 15) score += 15;
    if (expenseRatio < 70) score += 15;
    else if (expenseRatio < 85) score += 5;
    if (credits > 0) score += 5;

    const goalsProgress = currentUserData.goals.map(g => {
      const spent = currentUserData.txs
        .filter(t => t.type === 'debit' && t.categoryId === g.categoryId)
        .reduce((s, t) => s + Number(t.amount), 0);
      return spent <= g.limit ? 100 : (g.limit / spent) * 100;
    });
    const avgGoalAdherence = goalsProgress.length > 0 ? goalsProgress.reduce((s, p) => s + p, 0) / goalsProgress.length : 50;
    score = Math.min(100, Math.max(0, score + (avgGoalAdherence - 50) * 0.2));

    return {
      score: Math.round(score),
      savingsRate: Math.round(savingsRate),
      expenseRatio: Math.round(expenseRatio),
      metrics: { credits, debits, goalsProgress }
    };
  }

  function updateHealthMetrics() {
    if (!currentUserData) return;
    const health = calculateHealthMetrics();
    if (healthScoreEl) healthScoreEl.textContent = health.score;
    if (savingsRateEl) savingsRateEl.textContent = health.savingsRate + '%';
    if (expenseRatioEl) expenseRatioEl.textContent = health.expenseRatio + '%';

    if (healthIndicatorsDiv) {
      healthIndicatorsDiv.innerHTML = `
        <div class="card" style="text-align:center;">
          <div style="font-size:48px;color:#39ff14;font-weight:bold;">${health.score}</div>
          <div style="font-size:12px;color:#00e5ff;">Pontuação de Saúde (0-100)</div>
        </div>
        <div class="card">
          <strong>Receitas (mês):</strong><br>${fmtMoney(health.metrics.credits)}
        </div>
        <div class="card">
          <strong>Despesas (mês):</strong><br>${fmtMoney(health.metrics.debits)}
        </div>
        <div class="card">
          <strong>Saldo (mês):</strong><br><span style="color:${(health.metrics.credits - health.metrics.debits) >= 0 ? '#39ff14' : '#ff6b6b'};">${fmtMoney(health.metrics.credits - health.metrics.debits)}</span>
        </div>
      `;
    }

    generateHealthRecommendations(health);
    updateHealthCharts(health);

    const today = new Date().toISOString().split('T')[0];
    const todayRecord = currentUserData.healthHistory.find(h => h.date === today);
    if (todayRecord) todayRecord.score = health.score;
    else currentUserData.healthHistory.push({ date: today, score: health.score });
    saveCurrentUserData();
  }

  function generateHealthRecommendations(health) {
    if (!healthRecommendationsDiv) return;
    const recs = [];
    if (health.savingsRate < 10) recs.push('🎯 Aumente sua poupança - tente economizar pelo menos 10% das receitas');
    if (health.expenseRatio > 80) recs.push('⚠️ Suas despesas são altas - revise categorias com maior gasto');
    if (health.metrics.credits === 0) recs.push('📊 Registre suas receitas para começar análise financeira');
    if (currentUserData.goals.length === 0) recs.push('💡 Defina metas orçamentárias para melhor controle');
    if (health.score < 40) recs.push('🚨 Sua saúde financeira necessita atenção - revise seus gastos');
    else if (health.score >= 80) recs.push('✨ Parabéns! Você está com ótima saúde financeira');

    healthRecommendationsDiv.innerHTML = recs.map(r => `<div style="padding:12px;background:rgba(74,194,255,0.1);border-left:3px solid #4ac2ff;border-radius:4px;">${r}</div>`).join('');
  }

  function updateHealthCharts(health) {
    const evolCanvas = document.getElementById('chart-health-evolution');
    if (!evolCanvas || !currentUserData) return;

    const last12 = currentUserData.healthHistory.slice(-12);
    const labels = last12.map(h => new Date(h.date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }));
    const data = last12.map(h => h.score);

    if (healthEvolutionChart) {
      healthEvolutionChart.data.labels = labels;
      healthEvolutionChart.data.datasets[0].data = data;
      healthEvolutionChart.update();
    } else {
      const ctx = evolCanvas.getContext('2d');
      healthEvolutionChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: 'Score',
            data,
            borderColor: '#39ff14',
            backgroundColor: 'rgba(57,255,20,0.1)',
            fill: true,
            tension: 0.3
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: false } }
      });
    }

    const ratioCanvas = document.getElementById('chart-health-ratio');
    if (!ratioCanvas) return;
    if (healthRatioChart) {
      healthRatioChart.data.datasets[0].data = [health.metrics.credits, health.metrics.debits];
      healthRatioChart.update();
    } else {
      const ctx = ratioCanvas.getContext('2d');
      healthRatioChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: ['Receitas', 'Despesas'],
          datasets: [{
            data: [health.metrics.credits, health.metrics.debits],
            backgroundColor: ['rgba(57,255,20,0.8)', 'rgba(255,107,107,0.8)']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', plugins: { legend: false } }
      });
    }
  }

  // CARTÕES DE CRÉDITO E ENCARGOS
  const cardsBody = document.getElementById('cards-body');
  const chargesBody = document.getElementById('charges-body');
  const cardCountEl = document.getElementById('card-count');
  const chargesMonthEl = document.getElementById('card-charges-month');
  const chargesTotalEl = document.getElementById('card-charges-total');
  const chargeCardSelect = document.getElementById('charge-card-select');
  let chargesTypeChart = null;
  let chargesTrendChart = null;
  let chargesCardChart = null;

  function renderCardOptions() {
    if (!chargeCardSelect) return;
    chargeCardSelect.innerHTML = '';
    if (!currentUserData || currentUserData.cards.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nenhum cartão cadastrado';
      chargeCardSelect.appendChild(opt);
      chargeCardSelect.disabled = true;
      return;
    }
    chargeCardSelect.disabled = false;
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Selecione o cartão';
    chargeCardSelect.appendChild(empty);
    currentUserData.cards.forEach(card => {
      const opt = document.createElement('option');
      opt.value = String(card.id);
      opt.textContent = `${card.name} (****${card.last4})`;
      chargeCardSelect.appendChild(opt);
    });
  }

  function renderCards() {
    if (!cardsBody) return;
    cardsBody.innerHTML = '';
    if (!currentUserData) return;
    currentUserData.cards.forEach(card => {
      const monthlyCharges = currentUserData.charges.filter(c => c.cardId === card.id && c.date.startsWith(new Date().toISOString().slice(0, 7))).reduce((s, c) => s + Number(c.amount), 0);
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${card.name}</td><td>${card.holder}</td><td>${card.anniversary}</td><td>${fmtMoney(monthlyCharges)}</td><td><button type="button" data-id="${card.id}" class="card-del">Remover</button></td>`;
      cardsBody.appendChild(tr);
    });
    saveCurrentUserData();
  }

  function renderCharges() {
    if (!chargesBody) return;
    chargesBody.innerHTML = '';
    if (!currentUserData) return;
    const sorted = currentUserData.charges.slice().sort((a, b) => b.date.localeCompare(a.date));
    sorted.forEach(charge => {
      const card = currentUserData.cards.find(c => c.id === charge.cardId);
      const typeMap = { annual_fee: 'Taxa Anual', interest: 'Juros', annuity: 'Anuidade', insurance: 'Seguro', other: 'Outro' };
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${charge.date}</td><td>${card ? card.name : '-'}</td><td>${typeMap[charge.type] || charge.type}</td><td>${charge.desc}</td><td>${fmtMoney(charge.amount)}</td><td><button type="button" data-id="${charge.id}" class="charge-del">Remover</button></td>`;
      chargesBody.appendChild(tr);
    });
    saveCurrentUserData();
  }

  function updateChargeMetrics() {
    if (!currentUserData) return;
    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const monthlyTotal = currentUserData.charges.filter(c => c.date.startsWith(thisMonth)).reduce((s, c) => s + Number(c.amount), 0);
    const totalAll = currentUserData.charges.reduce((s, c) => s + Number(c.amount), 0);
    if (chargesMonthEl) chargesMonthEl.textContent = fmtMoney(monthlyTotal);
    if (chargesTotalEl) chargesTotalEl.textContent = fmtMoney(totalAll);
    if (cardCountEl) cardCountEl.textContent = currentUserData.cards.length;
  }

  const openAddCard = document.getElementById('open-add-card');
  const cardForm = document.getElementById('add-card-form');
  const cancelAddCard = document.getElementById('cancel-add-card');
  if (openAddCard) openAddCard.addEventListener('click', () => {
    if (cardForm) cardForm.classList.remove('hidden');
    openAddCard.style.display = 'none';
  });
  if (cancelAddCard) cancelAddCard.addEventListener('click', () => {
    if (cardForm) {
      cardForm.reset();
      cardForm.classList.add('hidden');
    }
    openAddCard.style.display = '';
  });
  if (cardForm) cardForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!currentUserData) return alert('Faça login');
    const f = new FormData(cardForm);
    const name = f.get('name');
    const last4 = f.get('last4');
    const holder = f.get('holder');
    const anniversary = f.get('anniversary');
    currentUserData.cards.push({ id: uid(), name, last4, holder, anniversary });
    saveCurrentUserData();
    renderCards();
    renderCardOptions();
    cardForm.reset();
    cardForm.classList.add('hidden');
    openAddCard.style.display = '';
  });

  if (cardsBody) cardsBody.addEventListener('click', e => {
    if (e.target.classList.contains('card-del')) {
      const id = Number(e.target.dataset.id);
      if (!currentUserData) return;
      currentUserData.cards = currentUserData.cards.filter(c => c.id !== id);
      currentUserData.charges = currentUserData.charges.filter(ch => ch.cardId !== id);
      saveCurrentUserData();
      renderCards();
      renderCharges();
      renderCardOptions();
      updateChargeMetrics();
      updateChartsCards();
    }
  });

  const openAddCharge = document.getElementById('open-add-charge');
  const chargeForm = document.getElementById('add-charge-form');
  const cancelAddCharge = document.getElementById('cancel-add-charge');
  if (openAddCharge) openAddCharge.addEventListener('click', () => {
    if (chargeForm) {
      renderCardOptions();
      chargeForm.classList.remove('hidden');
    }
    openAddCharge.style.display = 'none';
  });
  if (cancelAddCharge) cancelAddCharge.addEventListener('click', () => {
    if (chargeForm) {
      chargeForm.reset();
      chargeForm.classList.add('hidden');
    }
    openAddCharge.style.display = '';
  });
  if (chargeForm) chargeForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!currentUserData) return alert('Faça login');
    const f = new FormData(chargeForm);
    const cardId = Number(f.get('cardId')) || null;
    const date = f.get('date');
    const type = f.get('type');
    const desc = f.get('desc')?.trim();
    const amount = parseFloat(f.get('amount')) || 0;
    if (!cardId || !date || !type || !desc || amount <= 0) {
      return alert('Preencha todos os campos obrigatórios.');
    }
    currentUserData.charges.push({ id: uid(), cardId, date, type, desc, amount });
    saveCurrentUserData();
    renderCharges();
    renderCards();
    updateChargeMetrics();
    updateChartsCards();
    chargeForm.reset();
    chargeForm.classList.add('hidden');
    openAddCharge.style.display = '';
  });

  if (chargesBody) chargesBody.addEventListener('click', e => {
    if (e.target.classList.contains('charge-del')) {
      const id = Number(e.target.dataset.id);
      if (!currentUserData) return;
      currentUserData.charges = currentUserData.charges.filter(c => c.id !== id);
      saveCurrentUserData();
      renderCharges();
      renderCards();
      updateChargeMetrics();
      updateChartsCards();
    }
  });

  function initChartsCards() {
    const ctxT = document.getElementById('chart-charges-type')?.getContext('2d');
    const ctxR = document.getElementById('chart-charges-trend')?.getContext('2d');
    const ctxC = document.getElementById('chart-charges-card')?.getContext('2d');
    if (ctxT) {
      chargesTypeChart = new Chart(ctxT, {
        type: 'doughnut',
        data: { labels: [], datasets: [{ data: [], backgroundColor: ['rgba(0,229,255,0.9)', 'rgba(57,255,20,0.9)', 'rgba(255,131,198,0.9)', 'rgba(74,194,255,0.9)', 'rgba(255,107,107,0.9)'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    }
    if (ctxR) {
      chargesTrendChart = new Chart(ctxR, {
        type: 'line',
        data: {
          labels: [],
          datasets: [{ label: 'Encargos', data: [], borderColor: 'rgba(0,229,255,0.8)', backgroundColor: 'rgba(0,229,255,0.1)', tension: 0.4 }]
        },
        options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
      });
    }
    if (ctxC) {
      chargesCardChart = new Chart(ctxC, {
        type: 'bar',
        data: {
          labels: [],
          datasets: [{ label: 'Encargos', data: [], backgroundColor: 'rgba(0,229,255,0.85)', borderColor: 'rgba(0,229,255,1)', borderWidth: 2 }]
        },
        options: { responsive: true, maintainAspectRatio: false, indexAxis: 'y', scales: { x: { beginAtZero: true } }, plugins: { legend: { display: false } } }
      });
    }
    updateChartsCards();
  }

  function updateChartsCards() {
    if (!chargesTypeChart && !chargesTrendChart && !chargesCardChart) return;
    if (!currentUserData) return;

    // Charges by type
    const typeMap = { annual_fee: 'Taxa Anual', interest: 'Juros', annuity: 'Anuidade', insurance: 'Seguro', other: 'Outro' };
    const typeData = {};
    currentUserData.charges.forEach(c => {
      const typeLabel = typeMap[c.type] || c.type;
      typeData[typeLabel] = (typeData[typeLabel] || 0) + Number(c.amount);
    });

    if (chargesTypeChart) {
      chargesTypeChart.data.labels = Object.keys(typeData);
      chargesTypeChart.data.datasets[0].data = Object.values(typeData);
      chargesTypeChart.update();
    }

    // Trend by month
    const monthData = {};
    currentUserData.charges.forEach(c => {
      const month = c.date.slice(0, 7);
      monthData[month] = (monthData[month] || 0) + Number(c.amount);
    });
    const months = Object.keys(monthData).sort();
    if (chargesTrendChart) {
      chargesTrendChart.data.labels = months.map(m => {
        const [y, mo] = m.split('-');
        return `${mo}/${y}`;
      });
      chargesTrendChart.data.datasets[0].data = months.map(m => monthData[m]);
      chargesTrendChart.update();
    }

    // Charges by card
    const cardData = {};
    currentUserData.charges.forEach(c => {
      const card = currentUserData.cards.find(ca => ca.id === c.cardId);
      const cardName = card ? `${card.name} (****${card.last4})` : 'Desconhecido';
      cardData[cardName] = (cardData[cardName] || 0) + Number(c.amount);
    });
    if (chargesCardChart) {
      chargesCardChart.data.labels = Object.keys(cardData);
      chargesCardChart.data.datasets[0].data = Object.values(cardData);
      chargesCardChart.update();
    }
  }

  // ANÁLISE COM IA
  let lastAIContext = null;
  let lastAIAnalysis = null;

  const aiConfigForm = document.getElementById('ai-config-form');
  const toggleAIConfig = document.getElementById('toggle-ai-config');
  const clearAIConfig = document.getElementById('clear-ai-config');
  const runAIAnalysis = document.getElementById('run-ai-analysis');
  const runLocalAnalysis = document.getElementById('run-local-analysis');
  const aiStatus = document.getElementById('ai-status');
  const aiResult = document.getElementById('ai-result');
  const aiEmpty = document.getElementById('ai-empty');
  const aiHistory = document.getElementById('ai-history');
  const aiChatForm = document.getElementById('ai-chat-form');
  const aiChatMessages = document.getElementById('ai-chat-messages');
  const aiModelSelect = document.getElementById('ai-model');
  const aiCustomModelWrap = document.getElementById('ai-custom-model-wrap');

  function loadAIConfigUI() {
    const config = NexusAI.getConfig();
    const apiKeyEl = document.getElementById('ai-api-key');
    const endpointEl = document.getElementById('ai-endpoint');
    if (apiKeyEl) apiKeyEl.value = config.apiKey || '';
    if (endpointEl) endpointEl.value = config.endpoint || 'https://api.openai.com/v1/chat/completions';
    if (aiModelSelect) {
      const knownModels = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo', 'llama-3.3-70b-versatile'];
      if (knownModels.includes(config.model)) {
        aiModelSelect.value = config.model;
        if (aiCustomModelWrap) aiCustomModelWrap.classList.add('hidden');
      } else if (config.model) {
        aiModelSelect.value = 'custom';
        if (aiCustomModelWrap) aiCustomModelWrap.classList.remove('hidden');
        const customEl = document.getElementById('ai-custom-model');
        if (customEl) customEl.value = config.model;
      }
    }
  }

  if (toggleAIConfig) toggleAIConfig.addEventListener('click', () => {
    if (!aiConfigForm) return;
    const hidden = aiConfigForm.classList.toggle('hidden');
    toggleAIConfig.textContent = hidden ? 'Mostrar configurações' : 'Ocultar configurações';
    if (!hidden) loadAIConfigUI();
  });

  if (aiModelSelect) aiModelSelect.addEventListener('change', () => {
    if (aiCustomModelWrap) {
      aiCustomModelWrap.classList.toggle('hidden', aiModelSelect.value !== 'custom');
    }
    if (aiModelSelect.value === 'llama-3.3-70b-versatile') {
      const endpointEl = document.getElementById('ai-endpoint');
      if (endpointEl) endpointEl.value = 'https://api.groq.com/openai/v1/chat/completions';
    }
  });

  if (aiConfigForm) aiConfigForm.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(aiConfigForm);
    let model = f.get('model');
    if (model === 'custom') model = f.get('customModel') || 'gpt-4o-mini';
    NexusAI.saveConfig({
      apiKey: f.get('apiKey') || '',
      endpoint: f.get('endpoint') || 'https://api.openai.com/v1/chat/completions',
      model,
      enabled: !!f.get('apiKey')
    });
    alert('Configuração salva com sucesso.');
  });

  if (clearAIConfig) clearAIConfig.addEventListener('click', () => {
    NexusAI.saveConfig({ apiKey: '', enabled: false });
    loadAIConfigUI();
    alert('Chave removida.');
  });

  function showAIAnalysis(text, type) {
    if (aiEmpty) aiEmpty.classList.add('hidden');
    if (aiStatus) aiStatus.classList.add('hidden');
    if (aiResult) {
      aiResult.classList.remove('hidden');
      aiResult.innerHTML = NexusAI.renderMarkdown(text);
    }
    if (currentUserId) {
      NexusAI.saveAnalysisHistory(currentUserId, {
        date: new Date().toISOString(),
        type,
        preview: text.slice(0, 120).replace(/\n/g, ' '),
        content: text
      });
      renderAIHistory();
    }
    lastAIAnalysis = text;
  }

  function setAILoading(loading) {
    if (aiStatus) aiStatus.classList.toggle('hidden', !loading);
    if (loading && aiResult) aiResult.classList.add('hidden');
    if (loading && aiEmpty) aiEmpty.classList.add('hidden');
  }

  async function runAnalysis(useAI) {
    if (!requireAuth() || !currentUserData) return alert('Faça login para analisar.');
    const health = calculateHealthMetrics();
    const context = NexusAI.buildContext(currentUserData, health);
    lastAIContext = context;
    setAILoading(true);

    try {
      let result;
      if (useAI) {
        const config = NexusAI.getConfig();
        if (!config.apiKey) {
          setAILoading(false);
          if (aiEmpty) aiEmpty.classList.remove('hidden');
          return alert('Configure sua chave de API em "Mostrar configurações" ou use a análise local.');
        }
        result = await NexusAI.analyzeWithAI(context, config);
        showAIAnalysis(result, 'ia');
      } else {
        result = NexusAI.analyzeLocal(context);
        showAIAnalysis(result, 'local');
      }
    } catch (err) {
      setAILoading(false);
      if (aiEmpty) aiEmpty.classList.remove('hidden');
      alert('Erro na análise: ' + err.message);
    }
  }

  if (runAIAnalysis) runAIAnalysis.addEventListener('click', () => runAnalysis(true));
  if (runLocalAnalysis) runLocalAnalysis.addEventListener('click', () => runAnalysis(false));

  function renderAIHistory() {
    if (!aiHistory || !currentUserId) return;
    const history = NexusAI.getAnalysisHistory(currentUserId);
    if (history.length === 0) {
      aiHistory.innerHTML = '<p style="color:var(--muted);font-size:0.9rem;">Nenhuma análise realizada ainda.</p>';
      return;
    }
    aiHistory.innerHTML = history.map((h, i) => `
      <div class="ai-history-item" data-idx="${i}">
        <div>
          <div class="ai-history-type">${h.type === 'ia' ? 'IA' : 'Local'}</div>
          <div>${h.preview}...</div>
        </div>
        <div class="ai-history-date">${new Date(h.date).toLocaleString('pt-BR')}</div>
      </div>
    `).join('');
  }

  if (aiHistory) aiHistory.addEventListener('click', e => {
    const item = e.target.closest('.ai-history-item');
    if (!item || !currentUserId) return;
    const history = NexusAI.getAnalysisHistory(currentUserId);
    const entry = history[Number(item.dataset.idx)];
    if (entry) showAIAnalysis(entry.content, entry.type);
  });

  if (aiChatForm) aiChatForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!requireAuth() || !currentUserData) return alert('Faça login.');
    const input = document.getElementById('ai-chat-input');
    const question = input?.value?.trim();
    if (!question) return;

    const appendMsg = (role, text) => {
      if (!aiChatMessages) return;
      const div = document.createElement('div');
      div.className = `ai-chat-msg ${role}`;
      div.textContent = text;
      aiChatMessages.appendChild(div);
      aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    };

    appendMsg('user', question);
    input.value = '';

    const config = NexusAI.getConfig();
    if (!config.apiKey) {
      appendMsg('assistant', 'Configure uma chave de API para usar o chat. Enquanto isso, use a análise local para recomendações gerais.');
      return;
    }

    const health = calculateHealthMetrics();
    const context = lastAIContext || NexusAI.buildContext(currentUserData, health);

    appendMsg('assistant', 'Pensando...');

    try {
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: 'system', content: 'Você é um consultor financeiro brasileiro. Responda de forma concisa e prática em português. Use os dados financeiros fornecidos como contexto.' },
            { role: 'user', content: `Contexto financeiro:\n${JSON.stringify(context, null, 2)}\n\nPergunta: ${question}` }
          ],
          temperature: 0.7,
          max_tokens: 800
        })
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error?.message || `Erro HTTP ${response.status}`);
      }

      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content || 'Sem resposta.';
      if (aiChatMessages?.lastChild) aiChatMessages.removeChild(aiChatMessages.lastChild);
      appendMsg('assistant', answer);
    } catch (err) {
      if (aiChatMessages?.lastChild) aiChatMessages.removeChild(aiChatMessages.lastChild);
      appendMsg('assistant', 'Erro: ' + err.message);
    }
  });

  function render() {
    if (!requireAuth()) return;
    if (!currentUserData) loadCurrentUserData();
    renderAccountOptions();
    renderCategoryOptionsForTx();
    renderAccounts();
    renderUsers();
    renderRecentTransactions();
    renderTxs();
    renderCards();
    renderCharges();
    renderCardOptions();
    renderCategories();
    renderGoals();
    renderCategorySelects();
    updateChartsCategories();
    renderRecurring();
    populateRecurringAccountSelect();
    updateHealthMetrics();
    updateSaldo();
    renderDashboardMetrics();
    updateChargeMetrics();
    updateCharts();
    updateChartsCards();
    renderAIHistory();
    refreshAuthUI();
  }

  loadAIConfigUI();

  if (currentUserId) loadCurrentUserData();
  const initial = location.hash ? location.hash.replace('#', '') : (currentUserId ? 'dashboard' : 'auth');
  showView(initial, false);
  refreshAuthUI();
  initCharts();
  initChartsCards();
  render();
});
