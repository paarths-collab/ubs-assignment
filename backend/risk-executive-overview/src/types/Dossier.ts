import type { NormalizedFilters } from "../schemas/filters.schema";
import type { BreakdownRow, ScenarioAnalytics } from "./Scenario";

/** Period-over-period movement, computed by splitting the filtered window in half. */
export interface TrendFacts {
  firstPeriod: { from: string; to: string; eventCount: number; highSeverityCount: number; openEventCount: number };
  secondPeriod: { from: string; to: string; eventCount: number; highSeverityCount: number; openEventCount: number };
  eventCountChange: number;
  eventCountChangePct: number | null;
  highSeverityChange: number;
  direction: "increasing" | "decreasing" | "stable";
}

/** Where the selected issue sits against the other issues on one measure. Rank 1 = highest. */
export interface ComparisonMetric {
  value: number | null;
  rank: number;
  totalIssues: number;
  percentile: number;
  median: number | null;
}

export interface EnterpriseComparison {
  selectedIssue: string;
  totalIssues: number;
  metrics: Record<string, ComparisonMetric>;
}

export interface PeopleConcentration {
  uniqueOwners: number;
  repeatedOwners: number;
  uniqueAssignees: number;
  repeatedAssignees: number;
  maxEventsUnderOneOwner: number;
  maxEventsUnderOneAssignee: number;
}

/**
 * The complete verified fact package for one selected issue. Every number
 * here is calculated by TypeScript before any model call, and all three
 * analysis calls are grounded in this same object — no call ever treats
 * another call's prose as evidence.
 */
export interface RiskDossier {
  scenarioId: string;
  title: string;
  issueDetail: string;
  filters: NormalizedFilters;

  volume: ScenarioAnalytics["volume"];
  severity: { counts: Record<string, number>; highShare: number; highStillOpen: number };
  workflow: ScenarioAnalytics["workflow"];
  financial: ScenarioAnalytics["exposure"] & { concentration: ScenarioAnalytics["concentration"] };

  organisations: BreakdownRow[];
  people: PeopleConcentration;
  recurrence: ScenarioAnalytics["recurrence"];

  rootCauses: BreakdownRow[];
  riskThemes: Record<string, number>;
  orCategories: Record<string, number>;

  timeliness: ScenarioAnalytics["timeliness"];
  operationalBurden: ScenarioAnalytics["effort"];

  trend: TrendFacts | null;
  enterpriseComparison: EnterpriseComparison;

  evidence: { eventCount: number; eventIds: string[] };
}
