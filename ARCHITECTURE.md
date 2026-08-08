# Arquitetura Nexus ERP v2

## Visão Geral

O Nexus ERP foi remodelado seguindo princípios de **engenharia de software** e **arquitetura limpa**, com separação clara de responsabilidades e código testável.

```
┌─────────────────────────────────────────────────────────┐
│                    Presentation (UI)                     │
│  auth · dashboard · contas · txs · cartões · ia · ...   │
├─────────────────────────────────────────────────────────┤
│                   Application Layer                      │
│         AppStore · Router · EventBus · Charts           │
├─────────────────────────────────────────────────────────┤
│                     Domain Layer                         │
│  finance · reconciliation · recurring · export · ai     │
├─────────────────────────────────────────────────────────┤
│                  Infrastructure Layer                    │
│        StorageAdapter · UsersRepo · UserDataRepo        │
└─────────────────────────────────────────────────────────┘
```

## Princípios Aplicados

| Princípio | Implementação |
|-----------|---------------|
| **SRP** (Single Responsibility) | Cada módulo UI gerencia uma feature; serviços de domínio são puros |
| **Separation of Concerns** | UI, estado, persistência e lógica de negócio em camadas distintas |
| **Repository Pattern** | `UsersRepository` e `UserDataRepository` abstraem localStorage |
| **Observer Pattern** | `EventBus` desacopla módulos; substitui `render()` monolítico |
| **Flux unidirecional** | Store → mutate → save → emit → UI refresh |
| **Composition Root** | `main.js` instancia e conecta todas as dependências |
| **Testabilidade** | Funções puras em `domain/` com testes Vitest |
| **Escape HTML** | Proteção XSS via `escapeHtml()` em renderizações |

## Estrutura de Pastas

```
src/
├── core/           # Utilitários, constantes, event bus
├── infrastructure/ # Adapter de storage
├── repositories/   # Acesso a dados (localStorage)
├── domain/         # Lógica de negócio pura (sem DOM)
├── services/       # Serviços de aplicação (IA, APIs)
├── state/          # AppStore (estado central)
├── router/         # Roteamento hash SPA
├── ui/
│   ├── chart-registry.js
│   └── modules/    # Um módulo por feature
└── main.js         # Bootstrap (Composition Root)

tests/
└── domain/         # Testes unitários das regras de negócio
```

## Métricas de Qualidade

| Métrica | Antes (v1) | Depois (v2) |
|---------|------------|-------------|
| Linhas em app.js | ~1.569 | 0 (modularizado) |
| Arquivos JS | 2 | ~20 módulos |
| Acoplamento | Alto (closure monolítica) | Baixo (ES modules + EventBus) |
| Testabilidade | 0% | Domain layer testável |
| Coesão | Baixa | Alta (por domínio) |
| Manutenibilidade | Difícil | Feature isolada por arquivo |

## Como Executar

```bash
npm install
npm run dev      # Servidor de desenvolvimento (Vite)
npm run build    # Build de produção → dist/
npm test         # Testes unitários
```

## Migração de Dados

As chaves localStorage permanecem compatíveis (`nexus:users`, `nexus:user:{id}:*`).
Nenhuma migração manual necessária.

## Extensão Chrome

Os arquivos da extensão "Painel Lovable" permanecem na raiz do repositório,
separados do ERP. Recomenda-se movê-los para `extension/` em refatoração futura.
