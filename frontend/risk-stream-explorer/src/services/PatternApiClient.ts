import type { AiPatternResponse, ApiErrorBody, Investigation, Pattern, PriorityPatternsResponse, RiskEvent } from "../types/pattern";
import type { AiIssueResponse, IssueDetailResponse, IssuesListResponse } from "../types/issue";

/**
 * Component 4 calls its own backend only — never Groq directly, and never
 * reads a Groq key from localStorage (unlike Components 1-3's
 * browser-side LLMClient). `VITE_API_BASE_URL` is a build-time public value
 * (just an origin), not a secret.
 */
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as ApiErrorBody;
    return body?.error?.message ?? fallback;
  } catch {
    return fallback;
  }
}

async function getJson<T>(path: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`);
  } catch {
    throw new ApiError("Could not reach the Pattern Intelligence backend — is it running?", 0);
  }
  if (!res.ok) {
    throw new ApiError(await readErrorMessage(res, `Request failed (${res.status})`), res.status);
  }
  return (await res.json()) as T;
}

export function fetchPriorityPatterns(): Promise<PriorityPatternsResponse> {
  return getJson("/api/patterns/priority");
}

export function fetchPattern(patternId: string): Promise<Pattern> {
  return getJson(`/api/patterns/${encodeURIComponent(patternId)}`);
}

export function fetchInvestigation(patternId: string): Promise<Investigation> {
  return getJson(`/api/investigations/${encodeURIComponent(patternId)}`);
}

export function fetchEvent(eventId: string): Promise<RiskEvent> {
  return getJson(`/api/events/${encodeURIComponent(eventId)}`);
}

export async function fetchAiAnalysis(patternId: string): Promise<AiPatternResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/ai/pattern/${encodeURIComponent(patternId)}`, { method: "POST" });
  } catch {
    throw new ApiError("Could not reach the Pattern Intelligence backend — is it running?", 0);
  }
  if (!res.ok) {
    throw new ApiError(await readErrorMessage(res, `AI request failed (${res.status})`), res.status);
  }
  return (await res.json()) as AiPatternResponse;
}

// ---------- Issue intelligence ----------

export function fetchRankedIssues(): Promise<IssuesListResponse> {
  return getJson("/api/issues");
}

export function fetchIssueDetail(issueSlug: string): Promise<IssueDetailResponse> {
  return getJson(`/api/issues/${encodeURIComponent(issueSlug)}`);
}

export async function fetchIssueAiAnalysis(issueSlug: string): Promise<AiIssueResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/ai/issue/${encodeURIComponent(issueSlug)}`, { method: "POST" });
  } catch {
    throw new ApiError("Could not reach the Pattern Intelligence backend — is it running?", 0);
  }
  if (!res.ok) {
    throw new ApiError(await readErrorMessage(res, `AI request failed (${res.status})`), res.status);
  }
  return (await res.json()) as AiIssueResponse;
}
