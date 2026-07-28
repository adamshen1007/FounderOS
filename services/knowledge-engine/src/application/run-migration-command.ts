import { writeFile } from "node:fs/promises";

import type { KnowledgeMigrationReport } from "../interfaces/migration-report.js";
import { resolvePhysicalRoot, resolveSafeOutputPath } from "../infrastructure/safe-path.js";
import {
  executeKnowledgeMigration,
  serializeKnowledgeMigrationReport,
} from "./execute-knowledge-migration.js";

export interface RunMigrationCommandOptions {
  manifestPath: string;
  outputPath: string;
  rootPath: string;
}

export async function runMigrationCommand(
  options: RunMigrationCommandOptions,
): Promise<KnowledgeMigrationReport> {
  const physicalRoot = await resolvePhysicalRoot(options.rootPath);
  const outputPath = await resolveSafeOutputPath(physicalRoot, options.outputPath);
  const report = await executeKnowledgeMigration({
    manifestPath: options.manifestPath,
    rootPath: physicalRoot,
  });

  await writeFile(outputPath, serializeKnowledgeMigrationReport(report), "utf8");
  return report;
}
