import { describe, expect, it } from "vitest";

import { FrontmatterNormalizationError, normalizeFrontmatter } from "../src/index.js";

describe("normalizeFrontmatter", () => {
  it("maps specification-style metadata and nested relationship keys", () => {
    const normalized = normalizeFrontmatter(
      {
        id: "knowledge-001",
        title: "Knowledge",
        object_type: "knowledge",
        domain: "FounderOS",
        source_type: "conversation",
        source_reference: "thread-001",
        original_creator: "Founder",
        created_at: "2026-07-27",
        updated_at: "2026-07-27",
        status: "active",
        confidence: "high",
        importance: "high",
        relationships: [
          {
            target_object_id: "decision-001",
            type: "supports",
          },
        ],
      },
      "Body",
      "vault/knowledge.md",
    );

    expect(normalized).toMatchObject({
      content: "Body",
      metadata: {
        objectType: "knowledge",
        createdAt: "2026-07-27",
        source: {
          sourceType: "conversation",
          sourceReference: "thread-001",
          originalCreator: "Founder",
        },
        relationships: [{ targetObjectId: "decision-001", type: "supports" }],
      },
    });
  });

  it("adds Markdown provenance when source metadata is absent", () => {
    const normalized = normalizeFrontmatter({ type: "knowledge" }, "Body", "vault/knowledge.md");

    expect(normalized).toMatchObject({
      metadata: {
        source: {
          sourceType: "markdown",
          sourceReference: "vault/knowledge.md",
        },
      },
    });
  });

  it("rejects key collisions after snake-case normalization", () => {
    expect(() =>
      normalizeFrontmatter(
        {
          created_at: "2026-07-27",
          createdAt: "2026-07-28",
        },
        "Body",
        "vault/collision.md",
      ),
    ).toThrowError(FrontmatterNormalizationError);
  });

  it("rejects conflicting metadata aliases", () => {
    expect(() =>
      normalizeFrontmatter(
        {
          type: "knowledge",
          object_type: "decision",
        },
        "Body",
        "vault/conflict.md",
      ),
    ).toThrowError(expect.objectContaining({ fieldPath: "objectType" }));
  });

  it("rejects conflicts between nested and flat source metadata", () => {
    expect(() =>
      normalizeFrontmatter(
        {
          type: "knowledge",
          source: { source_type: "article" },
          source_type: "conversation",
        },
        "Body",
        "vault/source-conflict.md",
      ),
    ).toThrowError(expect.objectContaining({ fieldPath: "source.sourceType" }));
  });

  it("rejects keys that could mutate object prototypes", () => {
    const unsafe = JSON.parse('{"constructor":{"prototype":{"admin":true}}}') as Record<
      string,
      unknown
    >;

    expect(() => normalizeFrontmatter(unsafe, "Body", "vault/unsafe.md")).toThrowError(
      expect.objectContaining({ fieldPath: "" }),
    );
  });
});
