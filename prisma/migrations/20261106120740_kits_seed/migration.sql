-- Semilla: el conjunto de ejemplo de la spec 5.3. Debe coincidir con seedDefaults() en src/modules/settings/seed.ts.
INSERT INTO "KitTemplate" ("id", "name", "description", "active", "definition", "updatedAt") VALUES
  ('kit-bomba', 'Instalación de bomba', 'Bomba con la manguera hasta el cuadro: los metros salen de la distancia.', true,
   '{"main":{"categoryId":"cat-bombas","label":"Bomba"},"params":[{"key":"distancia","label":"Distancia al cuadro","unit":"m","required":true}],"components":[{"slot":"c1","label":"Manguera","ref":{"categoryId":"cat-mangueras"},"required":true,"formula":{"type":"PER_QTY_AND_PARAM","param":"distancia","k":"1"}}]}',
   CURRENT_TIMESTAMP);
