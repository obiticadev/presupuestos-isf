import type { Metadata } from "next";
import { requireUser } from "@/modules/auth/session";
import { listUsers } from "@/modules/users/service";
import { ActiveForm, DeleteForm, NameForm, NewUserForm, PasswordForm, RoleForm } from "./forms";

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
      <table className="users">
        <colgroup>
          <col style={{ width: 230 }} /><col /><col style={{ width: 280 }} /><col style={{ width: 120 }} />
          <col style={{ width: 120 }} /><col style={{ width: 120 }} /><col style={{ width: 290 }} />
        </colgroup>
        <thead>
          <tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Estado</th><th colSpan={2}>Acciones</th><th>Contraseña</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={u.active ? undefined : { opacity: 0.6 }}>
              <td style={{ fontWeight: 600 }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {u.issued ? u.name : <NameForm userId={u.id} name={u.name} />}
                  {u.id === actor.id && <span className="mut">(tú)</span>}
                </div>
              </td>
              <td>{u.email}</td>
              <td><RoleForm userId={u.id} role={u.role} /></td>
              <td>{u.active ? "Activo" : <span className="badge off">Desactivado</span>}</td>
              <td>{u.id !== actor.id && <ActiveForm userId={u.id} active={u.active} />}</td>
              <td>
                {u.id === actor.id ? null : u.issued ? (
                  <span className="mut" style={{ fontSize: 12 }}>{u.issued} {u.issued === 1 ? "emitido" : "emitidos"}</span>
                ) : (
                  <DeleteForm userId={u.id} name={u.name} drafts={u.drafts} />
                )}
              </td>
              <td><PasswordForm userId={u.id} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
