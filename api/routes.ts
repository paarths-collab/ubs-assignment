/**
 * Which of the two backends owns a given `/api/*` path.
 *
 * Both Fastify apps register routes under `/api`, and their AI namespaces
 * overlap by prefix but not by route: `/api/ai/portfolio/stream` belongs to
 * the executive-overview (KPI) server while `/api/ai/streamgraph/period`
 * belongs to the stream-explorer (legacy) server. A prefix match on
 * `/api/ai` therefore cannot decide this — the table below is matched
 * segment by segment instead.
 */
export type Backend = "kpi" | "legacy";

/**
 * Second path segment after `/api` (or after `/api/ai`) that the legacy
 * stream-explorer server owns. Everything not listed falls through to the
 * KPI server, which is the primary application.
 */
const LEGACY_TOP_LEVEL = new Set(["patterns", "issues", "events", "investigations"]);
const LEGACY_AI = new Set(["analyse", "query", "issue", "pattern", "streamgraph"]);

/**
 * Resolves the owning backend from a request URL.
 *
 * Takes the raw `req.url` (path plus query string) rather than a parsed path
 * so callers cannot forget to strip the query — `/api/issues?limit=5` must
 * resolve the same as `/api/issues`.
 */
export function resolveBackend(rawUrl: string | undefined): Backend {
  const path = (rawUrl ?? "/").split("?")[0] ?? "/";
  const segments = path.split("/").filter(Boolean);

  // segments: ["api", <first>, <second>, ...]
  if (segments[0] !== "api") return "kpi";

  const first = segments[1];
  if (first === undefined) return "kpi";

  if (first === "ai") {
    const second = segments[2];
    return second !== undefined && LEGACY_AI.has(second) ? "legacy" : "kpi";
  }

  return LEGACY_TOP_LEVEL.has(first) ? "legacy" : "kpi";
}
