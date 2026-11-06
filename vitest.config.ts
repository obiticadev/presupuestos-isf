import "dotenv/config";
import path from "node:path";
import { defineConfig } from "vitest/config";

const testDbUrl = process.env.DATABASE_URL_TEST;
if (!testDbUrl) throw new Error("Falta DATABASE_URL_TEST en .env");

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    globals: true,
    fileParallelism: false,
    globalSetup: path.resolve(import.meta.dirname, "tests/setup/global-setup.ts"),
    setupFiles: [path.resolve(import.meta.dirname, "tests/setup/reset.ts")],
    env: { DATABASE_URL: testDbUrl },
  },
});
