import { describe, expect, it } from "vitest";
import { resolveBackend } from "../routes.js";

/**
 * The bug this guards against: Vercel's filename catch-all only matched one
 * URL segment, so every two-segment AI route 404'd before reaching a
 * function. The gateway now owns dispatch, which makes this table the thing
 * that decides whether an endpoint works at all.
 */
describe("resolveBackend", () => {
  const KPI_ROUTES = [
    "/api/health",
    "/api/metadata",
    "/api/overview",
    "/api/priority-signals",
    "/api/risk-detail",
    "/api/actions",
    "/api/ai/dossier",
    "/api/ai/manager-insight",
    "/api/ai/deep-analysis/stream",
    "/api/ai/investigation-plan/stream",
    "/api/ai/enterprise-comparison/stream",
    "/api/ai/portfolio/stream",
    "/api/ai/follow-up/stream",
  ];

  const LEGACY_ROUTES = [
    "/api/patterns/priority",
    "/api/patterns/pattern_abc123",
    "/api/issues",
    "/api/issues/some-slug",
    "/api/events/SIM-0000001",
    "/api/investigations/pattern_abc123",
    "/api/ai/analyse",
    "/api/ai/query",
    "/api/ai/issue/some-slug",
    "/api/ai/issue/some-slug/follow-up",
    "/api/ai/pattern/pattern_abc123",
    "/api/ai/pattern/pattern_abc123/follow-up",
    "/api/ai/streamgraph/period",
    "/api/ai/streamgraph/event",
  ];

  it.each(KPI_ROUTES)("routes %s to the KPI backend", (path) => {
    expect(resolveBackend(path)).toBe("kpi");
  });

  it.each(LEGACY_ROUTES)("routes %s to the legacy backend", (path) => {
    expect(resolveBackend(path)).toBe("legacy");
  });

  it("ignores the query string", () => {
    expect(resolveBackend("/api/issues?limit=5")).toBe("legacy");
    expect(resolveBackend("/api/overview?x=1")).toBe("kpi");
  });

  it("keeps the two ai/* namespaces apart at the same depth", () => {
    // Both are `/api/ai/<name>/stream`-shaped but belong to different servers;
    // a prefix match on `/api/ai` would send one of them to the wrong backend.
    expect(resolveBackend("/api/ai/portfolio/stream")).toBe("kpi");
    expect(resolveBackend("/api/ai/streamgraph/period")).toBe("legacy");
  });

  it("falls back to the KPI backend for unknown and malformed paths", () => {
    expect(resolveBackend("/api/unknown")).toBe("kpi");
    expect(resolveBackend("/api")).toBe("kpi");
    expect(resolveBackend("/")).toBe("kpi");
    expect(resolveBackend(undefined)).toBe("kpi");
  });
});
