import { Model, PanelModel } from "survey-core";
import { lintSurvey, ILintFinding, ISurveyLintOptions } from "survey-core/linter";

export interface ISchemaValidationResult {
  errors: ILintFinding[];
  warnings: ILintFinding[];
}

export interface IResponseValidationResult {
  valid: boolean;
  errors: any[];
}

// The linter reports an unknown element, validator or trigger type below the error level, but the
// deserializer drops such an object, so a response would be validated against less than the schema says.
const lintOptions: ISurveyLintOptions = {
  rules: {
    "element/unknown-type": "error",
    "validator/unknown-type": "error",
    "trigger/unknown-type": "error"
  }
};

export function isSchemaObject(schema: any): boolean {
  return !!schema && typeof schema === "object" && !Array.isArray(schema);
}

export function validateSchema(schema: any): ISchemaValidationResult {
  const { findings } = lintSurvey(schema, lintOptions);
  return {
    errors: findings.filter(finding => finding.severity === "error"),
    warnings: findings.filter(finding => finding.severity !== "error")
  };
}

export function validateResponse(schema: any, response: any): IResponseValidationResult {
  const model = new Model(schema);
  // setData() reports the values that don't fit the schema: unknown properties, wrong value types and unavailable choices
  const dataErrors = model.setData(response);
  const isValidated = model.validate();

  const errors: any[] = [...dataErrors];
  if (!isValidated) {
    // getAllErrors() includes the errors of matrix cells, multiple text items and dynamic panel questions
    for (const question of model.getAllQuestions(true)) {
      errors.push(...question.getAllErrors());
    }
    for (const panel of <Array<PanelModel>>model.getAllPanels(true)) {
      errors.push(...panel.errors);
    }
  }
  return { valid: isValidated && dataErrors.length === 0, errors };
}
