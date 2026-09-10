import type { AiFollowUpResponse, AiPatternResponse, ApiErrorBody, Investigation, Pattern, PriorityPatternsResponse, RiskEvent } from "../types/pattern";
import type { AiIssueResponse, IssueDetailResponse, IssuesListResponse, IssueFollowUpResponse } from "../types/issue";
import { resolveApiBase } from "./apiBase";

/**
 * Component 4 calls its own backend only — never Groq directly, and never
 * reads a Groq key from localStorage (unlike Components 1-3's
 * browser-side LLMClient).
 */
const API_BASE = resolveApiBase();

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

async function postQuestion<T>(path: string, question: string): Promise<T> {
  let res: Response;
  try { res = await fetch(`${API_BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }); }
  catch { throw new ApiError("Could not reach the Pattern Intelligence backend — is it running?", 0); }
  if (!res.ok) throw new ApiError(await readErrorMessage(res, `AI request failed (${res.status})`), res.status);
  return (await res.json()) as T;
}

export function fetchPatternFollowUp(patternId: string, question: string): Promise<AiFollowUpResponse> {
  return postQuestion(`/api/ai/pattern/${encodeURIComponent(patternId)}/follow-up`, question);
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

export function fetchIssueFollowUp(issueSlug: string, question: string): Promise<IssueFollowUpResponse> {
  return postQuestion(`/api/ai/issue/${encodeURIComponent(issueSlug)}/follow-up`, question);
}
