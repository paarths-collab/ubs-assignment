import { defineConfig, type Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

/**
 * Dev-only. The stream app's "KPI" route does `location.assign("/kpi")`, a
 * full page load. This dev server has no /kpi page, so it served the stream
 * SPA again, which routed to "kpi" again, which reloaded forever. The KPI app
 * runs on its own dev server (frontend/risk-executive-overview, port 5180),
 * so send /kpi and /kpi/* there. `apply: "serve"` keeps this out of
 * `vite build`, so the production bundle is unaffected.
 */
function redirectKpiToKpiDevServer(): Plugin {
  return {
    name: "redirect-kpi-to-kpi-dev-server",
    apply: "serve",
    configureServer(server) {
      const target = process.env.KPI_DEV_URL ?? "http://localhost:5180/";
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "").split("?")[0] ?? "";
        if (pathname === "/kpi" || pathname.startsWith("/kpi/")) {
          res.statusCode = 302;
          res.setHeader("Location", target);
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: __dirname,
  plugins: [viteSingleFile(), redirectKpiToKpiDevServer()],
  resolve: {
    alias: {
      "@backend": path.resolve(__dirname, "../../backend/risk-stream-explorer/src"),
    },
  },
  build: {
    target: "es2020",
    outDir: path.resolve(__dirname, "../../dist"),
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
