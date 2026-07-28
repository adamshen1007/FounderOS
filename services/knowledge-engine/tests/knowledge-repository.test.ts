import type { KnowledgeCandidateSource, KnowledgeObject } from "@founderos/knowledge-schema";
import { describe, expect, it } from "vitest";

import {
  DuplicateKnowledgeCandidateSourceIdError,
  DuplicateKnowledgeObjectIdError,
  InMemoryKnowledgeCandidateSource,
  InMemoryKnowledgeRepository,
} from "../src/index.js";

function descriptor(sourceId: string) {
  return {
    schemaVersion: "1.0",
    sourceId,
    sourceType: "in_memory",
    provenance: {
      sourceType: "migration_report",
      sourceReference: `reports/${sourceId}.json`,
      originalCreator: "FounderOS",
    },
  };
}

function knowledgeObject(id: string, tag = "architecture"): KnowledgeObject {
  return {
    metadata: {
      id,
      title: id,
      objectType: "knowledge",
      domain: "FounderOS",
      source: {
        sourceType: "official_specification",
        sourceReference: `docs/${id}.md`,
        originalCreator: "FounderOS",
      },
      createdAt: "2026-07-28",
      updatedAt: "2026-07-28",
      status: "active",
      confidence: "high",
      importance: "high",
      tags: [tag],
      relationships: [],
    },
    content: `${id} content`,
  };
}

describe("InMemoryKnowledgeCandidateSource", () => {
  it("validates source identity and every candidate", () => {
    expect(() => new InMemoryKnowledgeCandidateSource({ sourceId: "" }, [])).toThrow();
    expect(
      () =>
        new InMemoryKnowledgeCandidateSource(descriptor("invalid-candidates"), [{ metadata: {} }]),
    ).toThrow();
  });

  it("preserves source and object provenance without exposing mutable state", async () => {
    const input = knowledgeObject("object-one");
    const source = new InMemoryKnowledgeCandidateSource(descriptor("source-one"), [input]);
    input.metadata.title = "Mutated after construction";

    const first = await source.loadCandidates();
    first.candidates[0]!.metadata.title = "Mutated returned copy";
    const second = await source.loadCandidates();

    expect(second.source.provenance).toEqual(descriptor("source-one").provenance);
    expect(second.candidates[0]?.metadata).toMatchObject({
      title: "object-one",
      source: {
        originalCreator: "FounderOS",
        sourceReference: "docs/object-one.md",
        sourceType: "official_specification",
      },
    });
  });
});

describe("InMemoryKnowledgeRepository", () => {
  it("retrieves validated objects deterministically and looks up identity", async () => {
    const source = new InMemoryKnowledgeCandidateSource(descriptor("source-one"), [
      knowledgeObject("z-object"),
      knowledgeObject("a-object"),
    ]);
    const repository = await InMemoryKnowledgeRepository.create([source]);

    expect((await repository.getCandidates()).map((object) => object.metadata.id)).toEqual([
      "a-object",
      "z-object",
    ]);
    expect((await repository.getById("z-object"))?.metadata.id).toBe("z-object");
    expect(await repository.getById("missing-object")).toBeNull();
    expect(
      (await repository.find({ ids: ["z-object", "missing-object", "a-object"] })).map(
        (object) => object.metadata.id,
      ),
    ).toEqual(["a-object", "z-object"]);
  });

  it("supports an empty repository", async () => {
    const repository = await InMemoryKnowledgeRepository.create();

    expect(await repository.getCandidates()).toEqual([]);
    expect(await repository.getSources()).toEqual([]);
    expect(await repository.getById("missing-object")).toBeNull();
    expect(await repository.find({ ids: ["missing-object"] })).toEqual([]);
  });

  it("returns independent object copies", async () => {
    const source = new InMemoryKnowledgeCandidateSource(descriptor("source-one"), [
      knowledgeObject("object-one"),
    ]);
    const repository = await InMemoryKnowledgeRepository.create([source]);
    const first = await repository.getById("object-one");
    first!.metadata.title = "Changed by caller";

    expect((await repository.getById("object-one"))?.metadata.title).toBe("object-one");
  });

  it("exposes candidate source identity and provenance in stable order", async () => {
    const repository = await InMemoryKnowledgeRepository.create([
      new InMemoryKnowledgeCandidateSource(descriptor("z-source"), []),
      new InMemoryKnowledgeCandidateSource(descriptor("a-source"), []),
    ]);

    const sources = await repository.getSources();
    expect(sources.map((source) => source.sourceId)).toEqual(["a-source", "z-source"]);
    expect(sources[0]?.provenance.sourceReference).toBe("reports/a-source.json");
  });

  it("rejects duplicate object identities across candidate sources", async () => {
    const first = new InMemoryKnowledgeCandidateSource(descriptor("first-source"), [
      knowledgeObject("duplicate-object"),
    ]);
    const second = new InMemoryKnowledgeCandidateSource(descriptor("second-source"), [
      knowledgeObject("duplicate-object"),
    ]);

    await expect(InMemoryKnowledgeRepository.create([first, second])).rejects.toThrow(
      DuplicateKnowledgeObjectIdError,
    );
  });

  it("rejects duplicate candidate source identities", async () => {
    const first = new InMemoryKnowledgeCandidateSource(descriptor("duplicate-source"), [
      knowledgeObject("first-object"),
    ]);
    const second = new InMemoryKnowledgeCandidateSource(descriptor("duplicate-source"), [
      knowledgeObject("second-object"),
    ]);

    await expect(InMemoryKnowledgeRepository.create([first, second])).rejects.toThrow(
      DuplicateKnowledgeCandidateSourceIdError,
    );
  });

  it("revalidates candidate source output at the repository boundary", async () => {
    const invalidSource = {
      async loadCandidates() {
        return {
          schemaVersion: "1.0",
          source: descriptor("invalid-source"),
          candidates: [{ metadata: {} }],
        };
      },
    } as unknown as KnowledgeCandidateSource;

    await expect(InMemoryKnowledgeRepository.create([invalidSource])).rejects.toThrow();
  });
});
