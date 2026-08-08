/**
 * PWA install prompt — captura beforeinstallprompt e exibe botão de instalação.
 */
export function initPwaInstall() {
  const btn = document.getElementById('btn-install-app');
  const banner = document.getElementById('pwa-install-banner');
  if (!btn) return;

  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const hide = () => {
    btn.classList.add('hidden');
    banner?.classList.add('hidden');
  };

  const show = () => {
    if (isStandalone()) return;
    btn.classList.remove('hidden');
    banner?.classList.remove('hidden');
  };

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    show();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hide();
  });

  btn.addEventListener('click', async () => {
    if (!deferredPrompt) {
      alert(
        'Para instalar o Nexus ERP:\n\n' +
        '• Chrome/Edge: menu ⋮ → "Instalar aplicativo" ou ícone ⊕ na barra de endereço\n' +
        '• Safari (iPhone): Compartilhar → "Adicionar à Tela de Início"\n' +
        '• Firefox: menu → "Instalar"'
      );
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    hide();
  });

  document.getElementById('pwa-install-banner-btn')?.addEventListener('click', () => {
    btn.click();
  });

  document.getElementById('pwa-install-dismiss')?.addEventListener('click', () => {
    banner?.classList.add('hidden');
    sessionStorage.setItem('nexus-pwa-dismiss', '1');
  });

  if (sessionStorage.getItem('nexus-pwa-dismiss')) {
    banner?.classList.add('hidden');
  }

  if (isStandalone()) hide();
}
