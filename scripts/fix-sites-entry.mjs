import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const entryFile = resolve("dist/server/index.js");
mkdirSync(dirname(entryFile), { recursive: true });

writeFileSync(
  entryFile,
  'require("../server.js");\n',
);
