import type { Metadata } from "next";
import { getSettings, listTaxes } from "@/modules/settings/service";
import { LogoForm, SettingsSection, TaxesTable } from "./forms";

export const metadata: Metadata = { title: "Configuración · ISF Presupuestos" };

const es = (d: { toFixed(n: number): string }) => d.toFixed(2).replace(".", ",");

export default async function ConfiguracionPage() {
  const [s, taxes] = await Promise.all([getSettings(), listTaxes({ includeInactive: true })]);

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
            { name: "address", label: "Dirección", value: s.address },
            { name: "phone", label: "Teléfono", value: s.phone },
            { name: "email", label: "Email", value: s.email, kind: "email" },
            { name: "registryText", label: "Datos registrales (pie de página)", value: s.registryText, kind: "textarea" },
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
      </div>
      <TaxesTable
        taxes={taxes.map((t) => ({ id: t.id, name: t.name, rate: es(t.ratePct), isDefault: t.isDefault, active: t.active }))}
      />
    </>
  );
}
