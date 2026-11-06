import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";
import { ForbiddenError } from "@/lib/errors";
import type { CurrentUser } from "./session";

export const ac = createAccessControl(defaultStatements);

export const roles = {
  admin: ac.newRole(adminAc.statements),
  // No permissions over users or sessions: a presupuestador only works on quotes.
  presupuestador: ac.newRole({ user: [], session: [] }),
};

/** The check every service runs before an admin-only operation. */
export function assertAdmin(user: CurrentUser): void {
  if (user.role !== "admin") throw new ForbiddenError();
}
