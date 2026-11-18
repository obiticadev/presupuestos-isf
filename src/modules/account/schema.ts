import { z } from "zod";

export const passwordInput = z
  .object({
    current: z.string().min(1, "Escribe tu contraseña actual"),
    next: z.string().min(10, "La contraseña debe tener al menos 10 caracteres"),
    repeat: z.string(),
  })
  .refine((v) => v.repeat === v.next, { path: ["repeat"], message: "Las contraseñas no coinciden" });

export type PasswordInput = z.input<typeof passwordInput>;
