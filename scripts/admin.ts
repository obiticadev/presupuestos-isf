// CLI de operación: crear el primer administrador y recuperar el acceso.
// Uso: pnpm admin create --email E --name N   |   pnpm admin reset-password --email E
// La contraseña se lee de ADMIN_PASSWORD o se pide por teclado sin mostrarla; nunca va en los argumentos.
import "dotenv/config";
import { parseArgs } from "node:util";
import { createAdmin, resetPassword } from "../src/modules/auth/admin-cli";
import { prisma } from "../src/lib/db";

function askHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) throw new Error("Sin terminal interactiva: define ADMIN_PASSWORD.");
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          return resolve(value);
        }
        if (ch === "\u0003") return reject(new Error("Cancelado"));
        if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
        else value += ch;
      }
    };
    stdin.on("data", onData);
  });
}

async function readPassword(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  const first = await askHidden("Contraseña: ");
  const second = await askHidden("Repite la contraseña: ");
  if (first !== second) throw new Error("Las contraseñas no coinciden.");
  return first;
}

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: { email: { type: "string" }, name: { type: "string" } },
  });
  const [command] = positionals;
  if (!values.email) throw new Error("Falta --email");

  if (command === "create") {
    if (!values.name) throw new Error("Falta --name");
    const { id } = await createAdmin({ email: values.email, name: values.name, password: await readPassword() });
    console.log(`Administrador creado (${id}).`);
  } else if (command === "reset-password") {
    await resetPassword({ email: values.email, password: await readPassword() });
    console.log("Contraseña cambiada, usuario reactivado y sesiones cerradas.");
  } else {
    throw new Error("Comandos: create --email E --name N | reset-password --email E");
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
