// Minimal Markdown renderer (headings, lists, paragraphs) with HTML escaping
// Note: We do not support links, images, code, or inline formatting intentionally.

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderMarkdownToHtml(md: string): string {
  if (!md || md.trim().length === 0) return '';

  // Normalize newlines
  const src = md.replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const line = raw; // Do not trim left to preserve indentation if any

    // Headings (## )
    if (/^##\s+/.test(line)) {
      const text = escapeHtml(line.replace(/^##\s+/, '').trim());
      out.push(`<h2 class="text-base font-semibold text-slate-900 mb-2">${text}</h2>`);
      i++;
      continue;
    }

    // Unordered list (- ) — group consecutive list items
    if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) {
        const itemText = escapeHtml(lines[i].replace(/^\s*-\s+/, '').trim());
        items.push(`<li class="ml-4">${itemText}</li>`);
        i++;
      }
      out.push(`<ul class="list-disc pl-5 mb-3">${items.join('')}</ul>`);
      continue;
    }

    // Blank line → paragraph separator
    if (/^\s*$/.test(line)) {
      out.push('');
      i++;
      continue;
    }

    // Paragraph: accumulate until blank line or block start
    const paras: string[] = [];
    while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^##\s+/.test(lines[i]) && !/^\s*-\s+/.test(lines[i])) {
      paras.push(lines[i]);
      i++;
    }
    const paragraphText = escapeHtml(paras.join(' ').trim());
    if (paragraphText.length > 0) {
      out.push(`<p class="mb-3 leading-relaxed">${paragraphText}</p>`);
    }
  }

  // Join and coalesce blank separators
  return out.filter(Boolean).join('\n');
}

