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
    }, {}, "i1", "required"],
    ["dynamic panel question", {
      elements: [{ type: "paneldynamic", name: "pd", templateElements: [{ type: "text", name: "t1", isRequired: true }] }]
    }, { pd: [{}] }, "t1", "required"],
    ["required panel", {
      elements: [{ type: "panel", name: "p", isRequired: true, elements: [{ type: "text", name: "q1" }] }]
    }, {}, "p", "requireoneanswer"],
  ])("collects nested errors: %s", (_, nestedSchema, response, ownerName, errorType) => {
    const { valid, errors } = validateResponse(nestedSchema, response);
    expect(valid).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0].getErrorType()).toBe(errorType);
    expect(errors[0].errorOwner.name).toBe(ownerName);
  });
});

describe("validateResponse: data errors", () => {
  test("unknown property", () => {
    const { valid, errors } = validateResponse({ elements: [{ type: "text", name: "q1" }] }, { q1: "a", other: 1 });
    expect(valid).toBe(false);
    expect(errors).toEqual([{ type: "unknownProperty", path: "other", value: 1, question: undefined }]);
  });

  test.each([
    ["unavailable choice", {
      elements: [{ type: "radiogroup", name: "q1", choices: ["a", "b"] }]
    }, { q1: "c" }, "invalidChoiceValue", "q1", "c", "q1"],
    ["unavailable choice in a checkbox", {
      elements: [{ type: "checkbox", name: "q1", choices: ["a", "b"] }]
    }, { q1: ["a", "c"] }, "invalidChoiceValue", "q1[1]", "c", "q1"],
    ["rate value out of range", {
      elements: [{ type: "rating", name: "q1" }]
    }, { q1: 9 }, "invalidChoiceValue", "q1", 9, "q1"],
    ["text in a number input", {
      elements: [{ type: "text", name: "q1", inputType: "number" }]
    }, { q1: "abc" }, "invalidValueType", "q1", "abc", "q1"],
    ["non-boolean value", {
      elements: [{ type: "boolean", name: "q1" }]
    }, { q1: "maybe" }, "invalidValueType", "q1", "maybe", "q1"],
    ["unavailable matrix column", {
      elements: [{ type: "matrix", name: "m", columns: ["c1", "c2"], rows: ["r1", "r2"] }]
    }, { m: { r1: "c3" } }, "invalidChoiceValue", "m.r1", "c3", "m"],
    ["unknown matrix row", {
      elements: [{ type: "matrix", name: "m", columns: ["c1", "c2"], rows: ["r1", "r2"] }]
    }, { m: { r3: "c1" } }, "unknownProperty", "m.r3", "c1", "m"],
    ["unavailable choice in a matrix cell", {
      elements: [{ type: "matrixdropdown", name: "m", columns: [{ name: "c1", cellType: "dropdown", choices: [1, 2] }], rows: ["r1"] }]
    }, { m: { r1: { c1: 5 } } }, "invalidChoiceValue", "m.r1.c1", 5, "c1"],
    ["unknown multiple text item", {
      elements: [{ type: "multipletext", name: "mt", items: [{ name: "i1" }] }]
    }, { mt: { i1: "a", i2: "b" } }, "unknownProperty", "mt.i2", "b", "mt"],
    ["unknown dynamic panel question", {
      elements: [{ type: "paneldynamic", name: "pd", templateElements: [{ type: "text", name: "t1" }] }]
    }, { pd: [{ t1: "a" }, { t2: "b" }] }, "unknownProperty", "pd[1].t2", "b", "pd"],
  ])("reports a data error: %s", (_, dataSchema, response, type, path, value, questionName) => {
    const { valid, errors } = validateResponse(dataSchema, response);
    expect(valid).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe(type);
    expect(errors[0].path).toBe(path);
    expect(errors[0].value).toBe(value);
    expect(errors[0].question.name).toBe(questionName);
  });

  test("reports several data errors", () => {
    const { valid, errors } = validateResponse({
      elements: [
        { type: "radiogroup", name: "q1", choices: ["a", "b"] },
        { type: "text", name: "q2", inputType: "number" }
      ]
    }, { q1: "c", q2: "abc", q3: 1 });
    expect(valid).toBe(false);
    expect(errors.map(e => e.type + ":" + e.path).sort()).toEqual([
      "invalidChoiceValue:q1", "invalidValueType:q2", "unknownProperty:q3"
    ]);
  });

  test("data errors go before validation errors", () => {
    const { valid, errors } = validateResponse({
      elements: [
        { type: "text", name: "q1", isRequired: true },
        { type: "text", name: "q2", inputType: "number" }
      ]
    }, { q2: "abc" });
    expect(valid).toBe(false);
    expect(errors).toHaveLength(2);
    expect(errors[0].type).toBe("invalidValueType");
    expect(errors[0].path).toBe("q2");
    expect(errors[1].getErrorType()).toBe("required");
    expect(errors[1].errorOwner.name).toBe("q1");
  });

  test("unavailable choice in a required question is both a data and a validation error", () => {
    const { valid, errors } = validateResponse({
      elements: [{ type: "radiogroup", name: "q1", choices: ["a", "b"], isRequired: true }]
    }, { q1: "c" });
    expect(valid).toBe(false);
    expect(errors).toHaveLength(2);
    expect(errors[0].type).toBe("invalidChoiceValue");
    expect(errors[1].getErrorType()).toBe("required");
  });

  test("values that fit the schema produce no data errors", () => {
    const result = validateResponse({
      elements: [
        { type: "radiogroup", name: "q1", choices: ["a", "b"] },
        { type: "checkbox", name: "q2", choices: ["a", "b"] },
        { type: "text", name: "q3", inputType: "number" },
        { type: "boolean", name: "q4" },
        { type: "rating", name: "q5" },
        { type: "matrix", name: "q6", columns: ["c1", "c2"], rows: ["r1", "r2"] },
        { type: "multipletext", name: "q7", items: [{ name: "i1" }] },
        { type: "paneldynamic", name: "q8", templateElements: [{ type: "text", name: "t1" }] }
      ]
    }, {
      q1: "a", q2: ["a", "b"], q3: 5, q4: true, q5: 3,
      q6: { r1: "c1", r2: "c2" }, q7: { i1: "a" }, q8: [{ t1: "a" }, { t1: "b" }]
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  test("a value recalculated by an expression is not a data error", () => {
    const result = validateResponse({
      elements: [{ type: "text", name: "q1" }, { type: "expression", name: "e", expression: "{q1} + 1" }]
    }, { q1: 1, e: 5 });
    expect(result).toEqual({ valid: true, errors: [] });
  });
});
