export type PatternType =
  | "issue"
  | "organisation_issue"
  | "owner_issue"
  | "assignee_issue"
  | "cross_organisation_issue";

export interface RiskPattern {
  patternId: string;
  patternType: PatternType;
  eventIds: string[];
  group: Record<string, string>;
  organisations?: string[];
}

export interface RiskPatternsFile {
  schemaVersion: number;
  calculationPolicy: string;
  patterns: RiskPattern[];
}
