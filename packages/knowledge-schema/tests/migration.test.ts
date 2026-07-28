import { describe, expect, it } from "vitest";

import { KnowledgeMigrationManifestSchema } from "../src/index.js";

function validManifest() {
  return {
    schemaVersion: "1.0",
    corpusId: "founderos-priority-1",
    documents: [
      {
        id: "founderos-constitution-v1",
        objectType: "knowledge",
        sourcePath: "docs/governance/FounderOS_Constitution_v1.0.md",
        destinationPath: "knowledge/governance/founderos-constitution-v1.md",
        sourceHash: "a".repeat(64),
        migrationStatus: "ready",
        reviewStatus: "approved",
        metadata: {
          title: "FounderOS Constitution v1.0",
          domain: "FounderOS",
          createdAt: "2026-07-27",
          updatedAt: "2026-07-27",
          status: "active",
          confidence: "high",
          importance: "critical",
        },
      },
    ],
  };
}

describe("KnowledgeMigrationManifestSchema", () => {
  it("parses a strict, reviewed migration contract", () => {
    const manifest = KnowledgeMigrationManifestSchema.parse(validManifest());

    expect(manifest.documents[0]).toMatchObject({
      id: "founderos-constitution-v1",
      migrationStatus: "ready",
      objectData: {},
      reviewStatus: "approved",
    });
    expect(manifest.documents[0]?.metadata.tags).toEqual([]);
  });

  it("rejects every duplicate object ID", () => {
    const input = validManifest();
    input.documents.push({
      ...input.documents[0]!,
      destinationPath: "knowledge/governance/duplicate.md",
    });

    const result = KnowledgeMigrationManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
        "documents.0.id",
        "documents.1.id",
      ]);
    }
  });

  it.each([
    ["invalid object type", { objectType: "architecture" }],
    [
      "invalid metadata",
      { metadata: { ...validManifest().documents[0]!.metadata, status: "validated" } },
    ],
    ["invalid hash", { sourceHash: "not-a-hash" }],
    ["unsafe source path", { sourcePath: "../outside.md" }],
    ["unsafe destination path", { destinationPath: "/tmp/object.md" }],
  ])("rejects %s", (_label, replacement) => {
    const input = validManifest();
    input.documents[0] = { ...input.documents[0]!, ...replacement };

    expect(KnowledgeMigrationManifestSchema.safeParse(input).success).toBe(false);
  });

  it("rejects duplicate logical destination paths", () => {
    const input = validManifest();
    input.documents.push({
      ...input.documents[0]!,
      id: "founderos-design-principles-v1",
    });

    const result = KnowledgeMigrationManifestSchema.safeParse(input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((issue) => issue.path.join("."))).toEqual([
        "documents.0.destinationPath",
        "documents.1.destinationPath",
      ]);
    }
  });
});
