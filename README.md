# 🌟 Cometi - Votre Assistant IA dans Chrome

**Chattez avec l'IA, résumez le web, boostez votre productivité**

---

## ✨ Qu'est-ce que Cometi ?

Cometi est une **extension Chrome innovante** qui intègre un assistant IA directement dans votre navigateur. Plus besoin d'ouvrir une nouvelle fenêtre ou un onglet - votre assistant est toujours là, dans le panneau latéral de Chrome, prêt à vous aider.

### 🚀 Fonctionnalités Principales

- **💬 Chat IA Intelligent** - Discutez avec GPT-4 directement dans Chrome
- **📄 Résumé de Pages** - Obtenez des résumés instantanés des articles web
- **🎯 Suggestions Contextuelles** - Recevez des suggestions intelligentes basées sur votre navigation
- **📚 Historique des Conversations** - Vos discussions sont sauvegardées et organisées
- **🔍 Recherche Sémantique** - Trouvez des informations dans vos documents avec les embeddings
- **⚡ Interface Ultra-Rapide** - Conçue pour le side panel de Chrome avec React

---

## 🛠️ Stack Technologique

### Frontend (Extension Chrome)
- **React 18** - Interface utilisateur moderne et réactive
- **TypeScript** - Développement type-safe
- **Tailwind CSS** - Styling utilitaire et responsive
- **Vite** - Build tool ultra-rapide
- **Chrome Extensions Manifest V3** - API moderne de Chrome

### Backend
- **Node.js** - Runtime JavaScript serverless
- **TypeScript** - Code type-safe et maintenable
- **Prisma** - ORM moderne avec PostgreSQL
- **OpenAI API** - Intégration GPT-4 et embeddings
- **Vercel** - Déploiement serverless instantané

### Base de Données
- **PostgreSQL (Neon)** - Base de données cloud performante
- **Embeddings Vectoriels** - Recherche sémantique avancée

---

## 📦 Installation et Configuration

### Prérequis
- Node.js 18+
- Clé API OpenAI
- Chrome/Firefox récent

### 1. Configuration du Backend

```bash
cd backend-cometi

# Installation des dépendances
npm install

# Configuration des variables d'environnement
cp .env.example .env
```

**Variables d'environnement requises :**
```env
OPENAI_API_KEY=votre_clé_openai
OPENAI_MODEL=gpt-4o-mini
OPENAI_SUGGESTIONS_MODEL=gpt-4.1-nano
ORIGIN=https://votre-extension-id.chromiumapp.org
```

**Pour activer les embeddings (optionnel) :**
```env
DB_EMBEDDING=postgresql://user:pass@host/db?sslmode=require
EMBEDDING_MODEL=text-embedding-3-small
RESUME_TOP_K=6
RESUME_QUERY=RESUME
```

### 2. Déploiement Backend (Vercel)

```bash
# Installation du CLI Vercel
npm i -g vercel

# Déploiement
vercel

# Configuration des variables d'environnement dans le dashboard Vercel
```

### 3. Configuration de l'Extension

```bash
cd cometi

# Installation des dépendances
npm install

# Configuration
cp .env.example .env
```

**Variables d'environnement :**
```env
VITE_COMETI_API_BASE=https://votre-projet.vercel.app/api
```

### 4. Installation de l'Extension

```bash
# Build de l'extension
npm run build

# Chargement dans Chrome
# 1. Ouvrez chrome://extensions/
# 2. Activez "Mode développeur"
# 3. Cliquez "Charger l'extension non empaquetée"
# 4. Sélectionnez le dossier cometi/dist/
```

---

## 🎮 Utilisation

### Chat IA
1. Cliquez sur l'icône Cometi dans Chrome
2. Le panneau latéral s'ouvre avec l'interface de chat
3. Tapez votre message ou utilisez les suggestions contextuelles
4. Appuyez sur Entrée pour envoyer

### Commandes Slash
- **`/resume`** - Résume la page actuellement active

### Suggestions Intelligentes
Cometi analyse le contexte de votre navigation et propose des suggestions pertinentes :
- Résumé des articles
- Analyse de contenu
- Questions de recherche
- Actions contextuelles

### Historique
- Vos conversations sont automatiquement sauvegardées
- Accédez à l'historique via la sidebar
- Reprenez une conversation à tout moment

---

## 🔧 Développement

### Développement Frontend
```bash
cd cometi
npm run dev
# Ouvre http://localhost:5173/sidepanel.html
```

### Développement Backend
```bash
cd backend-cometi
npm run dev
# API disponible sur http://localhost:3000
```

### Tests en Mode Développement
Le mode dev permet de tester l'UI directement dans le navigateur avec hot-reload, tout en communiquant avec le backend.

---

## 🌐 API Endpoints

### Chat
- `POST /api/chat` - Complétion de chat
- `POST /api/chat-stream` - Streaming de chat SSE
- `GET /api/chats` - Liste des conversations
- `POST /api/chats` - Créer une conversation
- `GET /api/chats/:id` - Récupérer une conversation

### Resume
- `POST /api/resume` - Résumé de page web
- Support extraction PDF et HTML
- Recherche sémantique avec embeddings

### Suggestions
- `POST /api/suggestions` - Suggestions contextuelles
- Analyse du domaine et du contexte
- Support multilingue

---

## 🎨 Personnalisation

### Thèmes et Styles
L'interface utilise Tailwind CSS et peut être facilement personnalisée via les classes CSS.

### Commandes Slash
Ajoutez de nouvelles commandes dans `cometi/src/sidepanel/commands/index.ts` :

```typescript
export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'ma-commande',
    label: '/ma-commande',
    value: '/ma-commande',
    description: 'Description de ma commande'
  }
];
```

---

## 🚀 Déploiement Production

### Backend (Vercel)
1. Connectez votre repo GitHub à Vercel
2. Configurez les variables d'environnement
3. Déployez automatiquement sur chaque push

### Extension (Chrome Web Store)
1. Créez un compte développeur Chrome Web Store
2. Packagez l'extension avec `npm run build`
3. Soumettez le dossier `dist/` pour review

---

## 🤝 Contribution

1. Fork le projet
2. Créez votre branche feature (`git checkout -b feature/AmazingFeature`)
3. Committez vos changements (`git commit -m 'Add some AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrez une Pull Request

---

## 📄 License

Ce projet est sous licence MIT - voir le fichier [LICENSE](LICENSE) pour plus de détails.


---

## ⭐ Show Your Support

Si Cometi vous aide dans votre quotidien, donnez-lui une ⭐️ !

<p align="center">
  <strong>Fait avec ❤️</strong>
</p>
