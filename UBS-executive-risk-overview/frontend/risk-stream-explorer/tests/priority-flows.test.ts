import { describe, expect, it } from "vitest";
import { loadBrainData } from "../src/graph/data-loader";
import { computePriorityFlows } from "../src/graph/priority-flows";

describe("priority investigation flows", () => {
  it("builds non-empty deterministic priority slices from the brain data", () => {
    const flows = computePriorityFlows(loadBrainData());
    expect(flows).toHaveLength(11);
    expect(flows.every((flow) => flow.headline.length > 0)).toBe(true);
    expect(flows.find((flow) => flow.id === "high-severity-open")?.eventIds.length).toBeGreaterThan(0);
  });

  it("uses open workflow statuses for unresolved priority flows", () => {
    const data = loadBrainData();
    const flows = computePriorityFlows(data);
    const highOpen = flows.find((flow) => flow.id === "high-severity-open")!;
    expect(highOpen.eventIds.every((id) => {
      const event = data.eventsById.get(id)!;
      return event.severity === "High" && event.status !== "Closed" && event.status !== "Cancelled";
    })).toBe(true);
  });
});
