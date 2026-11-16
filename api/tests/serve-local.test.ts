import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createLocalServer, normalizePathname, resolveListenOptions } from "../../scripts/serve-local.js";

const VERCEL_JSON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../vercel.json");

describe("serve-local server (real vercel.json, temp dist fixture)", () => {
  let dist: string;
  let server: Server;
  let base: string;
  const apiCalls: Array<{ url: string | undefined; method: string | undefined }> = [];

  beforeAll(async () => {
    dist = mkdtempSync(path.join(tmpdir(), "serve-local-"));
    mkdirSync(path.join(dist, "assets"));
    writeFileSync(path.join(dist, "index.html"), "<!doctype html><title>stream-app</title>");
    writeFileSync(path.join(dist, "kpi.html"), "<!doctype html><title>kpi-app</title>");
    writeFileSync(path.join(dist, "assets", "a.js"), "console.log('a');");
    writeFileSync(path.join(dist, "assets", "a.css"), "body{}");

    const apiHandler = (req: IncomingMessage, res: ServerResponse) => {
      apiCalls.push({ url: req.url, method: req.method });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ fake: true, url: req.url }));
    };

    server = createLocalServer({ distDir: dist, vercelConfigPath: VERCEL_JSON, apiHandler });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dist, { recursive: true, force: true });
  });

  it.each(["/", "/streamgraph", "/patterns", "/graph", "/issues", "/does/not/exist"])(
    "%s serves the stream SPA index.html",
    async (pathname) => {
      const res = await fetch(base + pathname);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/^text\/html/);
      expect(await res.text()).toContain("stream-app");
    },
  );

  it.each(["/kpi", "/kpi/x/y", "/kpi.html"])("%s serves the KPI SPA kpi.html", async (pathname) => {
    const res = await fetch(base + pathname);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("kpi-app");
  });

  it("serves assets from the filesystem with the right content type", async () => {
    const js = await fetch(`${base}/assets/a.js`);
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(await js.text()).toBe("console.log('a');");

    const css = await fetch(`${base}/assets/a.css`);
    expect(css.headers.get("content-type")).toMatch(/^text\/css/);
  });

  it("404s a missing asset instead of falling back to the SPA", async () => {
    const res = await fetch(`${base}/assets/missing.js`);
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("stream-app");
  });

  it("does not escape the dist directory", async () => {
    const res = await fetch(`${base}/assets/..%2f..%2fpackage.json`);
    expect(await res.text()).not.toContain("risk-stream-explorer-workspace");
  });

  it("passes the ORIGINAL url (path + query) to the api handler", async () => {
    apiCalls.length = 0;
    const res = await fetch(`${base}/api/patterns/priority?x=1&y=a%20b`);
    expect(res.status).toBe(200);
    expect(apiCalls).toEqual([{ url: "/api/patterns/priority?x=1&y=a%20b", method: "GET" }]);
    expect(await res.json()).toEqual({ fake: true, url: "/api/patterns/priority?x=1&y=a%20b" });
  });

  it("routes non-GET api requests to the handler too", async () => {
    apiCalls.length = 0;
    await fetch(`${base}/api/ai/follow-up/stream`, { method: "POST", body: "{}" });
    expect(apiCalls).toEqual([{ url: "/api/ai/follow-up/stream", method: "POST" }]);
  });

  it("fails at startup for unsupported rewrite syntax", () => {
    const bad = path.join(dist, "bad-vercel.json");
    writeFileSync(bad, JSON.stringify({ rewrites: [{ source: "/api/:path*", destination: "/api/handler" }] }));
    expect(() => createLocalServer({ distDir: dist, vercelConfigPath: bad, apiHandler: () => undefined })).toThrow(
      /Unsupported rewrite source/,
    );
  });

  it("answers HEAD on a static file with headers and no body", async () => {
    const res = await fetch(`${base}/assets/a.js`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/^text\/javascript/);
    expect(res.headers.get("content-length")).toBe(String("console.log('a');".length));
    expect(await res.text()).toBe("");
  });

  it("collapses repeated slashes before matching", async () => {
    const kpi = await fetch(`${base}//kpi//x`);
    expect(await kpi.text()).toContain("kpi-app");
    apiCalls.length = 0;
    const api = await fetch(`${base}//api//patterns/priority?z=9`);
    expect(api.status).toBe(200);
    expect(apiCalls).toHaveLength(1); // routed to the handler, with the url untouched
    expect(apiCalls[0]?.url).toBe("//api//patterns/priority?z=9");
  });

  it("rejects an undecodable path with 400", async () => {
    const res = await fetch(`${base}/%E0%A4%A`);
    expect(res.status).toBe(400);
  });

  it("returns 405 for POST to a static file", async () => {
    const res = await fetch(`${base}/assets/a.js`, { method: "POST", body: "x" });
    expect(res.status).toBe(405);
  });
});

describe("serve-local api handler failures", () => {
  let dist: string;
  const servers: Server[] = [];

  beforeAll(() => {
    dist = mkdtempSync(path.join(tmpdir(), "serve-local-err-"));
    writeFileSync(path.join(dist, "index.html"), "<!doctype html>");
    writeFileSync(path.join(dist, "kpi.html"), "<!doctype html>");
  });

  afterAll(async () => {
    await Promise.all(servers.map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
    rmSync(dist, { recursive: true, force: true });
  });

  async function start(apiHandler: () => void | Promise<void>): Promise<string> {
    const server = createLocalServer({ distDir: dist, vercelConfigPath: VERCEL_JSON, apiHandler });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it.each([
    ["throws synchronously", () => { throw new Error("boom"); }],
    ["rejects asynchronously", () => Promise.reject(new Error("boom"))],
  ])("returns a 500 JSON response when the handler %s", async (_label, apiHandler) => {
    const base = await start(apiHandler);
    const res = await fetch(`${base}/api/anything`);
    expect(res.status).toBe(500);
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
    expect(await res.json()).toEqual({ error: "Internal Server Error" });
    // and the server keeps serving afterwards
    expect((await fetch(`${base}/`)).status).toBe(200);
  });
});

describe("normalizePathname", () => {
  it.each([
    ["/a/b?x=1", "/a/b"],
    ["//a///b", "/a/b"],
    ["/a%20b", "/a b"],
    ["/", "/"],
    ["/dir/", "/dir/"],
    [undefined, "/"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePathname(input)).toBe(expected);
  });

  it("returns null for bad encodings and NUL", () => {
    expect(normalizePathname("/%E0%A4%A")).toBeNull();
    expect(normalizePathname("/a%00b")).toBeNull();
  });
});

describe("resolveListenOptions", () => {
  it("defaults to loopback:3000", () => {
    expect(resolveListenOptions({})).toEqual({ port: 3000, host: "127.0.0.1" });
  });

  it("honours PORT and HOST", () => {
    expect(resolveListenOptions({ PORT: "4321", HOST: "0.0.0.0" })).toEqual({ port: 4321, host: "0.0.0.0" });
  });

  it.each(["abc", "-1", "70000", "3.5", "1e3"])("rejects PORT=%s with a clear error", (port) => {
    expect(() => resolveListenOptions({ PORT: port })).toThrow(/Invalid PORT/);
  });
});
