import { ForbiddenError, NotFoundError, ValidationError } from "./errors";

export type ActionResult = { ok: true } | { ok: false; errors: Record<string, string> };

/** Runs a service call from a Server Action and maps known errors to field messages ("_" = general). */
export async function toActionResult(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    if (error instanceof ValidationError) return { ok: false, errors: error.issues };
    if (error instanceof ForbiddenError || error instanceof NotFoundError) return { ok: false, errors: { _: error.message } };
    throw error;
  }
}
