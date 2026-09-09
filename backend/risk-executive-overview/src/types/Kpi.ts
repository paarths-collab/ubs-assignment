export type KpiUnit = "events" | "USD" | "ratio" | "hours";

export interface KpiValue {
  value: number | null;
  applicable: boolean;
  unit: KpiUnit;
}

export interface KpiSet {
  totalEvents: KpiValue;
  highSeverityEvents: KpiValue;
  openBacklog: KpiValue;
  grossExposure: KpiValue;
  netExposure: KpiValue;
  recoveryRate: KpiValue;
  potentialImpact: KpiValue;
  remediationHours: KpiValue;
}

export interface Distributions {
  severity: Record<string, number>;
  status: Record<string, number>;
  eventType: Record<string, number>;
}
