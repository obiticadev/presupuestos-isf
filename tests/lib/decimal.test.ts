import { formatDecimalEs, parseDecimalEs } from "@/lib/decimal";

test.each([
  ["21", "21"],
  ["21,5", "21.5"],
  ["21.50", "21.50"],
  ["1.234,56", "1234.56"],
  [" 0,30 ", "0.30"],
  ["-1", "-1"],
  ["12.345.678,9", "12345678.9"],
])("parseDecimalEs(%s) = %s", (i, o) => expect(parseDecimalEs(i)).toBe(o));

test.each(["", "abc", "1,2,3", "12a", "21,", ",5", "1.23,4", "1e3"])("parseDecimalEs(%s) = null", (i) =>
  expect(parseDecimalEs(i)).toBeNull(),
);

test.each([
  ["1234.5", undefined, "1.234,50"],
  ["10", undefined, "10,00"],
  ["0.005", undefined, "0,01"],
  ["0.305", { max: 4 }, "0,305"],
  ["15845.22", undefined, "15.845,22"],
  ["-1234.5", undefined, "-1.234,50"],
])("formatDecimalEs(%s, %o) = %s", (v, o, out) => expect(formatDecimalEs(v, o)).toBe(out));

test.each(["1.500", "2.000", "-1.500", "12.345.678"])("parseDecimalEs(%s) = null: punto de miles sin coma es ambiguo", (i) =>
  expect(parseDecimalEs(i)).toBeNull());
test.each([["21.50", "21.50"], ["1.500,00", "1500.00"], ["1500", "1500"], ["0,305", "0.305"]])("parseDecimalEs(%s) sigue = %s", (i, o) =>
  expect(parseDecimalEs(i)).toBe(o));
