import { Model } from "survey-core";
import { lintSurvey, ILintFinding } from "survey-core/linter";

export interface ISchemaValidationResult {
  errors: ILintFinding[];
  warnings: ILintFinding[];
}

export function isSchemaObject(schema: any): boolean {
  return !!schema && typeof schema === "object" && !Array.isArray(schema);
}

export function validateSchema(schema: any): ISchemaValidationResult {
  const { findings } = lintSurvey(schema);
  return {
    errors: findings.filter(finding => finding.severity === "error"),
    warnings: findings.filter(finding => finding.severity !== "error")
  };
}

export function validateResponse(schema: any, response: any): any[] {
  const model = new Model(schema);
  model.data = response;
  if (model.validate()) return [];

  const errors: any[] = [];
  for (const question of model.getAllQuestions(true)) {
    errors.push(...question.errors);
  }
  return errors;
}
