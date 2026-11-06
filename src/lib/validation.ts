import type { z } from "zod";
import { ValidationError } from "./errors";

/** Parses with Zod and turns failures into a ValidationError keyed by field (first message per field). */
export function parseOrThrow<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const issues: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    issues[key] ??= issue.message;
  }
  throw new ValidationError(issues);
}
