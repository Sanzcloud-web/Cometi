# Cometi – Extension Chrome (frontend)

Front-end de l’extension Chrome qui s’appuie sur le backend Vercel (`backend-cometi`).

## Pré-requis

- Node.js 18+
- Avoir déployé le backend et récupérer son URL (`https://<projet>.vercel.app/api/chat`).

## Configuration

1. Copie `.env.example` vers `.env`.
2. Renseigne une seule variable: `VITE_COMETI_API_BASE`.
   - Local: `http://localhost:3000/api` (backend lancé avec `npm run dev` dans `backend-cometi`).
   - Production: `https://<projet>.vercel.app/api`.
   L’extension construira automatiquement `.../chat` et `.../resume`.
3. (Optionnel) Tu peux surcharger les URLs précises si besoin:
   - `VITE_COMETI_API_URL` pour `POST /api/chat`
   - `VITE_COMETI_RESUME_URL` pour `POST /api/resume`

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
