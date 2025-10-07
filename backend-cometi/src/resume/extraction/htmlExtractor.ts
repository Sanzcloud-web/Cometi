import { JSDOM } from 'jsdom';
import { deduplicateParagraphs, normalizeWhitespace } from '../utils/text';

function stripUnwantedNodes(doc: Document) {
  const removalSelectors = [
    'script',
    'style',
    'noscript',
    'template',
    'iframe',
    'svg',
    'canvas',
    'form',
    'nav',
    'footer',
    'header',
    'aside',
    'figure',
    'figcaption',
    'video',
    'audio',
    'button',
  ];

  doc.querySelectorAll(removalSelectors.join(',')).forEach((node) => {
    node.remove();
  });
}

function selectContentRoot(doc: Document): Element | null {
  const prioritizedSelectors = [
    'main',
    'article',
    '[role="main"]',
    'section[role="main"]',
    'div[role="main"]',
    'div#content',
    'div.content',
    'div[id*="content"]',
    'div[class*="content"]',
  ];

  for (const selector of prioritizedSelectors) {
    const candidate = doc.querySelector(selector);
    if (candidate && candidate.textContent && candidate.textContent.trim().length > 400) {
      return candidate;
    }
  }

  let bestCandidate: Element | null = null;
  let bestScore = 0;

  doc.querySelectorAll('p, article, section, div').forEach((element) => {
    const text = element.textContent?.trim();
    if (!text || text.length < 200) {
      return;
    }
    const score = text.length;
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = element;
    }
  });

  return bestCandidate ?? doc.body;
}

function collectParagraphs(doc: Document, root: Element | null): string[] {
  if (!root) {
    return [];
  }

  const nodeFilter = doc.defaultView?.NodeFilter ?? { SHOW_TEXT: 4 };
  const walker = doc.createTreeWalker(root, nodeFilter.SHOW_TEXT);
  const paragraphs: string[] = [];
  let current = '';

  while (walker.nextNode()) {
    const node = walker.currentNode;
    const value = node.textContent;
    if (!value) {
      continue;
    }

    const normalized = normalizeWhitespace(value);
    if (!normalized) {
      continue;
    }

    current = current ? `${current} ${normalized}` : normalized;

    const parent = node.parentElement;
    if (parent && /^(p|br|li|h[1-6])$/i.test(parent.tagName)) {
      paragraphs.push(current);
      current = '';
    }
  }

  if (current) {
    paragraphs.push(current);
  }

  return deduplicateParagraphs(paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean));
}

export function extractTextFromHtml(html: string): { title: string; paragraphs: string[] } {
  const dom = new JSDOM(html);
  const { document } = dom.window;

  stripUnwantedNodes(document);
  const contentRoot = selectContentRoot(document);
  const paragraphs = collectParagraphs(document, contentRoot);
  const title = document.title?.trim() ?? '';

  return { title, paragraphs };
}
