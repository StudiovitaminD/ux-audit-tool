import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const entryFile = resolve("dist/server/index.js");
mkdirSync(dirname(entryFile), { recursive: true });

const serverSource = readFileSync(resolve("dist/server.js"), "utf8");
const entrySource = serverSource
  .replace(
    "const path = require('path')",
    'import path from "node:path";\nimport { fileURLToPath } from "node:url";\nconst __dirname = path.dirname(path.dirname(fileURLToPath(import.meta.url)));',
  )
  .replace("require('next')", 'await import("next")')
  .replace(
    "const { startServer } = require('next/dist/server/lib/start-server')",
    'const { startServer } = await import("next/dist/server/lib/start-server")',
  );

writeFileSync(entryFile, entrySource);
