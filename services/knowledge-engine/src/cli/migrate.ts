import { runMigrationCommand } from "../application/run-migration-command.js";

interface MigrationArguments {
  manifestPath: string;
  outputPath: string;
  rootPath: string;
}

function parseArguments(arguments_: string[]): MigrationArguments {
  const normalizedArguments = arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  const values = new Map<string, string>();

  for (let index = 0; index < normalizedArguments.length; index += 2) {
    const key = normalizedArguments[index];
    const value = normalizedArguments[index + 1];
    if (key === undefined || value === undefined || !key.startsWith("--")) {
      throw new Error(
        "Usage: migrate --root <path> --manifest <relative-path> --output <relative-path>",
      );
    }
    values.set(key, value);
  }

  const rootPath = values.get("--root");
  const manifestPath = values.get("--manifest");
  const outputPath = values.get("--output");
  if (rootPath === undefined || manifestPath === undefined || outputPath === undefined) {
    throw new Error(
      "Usage: migrate --root <path> --manifest <relative-path> --output <relative-path>",
    );
  }

  return { manifestPath, outputPath, rootPath };
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  const report = await runMigrationCommand(arguments_);

  process.stdout.write(
    `Migration ${report.status}: ${report.summary.acceptedDocuments} accepted, ${report.summary.rejectedDocuments} rejected. Report: ${arguments_.outputPath}\n`,
  );
  if (report.status === "rejected") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Migration failed"}\n`);
  process.exitCode = 1;
});
