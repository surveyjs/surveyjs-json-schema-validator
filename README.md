# SurveyJS Server

A backend service for SurveyJS forms. Use it to detect configuration errors in survey JSON schemas, verify that collected responses conform to the corresponding schema, generate PDF documents, and read responses from filled-in paper forms.

## Overview

SurveyJS Server helps you:

- Validate survey JSON schemas and detect structural, syntactic, and logical errors.
- Validate user responses against a survey schema, including required questions and data types.
- Catch issues early during development or before persisting survey data.
- Generate a PDF document from a survey schema, optionally filled with a user response.
- Extract a user response from a scanned, photographed, or PDF copy of a filled-in form by using AI.

The service can be deployed as part of your backend infrastructure and exposed via a simple HTTP API.

| Endpoint | Purpose | Packages |
| --- | --- | --- |
| `POST /schema` | [Validate a survey JSON schema](#validate-a-survey-json-schema) | `survey-core` |
| `POST /response` | [Validate a user response](#validate-a-user-response) | `survey-core` |
| `POST /pdf` | [Generate a PDF document](#generate-a-pdf-document) | `survey-core`, `survey-pdf` |
| `POST /extract` | [Extract a response from a filled-in form](#extract-a-response-from-a-filled-in-form) | `survey-core`, `ai-form-response-extractor`, and an AI provider SDK |

Validation requires only `survey-core`. PDF generation and AI extraction are optional: if you do not need them, you can [remove their packages](#remove-the-features-you-do-not-need).

## Getting Started

### Run the Service Locally

```sh
# Install dependencies
npm i
# Start the service in a Docker container
npm run dev
```

Once started, the service is available at `http://localhost:3000`.

### Set Up the AI Keys

The `/extract` endpoint requires an AI provider. The other endpoints work without it.

1. Copy `.env.example` to `.env`.
2. Fill in the API key of the provider you use: `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`. To process documents on your own server, set `AI_PROVIDER=ollama` and `AI_MODEL` instead.
3. Restart the service.

| Variable | Description |
| --- | --- |
| `AI_PROVIDER` | `openai`, `anthropic`, or `ollama`. If it is empty, the service uses the provider whose API key is set. |
| `AI_MODEL` | A vision-capable model of the provider. If it is empty, the provider's default model is used. |
| `OPENAI_API_KEY` | An [OpenAI API key](https://platform.openai.com/api-keys). |
| `ANTHROPIC_API_KEY` | An [Anthropic API key](https://console.anthropic.com/settings/keys). |
| `OLLAMA_BASE_URL` | The URL of an [Ollama](https://ollama.com/) server. Default value: `http://localhost:11434` |

The service loads `.env` from the directory it is started in. Variables that are already set in the environment take precedence. The `.env` file is ignored by Git: do not commit API keys or put them in the source code.

### Run Tests

```sh
npm test
```

### Deploy with Docker

```sh
docker build -t surveyjs-server .
docker run -d -p 3000:3000 surveyjs-server
```

After deployment, the API is accessible at `http://<host>:3000`.

The `.env` file is not copied into the image. To use the `/extract` endpoint, pass the AI settings to the container:

```sh
docker run -d -p 3000:3000 --env-file .env surveyjs-server
```

## API Usage

### Validate a Survey JSON Schema

To validate a survey JSON schema, send it in the body of a POST request to the `/schema` endpoint. The schema is checked by the SurveyJS linter (`survey-core/linter`). Each finding contains a `ruleId`, `severity`, `message`, and a `path` into the schema (for example, `elements[0].visibleIf`).

- If the schema has no findings, the service returns status 200 and an empty object.
- If the schema has only warnings, the service returns status 200 and an object with a `warnings` array.
- If the schema has errors, the service returns status 422 and an object with `errors` and `warnings` arrays.

For example, the following request returns status 422 with two errors and one warning:

- Error: Unknown variable `somevariable` used in an expression (`reference/unknown`)
- Error: Missing required property `name` (`property/required`)
- Warning: Unknown property `someproperty` (`property/unknown`)

```js
const surveyJson = {
  "elements": [
    {
      "type": "text",
      "someproperty": true,
      "visibleIf": "{somevariable} = 1"
    }
  ]
};

fetch("http://localhost:3000/schema", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(surveyJson),
})
  .then((response) => response.json())
  .then((data) => console.log(data))
  .catch((error) => console.error("Request failed:", error));
```

### Validate a User Response

You can also validate a user response against a survey JSON schema. Send a POST request to the `/response` endpoint with the following payload:

- `schema` &ndash; The survey JSON schema.
- `response` &ndash; The user response object.

The service returns validation errors if the response does not satisfy the schema requirements. The `errors` array also includes data errors: values that do not fit the schema, such as an unknown property, a value of the wrong type, or an unavailable choice. Each data error contains a `type` (`"unknownProperty"`, `"invalidValueType"`, or `"invalidChoiceValue"`), a `path` into the response (for example, `matrix.row1.col1`), the `value`, and the related `question` if there is one.

In the example below, the request returns a "Response required" error because the required `q2` question is missing from the response.

```js
const surveyJson = {
  "elements": [
    {
      "type": "text",
      "name": "q1",
      "isRequired": true
    },
    {
      "type": "text",
      "name": "q2",
      "isRequired": true
    }
  ]
};

const userResponse = {
  "q1": "Answer 1"
};

fetch("http://localhost:3000/response", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    schema: surveyJson,
    response: userResponse
  })
})
  .then((response) => response.json())
  .then((data) => console.log(data))
  .catch((error) => console.error("Request failed:", error));
```

### Generate a PDF Document

To generate a PDF document, send a POST request to the `/pdf` endpoint with the following payload:

- `schema` &ndash; The survey JSON schema.
- `response` &ndash; (Optional) The user response object. If you omit it, the document is an empty form.

The schema is validated in the same way as by the `/schema` endpoint. The response is not validated: send it to the `/response` endpoint first if you need to.

- If the schema has no errors, the service returns status 200 and the PDF document (`application/pdf`).
- If the schema has errors, the service returns status 422 and an object with `errors` and `warnings` arrays.

```js
const fs = require("fs");

fetch("http://localhost:3000/pdf", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    schema: surveyJson,
    response: userResponse
  })
})
  .then((response) => response.arrayBuffer())
  .then((data) => fs.writeFileSync("survey_result.pdf", Buffer.from(data)))
  .catch((error) => console.error("Request failed:", error));
```

The document is created by [SurveyJS PDF Generator](https://surveyjs.io/pdf-generator/documentation/overview) (`survey-pdf`). To change the page format, orientation, margins, or font, set `settings.pdfDocOptions` ([`IDocOptions`](https://surveyjs.io/pdf-generator/documentation/api-reference/idocoptions)). To set up the PDF model itself, for example, to make the document read-only, replace `settings.createPdfModel`:

```ts
import { SurveyPDF } from "survey-pdf";
import { settings } from "./settings";

settings.pdfDocOptions = { format: "letter", fontSize: 12 };
settings.createPdfModel = (schema) => {
  const pdf = new SurveyPDF(schema, settings.pdfDocOptions);
  pdf.readOnly = true;
  return pdf;
};
```

Notes:

- `survey-pdf` requires the same version of `survey-core`. Upgrade both packages together.
- If a schema contains images, the service downloads them by their URLs when it generates the document. Take this into account if the service accepts schemas from untrusted sources.
- [HTML](https://surveyjs.io/form-library/documentation/api-reference/add-custom-html-to-survey) and [Signature Pad](https://surveyjs.io/form-library/documentation/api-reference/signature-pad-model) questions require a simulated web environment. Refer to the following help topic for details: [Create PDF Forms in Node.js](https://surveyjs.io/pdf-generator/documentation/get-started-nodejs).

### Extract a Response from a Filled-In Form

To read the answers from a scan, a photo, or a PDF copy of a filled-in form, send a POST request to the `/extract` endpoint with the following payload:

- `schema` &ndash; The survey JSON schema of the form.
- `document` &ndash; The document as a base64 string or a base64 data URL. Supported formats: PDF, PNG, JPEG, WebP, and GIF. If a form takes several pages, pass an array of documents: all pages are processed together.

The schema is validated in the same way as by the `/schema` endpoint. File paths and URLs are not accepted as documents.

- If the extraction succeeds, the service returns status 200 and an object with the following properties:
  - `data` &ndash; The response object in the same format as an online submission. An answer that could not be read is `null`.
  - `confidence` &ndash; An array with a `fieldName`, `value`, `confidence` (from 0 to 1), and `flagged` for each question. A `null` confidence means that no answer was found: the question is most likely left empty.
  - `uniqueId` &ndash; A QR code or an ID found in the document, or `null`.
- If the document is not a supported file, the service returns status 400 (`INVALID_DOCUMENT`).
- If the schema has errors, the service returns status 422 and an object with `errors` and `warnings` arrays.
- If the AI provider fails or its output does not match the schema after several attempts, the service returns status 502 (`EXTRACTION_FAILED`).
- If the AI keys are not set up, the service returns status 503 (`AI_NOT_CONFIGURED`).

```js
const fs = require("fs");

fetch("http://localhost:3000/extract", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    schema: surveyJson,
    document: fs.readFileSync("scanned_form.png").toString("base64")
  })
})
  .then((response) => response.json())
  .then((result) => {
    console.log(result.data);
    console.log("Review:", result.confidence.filter((field) => field.flagged));
  })
  .catch((error) => console.error("Request failed:", error));
```

The response is extracted by [SurveyJS AI Form Response Extractor](https://github.com/surveyjs/ai-form-response-extractor) (`ai-form-response-extractor`). To change the confidence threshold or the number of attempts, set `settings.extractionOptions`. To use another AI backend, replace `settings.createAiProvider`. The request body is limited by `settings.extractBodyLimit` (20 MB by default).

```ts
import { settings } from "./settings";

settings.extractionOptions = { confidenceThreshold: 0.9, maxRetries: 1 };
```

Notes:

- An extracted response is not verified data. Questions with `flagged: true` have a confidence below the threshold: show them to a person before you store the response. Do not replace `null` answers with default values.
- With OpenAI or Anthropic, the document and everything written on it is sent to the API of that provider. With Ollama, the document is processed on the server you run, and PDF documents are not supported. The service does not store or log documents.
- Signature Pad, HTML, Image, and File Upload questions are not extracted.
- To help the AI with a particular form or question, add an `aiHint` string to the schema root or to a question. The `/schema` endpoint reports this property as unknown (a warning).

## Remove the Features You Do Not Need

The service installs the packages of all four endpoints. Schema and response validation requires only `survey-core`: the other SurveyJS and AI packages serve the `/pdf` and `/extract` endpoints and can be removed together with them.

| Package | Used for | Can be removed |
| --- | --- | --- |
| `survey-core` | Schema and response validation. The `/pdf` and `/extract` endpoints also use it to validate the schema. | No |
| `express` | The HTTP API | No, unless you call the validation functions from your own code |
| `survey-pdf` | The `/pdf` endpoint | Yes, if you do not generate PDF documents |
| `ai-form-response-extractor` | The `/extract` endpoint | Yes, if you do not extract responses |
| `openai` | The `/extract` endpoint with the OpenAI provider | Yes, if you use Anthropic or Ollama, or do not extract responses |
| `@anthropic-ai/sdk` | The `/extract` endpoint with the Anthropic provider | Yes, if you use OpenAI or Ollama, or do not extract responses |
| `sharp` | The `/extract` endpoint: downscales and normalizes images and reads QR codes | Yes, if you do not extract responses |

### Keep Validation Only

```sh
npm uninstall survey-pdf ai-form-response-extractor openai @anthropic-ai/sdk sharp
```

Then remove the code that uses these packages, as described in the two sections below. The service keeps the `/schema` and `/response` endpoints and depends on `survey-core` and `express` only.

After that, `src/validator.ts` and `src/settings.ts` import nothing but `survey-core`. To validate schemas and responses inside your own Node.js application instead of over HTTP, copy these two files and call `validateSchema(schema)` and `validateResponse(schema, response)`. In this case, you do not need `express` either.

### Remove PDF Generation

```sh
npm uninstall survey-pdf
```

- Delete `src/pdf.ts` and `tests/pdf.test.ts`.
- In `src/app.ts`, remove the `/pdf` route and the `generatePdf` import.
- In `src/settings.ts`, remove the `createPdfModel` and `pdfDocOptions` settings and the `survey-pdf` import.
- In `tests/app.test.ts`, remove the `POST /pdf` tests.

Without `survey-pdf`, the service does not require a commercial SurveyJS license.

### Remove AI Extraction

```sh
npm uninstall ai-form-response-extractor openai @anthropic-ai/sdk sharp
```

- Delete `src/extractor.ts`, `src/provider.ts`, `tests/extractor.test.ts`, `tests/provider.test.ts`, and `.env.example`.
- In `src/app.ts`, remove the `/extract` route, the `express.json()` parser registered for `/extract`, and the imports from `./extractor` and `./provider`.
- In `src/settings.ts`, remove the `createAiProvider`, `extractionOptions`, and `extractBodyLimit` settings and the imports from `ai-form-response-extractor` and `./provider`.
- In `src/index.ts`, remove the line that loads the `.env` file.
- In `tests/app.test.ts`, remove the `POST /extract` tests and the `AiConfigurationError` import.

### Keep AI Extraction with One Provider

The AI provider SDKs are loaded only when a document is processed, so you can uninstall the ones you do not use without changing the code:

| Provider | Uninstall |
| --- | --- |
| OpenAI | `npm uninstall @anthropic-ai/sdk` |
| Anthropic | `npm uninstall openai` |
| Ollama | `npm uninstall openai @anthropic-ai/sdk` |

Keep `sharp`. It is also loaded on demand, but without it images are sent to the AI provider as they are and QR codes are not detected.

Run `npm run build` and `npm test` after you remove a feature to make sure that nothing refers to the deleted code.

## Resources

- [SurveyJS Website](https://surveyjs.io/)
- [Documentation](https://surveyjs.io/documentation)
- [Live Examples](https://surveyjs.io/form-library/examples/overview)
- [What's New](https://surveyjs.io/WhatsNew)

## Licensing

SurveyJS Server is distributed under the [MIT license](https://github.com/surveyjs/surveyjs-server/blob/master/LICENSE).

The `/pdf` endpoint uses SurveyJS PDF Generator, which is not available for free commercial use and requires a [commercial license](https://surveyjs.io/licensing). Without a license key, an alert banner appears at the top of each page in a generated document. To activate your license, follow the instructions on the following page: [How to Remove the Alert Banner](https://surveyjs.io/remove-alert-banner). If you do not generate PDF documents, you can [remove this endpoint](#remove-pdf-generation) together with the `survey-pdf` package.

The `/extract` endpoint uses SurveyJS AI Form Response Extractor, which is distributed under the MIT license. Requests to OpenAI and Anthropic are billed by these providers.
