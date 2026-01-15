import { Model } from "survey-core";
import express, { Request, Response, NextFunction } from "express";

async function main() {

  const app = express();

  app.use(express.json());

  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError) {
      return res.status(400).json({ error: "Invalid JSON payload" });
    }
    next();
  });

  app.post("/schema", (req: Request, res: Response) => {

    const model = new Model(req.body);

    if (model.jsonErrors && model.jsonErrors.length !== 0) {
      res.status(400).json({ errors: model.jsonErrors });
      return;
    }

    res.status(200).type("application/json").json({});
  });

  app.post("/survey", (req: Request, res: Response) => {

    const { schema, survey } = req.body;

    if (!schema) { res.status(200).type("application/json").json({ error: "schema is required" }); return; }
    if (!survey) { res.status(200).type("application/json").json({ error: "survey is required" }); return; }

    const model = new Model(schema);

    if (model.jsonErrors && model.jsonErrors.length !== 0) {
      res.status(400).json({ errors: model.jsonErrors });
      return;
    }

    model.data = survey;

    if (!model.validate()) {
      const errors: any[] = [];
      let questions = model.getAllQuestions(true);
      for (let question of questions) {
        for (const error of question.errors) {
          errors.push(error);
        }
      }
      res.status(400).json({ errors: errors });
      return;
    }

    res.status(200).type("application/json").json({});
  });

  app.listen(3000);

  // eslint-disable-next-line no-console
  console.info("Application is running on http://localhost:3000");
}

main();