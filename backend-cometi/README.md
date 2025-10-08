# Backend Cometi

API serverless pour relayer les requêtes vers OpenAI. Conçu pour être déployé sur Vercel.

## Configuration

1. Copie `.env.example` en `.env` (ou définis les variables dans le dashboard Vercel) :
   - `OPENAI_API_KEY` : ta clé OpenAI.
   - `OPENAI_MODEL` : identifiant de modèle (ex. `gpt-4o-mini`).
   - `OPENAI_SUGGESTIONS_MODEL` : (optionnel) modèle dédié aux suggestions (défaut `gpt-4.1-nano`).
   - `ORIGIN` : domaine autorisé pour le CORS (ex. `chrome-extension://...`). Laisse `*` pour du debug.
   - (Optionnel) Embeddings pour le résumé: 
     - `DB_EMBEDDING` : URL PostgreSQL (Neon) ex: `postgresql://user:pass@host/db?sslmode=require`
     - `EMBEDDING_MODEL` : par défaut `text-embedding-3-small`
     - `RESUME_TOP_K` : nombre de chunks gardés (défaut `6`)
     - `RESUME_QUERY` : requête d’ancrage (défaut `RESUME`)

2. Installe les dépendances :

   ```bash
   npm install
   ```

3. Pour tester en local :

   ```bash
   npm run dev
   ```

   L’API sera accessible sur `http://localhost:3000/api/chat`, `http://localhost:3000/api/suggestions` et `http://localhost:3000/api/resume`.
   > Ce serveur de développement est un petit serveur Node.js (pas besoin du CLI Vercel).

### Activer la DB d’embeddings (PostgreSQL)

1. Renseigne `DB_EMBEDDING` dans `.env` avec l’URL Neon (pense à `sslmode=require`).
2. Installe Prisma et génère le client:

   ```bash
   npm install
   npm run prisma:generate
   ```

3. Crée le schéma et applique la première migration:

   ```bash
   npm run prisma:migrate
   ```

4. Relance `npm run dev` puis refais un `/api/resume`.

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
    ],
    "chatId": "cuid-optional"
  }
  ```

- **Réponse** :

  ```json
  { "message": "..." }
  ```

- **Erreurs** :
  - Statut 400 si la requête est mal formée.
  - Statut 500 si la clé est absente ou si OpenAI renvoie une erreur.

Quand `chatId` est fourni, le dernier message utilisateur et la réponse de l’assistant sont ajoutés à l’historique.

### `POST /api/chat-stream`

- Identique à `/api/chat` mais renvoie un flux SSE (`event: delta` + `event: done`).
- Accepte aussi un `chatId` pour la persistance à la fin du flux.

### `GET /api/chats`

- Liste des chats (ordre décroissant de `updatedAt`).

  ```json
  { "chats": [ { "id": "...", "title": "...", "updatedAt": "..." } ] }
  ```

### `POST /api/chats`

- Crée un nouveau chat et renvoie l’objet créé.

  ```json
  { "chat": { "id": "...", "title": null, "createdAt": "...", "updatedAt": "..." } }
  ```

### `GET /api/chats/:id`

- Renvoie un chat et ses messages.

  ```json
  { "id": "...", "title": "...", "messages": [ { "role": "user", "content": "..." } ] }
  ```

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

### `POST /api/suggestions`

- **Corps** :

  ```json
  {
    "domain": "twitter.com",
    "context": "Titre du post ou extrait",
    "language": "fr"
  }
  ```

  `context` et `language` sont optionnels. Si `language` n’est pas fourni, le français est utilisé.

- **Réponse** :

  ```json
  {
    "suggestions": [
      { "id": 1, "label": "Résumer les commentaires" },
      { "id": 2, "label": "Lister les points clés" }
    ]
  }
  ```

- **Erreurs** :
  - Statut 500 si la clé API est absente ou si la réponse OpenAI n’est pas exploitable.
