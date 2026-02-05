import { Model, ExpressionErrorType } from "survey-core";
import express, { Request, Response, NextFunction } from "express";

async function validateSchema(schema: JSON): Promise<any[]> {

  const result: any[] = [];
  const model = new Model(schema);

  if (model.jsonErrors && model.jsonErrors.length !== 0) {
    result.push(...model.jsonErrors);
  }

  for (const item of model.validateExpressions()) {
    for (const error of item.errors) {
      if (error.errorType === ExpressionErrorType.SyntaxError) {
        result.push({
          type: "expressionsyntaxerror",
          message: "Syntax error",
          propertyName: item.propertyName,
          jsonObj: item.obj,
          element: (<any>item.obj)?.owner || item.obj
        });
      }

      if (error.errorType === ExpressionErrorType.UnknownVariable) {
        result.push({
          type: "expressionunknownvariable",
          message: `Unknown variable: '${error.variableName}'`,
          propertyName: item.propertyName,
          jsonObj: item.obj,
          element: (<any>item.obj)?.owner || item.obj
        });
      }

      if (error.errorType === ExpressionErrorType.UnknownFunction) {
        result.push({
          type: "expressionunknownfunction",
          message: `Unknown function: '${error.functionName}'`,
          propertyName: item.propertyName,
          jsonObj: item.obj,
          element: (<any>item.obj)?.owner || item.obj
        });
      }

      if (error.errorType === ExpressionErrorType.SemanticError) {
        result.push({
          type: "expressionsemanticerror",
          message: "Semantic error",
          propertyName: item.propertyName,
          jsonObj: item.obj,
          element: (<any>item.obj)?.owner || item.obj
        });
      }
    }
  }

  return result;
}

async function main() {

  const app = express();

  app.use(express.json());

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError) {
      return res.status(400).type("application/json").json({
        "error": "INVALID_JSON",
        "message": "Malformed JSON payload",
        "details": err.message
      });
    }
    next();
  });

  app.post("/schema", async (req: Request, res: Response) => {

    const errors = await validateSchema(req.body);

    if (errors && errors.length !== 0) {
      res.status(422).type("application/json").json({ errors: errors });
      return;
    }

    res.status(200).type("application/json").json({});
  });

  app.post("/response", async (req: Request, res: Response) => {

    const { schema, response } = req.body;

    if (!schema) { res.status(200).type("application/json").json({ error: "schema is required" }); return; }
    if (!response) { res.status(200).type("application/json").json({ error: "response is required" }); return; }

    const errors = await validateSchema(schema);

    if (errors && errors.length !== 0) {
      res.status(422).type("application/json").json({ errors: errors });
      return;
    }

    const model = new Model(schema);

    model.data = response;

    if (!model.validate()) {
      const errors: any[] = [];
      let questions = model.getAllQuestions(true);
      for (let question of questions) {
        for (const error of question.errors) {
          errors.push(error);
        }
      }
      res.status(422).type("application/json").json({ errors: errors });
      return;
    }

    res.status(200).type("application/json").json({});
  });

  app.listen(3000);

  // eslint-disable-next-line no-console
  console.info("Application is running on http://localhost:3000");
}

main();