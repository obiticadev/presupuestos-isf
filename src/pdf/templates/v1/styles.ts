// Body of the document. Header and footer are separate Chromium templates with inline styles (index.ts).
// Width fixed to the printable A4 width (210 − 2 × 18 mm) so paginate() measures what will be printed.
export const STYLES = `
:root{--ink:#0f1f1d;--green:#004742;--rule:#c9d1cb;--mut:#56645f;--band:#eef1ee}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:174mm}
body{font-family:Archivo,sans-serif;color:var(--ink);font-size:10pt;line-height:1.4;font-variant-numeric:tabular-nums;-webkit-print-color-adjust:exact;print-color-adjust:exact}

/* Hoja 1: carta. */
.letter{break-after:page}
.from{font-size:8.5pt;color:var(--mut);line-height:1.5}
.from b{color:var(--ink);font-size:9.5pt}
.to{margin:10mm 0 0 95mm;line-height:1.5}
.place{margin-top:12mm;text-align:right}
.subject{margin-top:8mm;font-weight:700}
.letter p{margin-top:5mm;max-width:160mm}

/* Hoja 2 y siguientes: partidas (variante B). paginate() reparte las filas en hojas de altura fija. */
.sheet{display:flex;flex-direction:column;overflow:hidden}
.sheet+.sheet{break-before:page}
.titlebar{padding-bottom:2.5mm;border-bottom:.75pt solid var(--rule)}
h1{font-size:14pt;font-weight:800;font-stretch:88%;line-height:1.2}
.client{color:var(--mut);font-size:9pt}
table{width:100%;border-collapse:collapse;margin-top:3mm;flex:none}
thead th{font-size:7.5pt;letter-spacing:.12em;text-transform:uppercase;text-align:left;border-bottom:1.5pt solid var(--ink);padding:1.4mm 1.5mm;font-weight:700}
td{padding:.7mm 1.5mm;line-height:1.2;border-bottom:.5pt solid var(--rule);vertical-align:top}
tr{break-inside:avoid}
.n{text-align:right;white-space:nowrap}
.p{width:14mm;font-weight:700}
.qty,.tot{width:30mm}
tr.part td{background:var(--band);font-weight:800;text-transform:uppercase;font-size:9.5pt;padding-top:1.1mm;padding-bottom:1.1mm}
tr.sub td{font-weight:700}
tr.line td:nth-child(2){padding-left:6mm}

/* Cierre al pie de la última hoja: condiciones y fecha | totales y firma y sello. */
.close{display:grid;grid-template-columns:1fr 78mm;gap:8mm;margin-top:auto;padding-top:4mm;break-inside:avoid;flex:none}
.close .left,.close .right{display:flex;flex-direction:column;gap:3mm}
.cond{display:grid;grid-template-columns:36mm 1fr;column-gap:3mm;row-gap:1.4mm}
.cond h2{font-size:8pt;letter-spacing:.12em;text-transform:uppercase;font-weight:700;padding-top:.5mm}
.cond p{white-space:pre-line;line-height:1.3}
.close .place{margin-top:auto;text-align:left;color:var(--mut)}
.totals div{display:flex;justify-content:space-between;padding:1mm 0;border-bottom:.5pt solid var(--rule)}
.totals .big{font-size:12pt;font-weight:800;border-bottom:none;border-top:1.5pt solid var(--ink);margin-top:1mm;padding-top:2mm}
.stamp{height:22mm;border:.75pt solid var(--rule);padding:1.2mm 2mm}
.stamp small{font-size:7pt;letter-spacing:.12em;text-transform:uppercase;color:var(--mut);font-weight:700}

/* Borrador: Chromium repite los elementos fijos en cada hoja impresa. 80 pt: los 96 de la maqueta (hoja de 210 mm) no caben en los 174 mm útiles. */
.wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.wm span{transform:rotate(-35deg);font-size:80pt;font-weight:800;font-stretch:110%;letter-spacing:.06em;color:rgba(15,31,29,.07)}
`;
