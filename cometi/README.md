# Cometi – Extension Chrome (frontend)

Front-end de l’extension Chrome qui s’appuie sur le backend Vercel (`backend-cometi`).

## Pré-requis

- Node.js 18+
- Avoir déployé le backend et récupérer son URL (`https://<projet>.vercel.app/api/chat`).

## Configuration

1. Copie `.env.example` vers `.env`.
2. Renseigne `VITE_COMETI_API_URL` :
   - `http://localhost:3000/api/chat` pour consommer le backend lancé en local (`npm run dev` dans `backend-cometi`).
   - l’URL `https://<projet>.vercel.app/api/chat` après déploiement.
3. Ajoute également `VITE_COMETI_RESUME_URL` vers l’endpoint résumé :
   - `http://localhost:3000/api/resume` en local.
   - `https://<projet>.vercel.app/api/resume` en production.

## Développement

```bash
npm install
# Ouvre ensuite http://localhost:5173/sidepanel.html pour tester l’UI hors extension.
npm run dev
```

Chrome ne supporte pas encore le hot reload du side panel, mais `npm run dev` te permet de tester l’UI directement dans le navigateur tout en parlant au backend (le code bascule automatiquement sur l’appel HTTP si l’API Chrome n’est pas dispo).

## Build

```bash
npm run build
```

Le dossier `dist/` généré peut être chargé en tant qu’extension non empaquetée dans Chrome (`chrome://extensions`).

## Permissions

- `host_permissions` inclut `https://*.vercel.app/*`, `http://localhost:3000/*` et `http://127.0.0.1:3000/*`. Ajuste-les si tu déploies ailleurs.
