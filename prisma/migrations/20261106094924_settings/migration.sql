-- CreateTable
CREATE TABLE "CompanySettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "legalName" TEXT NOT NULL DEFAULT 'ISF Instalaciones, Servicios y Formación, S.L.',
    "taxId" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "registryText" TEXT NOT NULL DEFAULT '',
    "logoPath" TEXT,
    "letterGreeting" TEXT NOT NULL DEFAULT 'Muy Sres. Nuestros:',
    "letterIntro" TEXT NOT NULL DEFAULT 'Agradeciendo la confianza depositada en nuestra firma, tenemos el gusto de presentarle nuestra mejor oferta en referencia a',
    "letterClosing" TEXT NOT NULL DEFAULT 'Esperando que la presente oferta sea de su agrado, quedamos a su entera disposición para cuantas consultas desee realizar sin compromiso alguno por su parte.

Sin otro particular, reciba un cordial saludo.

Atentamente.',
    "letterPlace" TEXT NOT NULL DEFAULT 'Alcalá de Henares',
    "defaultExclusions" TEXT NOT NULL DEFAULT '',
    "defaultPaymentTerms" TEXT NOT NULL DEFAULT '',
    "offerValidityDays" INTEGER NOT NULL DEFAULT 30,
    "defaultMarginPct" DECIMAL(5,2) NOT NULL DEFAULT 35,
    "travelOriginText" TEXT NOT NULL DEFAULT 'Alcalá de Henares',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tax" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ratePct" DECIMAL(5,2) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Tax_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tax_name_key" ON "Tax"("name");

-- Semilla: fila única de configuración (los textos salen de los DEFAULT) e IVA 21 % por defecto.
-- Debe coincidir con seedDefaults() en src/modules/settings/seed.ts.
INSERT INTO "CompanySettings" ("id", "updatedAt") VALUES (1, CURRENT_TIMESTAMP);
INSERT INTO "Tax" ("id", "name", "ratePct", "isDefault", "active") VALUES ('iva-21', 'IVA 21 %', 21.00, true, true);
