-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_name_key" ON "Unit"("name");

-- Semilla: categorías y unidades iniciales. Debe coincidir con seedDefaults() en src/modules/settings/seed.ts.
INSERT INTO "Category" ("id", "name", "active") VALUES
  ('cat-servicios', 'Servicios', true), ('cat-personal', 'Personal', true), ('cat-material', 'Material', true),
  ('cat-mangueras', 'Mangueras', true), ('cat-bombas', 'Bombas', true);
INSERT INTO "Unit" ("id", "name", "active") VALUES
  ('unit-km', 'km', true), ('unit-h', 'h', true), ('unit-m', 'm', true), ('unit-ud', 'ud', true);
