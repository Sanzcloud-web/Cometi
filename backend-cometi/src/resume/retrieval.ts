import { chunkText } from './utils/text';
import type { ResumeServiceEnv } from './types';
import { embedTexts } from '../embeddings/openai';

const DEFAULT_TOP_K = Number(process.env.RESUME_TOP_K ?? 8);

export async function indexAndSelectTopChunks(
  url: string,
  title: string,
  paragraphs: string[],
  env: ResumeServiceEnv
): Promise<string[]> {
  // If DB_EMBEDDING is not set, skip indexing/retrieval.
  if (!process.env.DB_EMBEDDING) return paragraphs;

  // 1) Build chunks from paragraphs to a reasonable size
  const chunks = chunkText(paragraphs, 1200);
  if (chunks.length === 0) return paragraphs;

  // 2) Upsert document and compute embeddings for chunks
  const { upsertDocument, upsertChunks, getDocumentChunks } = await import('../embeddings/store');
  const doc = await upsertDocument(url, title);
  const chunkEmbeddings = await embedTexts(chunks, env);
  await upsertChunks(doc.id, chunks, chunkEmbeddings);

  // 3) Compute query embedding for retrieval
  const query = process.env.RESUME_QUERY?.trim() || 'RESUME';
  const [queryEmbedding] = await embedTexts([query], env);

  // 4) Retrieve top K from DB (brute force in app for sqlite)
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
