import type { NextConfig } from "next";
import path from "node:path";

const config: NextConfig = {
  agentRules: false,
  output: "export",
  trailingSlash: true,
  poweredByHeader: false,
  devIndicators: false,
  experimental: { agentUpgrade: "security", proxyClientMaxBodySize: 256 * 1024 * 1024 },
  turbopack: { root: path.resolve(process.cwd()) },
};
export default config;
