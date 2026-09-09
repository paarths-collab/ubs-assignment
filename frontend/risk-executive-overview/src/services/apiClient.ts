import type {
  ActionApiResponse,
  ActionType,
  ApiErrorBody,
  FilterInput,
  ManagerInsightApiResponse,
  Metadata,
  OverviewResponse,
  PriorityResponse,
  RiskDetailApiResponse,
  RiskDetailSelection,
} from "../types";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(body?.error.code ?? "UNKNOWN", body?.error.message ?? response.statusText, response.status);
  }

  return response.json() as Promise<T>;
}

export function getMetadata(): Promise<Metadata> {
  return request<Metadata>("/metadata");
}

export function getHealth(): Promise<{ status: string; dataLoaded: boolean; eventCount: number; aiConfigured: boolean }> {
  return request("/health");
}

export function postOverview(filters: FilterInput): Promise<OverviewResponse> {
  return request<OverviewResponse>("/overview", { method: "POST", body: JSON.stringify({ filters }) });
}

/** Scenarios are consolidated per underlying issue (15 in this dataset); the UI collapses to the top 3. */
export function postPrioritySignals(filters: FilterInput, limit = 15): Promise<PriorityResponse> {
  return request<PriorityResponse>("/priority-signals", { method: "POST", body: JSON.stringify({ filters, limit }) });
}

export function postRiskDetail(filters: FilterInput, selection: RiskDetailSelection): Promise<RiskDetailApiResponse> {
  return request<RiskDetailApiResponse>("/risk-detail", { method: "POST", body: JSON.stringify({ filters, selection }) });
}

export function postManagerInsight(filters: FilterInput, selection: RiskDetailSelection): Promise<ManagerInsightApiResponse> {
  return request<ManagerInsightApiResponse>("/ai/manager-insight", {
    method: "POST",
    body: JSON.stringify({ filters, selection }),
  });
}

export function postAction(
  actionType: ActionType,
  eventIds: string[],
  patternId: string | null,
): Promise<ActionApiResponse> {
  return request<ActionApiResponse>("/actions", {
    method: "POST",
    body: JSON.stringify({ actionType, eventIds, patternId }),
  });
}
