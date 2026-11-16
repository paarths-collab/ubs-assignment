import { existsSync } from "node:fs";
import path from "node:path";

/** Repository-wide tracing nests the app; older builds have a flat layout. */
export function standaloneAppDirectory(standaloneRoot) {
  for (const directory of [path.join(standaloneRoot, "frontend/back-office"), standaloneRoot]) {
    if (existsSync(path.join(directory, "server.js"))) return directory;
  }
  throw new Error("Standalone server not found. Build the DataLens workspace first.");
}
