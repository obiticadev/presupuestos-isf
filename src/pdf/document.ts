import { formatDecimalEs } from "@/lib/decimal";

/** Fields of the issued snapshot (`issueQuote`: JSON round-trip, so amounts are strings and dates ISO) that the PDF reads. */
export type SnapshotQuote = {
  reference: string | null; date: string; subject: string; paymentTerms: string; exclusions: string; validityDays: number;
  client: { legalName: string; fiscalAddress: string };
  location: { name: string; address: string; city: string; province: string } | null;
  contact: { name: string } | null;
  // Comments, kit ids and kits arrived with the 2026-11 improvements: older snapshots lack them.
  sections: {
    id: string; title: string; comment?: string;
    children: {
      id: string; title: string; mode: "SUM" | "GLOBAL"; comment?: string; kits?: { id: string; comment?: string }[];
      lines: { description: string; quantity: string; unitName: string; visible: boolean; kitInstanceId?: string | null; comment?: string }[];
    }[];
  }[];
  totals: {
    sections: Record<string, string>; subsections: Record<string, string>; base: string; total: string;
    taxes: { name: string; ratePct: string; amount: string }[];
  };
};

export type PdfSource = {
  company: {
    legalName: string; taxId: string; address: string; phone: string; email: string; registryText: string; logoPath: string | null;
    letterGreeting: string; letterIntro: string; letterClosing: string; letterPlace: string;
  };
  quote: SnapshotQuote;
};

export type PdfRow =
  | { kind: "part" | "sub"; number: string; title: string; total: string }
  | { kind: "line"; text: string; quantity: string }
  | { kind: "note"; text: string };

export type PdfDocument = {
  draft: boolean; reference: string; shortDate: string; longDate: string;
  company: PdfSource["company"];
  recipient: { name: string; place: string; address: string[]; attention: string | null };
  letter: { place: string; greeting: string; intro: string; closing: string[] };
  clientName: string; title: string; rows: PdfRow[];
  totals: { base: string; taxes: { label: string; amount: string }[]; total: string };
  conditions: { exclusions: string; paymentTerms: string; validity: string };
  place: string;
};

const note = (rows: PdfRow[], comment: string | undefined) => { if (comment?.trim()) rows.push({ kind: "note", text: comment.trim() }); };
const money = (x: string) => `${formatDecimalEs(x)} €`;
const textLines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const LONG_DATE = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function buildDocument({ company, quote: q }: PdfSource, opts: { draft: boolean }): PdfDocument {
  const [y, m, day] = q.date.slice(0, 10).split("-").map(Number);
  const longDate = LONG_DATE.format(new Date(q.date)); // a date without time stored at UTC midnight
  const loc = q.location;
  const cityLine = loc ? [loc.city, loc.province && `(${loc.province})`].filter(Boolean).join(" ") : "";
  const address = loc?.address.trim() ? [loc.address.trim(), cityLine].filter(Boolean) : textLines(q.client.fiscalAddress);

  const rows: PdfRow[] = [];
  q.sections.forEach((s, i) => {
    rows.push({ kind: "part", number: `${i + 1}`, title: s.title.trim() || "Sin título", total: money(q.totals.sections[s.id] ?? "0") });
    s.children.forEach((c, j) => {
      rows.push({ kind: "sub", number: `${i + 1}.${j + 1}`, title: c.title.trim() || "Sin título", total: money(q.totals.subsections[c.id] ?? "0") });
      const visible = c.lines.filter((x) => x.visible);
      visible.forEach((l, k) => {
        const qty = formatDecimalEs(l.quantity, { min: 0, max: 4 });
        rows.push({ kind: "line", text: l.description, quantity: l.unitName ? `${qty} ${l.unitName}` : qty });
        note(rows, l.comment);
        // A kit's comment follows the last of its visible lines.
        if (l.kitInstanceId && visible[k + 1]?.kitInstanceId !== l.kitInstanceId) note(rows, c.kits?.find((x) => x.id === l.kitInstanceId)?.comment);
      });
      note(rows, c.comment);
    });
    note(rows, s.comment);
  });

  return {
    draft: opts.draft,
    reference: opts.draft ? "BORRADOR" : (q.reference ?? ""),
    shortDate: `${day}/${m}/${y}`,
    longDate,
    company,
    recipient: {
      name: q.client.legalName, place: loc?.name ?? "", address,
      attention: q.contact ? `A la atención de ${q.contact.name}` : null,
    },
    letter: {
      place: company.letterPlace, greeting: company.letterGreeting,
      intro: `${company.letterIntro.trim()} ${q.subject.trim()}.`,
      closing: company.letterClosing.split(/\r?\n\s*\r?\n/).map((p) => p.trim()).filter(Boolean),
    },
    clientName: q.client.legalName,
    // The subject continues «…en referencia a», so it starts in lowercase; as a heading it needs a capital.
    title: q.subject.trim().replace(/^./u, (c) => c.toLocaleUpperCase("es")),
    rows,
    totals: {
      base: money(q.totals.base),
      taxes: q.totals.taxes.map((t) => ({ label: t.name.includes("%") ? t.name : `${t.name} ${formatDecimalEs(t.ratePct, { min: 0, max: 2 })} %`, amount: money(t.amount) })),
      total: money(q.totals.total),
    },
    conditions: { exclusions: q.exclusions, paymentTerms: q.paymentTerms, validity: `${q.validityDays} días` },
    place: `${company.letterPlace} a ${longDate}`,
  };
}

/** Live draft (Decimals, Dates) → the snapshot shape, the way `issueQuote` freezes it. */
export function toPdfSource(company: unknown, quote: unknown): PdfSource {
  return JSON.parse(JSON.stringify({ company, quote })) as PdfSource;
}
