export type DomFieldFeature = {
  id: string;
  tag?: string;
  type?: string;
  placeholder?: string;
  aria?: string[];
  labelNearby?: string;
  parentText?: string;
  x?: number;
  y?: number;
};

export type ClassifyPayload = {
  items: DomFieldFeature[];
  language?: string; // 'fr' | 'en' ... influences heuristics
};

export type Classification = {
  origin?: string;
  destination?: string;
  waypoints: string[];
  confidence?: number; // from 0 to 1 if provided by LLM
  used: 'llm' | 'heuristic';
};

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

function compactText(value?: string): string {
  return (value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

function scoreByKeywords(text: string, keywords: string[]): number {
  const low = text.toLowerCase();
  let s = 0;
  for (const k of keywords) {
    if (!k) continue;
    if (low.includes(k)) s += k.length >= 4 ? 3 : 2;
    if (low.startsWith(k) || low.endsWith(k)) s += 1;
  }
  return s;
}

function heuristicClassify(items: DomFieldFeature[], language?: string): Classification {
  const kw = {
    origin: ['from', 'origin', 'start', 'depart', 'départ', 'adresse de départ', 'point a', 'a '],
    destination: ['to', 'destination', 'arrivee', 'arrivée', 'dest', 'adresse d\'arrivée', 'point b', 'b '],
    waypoint: ['via', 'waypoint', 'escale', 'étape', 'step'],
  };

  const entries = items.map((it) => {
    const txt = [it.placeholder, it.labelNearby, it.parentText, ...(it.aria ?? [])]
      .filter(Boolean)
      .map(compactText)
      .join(' \u2022 ');
    const base = { id: it.id, x: it.x ?? 0, y: it.y ?? 0 };
    return {
      ...base,
      text: txt,
      sOrigin: scoreByKeywords(txt, kw.origin),
      sDest: scoreByKeywords(txt, kw.destination),
      sVia: scoreByKeywords(txt, kw.waypoint),
    };
  });

  // pick origin: highest score, tiebreak by y then x (top-left first)
  const sortedByOrigin = entries
    .slice()
    .sort((a, b) => (b.sOrigin - a.sOrigin) || (a.y - b.y) || (a.x - b.x));
  const origin = sortedByOrigin[0]?.sOrigin > 0 ? sortedByOrigin[0].id : undefined;

  // pick destination: exclude origin, then highest sDest
  const sortedByDest = entries
    .filter((e) => e.id !== origin)
    .sort((a, b) => (b.sDest - a.sDest) || (a.y - b.y) || (a.x - b.x));
  const destination = sortedByDest[0]?.sDest > 0 ? sortedByDest[0].id : undefined;

  const waypoints = entries
    .filter((e) => e.id !== origin && e.id !== destination && e.sVia > 0)
    .sort((a, b) => (b.sVia - a.sVia) || (a.y - b.y) || (a.x - b.x))
    .map((e) => e.id)
    .slice(0, 6);

  return { origin, destination, waypoints, used: 'heuristic' };
}

export async function classifyFields(
  payload: ClassifyPayload,
  opts: { apiKey?: string; model?: string }
): Promise<Classification> {
  const items = Array.isArray(payload.items) ? payload.items.slice(0, 20) : [];
  if (items.length === 0) return { waypoints: [], used: 'heuristic' };

  const apiKey = opts.apiKey;
  const model = opts.model ?? 'gpt-4o-mini';
  const wantLLM = Boolean(apiKey);

  const promptHeader = [
    'Tu es un classifieur de champs d\'itinéraire.',
    'Objectif: identifier origine (From), destination (To) et waypoints parmi des éléments DOM.',
    'Chaque élément a: id, placeholder, labelNearby, aria, parentText.',
    'Réponds STRICTEMENT en JSON: { "origin": id|null, "destination": id|null, "waypoints": [ids...] }',
    'Si incertain, renvoie null ou liste vide. Aucune phrase hors JSON.',
  ].join(' ');

  const lines = items.map((it, idx) => {
    const row = {
      id: it.id,
      placeholder: compactText(it.placeholder),
      labelNearby: compactText(it.labelNearby),
      aria: (it.aria ?? []).map(compactText).filter(Boolean).slice(0, 4),
      parentText: compactText(it.parentText),
    };
    return `#${idx + 1} ${JSON.stringify(row)}`;
  });
  const userText = ['Eléments:', ...lines].join('\n');

  if (wantLLM) {
    try {
      const response = await fetch(OPENAI_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          messages: [
            { role: 'system', content: promptHeader },
            { role: 'user', content: userText },
          ],
        }),
      });
      if (response.ok) {
        const data = (await response.json()) as any;
        const content: string = data?.choices?.[0]?.message?.content ?? '';
        if (content) {
          // Extract JSON (in case model wraps in code-fence)
          const match = content.match(/\{[\s\S]*\}/);
          const jsonText = match ? match[0] : content;
          const parsed = JSON.parse(jsonText) as { origin?: string; destination?: string; waypoints?: string[] };
          const origin = parsed.origin ?? undefined;
          const destination = parsed.destination ?? undefined;
          const waypoints = Array.isArray(parsed.waypoints) ? parsed.waypoints.filter((v) => typeof v === 'string') : [];
          return { origin, destination, waypoints, used: 'llm', confidence: 0.7 };
        }
      }
    } catch {
      // fallthrough
    }
  }

  return heuristicClassify(items, payload.language);
}

