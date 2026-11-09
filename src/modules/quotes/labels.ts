// Spanish labels and CSS classes (.st.*) for quote statuses.
export const STATUS_LABEL = { DRAFT: "Borrador", ISSUED: "Emitido", SENT: "Enviado", ACCEPTED: "Aceptado", REJECTED: "Rechazado", EXPIRED: "Caducado" } as const;
export const STATUS_CLASS = { DRAFT: "borrador", ISSUED: "emitido", SENT: "enviado", ACCEPTED: "aceptado", REJECTED: "rechazado", EXPIRED: "caducado" } as const;
export type QuoteStatusKey = keyof typeof STATUS_LABEL;
