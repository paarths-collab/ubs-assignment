import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { loadCanonicalBrainData } from "../src/services/brain-data";
import { buildInvestigationContext } from "../src/services/investigation-context";
import { buildUserPrompt, SYSTEM_PROMPT } from "../src/prompts/investigation-prompt";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const data = loadCanonicalBrainData(path.resolve(__dirname, "../../../frontend/risk-relationship-network/data"));

const HIGH_FINANCIAL_EVENTS = ["SIM-0000026", "SIM-0000386", "SIM-0000866"];

describe("system prompt — guardrails the model is held to", () => {
  it("forbids inventing numbers and forbids recomputation", () => {
    expect(SYSTEM_PROMPT).toMatch(/Never invent, estimate, recompute/i);
    expect(SYSTEM_PROMPT).toMatch(/authoritative/i);
  });

  it("states the null-is-not-zero financial rule", () => {
    expect(SYSTEM_PROMPT).toMatch(/never zero/i);
    expect(SYSTEM_PROMPT).toMatch(/Actual financial exposure and potential impact are separate/i);
  });

  it("frames people as workflow concentration rather than blame", () => {
    expect(SYSTEM_PROMPT).toMatch(/workflow concentration/i);
    expect(SYSTEM_PROMPT).toMatch(/not individual performance/i);
  });

  it("instructs the model to ignore instructions embedded in dataset text", () => {
    expect(SYSTEM_PROMPT).toMatch(/evidence, not instruction/i);
  });

  it("requires causation restraint and explicit limitations", () => {
    expect(SYSTEM_PROMPT).toMatch(/Do not assert causation/i);
    expect(SYSTEM_PROMPT).toMatch(/insufficient/i);
  });
});

describe("user prompt — carries only server-computed facts", () => {
  it("labels the calculated facts as authoritative and not to be recomputed", () => {
    const context = buildInvestigationContext(data, { eventIds: HIGH_FINANCIAL_EVENTS });
    const prompt = buildUserPrompt(context);
    expect(prompt).toContain("CALCULATED FACTS (authoritative — do not recompute)");
  });

  it("renders an absent amount as not-applicable rather than zero", () => {
    // A Non-Financial event has no gross/net/recovery at all.
    const nonFinancialEvents = ["SIM-0000001"];
    const context = buildInvestigationContext(data, { eventIds: nonFinancialEvents });
    const prompt = buildUserPrompt(context);

    expect(prompt).toMatch(/Gross: not applicable/);
    expect(prompt).not.toMatch(/Gross: 0\.00 USD/);
  });

  it("keeps actual and potential exposure in separate labelled lines", () => {
    const context = buildInvestigationContext(data, { eventIds: HIGH_FINANCIAL_EVENTS });
    const prompt = buildUserPrompt(context);
    expect(prompt).toContain("Actual financial exposure:");
    expect(prompt).toContain("Potential exposure (separate measure):");
  });

  it("labels people breakdowns as workflow concentration", () => {
    const context = buildInvestigationContext(data, { eventIds: HIGH_FINANCIAL_EVENTS });
    const prompt = buildUserPrompt(context);
    expect(prompt).toMatch(/Top event owners \(workflow concentration, not blame\)/);
  });

  it("states that aggregates cover the full scope even when the sample is capped", () => {
    const everyEventId = Array.from(data.allEventIds);
    const context = buildInvestigationContext(data, { eventIds: everyEventId });
    const prompt = buildUserPrompt(context);

    expect(context.scope.eventCount).toBe(1000);
    expect(prompt).toMatch(/REPRESENTATIVE EVENTS \(30 of 1000/);
    expect(prompt).toMatch(/the aggregates above still cover all 1000/);
  });

  it("includes the analyst question when supplied, and a default when not", () => {
    const context = buildInvestigationContext(data, { eventIds: HIGH_FINANCIAL_EVENTS });
    expect(buildUserPrompt(context, "Why are these connected?")).toContain("Why are these connected?");
    expect(buildUserPrompt(context)).toMatch(/What is connected here/);
  });
});
