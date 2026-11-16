import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createLocalServer } from "./serve-local.js";

// Start both locally. The fixed internal port also matches Next's built rewrites.
const root = path.resolve(import.meta.dirname, "..");
// Explicit process settings win; .env.local takes precedence over .env.
for (const file of [".env.local", ".env"]) {
  const filename = path.join(root, file);
  if (existsSync(filename)) process.loadEnvFile(filename);
}
const standalone = path.join(root, "frontend/back-office/.next/standalone");
const hasStandalone = ["frontend/back-office/server.js", "server.js"].some(file => existsSync(path.join(standalone, file)));
if (!existsSync(path.join(root, "dist/kpi.html")) || !hasStandalone) {
  throw new Error("Build the connected workspace first with npm run start:connected.");
}
async function start() {
  const { default: apiHandler } = await import("../api/handler.js");
  const server = createLocalServer({ distDir: path.join(root, "dist"), vercelConfigPath: path.join(root, "vercel.json"), apiHandler });
  server.on("error", error => { console.error(error.message); process.exitCode = 1; });
  server.listen(4311, "127.0.0.1", () => {
    const child = spawn(process.execPath, ["scripts/start.mjs"], {
      cwd: path.join(root, "frontend/back-office"), stdio: "inherit",
      env: { ...process.env, OPERATIONAL_BACKEND_URL: "http://127.0.0.1:4311", HOSTNAME: "127.0.0.1", PORT: process.env.PORT ?? "3000", NEXT_TELEMETRY_DISABLED: "1" },
    });
    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      child.kill("SIGTERM");
      server.close();
      server.closeAllConnections();
      const timer = setTimeout(() => process.exit(process.exitCode ?? 0), 2000);
      timer.unref();
    };
    process.once("SIGINT", close);
    process.once("SIGTERM", close);
    child.once("error", error => { console.error(error.message); process.exitCode = 1; close(); });
    child.once("exit", code => { process.exitCode = code ?? 0; close(); });
    console.log("Connected analysis backend: http://127.0.0.1:4311");
  });
}
void start().catch(error => { console.error(error.message); process.exitCode = 1; });
