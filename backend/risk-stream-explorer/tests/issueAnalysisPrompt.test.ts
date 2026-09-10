import { describe, expect, it } from "vitest";
import { buildIssueSystemPrompt, ISSUE_PROMPT_VERSION, ISSUE_RESPONSE_JSON_SCHEMA } from "../src/prompts/issue-analysis.prompt";

/** The 9 prose fields of `LlmIssueStructuredResult` (src/types/Issue.ts) — the model must be asked for exactly these, no more, no fewer. */
const REQUIRED_FIELDS = [
  "strongestFinding",
  "whyItMayMatter",
  "supportingEvidence",
  "weakeningEvidence",
  "investigationHypothesis",
  "whatWouldDisproveThis",
  "investigationQuestions",
  "suggestedControl",
  "limitations",
] as const;

describe("issue-analysis prompt (synthesis contract)", () => {
  it("names every one of the 9 required fields in the system prompt text", () => {
    const prompt = buildIssueSystemPrompt();
    for (const field of REQUIRED_FIELDS) {
      expect(prompt).toContain(field);
    }
  });

  it("instructs the model to argue both for and against the evidence using counter_signals", () => {
    const prompt = buildIssueSystemPrompt();
    expect(prompt).toContain("counter_signals");
    expect(prompt.toLowerCase()).toContain("weakeningevidence");
  });

  it("never mentions Groq by name (provider-neutral prompt text)", () => {
    const prompt = buildIssueSystemPrompt();
    expect(prompt.toLowerCase()).not.toContain("groq");
  });

  it("the JSON schema requires exactly the 9 contract fields, no more and no fewer", () => {
    const required = [...ISSUE_RESPONSE_JSON_SCHEMA.schema.required].sort();
    expect(required).toEqual([...REQUIRED_FIELDS].sort());

    const properties = Object.keys(ISSUE_RESPONSE_JSON_SCHEMA.schema.properties).sort();
    expect(properties).toEqual([...REQUIRED_FIELDS].sort());
    expect(ISSUE_RESPONSE_JSON_SCHEMA.schema.additionalProperties).toBe(false);
  });

  it("has a bumped PROMPT_VERSION reflecting the schema change", () => {
    expect(ISSUE_PROMPT_VERSION).not.toBe("v1");
  });
});
