import { chromium, type Browser, type Page } from "playwright-core";

const MAX_CONCURRENT = 2;
const MISSING = "Falta el navegador del PDF: ejecuta «pnpm exec playwright-core install chromium-headless-shell»";

let browser: Promise<Browser> | null = null;
let active = 0;
const waiting: Array<() => void> = [];

function getBrowser(): Promise<Browser> {
  browser ??= chromium.launch({ headless: true }).then(
    (b) => {
      // Si se desconecta, el siguiente uso lanza otro.
      b.on("disconnected", () => { browser = null; });
      return b;
    },
    (err: unknown) => {
      browser = null;
      throw err instanceof Error && /Executable doesn't exist/i.test(err.message) ? new Error(MISSING) : err;
    },
  );
  return browser;
}

async function acquire() {
  if (active < MAX_CONCURRENT) { active++; return; }
  await new Promise<void>((resolve) => waiting.push(resolve)); // el hueco se hereda en release()
}

function release() {
  const next = waiting.shift();
  if (next) next();
  else active--;
}

export async function withPage<T>(fn: (page: Page) => Promise<T>): Promise<T> {
  await acquire();
  try {
    const context = await (await getBrowser()).newContext({ javaScriptEnabled: false });
    try {
      await context.route("**", (route) => route.abort());
      return await fn(await context.newPage());
    } finally {
      await context.close().catch(() => {});
    }
  } finally {
    release();
  }
}

export async function closeBrowser(): Promise<void> {
  const current = browser;
  browser = null;
  if (current) await (await current).close().catch(() => {});
}
