import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadCanonicalBrainData } from "../src/services/brain-data";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../../../frontend/risk-relationship-network/data");

describe("loadCanonicalBrainData — canonical server-side load (Phase 1 acceptance criteria)", () => {
  it("loads the same counts as the frontend bundle, straight from disk", () => {
    const data = loadCanonicalBrainData(dataDir);
    expect(data.eventsById.size).toBe(1000);
    expect(data.nodesById.size).toBe(1136);
    expect(data.edgesById.size).toBe(11024);
    expect(data.allEventIds.size).toBe(1000);
  });
});
