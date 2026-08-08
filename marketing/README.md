# Marketing & Landing Page

Landing page de divulgação em `index.html`.

## Abrir no navegador externo

```bash
# Landing (inicia servidor + abre Chrome/Firefox)
npm run open:landing
# http://127.0.0.1:3000

# App ERP (inicia Vite se necessário + abre navegador)
npm run open:app
# http://127.0.0.1:8080
```

## Servidor manual (sem abrir navegador)

```bash
npm run dev:landing   # landing na porta 3000
npm run dev           # app na porta 8080
```

Os CTAs da landing redirecionam para o app em `http://127.0.0.1:8080/#auth` quando rodando localmente.

## Deploy sugerido

- **Landing:** `nexuserp.com.br` → pasta `marketing/` (Cloudflare Pages, Netlify)
- **App:** `app.nexuserp.com.br` → `dist/` após `npm run build`
