import type { KnowledgeObjectType } from "@founderos/knowledge-schema";

import type { IngestionReport } from "./ingestion-report.js";

export const DIRECTORY_INGESTION_REPORT_VERSION = "1.0" as const;

export interface DuplicateObjectIdFinding {
  objectId: string;
  paths: string[];
}

export interface DuplicateSourceHashFinding {
  paths: string[];
  sha256: string;
}

export interface DirectoryIngestionError {
  code: "directory_read_error";
  message: string;
}

export interface DirectoryIngestionSummary {
  acceptedFiles: number;
  byObjectType: Record<KnowledgeObjectType, number>;
  rejectedFiles: number;
  totalFiles: number;
}

export interface DirectoryIngestionReport {
  conflicts: {
    duplicateObjectIds: DuplicateObjectIdFinding[];
    duplicateSourceHashes: DuplicateSourceHashFinding[];
  };
  errors: DirectoryIngestionError[];
  files: IngestionReport[];
  rootPath: string;
  schemaVersion: typeof DIRECTORY_INGESTION_REPORT_VERSION;
  status: "accepted" | "rejected";
  summary: DirectoryIngestionSummary;
}
