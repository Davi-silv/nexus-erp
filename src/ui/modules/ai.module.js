import * as AIService from '../../services/ai.service.js';
import { Events } from '../../core/event-bus.js';

export function initAIModule(store, auth, health) {
  let lastAIContext = null;

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
    const config = AIService.getConfig();
    document.getElementById('ai-api-key') && (document.getElementById('ai-api-key').value = config.apiKey || '');
    document.getElementById('ai-endpoint') && (document.getElementById('ai-endpoint').value = config.endpoint || '');
    if (aiModelSelect) {
      const known = ['gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo', 'llama-3.3-70b-versatile'];
      if (known.includes(config.model)) {
        aiModelSelect.value = config.model;
        aiCustomModelWrap?.classList.add('hidden');
      } else if (config.model) {
        aiModelSelect.value = 'custom';
        aiCustomModelWrap?.classList.remove('hidden');
        const customEl = document.getElementById('ai-custom-model');
        if (customEl) customEl.value = config.model;
      }
    }
  }

  function showAIAnalysis(text, type) {
    aiEmpty?.classList.add('hidden');
    aiStatus?.classList.add('hidden');
    if (aiResult) {
      aiResult.classList.remove('hidden');
      aiResult.innerHTML = AIService.renderMarkdown(text);
    }
    if (store.currentUserId) {
      AIService.saveAnalysisHistory(store.currentUserId, {
        date: new Date().toISOString(),
        type,
        preview: text.slice(0, 120).replace(/\n/g, ' '),
        content: text
      });
      renderAIHistory();
    }
  }

  function setAILoading(loading) {
    aiStatus?.classList.toggle('hidden', !loading);
    if (loading) {
      aiResult?.classList.add('hidden');
      aiEmpty?.classList.add('hidden');
    }
  }

  async function runAnalysis(useAI) {
    if (!auth.requireAuth() || !store.currentUserData) return alert('Faça login para analisar.');
    const healthMetrics = health.calculateHealthMetrics();
    const context = AIService.buildContext(store.currentUserData, healthMetrics, store.currentUser());
    lastAIContext = context;
    setAILoading(true);

    try {
      if (useAI) {
        const config = AIService.getConfig();
        if (!config.apiKey) {
          setAILoading(false);
          aiEmpty?.classList.remove('hidden');
          return alert('Configure sua chave de API ou use análise local.');
        }
        showAIAnalysis(await AIService.analyzeWithAI(context, config), 'ia');
      } else {
        showAIAnalysis(AIService.analyzeLocal(context), 'local');
      }
    } catch (err) {
      setAILoading(false);
      aiEmpty?.classList.remove('hidden');
      alert('Erro na análise: ' + err.message);
    }
  }

  function renderAIHistory() {
    if (!aiHistory || !store.currentUserId) return;
    const history = AIService.getAnalysisHistory(store.currentUserId);
    if (!history.length) {
      aiHistory.innerHTML = '<p class="ai-empty-msg">Nenhuma análise realizada ainda.</p>';
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

  toggleAIConfig?.addEventListener('click', () => {
    const hidden = aiConfigForm.classList.toggle('hidden');
    toggleAIConfig.textContent = hidden ? 'Mostrar configurações' : 'Ocultar configurações';
    if (!hidden) loadAIConfigUI();
  });

  aiModelSelect?.addEventListener('change', () => {
    aiCustomModelWrap?.classList.toggle('hidden', aiModelSelect.value !== 'custom');
    if (aiModelSelect.value === 'llama-3.3-70b-versatile') {
      const ep = document.getElementById('ai-endpoint');
      if (ep) ep.value = 'https://api.groq.com/openai/v1/chat/completions';
    }
  });

  aiConfigForm?.addEventListener('submit', e => {
    e.preventDefault();
    const f = new FormData(aiConfigForm);
    let model = f.get('model');
    if (model === 'custom') model = f.get('customModel') || 'gpt-4o-mini';
    AIService.saveConfig({
      apiKey: f.get('apiKey') || '',
      endpoint: f.get('endpoint') || 'https://api.openai.com/v1/chat/completions',
      model,
      enabled: !!f.get('apiKey')
    });
    alert('Configuração salva.');
  });

  clearAIConfig?.addEventListener('click', () => {
    AIService.saveConfig({ apiKey: '', enabled: false });
    loadAIConfigUI();
    alert('Chave removida.');
  });

  runAIAnalysis?.addEventListener('click', () => runAnalysis(true));
  runLocalAnalysis?.addEventListener('click', () => runAnalysis(false));

  aiHistory?.addEventListener('click', e => {
    const item = e.target.closest('.ai-history-item');
    if (!item || !store.currentUserId) return;
    const entry = AIService.getAnalysisHistory(store.currentUserId)[Number(item.dataset.idx)];
    if (entry) showAIAnalysis(entry.content, entry.type);
  });

  aiChatForm?.addEventListener('submit', async e => {
    e.preventDefault();
    if (!auth.requireAuth()) return;
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

    const config = AIService.getConfig();
    if (!config.apiKey) {
      appendMsg('assistant', 'Configure uma chave de API para usar o chat.');
      return;
    }

    appendMsg('assistant', 'Pensando...');
    const context = lastAIContext || AIService.buildContext(store.currentUserData, health.calculateHealthMetrics(), store.currentUser());

    try {
      const answer = await AIService.chatWithAI(context, question, config);
      aiChatMessages?.lastChild?.remove();
      appendMsg('assistant', answer);
    } catch (err) {
      aiChatMessages?.lastChild?.remove();
      appendMsg('assistant', 'Erro: ' + err.message);
    }
  });

  store.bus.on(Events.AUTH_CHANGED, renderAIHistory);

  loadAIConfigUI();
  return { renderAIHistory, loadAIConfigUI };
}
