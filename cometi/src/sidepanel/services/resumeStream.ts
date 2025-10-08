type ResumeCommandContext = {
  url: string;
  title?: string;
  domSnapshot?: { html: string; title?: string };
};

type ResumeStreamCallbacks = {
  onProgress?: (e: { stage?: string; text?: string; [k: string]: unknown }) => void;
  onDelta?: (delta: string) => void;
};

const API_BASE = (import.meta.env.VITE_COMETI_API_BASE ?? '').replace(/\/+$/, '');
const RESUME_STREAM_URL = API_BASE ? `${API_BASE}/resume-stream` : undefined;

async function requestResumeContext(): Promise<ResumeCommandContext> {
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
        reject(new Error(response?.error ?? 'Impossible de récupérer le contexte /resume.'));
        return;
      }
      resolve(response.payload as ResumeCommandContext);
    });
  });
}

export async function requestResumeSummaryStream(
  callbacks: ResumeStreamCallbacks = {}
): Promise<string> {
  if (!RESUME_STREAM_URL) {
    throw new Error(
      'URL API /resume-stream absente. Ajoute VITE_COMETI_API_BASE (ex: http://localhost:3000/api) dans ton fichier .env.'
    );
  }

  const payload = await requestResumeContext();

  const response = await fetch(RESUME_STREAM_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(`Resume stream HTTP ${response.status} ${text}`);
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
      if (event === 'progress') {
        try {
          const payload = JSON.parse(data);
          callbacks.onProgress?.(payload);
        } catch {
          callbacks.onProgress?.({ text: data });
        }
      } else if (event === 'delta') {
        // Plain text delta
        callbacks.onDelta?.(data);
      } else if (event === 'final') {
        // Final plain text
        finalText = data;
      } else if (event === 'error') {
        try {
          const payload = JSON.parse(data);
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Erreur de streaming /resume');
        } catch {
          // If not JSON, use text message
          throw new Error(data);
        }
      }
    }
  }

  if (finalText === undefined) {
    throw new Error('Le streaming /resume ne s\'est pas conclu correctement.');
  }
  return finalText;
}

// Extract a human-readable preview of the `summary` string being streamed as JSON.
// It scans the accumulated raw stream (JSON text, possibly incomplete) and returns
// the current best-effort decoded content of the `summary` field.
