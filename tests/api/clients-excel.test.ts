import ExcelJS from "exceljs";
import { GET as exportar } from "@/app/api/clientes/exportar/route";
import { GET as plantilla } from "@/app/api/clientes/plantilla/route";
import { XLSX_TYPE } from "@/modules/catalog/excel";
import { getCurrentUser } from "@/modules/auth/session";
import { createClient } from "@/modules/clients/service";
import { makeUser } from "../helpers/users";

vi.mock("@/modules/auth/session", async (orig) => ({ ...(await orig<typeof import("@/modules/auth/session")>()), getCurrentUser: vi.fn() }));

test("exportar sin sesión da 401", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(null);
  expect((await exportar()).status).toBe(401);
  expect((await plantilla()).status).toBe(401);
});

test("exportar con sesión devuelve un .xlsx con las hojas de clientes", async () => {
  const p = await makeUser("presupuestador");
  vi.mocked(getCurrentUser).mockResolvedValue(p);
  await createClient(p, { legalName: "Aguas del Sur", taxId: "B12345678" });
  const res = await exportar();
  expect(res.headers.get("content-type")).toBe(XLSX_TYPE);
  expect(res.headers.get("content-disposition")).toMatch(/filename="clientes-\d{4}-\d{2}-\d{2}\.xlsx"/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await res.arrayBuffer());
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Clientes", "Contactos", "Instalaciones", "Instrucciones"]);
  expect(wb.getWorksheet("Clientes")!.getCell("A2").value).toBe("B12345678");
});

test("la plantilla se descarga con sesión", async () => {
  vi.mocked(getCurrentUser).mockResolvedValue(await makeUser("presupuestador"));
  const res = await plantilla();
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toContain('filename="plantilla-clientes.xlsx"');
});
