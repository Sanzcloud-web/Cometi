import type { ChatServiceEnv } from '../chat-service';

const EMBEDDING_ENDPOINT = 'https://api.openai.com/v1/embeddings';
const DEFAULT_EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

export async function embedTexts(texts: string[], env: ChatServiceEnv): Promise<Float32Array[]> {
  const apiKey = env.apiKey || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY manquante pour la génération d\'embeddings.');
  }

  if (texts.length === 0) return [];

  const response = await fetch(EMBEDDING_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI Embeddings a renvoyé ${response.status}: ${errorText}`);
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  return data.data.map((row) => Float32Array.from(row.embedding));
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return -Infinity;
  let dot = 0;
  let na = 0;
  let nb = 0;
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

export function float32ToBytes(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function bytesToFloat32(buf: Buffer): Float32Array {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(ab);
}

