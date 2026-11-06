import { execSync } from "node:child_process";

// Recreates the test database from the migrations once per run.
export default function setup() {
  const url = process.env.DATABASE_URL_TEST ?? "";
  if (!new URL(url).pathname.endsWith("_test")) throw new Error(`DATABASE_URL_TEST no apunta a una BD *_test: ${url}`);
  execSync("pnpm exec prisma migrate reset --force", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}
