import { installationLabel } from "@/modules/clients/labels";

test("instalación y país van juntos con un punto medio", () => {
  expect(installationLabel({ installation: "EDAR Sur", country: "España" })).toBe("EDAR Sur · España");
});

test("sin el separador si falta uno de los dos", () => {
  expect(installationLabel({ installation: "EDAR Sur", country: "" })).toBe("EDAR Sur");
  expect(installationLabel({ installation: "", country: "España" })).toBe("España");
});

test("«—» si no hay instalación elegida o está vacía", () => {
  expect(installationLabel({ installation: " ", country: "" })).toBe("—");
  expect(installationLabel(null)).toBe("—");
  expect(installationLabel(undefined)).toBe("—");
});

test("se recortan los espacios", () => {
  expect(installationLabel({ installation: "  EDAR  ", country: " España " })).toBe("EDAR · España");
});
