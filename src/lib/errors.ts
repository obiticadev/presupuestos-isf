export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para esta acción") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends Error {
  constructor(message = "No encontrado") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** Field errors keyed by field name; the message joins them for logs and tests. */
export class ValidationError extends Error {
  constructor(public issues: Record<string, string>) {
    super(Object.values(issues).join(" "));
    this.name = "ValidationError";
  }
}
