import { parseDecimalEs } from "@/lib/decimal";

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
