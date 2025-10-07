import type { ResumeSummary } from '../types/resume';

type ResumeCommandContext = {
  url: string;
  title?: string;
  domSnapshot?: { html: string; title?: string };
};

type ResumeStreamCallbacks = {
  onProgress?: (e: { stage: string; [k: string]: unknown }) => void;
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
): Promise<ResumeSummary> {
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
  let final: ResumeSummary | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const lines = part.trim().split('\n');
      let event: string | undefined;
      let data: string | undefined;
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.replace(/^event:\s*/, '').trim();
        if (line.startsWith('data:')) data = line.replace(/^data:\s*/, '').trim();
      }
      if (!event || !data) continue;
      if (event === 'progress') {
        try {
          const payload = JSON.parse(data);
          callbacks.onProgress?.(payload);
        } catch {
          // ignore
        }
      } else if (event === 'delta') {
        try {
          const payload = JSON.parse(data) as { delta?: string };
          if (payload.delta) callbacks.onDelta?.(payload.delta);
        } catch {
          // ignore
        }
      } else if (event === 'final') {
        try {
          final = JSON.parse(data) as ResumeSummary;
        } catch {
          // ignore
        }
      } else if (event === 'error') {
        try {
          const payload = JSON.parse(data);
          throw new Error(typeof payload?.error === 'string' ? payload.error : 'Erreur de streaming /resume');
        } catch (e) {
          throw e;
        }
      }
    }
  }

  if (!final) {
    throw new Error('Le streaming /resume ne s\'est pas conclu correctement.');
  }
  return final;
}

// Extract a human-readable preview of the `summary` string being streamed as JSON.
// It scans the accumulated raw stream (JSON text, possibly incomplete) and returns
// the current best-effort decoded content of the `summary` field.
export function extractSummaryPreview(raw: string): string | null {
  if (!raw || raw.length === 0) return null;
  // Strip code fences if any
  let s = raw.replace(/```json|```/g, '');
  const keyIndex = s.indexOf('"summary"');
  if (keyIndex === -1) return null;
  // Find the first quote after the colon
  let i = keyIndex + 9; // after "summary"
  while (i < s.length && s[i] !== ':') i++;
  if (i >= s.length) return null;
  i++; // skip ':'
  // Skip whitespace
  while (i < s.length && /\s/.test(s[i])) i++;
  if (i >= s.length || s[i] !== '"') return null;
  i++; // now inside summary string

  let out = '';
  let escaped = false;
  for (; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      // Basic JSON escapes
      if (ch === 'n') out += '\n';
      else if (ch === 'r') out += '\r';
      else if (ch === 't') out += '\t';
      else if (ch === '"') out += '"';
      else if (ch === '\\') out += '\\';
      else out += ch; // fallback
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      // Closing quote reached; we have a complete summary string
      break;
    }
    out += ch;
  }
  return out.length > 0 ? out : null;
}

