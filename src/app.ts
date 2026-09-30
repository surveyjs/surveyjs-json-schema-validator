import express, { Express, Request, Response, NextFunction } from "express";
import { isSchemaObject, validateSchema, validateResponse, ISchemaValidationResult } from "./validator";
import { generatePdf } from "./pdf";

function sendInvalidSchema(res: Response) {
  res.status(400).type("application/json").json({
    "error": "INVALID_SCHEMA",
    "message": "Survey JSON schema must be an object"
  });
}

function sendSchemaErrors(res: Response, result: ISchemaValidationResult): boolean {
  if (result.errors.length === 0) return false;
  res.status(422).type("application/json").json(result);
  return true;
}

function schemaWarnings(result: ISchemaValidationResult): object {
  return result.warnings.length !== 0 ? { warnings: result.warnings } : {};
}

export function createApp(): Express {

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
    next(err);
  });

  app.post("/schema", (req: Request, res: Response) => {

    if (!isSchemaObject(req.body)) { sendInvalidSchema(res); return; }

    const result = validateSchema(req.body);

    if (sendSchemaErrors(res, result)) return;

    res.status(200).type("application/json").json(schemaWarnings(result));
  });

  app.post("/response", (req: Request, res: Response) => {

    const { schema, response } = req.body || {};

    if (!schema) { res.status(200).type("application/json").json({ error: "schema is required" }); return; }
    if (!response) { res.status(200).type("application/json").json({ error: "response is required" }); return; }
    if (!isSchemaObject(schema)) { sendInvalidSchema(res); return; }

    const result = validateSchema(schema);

    if (sendSchemaErrors(res, result)) return;

    const { valid, errors } = validateResponse(schema, response);

    if (!valid) {
      res.status(422).type("application/json").json({ errors: errors });
      return;
    }

    res.status(200).type("application/json").json({});
  });

  app.post("/pdf", async (req: Request, res: Response) => {

    const { schema, response } = req.body || {};

    if (!schema) { res.status(200).type("application/json").json({ error: "schema is required" }); return; }
    if (!isSchemaObject(schema)) { sendInvalidSchema(res); return; }

    const result = validateSchema(schema);

    if (sendSchemaErrors(res, result)) return;

    res.status(200).type("application/pdf").send(await generatePdf(schema, response));
  });

  return app;
}
