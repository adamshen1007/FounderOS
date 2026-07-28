import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import {
  KnowledgeObjectSchema,
  type KnowledgeMigrationManifestEntry,
  type KnowledgeObjectType,
} from "@founderos/knowledge-schema";

import { SafePathError } from "../domain/safe-path.js";
import { loadMigrationManifest } from "../infrastructure/load-migration-manifest.js";
import { resolvePhysicalRoot, resolveSafeExistingFile } from "../infrastructure/safe-path.js";
import {
  KNOWLEDGE_MIGRATION_REPORT_VERSION,
  type KnowledgeMigrationReport,
  type KnowledgeMigrationSummary,
  type MigrationDocumentReport,
  type MigrationError,
} from "../interfaces/migration-report.js";

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

function emptySummary(): KnowledgeMigrationSummary {
  return {
    acceptedDocuments: 0,
    byObjectType: Object.fromEntries(OBJECT_TYPES.map((type) => [type, 0])) as Record<
      KnowledgeObjectType,
      number
    >,
    rejectedDocuments: 0,
    totalDocuments: 0,
  };
}

function summarize(documents: MigrationDocumentReport[]): KnowledgeMigrationSummary {
  const summary = emptySummary();
  summary.totalDocuments = documents.length;

  for (const document of documents) {
    if (document.status === "accepted") {
      summary.acceptedDocuments += 1;
      summary.byObjectType[document.objectType] += 1;
    } else {
      summary.rejectedDocuments += 1;
    }
  }

  return summary;
}

function reportFailure(manifestPath: string, errors: MigrationError[]): KnowledgeMigrationReport {
  return {
    corpusId: null,
    documents: [],
    errors,
    manifestPath,
    schemaVersion: KNOWLEDGE_MIGRATION_REPORT_VERSION,
    status: "rejected",
    summary: emptySummary(),
  };
}

function reportBase(entry: KnowledgeMigrationManifestEntry) {
  return {
    destinationPath: entry.destinationPath,
    expectedSourceHash: entry.sourceHash,
    id: entry.id,
    migrationStatus: entry.migrationStatus,
    objectType: entry.objectType,
    reviewStatus: entry.reviewStatus,
    sourcePath: entry.sourcePath,
  };
}

function validationErrors(error: {
  issues: ReadonlyArray<{ message: string; path: ReadonlyArray<PropertyKey> }>;
}): MigrationError[] {
  return error.issues.map((issue) => ({
    code: "knowledge_validation_error",
    fieldPath: issue.path.length > 0 ? issue.path.map(String).join(".") : "$",
    message: issue.message,
  }));
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function migrateDocument(
  physicalRoot: string,
  entry: KnowledgeMigrationManifestEntry,
): Promise<MigrationDocumentReport> {
  const base = reportBase(entry);

  if (entry.migrationStatus !== "ready") {
    return {
      ...base,
      errors: [
        {
          code: "migration_status_not_ready",
          fieldPath: "migrationStatus",
          message: `Migration status must be ready, received ${entry.migrationStatus}`,
        },
      ],
      status: "rejected",
    };
  }

  if (entry.reviewStatus !== "approved") {
    return {
      ...base,
      errors: [
        {
          code: "review_not_approved",
          fieldPath: "reviewStatus",
          message: `Review status must be approved, received ${entry.reviewStatus}`,
        },
      ],
      status: "rejected",
    };
  }

  let resolvedSourcePath: string;
  try {
    resolvedSourcePath = await resolveSafeExistingFile(physicalRoot, entry.sourcePath);
  } catch (error: unknown) {
    return {
      ...base,
      errors: [
        {
          code: isMissingFileError(error)
            ? "source_missing"
            : error instanceof SafePathError
              ? "source_path_unsafe"
              : "source_read_error",
          message: isMissingFileError(error)
            ? `Source document does not exist: ${entry.sourcePath}`
            : error instanceof SafePathError
              ? error.message
              : `Unable to read source document: ${entry.sourcePath}`,
        },
      ],
      status: "rejected",
    };
  }

  let source: Buffer;
  try {
    source = await readFile(resolvedSourcePath);
  } catch {
    return {
      ...base,
      errors: [
        {
          code: "source_read_error",
          message: `Unable to read source document: ${entry.sourcePath}`,
        },
      ],
      status: "rejected",
    };
  }

  const actualSourceHash = createHash("sha256").update(source).digest("hex");
  const byteLength = source.byteLength;

  if (actualSourceHash !== entry.sourceHash) {
    return {
      ...base,
      actualSourceHash,
      byteLength,
      errors: [
        {
          code: "source_hash_mismatch",
          fieldPath: "sourceHash",
          message: `Expected ${entry.sourceHash} but found ${actualSourceHash}`,
        },
      ],
      status: "rejected",
    };
  }

  const candidate = {
    ...entry.objectData,
    metadata: {
      ...entry.metadata,
      id: entry.id,
      objectType: entry.objectType,
      source: {
        originalCreator: "FounderOS",
        sourceReference: entry.sourcePath,
        sourceType: "official_specification",
      },
    },
    ...(entry.objectType === "knowledge" ? { content: source.toString("utf8") } : {}),
  };
  const validation = KnowledgeObjectSchema.safeParse(candidate);

  if (!validation.success) {
    return {
      ...base,
      actualSourceHash,
      byteLength,
      errors: validationErrors(validation.error),
      status: "rejected",
    };
  }

  return {
    ...base,
    actualSourceHash,
    byteLength,
    object: validation.data,
    status: "accepted",
  };
}

export interface ExecuteKnowledgeMigrationOptions {
  manifestPath: string;
  rootPath: string;
}

export async function executeKnowledgeMigration(
  options: ExecuteKnowledgeMigrationOptions,
): Promise<KnowledgeMigrationReport> {
  let physicalRoot: string;
  try {
    physicalRoot = await resolvePhysicalRoot(options.rootPath);
  } catch (error: unknown) {
    return reportFailure(options.manifestPath, [
      {
        code: "root_path_error",
        message:
          error instanceof SafePathError
            ? error.message
            : "Unable to access the approved migration root",
      },
    ]);
  }

  const loaded = await loadMigrationManifest(physicalRoot, options.manifestPath);
  if (loaded.status === "rejected") {
    return reportFailure(options.manifestPath, loaded.errors);
  }

  const entries = [...loaded.manifest.documents].sort((left, right) =>
    compareStrings(left.sourcePath, right.sourcePath),
  );
  const documents: MigrationDocumentReport[] = [];

  for (const entry of entries) {
    documents.push(await migrateDocument(physicalRoot, entry));
  }

  const summary = summarize(documents);
  return {
    corpusId: loaded.manifest.corpusId,
    documents,
    errors: [],
    manifestPath: options.manifestPath,
    schemaVersion: KNOWLEDGE_MIGRATION_REPORT_VERSION,
    status: summary.rejectedDocuments === 0 ? "accepted" : "rejected",
    summary,
  };
}

export function serializeKnowledgeMigrationReport(report: KnowledgeMigrationReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
