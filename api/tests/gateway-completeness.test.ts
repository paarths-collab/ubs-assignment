import diagnosticsChannel from "node:diagnostics_channel";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { resolveBackend, type Backend } from "../routes.js";

// The KPI backend's env.ts imports dotenv/config; keep a developer's .env out of this test.
vi.mock("dotenv/config", () => ({}));

/**
 * Every `/api/*` route that either Fastify app registers must be dispatched
 * by `resolveBackend` to the app that registers it. routes.test.ts only
 * checks literal lists; this builds the real apps and asks them.
 *
 * Fastify publishes each new instance on the `fastify.initialization`
 * diagnostics channel *before* any route is registered, which is the only
 * way to attach an `onRoute` hook to `buildApp()` output without editing the
 * backends (the legacy buildApp is async and registers routes inside it).
 */

interface RouteRecord {
  method: string;
  url: string;
}

/**
 * Paths BOTH apps register. `resolveBackend` can only pick one, so each is
 * listed here with its documented owner; the test fails if a path becomes
 * shared without being listed, or if the listed owner is not what the
 * gateway returns.
 *
 *  - /api/health: owned by the KPI app (the primary application). The
 *    legacy app's health route is unreachable through the gateway by design.
 */
const SHARED_PATH_OWNER: Record<string, Backend> = {
  "/api/health": "kpi",
};

const SAMPLE_PARAM = "sample-id";

function sampleUrl(url: string): string {
  return url.replace(/:([A-Za-z0-9_]+)(\([^)]*\))?/g, SAMPLE_PARAM).replace(/\*/g, SAMPLE_PARAM);
}

async function collectRoutes(build: () => Promise<FastifyInstance>): Promise<RouteRecord[]> {
  const routes: RouteRecord[] = [];
  const onInit = (message: unknown): void => {
    const instance = (message as { fastify: FastifyInstance }).fastify;
    instance.addHook("onRoute", (route) => {
      for (const method of [route.method].flat()) routes.push({ method: String(method), url: route.url });
    });
  };
  diagnosticsChannel.subscribe("fastify.initialization", onInit);
  let app: FastifyInstance;
  try {
    app = await build();
    await app.ready();
  } finally {
    diagnosticsChannel.unsubscribe("fastify.initialization", onInit);
  }
  await app.close();
  return routes;
}

describe("gateway completeness", () => {
  const registered: Record<Backend, RouteRecord[]> = { kpi: [], legacy: [] };
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const name of ["LOG_LEVEL"]) saved[name] = process.env[name];
    process.env.LOG_LEVEL = "silent";

    registered.kpi = await collectRoutes(async () => {
      const { buildApp } = await import("../../backend/risk-executive-overview/src/app.js");
      return buildApp();
    });
    registered.legacy = await collectRoutes(async () => {
      const { buildApp } = await import("../../backend/risk-stream-explorer/src/app.js");
      return buildApp({ serveBuiltFrontend: false });
    });
  }, 120_000);

  afterAll(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  const apiPaths = (backend: Backend): string[] => [
    ...new Set(registered[backend].map((r) => r.url).filter((url) => url.startsWith("/api/"))),
  ];

  it("discovers a non-trivial route set from both apps", () => {
    expect(apiPaths("kpi").length).toBeGreaterThanOrEqual(10);
    expect(apiPaths("legacy").length).toBeGreaterThanOrEqual(10);
    // These register only if their datasets load; a silent drop would make the
    // dispatch assertions below vacuous for them.
    expect(apiPaths("legacy")).toEqual(expect.arrayContaining(["/api/ai/analyse", "/api/ai/streamgraph/period"]));
  });

  it("dispatches every KPI route to the KPI app (shared paths excepted)", () => {
    const wrong = apiPaths("kpi")
      .filter((url) => !(url in SHARED_PATH_OWNER))
      .filter((url) => resolveBackend(sampleUrl(url)) !== "kpi");
    expect(wrong).toEqual([]);
  });

  it("dispatches every legacy route to the legacy app (shared paths excepted)", () => {
    const wrong = apiPaths("legacy")
      .filter((url) => !(url in SHARED_PATH_OWNER))
      .filter((url) => resolveBackend(sampleUrl(url)) !== "legacy");
    expect(wrong).toEqual([]);
  });

  it("lists every path registered by both apps in the shared-owner allowlist", () => {
    const legacy = new Set(apiPaths("legacy"));
    const shared = apiPaths("kpi").filter((url) => legacy.has(url));
    expect(shared.sort()).toEqual(Object.keys(SHARED_PATH_OWNER).sort());
  });

  it.each(Object.entries(SHARED_PATH_OWNER))("routes shared path %s to its documented owner (%s)", (url, owner) => {
    expect(resolveBackend(url)).toBe(owner);
  });

  it("samples query-string urls the same as bare paths", () => {
    for (const url of apiPaths("legacy")) {
      expect(resolveBackend(`${sampleUrl(url)}?x=1`)).toBe(resolveBackend(sampleUrl(url)));
    }
  });
});
