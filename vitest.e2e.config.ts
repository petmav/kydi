import { defineConfig } from "vitest/config";
import path from "node:path";

/** End-to-end smoke suite: `npm run test:e2e` against a running server (E2E_BASE_URL, default :3100). */
export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  oxc: { jsx: { runtime: "automatic" } },
  test: { environment: "node", include: ["e2e/**/*.test.ts"], fileParallelism: false, testTimeout: 30000, hookTimeout: 60000 },
});
