import type {
  KnowledgeObject,
  KnowledgeObjectType,
  MigrationStatus,
  ReviewStatus,
} from "@founderos/knowledge-schema";

export const KNOWLEDGE_MIGRATION_REPORT_VERSION = "1.0" as const;

export type MigrationErrorCode =
  | "root_path_error"
  | "manifest_path_unsafe"
  | "manifest_read_error"
  | "manifest_parse_error"
  | "manifest_validation_error"
  | "source_path_unsafe"
  | "source_missing"
  | "source_read_error"
  | "source_hash_mismatch"
  | "migration_status_not_ready"
  | "review_not_approved"
  | "knowledge_validation_error";

export interface MigrationError {
  code: MigrationErrorCode;
  fieldPath?: string;
  message: string;
}

interface MigrationDocumentReportBase {
  destinationPath: string;
  expectedSourceHash: string;
  id: string;
  migrationStatus: MigrationStatus;
  objectType: KnowledgeObjectType;
  reviewStatus: ReviewStatus;
  sourcePath: string;
}

export interface AcceptedMigrationDocumentReport extends MigrationDocumentReportBase {
  actualSourceHash: string;
  byteLength: number;
  object: KnowledgeObject;
  status: "accepted";
}

export interface RejectedMigrationDocumentReport extends MigrationDocumentReportBase {
  actualSourceHash?: string;
  byteLength?: number;
  errors: MigrationError[];
  status: "rejected";
}

export type MigrationDocumentReport =
  AcceptedMigrationDocumentReport | RejectedMigrationDocumentReport;

export interface KnowledgeMigrationSummary {
  acceptedDocuments: number;
  byObjectType: Record<KnowledgeObjectType, number>;
  rejectedDocuments: number;
  totalDocuments: number;
}

export interface KnowledgeMigrationReport {
  corpusId: string | null;
  documents: MigrationDocumentReport[];
  errors: MigrationError[];
  manifestPath: string;
  schemaVersion: typeof KNOWLEDGE_MIGRATION_REPORT_VERSION;
  status: "accepted" | "rejected";
  summary: KnowledgeMigrationSummary;
}
