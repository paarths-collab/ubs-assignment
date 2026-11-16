import { cp } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { standaloneAppDirectory } from "./standalone-path.mjs";

const appDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = standaloneAppDirectory(path.join(appDirectory, ".next/standalone"));
// Next does not copy static assets into its standalone output automatically.
await cp(path.join(appDirectory, ".next/static"), path.join(target, ".next/static"), { recursive: true });
await cp(path.join(appDirectory, "public"), path.join(target, "public"), { recursive: true });
