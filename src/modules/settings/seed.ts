import type { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * Default rows: the single CompanySettings row (texts come from the schema defaults), IVA 21 % and the catalog lists.
 * The settings migration inserts the same rows in SQL; keep both in step.
 */
export async function seedDefaults(tx: Prisma.TransactionClient | PrismaClient): Promise<void> {
  await tx.companySettings.create({ data: { id: 1 } });
  await tx.tax.create({ data: { id: "iva-21", name: "IVA 21 %", ratePct: "21.00", isDefault: true, active: true } });
  await tx.category.createMany({ data: CATEGORIES });
  await tx.unit.createMany({ data: UNITS });
  await tx.concept.createMany({ data: CONCEPTS.map((c) => ({ ...c, taxId: "iva-21", validated: false })) });
}

// Initial catalog lists; the catalog_lists migration inserts the same rows.
const CATEGORIES = [
  { id: "cat-servicios", name: "Servicios" }, { id: "cat-personal", name: "Personal" }, { id: "cat-material", name: "Material" },
  { id: "cat-mangueras", name: "Mangueras" }, { id: "cat-bombas", name: "Bombas" },
];
const UNITS = [{ id: "unit-km", name: "km" }, { id: "unit-h", name: "h" }, { id: "unit-m", name: "m" }, { id: "unit-ud", name: "ud" }];

// The six concepts of 03_Catalogo.xlsx, not validated; the catalog_concepts migration inserts the same rows.
const BOMBA = "Unidad por aclarar: el precio se trata como precio por bomba.";
const MANGUERA = "Confirmar alcance de suministro o montaje y vigencia.";
const CONCEPTS = [
  { id: "concept-ser-despl", code: "SER-DESPL", categoryId: "cat-servicios", description: "Desplazamiento", unitId: "unit-km", salePrice: "0.30",
    notes: "Origen Alcalá de Henares. Confirmar kilómetros facturables, viajes, vehículos y vigencia." },
  { id: "concept-ser-prog", code: "SER-PROG", categoryId: "cat-servicios", description: "Hora de programador", unitId: "unit-h", salePrice: "50.00", notes: "Confirmar la unidad." },
  { id: "concept-bom-mayor75", code: "BOM-MAYOR75", categoryId: "cat-bombas", description: "Bomba de potencia mayor que 7,5 kW", unitId: "unit-ud", salePrice: "102.00", notes: BOMBA },
  { id: "concept-bom-hasta75", code: "BOM-HASTA75", categoryId: "cat-bombas", description: "Bomba de potencia menor o igual que 7,5 kW", unitId: "unit-ud", salePrice: "160.00", notes: BOMBA },
  { id: "concept-man-4x25", code: "MAN-4X25", categoryId: "cat-mangueras", description: "Manguera 4 hilos x 2,5 mm²", unitId: "unit-m", salePrice: "10.00", notes: MANGUERA },
  { id: "concept-man-12x075", code: "MAN-12X075", categoryId: "cat-mangueras", description: "Manguera 12 hilos x 0,75 mm²", unitId: "unit-m", salePrice: "15.00", notes: MANGUERA },
];
