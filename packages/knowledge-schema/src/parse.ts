import { KnowledgeMetadataSchema, type KnowledgeMetadata } from "./metadata.js";
import { KnowledgeObjectSchema, type KnowledgeObject } from "./objects.js";

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
