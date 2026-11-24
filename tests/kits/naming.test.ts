import { categoryPrefix, codePrefix, kitBaseName, matchesAutoName, uniqueName } from "@/modules/kits/naming";

test("prefijo de una categoría: 3 letras de una palabra o iniciales de varias, sin tildes ni palabras vacías", () => {
  expect(categoryPrefix("Bombas")).toBe("BOM");
  expect(categoryPrefix("Mecanismos")).toBe("MEC");
  expect(categoryPrefix("Mano de obra")).toBe("MO");
  expect(categoryPrefix("Válvulas")).toBe("VAL");
  expect(categoryPrefix("Cajas para empotrar")).toBe("CE");
  expect(categoryPrefix("¿?")).toBe("");
});

test("prefijo de un artículo: el código antes del primer guion, o sus 3 primeros caracteres", () => {
  expect(codePrefix("VAL-010")).toBe("VAL");
  expect(codePrefix("MO-002")).toBe("MO");
  expect(codePrefix("ABC123")).toBe("ABC");
  expect(codePrefix("a.b-1")).toBe("AB");
});

test("nombre base: prefijos unidos por guion, sin vacíos y nunca vacío", () => {
  expect(kitBaseName("BOM", ["MAN", ""])).toBe("BOM-MAN");
  expect(kitBaseName("", ["MAN"])).toBe("MAN");
  expect(kitBaseName("", [])).toBe("CJ");
});

test("nombres repetidos: -2, -3…", () => {
  expect(uniqueName("BOM-MAN", [])).toBe("BOM-MAN");
  expect(uniqueName("BOM-MAN", ["BOM-MAN", "BOM-MAN-2"])).toBe("BOM-MAN-3");
});

test("reconoce un nombre automático con o sin sufijo", () => {
  expect(matchesAutoName("BOM-MAN", "BOM-MAN")).toBe(true);
  expect(matchesAutoName("BOM-MAN-2", "BOM-MAN")).toBe(true);
  expect(matchesAutoName("BOM-MAN-CUA", "BOM-MAN")).toBe(false);
  expect(matchesAutoName("Instalación de bomba", "BOM-MAN")).toBe(false);
});
