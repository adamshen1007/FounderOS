import { KnowledgeMetadataSchema, type KnowledgeMetadata } from "./metadata.js";
import { KnowledgeObjectSchema, type KnowledgeObject } from "./objects.js";
import { KnowledgeQuerySchema, type KnowledgeQuery } from "./query.js";
import { KnowledgeQueryResultSchema, type KnowledgeQueryResult } from "./query-result.js";

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
