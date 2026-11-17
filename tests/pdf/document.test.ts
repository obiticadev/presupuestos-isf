import { describe, expect, it } from "vitest";
import { buildDocument, toPdfSource, type PdfSource } from "@/pdf/document";

const src = (): PdfSource => ({
  company: {
    legalName: "ISF", taxId: "B1", address: "Calle 1", phone: "1", email: "a@b.c", registryText: "", logoPath: null,
    letterGreeting: "Muy Sres. Nuestros:", letterIntro: "Agradeciendo la confianza, presentamos oferta en referencia a",
    letterClosing: "Esperando.\n\nSaludos.\n\nAtentamente.", letterPlace: "Alcalá de Henares",
  },
  quote: {
    reference: "PR-2026000001-R00", date: "2026-11-09T00:00:00.000Z", subject: "ampliación del grupo de bombeo",
    paymentTerms: "30 días", exclusions: "Obra civil", validityDays: 30,
    client: { legalName: "Acme S.L.", fiscalAddress: "Calle Mayor 1\n28001 Madrid" },
    location: { name: "Planta", address: "Ctra. de Toledo, km 4", city: "28300 Aranjuez", province: "Madrid" },
    contact: { name: "Ana López" },
    sections: [{
      id: "s1", title: "Grupo de bombeo",
      children: [
        { id: "c1", title: "Equipos", mode: "SUM", lines: [
          { description: "Bomba", quantity: "2", unitName: "ud", visible: true },
          { description: "Manguera", quantity: "40", unitName: "m", visible: true },
          { description: "Oculta", quantity: "1", unitName: "", visible: false },
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

describe("buildDocument", () => {
  it("builds rows, totals, dates, recipient and letter", () => {
    const d = buildDocument(src(), { draft: false });
    expect(d.rows).toEqual([
      { kind: "part", number: "1", title: "Grupo de bombeo", total: "639,00 €" },
      { kind: "sub", number: "1.1", title: "Equipos", total: "604,00 €" },
      { kind: "line", text: "Bomba", quantity: "2 ud" },
      { kind: "line", text: "Manguera", quantity: "40 m" },
      { kind: "sub", number: "1.2", title: "Montaje", total: "35,00 €" },
    ]);
    expect(d.totals).toEqual({ base: "1.219,00 €", taxes: [{ label: "IVA 21 %", amount: "255,99 €" }], total: "1.474,99 €" });
    expect([d.shortDate, d.longDate, d.place]).toEqual(["9/11/2026", "9 de noviembre de 2026", "Alcalá de Henares a 9 de noviembre de 2026"]);
    expect(d.letter.intro.endsWith(" ampliación del grupo de bombeo.")).toBe(true);
    expect(d.title).toBe("Ampliación del grupo de bombeo");
    expect(d.letter.closing).toEqual(["Esperando.", "Saludos.", "Atentamente."]);
    expect(d.conditions.validity).toBe("30 días");
    expect(d.reference).toBe("PR-2026000001-R00");
    expect(d.recipient.attention).toBe("A la atención de Ana López");
    expect(d.recipient.address).toEqual(["Calle Mayor 1", "28001 Madrid"]);
  });

  it("formats quantities with and without unit", () => {
    const s = src();
    s.quote.sections[0].children[0].lines = [
      { description: "A", quantity: "1.5", unitName: "h", visible: true },
      { description: "B", quantity: "1.5", unitName: "", visible: true },
    ];
    const qty = buildDocument(s, { draft: false }).rows.flatMap((r) => (r.kind === "line" ? [r.quantity] : []));
    expect(qty).toEqual(["1,5 h", "1,5"]);
  });

  it("falls back to the fiscal address, draft reference and untitled parts", () => {
    const s = src();
    s.quote.location = null;
    s.quote.contact = null;
    s.quote.sections[0].title = " ";
    const d = buildDocument(s, { draft: true });
    expect(d.recipient.address).toEqual(["Calle Mayor 1", "28001 Madrid"]);
    expect(d.recipient.attention).toBeNull();
    expect(d.reference).toBe("BORRADOR");
    expect(d.rows[0]).toMatchObject({ title: "Sin título" });
  });

  it("the tax label is the name when it already carries the rate", () => {
    const s = src();
    s.quote.totals.taxes = [{ name: "IVA 21 %", ratePct: "21", amount: "1" }, { name: "IVA 10 % prueba", ratePct: "10", amount: "1" }, { name: "IGIC", ratePct: "7", amount: "1" }];
    expect(buildDocument(s, { draft: false }).totals.taxes.map((t) => t.label)).toEqual(["IVA 21 %", "IVA 10 % prueba", "IGIC 7 %"]);
  });

  it("comments become notes right after their element", () => {
    const s = src();
    const part = s.quote.sections[0];
    part.comment = "De la partida";
    const c1 = part.children[0];
    c1.comment = "De la subpartida";
    c1.kits = [{ id: "k1", comment: "Del conjunto" }];
    c1.lines = [
      { description: "Bomba", quantity: "2", unitName: "ud", visible: true, kitInstanceId: "k1" },
      { description: "Manguera", quantity: "40", unitName: "m", visible: true, kitInstanceId: "k1", comment: "Medida en obra" },
      { description: "Cuadro", quantity: "1", unitName: "ud", visible: true, kitInstanceId: null, comment: "Con variador" },
    ];
    const rows = buildDocument(s, { draft: false }).rows.map((r) => (r.kind === "note" ? `note:${r.text}` : r.kind === "line" ? r.text : r.title));
    expect(rows).toEqual([
      "Grupo de bombeo", "Equipos", "Bomba", "Manguera", "note:Medida en obra", "note:Del conjunto",
      "Cuadro", "note:Con variador", "note:De la subpartida", "Montaje", "note:De la partida",
    ]);
  });

  it("each note says whose comment it is: line, kit, subpartida or partida", () => {
    const s = src();
    const part = s.quote.sections[0];
    part.comment = "P";
    part.children[0].comment = "S";
    part.children[0].kits = [{ id: "k1", comment: "K" }];
    part.children[0].lines = [
      { description: "Bomba", quantity: "2", unitName: "ud", visible: true, kitInstanceId: "k1" },
      { description: "Cuadro", quantity: "1", unitName: "ud", visible: true, kitInstanceId: null, comment: "L" },
    ];
    const notes = buildDocument(s, { draft: false }).rows.filter((r) => r.kind === "note");
    expect(notes).toEqual([
      { kind: "note", of: "kit", text: "K" }, { kind: "note", of: "line", text: "L" },
      { kind: "note", of: "sub", text: "S" }, { kind: "note", of: "part", text: "P" },
    ]);
  });

  it("a hidden line hides its comment, an empty comment adds nothing, and a kit with every line hidden hides its own", () => {
    const s = src();
    const c1 = s.quote.sections[0].children[0];
    c1.kits = [{ id: "k1", comment: "Del conjunto" }];
    c1.lines = [
      { description: "Bomba", quantity: "2", unitName: "ud", visible: false, kitInstanceId: "k1", comment: "Oculto" },
      { description: "Cuadro", quantity: "1", unitName: "ud", visible: true, kitInstanceId: null, comment: "" },
    ];
    expect(buildDocument(s, { draft: false }).rows.filter((r) => r.kind === "note")).toEqual([]);
  });

  it("an old snapshot without comments gives the same rows as before", () => {
    expect(buildDocument(src(), { draft: false }).rows.some((r) => r.kind === "note")).toBe(false);
  });

  it("el destinatario es razón social, dirección fiscal línea a línea y contacto", () => {
    const s = src();
    s.quote.client.fiscalAddress = "Calle de Ejemplo, 1.\r\n\n  Dirección ficticia.  \n";
    const d = buildDocument(s, { draft: false });
    expect(d.recipient).toEqual({ name: "Acme S.L.", address: ["Calle de Ejemplo, 1.", "Dirección ficticia."], attention: "A la atención de Ana López" });
  });

  it("toPdfSource round-trips through JSON", () => {
    expect(toPdfSource({ d: new Date("2026-01-01T00:00:00Z") }, { q: 2 })).toEqual({ company: { d: "2026-01-01T00:00:00.000Z" }, quote: { q: 2 } });
  });
});

describe("buildDocument: instalación", () => {
  it("el destinatario es el cliente y su dirección fiscal, no la instalación", () => {
    const s = src();
    s.quote.location = { name: "Planta", address: "Ctra. de Toledo, km 4", installation: "28300 Aranjuez", country: "España" };
    const d = buildDocument(s, { draft: false });
    expect(d.recipient).toEqual({ name: "Acme S.L.", address: ["Calle Mayor 1", "28001 Madrid"], attention: "A la atención de Ana López" });
  });

  it("la carta sigue el asunto con «en instalación, país»", () => {
    const s = src();
    s.quote.location = { name: "Planta", address: "", installation: "EDAR Sur", country: "España" };
    expect(buildDocument(s, { draft: false }).letter.intro)
      .toBe("Agradeciendo la confianza, presentamos oferta en referencia a ampliación del grupo de bombeo en EDAR Sur, España.");
  });

  it("sin país, o sin instalación, no quedan comas sueltas; sin ninguno de los dos no hay «en»", () => {
    const s = src();
    s.quote.location = { name: "Planta", address: "", installation: "EDAR Sur", country: "" };
    expect(buildDocument(s, { draft: false }).letter.intro).toMatch(/bombeo en EDAR Sur\.$/);
    s.quote.location = { name: "Planta", address: "", installation: "", country: "" };
    expect(buildDocument(s, { draft: false }).letter.intro).toMatch(/bombeo\.$/);
  });

  it("un snapshot antiguo deja la carta sin «en»", () => {
    const d = buildDocument(src(), { draft: false });
    expect(d.letter.intro).toBe("Agradeciendo la confianza, presentamos oferta en referencia a ampliación del grupo de bombeo.");
  });

  it("un snapshot antiguo con city y province se regenera con la dirección fiscal y sin «en»", () => {
    const s = src();
    s.quote.location = { name: "Planta", address: "Ctra. de Toledo, km 4", city: "28300 Aranjuez", province: "Madrid" };
    const d = buildDocument(s, { draft: false });
    expect(d.recipient.address).toEqual(["Calle Mayor 1", "28001 Madrid"]);
    expect(d.letter.intro).toMatch(/bombeo\.$/);
  });
});
