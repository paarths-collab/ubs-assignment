import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Hermeticity: the KPI backend's env.ts does `import "dotenv/config"`, which
 * would copy a developer's .env (and any provider keys in it) into
 * process.env at first import. Stubbing that import out, and deleting the
 * provider variables below, keeps these tests from ever being able to reach
 * an LLM provider. (Setting the keys to "" instead would NOT work: the KPI
 * env schema rejects an empty string for the *_API_KEY variables.)
 */
vi.mock("dotenv/config", () => {
  (globalThis as { __dotenvStubbed?: boolean }).__dotenvStubbed = true;
  return {};
});

import handler from "../handler.js";

/**
 * Exercises the REAL gateway (api/handler.ts) end to end over HTTP, building
 * both real Fastify apps from their on-disk datasets. Only deterministic
 * routes are called.
 */
const PROVIDER_ENV = ["LLM_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "OPENAI_API_KEY"];

describe("api/handler.ts (real backends)", () => {
  let server: Server;
  let base: string;
  const saved: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const name of [...PROVIDER_ENV, "LOG_LEVEL"]) saved[name] = process.env[name];
    for (const name of PROVIDER_ENV) delete process.env[name];
    process.env.LOG_LEVEL = "silent"; // read by the KPI backend's env at first import

    server = createServer((req, res) => {
      void handler(req, res);
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    // Warm both lazily-built apps once, with a generous budget (the first
    // legacy build can take close to a minute on a loaded machine), so the
    // per-test timeouts below can stay small.
    await fetch(`${base}/api/patterns/priority`);
    await fetch(`${base}/api/metadata`);
    expect((globalThis as { __dotenvStubbed?: boolean }).__dotenvStubbed).toBe(true);
  }, 180_000);

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("serves a legacy (stream-explorer) GET route as JSON", async () => {
    const res = await fetch(`${base}/api/patterns/priority`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toBeTypeOf("object");
  }, 20_000);

  it("serves a KPI (executive-overview) GET route as JSON", async () => {
    const res = await fetch(`${base}/api/metadata`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toBeTypeOf("object");
  }, 20_000);

  // Neither backend reads request.query for these paths, so a 200 would prove
  // nothing. Both 404 handlers echo the URL Fastify actually received, which
  // makes the exact req.url (path + query) observable: these fail if the
  // gateway strips or rewrites the query string.
  it("hands the exact url (with query) to the legacy backend", async () => {
    const res = await fetch(`${base}/api/patterns/a/b/c?x=1&y=two`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(JSON.stringify(await res.json())).toContain("/api/patterns/a/b/c?x=1&y=two");
  }, 20_000);

  it("hands the exact url (with query) to the KPI backend", async () => {
    const res = await fetch(`${base}/api/does-not-exist?x=1&y=two`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(JSON.stringify(await res.json())).toContain("/api/does-not-exist?x=1&y=two");
  }, 20_000);

  it("answers an unknown /api path with a JSON 404, not HTML", async () => {
    const res = await fetch(`${base}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    await expect(res.json()).resolves.toBeTypeOf("object");
  }, 20_000);
});
