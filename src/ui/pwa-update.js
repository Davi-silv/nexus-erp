/**
 * Notifica quando uma nova versão do PWA está disponível e força reload suave.
 */
export function initPwaUpdate(registerSW) {
  let refreshing = false;

  registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => registration.update(), 60 * 60 * 1000);
      }
    },
    onNeedRefresh() {
      showUpdateBanner(() => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
      });
    }
  });
}

function showUpdateBanner(onReload) {
  if (document.getElementById('pwa-update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.className = 'pwa-update-banner';
  banner.innerHTML = `
    <div class="pwa-update-banner__text">
      <strong>Nova versão disponível</strong>
      <span>Atualize o Nexus para ver planos, Supabase e melhorias recentes.</span>
    </div>
    <button type="button" class="btn-primary" id="pwa-update-reload">Atualizar agora</button>
    <button type="button" class="pwa-update-banner__close" id="pwa-update-dismiss" aria-label="Fechar">×</button>
  `;

  document.body.appendChild(banner);
  banner.querySelector('#pwa-update-reload')?.addEventListener('click', onReload);
  banner.querySelector('#pwa-update-dismiss')?.addEventListener('click', () => banner.remove());
}
