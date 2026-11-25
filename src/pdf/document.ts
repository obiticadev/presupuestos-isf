import { formatDecimalEs } from "@/lib/decimal";

/** Fields of the issued snapshot (`issueQuote`: JSON round-trip, so amounts are strings and dates ISO) that the PDF reads. */
export type SnapshotQuote = {
  reference: string | null; date: string; subject: string; paymentTerms: string; exclusions: string; validityDays: number;
  client: { legalName: string; fiscalAddress: string };
  // city and province: snapshots issued before 2026-11-12, when they were renamed to installation and country.
  location: { name: string; address: string; installation?: string; country?: string; city?: string; province?: string } | null;
  contact: { name: string } | null;
  // Comments, kit ids and kits arrived with the 2026-11 improvements: older snapshots lack them.
  sections: {
    id: string; title: string; comment?: string;
    children: {
      // showTotal and showQuantity arrived on 2026-11-25: older snapshots lack them and show everything.
      id: string; title: string; mode: "SUM" | "GLOBAL"; comment?: string; kits?: { id: string; comment?: string; definition?: unknown }[]; showTotal?: boolean;
      lines: { description: string; quantity: string; unitName: string; visible: boolean; kitInstanceId?: string | null; kitSlot?: string | null; comment?: string; showQuantity?: boolean }[];
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
  /** Who issued it, with their signature (PNG base64). Absent in snapshots issued before 2026-11-18 and in draft previews without one. */
  signer?: Signer | null;
};

export type Signer = { name: string; signature: string };

export type PdfRow =
  | { kind: "part" | "sub"; number: string; title: string; total: string }
  // kit: the row belongs to a kit that has a comment, so the PDF highlights the whole block.
  // grouped: the line belongs to a dynamic kit placed in its kit (A1), under its group row; last closes the block.
  | { kind: "line"; text: string; quantity: string; kit?: true; grouped?: true; last?: true }
  | { kind: "group"; title: string }
  | { kind: "note"; of: "line" | "kit" | "sub" | "part"; text: string; kit?: true };

export type PdfDocument = {
  draft: boolean; reference: string; shortDate: string; longDate: string;
  company: PdfSource["company"];
  recipient: { name: string; address: string[]; attention: string | null };
  letter: { place: string; greeting: string; intro: string; closing: string[] };
  clientName: string; title: string; rows: PdfRow[];
  totals: { base: string; taxes: { label: string; amount: string }[]; total: string };
  conditions: { exclusions: string; paymentTerms: string; validity: string };
  place: string;
  signer: Signer | null;
};

const note = (rows: PdfRow[], of: "line" | "kit" | "sub" | "part", comment: string | undefined, kit = false) => {
  if (comment?.trim()) rows.push({ kind: "note", of, text: comment.trim(), ...(kit && { kit: true as const }) });
};
const money = (x: string) => `${formatDecimalEs(x)} €`;
const textLines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const LONG_DATE = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function buildDocument({ company, quote: q, signer }: PdfSource, opts: { draft: boolean }): PdfDocument {
  const [y, m, day] = q.date.slice(0, 10).split("-").map(Number);
  const longDate = LONG_DATE.format(new Date(q.date)); // a date without time stored at UTC midnight
  const loc = q.location;
  // Snapshots from before 2026-11-12 have city/province instead: their letter keeps no «en …».
  const where = [loc?.installation, loc?.country].map((x) => (x ?? "").trim()).filter(Boolean).join(", ");

  const rows: PdfRow[] = [];
  q.sections.forEach((s, i) => {
    rows.push({ kind: "part", number: `${i + 1}`, title: s.title.trim() || "Sin título", total: money(q.totals.sections[s.id] ?? "0") });
    s.children.forEach((c, j) => {
      rows.push({ kind: "sub", number: `${i + 1}.${j + 1}`, title: c.title.trim() || "Sin título", total: c.showTotal === false ? "" : money(q.totals.subsections[c.id] ?? "0") });
      const visible = c.lines.filter((x) => x.visible);
      // kitSlot «dN/…» (2026-11-25): the line comes from the dynamic placed in slot dN; older snapshots lack it.
      const group = (l: (typeof visible)[number]) => (l.kitInstanceId ? /^(d\d+)\//.exec(l.kitSlot ?? "")?.[1] : undefined);
      const groupTitle = (l: (typeof visible)[number], g: string) => {
        const def = c.kits?.find((x) => x.id === l.kitInstanceId)?.definition as { dynamics?: { slot: string; label: string }[] } | undefined;
        return def?.dynamics?.find((d) => d.slot === g)?.label ?? "";
      };
      visible.forEach((l, k) => {
        const g = group(l);
        const same = (x: (typeof visible)[number] | undefined) => !!g && !!x && x.kitInstanceId === l.kitInstanceId && group(x) === g;
        if (g && !same(visible[k - 1])) rows.push({ kind: "group", title: groupTitle(l, g) });
        const qty = formatDecimalEs(l.quantity, { min: 0, max: 4 });
        const kitComment = l.kitInstanceId ? c.kits?.find((x) => x.id === l.kitInstanceId)?.comment : undefined;
        const kit = !!kitComment?.trim();
        rows.push({ kind: "line", text: l.description, quantity: l.showQuantity === false ? "" : l.unitName ? `${qty} ${l.unitName}` : qty,
          ...(kit && { kit: true as const }), ...(g && { grouped: true as const }), ...(g && !same(visible[k + 1]) && { last: true as const }) });
        note(rows, "line", l.comment, kit);
        // A kit's comment follows the last of its visible lines.
        if (l.kitInstanceId && visible[k + 1]?.kitInstanceId !== l.kitInstanceId) note(rows, "kit", kitComment, kit);
      });
      note(rows, "sub", c.comment);
    });
    note(rows, "part", s.comment);
  });

  return {
    draft: opts.draft,
    reference: opts.draft ? "BORRADOR" : (q.reference ?? ""),
    shortDate: `${day}/${m}/${y}`,
    longDate,
    company,
    recipient: {
      name: q.client.legalName, address: textLines(q.client.fiscalAddress),
      attention: q.contact ? `A la atención de ${q.contact.name}` : null,
    },
    letter: {
      place: company.letterPlace, greeting: company.letterGreeting,
      intro: `${company.letterIntro.trim()} ${q.subject.trim()}${where ? ` en ${where}` : ""}.`,
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
    signer: signer ?? null,
  };
}

/** Live draft (Decimals, Dates) → the snapshot shape, the way `issueQuote` freezes it. */
export function toPdfSource(company: unknown, quote: unknown): PdfSource {
  return JSON.parse(JSON.stringify({ company, quote })) as PdfSource;
}
