// The one place quote amounts are computed (spec 5.5). Pure: the editor, the list totals and the issue snapshot all use it.
// Browser entry so client components can call it too.
import { Prisma } from "@/generated/prisma/browser";

type Dec = Prisma.Decimal | string;
export type CalcLine = { id: string; quantity: Dec; unitPrice: Dec | null; taxName: string | null; taxRatePct: Dec | null };
export type CalcSub = {
  id: string; mode: "SUM" | "GLOBAL"; globalQty?: Dec | null; globalPrice?: Dec | null;
  taxName?: string | null; taxRatePct?: Dec | null; lines: CalcLine[];
};
export type CalcSection = { id: string; subsections: CalcSub[] };
export type QuoteTotals = {
  /** null = the line has no amount (descriptive, or unpriced). */
  lines: Record<string, Prisma.Decimal | null>;
  subsections: Record<string, Prisma.Decimal>;
  sections: Record<string, Prisma.Decimal>;
  base: Prisma.Decimal;
  taxes: { name: string; ratePct: Prisma.Decimal; base: Prisma.Decimal; amount: Prisma.Decimal }[];
  total: Prisma.Decimal;
  /** Lines of SUM subsections missing a price or a tax: they do not count and block issuing. */
  unpricedLineIds: string[];
};

const D = (v: Dec) => new Prisma.Decimal(v);
const money = (v: Prisma.Decimal) => v.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const ZERO = new Prisma.Decimal(0);

export function calculateQuote(sections: CalcSection[]): QuoteTotals {
  const out: QuoteTotals = { lines: {}, subsections: {}, sections: {}, base: ZERO, taxes: [], total: ZERO, unpricedLineIds: [] };
  const byTax = new Map<string, { name: string; ratePct: Prisma.Decimal; base: Prisma.Decimal }>();
  const addTax = (name: string, rate: Dec, amount: Prisma.Decimal) => {
    const ratePct = D(rate);
    const key = `${name}|${ratePct.toFixed()}`;
    const t = byTax.get(key) ?? { name, ratePct, base: ZERO };
    t.base = t.base.plus(amount);
    byTax.set(key, t);
  };

  for (const section of sections) {
    let sectionTotal = ZERO;
    for (const sub of section.subsections) {
      let subTotal = ZERO;
      if (sub.mode === "GLOBAL") {
        for (const line of sub.lines) out.lines[line.id] = null;
        if (sub.globalQty != null && sub.globalPrice != null) {
          subTotal = money(D(sub.globalQty).mul(D(sub.globalPrice)));
          if (sub.taxName != null && sub.taxRatePct != null) addTax(sub.taxName, sub.taxRatePct, subTotal);
        }
      } else {
        for (const line of sub.lines) {
          if (line.unitPrice == null || line.taxName == null || line.taxRatePct == null) {
            out.lines[line.id] = null;
            out.unpricedLineIds.push(line.id);
            continue;
          }
          const amount = money(D(line.quantity).mul(D(line.unitPrice)));
          out.lines[line.id] = amount;
          subTotal = subTotal.plus(amount);
          addTax(line.taxName, line.taxRatePct, amount);
        }
      }
      out.subsections[sub.id] = subTotal;
      sectionTotal = sectionTotal.plus(subTotal);
    }
    out.sections[section.id] = sectionTotal;
    out.base = out.base.plus(sectionTotal);
  }

  out.taxes = [...byTax.values()]
    .map((t) => ({ ...t, amount: money(t.base.mul(t.ratePct).div(100)) }))
    .sort((a, b) => b.ratePct.comparedTo(a.ratePct));
  out.total = out.taxes.reduce((acc, t) => acc.plus(t.amount), out.base);
  return out;
}
