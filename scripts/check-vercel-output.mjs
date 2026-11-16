// Asserts that `npm run build:vercel` produced the files vercel.json relies on:
// the stream SPA (/index.html), the KPI SPA (/kpi.html) and its /assets, plus
// a few cheap content checks that catch the two apps being mixed up.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

// The stream app is a single-file bundle (JS/CSS/data inlined), so it is large.
const MIN_INDEX_BYTES = 1_000_000;

const dist = resolve("dist");
const problems = [];
const text = {};

for (const file of ["index.html", "kpi.html"]) {
  const full = resolve(dist, file);
  if (!existsSync(full) || !statSync(full).isFile() || statSync(full).size === 0) {
    problems.push(`dist/${file} is missing or empty`);
  } else {
    text[file] = readFileSync(full, "utf8");
  }
}

const assets = resolve(dist, "assets");
if (!existsSync(assets) || !statSync(assets).isDirectory() || readdirSync(assets).length === 0) {
  problems.push("dist/assets is missing or empty");
}

if (text["kpi.html"] !== undefined && !text["kpi.html"].includes("/assets/")) {
  problems.push('dist/kpi.html does not reference "/assets/" (is it the KPI app\'s index.html?)');
}
if (text["index.html"] !== undefined && Buffer.byteLength(text["index.html"]) < MIN_INDEX_BYTES) {
  problems.push(`dist/index.html is only ${Buffer.byteLength(text["index.html"])} bytes (< ${MIN_INDEX_BYTES}); expected the single-file stream bundle`);
}
if (text["index.html"] !== undefined && text["index.html"] === text["kpi.html"]) {
  problems.push("dist/index.html and dist/kpi.html are identical");
}

if (problems.length > 0) {
  console.error(`check-vercel-output: FAILED\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log("check-vercel-output: ok (dist/index.html, dist/kpi.html, dist/assets/*)");
