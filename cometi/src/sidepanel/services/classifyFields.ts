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

export type ClassifyRequest = {
  items: DomFieldFeature[];
  language?: string;
};

export type Classification = {
  origin?: string;
  destination?: string;
  waypoints: string[];
  confidence?: number;
  used: 'llm' | 'heuristic';
};

const API_BASE = (import.meta.env.VITE_COMETI_API_BASE ?? '').replace(/\/+$/, '');

export async function classifyFields(payload: ClassifyRequest): Promise<Classification> {
  if (!API_BASE) throw new Error('VITE_COMETI_API_BASE manquant pour classifier les champs.');
  const res = await fetch(`${API_BASE}/classify-fields`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${text}`);
  }
  const data = (await res.json()) as Classification & { error?: string };
  if (data.error) throw new Error(data.error);
  return data;
}

