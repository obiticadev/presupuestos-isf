import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { auth } from "@/modules/auth/auth";
import type { CurrentUser, Role } from "@/modules/auth/session";

/** 40×20 PNG with a blue stroke: a valid signature for tests. */
export const TEST_SIGNATURE: Uint8Array = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAACgAAAAUCAYAAAD/Rn+7AAAAdUlEQVR4nGNgGAWjgDwgrZX9HxkPtHvgAN1hg8qhhBw3oI4k5IgBdSQpFg+II0m1kCT1lPqE3NAgWh8lwU1pVBGln9w0QY20RLQZpFpGzYROdUfSIhdSxZG0LseINn8gawKi7RrIaorskKS1w3DZT297hx8AAI8Byglpo8ZOAAAAAElFTkSuQmCC",
  "base64",
);

/** Creates a user through Better Auth, the same path the app uses; with `TEST_SIGNATURE` unless `signature: false`. */
export async function makeUser(role: Role, opts: { email?: string; password?: string; signature?: false } = {}): Promise<CurrentUser> {
  const email = opts.email ?? `${role}-${randomUUID().slice(0, 8)}@isf.test`;
  const name = email.split("@")[0];
  const { user } = await auth.api.createUser({
    body: { email, name, password: opts.password ?? "contraseña-larga-1", role },
  });
  if (opts.signature !== false) await prisma.user.update({ where: { id: user.id }, data: { signature: Buffer.from(TEST_SIGNATURE) } });
  return { id: user.id, name, email, role };
}
