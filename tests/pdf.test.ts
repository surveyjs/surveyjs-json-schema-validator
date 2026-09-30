import { describe, test, expect, afterEach } from "vitest";
import { SurveyPDF } from "survey-pdf";
import { settings } from "../src/settings";
import { generatePdf } from "../src/pdf";

const defaultSettings = { ...settings };

afterEach(() => {
  Object.assign(settings, defaultSettings);
});

const schema = {
  elements: [
    { type: "text", name: "q1", title: "First question" },
    { type: "radiogroup", name: "q2", choices: ["a", "b"] }
  ]
};

function isPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-" && buffer.toString("latin1").trimEnd().endsWith("%%EOF");
}

describe("generatePdf", () => {
  test("returns a PDF document as a buffer", async () => {
    const pdf = await generatePdf(schema);
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(isPdf(pdf)).toBe(true);
  });

  test("loads the response into the model", async () => {
    const models: SurveyPDF[] = [];
    settings.createPdfModel = (json: any) => {
      const model = new SurveyPDF(json, settings.pdfDocOptions);
      models.push(model);
      return model;
    };
    expect(isPdf(await generatePdf(schema, { q1: "Answer 1", q2: "b" }))).toBe(true);
    expect(models).toHaveLength(1);
    expect(models[0].data).toEqual({ q1: "Answer 1", q2: "b" });
  });

  test("the response changes the document", async () => {
    settings.pdfDocOptions = { compress: false };
    const empty = (await generatePdf(schema)).toString("latin1");
    const filled = (await generatePdf(schema, { q1: "Answer 1" })).toString("latin1");
    expect(empty).not.toContain("Answer 1");
    expect(filled).toContain("Answer 1");
  });

  test("leaves the model without data when there is no response", async () => {
    let model: SurveyPDF | undefined;
    settings.createPdfModel = (json: any) => model = new SurveyPDF(json);
    await generatePdf(schema);
    expect(model?.data).toEqual({});
  });
});

describe("settings.createPdfModel", () => {
  test("creates a PDF model by schema by default", () => {
    const model = settings.createPdfModel(schema);
    expect(model).toBeInstanceOf(SurveyPDF);
    expect(model.getAllQuestions().map(q => q.name)).toEqual(["q1", "q2"]);
  });

  test("generatePdf uses the custom function", async () => {
    const schemas: any[] = [];
    settings.createPdfModel = (json: any) => {
      schemas.push(json);
      return new SurveyPDF(json);
    };
    await generatePdf(schema);
    expect(schemas).toEqual([schema]);
  });

  test("an error thrown by the custom function is not swallowed", async () => {
    settings.createPdfModel = () => { throw new Error("setup failed"); };
    await expect(generatePdf(schema)).rejects.toThrow("setup failed");
  });
});

describe("settings.pdfDocOptions", () => {
  test("empty by default", () => {
    expect(settings.pdfDocOptions).toEqual({});
  });

  test("the default createPdfModel function passes the options to the model", async () => {
    const portrait = await generatePdf(schema);
    settings.pdfDocOptions = { orientation: "l" };
    const landscape = await generatePdf(schema);
    const mediaBox = (pdf: Buffer) => /\/MediaBox\s*\[([^\]]+)\]/.exec(pdf.toString("latin1"))![1].trim().split(/\s+/).map(Number);
    const [, , portraitWidth, portraitHeight] = mediaBox(portrait);
    const [, , landscapeWidth, landscapeHeight] = mediaBox(landscape);
    expect(portraitHeight).toBeGreaterThan(portraitWidth);
    expect(landscapeWidth).toBeGreaterThan(landscapeHeight);
  });
});
