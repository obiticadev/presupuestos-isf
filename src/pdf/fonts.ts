import { readFileSync } from "node:fs";
import path from "node:path";

// A path from the working directory, not require.resolve: the server bundle turns that into a module id.
// It is the project root under Vitest and `next start`, and `.next/standalone` (server.js chdirs there) in the
// standalone build, where `outputFileTracingIncludes` in next.config.ts copies the file.
export const ARCHIVO_WOFF2 = "node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2";

let face: string | undefined;

/** Archivo (variable, latin) embedded as base64, so the PDF looks the same on any machine. */
export function archivoFontFace(): string {
  face ??= `@font-face{font-family:Archivo;font-style:normal;font-weight:100 900;font-stretch:62% 125%;src:url(data:font/woff2;base64,${readFileSync(path.join(process.cwd(), ARCHIVO_WOFF2)).toString("base64")}) format("woff2")}`;
  return face;
}
