import { existsSync } from "node:fs";
import nextConfig from "../../next.config";
import { ARCHIVO_WOFF2, archivoFontFace } from "@/pdf/fonts";

test("la fuente se lee desde el directorio de trabajo y el build standalone la incluye", () => {
  expect(archivoFontFace()).toMatch(/^@font-face\{font-family:Archivo;.*base64,d09GMg/); // "wOF2"
  expect(existsSync(ARCHIVO_WOFF2)).toBe(true);
  expect(Object.values(nextConfig.outputFileTracingIncludes ?? {}).flat()).toContain(`./${ARCHIVO_WOFF2}`);
});
