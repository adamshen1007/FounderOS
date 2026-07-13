import { existsSync } from "node:fs";
import { localBinary, run } from "./lib.mjs";

const checks = [
  { name: "pnpm", command: "pnpm", minimumMajor: 11 },
  { name: "Pandoc", command: "pandoc", minimumMajor: 3 },
  { name: "Vale", command: "vale", minimumMajor: 3 },
];

const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor !== 24) {
  console.error(`✗ Node 24 is required; found ${process.versions.node}.`);
  process.exitCode = 1;
} else {
  console.log(`✓ Node ${process.versions.node}`);
}

for (const check of checks) {
  const result = run(check.command, ["--version"], { allowFailure: true, capture: true });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  const version = output.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (result.status !== 0 || !version) {
    console.error(`✗ ${check.name} is unavailable. See docs/05-operations/local-development.md.`);
    process.exitCode = 1;
  } else if (Number(version[1]) < check.minimumMajor) {
    console.error(`✗ ${check.name} ${version[0]} is too old; major ${check.minimumMajor}+ is required.`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${check.name} ${version[0]}`);
  }
}

if (!existsSync(localBinary("mmdc"))) {
  console.error("✗ Mermaid CLI is missing. Run pnpm install.");
  process.exitCode = 1;
} else {
  console.log("✓ Mermaid CLI installed locally");
}

if (process.exitCode) process.exit(process.exitCode);
