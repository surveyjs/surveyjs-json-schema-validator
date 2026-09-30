import { existsSync } from "fs";
import { createApp } from "./app";

// The .env file contains the AI provider settings and API keys. Variables that are already set are not overridden
if (existsSync(".env")) process.loadEnvFile(".env");

const app = createApp();

app.listen(3000);

// eslint-disable-next-line no-console
console.info("Application is running on http://localhost:3000");
