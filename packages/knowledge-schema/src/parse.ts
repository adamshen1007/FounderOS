import {
  KnowledgeCorpusChangeSetSchema,
  KnowledgeCorpusSourceSchema,
  KnowledgeRepositorySnapshotSchema,
  type KnowledgeCorpusChangeSet,
  type KnowledgeCorpusSource,
  type KnowledgeRepositorySnapshot,
} from "./corpus.js";
import { KnowledgeMetadataSchema, type KnowledgeMetadata } from "./metadata.js";
import { KnowledgeObjectSchema, type KnowledgeObject } from "./objects.js";
import { KnowledgeQuerySchema, type KnowledgeQuery } from "./query.js";
import { KnowledgeQueryResultSchema, type KnowledgeQueryResult } from "./query-result.js";
import {
  KnowledgeCandidateBatchSchema,
  KnowledgeCandidateSourceDescriptorSchema,
  KnowledgeRepositoryFindRequestSchema,
  type KnowledgeCandidateBatch,
  type KnowledgeCandidateSourceDescriptor,
  type KnowledgeRepositoryFindRequest,
} from "./repository.js";

export function parseKnowledgeMetadata(input: unknown): KnowledgeMetadata {
  return KnowledgeMetadataSchema.parse(input);
}

export function safeParseKnowledgeMetadata(input: unknown) {
  return KnowledgeMetadataSchema.safeParse(input);
}

export function parseKnowledgeObject(input: unknown): KnowledgeObject {
  return KnowledgeObjectSchema.parse(input);
}

export function safeParseKnowledgeObject(input: unknown) {
  return KnowledgeObjectSchema.safeParse(input);
}

export function parseKnowledgeQuery(input: unknown): KnowledgeQuery {
  return KnowledgeQuerySchema.parse(input);
}

export function safeParseKnowledgeQuery(input: unknown) {
  return KnowledgeQuerySchema.safeParse(input);
}

export function parseKnowledgeQueryResult(input: unknown): KnowledgeQueryResult {
  return KnowledgeQueryResultSchema.parse(input);
}

export function safeParseKnowledgeQueryResult(input: unknown) {
  return KnowledgeQueryResultSchema.safeParse(input);
}

export function parseKnowledgeCandidateSourceDescriptor(
  input: unknown,
): KnowledgeCandidateSourceDescriptor {
  return KnowledgeCandidateSourceDescriptorSchema.parse(input);
}

export function safeParseKnowledgeCandidateSourceDescriptor(input: unknown) {
  return KnowledgeCandidateSourceDescriptorSchema.safeParse(input);
}

export function parseKnowledgeCandidateBatch(input: unknown): KnowledgeCandidateBatch {
  return KnowledgeCandidateBatchSchema.parse(input);
}

export function safeParseKnowledgeCandidateBatch(input: unknown) {
  return KnowledgeCandidateBatchSchema.safeParse(input);
}

export function parseKnowledgeRepositoryFindRequest(
  input: unknown,
): KnowledgeRepositoryFindRequest {
  return KnowledgeRepositoryFindRequestSchema.parse(input);
}

export function safeParseKnowledgeRepositoryFindRequest(input: unknown) {
  return KnowledgeRepositoryFindRequestSchema.safeParse(input);
}

export function parseKnowledgeCorpusSource(input: unknown): KnowledgeCorpusSource {
  return KnowledgeCorpusSourceSchema.parse(input);
}

export function safeParseKnowledgeCorpusSource(input: unknown) {
  return KnowledgeCorpusSourceSchema.safeParse(input);
}

export function parseKnowledgeRepositorySnapshot(input: unknown): KnowledgeRepositorySnapshot {
  return KnowledgeRepositorySnapshotSchema.parse(input);
}

export function safeParseKnowledgeRepositorySnapshot(input: unknown) {
  return KnowledgeRepositorySnapshotSchema.safeParse(input);
}

export function parseKnowledgeCorpusChangeSet(input: unknown): KnowledgeCorpusChangeSet {
  return KnowledgeCorpusChangeSetSchema.parse(input);
}

export function safeParseKnowledgeCorpusChangeSet(input: unknown) {
  return KnowledgeCorpusChangeSetSchema.safeParse(input);
}
