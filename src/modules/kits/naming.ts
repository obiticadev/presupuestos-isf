// The automatic kit name (spec 5.3, option D): the main element's prefix plus those of the components marked «in the name».
// Pure, so the form previews the same name the server saves.

const STOPWORDS = new Set(["DE", "DEL", "LA", "LAS", "EL", "LOS", "Y", "PARA", "CON", "EN", "A"]);
const clean = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
const alnum = (s: string) => s.replace(/[^A-Z0-9]/g, "");

/** «Bombas» → BOM, «Mano de obra» → MO. */
export function categoryPrefix(name: string): string {
  const words = clean(name).split(/\s+/).map(alnum).filter((w) => w && !STOPWORDS.has(w));
  return words.length === 1 ? words[0].slice(0, 3) : words.map((w) => w[0]).join("");
}

/** «VAL-010» → VAL; a code without a hyphen gives its first 3 characters. */
export function codePrefix(code: string): string {
  const c = clean(code);
  return c.includes("-") ? alnum(c.slice(0, c.indexOf("-"))) : alnum(c).slice(0, 3);
}

export function kitBaseName(mainPrefix: string, namePrefixes: string[]): string {
  return [mainPrefix, ...namePrefixes].filter(Boolean).join("-") || "CJ";
}

export function uniqueName(base: string, taken: string[]): string {
  if (!taken.includes(base)) return base;
  let n = 2;
  while (taken.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** The base name itself or the base name with a «-N» suffix. */
export function matchesAutoName(name: string, base: string): boolean {
  return name === base || (name.startsWith(`${base}-`) && /^\d+$/.test(name.slice(base.length + 1)));
}
