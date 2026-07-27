import { describe, expect, it } from "vitest";

import {
  KnowledgeMetadataSchema,
  parseKnowledgeMetadata,
  safeParseKnowledgeMetadata,
} from "../src/index.js";
import { createMetadata } from "./fixtures.js";

describe("KnowledgeMetadataSchema", () => {
  it("parses identity, classification, provenance, quality, and lifecycle metadata", () => {
    const metadata = parseKnowledgeMetadata(createMetadata("research"));

    expect(metadata).toMatchObject({
      id: "research-001",
      objectType: "research",
      status: "active",
      confidence: "high",
      importance: "critical",
    });
  });

  it("defaults tags and relationship references to empty collections", () => {
    expect(
      KnowledgeMetadataSchema.parse({
        ...createMetadata("knowledge"),
        tags: undefined,
        relationships: undefined,
      }),
    ).toMatchObject({
      tags: [],
      relationships: [],
    });
  });

  it("rejects updates that predate creation", () => {
    const result = safeParseKnowledgeMetadata({
      ...createMetadata("knowledge"),
      createdAt: "2026-07-27T12:00:00Z",
      updatedAt: "2026-07-26T12:00:00Z",
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid calendar dates", () => {
    const invalidDates = ["2026-02-31", "2026-02-31T12:00:00Z"];

    for (const createdAt of invalidDates) {
      const result = safeParseKnowledgeMetadata({
        ...createMetadata("knowledge"),
        createdAt,
      });

      expect(result.success).toBe(false);
    }
  });

  it("rejects self-referential metadata relationships", () => {
    const result = safeParseKnowledgeMetadata({
      ...createMetadata("knowledge"),
      relationships: [
        {
          targetObjectId: "knowledge-001",
          type: "related_to",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects unknown metadata fields", () => {
    const result = KnowledgeMetadataSchema.safeParse({
      ...createMetadata("knowledge"),
      undocumentedField: true,
    });

    expect(result.success).toBe(false);
  });
});
