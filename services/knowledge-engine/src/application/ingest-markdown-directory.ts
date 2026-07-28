import { lstat, readdir } from "node:fs/promises";
import { extname, join, normalize, relative, resolve, sep } from "node:path";

import type { KnowledgeObjectType } from "@founderos/knowledge-schema";

import type {
  DirectoryIngestionReport,
  DirectoryIngestionSummary,
  DuplicateObjectIdFinding,
  DuplicateSourceHashFinding,
} from "../interfaces/directory-ingestion-report.js";
import { DIRECTORY_INGESTION_REPORT_VERSION } from "../interfaces/directory-ingestion-report.js";
import type { IngestionError, IngestionReport } from "../interfaces/ingestion-report.js";
import { ingestMarkdownFile } from "./ingest-markdown.js";

const OBJECT_TYPES: KnowledgeObjectType[] = [
  "decision",
  "experiment",
  "knowledge",
  "principle",
  "project",
  "relationship",
  "research",
];

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function portablePath(path: string): string {
  return sep === "/" ? path : path.split(sep).join("/");
}

async function discoverMarkdownFiles(rootPath: string): Promise<string[]> {
  const discovered: string[] = [];

  async function visit(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, { withFileTypes: true });
    entries.sort((left, right) => compareStrings(left.name, right.name));

    for (const entry of entries) {
      const entryPath = join(directoryPath, entry.name);

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        await visit(entryPath);
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
        discovered.push(entryPath);
      }
    }
  }

  await visit(rootPath);
  return discovered;
}

function duplicateFindings(reports: IngestionReport[]): {
  duplicateObjectIds: DuplicateObjectIdFinding[];
  duplicateSourceHashes: DuplicateSourceHashFinding[];
} {
  const objectIdPaths = new Map<string, string[]>();
  const sourceHashPaths = new Map<string, string[]>();

  for (const report of reports) {
    if (report.status === "accepted") {
      const paths = objectIdPaths.get(report.object.metadata.id) ?? [];
      paths.push(report.source.path);
      objectIdPaths.set(report.object.metadata.id, paths);
    }

    if (report.source.sha256 !== undefined) {
      const paths = sourceHashPaths.get(report.source.sha256) ?? [];
      paths.push(report.source.path);
      sourceHashPaths.set(report.source.sha256, paths);
    }
  }

  return {
    duplicateObjectIds: [...objectIdPaths]
      .filter(([, paths]) => paths.length > 1)
      .map(([objectId, paths]) => ({ objectId, paths: [...paths].sort(compareStrings) }))
      .sort((left, right) => compareStrings(left.objectId, right.objectId)),
    duplicateSourceHashes: [...sourceHashPaths]
      .filter(([, paths]) => paths.length > 1)
      .map(([sha256, paths]) => ({ paths: [...paths].sort(compareStrings), sha256 }))
      .sort((left, right) => compareStrings(left.sha256, right.sha256)),
  };
}

function rejectConflicts(
  reports: IngestionReport[],
  duplicateObjectIds: DuplicateObjectIdFinding[],
  duplicateSourceHashes: DuplicateSourceHashFinding[],
): IngestionReport[] {
  const errorsByPath = new Map<string, IngestionError[]>();

  const addError = (path: string, error: IngestionError): void => {
    errorsByPath.set(path, [...(errorsByPath.get(path) ?? []), error]);
  };

  for (const finding of duplicateObjectIds) {
    for (const path of finding.paths) {
      addError(path, {
        code: "duplicate_object_id",
        fieldPath: "metadata.id",
        message: `Object ID ${finding.objectId} is duplicated by: ${finding.paths.join(", ")}`,
      });
    }
  }

  for (const finding of duplicateSourceHashes) {
    for (const path of finding.paths) {
      addError(path, {
        code: "duplicate_source_hash",
        fieldPath: "source.sha256",
        message: `Source hash ${finding.sha256} is duplicated by: ${finding.paths.join(", ")}`,
      });
    }
  }

  return reports.map((report) => {
    const conflictErrors = errorsByPath.get(report.source.path);
    if (conflictErrors === undefined) {
      return report;
    }

    return {
      errors: report.status === "rejected" ? [...report.errors, ...conflictErrors] : conflictErrors,
      source: report.source,
      status: "rejected",
    };
  });
}

function summarize(reports: IngestionReport[]): DirectoryIngestionSummary {
  const byObjectType = Object.fromEntries(OBJECT_TYPES.map((type) => [type, 0])) as Record<
    KnowledgeObjectType,
    number
  >;

  for (const report of reports) {
    if (report.status === "accepted") {
      byObjectType[report.object.metadata.objectType] += 1;
    }
  }

  const acceptedFiles = reports.filter((report) => report.status === "accepted").length;

  return {
    acceptedFiles,
    byObjectType,
    rejectedFiles: reports.length - acceptedFiles,
    totalFiles: reports.length,
  };
}

function emptySummary(): DirectoryIngestionSummary {
  return summarize([]);
}

function directoryFailure(rootPath: string, error: unknown): DirectoryIngestionReport {
  return {
    conflicts: { duplicateObjectIds: [], duplicateSourceHashes: [] },
    errors: [
      {
        code: "directory_read_error",
        message: error instanceof Error ? error.message : "Unable to read directory",
      },
    ],
    files: [],
    rootPath,
    schemaVersion: DIRECTORY_INGESTION_REPORT_VERSION,
    status: "rejected",
    summary: emptySummary(),
  };
}

export async function ingestMarkdownDirectory(
  directoryPath: string,
): Promise<DirectoryIngestionReport> {
  const rootPath = portablePath(normalize(directoryPath));
  const resolvedRoot = resolve(directoryPath);
  let filePaths: string[];

  try {
    const rootStatus = await lstat(resolvedRoot);
    if (rootStatus.isSymbolicLink() || !rootStatus.isDirectory()) {
      throw new Error("Input path must be a physical directory");
    }

    filePaths = await discoverMarkdownFiles(resolvedRoot);
  } catch (error: unknown) {
    return directoryFailure(rootPath, error);
  }

  const reports: IngestionReport[] = [];

  for (const filePath of filePaths) {
    const sourcePath = portablePath(relative(resolvedRoot, filePath));
    reports.push(await ingestMarkdownFile(filePath, sourcePath));
  }

  const conflicts = duplicateFindings(reports);
  const files = rejectConflicts(
    reports,
    conflicts.duplicateObjectIds,
    conflicts.duplicateSourceHashes,
  );
  const summary = summarize(files);

  return {
    conflicts,
    errors: [],
    files,
    rootPath,
    schemaVersion: DIRECTORY_INGESTION_REPORT_VERSION,
    status: summary.rejectedFiles === 0 ? "accepted" : "rejected",
    summary,
  };
}

export function serializeDirectoryIngestionReport(report: DirectoryIngestionReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
