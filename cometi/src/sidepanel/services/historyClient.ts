const API_BASE = (import.meta.env.VITE_COMETI_API_BASE ?? '').replace(/\/+$/, '');

export type ChatSummary = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
};

export async function createChat(title?: string): Promise<{ id: string; title: string | null; createdAt: string; updatedAt: string }> {
  if (!API_BASE) throw new Error('VITE_COMETI_API_BASE manquant pour créer un chat.');
  const res = await fetch(`${API_BASE}/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { chat: { id: string; title: string | null; createdAt: string; updatedAt: string } };
  return data.chat;
}

export async function listChats(): Promise<ChatSummary[]> {
  if (!API_BASE) return [];
  const res = await fetch(`${API_BASE}/chats`, { method: 'GET' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { chats: ChatSummary[] };
  return data.chats;
}

export type LoadedMessage = { id: string; role: 'user' | 'assistant'; text: string; createdAt: string };

export async function loadChat(chatId: string): Promise<{ id: string; title: string | null; messages: LoadedMessage[] }> {
  if (!API_BASE) throw new Error('VITE_COMETI_API_BASE manquant pour charger un chat.');
  const res = await fetch(`${API_BASE}/chats/${encodeURIComponent(chatId)}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as {
    id: string;
    title: string | null;
    messages: { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: string }[];
  };
  return {
    id: data.id,
    title: data.title,
    messages: data.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .filter((m) => {
        const t = (m.content ?? '').trim();
        // Ne montre pas les sentinelles du routeur
        if (/^<\s*NO_PAGE_CONTEXT\s*\/>$/i.test(t)) return false;
        if (/^<\s*USE_PAGE_CONTEXT\s*\/>$/i.test(t)) return false;
        return true;
      })
      .map((m) => ({ id: m.id, role: m.role as any, text: m.content, createdAt: m.createdAt })),
  };
}
