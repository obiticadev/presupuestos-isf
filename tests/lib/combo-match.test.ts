import { matchItems, markParts } from "@/lib/combo-match";

const items = [
  { id: "1", code: "MAN-4X25", description: "Manguera 4 hilos x 2,5 mm²", extra: "Mangueras" },
  { id: "2", code: "BOM-HASTA75", description: "Bomba de potencia menor o igual que 7,5 kW", extra: "Bombas" },
  { id: "3", code: "SER-PROG", description: "Hora de programador", extra: "Servicios" },
  { id: "4", code: "X-1", description: "Programación", extra: "" },
];

test("busca sin distinguir mayúsculas ni tildes en código, descripción y categoría", () => {
  expect(matchItems(items, "MANGUERA").map((i) => i.id)).toEqual(["1"]);
  expect(matchItems(items, "bOmBa").map((i) => i.id)).toEqual(["2"]);
  expect(matchItems(items, "servicios").map((i) => i.id)).toEqual(["3"]);
  expect(matchItems(items, "programacion").map((i) => i.id)).toEqual(["4"]);
  expect(matchItems(items, "ser-prog").map((i) => i.id)).toEqual(["3"]);
  expect(matchItems(items, "xyz")).toEqual([]);
  expect(matchItems(items, "  ")).toHaveLength(4);
});

test("markParts parte el texto original por la coincidencia, sin descuadrarse con tildes", () => {
  expect(markParts("Programación de aguas", "acion")).toEqual(["Program", "ación", " de aguas"]);
  expect(markParts("Bomba", "zz")).toEqual(["Bomba"]);
});
