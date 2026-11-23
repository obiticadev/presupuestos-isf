import { readFileSync } from "node:fs";
import path from "node:path";

// From the working directory, as ARCHIVO_WOFF2 in fonts.ts; next.config.ts copies it into the standalone build.
export const SELLO_SVG = "src/pdf/assets/sello-isf.svg";

let uri: string | undefined;

/** ISF's stamp (fixed, not configurable) as a data: URI, read once. */
export function selloDataUri(): string {
  uri ??= `data:image/svg+xml;base64,${readFileSync(path.join(process.cwd(), SELLO_SVG)).toString("base64")}`;
  return uri;
}
