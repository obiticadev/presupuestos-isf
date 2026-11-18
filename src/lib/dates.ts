/** Today in Madrid as a UTC-midnight Date, the form a @db.Date column stores (00:30 in Madrid is still today). */
export function todayMadrid(now = new Date()): Date {
  return new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid" }).format(now)}T00:00:00Z`);
}

/** "2026-10-20" → Date at UTC midnight, or null if it is not a real date. */
export function parseIsoDate(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : d;
}

/** Date column → "20/10/2026". */
export const formatDateEs = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

/** "2026-03-11" → the instant 00:00 in Madrid of that day, or null if it is not a real date. */
export function startOfMadridDay(iso: string): Date | null {
  const utc = parseIsoDate(iso);
  if (!utc) return null;
  // Madrid is UTC+1 or +2 and never changes the clock at midnight, so the offset at UTC midnight is the one at local midnight.
  const offset = new Intl.DateTimeFormat("en", { timeZone: "Europe/Madrid", timeZoneName: "longOffset" })
    .formatToParts(utc).find((p) => p.type === "timeZoneName")!.value; // "GMT+01:00"
  const [, sign, h, m] = /GMT([+-])(\d\d):(\d\d)/.exec(offset)!;
  return new Date(utc.getTime() - (sign === "+" ? 1 : -1) * (Number(h) * 60 + Number(m)) * 60_000);
}
