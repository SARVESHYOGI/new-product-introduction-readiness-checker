import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(rootDir, "src"),
    },
  },
  test: {
    // Enables RTL auto-cleanup and jest-dom matchers registration.
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/ui/**/*.test.tsx",
    ],
    // Keep DB-touching integration work sequential so the seeded test
    // database is never mutated concurrently.
    pool: "forks",
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});