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

## Développement

```bash
npm install
npm run dev
```

Chrome ne supporte pas encore le hot reload du side panel, mais `npm run dev` permet de recompiler rapidement.

## Build

```bash
npm run build
```

Le dossier `dist/` généré peut être chargé en tant qu’extension non empaquetée dans Chrome (`chrome://extensions`).

## Permissions

- `host_permissions` inclut `https://*.vercel.app/*` et `http://localhost:3000/*` pour autoriser le backend. Ajuste-les si tu déploies ailleurs.
