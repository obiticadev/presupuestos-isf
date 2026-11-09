import { calculateQuote } from "@/modules/quotes/calculation";

const L = (id: string, q: string, p: string | null, rate: string | null = "21") =>
  ({ id, quantity: q, unitPrice: p, taxName: rate ? `IVA ${rate} %` : null, taxRatePct: rate });
const sum = (id: string, lines: ReturnType<typeof L>[]) => ({ id, mode: "SUM" as const, lines });

test("ejemplo de la spec: 100 km × 0,30 + 20 h × 50 + 30 m × 10", () => {
  const t = calculateQuote([{ id: "1", subsections: [sum("1.1", [L("a", "100", "0.30"), L("b", "20", "50"), L("c", "30", "10")])] }]);
  expect([t.base, t.taxes[0].amount, t.total].map((d) => d.toFixed(2))).toEqual(["1330.00", "279.30", "1609.30"]);
  expect(t.sections["1"].toFixed(2)).toBe("1330.00");
});

test("el redondeo de línea es half-up en ,005", () => {
  const t = calculateQuote([{ id: "1", subsections: [sum("1.1", [L("a", "1", "0.005"), L("b", "3", "0.335")])] }]);
  expect([t.lines.a?.toFixed(2), t.lines.b?.toFixed(2)]).toEqual(["0.01", "1.01"]);
});

test("la cuota se redondea una vez por tipo, no por línea", () => {
  // 7 líneas de 0,10: por tipo, 0,70 × 21 % = 0,147 → 0,15; redondeando por línea daría 7 × 0,02 = 0,14.
  const t = calculateQuote([{ id: "1", subsections: [sum("1.1", Array.from({ length: 7 }, (_, i) => L(`l${i}`, "1", "0.10")))] }]);
  expect(t.taxes[0].amount.toFixed(2)).toBe("0.15");
});

test("una subpartida de precio global ignora el precio de sus líneas descriptivas", () => {
  const t = calculateQuote([{ id: "1", subsections: [
    { id: "1.1", mode: "GLOBAL", globalQty: "1", globalPrice: "15845.22", taxName: "IVA 21 %", taxRatePct: "21", lines: [L("d", "4", null, null)] },
  ] }]);
  expect(t.subsections["1.1"].toFixed(2)).toBe("15845.22");
  expect(t.lines.d).toBeNull();
  expect(t.unpricedLineIds).toEqual([]);
  expect(t.total.toFixed(2)).toBe("19172.72");
});

test("dos tipos de IVA dan dos cuotas; una línea sin precio no cuenta y se señala", () => {
  const t = calculateQuote([{ id: "1", subsections: [sum("1.1", [L("a", "1", "100"), L("b", "1", "100", "10"), L("c", "2", null)])] }]);
  expect(t.taxes.map((x) => [x.ratePct.toFixed(0), x.amount.toFixed(2)])).toEqual([["21", "21.00"], ["10", "10.00"]]);
  expect(t.base.toFixed(2)).toBe("200.00");
  expect(t.unpricedLineIds).toEqual(["c"]);
});

test("una línea con precio pero sin impuesto tampoco cuenta y se señala", () => {
  const t = calculateQuote([{ id: "1", subsections: [sum("1.1", [L("a", "1", "100", null)])] }]);
  expect(t.base.toFixed(2)).toBe("0.00");
  expect(t.unpricedLineIds).toEqual(["a"]);
});

test("sin líneas, todo es cero", () => {
  expect(calculateQuote([]).total.toFixed(2)).toBe("0.00");
});
