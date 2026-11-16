export interface RiskConfig {
  schemaVersion: number;
  component: string;
  recordCount: number;
  globalDateField: string;
  dateRange: { min: string; max: string };
  filters: {
    organisations: string[];
    eventTypes: string[];
    severities: string[];
    statuses: string[];
    stages: string[];
    rootCauses: string[];
    riskThemes: string[];
    orCategories: string[];
  };
  businessRules: {
    openBacklog: {
      definition: string;
      excludedStatuses: string[];
    };
    financialAmounts: {
      financialEventType: string;
      nonFinancialStructuralNullFields: string[];
      missingAmountBehaviour: string;
    };
    recoveryRate: {
      formula: string;
      scope: string;
      zeroGrossBehaviour: string;
    };
    remediationHours: {
      authoritativeSource: string;
      parsedField: string;
      auditSource: string;
      reason: string;
    };
    peopleRecurrence: {
      interpretation: string;
    };
  };
  kpis: Array<{ id: string; label: string; calculation: string }>;
}
