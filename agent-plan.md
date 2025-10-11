# Agent Navigateur Générique — Plan d’intégration

Ce document décrit l’architecture et les étapes pour intégrer un agent (LLM + outils) capable de percevoir, comprendre et agir sur n’importe quel site web via un « Page Map » générique, sans spécialisation par site. Il couvre aussi un outil Excel côté backend (lecture/modification/export).

## 1) Résumé

- Construire une représentation normalisée de la page (PageMap) depuis l’extension.
- Localiser des éléments par description (heuristiques + embeddings, option vision).
- Exposer des actions atomiques (click/type/select/scroll/wait/goto) orchestrées par un LLM.
- Boucler observe → plan → act → verify jusqu’à succès ou budget épuisé.
- Ajouter un outil Excel (read/update) côté backend.
- Option: mémoire de domaine (sélecteurs robustes sauvegardés par site).

## 2) Contexte (repo actuel)

- Extension Chrome (MV3):
  - `cometi/src/background/index.ts` — route les messages, sait déjà injecter des scripts, naviguer, extraire des champs.
  - `cometi/src/background/network/captureDom.ts` — capture HTML/Title.
  - `cometi/src/sidepanel/services/*` — clients backend, collecte DOM, etc.
- Backend (Node/Serverless):
  - `backend-cometi/api/*` — endpoints (chat, résumé, suggestions, etc.).
  - `backend-cometi/src/*` — intégrations OpenAI, embeddings, historique.
  - Prisma pour historique + embeddings.

## 3) Objectifs

- Agent générique multi-sites (aucune règle spécifique par domaine).
- Contrôle fiable via primitives (click, type, select, scroll, wait, goto).
- Recherche d’éléments robuste (texte, attributs, ARIA, embeddings, vision optionnelle). ( A EVITER LE VISION CAR SA COUTE CHERE )
- Itérations rapides (gpt-4.1-mini) + vision lorsque nécessaire. ( A EVITER LE VISION CAR SA COUTE CHERE )
- Outil Excel (lecture/écriture) accessible par l’agent.

## 4) Architecture

### 4.1 Perception (PageMap)

- DOM → `PageMap` structuré: liste d’éléments interactifs/candidats avec descripteurs riches.
- Extraction sélecteurs CSS robustes (id, data-testid, aria-label, name, texte haché, path bref).
- Métadonnées: visibilité, interactabilité, bbox, z-index, rôles, attributs clés.
- Option: capture visuelle (`captureVisibleTab`) pour vision-grounding.

### 4.2 Localisation (retrieval + scoring)

- Heuristiques: rôle, type, texte/label/placeholder, proximité sémantique.
- Embeddings (backend): similarité requête↔descripteurs.
- Option vision: VLM sur screenshot + instruction pour pointer des éléments (fallback quand textuel échoue).

### 4.3 Toolkit d’actions (extension)

- `web.goto(url)`
- `web.click(elementRef)`
- `web.type(elementRef, text, { submit? })`
- `web.select(elementRef, optionQuery)`
- `web.scroll({intoView?:elementRef, x?:n, y?:n})`
- `web.wait({selector|text|predicate}, {timeout})`
- `web.observe()` → renvoie un `PageMap` à jour après action

### 4.4 Orchestrateur LLM (backend)

- Boucle ReAct / function-calling: observe → plan → act → verify.
- Outils exposés au modèle comme « tool calls » strictement typés (Zod).
- Journalisation et budget (max steps / max time).

### 4.5 Mémoire de domaine (option)

- Sauvegarder des sélecteurs confirmés et fingerprints d’éléments par domaine (Prisma).
- Réutiliser en priorité sur visites futures.

### 4.6 Excel (backend)

- `excel.read` → JSON (sheets, headers, rows).
- `excel.update` → opérations (set cell, add column, filter/sort, write sheet) → renvoie XLSX.

## 5) Schéma PageMap (v1 DOM-only)

```ts
type BoundingBox = { x: number; y: number; width: number; height: number };

type ElementDescriptor = {
  eid: string;                     // hash stable (features)
  preferredSelector: string;       // CSS le plus fiable
  fallbackSelectors: string[];     // CSS alternatifs
  tag: string;
  role?: string;
  type?: string;                   // input type, bouton, etc.
  text?: string;                   // texte visible condensé
  labelNearby?: string;
  aria?: string[];                 // paires aria-
  attributes?: Record<string, string | null>; // href, title, name, data-*
  visible: boolean;
  enabled: boolean;
  interactable: boolean;
  boundingBox?: BoundingBox;
  zIndex?: number;
  score?: number;                  // score heuristique local
};

type PageMap = {
  url: string;
  title?: string;
  viewport: { width: number; height: number; scrollX: number; scrollY: number };
  timestamp: number;
  elements: ElementDescriptor[];   // ordonnés par priorité/score
  screenshot?: string;             // dataURL (optionnel)
};
```

## 6) Tool Calls (spécification)

- `web.observe()` → `PageMap`
- `web.goto(url: string)` → `{ ok: boolean }`
- `web.click(ref: ElementRef)` → `{ ok: boolean }`
- `web.type(ref: ElementRef, text: string, submit?: boolean)` → `{ ok: boolean }`
- `web.select(ref: ElementRef, optionQuery: string)` → `{ ok: boolean }`
- `web.scroll(intoView?: ElementRef, x?: number, y?: number)` → `{ ok: boolean }`
- `web.wait(selector?: string, text?: string, timeoutMs?: number)` → `{ ok: boolean }`
- `excel.read(source: { uploadId?: string; url?: string })` → `{ docId, sheets, rowsBySheet }`
- `excel.update(docId|uploadId, ops: Array<...>)` → `{ downloadUrl | blob }`

`ElementRef = { eid?: string; selector?: string }` (préférer `eid`, fallback `selector`).

## 7) Sécurité et permissions

- Garde-fous:
  - Allowlist de domaines (configurable dans l’UI) ou confirmation à la première action.
  - Confirmation humaine pour actions sensibles (achat/suppression/submit critique).
  - Budget d’actions + timeouts; arrêt propre.
  - Aucune exécution de code arbitraire venant du modèle; uniquement primitives déclarées.
- Permissions Extension:
  - `scripting`, `activeTab`, `tabs`, `storage`. Si screenshot: `tabCapture`/`captureVisibleTab`.
- CORS backend: ajouter `ORIGIN` (extension) pour nouveaux endpoints.

## 8) Changements précis (fichiers)

### 8.1 Extension

Nouveaux fichiers:
- `cometi/src/background/network/pageMap.ts` — `buildPageMap(tabId)`, `captureScreenshot(tabId)`.
- `cometi/src/background/network/actions.ts` — impl. primitives `goto/click/type/select/scroll/wait/observe`.
- `cometi/src/sidepanel/services/agentClient.ts` — clients `observe/act/loop`.
- (Optionnel) `cometi/src/sidepanel/components/AgentPanel.tsx` — UI start/stop + logs.

Modifs:
- `cometi/src/background/index.ts` — handlers:
  - `page:observe` → renvoie `PageMap`
  - `agent:act` → exécute une tool-call atomique et retourne statut + observation si demandé

### 8.2 Backend

Nouveaux endpoints:
- `backend-cometi/api/agent-session.ts`
- `backend-cometi/api/agent-step.ts`
- `backend-cometi/api/agent-rank.ts` (optionnel, top-K avec embeddings)
- `backend-cometi/api/agent-ground-vision.ts` (optionnel)
- `backend-cometi/api/excel-read.ts`, `backend-cometi/api/excel-update.ts`

Nouveau code:
- `backend-cometi/src/agent/*` — prompts, orchestrateur, schémas Zod, outils Excel, outils Web (proxies HTTP → messages extension si nécessaire), mémoire de domaine.

### 8.3 Prisma (mémoire de domaine, option v2)

Modèles:
- `DomainMap(id, domain, createdAt, updatedAt)`
- `ElementSelector(id, domainMapId, fingerprintHash, selector, score, lastSeenAt, usageCount)`

## 9) Endpoints REST (proposition)

```http
POST /api/agent/session
  { model?: string, vision?: boolean } → { sessionId }

POST /api/agent/step
  { sessionId, goal, lastObservation, history? }
  → { toolCall?: {...}, finalAnswer?: string, logs?: any[] }

POST /api/agent/rank
  { query, pageMap } → { candidates: Array<{ eid, selector, score }> }

POST /api/agent/ground-vision
  { query, screenshot } → { hints: Array<{ region, text, confidence }> }

POST /api/excel/read
  (upload|url) → { docId, sheets, rowsBySheet }

POST /api/excel/update
  { docId|uploadId, ops } → (XLSX as download)
```

## 10) Flux d’exécution (boucle agent)

1) Sidepanel envoie `page:observe` → reçoit `PageMap`.
2) Envoie `PageMap` + objectif à `/api/agent/step`.
3) Si réponse = `toolCall` → envoie à background `agent:act`, puis ré-observe.
4) Retour à 2) jusqu’à `finalAnswer` ou budget épuisé.
5) Afficher résultat et logs.

## 11) Validation & tests

- Scénarios smoke:
  - Recherche site e-commerce (type + enter + click résultat).
  - Connexion simple (email/mot de passe + submit).
  - Formulaire multi-étapes (select, scroll, next).
  - Téléchargement d’un fichier.
  - Excel: lecture, filtre, ajout colonne, export.
- Métriques:
  - Taux de réussite, nb d’actions, temps total, échecs/raison.

## 12) Dépendances

- Backend: `zod`, `exceljs` (ou `xlsx`), `uuid`.
- Extension: aucune dépendance nouvelle nécessaire (TS + Chrome APIs). Overlay CSS optionnel pour debug.

## 13) Pré-requis & configuration

- Backend: `OPENAI_API_KEY`, `OPENAI_MODEL` (ex: gpt-4o-mini), `EMBEDDING_MODEL` (text-embedding-3-small), `ORIGIN`.
- Extension: `manifest.json` permissions (`scripting`, `tabs`, `activeTab`, `storage`, `tabCapture` si vision).
- (Option) DB pour mémoire de domaine (Neon/Postgres + Prisma).

## 14) Phases (roadmap)

1. PageMap DOM (observe) — extension
2. Toolkit d’actions (click/type/select/scroll/wait/goto) — extension
3. Endpoints agent (`/api/agent/session`, `/api/agent/step`) — backend
4. Boucle de contrôle (sidepanel orchestrateur minimal) — extension
5. Mémoire de domaine (Prisma) — backend
6. Excel read/update — backend (+ UI upload/download côté sidepanel)
7. Vision (screenshot + VLM) — backend + extension (optionnel)

## 15) Prochaines étapes suggérées

- Implémenter `page:observe` (PageMap v1) et `agent:act` côté background.
- Scaffolder `/api/agent/step` avec Zod + modèle gpt-4o-mini + outils `web.*`.
- Ajouter endpoints Excel (read/update) et une UI d’upload minimal côté sidepanel.
- Activer logs (backend `logToBackend`) et un viewer léger dans l’UI.

