import { cpSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const rootOutput = resolve("dist");
const kpiOutput = resolve("frontend/risk-executive-overview/dist");

// The main application is a self-contained file at /index.html. The KPI app
// keeps its compiled assets at /assets and is served from /kpi by Vercel.
mkdirSync(rootOutput, { recursive: true });
cpSync(resolve(kpiOutput, "assets"), resolve(rootOutput, "assets"), { recursive: true });
cpSync(resolve(kpiOutput, "index.html"), resolve(rootOutput, "kpi.html"));
