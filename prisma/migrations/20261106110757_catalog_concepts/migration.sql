-- CreateTable
CREATE TABLE "Concept" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "salePrice" DECIMAL(14,4),
    "cost" DECIMAL(14,4),
    "taxId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT NOT NULL DEFAULT '',
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "supplierRef" TEXT NOT NULL DEFAULT '',
    "supplier" TEXT NOT NULL DEFAULT '',
    "listPrice" DECIMAL(14,4),
    "discountPct" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Concept_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Concept_code_key" ON "Concept"("code");

-- CreateIndex
CREATE INDEX "Concept_categoryId_idx" ON "Concept"("categoryId");

-- CreateIndex
CREATE INDEX "Concept_description_idx" ON "Concept"("description");

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Concept" ADD CONSTRAINT "Concept_taxId_fkey" FOREIGN KEY ("taxId") REFERENCES "Tax"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Semilla: los seis conceptos de 03_Catalogo.xlsx, sin validar. Debe coincidir con seedDefaults() en src/modules/settings/seed.ts.
INSERT INTO "Concept" ("id", "code", "categoryId", "description", "unitId", "salePrice", "taxId", "active", "validated", "notes", "updatedAt") VALUES
  ('concept-ser-despl', 'SER-DESPL', 'cat-servicios', 'Desplazamiento', 'unit-km', 0.30, 'iva-21', true, false, 'Origen Alcalá de Henares. Confirmar kilómetros facturables, viajes, vehículos y vigencia.', CURRENT_TIMESTAMP),
  ('concept-ser-prog', 'SER-PROG', 'cat-servicios', 'Hora de programador', 'unit-h', 50.00, 'iva-21', true, false, 'Confirmar la unidad.', CURRENT_TIMESTAMP),
  ('concept-bom-mayor75', 'BOM-MAYOR75', 'cat-bombas', 'Bomba de potencia mayor que 7,5 kW', 'unit-ud', 102.00, 'iva-21', true, false, 'Unidad por aclarar: el precio se trata como precio por bomba.', CURRENT_TIMESTAMP),
  ('concept-bom-hasta75', 'BOM-HASTA75', 'cat-bombas', 'Bomba de potencia menor o igual que 7,5 kW', 'unit-ud', 160.00, 'iva-21', true, false, 'Unidad por aclarar: el precio se trata como precio por bomba.', CURRENT_TIMESTAMP),
  ('concept-man-4x25', 'MAN-4X25', 'cat-mangueras', 'Manguera 4 hilos x 2,5 mm²', 'unit-m', 10.00, 'iva-21', true, false, 'Confirmar alcance de suministro o montaje y vigencia.', CURRENT_TIMESTAMP),
  ('concept-man-12x075', 'MAN-12X075', 'cat-mangueras', 'Manguera 12 hilos x 0,75 mm²', 'unit-m', 15.00, 'iva-21', true, false, 'Confirmar alcance de suministro o montaje y vigencia.', CURRENT_TIMESTAMP);
