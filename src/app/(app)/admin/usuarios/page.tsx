import type { Metadata } from "next";
import { requireUser } from "@/modules/auth/session";
import { listUsers } from "@/modules/users/service";
import { ActiveForm, NewUserForm, PasswordForm, RoleForm } from "./forms";

export const metadata: Metadata = { title: "Usuarios · ISF Presupuestos" };

export default async function UsuariosPage() {
  const actor = await requireUser();
  const users = await listUsers(actor);

  return (
    <>
      <div className="crumb">Administración</div>
      <div className="head"><h1>Usuarios</h1></div>
      <NewUserForm />
      <h2>{users.length} usuarios</h2>
      <table>
        <thead>
          <tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th>Contraseña</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={u.active ? undefined : { opacity: 0.6 }}>
              <td style={{ fontWeight: 600 }}>{u.name}{u.id === actor.id && <span className="mut"> (tú)</span>}</td>
              <td>{u.email}</td>
              <td><RoleForm userId={u.id} role={u.role} /></td>
              <td>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  {!u.active && <span className="badge off">Desactivado</span>}
                  <ActiveForm userId={u.id} active={u.active} />
                </div>
              </td>
              <td><PasswordForm userId={u.id} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
