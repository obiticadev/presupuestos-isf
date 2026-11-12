-- Rename keeps the stored values (spec, block 2.1): Localidad -> Instalación, Provincia -> País.
ALTER TABLE "ClientLocation" RENAME COLUMN "city" TO "installation";
ALTER TABLE "ClientLocation" RENAME COLUMN "province" TO "country";
