"use client";

import { useEffect, useState } from "react";
// Wire contracts are type-only imports; backend implementation is never bundled.
export type { IssueSummary, IssuesListResponse, IssueDetailResponse, TriggeredSignal, CounterSignal } from "../../../../../../backend/risk-stream-explorer/src/types/Issue";
export type { Pattern } from "../../../../../../backend/risk-stream-explorer/src/types/Pattern";
export type { Investigation } from "../../../../../../backend/risk-stream-explorer/src/types/Investigation";
export type { RiskEvent } from "../../../../../../backend/risk-stream-explorer/src/types/RiskEvent";
import type { Pattern } from "../../../../../../backend/risk-stream-explorer/src/types/Pattern";
export type PatternsResponse = { patterns: Pattern[]; count: number };
export type Selection = { kind: "issue" | "pattern" | "event"; id: string };

export function useEvidence<T>(path: string, attempt = 0) {
  const key = `${path}:${attempt}`;
  const [result, setResult] = useState<{ key: string; data?: T; error?: string }>({ key: "" });
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(`/api/operational/${path}`, { signal: controller.signal, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error?.message ?? `Could not load evidence (${response.status}).`);
        if (!controller.signal.aborted) setResult({ key, data: payload as T });
      } catch (error) {
        if (!controller.signal.aborted) setResult({ key, error: error instanceof Error ? error.message : "Could not reach the evidence service." });
      }
    })();
    return () => controller.abort();
  }, [path, key]);
  return result.key === key ? { ...result, loading: false } : { key, data: undefined, error: undefined, loading: true };
}
export const count = (value: number) => value.toLocaleString("en-US");
export const decimal = (value: number | null, digits = 1) => value === null ? "Not available" : value.toLocaleString("en-US", { maximumFractionDigits: digits });
export const money = (value: number | null) => value === null ? "Not applicable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value);
export function selectionPath(selection: Selection): string {
  return `${selection.kind === "issue" ? "issues" : selection.kind === "pattern" ? "investigations" : "events"}/${encodeURIComponent(selection.id)}`;
}
