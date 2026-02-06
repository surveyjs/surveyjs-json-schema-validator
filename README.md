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

### Deploy with Docker

```sh
docker build -t surveyjs-json-schema-validator .
docker run -d -p 3000:3000 surveyjs-json-schema-validator
```

After deployment, the API is accessible at `http://<host>:3000`.

## API Usage

### Validate a Survey JSON Schema

To validate a survey JSON schema, send it in the body of a POST request to the `/schema` endpoint. If the schema is valid, the response contains an empty object. If validation fails, the response contains an object with an `errors` array describing the detected issues.

For example, the following request returns three errors:

- Unknown property `someproperty`
- Unknown variable `somevariable` used in an expression
- Missing required property `name`

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

The service returns validation errors if the response does not satisfy the schema requirements. In the example below, the request returns a "Response required" error because the required `q2` question is missing from the response.

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
- [What's New](https://surveyjs.io/stay-updated/major-updates/2024)
