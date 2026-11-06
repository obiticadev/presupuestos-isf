import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok" });
  } catch (error) {
    console.error("health: la base de datos no responde", error);
    return Response.json({ status: "error" }, { status: 503 });
  }
}
