import { describe, test, expect, beforeAll, afterAll } from "vitest";
import { Server } from "http";
import { AddressInfo } from "net";
import { createApp } from "../src/app";

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
