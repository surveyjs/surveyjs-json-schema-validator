import { describe, test, expect } from "vitest";
import { validateSchema, validateResponse } from "../src/validator";

describe("validateSchema", () => {
  test("valid schema produces no findings", () => {
    const result = validateSchema({
      elements: [
        { type: "radiogroup", name: "q1", choices: ["a", "b"] },
        { type: "text", name: "q2", visibleIf: "{q1} = 'a'" }
      ]
    });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test("empty schema is valid", () => {
    const result = validateSchema({});
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  test("splits linter findings into errors and warnings", () => {
    const result = validateSchema({
      elements: [
        { type: "text", someproperty: true, visibleIf: "{somevariable} = 1" }
      ]
    });
    expect(result.errors.map(f => f.ruleId).sort()).toEqual(["property/required", "reference/unknown"]);
    expect(result.warnings.map(f => f.ruleId)).toEqual(["property/unknown"]);

    const unknownRef = result.errors.filter(f => f.ruleId === "reference/unknown")[0];
    expect(unknownRef.path).toBe("elements[0].visibleIf");
    expect(unknownRef.messageData.name).toBe("somevariable");
  });

  test("expression syntax error", () => {
    const result = validateSchema({
      elements: [{ type: "text", name: "q1" }, { type: "text", name: "q2", visibleIf: "{q1} = " }]
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].ruleId).toBe("expression/syntax");
    expect(result.errors[0].path).toBe("elements[1].visibleIf");
  });

  test("unknown function is a warning", () => {
    const result = validateSchema({
      elements: [{ type: "text", name: "q1" }, { type: "text", name: "q2", visibleIf: "foo({q1})" }]
    });
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.map(f => f.ruleId)).toEqual(["expression/unknown-function"]);
  });

  test.each([
    ["element/unknown-type", { elements: [{ type: "txet", name: "q1", isRequired: true }] }],
    ["validator/unknown-type", { elements: [{ type: "text", name: "q1", validators: [{ type: "emial" }] }] }],
    ["trigger/unknown-type", { elements: [{ type: "text", name: "q1" }], triggers: [{ type: "complte", expression: "{q1} = 1" }] }],
  ])("unsupported type is an error: %s", (ruleId, schema) => {
    const result = validateSchema(schema);
    expect(result.errors.map(f => f.ruleId)).toEqual([ruleId]);
  });

  test("duplicate names", () => {
    const result = validateSchema({
      elements: [{ type: "text", name: "q1" }, { type: "text", name: "q1" }]
    });
    expect(result.errors.some(f => f.ruleId === "name/duplicate")).toBeTruthy();
  });

  test("findings are plain JSON", () => {
    const result = validateSchema({ elements: [{ type: "text", visibleIf: "{nope} = 1" }] });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  test("non-object schema throws TypeError", () => {
    expect(() => validateSchema(null)).toThrow(TypeError);
    expect(() => validateSchema([])).toThrow(TypeError);
    expect(() => validateSchema("{}")).toThrow(TypeError);
  });
});

describe("validateResponse", () => {
  const schema = {
    elements: [
      { type: "text", name: "q1", isRequired: true },
      { type: "text", name: "q2", isRequired: true }
    ]
  };

  test("valid response produces no errors", () => {
    expect(validateResponse(schema, { q1: "a", q2: "b" })).toEqual({ valid: true, errors: [] });
  });

  test("missing required answer", () => {
    const { valid, errors } = validateResponse(schema, { q1: "a" });
    expect(valid).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0].getErrorType()).toBe("required");
    expect(errors[0].errorOwner.name).toBe("q2");
  });

  test.each([
    ["matrix cell", {
      elements: [{ type: "matrixdropdown", name: "m", columns: [{ name: "c1", isRequired: true }], rows: ["r1"] }]
    }, { m: { r1: {} } }, "c1", "required"],
    ["multiple text item", {
      elements: [{ type: "multipletext", name: "mt", items: [{ name: "i1", isRequired: true }] }]
    }, { other: 1 }, "i1", "required"],
    ["dynamic panel question", {
      elements: [{ type: "paneldynamic", name: "pd", templateElements: [{ type: "text", name: "t1", isRequired: true }] }]
    }, { pd: [{}] }, "t1", "required"],
    ["required panel", {
      elements: [{ type: "panel", name: "p", isRequired: true, elements: [{ type: "text", name: "q1" }] }]
    }, { other: 1 }, "p", "requireoneanswer"],
  ])("collects nested errors: %s", (_, nestedSchema, response, ownerName, errorType) => {
    const { valid, errors } = validateResponse(nestedSchema, response);
    expect(valid).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0].getErrorType()).toBe(errorType);
    expect(errors[0].errorOwner.name).toBe(ownerName);
  });
});
