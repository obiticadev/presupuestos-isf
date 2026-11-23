import type { Metadata } from "next";
import { connection } from "next/server";
import { versionLabel } from "@/lib/version";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · ISF Presupuestos" };

export default async function LoginPage() {
  await connection(); // the version label reads APP_CHANNEL at request time
  return (
    <div className="login">
      <div className="side">
        <div className="brand">
          ISF<small>INSTALACIONES ELÉCTRICAS · AUTOMATIZACIÓN Y CONTROL</small>
        </div>
        <div className="one" aria-hidden="true">
          <div className="node">CG</div>
          <div className="w"><span>Catálogo → Cliente → Presupuesto</span></div>
          <div className="node m">PDF</div>
        </div>
        <p>Herramienta interna de presupuestos. Acceso solo desde la red de la oficina.<small className="ver">{versionLabel()}</small></p>
      </div>
      <div className="form">
        <LoginForm />
      </div>
    </div>
  );
}
