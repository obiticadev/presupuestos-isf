import { signOut } from "@/modules/auth/actions";
import { requireUser } from "@/modules/auth/session";
import { RailLink } from "@/components/rail-link";

const ROLE_LABEL = { admin: "Administrador", presupuestador: "Presupuestador" } as const;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  return (
    <div className="app">
      <nav className="rail" aria-label="Principal">
        <div className="brand">ISF<small>PRESUPUESTOS</small></div>
        <RailLink href="/">Presupuestos</RailLink>
        <a className="off" aria-disabled="true">Clientes <span>Próximamente</span></a>
        <a className="off" aria-disabled="true">Catálogo <span>Próximamente</span></a>
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
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
