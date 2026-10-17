import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  // tsconfig keeps JSX for Next.js; tests that import .tsx (PDF templates) need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
