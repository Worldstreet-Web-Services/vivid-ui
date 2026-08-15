import { defineConfig } from "vitest/config";
import path from "node:path";

// The `@/` alias the app uses. Without it a test can only import siblings by
// relative path, which quietly pushes production code toward a second import
// style just to stay testable.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "components/**/*.test.ts"],
  },
});
