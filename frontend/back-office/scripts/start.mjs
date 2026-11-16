import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { standaloneAppDirectory } from "./standalone-path.mjs";

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// Load server-only local settings before standalone changes its working directory.
process.env.NODE_ENV = "production";
for (const file of [".env.production.local", ".env.local", ".env.production", ".env"]) {
  const filename = path.join(appDirectory, file);
  if (existsSync(filename)) process.loadEnvFile(filename);
}
const standalone = standaloneAppDirectory(path.join(appDirectory, ".next/standalone"));
await import(pathToFileURL(path.join(standalone, "server.js")).href);
