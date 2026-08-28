/**
 * PWA install — suporte a Chrome, Edge, Firefox, Safari, Opera, Samsung e iOS.
 */
export function initPwaInstall() {
  const buttons = [
    document.getElementById('btn-install-app'),
    document.getElementById('btn-install-sidebar')
  ].filter(Boolean);
  const banner = document.getElementById('pwa-install-banner');
  const modal = document.getElementById('pwa-install-modal');
  const modalTitle = document.getElementById('pwa-install-modal-title');
  const modalSteps = document.getElementById('pwa-install-modal-steps');
  const modalClose = document.getElementById('pwa-install-modal-close');
  if (!buttons.length) return;

  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    window.matchMedia('(display-mode: minimal-ui)').matches ||
    window.navigator.standalone === true;

  const isIOS = () =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  const detectBrowser = () => {
    const ua = navigator.userAgent;
    if (isIOS()) return 'ios';
    if (/SamsungBrowser/i.test(ua)) return 'samsung';
    if (/Edg\//i.test(ua)) return 'edge';
    if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return 'opera';
    if (/Firefox/i.test(ua)) return 'firefox';
    if (/Chrome/i.test(ua)) return 'chrome';
    if (/Safari/i.test(ua)) return 'safari';
    return 'generic';
  };

  const browserLabels = {
    chrome: 'Google Chrome',
    edge: 'Microsoft Edge',
    firefox: 'Mozilla Firefox',
    safari: 'Safari',
    opera: 'Opera',
    samsung: 'Samsung Internet',
    ios: 'Safari / navegador do iPhone',
    generic: 'seu navegador'
  };

  const getInstallGuide = (browser) => {
    const guides = {
      chrome: {
        title: 'Instalar no Chrome',
        steps: [
          'Toque no ícone ⊕ ou "Instalar" na barra de endereço, ou',
          'Abra o menu ⋮ (três pontos) no canto superior direito',
          'Selecione "Instalar Nexus ERP" ou "Instalar aplicativo"',
          'Confirme em "Instalar"'
        ]
      },
      edge: {
        title: 'Instalar no Edge',
        steps: [
          'Clique no ícone de instalação na barra de endereço, ou',
          'Abra o menu ⋯ → "Aplicativos" → "Instalar este site como um aplicativo"',
          'Confirme em "Instalar"'
        ]
      },
      firefox: {
        title: 'Instalar no Firefox',
        steps: [
          'Abra o menu ☰ no canto superior direito',
          'Selecione "Instalar" ou "Instalar esta página como app"',
          'No Android: menu → "Instalar" ou "Adicionar à tela inicial"',
          'Confirme a instalação'
        ]
      },
      safari: {
        title: 'Instalar no Safari (Mac)',
        steps: [
          'No menu "Arquivo", escolha "Adicionar ao Dock", ou',
          'Clique em Compartilhar → "Adicionar ao Dock"',
          'O Nexus ERP ficará disponível como aplicativo no Dock'
        ]
      },
      opera: {
        title: 'Instalar no Opera',
        steps: [
          'Abra o menu Opera no canto superior esquerdo',
          'Selecione "Instalar Nexus ERP" ou "Instalar..."',
          'Confirme a instalação'
        ]
      },
      samsung: {
        title: 'Instalar no Samsung Internet',
        steps: [
          'Toque no menu ☰',
          'Selecione "Adicionar página a" → "Tela inicial" ou "Instalar app"',
          'Confirme o nome e toque em "Adicionar"'
        ]
      },
      ios: {
        title: 'Instalar no iPhone ou iPad',
        steps: [
          'Toque em Compartilhar (ícone □↑) na barra inferior ou superior',
          'Role a lista e toque em "Adicionar à Tela de Início"',
          'Edite o nome se quiser e toque em "Adicionar"',
          'Funciona no Safari, Chrome, Edge e Firefox no iOS'
        ]
      },
      generic: {
        title: 'Instalar o Nexus ERP',
        steps: [
          'Chrome / Edge / Opera: menu do navegador → "Instalar aplicativo"',
          'Firefox: menu ☰ → "Instalar" ou "Instalar esta página como app"',
          'iPhone/iPad: Compartilhar → "Adicionar à Tela de Início"',
          'Mac (Safari): Arquivo → "Adicionar ao Dock"'
        ]
      }
    };
    return guides[browser] || guides.generic;
  };

  const hide = () => {
    buttons.forEach((btn) => btn.classList.add('hidden'));
    banner?.classList.add('hidden');
  };

  const showButton = () => {
    if (isStandalone()) return;
    buttons.forEach((btn) => btn.classList.remove('hidden'));
  };

  const showBanner = () => {
    if (isStandalone() || sessionStorage.getItem('nexus-pwa-dismiss')) return;
    banner?.classList.remove('hidden');
  };

  const showGuideModal = () => {
    const browser = detectBrowser();
    const guide = getInstallGuide(browser);
    if (modalTitle) modalTitle.textContent = guide.title;
    const browserLabel = document.getElementById('pwa-install-modal-browser');
    if (browserLabel) browserLabel.textContent = browserLabels[browser] || browserLabels.generic;
    if (modalSteps) {
      modalSteps.innerHTML = guide.steps.map((step) => `<li>${step}</li>`).join('');
    }
    modal?.classList.remove('hidden');
  };

  const closeGuideModal = () => modal?.classList.add('hidden');

  const triggerInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      hide();
      return;
    }
    showGuideModal();
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showButton();
    showBanner();
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    hide();
    closeGuideModal();
  });

  buttons.forEach((btn) => btn.addEventListener('click', triggerInstall));

  document.getElementById('pwa-install-banner-btn')?.addEventListener('click', triggerInstall);

  document.getElementById('pwa-install-dismiss')?.addEventListener('click', () => {
    banner?.classList.add('hidden');
    sessionStorage.setItem('nexus-pwa-dismiss', '1');
  });

  modalClose?.addEventListener('click', closeGuideModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeGuideModal();
  });

  if (isStandalone()) {
    hide();
    return;
  }

  showButton();
  showBanner();

  window.__NEXUS_INSTALL__ = triggerInstall;
  window.__NEXUS_BROWSER__ = () => browserLabels[detectBrowser()] || browserLabels.generic;
}
