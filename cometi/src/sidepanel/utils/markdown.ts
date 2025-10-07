// Full Markdown renderer using markdown-it with safe defaults
import MarkdownIt from 'markdown-it';
import taskLists from 'markdown-it-task-lists';
import footnote from 'markdown-it-footnote';

let mdRenderer: MarkdownIt | null = null;

function getRenderer(): MarkdownIt {
  if (mdRenderer) return mdRenderer;
  const md = new MarkdownIt({
    html: false, // disallow raw HTML to reduce XSS surface
    linkify: true,
    typographer: true,
    breaks: false,
    highlight: (str: string, lang?: string) => {
      // Keep default escaping; allow CSS hook for language
      const cls = lang ? ` class=\"language-${lang}\"` : '';
      const escaped = md.utils.escapeHtml(str);
      return `<pre><code${cls}>${escaped}</code></pre>`;
    },
  });
  // Secure links: open in new tab, no referrer
  const defaultRender = md.renderer.rules.link_open || function(tokens, idx, options, env, self) {
    return self.renderToken(tokens, idx, options);
  };
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const aIndex = tokens[idx].attrIndex('target');
    if (aIndex < 0) tokens[idx].attrPush(['target', '_blank']); else tokens[idx].attrs![aIndex][1] = '_blank';
    const rIndex = tokens[idx].attrIndex('rel');
    if (rIndex < 0) tokens[idx].attrPush(['rel', 'noreferrer']); else tokens[idx].attrs![rIndex][1] = 'noreferrer';
    return defaultRender(tokens, idx, options, env, self);
  };
  md.use(taskLists, { label: true, labelAfter: true, enabled: true });
  md.use(footnote);
  mdRenderer = md;
  return md;
}

export function renderMarkdownToHtml(input: string): string {
  if (!input || input.trim().length === 0) return '';
  const md = getRenderer();
  return md.render(input);
}
