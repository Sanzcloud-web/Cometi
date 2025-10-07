declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';
  function taskLists(md: MarkdownIt, options?: any): void;
  export default taskLists;
}

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it';
  function footnote(md: MarkdownIt): void;
  export default footnote;
}

