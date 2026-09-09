import { buildApp } from "./app";
import { env } from "./config/env";

const app = buildApp();

app
  .listen({ port: env.PORT, host: env.HOST })
  .then(() => {
    app.log.info(`Executive Risk Overview API listening on http://${env.HOST}:${env.PORT}`);
  })
  .catch((error) => {
    app.log.error(error, "Failed to start server");
    process.exit(1);
  });
