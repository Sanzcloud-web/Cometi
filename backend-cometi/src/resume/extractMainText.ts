import { extractTextFromHtml } from './extraction/htmlExtractor';
import { extractTextFromPdf } from './extraction/pdfExtractor';
import { deduplicateParagraphs, splitIntoParagraphs } from './utils/text';

export type ExtractionInput = {
  contentType: 'text/html' | 'application/pdf' | 'unknown';
  raw: string | ArrayBuffer;
};

export type ExtractionOutput = {
  paragraphs: string[];
  title?: string;
};

export async function extractMainText(input: ExtractionInput): Promise<ExtractionOutput> {
  if (input.contentType === 'text/html' && typeof input.raw === 'string') {
    const result = extractTextFromHtml(input.raw);
    return {
      title: result.title,
      paragraphs: result.paragraphs,
    };
  }

  if (input.contentType === 'application/pdf' && input.raw instanceof ArrayBuffer) {
    const result = await extractTextFromPdf(input.raw);
    return {
      paragraphs: result.paragraphs,
    };
  }

  if (typeof input.raw === 'string') {
    const paragraphs = deduplicateParagraphs(splitIntoParagraphs(input.raw));
    return { paragraphs };
  }

  return { paragraphs: [] };
}
