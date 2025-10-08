import { getPrisma } from './embeddings/prisma';

export type ChatSummary = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessagePreview?: string;
};

export type ChatWithMessages = {
  id: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  messages: { id: string; role: 'user' | 'assistant' | 'system'; content: string; createdAt: string }[];
};

export async function createChat(initialTitle?: string) {
  const prisma = getPrisma();
  const chat = await prisma.chat.create({ data: { title: initialTitle } });
  return chat;
}

export async function listChats(): Promise<ChatSummary[]> {
  const prisma = getPrisma();
  const chats = await prisma.chat.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });
  return chats.map((c) => ({
    id: c.id,
    title: c.title,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    lastMessagePreview: c.messages[0]?.content?.slice(0, 120) ?? undefined,
  }));
}

export async function getChatWithMessages(chatId: string): Promise<ChatWithMessages | null> {
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  });
  if (!chat) return null;
  return {
    id: chat.id,
    title: chat.title,
    createdAt: chat.createdAt.toISOString(),
    updatedAt: chat.updatedAt.toISOString(),
    messages: chat.messages.map((m) => ({
      id: m.id,
      role: m.role as any,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

export async function appendUserMessage(chatId: string, content: string) {
  const prisma = getPrisma();
  // If the chat has no title, derive one from the first user message
  const chat = await prisma.chat.findUnique({ where: { id: chatId } });
  if (!chat) throw new Error('Chat introuvable');

  const result = await prisma.$transaction([
    prisma.message.create({ data: { chatId, role: 'user', content } }),
    !chat.title || chat.title.trim().length === 0
      ? prisma.chat.update({
          where: { id: chatId },
          data: { title: deriveTitleFromContent(content) },
        })
      : prisma.chat.update({ where: { id: chatId }, data: {} }),
  ]);
  return result[0];
}

export async function appendAssistantMessage(chatId: string, content: string) {
  const prisma = getPrisma();
  return prisma.message.create({ data: { chatId, role: 'assistant', content } });
}

function deriveTitleFromContent(content: string): string {
  const oneLine = content.replace(/\s+/g, ' ').trim();
  const cleaned = oneLine.replace(/^[-*#>\s]+/, '');
  return cleaned.slice(0, 60);
}

