import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileRewrites, compileSource, loadRewrites, matchRewrite } from "../../scripts/serve-local.js";

const VERCEL_JSON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../vercel.json");

/**
 * Driven by the real vercel.json so a rewrite edit that changes routing
 * behaviour fails here rather than only on a Vercel preview deploy.
 */
describe("vercel.json rewrites (local matcher)", () => {
  const rules = loadRewrites(VERCEL_JSON);

  it.each(["/", "/streamgraph", "/patterns", "/graph", "/issues", "/issues/some-slug", "/apiary"])(
    "%s -> the stream SPA (/index.html)",
    (pathname) => {
      expect(matchRewrite(rules, pathname)).toBe("/index.html");
    },
  );

  it.each(["/kpi", "/kpi/x/y"])("%s -> the KPI SPA (/kpi.html)", (pathname) => {
    expect(matchRewrite(rules, pathname)).toBe("/kpi.html");
  });

  it.each(["/api/patterns/priority", "/api/ai/follow-up/stream", "/api/health"])(
    "%s -> /api/handler",
    (pathname) => {
      expect(matchRewrite(rules, pathname)).toBe("/api/handler");
    },
  );

  it("does not SPA-rewrite assets or the KPI html file (the lookahead excludes them)", () => {
    expect(matchRewrite(rules, "/assets/missing.js")).toBeNull();
    expect(matchRewrite(rules, "/kpi.html")).toBeNull();
  });

  it("matches the query-less pathname only (callers strip the query)", () => {
    expect(matchRewrite(rules, "/api/patterns/priority")).toBe("/api/handler");
  });

  it("no longer sends /issues to the KPI app", () => {
    expect(rules.some((rule) => rule.source === "/issues")).toBe(false);
  });
});

describe("rewrite source compiler", () => {
  it.each(["/api/:path*", "/a/(\\d+)", "/(foo|bar)", "/x/[id]", "api/(.*)", "/((?!api/|a b).*)", "/((?!api/).+)"])(
    "throws a clear error for unsupported source %s",
    (source) => {
      expect(() => compileSource(source)).toThrow(/Unsupported rewrite source/);
    },
  );

  it("throws for an unsupported source inside a whole rewrites list", () => {
    expect(() => compileRewrites([{ source: "/ok", destination: "/index.html" }, { source: "/:id", destination: "/x" }])).toThrow(
      /Unsupported rewrite source "\/:id"/,
    );
  });

  it("throws for destinations that rely on captures", () => {
    expect(() => compileRewrites([{ source: "/a/(.*)", destination: "/b/$1" }])).toThrow(/Unsupported rewrite destination/);
  });

  it("anchors literal sources exactly", () => {
    const rules = compileRewrites([{ source: "/kpi", destination: "/kpi.html" }]);
    expect(matchRewrite(rules, "/kpi")).toBe("/kpi.html");
    expect(matchRewrite(rules, "/kpix")).toBeNull();
    expect(matchRewrite(rules, "/kpi/x")).toBeNull();
  });

  it("applies rules in order (first match wins)", () => {
    const rules = compileRewrites([
      { source: "/a/(.*)", destination: "/first.html" },
      { source: "/a/b", destination: "/second.html" },
    ]);
    expect(matchRewrite(rules, "/a/b")).toBe("/first.html");
  });
});
