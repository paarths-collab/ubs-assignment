import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "backend/risk-stream-explorer/tests/**/*.test.ts",
      "backend/risk-executive-overview/tests/**/*.test.ts",
      "frontend/risk-stream-explorer/tests/**/*.test.ts",
    ],
    environment: "node",
  },
});
