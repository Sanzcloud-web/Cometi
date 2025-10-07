type ResumeCommandContext = {
  url: string;
  title?: string;
  domSnapshot?: { html: string; title?: string };
};

type PageAnswerCallbacks = {
  onDelta?: (delta: string) => void;
};

const API_BASE = (import.meta.env.VITE_COMETI_API_BASE ?? '').replace(/\/+$/, '');
const PAGE_ANSWER_STREAM_URL = API_BASE ? `${API_BASE}/page-answer-stream` : undefined;

export async function requestResumeContext(): Promise<ResumeCommandContext> {
  if (typeof chrome === 'undefined' || typeof chrome.runtime?.sendMessage !== 'function') {
    throw new Error('Commande disponible uniquement dans Chrome.');
  }
  return new Promise<ResumeCommandContext>((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'commands:resume:context' }, (response?: any) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message ?? 'Runtime error'));
        return;
      }
      if (!response?.ok || !response?.payload) {
        reject(new Error(response?.error ?? 'Impossible de récupérer le contexte page.'));
        return;
      }
      resolve(response.payload as ResumeCommandContext);
    });
  });
}

export async function requestPageAnswerStream(question: string, callbacks: PageAnswerCallbacks = {}): Promise<string> {
  if (!PAGE_ANSWER_STREAM_URL) {
    throw new Error(
      'URL API /page-answer-stream absente. Ajoute VITE_COMETI_API_BASE (ex: http://localhost:3000/api) dans ton fichier .env.'
    );
  }

  const payloadBase = await requestResumeContext();
  const response = await fetch(PAGE_ANSWER_STREAM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payloadBase, question }),
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(`Page answer stream HTTP ${response.status} ${text}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let finalText: string | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const lines = part.split('\n');
      let event: string | undefined;
      const dataLines: string[] = [];
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.replace(/^event:\s*/, '').trim();
        if (line.startsWith('data:')) dataLines.push(line.replace(/^data:\s?/, ''));
      }
      const data = dataLines.length > 0 ? dataLines.join('\n') : undefined;
      if (!event || !data) continue;
      if (event === 'delta') {
        callbacks.onDelta?.(data);
      } else if (event === 'final') {
        finalText = data;
      } else if (event === 'error') {
        throw new Error(data);
      }
    }
  }
  if (finalText === undefined) throw new Error('Le streaming page-answer ne s\'est pas conclu correctement.');
  return finalText;
}
