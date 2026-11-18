import { baseReference, formatReference } from "@/modules/quotes/numbering";
import { quoteLabel } from "@/modules/quotes/service";

const NEW = "PR-{AAAA}{TTT}{NNN}-R{RR}";

test("la referencia lleva el tipo con tres cifras y la ampliación detrás del número", () => {
  expect(formatReference(NEW, { year: 2026, typeCode: 1, seq: 7, extension: 0, revision: 0 })).toBe("PR-2026001007-R00");
  expect(formatReference(NEW, { year: 2026, typeCode: 1, seq: 7, extension: 1, revision: 0 })).toBe("PR-2026001007-A01-R00");
  expect(formatReference("PR-{AAAA}{NNNNNN}-R{RR}", { year: 2026, typeCode: 0, seq: 123, extension: 0, revision: 1 })).toBe("PR-2026000123-R01");
  expect(baseReference(NEW, { year: 2026, typeCode: 1, seq: 7 })).toBe("PR-2026001007");
});

test("nombre de los borradores", () => {
  const draft = { reference: null, revision: 0, seq: null, extension: 0, seqYear: null, typeCode: 0, numberPattern: null };
  expect(quoteLabel({ ...draft, location: { name: "Nave 2" } })).toBe("Borrador-Nave 2");
  expect(quoteLabel({ ...draft, location: null })).toBe("Borrador");
  expect(quoteLabel(draft)).toBe("Borrador");
  const numbered = { reference: null, seq: 7, seqYear: 2026, typeCode: 1, numberPattern: NEW };
  expect(quoteLabel({ ...numbered, revision: 1, extension: 0 })).toBe("Borrador-PR-2026001007-R01");
  expect(quoteLabel({ ...numbered, revision: 0, extension: 1 })).toBe("Borrador-PR-2026001007-A01-R00");
  expect(quoteLabel({ ...numbered, revision: 1, extension: 1 })).toBe("Borrador-PR-2026001007-A01-R01");
  expect(quoteLabel({ ...numbered, reference: "PR-2026001007-R00", revision: 0, extension: 0 })).toBe("PR-2026001007-R00");
});
