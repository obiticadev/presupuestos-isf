import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements } from "better-auth/plugins/admin/access";
import { ForbiddenError } from "@/lib/errors";
import type { CurrentUser } from "./session";

export const ac = createAccessControl(defaultStatements);

// Neither role gets permissions on the admin plugin's HTTP endpoints (/api/auth/admin/*):
// every user operation goes through src/modules/users/service.ts, which logs it, never deletes
// and keeps at least one active admin. Server-side calls without a session (CLI) still work.
export const roles = {
  admin: ac.newRole({ user: [], session: [] }),
  presupuestador: ac.newRole({ user: [], session: [] }),
};

/** The check every service runs before an admin-only operation. */
export function assertAdmin(user: CurrentUser): void {
  if (user.role !== "admin") throw new ForbiddenError();
}
