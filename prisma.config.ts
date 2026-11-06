import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // process.env and not env(): `prisma generate` runs in the Docker build without a database URL
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
