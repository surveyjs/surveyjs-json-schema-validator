import { Model, IDataVerificationOptions } from "survey-core";
import { SurveyPDF, IDocOptions } from "survey-pdf";

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
}

export const settings: IValidatorSettings = {
  createModel: (schema: any): Model => new Model(schema),
  setDataOptions: {},
  createPdfModel: (schema: any): SurveyPDF => new SurveyPDF(schema, settings.pdfDocOptions),
  pdfDocOptions: {}
};
