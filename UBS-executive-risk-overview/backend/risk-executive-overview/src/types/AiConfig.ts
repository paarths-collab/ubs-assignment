export interface RiskAiConfig {
  schemaVersion: number;
  component: string;
  mode: string;
  purpose: string;
  assistantRole: string;
  allowedInputFields: string[];
  factRules: {
    sourceOfTruth: string;
    llmMayCalculateMetrics: boolean;
    llmMayInferMissingFacts: boolean;
    llmMayInventEventIds: boolean;
    missingDataInstruction: string;
    financialRule: string;
    peopleRule: string;
  };
  interpretationRules: Array<{ case: string; language: string }>;
  systemPromptTemplate: string;
  responseSchema: Record<string, unknown>;
  outputStyle: {
    audience: string;
    tone: string;
    avoid: string[];
  };
  prototypeActions: string[];
  auditRequirements: string[];
}
