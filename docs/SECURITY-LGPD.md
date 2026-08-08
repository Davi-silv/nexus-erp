# Segurança e LGPD

## Contexto legal (Brasil)

O Nexus ERP trata **dados financeiros pessoais e empresariais** — enquadrados como dados pessoais pela **LGPD** (Lei 13.709/2018).

## Dados coletados hoje (MVP local)

| Dado | Onde | Finalidade |
|------|------|------------|
| Nome, email, senha (hash) | localStorage | Autenticação |
| Lançamentos, contas, cartões | localStorage | Funcionalidade core |
| CNPJ, razão social (PJ) | localStorage | Perfil empresa |
| Chaves API IA (opcional) | localStorage | Análise IA |

**MVP local:** dados ficam no dispositivo do usuário — responsabilidade compartilhada muda na Fase 2 (cloud).

## Medidas já implementadas

- Senhas com hash SHA-256 (`hashPassword`) — **migrar para bcrypt/argon2 no backend**
- Escape HTML (`escapeHtml`) contra XSS
- Sem exposição de secrets no repositório
- `.env` no `.gitignore`

## Obrigatório antes do lançamento comercial

### Documentos legais

- [ ] **Política de Privacidade** — o que coleta, base legal, retenção, direitos do titular
- [ ] **Termos de Uso** — limitação de responsabilidade, SLA, cancelamento
- [ ] **Política de Cookies** — se usar analytics

Modelo: consultar advogado ou adaptar templates LGPD (ex.: RAAD, OAB).

### Direitos do titular (LGPD Art. 18)

Implementar na Fase 2:

| Direito | Feature |
|---------|---------|
| Acesso | Exportar todos os dados (JSON/CSV) |
| Correção | Editar perfil e lançamentos |
| Exclusão | “Excluir minha conta” |
| Portabilidade | Download completo |
| Revogação | Opt-out marketing |

### DPO / Encarregado

Para operação com escala, nomear encarregado: `privacidade@seudominio.com.br`.

## Segurança técnica (Fase 2 cloud)

| Controle | Implementação |
|----------|---------------|
| HTTPS | Obrigatório (TLS 1.2+) |
| Auth | JWT curto + refresh httpOnly |
| Senhas | bcrypt cost 12+ |
| Rate limiting | API gateway / Cloudflare |
| Backup | Diário, criptografado |
| Audit log | Ações sensíveis (login, export, delete) |
| Pentest | Antes de escala (>1000 users) |

## IA e dados

- Chaves OpenAI/Groq: **nunca** logar prompts com PII
- Opção “análise local” sem enviar dados externos (já parcialmente suportado)
- Termo claro: quais dados vão para LLM terceiro

## Incidentes

Plano de resposta:

1. Conter (revogar tokens, isolar)
2. Notificar ANPD em 72h se risco relevante (Art. 48)
3. Comunicar usuários afetados
4. Post-mortem documentado

## Checklist rápido pré-beta

- [ ] Política de privacidade publicada
- [ ] Termos de uso publicados
- [ ] Consentimento no cadastro (checkbox)
- [ ] Email de contato privacidade@ configurado
- [ ] Processo de exclusão de conta definido
