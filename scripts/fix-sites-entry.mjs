import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const entryFile = resolve("dist/server/index.js");
const serverFile = resolve("dist/server/server.cjs");
mkdirSync(dirname(entryFile), { recursive: true });

copyFileSync(resolve("dist/server.js"), serverFile);
writeFileSync(entryFile, 'import "./server.cjs";\n');
