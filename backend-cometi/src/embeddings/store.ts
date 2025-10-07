import { getPrisma } from './prisma';
import { bytesToFloat32, float32ToBytes } from './openai';

export async function upsertDocument(url: string, title?: string) {
  const prisma = getPrisma();
  return prisma.document.upsert({
    where: { url },
    update: { title },
    create: { url, title },
  });
}

export async function upsertChunks(
  documentId: string,
  contents: string[],
  embeddings: Float32Array[]
) {
  const prisma = getPrisma();
  if (contents.length !== embeddings.length) {
    throw new Error('contents et embeddings doivent avoir la même longueur.');
  }
  const dim = embeddings[0]?.length ?? 0;
  const data = contents.map((content, index) => ({
    index,
    content,
    embedding: float32ToBytes(embeddings[index]),
    dim,
    documentId,
  }));

  // Delete previous chunks for idempotency, then createMany to speed up
  await prisma.chunk.deleteMany({ where: { documentId } });
  await prisma.chunk.createMany({ data });
}

export async function getDocumentChunks(url: string) {
  const prisma = getPrisma();
  const doc = await prisma.document.findUnique({ where: { url }, include: { chunks: true } });
  if (!doc) return [];
  return doc.chunks
    .sort((a, b) => a.index - b.index)
    .map((chunk) => ({
      index: chunk.index,
      content: chunk.content,
      embedding: bytesToFloat32(Buffer.from(chunk.embedding)),
      dim: chunk.dim,
      chunkHash: (chunk as any).chunkHash ?? undefined,
    }));
}

export async function getDocumentWithChunks(url: string) {
  const prisma = getPrisma();
  return prisma.document.findUnique({ where: { url }, include: { chunks: true } });
}

export async function updateDocumentMeta(
  documentId: string,
  meta: { contentHash?: string; embeddingModel?: string; chunkCount?: number; title?: string }
) {
  const prisma = getPrisma();
  return prisma.document.update({ where: { id: documentId }, data: meta as any });
}

export async function upsertChunk(
  documentId: string,
  index: number,
  content: string,
  embedding: Float32Array,
  dim: number,
  chunkHash?: string
) {
  const prisma = getPrisma();
  const bytes = float32ToBytes(embedding);
  const updateData: any = { content, embedding: bytes, dim, chunkHash };
  const createData: any = { documentId, index, content, embedding: bytes, dim, chunkHash };
  return prisma.chunk.upsert({
    where: { documentId_index: { documentId, index } },
    update: updateData,
    create: createData,
  });
}

export async function deleteChunksFromIndex(documentId: string, startIndex: number) {
  const prisma = getPrisma();
  await prisma.chunk.deleteMany({ where: { documentId, index: { gte: startIndex } } });
}
