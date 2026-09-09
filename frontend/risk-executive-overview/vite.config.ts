import { defineConfig } from "vite";

const API_PROXY_TARGET = process.env.API_PROXY_TARGET ?? "http://localhost:4000";

export default defineConfig({
  root: __dirname,
  server: {
    port: 5180,
    proxy: {
      "/api": { target: API_PROXY_TARGET, changeOrigin: true },
    },
  },
  build: {
    target: "es2020",
    outDir: "dist",
    emptyOutDir: true,
  },
});
