# Marketing & Landing Page

Landing page de divulgação em `index.html`.

## Visualizar localmente

```bash
# Opção 1 — abrir direto no navegador
xdg-open marketing/index.html

# Opção 2 — servidor estático
npm run dev:landing
# http://localhost:3000
```

Os CTAs redirecionam para o app ERP em `../index.html#auth`.

## Deploy sugerido

- **Landing:** `nexuserp.com.br` → pasta `marketing/` (Cloudflare Pages, Netlify)
- **App:** `app.nexuserp.com.br` → `dist/` após `npm run build`

Ou monorepo com dois projetos no Vercel.
