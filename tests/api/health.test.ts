import { GET } from "@/app/api/health/route";

test("health devuelve ok con la base de datos disponible", async () => {
  const res = await GET();
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ status: "ok" });
});
