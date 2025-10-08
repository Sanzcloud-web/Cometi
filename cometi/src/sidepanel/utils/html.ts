export function extractTextSnippet(html: string, maxChars = 1200): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    let text = doc.body?.textContent || '';
    // collapse whitespace
    text = text.replace(/\s+/g, ' ').trim();
    if (text.length > maxChars) {
      return text.slice(0, maxChars).trim();
    }
    return text;
  } catch {
    // Fallback: strip tags naive
    const plain = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return plain.slice(0, maxChars);
  }
}

