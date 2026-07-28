import { describe, expect, it } from "vitest";

import {
  KnowledgeCandidateBatchSchema,
  KnowledgeCandidateSourceDescriptorSchema,
  KnowledgeRepositoryFindRequestSchema,
  parseKnowledgeCandidateBatch,
  parseKnowledgeCandidateSourceDescriptor,
  safeParseKnowledgeCandidateBatch,
} from "../src/index.js";
import { createMetadata } from "./fixtures.js";

function descriptor() {
  return {
    schemaVersion: "1.0",
    sourceId: "priority-one-memory",
    sourceType: "in_memory",
    provenance: {
      sourceType: "migration_report",
      sourceReference: "knowledge/migration-manifest.yaml",
      originalCreator: "FounderOS",
    },
  };
}

function candidate(id = "knowledge-001") {
  return {
    metadata: { ...createMetadata("knowledge"), id },
    content: "Validated FounderOS knowledge.",
  };
}

describe("KnowledgeCandidateSourceDescriptorSchema", () => {
  it("parses source identity, type, and provenance", () => {
    expect(parseKnowledgeCandidateSourceDescriptor(descriptor())).toEqual(descriptor());
  });

  it.each([
    ["missing identity", { ...descriptor(), sourceId: "" }],
    ["missing provenance", { ...descriptor(), provenance: undefined }],
    ["unknown field", { ...descriptor(), connectionString: "private" }],
  ])("rejects %s", (_label, input) => {
    expect(KnowledgeCandidateSourceDescriptorSchema.safeParse(input).success).toBe(false);
  });
});

describe("KnowledgeCandidateBatchSchema", () => {
  it("returns validated candidates with object provenance intact", () => {
    const batch = parseKnowledgeCandidateBatch({
      schemaVersion: "1.0",
      source: descriptor(),
      candidates: [candidate()],
    });

    expect(batch.candidates[0]?.metadata.source).toEqual(candidate().metadata.source);
  });

  it("supports an empty candidate source", () => {
    expect(
      KnowledgeCandidateBatchSchema.parse({
        schemaVersion: "1.0",
        source: descriptor(),
        candidates: [],
      }).candidates,
    ).toEqual([]);
  });

  it("rejects invalid candidates and duplicate identities", () => {
    expect(
      safeParseKnowledgeCandidateBatch({
        schemaVersion: "1.0",
        source: descriptor(),
        candidates: [{ metadata: {} }],
      }).success,
    ).toBe(false);

    const duplicate = {
      schemaVersion: "1.0",
      source: descriptor(),
      candidates: [candidate(), candidate()],
    };
    const result = safeParseKnowledgeCandidateBatch(duplicate);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
        "candidates.0.metadata.id",
        "candidates.1.metadata.id",
      ]);
    }
  });
});

describe("KnowledgeRepositoryFindRequestSchema", () => {
  it("accepts unique identities and rejects empty or duplicate requests", () => {
    expect(KnowledgeRepositoryFindRequestSchema.parse({ ids: ["one", "two"] })).toEqual({
      ids: ["one", "two"],
    });
    expect(KnowledgeRepositoryFindRequestSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(KnowledgeRepositoryFindRequestSchema.safeParse({ ids: ["one", "one"] }).success).toBe(
      false,
    );
  });
});
