import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

let face: string | undefined;

/** Archivo (variable, latin) embedded as base64, so the PDF looks the same on any machine. */
export function archivoFontFace(): string {
  face ??= (() => {
    const file = createRequire(import.meta.url).resolve("@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2");
    const b64 = readFileSync(file).toString("base64");
    return `@font-face{font-family:Archivo;font-style:normal;font-weight:100 900;font-stretch:62% 125%;src:url(data:font/woff2;base64,${b64}) format("woff2")}`;
  })();
  return face;
}
