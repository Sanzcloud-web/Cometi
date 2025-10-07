const SPACE_REGEX = /\s+/g;

export function normalizeWhitespace(text: string): string {
  return text.replace(SPACE_REGEX, ' ').trim();
}

export function splitIntoParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => normalizeWhitespace(paragraph))
    .filter((paragraph) => paragraph.length > 0);
}

function simpleHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

export function deduplicateParagraphs(paragraphs: string[]): string[] {
  const seen = new Set<string>();
  return paragraphs.filter((paragraph) => {
    const key = simpleHash(paragraph.toLowerCase());
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function chunkText(paragraphs: string[], targetSize = 3600): string[] {
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length >= targetSize && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
