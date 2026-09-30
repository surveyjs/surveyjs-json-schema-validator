import { describe, test, expect, beforeAll, afterAll, afterEach } from "vitest";
import { Server } from "http";
import { AddressInfo } from "net";
import { createApp } from "../src/app";
import { settings } from "../src/settings";
import { AiConfigurationError } from "../src/provider";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  server = await new Promise<Server>(resolve => {
    const s = createApp().listen(0, () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise(resolve => server.close(resolve));
});

async function post(path: string, body: any, raw: boolean = false) {
  const res = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? body : JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
}

describe("POST /schema", () => {
  test("valid schema returns 200 and an empty object", async () => {
    const res = await post("/schema", { elements: [{ type: "text", name: "q1" }] });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  test("schema with warnings only returns 200 and warnings", async () => {
    const res = await post("/schema", { elements: [{ type: "text", name: "q1", someproperty: true }] });
    expect(res.status).toBe(200);
    expect(res.body.errors).toBeUndefined();
    expect(res.body.warnings.map((f: any) => f.ruleId)).toEqual(["property/unknown"]);
  });

  test("schema with errors returns 422 with errors and warnings", async () => {
    const res = await post("/schema", {
      elements: [{ type: "text", someproperty: true, visibleIf: "{somevariable} = 1" }]
    });
    expect(res.status).toBe(422);
    expect(res.body.errors.map((f: any) => f.ruleId).sort()).toEqual(["property/required", "reference/unknown"]);
    expect(res.body.warnings.map((f: any) => f.ruleId)).toEqual(["property/unknown"]);
  });

  test("non-object schema returns 400", async () => {
    const res = await post("/schema", [1, 2]);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_SCHEMA");
  });

  test("malformed JSON returns 400", async () => {
    const res = await post("/schema", "{ \"elements\": ", true);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_JSON");
  });
});

describe("POST /response", () => {
  const schema = {
    elements: [
      { type: "text", name: "q1", isRequired: true },
      { type: "text", name: "q2", isRequired: true }
    ]
  };

  test("valid response returns 200", async () => {
    const res = await post("/response", { schema, response: { q1: "a", q2: "b" } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  test("missing required answer returns 422", async () => {
    const res = await post("/response", { schema, response: { q1: "a" } });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].errorOwner.name).toBe("q2");
  });

  test("missing nested answer returns 422", async () => {
    const res = await post("/response", {
      schema: { elements: [{ type: "matrixdropdown", name: "m", columns: [{ name: "c1", isRequired: true }], rows: ["r1"] }] },
      response: { m: { r1: {} } }
    });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].errorOwner.name).toBe("c1");
  });

  test("unavailable choice returns 422 with a data error", async () => {
    const res = await post("/response", {
      schema: { elements: [{ type: "radiogroup", name: "q1", choices: ["a", "b"] }] },
      response: { q1: "c" }
    });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0].type).toBe("invalidChoiceValue");
    expect(res.body.errors[0].path).toBe("q1");
    expect(res.body.errors[0].value).toBe("c");
    expect(res.body.errors[0].question.name).toBe("q1");
  });

  test("unknown property returns 422 with a data error", async () => {
    const res = await post("/response", { schema, response: { q1: "a", q2: "b", q3: "c" } });
    expect(res.status).toBe(422);
    expect(res.body.errors).toEqual([{ type: "unknownProperty", path: "q3", value: "c" }]);
  });

  test("data and validation errors are returned together", async () => {
    const res = await post("/response", { schema, response: { q1: "a", q3: "c" } });
    expect(res.status).toBe(422);
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors[0].type).toBe("unknownProperty");
    expect(res.body.errors[1].errorOwner.name).toBe("q2");
  });

  test("unknown question type returns 422 instead of accepting the response", async () => {
    const res = await post("/response", {
      schema: { elements: [{ type: "txet", name: "q1", isRequired: true }] },
      response: { other: 1 }
    });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].ruleId).toBe("element/unknown-type");
  });

  test("invalid schema returns 422 with linter errors", async () => {
    const res = await post("/response", {
      schema: { elements: [{ type: "text", name: "q1", visibleIf: "{nope} = 1" }] },
      response: { q1: "a" }
    });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].ruleId).toBe("reference/unknown");
  });

  test("missing schema or response", async () => {
    expect((await post("/response", { response: {} })).body.error).toBe("schema is required");
    expect((await post("/response", { schema })).body.error).toBe("response is required");
  });
});

describe("POST /pdf", () => {
  const schema = {
    elements: [
      { type: "text", name: "q1", isRequired: true },
      { type: "text", name: "q2", isRequired: true }
    ]
  };

  async function postPdf(body: any) {
    const res = await fetch(baseUrl + "/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return { status: res.status, type: res.headers.get("content-type"), body: Buffer.from(await res.arrayBuffer()) };
  }

  test("schema without a response returns a PDF document", async () => {
    const res = await postPdf({ schema });
    expect(res.status).toBe(200);
    expect(res.type).toBe("application/pdf");
    expect(res.body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("schema with a response returns a PDF document", async () => {
    const res = await postPdf({ schema, response: { q1: "a", q2: "b" } });
    expect(res.status).toBe(200);
    expect(res.type).toBe("application/pdf");
    expect(res.body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("response is not validated", async () => {
    const res = await postPdf({ schema, response: { q1: "a", q3: "c" } });
    expect(res.status).toBe(200);
    expect(res.type).toBe("application/pdf");
  });

  test("invalid schema returns 422 with linter errors", async () => {
    const res = await post("/pdf", {
      schema: { elements: [{ type: "text", name: "q1", visibleIf: "{nope} = 1" }] }
    });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].ruleId).toBe("reference/unknown");
  });

  test("non-object schema returns 400", async () => {
    const res = await post("/pdf", { schema: [1, 2] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_SCHEMA");
  });

  test("missing schema", async () => {
    expect((await post("/pdf", { response: {} })).body.error).toBe("schema is required");
  });
});

describe("POST /extract", () => {
  const schema = {
    elements: [
      { type: "text", name: "q1", isRequired: true },
      { type: "text", name: "q2", isRequired: true }
    ]
  };
  // A 1x1 image
  const document = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const defaultSettings = { ...settings };
  let calls: any[];

  // Replaces the AI provider with a mock, so that no document leaves the test
  function useProvider(content: string) {
    calls = [];
    settings.createAiProvider = () => ({
      name: "mock",
      model: "mock-model",
      extractFromImage: async (params) => {
        calls.push(params);
        return { content };
      }
    });
  }

  afterEach(() => {
    Object.assign(settings, defaultSettings);
  });

  test("returns the extracted response", async () => {
    useProvider(JSON.stringify({ q1: "a", q2: "b", _confidence: { q1: 0.9, q2: 0.5 } }));
    const res = await post("/extract", { schema, document });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      data: { q1: "a", q2: "b" },
      uniqueId: null,
      confidence: [
        { fieldName: "q1", value: "a", confidence: 0.9, flagged: false },
        { fieldName: "q2", value: "b", confidence: 0.5, flagged: true }
      ]
    });
  });

  test("accepts a data URL and an array of pages", async () => {
    useProvider(JSON.stringify({ q1: "a", q2: "b" }));
    expect((await post("/extract", { schema, document: "data:image/png;base64," + document })).status).toBe(200);
    expect(calls).toHaveLength(1);
    expect((await post("/extract", { schema, document: [document, document] })).body.data).toEqual({ q1: "a", q2: "b" });
    expect(calls).toHaveLength(2);
    expect(calls[1].image).toHaveLength(2);
  });

  test("accepts a document that is larger than the default body limit", async () => {
    useProvider(JSON.stringify({ q1: "a", q2: "b" }));
    // Base64 decoding ignores the whitespace
    const res = await post("/extract", { schema, document: document + " ".repeat(200 * 1024) });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ q1: "a", q2: "b" });
  });

  test.each([
    ["a file path", "C:\\Windows\\win.ini"],
    ["a URL", "https://example.com/form.png"],
    ["a file of another format", Buffer.from("just a text").toString("base64")],
    ["an empty array", []],
    ["an array with an invalid page", [document, "https://example.com/form.png"]],
  ])("%s returns 400 and the AI provider is not called", async (_, invalidDocument) => {
    useProvider("{}");
    const res = await post("/extract", { schema, document: invalidDocument });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_DOCUMENT");
    expect(calls).toHaveLength(0);
  });

  test("returns 503 when the AI provider is not configured", async () => {
    settings.createAiProvider = () => { throw new AiConfigurationError("OPENAI_API_KEY is not set"); };
    const res = await post("/extract", { schema, document });
    expect(res.status).toBe(503);
    expect(res.body).toEqual({ error: "AI_NOT_CONFIGURED", message: "OPENAI_API_KEY is not set" });
  });

  test("returns 502 when the extraction fails", async () => {
    useProvider("not a json");
    settings.extractionOptions = { maxRetries: 0 };
    const res = await post("/extract", { schema, document });
    expect(res.status).toBe(502);
    expect(res.body.error).toBe("EXTRACTION_FAILED");
    expect(res.body.details).toContain("Extraction failed after 1 attempts");
    expect(calls).toHaveLength(1);
  });

  test("invalid schema returns 422 with linter errors and the AI provider is not called", async () => {
    useProvider("{}");
    const res = await post("/extract", {
      schema: { elements: [{ type: "text", name: "q1", visibleIf: "{nope} = 1" }] },
      document
    });
    expect(res.status).toBe(422);
    expect(res.body.errors[0].ruleId).toBe("reference/unknown");
    expect(calls).toHaveLength(0);
  });

  test("non-object schema returns 400", async () => {
    const res = await post("/extract", { schema: [1, 2], document });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("INVALID_SCHEMA");
  });

  test("missing schema or document", async () => {
    expect((await post("/extract", { document })).body.error).toBe("schema is required");
    expect((await post("/extract", { schema })).body.error).toBe("document is required");
  });
});
