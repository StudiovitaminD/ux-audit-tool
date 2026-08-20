import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const sourceDir = resolve(".next/standalone");
const deployDir = resolve("deploy");

if (!existsSync(sourceDir)) {
  throw new Error("Unable to find .next/standalone after build");
}

rmSync(deployDir, { force: true, recursive: true });
mkdirSync(deployDir, { recursive: true });

cpSync(sourceDir, deployDir, { recursive: true });

if (existsSync(resolve(".next/static"))) {
  cpSync(resolve(".next/static"), resolve(deployDir, ".next/static"), {
    recursive: true,
  });
}

if (existsSync(resolve("public"))) {
  cpSync(resolve("public"), resolve(deployDir, "public"), {
    recursive: true,
  });
  rmSync(resolve(deployDir, "public/.DS_Store"), {
    force: true,
  });
}

if (existsSync(resolve(".openai"))) {
  cpSync(resolve(".openai"), resolve(deployDir, ".openai"), {
    recursive: true,
  });
}
