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
  function tryFormatFinalFromJson(data: string): string | undefined {
    try {
      const obj = JSON.parse(data) as Partial<ResumeSummary> | { message?: string };
      if (
        obj &&
        typeof (obj as any).summary === 'string' &&
        Array.isArray((obj as any).tldr) &&
        Array.isArray((obj as any).usedSources)
      ) {
        const r = obj as ResumeSummary;
        const header = r.title ? `${r.title}\n\n` : '';
        const bullets = r.tldr.map((it) => `• ${it}`).join('\n');
        const sources = r.usedSources.map((src, i) => `• Source ${i + 1} : ${src}`).join('\n');
        return `${header}${bullets ? `TL;DR\n${bullets}\n\n` : ''}Résumé\n${r.summary}$${r.usedSources.length ? `\n\nSources\n${sources}` : ''}`.replace('$', '');
      }
      if (typeof (obj as any)?.message === 'string') {
        return (obj as any).message as string;
      }
    } catch {
      // not JSON → ignore
    }
    return undefined;
  }
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
        // Accept either JSON { delta: "..." } or plain text
        let emitted = false;
        try {
          const payload = JSON.parse(data) as { delta?: string };
          if (payload && typeof payload.delta === 'string') {
            callbacks.onDelta?.(payload.delta);
            emitted = true;
          }
        } catch {
          // not JSON
        }
        if (!emitted) {
          callbacks.onDelta?.(data);
        }
      } else if (event === 'final') {
        // Accept either structured JSON or plain text
        const formatted = tryFormatFinalFromJson(data);
        finalText = formatted ?? data;
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

  if (!finalText) {
    throw new Error('Le streaming /resume ne s\'est pas conclu correctement.');
  }
  return finalText;
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

// Build a formatted preview from partial JSON chunks to avoid raw JSON flicker
// and keep a consistent layout with the final message.
export function extractPartialResumePreview(
  raw: string
): {
  title?: string;
  tldr?: string[];
  summary?: string;
  usedSources?: string[];
  formatted?: string;
} | null {
  if (!raw || raw.length === 0) return null;
  const s = raw.replace(/```json|```/g, '');

  function parseJsonStringAt(str: string, startIndex: number): { value?: string; end: number } {
    let i = startIndex;
    if (str[i] !== '"') return { end: i };
    i++; // inside
    let out = '';
    let escaped = false;
    for (; i < str.length; i++) {
      const ch = str[i];
      if (escaped) {
        if (ch === 'n') out += '\n';
        else if (ch === 'r') out += '\r';
        else if (ch === 't') out += '\t';
        else if (ch === '"') out += '"';
        else if (ch === '\\') out += '\\';
        else out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') {
        i++; // move past closing quote
        break;
      }
      out += ch;
    }
    return { value: out, end: i };
  }

  function findKey(str: string, key: string): number {
    return str.indexOf(`"${key}"`);
  }

  function parseAfterColon(str: string, i: number): number {
    while (i < str.length && str[i] !== ':') i++;
    if (i < str.length) i++;
    while (i < str.length && /\s/.test(str[i])) i++;
    return i;
  }

  function parseStringField(str: string, key: string): string | undefined {
    const k = findKey(str, key);
    if (k === -1) return undefined;
    let i = parseAfterColon(str, k + key.length + 2);
    const { value } = parseJsonStringAt(str, i);
    return value;
  }

  function parseStringArrayField(str: string, key: string): string[] | undefined {
    const k = findKey(str, key);
    if (k === -1) return undefined;
    let i = parseAfterColon(str, k + key.length + 2);
    if (i >= str.length || str[i] !== '[') return undefined;
    i++; // past [
    const items: string[] = [];
    // parse items like "...", possibly separated by commas; stops on ']' or end
    while (i < str.length) {
      while (i < str.length && /\s|,/.test(str[i])) i++;
      if (i >= str.length) break;
      if (str[i] === ']') break;
      const { value, end } = parseJsonStringAt(str, i);
      if (typeof value === 'string') {
        items.push(value);
        i = end;
      } else {
        break; // cannot parse further without a starting quote
      }
    }
    return items.length > 0 ? items : undefined;
  }

  const title = parseStringField(s, 'title');
  const summary = parseStringField(s, 'summary');
  const tldr = parseStringArrayField(s, 'tldr');
  const usedSources = parseStringArrayField(s, 'usedSources');

  if (!title && !summary && (!tldr || tldr.length === 0) && (!usedSources || usedSources.length === 0)) {
    return null;
  }

  const header = title ? `${title}\n\n` : '';
  const bullets = tldr && tldr.length > 0 ? tldr.map((it) => `• ${it}`).join('\n') + '\n\n' : '';
  const body = summary ? `Résumé\n${summary}\n\n` : '';
  const sources = usedSources && usedSources.length > 0
    ? usedSources.map((src, i) => `• Source ${i + 1} : ${src}`).join('\n')
    : '';

  const formatted = `${header}${bullets ? `TL;DR\n${bullets}` : ''}${body}${sources ? `Sources\n${sources}` : ''}`.trim();

  return { title, tldr, summary, usedSources, formatted: formatted.length > 0 ? formatted : undefined };
}
