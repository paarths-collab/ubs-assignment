import { describe, expect, it } from "vitest";
import { validateGroqResult } from "../src/services/AIValidationService";

const ALLOWED_IDS = ["SIM-0000025", "SIM-0000130"];

const VALID_RESULT = {
  interpretation: "This pattern may indicate a workflow gap.",
  investigationQuestions: ["What changed in the intake process?", "Is this concentrated in one team?", "When did volume start rising?"],
  suggestedControl: "Add an independent verification step before submission.",
  limitations: "This is synthetic data, sample size is small, and correlation is not causation.",
};

describe("validateGroqResult", () => {
  it("accepts a well-formed response with no fabricated event ids", () => {
    const outcome = validateGroqResult(VALID_RESULT, ALLOWED_IDS);
    expect(outcome.valid).toBe(true);
    if (outcome.valid) {
      expect(outcome.result.interpretation).toBe(VALID_RESULT.interpretation);
    }
  });

  it("accepts a response that cites only allowed event ids", () => {
    const result = { ...VALID_RESULT, interpretation: "See SIM-0000025 for an example." };
    const outcome = validateGroqResult(result, ALLOWED_IDS);
    expect(outcome.valid).toBe(true);
  });

  it("rejects a response that cites an event id outside matching_event_ids (hallucinated evidence)", () => {
    const result = { ...VALID_RESULT, suggestedControl: "Review SIM-9999999 closely." };
    const outcome = validateGroqResult(result, ALLOWED_IDS);
    expect(outcome.valid).toBe(false);
    if (!outcome.valid) {
      expect(outcome.reason).toContain("SIM-9999999");
    }
  });

  it("rejects a response missing a required field", () => {
    const { interpretation: _interpretation, ...rest } = VALID_RESULT;
    const outcome = validateGroqResult(rest, ALLOWED_IDS);
    expect(outcome.valid).toBe(false);
  });

  it("rejects a response with too few investigation questions", () => {
    const result = { ...VALID_RESULT, investigationQuestions: ["Only one question?"] };
    const outcome = validateGroqResult(result, ALLOWED_IDS);
    expect(outcome.valid).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(validateGroqResult("not json", ALLOWED_IDS).valid).toBe(false);
    expect(validateGroqResult(null, ALLOWED_IDS).valid).toBe(false);
    expect(validateGroqResult(undefined, ALLOWED_IDS).valid).toBe(false);
  });
});
