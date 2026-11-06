import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins";
import { prisma } from "@/lib/db";
import { ac, roles } from "./permissions";

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 10 },
  plugins: [
    admin({ ac, roles, defaultRole: "presupuestador", adminRoles: ["admin"] }),
    nextCookies(),
  ],
});
