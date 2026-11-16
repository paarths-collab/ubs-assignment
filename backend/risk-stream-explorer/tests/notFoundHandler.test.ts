import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeNotFoundHandler } from "../src/middleware/error-handler.js";

/**
 * In single-origin mode the not-found handler falls back to the stream app's
 * shell for client-side routes. /kpi must not: that app is served separately
 * in the deployed layout, and its shell would redirect to /kpi forever.
 */
describe("makeNotFoundHandler", () => {
  let dir: string;
  let withSpa: FastifyInstance;
  let withoutSpa: FastifyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "notfound-"));
    writeFileSync(path.join(dir, "index.html"), "<html>stream-shell</html>");

    withSpa = Fastify();
    await withSpa.register(fastifyStatic, { root: dir, index: false });
    withSpa.setNotFoundHandler(makeNotFoundHandler(() => "index.html"));
    await withSpa.ready();

    withoutSpa = Fastify();
    withoutSpa.setNotFoundHandler(makeNotFoundHandler(null));
    await withoutSpa.ready();
  });

  afterAll(async () => {
    await withSpa.close();
    await withoutSpa.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const html = { accept: "text/html" };

  it.each(["/kpi", "/kpi/", "/kpi/x/y", "/kpi?x=1"])("returns an honest 404 for GET %s", async (url) => {
    const res = await withSpa.inject({ method: "GET", url, headers: html });
    expect(res.statusCode).toBe(404);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.body).toContain("not served by this server");
    expect(res.body).toContain("npm run start:local");
    expect(res.body).not.toContain("stream-shell");
  });

  it("still serves the app shell for other client-side routes", async () => {
    for (const url of ["/patterns", "/issues", "/kpix"]) {
      const res = await withSpa.inject({ method: "GET", url, headers: html });
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain("stream-shell");
    }
  });

  it("keeps the JSON 404 for unknown /api paths", async () => {
    const res = await withSpa.inject({ method: "GET", url: "/api/nope", headers: html });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });

  it("keeps the JSON 404 for /kpi when no frontend is being served", async () => {
    const res = await withoutSpa.inject({ method: "GET", url: "/kpi", headers: html });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("NOT_FOUND");
  });
});
