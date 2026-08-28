# Migração de dados v2 (localStorage) → v3 (Supabase)

## Pré-requisitos

1. Migrations `001`–`014` aplicadas
2. Usuário criado no Supabase Auth (mesmo e-mail do v2)
3. `profile` criado automaticamente via trigger

## Fluxo recomendado

```
1. Login Supabase Auth
2. create_workspace_with_owner() por perfil migrado
3. POST /api/migrate com payload localStorage
4. Inserir registros com UUID + legacy_migration_map
5. recalculate_account_balance() por conta
6. Limpar localStorage após confirmação
```

## Transformações

### Usuário → Workspace

```javascript
// PF
{ name: user.name, type: 'personal' }

// PJ
{
  name: user.company?.tradeName || user.company?.legalName || user.name,
  type: user.company?.taxRegime === 'mei' ? 'mei' : 'business',
  document: user.company?.cnpj
}
```

### Transações

```javascript
// v2
{ type: 'credit', amount: 100, desc, date, accountId }

// v3
{
  type: 'income',  // credit → income, debit → expense
  amount: 100,     // sempre >= 0
  description: desc,
  transaction_date: date,
  financial_account_id: mappedUuid(accountId)
}
```

### Contas

```javascript
// v2: { name, bank, balance, initialBalance }
// v3:
{
  name,
  institution: bank,
  type: 'checking',
  initial_balance: initialBalance,
  current_balance: balance  // recalcular depois
}
```

## Preservação de IDs

Para cada entidade migrada:

```sql
INSERT INTO legacy_migration_map (workspace_id, entity_type, legacy_id, new_id)
VALUES ($workspace, 'account', '12345', $new_uuid);
```

## Dados NÃO migrados automaticamente

- Sessão ativa (`nexus:currentUser`)
- Config IA local (`nexus:ai-config`) — mover para backend seguro
- Senhas — usuário redefine via Supabase Auth

## Validação pós-migração

- [ ] Soma de transações = saldo das contas
- [ ] Categorias padrão PF/PJ presentes
- [ ] Centros de custo PJ migrados
- [ ] Cartões e encargos vinculados ao workspace correto
- [ ] Nenhum registro com workspace_id errado
