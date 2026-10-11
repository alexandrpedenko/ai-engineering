// Copies fixtures/sample-project to .data/sample-project once, so `npm run
// dev:sample` works on a copy and never edits the fixture.
import { cp, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(root, ".data/sample-project");
try {
  await stat(target);
  console.log(`using ${target}`);
} catch {
  await cp(join(root, "fixtures/sample-project"), target, { recursive: true });
  console.log(`copied the sample project to ${target}`);
}
