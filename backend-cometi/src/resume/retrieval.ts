import { chunkText } from './utils/text';
import type { ResumeServiceEnv } from './types';
import { embedTexts } from '../embeddings/openai';
import { createHash } from 'node:crypto';

const DEFAULT_TOP_K = Number(process.env.RESUME_TOP_K ?? 6);

export async function indexAndSelectTopChunks(
  url: string,
  title: string,
  paragraphs: string[],
  env: ResumeServiceEnv,
  queryText?: string
): Promise<string[]> {
  // If DB_EMBEDDING is not set, skip indexing/retrieval.
  if (!process.env.DB_EMBEDDING) return paragraphs;

  // 1) Build chunks from paragraphs to a reasonable size
  const chunks = chunkText(paragraphs, 1200);
  if (chunks.length === 0) return paragraphs;

  // 2) Incremental upsert based on content hashes and embedding model
  const { upsertDocument, getDocumentWithChunks, upsertChunk, deleteChunksFromIndex, getDocumentChunks, updateDocumentMeta } =
    await import('../embeddings/store');
  const pageHash = sha256(chunks.join('\n\n'));
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  const existing = (await getDocumentWithChunks(url)) as any;
  let doc: any = existing ?? (await upsertDocument(url, title));
  // Ensure chunks is always an iterable array for downstream logic
  if (!Array.isArray(doc?.chunks)) doc = { ...doc, chunks: [] };

  const docModelChanged = doc.embeddingModel && doc.embeddingModel !== model;
  const docUnchanged = doc.contentHash === pageHash && doc.chunkCount === chunks.length && !docModelChanged;

  if (!docUnchanged) {
    // Compute hashes for new chunks
    const newHashes = chunks.map((c) => sha256(c));

    // Determine which indexes changed
    const byIndex = new Map<number, { chunkHash?: string }>();
    for (const c of doc.chunks) byIndex.set(c.index, { chunkHash: c.chunkHash ?? undefined });

    const changedIndexes: number[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const old = byIndex.get(i)?.chunkHash;
      if (docModelChanged || !old || old !== newHashes[i]) {
        changedIndexes.push(i);
      }
    }

    // Delete trailing chunks if new shorter
    const existingCount = doc.chunks.length;
    if (existingCount > chunks.length) {
      await deleteChunksFromIndex(doc.id, chunks.length);
    }

    if (changedIndexes.length > 0) {
      // Embed only changed chunks in a single batch
      const toEmbedTexts = changedIndexes.map((i) => chunks[i]);
      const embedded = await embedTexts(toEmbedTexts, env);
      const dim = embedded[0]?.length ?? 0;
      for (let k = 0; k < changedIndexes.length; k++) {
        const i = changedIndexes[k];
        await upsertChunk(doc.id, i, chunks[i], embedded[k], dim, newHashes[i]);
      }
    }

    // Update document meta
    await updateDocumentMeta(doc.id, {
      contentHash: pageHash,
      embeddingModel: model,
      chunkCount: chunks.length,
      title,
    });
    // Refresh doc for retrieval
    doc = (await getDocumentWithChunks(url))!;
  }

  // 3) Compute query embedding for retrieval
  const query = (queryText && queryText.trim()) || process.env.RESUME_QUERY?.trim() || 'RESUME';
  const [queryEmbedding] = await embedTexts([query], env);

  // 4) Retrieve top K from DB
  const stored = await getDocumentChunks(url);
  if (stored.length === 0) return paragraphs;

  // Cosine similarity against query
  const scored = stored.map((c) => ({
    index: c.index,
    content: c.content,
    score: cosine(queryEmbedding, c.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  const topK = scored.slice(0, DEFAULT_TOP_K).sort((a, b) => a.index - b.index);
  return topK.map((s) => s.content);
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -Infinity;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    na += va * va;
    nb += vb * vb;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}
