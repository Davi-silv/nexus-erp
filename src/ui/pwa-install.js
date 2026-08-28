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

  const isIOS = () =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const isMobileBrowser = () => {
    if (isIOS()) return true;
    if (/Android/i.test(navigator.userAgent)) return true;
    return window.matchMedia('(pointer: coarse)').matches && window.innerWidth <= 1024;
  };

  const hide = () => {
    btn.classList.add('hidden');
    banner?.classList.add('hidden');
  };

  const showButton = () => {
    if (isStandalone()) return;
    btn.classList.remove('hidden');
  };

  const showBanner = () => {
    if (isStandalone() || sessionStorage.getItem('nexus-pwa-dismiss')) return;
    banner?.classList.remove('hidden');
  };

  const installInstructions = () =>
    isIOS()
      ? 'Para instalar no iPhone/iPad:\n\n1. Toque em Compartilhar (ícone □↑)\n2. Role e toque em "Adicionar à Tela de Início"\n3. Confirme em "Adicionar"'
      : 'Para instalar o Nexus ERP:\n\n' +
        '• Chrome/Edge: menu ⋮ → "Instalar aplicativo" ou ícone ⊕ na barra de endereço\n' +
        '• Safari (iPhone): Compartilhar → "Adicionar à Tela de Início"\n' +
        '• Firefox: menu → "Instalar"';

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showButton();
    showBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hide();
  });

  btn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      hide();
      return;
    }
    alert(installInstructions());
  });

  document.getElementById('pwa-install-banner-btn')?.addEventListener('click', () => {
    btn.click();
  });

  document.getElementById('pwa-install-dismiss')?.addEventListener('click', () => {
    banner?.classList.add('hidden');
    sessionStorage.setItem('nexus-pwa-dismiss', '1');
  });

  if (isStandalone()) {
    hide();
    return;
  }

  if (isMobileBrowser()) {
    showButton();
    if (isIOS()) showBanner();
  }
}
