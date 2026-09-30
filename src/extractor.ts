import { createExtractor, ExtractionResult } from "ai-form-response-extractor";
import { settings } from "./settings";

// The raw AI response is left out: it repeats everything written on the form
export type IExtractionResult = Omit<ExtractionResult, "rawResponse">;

// The formats that the extractor detects by the content: PDF, PNG, JPEG, GIF and WebP
function isSupportedDocument(content: Buffer): boolean {
  const startsWith = (signature: string, offset: number = 0) =>
    content.subarray(offset, offset + signature.length).toString("latin1") === signature;
  return content.subarray(0, 4096).includes("%PDF") || startsWith("\x89PNG") || startsWith("\xFF\xD8\xFF")
    || startsWith("GIF8") || (startsWith("RIFF") && startsWith("WEBP", 8));
}

/**
 * Decodes a document sent as a base64 string or a base64 data URL.
 * Returns `undefined` if it is not a base64 string or the file format is not supported.
 *
 * The extractor would treat any other string as a file path or a URL to download,
 * so a document from a request must reach it only as the decoded content.
 */
export function decodeDocument(document: any): Buffer | undefined {
  if (typeof document !== "string") return undefined;
  let base64 = document;
  if (document.startsWith("data:")) {
    const commaIndex = document.indexOf(",");
    if (commaIndex < 0 || !document.substring(0, commaIndex).endsWith(";base64")) return undefined;
    base64 = document.substring(commaIndex + 1);
  }
  if (!/^[A-Za-z0-9+/\s]+={0,2}\s*$/.test(base64)) return undefined;
  const content = Buffer.from(base64, "base64");
  return isSupportedDocument(content) ? content : undefined;
}

// The extractor looks for questions in `pages` only, while a schema without pages keeps them in the root
function toFormDefinition(schema: any): any {
  const { elements, questions, ...rest } = schema;
  const rootElements = elements || questions;
  if (Array.isArray(schema.pages) || !Array.isArray(rootElements)) return schema;
  return { ...rest, pages: [{ elements: rootElements }] };
}

/**
 * Reads the answers from a filled-in form. Several documents are the pages of one form.
 * An answer that could not be read is `null`.
 */
export async function extractResponse(schema: any, documents: Buffer[]): Promise<IExtractionResult> {
  const formDefinition = toFormDefinition(schema);
  const extractor = createExtractor({
    provider: settings.createAiProvider(),
    adapter: "surveyjs",
    options: settings.extractionOptions
  });
  // All pages go to the AI provider in one call: a page doesn't report the questions of other pages as empty
  const { rawResponse, ...result } = documents.length > 1
    ? await extractor.extractFromPages({ pages: documents, formDefinition })
    : await extractor.extractFromImage({ image: documents[0], formDefinition });
  return result;
}
