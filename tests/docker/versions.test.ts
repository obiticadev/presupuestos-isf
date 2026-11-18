import { readFileSync } from "node:fs";

test("el Dockerfile instala el mismo playwright-core que package.json", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  expect(readFileSync("Dockerfile", "utf8").match(/playwright-core@([\d.]+)/)?.[1]).toBe({ ...pkg.dependencies, ...pkg.devDependencies }["playwright-core"]);
});
