# Deploy em produção

## Opção A — Hospedagem estática (Fase 1, recomendado agora)

O build gera arquivos estáticos em `dist/`. Ideal para MVP sem backend.

```bash
npm ci
npm run build
# Publicar conteúdo de dist/
```

### Vercel

```bash
npm i -g vercel
vercel --prod
```

Configurar no dashboard: Build Command `npm run build`, Output `dist`.

### Cloudflare Pages

- Build: `npm run build`
- Output directory: `dist`
- Node 20

### Nginx (VPS)

```bash
docker build -t nexus-erp .
docker run -d -p 80:80 nexus-erp
```

Ver `Dockerfile` na raiz.

---

## Opção B — Docker + VPS

```bash
npm run build
docker build -t nexus-erp:latest .
docker run -d --name nexus -p 8080:80 --restart unless-stopped nexus-erp:latest
```

Coloque **Caddy** ou **Traefik** na frente para HTTPS automático (Let's Encrypt).

---

## Variáveis de ambiente (futuro)

Copie `.env.example` → `.env.production` quando integrar backend:

| Variável | Uso |
|----------|-----|
| `VITE_API_URL` | URL da API SaaS |
| `VITE_APP_ENV` | `production` |
| `VITE_SENTRY_DSN` | Monitoramento de erros |
| `VITE_ANALYTICS_ID` | GA4 / Plausible |

Hoje o app funciona 100% client-side; variáveis são preparação Fase 2.

---

## Checklist pós-deploy

- [ ] HTTPS ativo
- [ ] PWA manifest acessível (`/manifest.webmanifest`)
- [ ] Service worker registrado
- [ ] Favicon e OG tags (adicionar meta Open Graph na landing)
- [ ] Compressão gzip/brotli (nginx/CDN)
- [ ] Cache headers para assets (`dist/assets/*`)

---

## Domínio sugerido

- App: `app.nexuserp.com.br`
- Marketing: `nexuserp.com.br`
- Docs: `docs.nexuserp.com.br`

Configure CNAME para o provedor escolhido.

---

## CI/CD

O workflow `.github/workflows/e2e.yml` roda testes em cada push.

Para deploy automático, adicione job:

```yaml
deploy:
  needs: [unit, e2e]
  runs-on: ubuntu-latest
  if: github.ref == 'refs/heads/main'
  steps:
    - uses: actions/checkout@v4
    - run: npm ci && npm run build
    # + step do provedor (Vercel, Pages, etc.)
```
