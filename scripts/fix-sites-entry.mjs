import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const entryFile = resolve("dist/server/index.js");
mkdirSync(dirname(entryFile), { recursive: true });
const distManifest = resolve("dist/.next/required-server-files.json");
const nextManifest = resolve(".next/required-server-files.json");
const manifestPath = existsSync(distManifest) ? distManifest : nextManifest;

if (!existsSync(manifestPath)) {
  throw new Error("Unable to find required-server-files.json after build");
}

if (manifestPath !== distManifest) {
  mkdirSync(dirname(distManifest), { recursive: true });
  copyFileSync(manifestPath, distManifest);
}

const requiredServerFiles = JSON.parse(
  readFileSync(manifestPath, "utf8"),
);

writeFileSync(
  entryFile,
  [
    'import { existsSync } from "node:fs";',
    'import { createRequire } from "node:module";',
    'import path from "node:path";',
    "",
    'const baseDir = process.cwd();',
    'const distDir = existsSync(path.join(baseDir, ".next/required-server-files.json"))',
    '  ? baseDir',
    '  : path.join(baseDir, "dist");',
    `const nextConfig = ${JSON.stringify(requiredServerFiles.config)};`,
    "",
    'process.env.NODE_ENV = "production";',
    'process.chdir(distDir);',
    "",
    'const require = createRequire(path.join(distDir, "server/index.js"));',
    "",
    'const currentPort = parseInt(process.env.PORT, 10) || 3000;',
    'const hostname = process.env.HOSTNAME || "0.0.0.0";',
    'let keepAliveTimeout = parseInt(process.env.KEEP_ALIVE_TIMEOUT, 10);',
    "",
    "if (",
    "  Number.isNaN(keepAliveTimeout) ||",
    "  !Number.isFinite(keepAliveTimeout) ||",
    "  keepAliveTimeout < 0",
    ") {",
    "  keepAliveTimeout = undefined;",
    "}",
    "",
    'const { startServer } = require(',
    '  path.join(distDir, "node_modules/next/dist/server/lib/start-server.js"),',
    ");",
    "",
    "startServer({",
    "  dir: distDir,",
    "  isDev: false,",
    "  config: nextConfig,",
    "  hostname,",
    "  port: currentPort,",
    "  allowRetry: false,",
    "  keepAliveTimeout,",
    "}).catch((error) => {",
    "  console.error(error);",
    "  process.exit(1);",
    "});",
    "",
  ].join("\n"),
);
