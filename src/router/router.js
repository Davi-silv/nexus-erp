/**
 * Router — hash-based SPA routing (Separation of Concerns).
 */
const PAGE_TITLES = {
  auth: 'Entrar',
  dashboard: 'Dashboard',
  contas: 'Contas Bancárias',
  lancamentos: 'Lançamentos',
  cartoes: 'Cartões de Crédito',
  categorias: 'Categorias & Metas',
  recorrentes: 'Recorrentes',
  saude: 'Saúde Financeira',
  'ia-analise': 'Análise com IA',
  conciliacao: 'Conciliação',
  relatorios: 'Relatórios',
  usuarios: 'Usuários',
  empresa: 'Minha Empresa',
  bancos: 'Bancos & Cartões',
  clientes: 'Clientes',
  servicos: 'Serviços',
  orcamentos: 'Orçamentos',
  'contas-receber': 'Contas a Receber',
  'config-fiscal': 'Configurações Fiscais',
  'notas-fiscais': 'Notas Fiscais',
  planos: 'Planos',
  assinatura: 'Assinatura'
};

export class Router {
  constructor(defaultView = 'auth') {
    this.defaultView = defaultView;
    this.navItems = document.querySelectorAll('.nav-item');
    this.views = document.querySelectorAll('.view');
    this.onNavigate = null;
    this.pageTitleEl = document.getElementById('page-title');
  }

  init() {
    this.navItems.forEach(btn =>
      btn.addEventListener('click', () => this.navigate(btn.dataset.view))
    );
    window.addEventListener('hashchange', () => {
      const id = location.hash.replace('#', '');
      this.show(id, false);
    });
  }

  navigate(id, push = true) {
    this.show(id, push);
    if (this.onNavigate) this.onNavigate(id);
  }

  show(id, push = true) {
    if (!id) id = this.defaultView;
    this.views.forEach(v => v.classList.remove('active'));
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
    this.navItems.forEach(n => n.classList.toggle('active', n.dataset.view === id));
    document.body.dataset.view = id;
    if (this.pageTitleEl) {
      this.pageTitleEl.textContent = PAGE_TITLES[id] || 'Nexus ERP';
    }
    if (push) location.hash = '#' + id;
  }

  getInitialView(isAuthenticated) {
    if (location.hash) return location.hash.replace('#', '');
    return isAuthenticated ? 'dashboard' : 'auth';
  }
}
