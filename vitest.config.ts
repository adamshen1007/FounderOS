import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      reporter: ["text", "json", "html"],
    },
    environment: "node",
    hookTimeout: 30_000,
    include: ["tests/**/*.test.ts"],
    testTimeout: 120_000,
  },
});
