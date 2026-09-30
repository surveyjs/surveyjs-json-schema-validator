import { describe, test, expect, afterEach } from "vitest";
import { LLMProvider } from "ai-form-response-extractor";
import { settings } from "../src/settings";
import { generatePdf } from "../src/pdf";
import { decodeDocument, extractResponse } from "../src/extractor";

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

// A 1x1 image
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

interface IMockProvider extends LLMProvider {
  calls: any[];
}

// Returns canned AI responses one by one, so that no document leaves the test
function mockProvider(...responses: any[]): IMockProvider {
  const calls: any[] = [];
  return {
    name: "mock",
    model: "mock-model",
    calls,
    extractFromImage: async (params) => {
      calls.push(params);
      const response = responses[Math.min(calls.length, responses.length) - 1];
      return typeof response === "string" ? { content: response } : response;
    }
  };
}

function useProvider(...responses: any[]): IMockProvider {
  const provider = mockProvider(...responses);
  settings.createAiProvider = () => provider;
  return provider;
}

describe("decodeDocument", () => {
  test("decodes a base64 string", () => {
    expect(decodeDocument(png)).toEqual(Buffer.from(png, "base64"));
  });

  test("decodes a base64 data URL", () => {
    expect(decodeDocument("data:image/png;base64," + png)).toEqual(Buffer.from(png, "base64"));
  });

  test("decodes a PDF document", async () => {
    const pdf = await generatePdf(schema);
    expect(decodeDocument(pdf.toString("base64"))).toEqual(pdf);
  });

  test.each([
    ["a file path", "C:\\Windows\\win.ini"],
    ["a URL", "https://example.com/form.png"],
    ["a data URL that is not base64", "data:text/plain,hello"],
    ["a file of another format", Buffer.from("just a text").toString("base64")],
    ["an empty string", ""],
    ["not a string", { data: png }],
  ])("rejects %s", (_, document) => {
    expect(decodeDocument(document)).toBeUndefined();
  });
});

describe("extractResponse", () => {
  test("returns the data, unique id and confidence", async () => {
    const provider = useProvider(JSON.stringify({ q1: "Answer 1", q2: "b", _confidence: { q1: 0.95, q2: 0.4 } }));
    const result = await extractResponse(schema, [Buffer.from(png, "base64")]);
    expect(result).toEqual({
      data: { q1: "Answer 1", q2: "b" },
      uniqueId: null,
      confidence: [
        { fieldName: "q1", value: "Answer 1", confidence: 0.95, flagged: false },
        { fieldName: "q2", value: "b", confidence: 0.4, flagged: true }
      ]
    });
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].prompt).toContain("q1");
  });

  test("reads questions from a schema with pages and keeps the hints", async () => {
    const provider = useProvider(JSON.stringify({ q1: "Answer 1", q3: "Answer 3" }));
    const pagedSchema = {
      aiHint: "Answers are handwritten",
      pages: [
        { elements: [{ type: "text", name: "q1" }] },
        { elements: [{ type: "panel", name: "p1", elements: [{ type: "text", name: "q3" }] }] }
      ]
    };
    const result = await extractResponse(pagedSchema, [Buffer.from(png, "base64")]);
    expect(result.data).toEqual({ q1: "Answer 1", q3: "Answer 3" });
    expect(provider.calls[0].prompt).toContain("Answers are handwritten");
  });

  test("keeps the hints of a schema without pages", async () => {
    const provider = useProvider(JSON.stringify({ q1: "Answer 1" }));
    const result = await extractResponse({ aiHint: "Answers are handwritten", elements: [{ type: "text", name: "q1" }] }, [Buffer.from(png, "base64")]);
    expect(result.data).toEqual({ q1: "Answer 1" });
    expect(provider.calls[0].prompt).toContain("Answers are handwritten");
  });

  test("doesn't return the raw AI response", async () => {
    useProvider(JSON.stringify({ q1: "Answer 1", q2: "b" }));
    expect(await extractResponse(schema, [Buffer.from(png, "base64")])).not.toHaveProperty("rawResponse");
  });

  test("an answer that is not read stays null", async () => {
    useProvider(JSON.stringify({ q1: "Answer 1", q2: null }));
    const result = await extractResponse(schema, [Buffer.from(png, "base64")]);
    expect(result.data).toEqual({ q1: "Answer 1", q2: null });
    expect(result.confidence[1]).toEqual({ fieldName: "q2", value: null, confidence: null, flagged: false });
  });

  test("sends a PDF document as is", async () => {
    const provider = useProvider(JSON.stringify({ q1: "Answer 1", q2: "a" }));
    const pdf = await generatePdf(schema, { q1: "Answer 1", q2: "a" });
    const result = await extractResponse(schema, [pdf]);
    expect(result.data).toEqual({ q1: "Answer 1", q2: "a" });
    expect(provider.calls[0].image).toEqual(pdf);
  });

  test("sends all pages in one call", async () => {
    const provider = useProvider(JSON.stringify({ q1: "Answer 1", q2: "a" }));
    const page = Buffer.from(png, "base64");
    await extractResponse(schema, [page, page]);
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0].image).toHaveLength(2);
  });

  test("uses settings.extractionOptions", async () => {
    const response = { content: JSON.stringify({ q1: "Answer 1", q2: "b", _confidence: { q1: 0.95, q2: 0.4 } }), usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 } };
    useProvider(response);
    settings.extractionOptions = { confidenceThreshold: 0.3, logCosts: true };
    const result = await extractResponse(schema, [Buffer.from(png, "base64")]);
    expect(result.confidence.map(field => field.flagged)).toEqual([false, false]);
    expect(result.usage).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15 });
  });

  test("retries after an invalid AI response", async () => {
    const provider = useProvider("not a json", JSON.stringify({ q1: "Answer 1", q2: "a" }));
    const result = await extractResponse(schema, [Buffer.from(png, "base64")]);
    expect(result.data).toEqual({ q1: "Answer 1", q2: "a" });
    expect(provider.calls).toHaveLength(2);
  });

  test("throws when all attempts fail", async () => {
    const provider = useProvider("not a json");
    settings.extractionOptions = { maxRetries: 1 };
    await expect(extractResponse(schema, [Buffer.from(png, "base64")])).rejects.toThrow("Extraction failed after 2 attempts");
    expect(provider.calls).toHaveLength(2);
  });

  test("an error thrown by settings.createAiProvider is not swallowed", async () => {
    settings.createAiProvider = () => { throw new Error("setup failed"); };
    await expect(extractResponse(schema, [Buffer.from(png, "base64")])).rejects.toThrow("setup failed");
  });
});
