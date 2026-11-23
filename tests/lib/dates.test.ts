import { startOfMadridDay } from "@/lib/dates";

test("startOfMadridDay da las 00:00 de Madrid en invierno y en verano, y null si la fecha no existe", () => {
  expect(startOfMadridDay("2026-01-15")?.toISOString()).toBe("2026-01-14T23:00:00.000Z");
  expect(startOfMadridDay("2026-07-15")?.toISOString()).toBe("2026-07-14T22:00:00.000Z");
  expect(startOfMadridDay("2026-03-29")?.toISOString()).toBe("2026-03-28T23:00:00.000Z"); // día del cambio de hora
  expect(startOfMadridDay("2026-02-30")).toBeNull();
});
