import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "backend/risk-stream-explorer/tests/**/*.test.ts",
      "backend/risk-executive-overview/tests/**/*.test.ts",
      "frontend/risk-stream-explorer/tests/**/*.test.ts",
      "frontend/risk-executive-overview/tests/**/*.test.ts",
      "api/tests/**/*.test.ts",
      "frontend/back-office/src/app/workspace/**/*.test.ts",
    ],
    environment: "node",
  },
});
