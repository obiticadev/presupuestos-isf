import type { Page } from "playwright-core";
import { withPage } from "./browser";

const TIMEOUT_MS = 30_000;

export type RenderInput = {
  body: string;
  header: string;
  footer: string;
  beforePrint?: (page: Page) => Promise<void>;
};

export async function renderPdf({ body, header, footer, beforePrint }: RenderInput): Promise<Uint8Array> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("No se pudo generar el PDF")), TIMEOUT_MS);
  });
  const job = withPage(async (page) => {
    await page.setContent(body, { waitUntil: "load" });
    await beforePrint?.(page);
    return page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: header,
      footerTemplate: footer,
      margin: { top: "22mm", bottom: "15mm", left: "18mm", right: "18mm" },
    });
  });
  job.catch(() => {}); // evita un rechazo sin atender si gana el tiempo máximo
  try {
    return new Uint8Array(await Promise.race([job, timeout]));
  } finally {
    clearTimeout(timer);
  }
}
