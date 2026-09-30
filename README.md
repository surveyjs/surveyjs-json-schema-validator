# Survey JSON Schema Validator by SurveyJS

A backend service for validating SurveyJS JSON schemas and user responses. Use it to detect configuration errors in survey definitions and verify that collected responses conform to the corresponding survey schema.

## Overview

The SurveyJS JSON Schema Validator helps you:

- Validate survey JSON schemas and detect structural, syntactic, and logical errors.
- Validate user responses against a survey schema, including required questions and data types.
- Catch issues early during development or before persisting survey data.

The service can be deployed as part of your backend infrastructure and exposed via a simple HTTP API.

## Getting Started

### Run the Service Locally

```sh
# Install dependencies
npm i
# Start the service in a Docker container
npm run dev
```

Once started, the service is available at `http://localhost:3000`.

### Run Tests

```sh
npm test
```

### Deploy with Docker

```sh
docker build -t surveyjs-json-schema-validator .
docker run -d -p 3000:3000 surveyjs-json-schema-validator
```

After deployment, the API is accessible at `http://<host>:3000`.

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

## Resources

- [SurveyJS Website](https://surveyjs.io/)
- [Documentation](https://surveyjs.io/documentation)
- [Live Examples](https://surveyjs.io/form-library/examples/overview)
- [What's New](https://surveyjs.io/WhatsNew)

## Licensing

Survey JSON Schema Validator is distributed under the [MIT license](https://github.com/surveyjs/surveyjs-json-schema-validator/blob/master/LICENSE).
