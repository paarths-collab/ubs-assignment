import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  agentRules: false,
  output: "standalone",
  // Package backend code and runtime data identically for local and Vercel builds.
  outputFileTracingRoot: path.resolve(process.cwd(), "../.."),
  outputFileTracingIncludes: {
    "/api/operational/*": [
      "../../backend/risk-executive-overview/data/**/*.json",
      "../../backend/risk-stream-explorer/data/**/*.json",
      "../../frontend/risk-stream-explorer/src/graph/data/**/*.json",
    ],
  },
  poweredByHeader: false,
  async rewrites() {
    if (process.env.VERCEL === "1") return [];
    const backend = process.env.OPERATIONAL_BACKEND_URL ?? "http://127.0.0.1:4311";
    return { afterFiles: [], beforeFiles: [], fallback: [
      ...["kpi", "streamgraph", "graph", "issues", "patterns", "assets/:path*", "api/:path*"].map(route => ({ source: `/${route}`, destination: `${backend}/${route}` })),
    ] };
  },
  async redirects() {
    if (process.env.VERCEL !== "1") return [];
    return [
      ["kpi", "/workspace/investigate"],
      ["issues", "/workspace/issues"],
      ["patterns", "/workspace/issues"],
      ["streamgraph", "/workspace/timeline"],
      ["graph", "/workspace/overview"],
    ].map(([route, destination]) => ({ source: `/${route}/:path*`, destination, permanent: false }));
  },
  devIndicators: false,
  experimental: {
    agentUpgrade: "security",
    proxyClientMaxBodySize: 256 * 1024 * 1024,
    // The operational API imports TypeScript source from sibling workspaces.
    externalDir: true,
    // Those NodeNext sources use emitted .js specifiers before compilation.
    extensionAlias: { ".js": [".js", ".ts", ".tsx"], ".mjs": [".mjs", ".mts"], ".cjs": [".cjs", ".cts"] },
  },
  turbopack: { root: path.resolve(process.cwd(), "../..") },
};
export default config;
