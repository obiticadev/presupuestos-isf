import type { Metadata } from "next";
import { getSignature } from "@/modules/account/service";
import { requireUser } from "@/modules/auth/session";
import { archivoFontFace } from "@/pdf/fonts";
import { selloDataUri } from "@/pdf/stamp";
import { closeHtml } from "@/pdf/templates/v1";
import { STYLES } from "@/pdf/templates/v1/styles";
import { PasswordForm } from "./password-form";
import { SignatureField } from "./signature-field";

export const metadata: Metadata = { title: "Mi cuenta · ISF Presupuestos" };

const ROLE_LABEL = { admin: "Administrador", presupuestador: "Presupuestador" } as const;

/** Sample close of a quote, drawn by the PDF template itself, so «Así saldrá en el PDF» is exactly that. */
function previewDoc(signer: { name: string; signature: string } | null): string {
  const close = closeHtml({
    conditions: { exclusions: "Obra civil y legalizaciones.", paymentTerms: "30 días fecha factura.", validity: "30 días." },
    place: "Alcalá de Henares a 18 de noviembre de 2026",
    totals: { base: "12.480,00 €", taxes: [{ label: "IVA 21 %", amount: "2.620,80 €" }], total: "15.100,80 €" },
    signer,
  });
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>${archivoFontFace()}${STYLES}html,body{background:#fff;overflow:hidden}body{padding:4mm 0}</style></head><body>${close}</body></html>`;
}

export default async function CuentaPage() {
  const user = await requireUser();
  const png = await getSignature(user.id);
  const signature = png && Buffer.from(png).toString("base64");
  return (
    <>
      <div className="crumb">Mi cuenta</div>
      <div className="head"><h1>Mi cuenta</h1></div>
      <p className="mut" style={{ margin: "6px 0 20px" }}>{user.email} · {ROLE_LABEL[user.role]}</p>
      <div className="acc">
        <PasswordForm />
        <SignatureField signature={signature} sello={selloDataUri()} />
      </div>
      <h2>Así saldrá en el PDF</h2>
      <iframe
        className="pdfpreview" title="Pie de la última hoja del PDF"
        srcDoc={previewDoc(signature ? { name: user.name, signature } : null)}
      />
    </>
  );
}
