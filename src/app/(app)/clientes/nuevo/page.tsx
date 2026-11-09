import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/modules/auth/session";
import { getSettings } from "@/modules/settings/service";
import { ClientForm } from "../forms";

export const metadata: Metadata = { title: "Nuevo cliente · ISF Presupuestos" };

export default async function NuevoClientePage() {
  await requireUser();
  const settings = await getSettings();
  return (
    <>
      <div className="crumb"><Link href="/clientes">Clientes</Link> / Nuevo</div>
      <div className="head"><h1>Nuevo cliente</h1></div>
      <ClientForm client={null} cancelHref="/clientes" defaultValidity={settings.offerValidityDays} />
    </>
  );
}
