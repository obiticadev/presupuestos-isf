import { signOut } from "@/modules/auth/actions";
import { requireUser } from "@/modules/auth/session";
import { MobileMenuButton } from "@/components/mobile-menu";
import { RailLink } from "@/components/rail-link";
import { versionLabel } from "@/lib/version";

const ROLE_LABEL = { admin: "Administrador", presupuestador: "Presupuestador" } as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="app">
      <nav className="rail" aria-label="Principal">
        <div className="brand">ISF<small>PRESUPUESTOS</small></div>
        <MobileMenuButton />
        <div id="rail-links" className="links">
        <RailLink href="/">Presupuestos</RailLink>
        <RailLink href="/clientes">Clientes</RailLink>
        <RailLink href="/catalogo">Catálogo</RailLink>
        <RailLink href="/conjuntos">Conjuntos</RailLink>
        <RailLink href="/cuenta">Mi cuenta</RailLink>
        {user.role === "admin" && (
          <>
            <div className="sep">Administración</div>
            <RailLink href="/admin/usuarios">Usuarios</RailLink>
            <RailLink href="/admin/configuracion">Configuración</RailLink>
            <RailLink href="/admin/historial">Historial</RailLink>
          </>
        )}
        <div className="me">
          {user.name}
          <br />
          <span style={{ color: "#a9c6bf" }}>{ROLE_LABEL[user.role]}</span>
          <form action={signOut}>
            <button type="submit">Cerrar sesión</button>
          </form>
          <small className="ver">{versionLabel()}</small>
        </div>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
