# Backend Cometi

API serverless pour relayer les requêtes vers OpenAI. Conçu pour être déployé sur Vercel.

## Configuration

1. Copie `.env.example` en `.env` (ou définis les variables dans le dashboard Vercel) :
   - `OPENAI_API_KEY` : ta clé OpenAI.
   - `OPENAI_MODEL` : identifiant de modèle (ex. `gpt-4o-mini`).
   - `ORIGIN` : domaine autorisé pour le CORS (ex. `chrome-extension://...`). Laisse `*` pour du debug.

2. Installe les dépendances :

   ```bash
   npm install
   ```

3. Pour tester en local :

   ```bash
   npm run dev
   ```

   L’API sera accessible sur `http://localhost:3000/api/chat` et `http://localhost:3000/api/resume`.
   > Ce serveur de développement est un petit serveur Node.js (pas besoin du CLI Vercel).

4. Pour simuler exactement l’environnement Vercel (optionnel) :

   ```bash
   npm run vercel:dev
   ```

## Déploiement Vercel

1. Connecte le dossier `backend-cometi` à un projet Vercel.
2. Définis les variables d’environnement dans *Settings → Environment Variables* (`OPENAI_API_KEY`, `OPENAI_MODEL`, `ORIGIN`).
3. Déploie. Les endpoints publics seront `https://<ton-projet>.vercel.app/api/chat` et `https://<ton-projet>.vercel.app/api/resume`.

## Contrats d’API

### `POST /api/chat`

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

### `POST /api/resume`

- **Corps** :

  ```json
  {
    "url": "https://exemple.com/article",
    "title": "Titre (optionnel)",
    "domSnapshot": {
      "html": "<html>…</html>",
      "title": "Titre DOM (optionnel)"
    }
  }
  ```

  `domSnapshot` est optionnel et permet d’envoyer une capture HTML quand la page est dynamique.

- **Réponse** :

  ```json
  {
    "url": "https://exemple.com/article",
    "title": "Titre détecté",
    "tldr": ["Puces", "de", "résumé"],
    "summary": "Résumé long",
    "usedSources": ["https://exemple.com/article", "https://source-supplémentaire"]
  }
  ```

- **Erreurs** :
  - Statut 400 si l’URL est absente ou non HTTP(S).
  - Statut 500 si la récupération, l’extraction ou l’appel OpenAI échouent.
