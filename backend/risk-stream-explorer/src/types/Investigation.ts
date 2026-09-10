import type { Pattern, PatternComparedWithEnterprise } from "./Pattern";
import type { EnterpriseBaseline, RiskEvent } from "./RiskEvent";

/** Response body of `GET /api/investigations/:patternId`. */
export interface Investigation {
  pattern: Pattern;
  enterpriseComparison: PatternComparedWithEnterprise;
  graphFilter: Record<string, string[]>;
  deterministicSummary: string;
  matchingEvents: RiskEvent[];
  enterprise: EnterpriseBaseline;
}

/** The four fields Groq is allowed to produce — everything else in the AI
 * route response comes from already-verified deterministic facts. */
export interface GroqStructuredResult {
  interpretation: string;
  investigationQuestions: string[];
  suggestedControl: string;
  limitations: string;
}

/** Deterministic facts echoed back alongside (or instead of) the AI result. */
export interface ObservedFacts {
  patternId: string;
  title: string;
  priorityLevel: string;
  priorityReasons: string[];
  observed: Pattern["observed"];
  comparedWithEnterprise: PatternComparedWithEnterprise;
}

/** Response body of `POST /api/ai/pattern/:patternId`. */
/** `provider`/`model` name the model that actually produced the text — see AiIssueResponse. */
export type AiPatternResponse =
  | {
      status: "ok";
      observed: ObservedFacts;
      matchingEventIds: string[];
      ai: GroqStructuredResult;
      cached: boolean;
      provider: string;
      model: string;
    }
  | {
      status: "fallback";
      observed: ObservedFacts;
      matchingEventIds: string[];
      ai: null;
      message: string;
      provider: string;
      model: string;
    };
