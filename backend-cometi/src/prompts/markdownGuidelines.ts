export const MARKDOWN_GUIDELINES_FR = `Règles de sortie Markdown (strictes)

- Pas de JSON, pas de HTML, pas de balises <...> dans la réponse.
- Utilise du Markdown clair et valide, compatible GitHub Flavored Markdown (GFM).
- Respecte strictement les espaces entre les mots et la ponctuation. Ne fusionne jamais des mots.
- Insère des retours à la ligne pour séparer titres, listes et paragraphes.

Structure et éléments à utiliser

- Titres: commence par ##, ###, etc., toujours avec un espace après les dièses. Exemple: "## Mon Titre".
- Paragraphes: texte normal séparé par des lignes vides.
- Listes à puces: lignes commençant par "- ".
- Listes numérotées: "1. ", "2. ", etc.
- Cases à cocher: "- [ ] tâche" et "- [x] tâche terminée".
- Texte en emphase: *italique*, **gras**, ~~barré~~.
- Code: \`inline\` et blocs:

  \`\`\`lang
  // code ici
  \`\`\`

- Blocs de citation: lignes commençant par "> ".
- Liens: [texte](https://exemple.com) — pas d’URL nues si un libellé existe.
- Images: ![légende](https://exemple.com/image.png) (uniquement si pertinentes).
- Tableaux (GFM):

  | Colonne | Détail |
  |--------:|:------|
  |    123  | texte |

- Notes de bas de page (si utile): référence [^1] et définition en fin de message:

  Texte avec note[^1].

  [^1]: Contenu de la note.

Contraintes

- Pas de spéculation; reste factuel.
- Pas de contenu inventé; ne cite pas de sources si non présentes.
- Évite les blocs trop longs; préfère des sous-titres et des listes.
`;
