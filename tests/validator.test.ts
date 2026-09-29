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
    expect(validateResponse(schema, { q1: "a", q2: "b" })).toHaveLength(0);
  });

  test("missing required answer", () => {
    const errors = validateResponse(schema, { q1: "a" });
    expect(errors).toHaveLength(1);
    expect(errors[0].getErrorType()).toBe("required");
    expect(errors[0].errorOwner.name).toBe("q2");
  });
});
