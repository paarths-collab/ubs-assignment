import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnv } from "./config/env";
import { buildApp } from "./app";

/**
 * Loads backend/risk-stream-explorer/.env into process.env.
 *
 * Node does not read .env on its own, so without this the file is inert and a
 * pasted API key silently does nothing — the AI panel just keeps showing its
 * fallback. Resolved relative to this file rather than the working directory
 * so it behaves the same whether the server is started from the repo root or
 * from the workspace. A missing .env is fine: every value has a default and
 * the deterministic routes need no credentials at all.
 */
function loadDotEnv(): void {
  const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.env");
  try {
    process.loadEnvFile(envPath);
  } catch {
    // No .env present — defaults apply.
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const env = loadEnv();

  let app;
  try {
    app = await buildApp({ env });
  } catch (err) {
    // Dataset validation failure (or any other construction-time error) —
    // fail fast rather than serve an API over data that failed integrity
    // checks.
    // eslint-disable-next-line no-console
    console.error("Failed to start Component 4 backend:", (err as Error).message);
    process.exit(1);
    return;
  }

  app
    .listen({ port: env.PORT, host: "0.0.0.0" })
    .then(() => {
      app.log.info(`Risk Stream Explorer backend listening on :${env.PORT}`);
    })
    .catch((err: unknown) => {
      app.log.error(err);
      process.exit(1);
    });
}

void main();
