import type { Page } from "playwright-core";
import type { PdfDocument } from "@/pdf/document";
import { renderPdf } from "@/pdf/render";
import { v1 } from "./v1";

export type Template = {
  body(doc: PdfDocument): string;
  header(doc: PdfDocument, logo: { mime: string; base64: string } | null): string;
  footer(doc: PdfDocument): string;
  /** Runs on the loaded body before printing (v1: its own pagination of the line-items sheet). */
  beforePrint?: (page: Page) => Promise<void>;
};

export const TEMPLATES: Record<"v1", Template> = { v1 };

export function renderDocument(version: string, doc: PdfDocument, logo: { mime: string; base64: string } | null): Promise<Uint8Array> {
  const t = Object.hasOwn(TEMPLATES, version) ? TEMPLATES[version as keyof typeof TEMPLATES] : undefined;
  if (!t) return Promise.reject(new Error(`Plantilla desconocida: ${version}`));
  return renderPdf({ body: t.body(doc), header: t.header(doc, logo), footer: t.footer(doc), beforePrint: t.beforePrint });
}
