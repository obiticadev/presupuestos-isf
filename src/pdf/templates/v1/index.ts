import type { PdfDocument, PdfRow } from "@/pdf/document";
import { archivoFontFace } from "@/pdf/fonts";
import type { Template } from "../index";
import { html, safe } from "./html";
import { paginate } from "./paginate";
import { STYLES } from "./styles";

const TAG = "INSTALACIONES ELÉCTRICAS · AUTOMATIZACIÓN Y CONTROL";
const mmToPx = (mm: number) => Math.floor((mm * 96) / 25.4); // down, so a sheet never overflows the printed page
export const SHEET_PX = mmToPx(297 - 22 - 15); // A4 minus the top and bottom margins of render.ts
// Chromium draws the header and footer apart from the body: they need inline styles, explicit sizes and their own font.
// It also pads them (about 5 mm above the header, 4 mm below the footer): 13 mm and 7 mm leave the rule of the
// header at 18 mm from the top and the one of the footer at 11 mm from the bottom, as in the mockup.
const FRAME = "box-sizing:border-box;width:calc(100% - 36mm);margin:0 18mm;font-family:Archivo,sans-serif;color:#0f1f1d;-webkit-print-color-adjust:exact";

/** Joins the non-empty pieces with « · », so empty company data leaves no label or separator behind. */
const joinDot = (parts: string[]) => parts.map((p) => p.trim()).filter(Boolean).join(" · ");

const row = (r: PdfRow) =>
  r.kind === "note" ? html`<tr class="note"><td></td><td colspan="3">${r.text}</td></tr>`
  : r.kind === "line"
    ? html`<tr class="line"><td></td><td>${r.text}</td><td class="n">${r.quantity}</td><td></td></tr>`
    : html`<tr class="${r.kind}"><td class="p">${r.number}</td><td>${r.title}</td><td></td><td class="n">${r.total}</td></tr>`;

function body(d: PdfDocument): string {
  const c = d.company;
  const conditions = [
    ["Exclusiones", d.conditions.exclusions],
    ["Forma de pago", d.conditions.paymentTerms],
    ["Validez de la oferta", d.conditions.validity],
  ].filter(([, text]) => text.trim());
  return html`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${safe(archivoFontFace() + STYLES)}</style></head><body>
${d.draft ? html`<div class="wm"><span>BORRADOR</span></div>` : safe("")}
<section class="letter">
  <div class="from"><b>${c.legalName}</b>${[c.address, joinDot([c.taxId.trim() && `CIF ${c.taxId.trim()}`, c.phone, c.email])].filter((l) => l.trim()).map((l) => html`<br>${l}`)}</div>
  <div class="to"><b>${d.recipient.name}</b>${[d.recipient.place, ...d.recipient.address, d.recipient.attention ?? ""].filter(Boolean).map((l) => html`<br>${l}`)}</div>
  <div class="place">${d.letter.place} a ${d.longDate}</div>
  <div class="subject">Asunto: ${d.reference}</div>
  <p>${d.letter.greeting}</p>
  <p>${d.letter.intro}</p>
  ${d.letter.closing.map((p) => html`<p>${p}</p>`)}
</section>
<section class="sheet">
  <div class="titlebar"><div class="client">${d.clientName}</div><h1>${d.title}</h1></div>
  <table>
    <thead><tr><th class="p">P</th><th>Denominación</th><th class="n qty">Cantidad</th><th class="n tot">Total</th></tr></thead>
    <tbody>${d.rows.map(row)}</tbody>
  </table>
  <div class="close">
    <div class="left">
      <div class="cond">${conditions.map(([h, p]) => html`<h2>${h}</h2><p>${p}</p>`)}</div>
      <div class="place">${d.place}</div>
    </div>
    <div class="right">
      <div class="totals">
        <div><span>Importe del presupuesto</span><span>${d.totals.base}</span></div>
        ${d.totals.taxes.map((t) => html`<div><span>${t.label}</span><span>${t.amount}</span></div>`)}
        <div class="big"><span>Total presupuesto</span><span>${d.totals.total}</span></div>
      </div>
      <div class="stamp"><small>Firma y sello</small></div>
    </div>
  </div>
</section>
</body></html>`.__html;
}

function header(d: PdfDocument, logo: { mime: string; base64: string } | null): string {
  return html`<style>${safe(archivoFontFace())}</style>
<div style="${FRAME};height:13mm;display:flex;align-items:center;justify-content:space-between;gap:12mm;border-bottom:1.5pt solid #004742">
  ${logo ? html`<img src="data:${logo.mime};base64,${logo.base64}" alt="" style="height:10mm;width:auto">` : safe("")}
  <div style="flex:1;text-align:center;white-space:nowrap;font-size:7pt;font-weight:700;letter-spacing:.12em;font-stretch:110%;color:#004742">${TAG}</div>
  <div style="text-align:right;white-space:nowrap;font-size:9pt;font-weight:700;font-stretch:88%;line-height:1.3"><div style="font-size:7pt;font-weight:400;letter-spacing:.1em;color:#56645f">REFERENCIA</div>${d.reference}</div>
</div>`.__html;
}

function footer(d: PdfDocument): string {
  const registry = joinDot([d.company.registryText, d.company.taxId.trim() && `CIF ${d.company.taxId.trim()}`]);
  return html`<style>${safe(archivoFontFace())}</style>
<div style="${FRAME};height:7mm;display:flex;align-items:center;justify-content:space-between;gap:8mm;border-top:.75pt solid #c9d1cb;font-size:7pt;color:#56645f">
  <span>${d.shortDate}</span>
  <span style="flex:1">${registry}</span>
  <span style="white-space:nowrap">Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>
</div>`.__html;
}

export const v1: Template = {
  body, header, footer,
  beforePrint: (page) => page.evaluate(paginate, SHEET_PX),
};
