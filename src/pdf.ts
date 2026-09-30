import { settings } from "./settings";

export async function generatePdf(schema: any, response?: any): Promise<Buffer> {
  const pdf = settings.createPdfModel(schema);
  // Without a response the document is an empty form
  if (response) pdf.data = response;
  const content = await pdf.raw("arraybuffer");
  return Buffer.from(<ArrayBuffer>content);
}
