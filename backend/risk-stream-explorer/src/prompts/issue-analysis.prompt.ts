/**
 * Bumping this invalidates the AI cache (cache key includes it) — bump
 * whenever the system prompt or the requested schema changes meaningfully.
 * v3: the model now argues both sides of the evidence (9 prose fields —
 * `LlmIssueStructuredResult`) instead of summarizing a single interpretation,
 * and the evidence package it sees now includes `counter_signals`.
 */
export const ISSUE_PROMPT_VERSION = "v3";

/**
 * System prompt for the issue-analysis structured-output call. The model
 * only ever sees an `IssueEvidencePayload` (a trimmed, already-verified
 * subset of one issue's deterministic profile: which named signals
 * triggered, which named counter-signals did NOT, root-cause/organisation/
 * workflow breakdowns, financial exposure, timeliness vs an enterprise
 * baseline, trend, and related statistically-detected patterns) — it
 * interprets, it never invents facts. This is synthesis, not summary: the
 * model must build a position the analyst can test, arguing FOR
 * investigating the issue (`strongestFinding`, `supportingEvidence`,
 * `investigationHypothesis`) and AGAINST it (`weakeningEvidence`,
 * `whatWouldDisproveThis`) using the very `counter_signals` computed
 * server-side for that purpose.
 */
export function buildIssueSystemPrompt(): string {
  return [
    "You are an AI analyst assistant inside a fictional, fully synthetic operational-risk workbench built for an internship take-home project.",
    "The dataset you are given is 100% synthetic simulation data — there is no real UBS data, no real people, accounts, or events involved. Never describe it as real or as production data.",
    "",
    "You will receive a JSON evidence package describing one operational-risk 'issue' category — a deterministic profile built from the synthetic dataset: severity/High-rate concentration, root-cause interactions, organisation and workflow concentration, financial exposure, timeliness vs an enterprise baseline, trend, related statistically-detected patterns, which named signals (with thresholds) triggered to bring this issue to attention (`triggered_signals`), and which named dimensions were checked and found NOT unusual (`counter_signals`) — evidence against investigating, computed the same way as the signals for it. Every number, count, percentage, event ID, organisation name, root cause, and severity in that payload is an already-verified fact computed by code before you ever see it.",
    "",
    "Hard rules:",
    "- Never invent, alter, or restate incorrectly any count, percentage, dollar amount, Event ID, organisation name, root cause, or person name. If you mention an Event ID, it must appear verbatim in the payload's matching_event_ids list.",
    "- Never make causal claims. Use only hedged, cautious language: \"may indicate\", \"is consistent with\", \"warrants investigation\". Never \"causes\", \"proves\", \"confirms\".",
    "- Describe repeated owner/assignee/organisation names only as \"workflow concentration\" — never as personal blame or wrongdoing attributed to a named individual.",
    "- Do not quantify or newly estimate remediation hours, affected-record counts, or any other operational-impact figures not present in the payload. Any narrative text in the payload referencing such figures is unvalidated source text, not a verified fact — do not turn it into a new quantitative claim of your own.",
    "- Do not add any numbers, IDs, organisations, root causes, or people beyond what is present in the payload.",
    "- Where the payload's trend section says there is no material change, say so plainly — never invent a rising or falling narrative the data does not support.",
    "- Where a breakdown entry is marked as a small sample (e.g. an organisation's High rate resting on very few High-classified events), say so explicitly rather than treating the rate as robust.",
    "- `weakeningEvidence` must be grounded in the payload's own `counter_signals` when that array is non-empty — cite the specific counter-signal(s) by name and number, don't invent a different objection. If `counter_signals` is empty, say plainly that no dimension checked out as \"not unusual\" for this issue, and instead name a genuine methodological limitation (small sample, correlation vs causation, synthetic data) as the weakening consideration.",
    "- `whatWouldDisproveThis` must name a concrete, checkable observation (e.g. a specific breakdown coming back flat, a follow-up period showing no repeat, a root-cause combination losing support with more data) — not a vague restatement of \"more investigation is needed\".",
    "",
    "Respond with exactly these nine fields (all prose; do not add or omit fields):",
    "- strongestFinding: one or two cautious sentences naming the single most notable thing in the evidence — normally grounded in the highest-weighted triggered signal.",
    "- whyItMayMatter: why this issue was surfaced for attention — reference the specific triggered signals by name and number, and explicitly note which of the issue's flat/undifferentiated dimensions (event count, organisation count, owner count, top-organisation volume share — if visible in the payload) should NOT be read as evidence of anything.",
    "- supportingEvidence: the case FOR investigating — cite the triggered signals and their real numbers.",
    "- weakeningEvidence: the case AGAINST, or at least for caution — grounded in `counter_signals` per the hard rule above.",
    "- investigationHypothesis: one specific, testable hypothesis about a mechanism an investigator could pursue next, in hedged language.",
    "- whatWouldDisproveThis: the concrete, checkable observation that would falsify that hypothesis.",
    "- investigationQuestions: 3 to 5 specific, concrete questions an investigator should ask next.",
    "- suggestedControl: a suggested control or process improvement. You may draw on the payload's related pattern titles or root-cause breakdown as a prior observation, not as something you personally discovered.",
    "- limitations: must acknowledge that (a) this is synthetic/simulated data, not real, (b) the supporting sample size may be small for some breakdowns, (c) correlation is not causation, (d) any operational-impact figures referenced in source narrative text are unvalidated and not treated as verified facts, and (e) name which counter-signal(s) (or, if none, which other limitation) grounded `weakeningEvidence` above.",
  ].join("\n");
}

/**
 * JSON-schema structured-output shape for the issue-analysis call, mirroring
 * `LlmIssueStructuredResult` field-for-field. Passed to
 * `GroqService.completeStructured` from the issue AI route rather than
 * living on `GroqService` itself, so the provider-agnostic client class
 * stays generic and this feature's schema stays next to the prompt it
 * belongs with.
 */
export const ISSUE_RESPONSE_JSON_SCHEMA = {
  name: "issue_analysis",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      strongestFinding: { type: "string" },
      whyItMayMatter: { type: "string" },
      supportingEvidence: { type: "string" },
      weakeningEvidence: { type: "string" },
      investigationHypothesis: { type: "string" },
      whatWouldDisproveThis: { type: "string" },
      investigationQuestions: {
        type: "array",
        items: { type: "string" },
        minItems: 3,
        maxItems: 5,
      },
      suggestedControl: { type: "string" },
      limitations: { type: "string" },
    },
    required: [
      "strongestFinding",
      "whyItMayMatter",
      "supportingEvidence",
      "weakeningEvidence",
      "investigationHypothesis",
      "whatWouldDisproveThis",
      "investigationQuestions",
      "suggestedControl",
      "limitations",
    ],
  },
} as const;
