import { FEATURES } from '../domain/features.js';

/** Verifica limite antes de mutate; retorna false se bloqueado */
export async function guardMutation(store, subscription, feature, router) {
  if (!subscription.isCloudEnforced()) return true;
  if (!subscription.canWrite()) {
    alert('Seu teste gratuito terminou. Escolha um plano para continuar editando dados.');
    router.navigate('planos');
    return false;
  }
  const check = await subscription.checkLimit(feature);
  if (!check.ok) {
    const labels = {
      [FEATURES.FINANCIAL_ACCOUNTS]: 'contas financeiras',
      [FEATURES.USERS]: 'usuários',
      [FEATURES.AI_REQUESTS]: 'consultas de IA'
    };
    const name = labels[feature] || 'recurso';
    if (check.reason === 'limit_reached') {
      alert(`Você atingiu o limite de ${name} do seu plano (${check.usage}/${check.limit}).`);
    } else {
      alert(`${name} não disponível no seu plano.`);
    }
    router.navigate('planos');
    return false;
  }
  return true;
}
