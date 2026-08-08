/**
 * Navegação mobile — drawer lateral com overlay.
 */
export function initMobileNav() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle = document.getElementById('btn-menu-toggle');
  if (!sidebar || !toggle) return;

  const mq = window.matchMedia('(max-width: 820px)');

  function close() {
    sidebar.classList.remove('open');
    overlay?.classList.remove('active');
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  function open() {
    if (!mq.matches) return;
    sidebar.classList.add('open');
    overlay?.classList.add('active');
    document.body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? close() : open();
  });

  overlay?.addEventListener('click', close);
  window.addEventListener('hashchange', close);
  sidebar.querySelectorAll('.nav-item').forEach((btn) => btn.addEventListener('click', close));

  mq.addEventListener('change', (e) => {
    if (!e.matches) close();
  });
}
