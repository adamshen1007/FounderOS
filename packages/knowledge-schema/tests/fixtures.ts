import type { KnowledgeObjectType } from "../src/index.js";

export function createMetadata(objectType: KnowledgeObjectType) {
  return {
    id: `${objectType}-001`,
    title: `${objectType} object`,
    objectType,
    domain: "FounderOS",
    source: {
      sourceType: "official_specification",
      sourceReference: "KnowledgeOS v1.0",
      originalCreator: "Founder",
    },
    createdAt: "2026-07-27",
    updatedAt: "2026-07-27T12:00:00Z",
    status: "active",
    confidence: "high",
    importance: "critical",
    freshness: "current",
    validationStatus: "validated",
    tags: ["KnowledgeOS"],
    relationships: [],
  } as const;
}
