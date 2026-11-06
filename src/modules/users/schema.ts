import { z } from "zod";

export const roleSchema = z.enum(["admin", "presupuestador"], { error: "Rol no válido" });

export const createUserInput = z.object({
  name: z.string().trim().min(1, "Escribe el nombre").max(100, "Máximo 100 caracteres"),
  email: z.email("Email no válido").trim().toLowerCase(),
  role: roleSchema,
  password: z.string().min(10, "La contraseña debe tener al menos 10 caracteres"),
});

export type CreateUserInput = z.input<typeof createUserInput>;
