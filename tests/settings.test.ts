import { describe, test, expect, afterEach } from "vitest";
import { Model } from "survey-core";
import { settings } from "../src/settings";
import { validateResponse } from "../src/validator";

const defaultSettings = { ...settings };

afterEach(() => {
  Object.assign(settings, defaultSettings);
});

describe("settings.createModel", () => {
  test("creates a model by schema by default", () => {
    const model = settings.createModel({ elements: [{ type: "text", name: "q1" }] });
    expect(model).toBeInstanceOf(Model);
    expect(model.getAllQuestions().map(q => q.name)).toEqual(["q1"]);
  });

  test("validateResponse uses the custom function", () => {
    const schemas: any[] = [];
    settings.createModel = (schema: any) => {
      schemas.push(schema);
      return new Model(schema);
    };
    const schema = { elements: [{ type: "text", name: "q1" }] };
    expect(validateResponse(schema, { q1: "a" })).toEqual({ valid: true, errors: [] });
    expect(schemas).toEqual([schema]);
  });

  test("validateResponse validates against the model set up by the custom function", () => {
    const schema = {
      elements: [
        { type: "text", name: "q1" },
        { type: "text", name: "q2", isRequired: true, visibleIf: "{mode} = 'full'" }
      ]
    };
    expect(validateResponse(schema, { q1: "a" }).valid).toBe(true);

    settings.createModel = (json: any) => {
      const model = new Model(json);
      model.setVariable("mode", "full");
      return model;
    };
    const { valid, errors } = validateResponse(schema, { q1: "a" });
    expect(valid).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0].getErrorType()).toBe("required");
    expect(errors[0].errorOwner.name).toBe("q2");
  });

  test("an error thrown by the custom function is not swallowed", () => {
    settings.createModel = () => { throw new Error("setup failed"); };
    expect(() => validateResponse({}, { q1: "a" })).toThrow("setup failed");
  });
});

describe("settings.setDataOptions", () => {
  const schema = {
    elements: [
      { type: "radiogroup", name: "q1", choices: ["a", "b"] },
      { type: "text", name: "q2", inputType: "number" },
      { type: "expression", name: "e", expression: "{q2} + 1" }
    ]
  };
  const response = { q1: "c", q2: "abc", q3: 1 };
  const errorTypes = (data: any) => validateResponse(schema, data).errors.map(e => e.type).sort();

  test("empty by default", () => {
    expect(settings.setDataOptions).toEqual({});
    expect(errorTypes(response)).toEqual(["invalidChoiceValue", "invalidValueType", "unknownProperty"]);
  });

  test.each([
    ["reportUnknownProperties", ["invalidChoiceValue", "invalidValueType"]],
    ["reportInvalidValueTypes", ["invalidChoiceValue", "unknownProperty"]],
    ["reportInvalidChoiceValues", ["invalidValueType", "unknownProperty"]],
  ])("%s: false turns the check off", (option, expected) => {
    settings.setDataOptions = { [option]: false };
    expect(errorTypes(response)).toEqual(expected);
  });

  test("response is valid when its only data error is turned off", () => {
    settings.setDataOptions = { reportUnknownProperties: false };
    expect(validateResponse(schema, { q1: "a", q3: 1 })).toEqual({ valid: true, errors: [] });
  });

  test("reportExpressionResultMismatches: true reports a recalculated value", () => {
    expect(validateResponse(schema, { q2: 1, e: 5 })).toEqual({ valid: true, errors: [] });

    settings.setDataOptions = { reportExpressionResultMismatches: true };
    const { valid, errors } = validateResponse(schema, { q2: 1, e: 5 });
    expect(valid).toBe(false);
    expect(errors).toHaveLength(1);
    expect(errors[0].type).toBe("expressionResultMismatch");
    expect(errors[0].path).toBe("e");
    expect(errors[0].value).toBe(5);
    expect(errors[0].expressionResult).toBe(2);
  });
});
