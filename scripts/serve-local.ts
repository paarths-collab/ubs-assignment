/**
 * Local production-parity server.
 *
 * Reproduces, for THIS repository's `vercel.json`, how Vercel serves the
 * output of `npm run build:vercel`:
 *
 *   1. Filesystem first: a request that names an existing file under the
 *      output directory (e.g. `/assets/x.js`, `/kpi.html`) is served as-is.
 *   2. Otherwise `rewrites` are applied in order, read from vercel.json at
 *      startup (nothing is hard-coded here).
 *   3. A rewrite whose destination is `/api/handler` invokes the serverless
 *      function with the ORIGINAL `req.url` (path + query), exactly as Vercel
 *      does — the function does its own routing from that URL.
 *
 * Only the `source` syntax this repository's vercel.json uses is supported:
 * literal paths, `(.*)` groups, and the `((?!a|b|c).*)` negative-lookahead
 * form. Anything else throws at startup rather than silently diverging from
 * Vercel's matching. Likewise a destination using `$1`/`:param` captures.
 *
 * Run with `npm run serve:local` (after `npm run build:vercel`), or
 * `npm run start:local` to do both.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { existsSync, readFileSync, statSync, createReadStream } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export interface RewriteRule {
  source: string;
  destination: string;
}

export interface CompiledRewrite extends RewriteRule {
  pattern: RegExp;
}

/** Destination that means "run the serverless function". */
export const API_HANDLER_DESTINATION = "/api/handler";

export type ApiHandler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;

export interface LocalServerOptions {
  /** Directory holding the `build:vercel` output (dist). */
  distDir: string;
  /** Path to the vercel.json whose `rewrites` are honoured. */
  vercelConfigPath: string;
  /** Stand-in for api/handler.ts's default export. */
  apiHandler: ApiHandler;
}

const LOOKAHEAD_ALTERNATIVE = /^[A-Za-z0-9_\-./]+$/;
const LITERAL_SEGMENT = /^[A-Za-z0-9_\-./~%]+$/;

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Compiles one rewrite `source` into an anchored RegExp.
 *
 * Supported tokens, in any combination after a leading `/`:
 *   - literal text
 *   - `(.*)`                  -> `(.*)`
 *   - `((?!alt1|alt2).*)`     -> a capture that may not start with any alt
 *     (alternatives are matched literally; Vercel would treat `.` as regex
 *     wildcard, which is immaterial for the alternatives used here).
 */
export function compileSource(source: string): RegExp {
  const fail = (why: string): never => {
    throw new Error(`Unsupported rewrite source ${JSON.stringify(source)}: ${why}`);
  };

  if (!source.startsWith("/")) fail("must start with '/'");

  let out = "";
  let i = 0;
  while (i < source.length) {
    if (source.startsWith("((?!", i)) {
      const close = source.indexOf(").*)", i);
      if (close === -1) fail("malformed negative-lookahead group");
      const alternatives = source.slice(i + 4, close).split("|");
      for (const alt of alternatives) {
        if (!LOOKAHEAD_ALTERNATIVE.test(alt)) fail(`lookahead alternative ${JSON.stringify(alt)} is not a plain literal`);
      }
      out += `(?!${alternatives.map(escapeRegExp).join("|")}).*`;
      i = close + 4;
      continue;
    }
    if (source.startsWith("(.*)", i)) {
      out += "(.*)";
      i += 4;
      continue;
    }
    // Consume a run of literal characters.
    let j = i;
    while (j < source.length && source[j] !== "(") j++;
    if (j === i) fail(`unrecognised group at offset ${i}`);
    const literal = source.slice(i, j);
    if (!LITERAL_SEGMENT.test(literal)) fail(`unsupported characters in ${JSON.stringify(literal)}`);
    out += escapeRegExp(literal);
    i = j;
  }
  return new RegExp(`^${out}$`);
}

export function compileRewrites(rules: readonly RewriteRule[]): CompiledRewrite[] {
  return rules.map((rule, index) => {
    if (typeof rule?.source !== "string" || typeof rule?.destination !== "string") {
      throw new Error(`rewrites[${index}] must have string "source" and "destination"`);
    }
    if (/[$:]/.test(rule.destination.replace(/^[a-z]+:\/\//, ""))) {
      throw new Error(
        `Unsupported rewrite destination ${JSON.stringify(rule.destination)}: captures/params are not supported`,
      );
    }
    return { ...rule, pattern: compileSource(rule.source) };
  });
}

export function loadRewrites(vercelConfigPath: string): CompiledRewrite[] {
  const config = JSON.parse(readFileSync(vercelConfigPath, "utf8")) as { rewrites?: RewriteRule[] };
  return compileRewrites(config.rewrites ?? []);
}

/** First matching rule's destination for a pathname (no query), or null. */
export function matchRewrite(rules: readonly CompiledRewrite[], pathname: string): string | null {
  for (const rule of rules) {
    if (rule.pattern.test(pathname)) return rule.destination;
  }
  return null;
}

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

export function contentTypeFor(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Turns `req.url` into the single pathname used for BOTH the filesystem lookup
 * and rewrite matching: query stripped, percent-decoded once, repeated slashes
 * collapsed. Returns null for undecodable or NUL-containing paths (-> 400).
 * (The API handler never sees this value; it gets the untouched `req.url`.)
 */
export function normalizePathname(rawUrl: string | undefined): string | null {
  const raw = rawUrl ?? "/";
  const q = raw.indexOf("?");
  const rawPath = q === -1 ? raw : raw.slice(0, q);
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const withSlash = decoded.startsWith("/") ? decoded : `/${decoded}`;
  return withSlash.replace(/\/{2,}/g, "/");
}

/** Maps an already-normalised pathname to an existing regular file inside distDir, or null. */
function resolveStaticFile(distDir: string, pathname: string): string | null {
  const root = path.resolve(distDir);
  const candidate = path.resolve(root, `.${pathname}`);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return null; // traversal
  const file = pathname.endsWith("/") ? path.join(candidate, "index.html") : candidate;
  try {
    if (statSync(file).isFile()) return file;
  } catch {
    // not found
  }
  return null;
}

function sendFile(req: IncomingMessage, res: ServerResponse, file: string): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD", "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method Not Allowed");
    return;
  }
  const size = statSync(file).size;
  res.writeHead(200, { "Content-Type": contentTypeFor(file), "Content-Length": size });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  const stream = createReadStream(file);
  stream.on("error", (error) => {
    // eslint-disable-next-line no-console
    console.error("serve-local: failed reading", file, error.message);
    res.destroy(error);
  });
  stream.pipe(res);
}

function sendNotFound(res: ServerResponse): void {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("404: NOT_FOUND");
}

/**
 * Builds (does not start) the server. vercel.json is parsed and every rewrite
 * source validated here, so unsupported syntax fails at startup.
 */
export function createLocalServer(options: LocalServerOptions): Server {
  const { distDir, vercelConfigPath, apiHandler } = options;
  const rewrites = loadRewrites(vercelConfigPath);

  const serveDestination = async (req: IncomingMessage, res: ServerResponse, destination: string) => {
    if (destination === API_HANDLER_DESTINATION) {
      // req.url is deliberately left untouched: Vercel hands the function the
      // original URL, and api/handler.ts routes from it.
      await apiHandler(req, res);
      return;
    }
    const file = resolveStaticFile(distDir, normalizePathname(destination) ?? destination);
    if (file === null) sendNotFound(res);
    else sendFile(req, res, file);
  };

  return createServer((req, res) => {
    const run = async () => {
      const pathname = normalizePathname(req.url);
      if (pathname === null) {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("400: BAD_REQUEST");
        return;
      }
      // 1. Filesystem first.
      const file = resolveStaticFile(distDir, pathname);
      if (file !== null) {
        sendFile(req, res, file);
        return;
      }
      // 2. Rewrites, in order.
      const destination = matchRewrite(rewrites, pathname);
      if (destination === null) {
        sendNotFound(res);
        return;
      }
      await serveDestination(req, res, destination);
    };
    run().catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.error("serve-local: unhandled error", error);
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
      }
      res.end(JSON.stringify({ error: "Internal Server Error" }));
    });
  });
}

/** Validates PORT/HOST from the environment; throws a clear error on a bad PORT. */
export function resolveListenOptions(env: { PORT?: string; HOST?: string }): { port: number; host: string } {
  const rawPort = env.PORT === undefined || env.PORT.trim() === "" ? "3000" : env.PORT.trim();
  const port = Number(rawPort);
  if (!/^\d+$/.test(rawPort) || !Number.isInteger(port) || port > 65535) {
    throw new Error(`Invalid PORT ${JSON.stringify(rawPort)}: expected an integer between 0 and 65535`);
  }
  // Loopback by default: this is a local parity tool, not something to expose
  // on the LAN. Set HOST=0.0.0.0 deliberately to override.
  const host = env.HOST === undefined || env.HOST.trim() === "" ? "127.0.0.1" : env.HOST.trim();
  return { port, host };
}

async function main(): Promise<void> {
  const { port, host } = resolveListenOptions({ PORT: process.env.PORT, HOST: process.env.HOST });
  const distDir = path.resolve("dist");
  if (!existsSync(path.join(distDir, "index.html")) || !existsSync(path.join(distDir, "kpi.html"))) {
    throw new Error(`${distDir} is missing index.html/kpi.html — run "npm run build:vercel" first (or "npm run start:local").`);
  }
  const { default: apiHandler } = await import("../api/handler.js");
  const server = createLocalServer({
    distDir,
    vercelConfigPath: path.resolve("vercel.json"),
    apiHandler,
  });
  server.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`serve-local: http://${host}:${port}  (dist=${distDir})`);
  });
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
