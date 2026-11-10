import type { PdfSource, SnapshotQuote } from "@/pdf/document";

/** [title, [subTitle, [description, quantity, unit][]][]][] → sections with every line visible. */
type Parts = [string, [string, [string, string, string][]][]][];
export const sections = (parts: Parts): Pick<SnapshotQuote, "sections"> & { totals: Pick<SnapshotQuote["totals"], "sections" | "subsections"> } => {
  const totals = { sections: {} as Record<string, string>, subsections: {} as Record<string, string> };
  const out = parts.map(([title, subs], i) => {
    totals.sections[`s${i}`] = "100";
    return {
      id: `s${i}`, title,
      children: subs.map(([st, lines], j) => {
        totals.subsections[`s${i}c${j}`] = "50";
        return { id: `s${i}c${j}`, title: st, mode: "SUM" as const, lines: lines.map(([description, quantity, unitName]) => ({ description, quantity, unitName, visible: true })) };
      }),
    };
  });
  return { sections: out, totals };
};

/** The short quote of Task 2, with the reference and payment terms of the plan 3 walkthrough. */
export const pdfSource = (): PdfSource => ({
  company: {
    legalName: "ISF Instalaciones, Servicios y Formación, S.L.", taxId: "B00000000", address: "C/ Ejemplo, 12 · 28801 Alcalá de Henares (Madrid)",
    phone: "910 000 000", email: "oficina@isf-esp.com", registryText: "Inscrita en el Registro Mercantil de Madrid, tomo 00000, folio 000, hoja M-000000", logoPath: null,
    letterGreeting: "Muy Sres. Nuestros:", letterIntro: "Agradeciendo la confianza, presentamos oferta en referencia a",
    letterClosing: "Esperando.\n\nSaludos.\n\nAtentamente.", letterPlace: "Alcalá de Henares",
  },
  quote: {
    reference: "PR-2026000002-R00", date: "2026-11-09T00:00:00.000Z", subject: "ampliación del grupo de bombeo",
    paymentTerms: "Transferencia a 60 días.", exclusions: "Obra civil, ayudas de albañilería y legalizaciones.", validityDays: 30,
    client: { legalName: "Conservas Ribera, S.A.", fiscalAddress: "Calle Mayor 1\n28001 Madrid" },
    location: { name: "Planta de envasado", address: "Ctra. de Toledo, km 4", city: "28300 Aranjuez", province: "Madrid" },
    contact: { name: "Ana López" },
    sections: [{
      id: "s1", title: "Grupo de bombeo",
      children: [
        { id: "c1", title: "Equipos", mode: "SUM", lines: [
          { description: "Bomba", quantity: "2", unitName: "ud", visible: true },
          { description: "Manguera", quantity: "40", unitName: "m", visible: true },
          { description: "Línea oculta que no se imprime", quantity: "1", unitName: "", visible: false },
        ] },
        { id: "c2", title: "Montaje", mode: "GLOBAL", lines: [] },
      ],
    }],
    totals: {
      sections: { s1: "639" }, subsections: { c1: "604", c2: "35" }, base: "1219", total: "1474.99",
      taxes: [{ name: "IVA", ratePct: "21", amount: "255.99" }],
    },
  },
});

/** The same quote with other sections (totals of each part and sub are placeholders). */
export const withParts = (parts: Parts, money?: { base: string; tax: string; total: string }): PdfSource => {
  const s = pdfSource();
  const { sections: secs, totals } = sections(parts);
  s.quote.sections = secs;
  s.quote.totals = { ...s.quote.totals, ...totals };
  if (money) Object.assign(s.quote.totals, { base: money.base, total: money.total, taxes: [{ name: "IVA", ratePct: "21", amount: money.tax }] });
  return s;
};

const pad = (n: number) => String(n).padStart(2, "0");
/** 3 parts × 15 lines with 120-character descriptions. */
export const longParts = (): Parts => [1, 2, 3].map((p) => [`Partida ${p}`, [[`Subpartida ${p}.1`,
  Array.from({ length: 15 }, (_, i) => {
    const head = `Línea ${pad((p - 1) * 15 + i + 1)} `;
    return [(head + "suministro, montaje y conexionado de material eléctrico según esquemas y normativa vigente, incluidas pruebas ").slice(0, 120), "2", "ud"];
  })]]]);

/** The example of pdf-densidades.html: 4 parts, 8 subs, 19 lines. */
export const exampleParts = (): Parts => [
  ["Grupo de bombeo", [
    ["Suministro e instalación de bombas", [["Bomba de potencia mayor que 7,5 kW", "2", "ud"], ["Manguera 4 hilos x 2,5 mm²", "40", "m"], ["Variador de frecuencia 11 kW", "2", "ud"], ["Prensaestopas y terminales para cable de 2,5 mm² (bolsa de 50 unidades)", "2", "ud"]]],
    ["Desplazamiento y puesta en marcha", [["Desplazamiento a obra", "2", "ud"], ["Hora de oficial electricista", "8", "h"]]]]],
  ["Cuadro eléctrico", [
    ["Adecuación del cuadro existente", [["Interruptor automático 4P 32 A", "2", "ud"], ["Contactor 3P 25 A con bobina 230 V", "2", "ud"], ["Material auxiliar de conexionado", "1", "ud"]]],
    ["Canalización y cableado", [["Bandeja perforada 300 x 60 mm", "25", "m"], ["Cable RZ1-K 5G6 mm²", "60", "m"], ["Hora de oficial electricista", "6", "h"]]]]],
  ["Programación", [
    ["Programación del PLC del grupo", [["Hora de programador", "20", "h"]]],
    ["Pantalla de operador", [["Pantalla táctil de 7 pulgadas", "1", "ud"], ["Hora de programador", "4", "h"]]]]],
  ["Pruebas y documentación", [
    ["Pruebas de funcionamiento", [["Hora de oficial electricista", "4", "h"], ["Hora de programador", "2", "h"]]],
    ["Documentación", [["Esquemas eléctricos actualizados", "1", "ud"], ["Manual de operación", "1", "ud"]]]]],
];
