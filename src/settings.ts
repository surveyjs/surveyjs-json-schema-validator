import { Model, IDataVerificationOptions } from "survey-core";
import { SurveyPDF, IDocOptions } from "survey-pdf";
import { LLMProvider, ExtractionOptions } from "ai-form-response-extractor";
import { createProviderFromEnv } from "./provider";

export interface IValidatorSettings {
  /**
   * Creates a survey model from a survey JSON schema and sets it up.
   *
   * Change this function if the model requires extra setup before a response is loaded into it:
   * for example, to set the locale, assign variables, or attach event handlers.
   * Register custom question types, functions and properties once, outside this function.
   */
  createModel: (schema: any) => Model;
  /**
   * Options passed to `model.setData()`. They specify which data errors are reported.
   *
   * - `reportUnknownProperties` - data properties that do not correspond to a question
   * or another recognized survey result field. Default value: `true`
   * - `reportInvalidValueTypes` - values whose type or structure does not match the question configuration. Default value: `true`
   * - `reportInvalidChoiceValues` - values that do not match an available choice, matrix column or row, or rating value. Default value: `true`
   * - `reportExpressionResultMismatches` - values added, changed, or removed by expressions, defaults,
   * triggers, or other logic applied when the data is loaded. Default value: `false`
   */
  setDataOptions: IDataVerificationOptions;
  /**
   * Creates a PDF survey model from a survey JSON schema and sets it up.
   *
   * Change this function if the model requires extra setup before a PDF document is generated:
   * for example, to set the locale, make the document read-only, or apply a theme.
   * The default function passes `pdfDocOptions` to the model.
   */
  createPdfModel: (schema: any) => SurveyPDF;
  /**
   * Options passed to the `SurveyPDF` constructor by the default `createPdfModel` function.
   * They specify the page format, orientation, margins, font and other document parameters.
   */
  pdfDocOptions: IDocOptions;
  /**
   * Creates an AI provider that reads a filled-in form. It is called for each extraction.
   *
   * The default function chooses OpenAI, Anthropic or Ollama by the `AI_PROVIDER`, `AI_MODEL`
   * and API key environment variables (see the `.env.example` file).
   * Change this function to use another backend: for example, an API gateway or a mock provider in tests.
   */
  createAiProvider: () => LLMProvider;
  /**
   * Options passed to the AI Form Response Extractor.
   *
   * - `confidenceThreshold` - fields whose confidence is below this value are flagged for review. Default value: `0.75`
   * - `maxRetries` - the number of extra attempts after an invalid AI response. Default value: `2`
   * - `preprocessImage` - downscale and normalize images before they are sent to the AI provider. Default value: `true`
   * - `logCosts` - add token usage to the extraction result. Default value: `false`
   */
  extractionOptions: ExtractionOptions;
  /**
   * The maximum size of the `/extract` request body. Documents are sent as base64 strings,
   * which are about a third larger than the original files.
   */
  extractBodyLimit: string | number;
}

export const settings: IValidatorSettings = {
  createModel: (schema: any): Model => new Model(schema),
  setDataOptions: {},
  createPdfModel: (schema: any): SurveyPDF => new SurveyPDF(schema, settings.pdfDocOptions),
  pdfDocOptions: {},
  createAiProvider: (): LLMProvider => createProviderFromEnv(),
  extractionOptions: {},
  extractBodyLimit: "20mb"
};
