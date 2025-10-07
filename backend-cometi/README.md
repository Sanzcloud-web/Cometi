# Backend Cometi

API serverless pour relayer les requêtes vers OpenAI. Conçu pour être déployé sur Vercel.

## Configuration

1. Copie `.env.example` en `.env` (ou définis les variables dans le dashboard Vercel) :
   - `OPENAI_API_KEY` : ta clé OpenAI.
   - `OPENAI_MODEL` : identifiant de modèle (ex. `gpt-4o-mini`).
   - `ORIGIN` : domaine autorisé pour le CORS (ex. `chrome-extension://...`). Laisse `*` pour du debug.

2. Installe les dépendances (optionnel mais recommandé pour le typage) :

   ```bash
   npm install
   ```

3. Pour tester en local :

   ```bash
   npx vercel dev
   ```

   L’API sera accessible sur `http://localhost:3000/api/chat`.

## Déploiement Vercel

1. Connecte le dossier `backend-cometi` à un projet Vercel.
2. Définis les variables d’environnement dans *Settings → Environment Variables* (`OPENAI_API_KEY`, `OPENAI_MODEL`, `ORIGIN`).
3. Déploie. L’endpoint public sera `https://<ton-projet>.vercel.app/api/chat`.

## Contrat d’API

- **Méthode** : `POST /api/chat`
- **Corps** :

  ```json
  {
    "messages": [
      { "role": "system", "content": "..." },
      { "role": "user", "content": "..." }
    ]
  }
  ```

- **Réponse** :

  ```json
  { "message": "..." }
  ```

- **Erreurs** :
  - Statut 400 si la requête est mal formée.
  - Statut 500 si la clé est absente ou si OpenAI renvoie une erreur.
