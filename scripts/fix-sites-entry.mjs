import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const entryFile = resolve("dist/server/index.js");
mkdirSync(dirname(entryFile), { recursive: true });

copyFileSync(resolve("dist/server.js"), entryFile);
