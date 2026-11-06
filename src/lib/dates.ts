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
