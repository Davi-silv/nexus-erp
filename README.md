# Nexus ERP v2

Sistema ERP financeiro moderno com arquitetura modular, camadas separadas e UI glassmorphism.

## Início Rápido

```bash
npm install
npm run dev        # http://localhost:8080
```

**Credenciais padrão:** `admin@nexus.local` / `admin`

## Arquitetura

Consulte [ARCHITECTURE.md](ARCHITECTURE.md) para detalhes completos da remodelagem v2.

```
src/
├── core/           # Utilitários, constantes, event bus
├── domain/         # Lógica de negócio pura (testável)
├── repositories/   # Persistência (localStorage)
├── services/       # IA, APIs externas
├── state/          # AppStore central
├── ui/modules/     # Um módulo por feature
└── main.js         # Bootstrap
```

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento (Vite) |
| `npm run build` | Build de produção → `dist/` |
| `npm test` | Testes unitários + integração (Vitest) |
| `npm run test:integration` | Automação de fluxos PF/PJ (integração) |
| `npm run test:e2e` | Automação E2E no navegador (usa Chrome do sistema no Debian 11) |
| `npm run test:all` | Todos os testes (Vitest + Playwright) |

> **Debian 11:** `npx playwright install chromium` não é suportado nesta versão. O script `scripts/test-e2e.sh` usa o Google Chrome instalado no sistema automaticamente. No CI (Ubuntu), o Playwright instala o Chromium normalmente.

## Funcionalidades

### Perfis
- **Pessoa Física (PF)** — finanças pessoais, metas e categorias de consumo
- **Empresa PME (PJ)** — CNPJ, centros de custo, DRE simplificado, plano de contas

- **Dashboard** — saldo, receitas/despesas, gráficos Chart.js
- **Contas** — CRUD com saldo sincronizado aos lançamentos
- **Lançamentos** — crédito/débito com categorias e filtros
- **Cartões** — encargos, taxas, gráficos por tipo/cartão
- **Categorias & Metas** — orçamento com barras de progresso
- **Recorrentes** — geração automática de lançamentos
- **Saúde Financeira** — score 0-100, recomendações
- **Análise IA** — OpenAI/Groq + análise local
- **Conciliação** — CSV de extrato bancário
- **Relatórios** — exportação CSV
- **Usuários** — admin CRUD

## Migração v1 → v2

Dados em localStorage são **100% compatíveis**. O código legado permanece em `js/` para referência.

## Lançamento comercial

Documentação completa em **[docs/](docs/README.md)**:

| Fase | Foco | Documento |
|------|------|-------------|
| **Agora** | Deploy MVP + validação | [DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| **2–4 meses** | Backend SaaS | [BACKEND-MIGRATION.md](docs/BACKEND-MIGRATION.md) |
| **4–6 meses** | Planos e billing | [MONETIZATION.md](docs/MONETIZATION.md) |
| **Contínuo** | LGPD e segurança | [SECURITY-LGPD.md](docs/SECURITY-LGPD.md) |

Configuração de produto: `src/config/app.config.js` · Planos: `src/config/plans.config.js`

Deploy rápido:

```bash
npm run build
docker build -t nexus-erp . && docker run -p 8080:80 nexus-erp
```

**Landing page:** abra `marketing/index.html` no navegador ou `npm run dev:landing` (porta 3000).
CTAs apontam para o app em `index.html#auth`.

## Melhorias v2

- Monolito de 1.569 linhas → ~20 módulos ES
- Repository Pattern + Event Bus (Observer)
- Funções de domínio testáveis com Vitest
- Proteção XSS via `escapeHtml()`
- Saldos de contas sincronizados com lançamentos
- Build de produção com Vite
