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
    }));
}

