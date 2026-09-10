/** Where the backend lives. Overridable so the built HTML can point at a deployed API. */
// Component 3's Fastify backend defaults to :3001. Keep the override so a
// deployed/static build can point at another API, but make the local default
// match the actual server instead of failing with a misleading network error.
const DEFAULT_API_BASE = "http://localhost:3001";

declare global {
  interface Window {
    RISK_NETWORK_API_BASE?: string;
  }
}

export function getApiBase(): string {
  return (window.RISK_NETWORK_API_BASE ?? DEFAULT_API_BASE).replace(/\/$/, "");
}

export interface AiObservation {
  statement: string;
  evidenceEventIds: string[];
}

export interface AiInterpretation {
  statement: string;
  confidence: "low" | "medium" | "high";
}

export interface AiRecommendedAction {
  action: string;
  reason: string;
}

export interface AiAnalysis {
  summary: string;
  observations: AiObservation[];
  interpretations: AiInterpretation[];
  investigationQuestions: string[];
  recommendedActions: AiRecommendedAction[];
  limitations: string[];
}

export interface VerifiedFacts {
  scope: { eventCount: number; requestedEventCount: number; droppedEventCount: number };
  selectedNode: { id: string; type: string; label: string } | null;
  severityCounts: Record<string, number>;
  eventTypeCounts: { financial: number; nonFinancial: number };
  actualExposure: Record<"gross" | "recovery" | "net", { total: number | null; contributingCount: number }>;
  potentialExposure: { total: number | null; contributingCount: number };
  evidenceEventIds: string[];
}

export interface AnalyseResponse {
  requestId: string;
  generatedAt: string;
  model: string;
  verifiedFacts: VerifiedFacts;
  analysis: AiAnalysis;
}

export class AiRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AiRequestError";
  }
}

export interface AnalyseInput {
  selectedNodeId: string | null;
  eventIds: string[];
  question?: string;
}

export interface FilterIntent {
  eventType?: "Financial" | "Non-Financial";
  severity?: "Low" | "Moderate" | "High";
  ownerOrganisation?: string;
  occurrenceYear?: string;
  recordingDelayMin?: number;
  issueContains?: string;
}

export async function requestFilterIntent(question: string, signal: AbortSignal): Promise<FilterIntent> {
  const response = await fetch(`${getApiBase()}/api/ai/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  const payload = (await response.json().catch(() => null)) as { intent?: FilterIntent; error?: { message?: string } } | null;
  if (!response.ok || !payload?.intent) throw new AiRequestError(payload?.error?.message ?? "AI query unavailable", "QUERY_UNAVAILABLE", response.status);
  return payload.intent;
}

/**
 * Sends only the investigation *scope* — which events, which node — never
 * computed metrics: the backend recomputes every figure from canonical
 * data. The caller passes an AbortSignal so a scope change can cancel an
 * in-flight request rather than letting a stale answer land.
 */
export async function requestAnalysis(input: AnalyseInput, signal: AbortSignal): Promise<AnalyseResponse> {
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}/api/ai/analyse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selectedNodeId: input.selectedNodeId,
        eventIds: input.eventIds,
        ...(input.question ? { question: input.question } : {}),
      }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new AiRequestError(
      "Could not reach the analysis service. Your graph and deterministic evidence remain fully usable.",
      "NETWORK_ERROR",
      0,
    );
  }

  const payload = (await response.json().catch(() => null)) as
    | AnalyseResponse
    | { error?: { code?: string; message?: string } }
    | null;

  if (!response.ok) {
    const failure = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new AiRequestError(
      failure?.message ?? "AI analysis is unavailable.",
      failure?.code ?? "UNKNOWN",
      response.status,
    );
  }

  return payload as AnalyseResponse;
}
