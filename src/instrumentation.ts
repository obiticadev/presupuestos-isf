/** Runs once per server start (Next.js instrumentation hook). */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const g = globalThis as { __expireTimer?: ReturnType<typeof setInterval> };
  if (g.__expireTimer) return; // `pnpm dev` may call register again: keep a single timer
  const { expireQuotes } = await import("@/modules/quotes/lifecycle");
  const run = () => expireQuotes().catch((e) => console.error("expireQuotes:", e));
  void run(); // catches up after the app was stopped, without holding up the start
  g.__expireTimer = setInterval(run, 3_600_000);
}
