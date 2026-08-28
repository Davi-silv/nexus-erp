/**
 * Navegação mobile — drawer lateral com overlay.
 */
function isMobileLayout() {
  if (typeof window.__NEXUS_IS_MOBILE__ === 'function') {
    return window.__NEXUS_IS_MOBILE__();
  }
  const w = Math.min(
    window.innerWidth || 9999,
    document.documentElement.clientWidth || 9999,
    window.screen?.width || 9999
  );
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const noHover = window.matchMedia('(hover: none)').matches;
  const standalone = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const touchPoints = navigator.maxTouchPoints || 0;
  return (w <= 1024 && (coarse || noHover || touchPoints > 0 || standalone)) || standalone;
}

function syncMobileLayoutClass() {
  document.documentElement.classList.toggle('mobile-layout', isMobileLayout());
}

function syncSidebarVisibility(sidebar, open) {
  if (!isMobileLayout()) {
    sidebar.style.removeProperty('display');
    return;
  }
  sidebar.style.display = open ? 'flex' : 'none';
}

export function initMobileNav() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const toggle = document.getElementById('btn-menu-toggle');
  const closeBtn = document.getElementById('btn-sidebar-close');
  if (!sidebar || !toggle) return;

  syncMobileLayoutClass();
  window.addEventListener('resize', syncMobileLayoutClass);
  window.addEventListener('orientationchange', syncMobileLayoutClass);

  function close() {
    sidebar.classList.remove('open');
    overlay?.classList.remove('active');
    overlay?.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('nav-open');
    toggle.setAttribute('aria-expanded', 'false');
    syncSidebarVisibility(sidebar, false);
  }

  function open() {
    if (!isMobileLayout()) return;
    sidebar.classList.add('open');
    overlay?.classList.add('active');
    overlay?.setAttribute('aria-hidden', 'false');
    document.body.classList.add('nav-open');
    toggle.setAttribute('aria-expanded', 'true');
    syncSidebarVisibility(sidebar, true);
  }

  toggle.addEventListener('click', () => {
    sidebar.classList.contains('open') ? close() : open();
  });

  closeBtn?.addEventListener('click', close);
  overlay?.addEventListener('click', close);
  window.addEventListener('hashchange', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  sidebar.querySelectorAll('.nav-item').forEach((btn) => btn.addEventListener('click', close));

  window.matchMedia('(max-width: 1024px)').addEventListener('change', () => {
    syncMobileLayoutClass();
    if (!isMobileLayout()) close();
  });

  close();
}
