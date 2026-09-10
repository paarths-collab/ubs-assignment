import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");

export const DATA_PATHS = {
  events: join(DATA_DIR, "risk_events_overview.json"),
  config: join(DATA_DIR, "risk_config_overview.json"),
  patterns: join(DATA_DIR, "risk_patterns_overview.json"),
  aiConfig: join(DATA_DIR, "risk_ai_config_overview.json"),
};

export const EXPECTED_TOTAL_EVENTS = 1000;

export const DEFAULT_PRIORITY_LIMIT = 5;

export const PROMPT_VERSION = "v1";
