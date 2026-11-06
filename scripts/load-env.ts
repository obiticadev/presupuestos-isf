// Loads .env when it exists (local use); in the container the variables come from compose.
// Imported first by admin.ts so the variables exist before the database client is created.
try {
  process.loadEnvFile();
} catch {}
