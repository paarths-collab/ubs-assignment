import { loadEnv } from "./config/env";
import { buildApp } from "./app";

async function main(): Promise<void> {
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
