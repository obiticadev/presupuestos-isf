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
tr.note td{font-style:italic;color:var(--mut);padding-top:0;white-space:pre-line}
tr.note.line td:nth-child(2),tr.note.kit td:nth-child(2){padding-left:6mm}
tr.note.part td{background:var(--band);padding-top:.7mm}
tr:has(+ tr.note) td{border-bottom:none}
/* A1: a dynamic kit placed in its kit, under a green uppercase title with a rule; its lines hang from a green left rule. */
tr.ghd td{border-bottom:0;padding-top:2mm}
tr.ghd td:nth-child(2){padding-left:6mm}
tr.ghd .gt{display:flex;align-items:center;gap:1.5mm;font-weight:700;font-size:10.5pt;letter-spacing:.08em;text-transform:uppercase;color:var(--green)}
tr.ghd .gt::after{content:"";flex:1;border-top:.75pt solid var(--green)}
tr.in td{border-bottom:0}
tr.in td:nth-child(2){padding-left:10mm;position:relative}
tr.in td:nth-child(2)::before{content:"";position:absolute;left:7.5mm;top:0;bottom:0;border-left:1.25pt solid var(--green)}
tr.in.lst td{border-bottom:.5pt solid var(--rule)}
/* A kit with a comment: its rows on a light green tint (not the partida's grey), closed by a dashed rule over the comment. */
tr.k td:not(:first-child){background:#edf5f2}
tr.note.kit td:not(:first-child){border-top:.5pt dashed var(--mut);padding-top:.7mm;padding-bottom:1mm}

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
/* Sello de 62 mm (860×344) con la firma encima: la firma lo rebasa, pero cabe en los 78 mm de la columna y no pisa los totales. */
.signed{position:relative;width:62mm;height:24.8mm;margin:6mm auto 0}
.signed .sello{display:block;width:100%;height:100%}
.signed .firma{position:absolute;left:50%;top:50%;width:125%;height:130%;object-fit:contain;transform:translate(-50%,-55%) rotate(-3deg)}
.fdo{font-size:7.5pt;color:var(--mut);text-align:center}

/* Borrador: Chromium repite los elementos fijos en cada hoja impresa. 80 pt: los 96 de la maqueta (hoja de 210 mm) no caben en los 174 mm útiles. */
.wm{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}
.wm span{transform:rotate(-35deg);font-size:80pt;font-weight:800;font-stretch:110%;letter-spacing:.06em;color:rgba(15,31,29,.07)}
`;
