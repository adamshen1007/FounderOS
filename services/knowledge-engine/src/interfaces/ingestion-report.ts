import type { KnowledgeObject } from "@founderos/knowledge-schema";

export type IngestionErrorCode =
  | "duplicate_object_id"
  | "duplicate_source_hash"
  | "file_read_error"
  | "missing_frontmatter"
  | "frontmatter_parse_error"
  | "frontmatter_shape_error"
  | "frontmatter_normalization_error"
  | "knowledge_validation_error";

export interface IngestionError {
  code: IngestionErrorCode;
  fieldPath?: string;
  message: string;
}

export interface SourceEvidence {
  byteLength?: number;
  path: string;
  sha256?: string;
}

export interface AcceptedIngestionReport {
  object: KnowledgeObject;
  source: Required<SourceEvidence>;
  status: "accepted";
}

export interface RejectedIngestionReport {
  errors: IngestionError[];
  source: SourceEvidence;
  status: "rejected";
}

export type IngestionReport = AcceptedIngestionReport | RejectedIngestionReport;
