import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

export default defineConfig({
  root: __dirname,
  plugins: [viteSingleFile()],
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
