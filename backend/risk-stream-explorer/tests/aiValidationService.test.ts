import { describe, expect, it } from "vitest";
import { validateGroqIssueResult, validateGroqResult } from "../src/services/AIValidationService";

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

const VALID_ISSUE_RESULT = {
  strongestFinding: "The strongest finding is a root-cause concentration, though on a limited sample.",
  whyItMayMatter: "The strong root-cause interaction signal is elevated for this issue.",
  supportingEvidence: "The triggered signals show an elevated High rate combined with one root cause.",
  weakeningEvidence: "The detection-delay counter-signal shows this issue sits at enterprise baseline for timeliness.",
  investigationHypothesis: "A control step tied to this root cause may be inconsistently applied.",
  whatWouldDisproveThis: "A larger sample showing the root-cause combination's lift falling below the enterprise baseline would disprove this.",
  investigationQuestions: ["What changed in the process?", "Is this concentrated with one team?", "When did it start?"],
  suggestedControl: "Add an independent verification step for this root cause.",
  limitations: "This is synthetic data, the sample is small, correlation is not causation, and the weakening evidence above is the detection-delay counter-signal.",
};

/**
 * `validateGroqIssueResult` guards the 9-field synthesis contract
 * (`LlmIssueStructuredResult`) that argues both for and against an issue's
 * evidence. These tests cover: a well-formed 9-field response, a response
 * missing one of the new fields (e.g. `weakeningEvidence` dropped entirely,
 * not just left blank), and the same hallucinated-Event-ID guard as the
 * pattern path.
 */
describe("validateGroqIssueResult", () => {
  it("accepts a well-formed 9-field response with no fabricated event ids", () => {
    const outcome = validateGroqIssueResult(VALID_ISSUE_RESULT, ALLOWED_IDS);
    expect(outcome.valid).toBe(true);
    if (outcome.valid) {
      expect(outcome.result.strongestFinding).toBe(VALID_ISSUE_RESULT.strongestFinding);
      expect(outcome.result.weakeningEvidence).toBe(VALID_ISSUE_RESULT.weakeningEvidence);
    }
  });

  it("accepts a response that cites only allowed event ids", () => {
    const result = { ...VALID_ISSUE_RESULT, supportingEvidence: "See SIM-0000025 for an example." };
    const outcome = validateGroqIssueResult(result, ALLOWED_IDS);
    expect(outcome.valid).toBe(true);
  });

  it("rejects a response that cites an event id outside matching_event_ids (hallucinated evidence)", () => {
    const result = { ...VALID_ISSUE_RESULT, whatWouldDisproveThis: "Review SIM-9999999 closely." };
    const outcome = validateGroqIssueResult(result, ALLOWED_IDS);
    expect(outcome.valid).toBe(false);
    if (!outcome.valid) {
      expect(outcome.reason).toContain("SIM-9999999");
    }
  });

  it("rejects a response missing weakeningEvidence (the case-against field)", () => {
    const { weakeningEvidence: _weakeningEvidence, ...rest } = VALID_ISSUE_RESULT;
    const outcome = validateGroqIssueResult(rest, ALLOWED_IDS);
    expect(outcome.valid).toBe(false);
  });

  it("rejects a response missing whatWouldDisproveThis (the falsifiability field)", () => {
    const { whatWouldDisproveThis: _whatWouldDisproveThis, ...rest } = VALID_ISSUE_RESULT;
    const outcome = validateGroqIssueResult(rest, ALLOWED_IDS);
    expect(outcome.valid).toBe(false);
  });

  it("rejects the old 5-field shape now that the contract requires all 9 fields", () => {
    const legacyShape = {
      interpretation: "This may indicate a workflow gap worth investigating.",
      whyItMayMatter: "x",
      investigationQuestions: ["a", "b", "c"],
      suggestedControl: "x",
      limitations: "y",
    };
    const outcome = validateGroqIssueResult(legacyShape, ALLOWED_IDS);
    expect(outcome.valid).toBe(false);
  });

  it("rejects a response with too few investigation questions", () => {
    const result = { ...VALID_ISSUE_RESULT, investigationQuestions: ["Only one question?"] };
    const outcome = validateGroqIssueResult(result, ALLOWED_IDS);
    expect(outcome.valid).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(validateGroqIssueResult("not json", ALLOWED_IDS).valid).toBe(false);
    expect(validateGroqIssueResult(null, ALLOWED_IDS).valid).toBe(false);
    expect(validateGroqIssueResult(undefined, ALLOWED_IDS).valid).toBe(false);
  });
});
