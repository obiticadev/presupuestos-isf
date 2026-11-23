import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { todayMadrid } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { listCategories, listUnits } from "@/modules/catalog/lists";
import { listConceptOptions } from "@/modules/catalog/service";
import { addRequiredConceptAction, removeRequiredConceptAction } from "@/modules/quotes/actions";
import { formatReference } from "@/modules/quotes/numbering";
import { listRequiredConcepts } from "@/modules/quotes/service";
import { formatTypeCode, listQuoteTypes } from "@/modules/quotes/types";
import { getSettings, listTaxes } from "@/modules/settings/service";
import { AutoTable, DangerZone, LogoForm, SettingsSection, TaxesTable } from "./forms";

export const metadata: Metadata = { title: "Configuración · ISF Presupuestos" };

const es = (d: { toFixed(n: number): string }) => d.toFixed(2).replace(".", ",");

export default async function ConfiguracionPage() {
  const [s, taxes, categories, units, types, required, concepts, quoteCount] = await Promise.all([
    getSettings(), listTaxes({ includeInactive: true }), listCategories({ includeInactive: true }), listUnits({ includeInactive: true }),
    listQuoteTypes({ includeInactive: true }), listRequiredConcepts(), listConceptOptions(), prisma.quote.count(),
  ]);
  const rows = (l: { id: string; name: string; active: boolean; code?: number; _count: { concepts?: number; quotes?: number } }[]) =>
    l.map((r) => ({ id: r.id, name: r.name, code: r.code === undefined ? undefined : formatTypeCode(r.code), active: r.active, used: (r._count.concepts ?? r._count.quotes ?? 0) > 0 }));
  const year = todayMadrid().getUTCFullYear();
  const addable = concepts.filter((c) => c.active && !required.some((r) => r.conceptId === c.id));

  return (
    <>
      <div className="crumb">Administración</div>
      <div className="head"><h1>Configuración</h1></div>
      <div className="grid2" style={{ alignItems: "start" }}>
        <SettingsSection
          title="Empresa"
          fields={[
            { name: "legalName", label: "Razón social", value: s.legalName },
            { name: "taxId", label: "CIF", value: s.taxId },
            { name: "address", label: "Dirección", value: s.address, kind: "textarea" },
            { name: "phone", label: "Teléfono", value: s.phone },
            { name: "email", label: "Email", value: s.email, kind: "email" },
            { name: "registryText", label: "Datos registrales (pie de página)", value: s.registryText },
          ]}
        />
        <div>
          <LogoForm logoVersion={s.logoPath ? s.updatedAt.getTime() : null} />
          <SettingsSection
            title="Margen y desplazamiento"
            fields={[
              { name: "defaultMarginPct", label: "Margen por defecto (%)", value: es(s.defaultMarginPct), kind: "decimal" },
              { name: "travelOriginText", label: "Origen habitual del desplazamiento", value: s.travelOriginText },
            ]}
          />
        </div>
        <SettingsSection
          title="Textos de la carta"
          fields={[
            { name: "letterGreeting", label: "Saludo", value: s.letterGreeting },
            { name: "letterIntro", label: "Introducción", value: s.letterIntro, kind: "textarea" },
            { name: "letterClosing", label: "Despedida", value: s.letterClosing, kind: "textarea" },
            { name: "letterPlace", label: "Lugar de la firma", value: s.letterPlace },
          ]}
        />
        <SettingsSection
          title="Condiciones por defecto"
          fields={[
            { name: "defaultExclusions", label: "Exclusiones", value: s.defaultExclusions, kind: "textarea" },
            { name: "defaultPaymentTerms", label: "Forma de pago", value: s.defaultPaymentTerms, kind: "textarea" },
            { name: "offerValidityDays", label: "Validez de la oferta (días)", value: String(s.offerValidityDays), kind: "days" },
          ]}
        />
        <SettingsSection
          title="Numeración"
          fields={[
            { name: "numberPattern", label: "Patrón ({AAAA} año, {TTT} tipo, {NNN} número, {RR} revisión)", value: s.numberPattern },
            { name: "numberYearlyReset", label: "Reiniciar la numeración cada año", value: s.numberYearlyReset ? "si" : "no", kind: "yesno" },
            { name: "numberStart", label: "Valor inicial", value: String(s.numberStart), kind: "days" },
          ]}
        >
          <p className="mut" style={{ fontSize: 13 }}>
            Ejemplo con lo guardado: <b className="code">{formatReference(s.numberPattern, { year, typeCode: 1, seq: s.numberStart, extension: 0, revision: 0 })}</b>.
            Cada tipo lleva su propio contador; el valor inicial solo cuenta cuando aún no se ha emitido ningún presupuesto de ese tipo{s.numberYearlyReset ? " ese año" : ""}.
          </p>
        </SettingsSection>
        <section>
          <h2>Conceptos obligatorios</h2>
          <div className="sheet" style={{ display: "grid", gap: 12 }}>
            <p className="mut" style={{ fontSize: 13 }}>Todo presupuesto debe incluirlos con cantidad mayor que cero, o marcarlos a 0 con motivo, para poder emitirse.</p>
            {required.length === 0 && <p className="mut">Ninguno.</p>}
            {required.map((r) => (
              <ActionForm key={r.conceptId} action={removeRequiredConceptAction} style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between" }}>
                <span><span className="code">{r.concept.code}</span> · {r.concept.description}</span>
                <input type="hidden" name="conceptId" value={r.conceptId} />
                <button className="btn">Quitar</button>
              </ActionForm>
            ))}
            {addable.length > 0 && (
              <ActionForm action={addRequiredConceptAction} reset style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label className="field" style={{ flex: 1, minWidth: 0 }}>
                  <select name="conceptId" required defaultValue="" aria-label="Concepto obligatorio que añadir">
                    <option value="" disabled>Elige un concepto activo…</option>
                    {addable.map((c) => <option key={c.id} value={c.id}>{c.code} · {c.description}</option>)}
                  </select>
                </label>
                <button className="btn pri">Añadir</button>
              </ActionForm>
            )}
          </div>
        </section>
      </div>
      <TaxesTable
        taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: es(t.ratePct), isDefault: t.isDefault, active: t.active }))}
      />
      <div className="grid2" style={{ alignItems: "start", marginTop: 24 }}>
        <AutoTable kind="type" title="Tipos de presupuesto" rows={rows(types)} />
        <AutoTable kind="category" title="Categorías del catálogo" rows={rows(categories)} />
        <AutoTable kind="unit" title="Unidades de cobro" rows={rows(units)} />
      </div>
      <DangerZone count={quoteCount} />
    </>
  );
}
