// @ts-expect-error - pdfjs-dist typings are not fully aligned with ESM usage in Node.
import * as pdfjsLib from 'pdfjs-dist/build/pdf.js';
import { deduplicateParagraphs, normalizeWhitespace } from '../utils/text';

pdfjsLib.GlobalWorkerOptions.workerSrc = undefined;

function groupItemsByLine(items: Array<{ str: string; transform: number[] }>): string[] {
  const lines: { y: number; text: string }[] = [];

  items.forEach((item) => {
    if (!item.str || typeof item.str !== 'string') {
      return;
    }

    const text = normalizeWhitespace(item.str);
    if (!text) {
      return;
    }

    const [, , , , , y] = item.transform;
    const existingLine = lines.find((line) => Math.abs(line.y - y) < 5);
    if (existingLine) {
      existingLine.text = `${existingLine.text} ${text}`.trim();
    } else {
      lines.push({ y, text });
    }
  });

  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) => line.text)
    .filter((line) => line.length > 0);
}

export async function extractTextFromPdf(buffer: ArrayBuffer): Promise<{ paragraphs: string[] }> {
  const loadingTask = pdfjsLib.getDocument({ data: buffer, useWorkerFetch: false, disableWorker: true });
  const pdf = await loadingTask.promise;
  const pages: string[][] = [];

  for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
    const page = await pdf.getPage(pageIndex);
    const content = await page.getTextContent();
    const lines = groupItemsByLine(content.items as Array<{ str: string; transform: number[] }>);
    pages.push(lines);
  }

  const occurrences = new Map<string, number>();
  pages.forEach((lines) => {
    const unique = new Set(lines.map((line) => line.toLowerCase()));
    unique.forEach((line) => {
      const count = occurrences.get(line) ?? 0;
      occurrences.set(line, count + 1);
    });
  });

  const threshold = Math.max(2, Math.floor(pages.length * 0.6));
  const cleanedLines = pages
    .flat()
    .filter((line) => (occurrences.get(line.toLowerCase()) ?? 0) < threshold || line.length > 120);

  const paragraphs = deduplicateParagraphs(
    cleanedLines
      .join('\n')
      .split(/\n{2,}/)
      .map((paragraph) => normalizeWhitespace(paragraph))
      .filter((paragraph) => paragraph.length > 0)
  );

  return { paragraphs };
}
