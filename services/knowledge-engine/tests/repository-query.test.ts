import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { KnowledgeObject } from "@founderos/knowledge-schema";
import { beforeAll, describe, expect, it } from "vitest";

import {
  executeKnowledgeMigration,
  InMemoryKnowledgeCandidateSource,
  InMemoryKnowledgeRepository,
  queryKnowledgeObjects,
  queryKnowledgeRepository,
  serializeKnowledgeQueryResult,
} from "../src/index.js";
import { PRIORITY_ONE_QUERY_EVALUATIONS } from "./fixtures/query-evaluations.js";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
let priorityOneObjects: KnowledgeObject[] = [];

function source(objects: readonly KnowledgeObject[]) {
  return new InMemoryKnowledgeCandidateSource(
    {
      schemaVersion: "1.0",
      sourceId: "founderos-priority-one",
      sourceType: "in_memory",
      provenance: {
        sourceType: "migration_manifest",
        sourceReference: "knowledge/migration-manifest.yaml",
        originalCreator: "FounderOS",
      },
    },
    objects,
  );
}

beforeAll(async () => {
  const report = await executeKnowledgeMigration({
    manifestPath: "knowledge/migration-manifest.yaml",
    rootPath: REPOSITORY_ROOT,
  });

  expect(report.status).toBe("accepted");
  priorityOneObjects = report.documents.flatMap((document) =>
    document.status === "accepted" ? [document.object] : [],
  );
});

describe("repository-backed knowledge queries", () => {
  for (const fixture of PRIORITY_ONE_QUERY_EVALUATIONS) {
    it(`preserves the Milestone 05 ${fixture.name} evaluation`, async () => {
      const repository = await InMemoryKnowledgeRepository.create([source(priorityOneObjects)]);
      const result = await queryKnowledgeRepository(fixture.query, repository);

      expect(result.objects.map((object) => object.metadata.id)).toEqual(fixture.expectedObjectIds);
      expect(result.provenance).toEqual(
        result.objects.map((object) => ({
          objectId: object.metadata.id,
          source: object.metadata.source,
        })),
      );
    });
  }

  it("is byte-identical to the Milestone 05 candidate-array flow", async () => {
    const query = PRIORITY_ONE_QUERY_EVALUATIONS[0]!.query;
    const repository = await InMemoryKnowledgeRepository.create([
      source([...priorityOneObjects].reverse()),
    ]);

    const repositoryResult = await queryKnowledgeRepository(query, repository);
    const milestoneFiveResult = queryKnowledgeObjects(query, priorityOneObjects);

    expect(serializeKnowledgeQueryResult(repositoryResult)).toBe(
      serializeKnowledgeQueryResult(milestoneFiveResult),
    );
  });

  it("returns a valid result from an empty repository", async () => {
    const repository = await InMemoryKnowledgeRepository.create();
    const result = await queryKnowledgeRepository(
      PRIORITY_ONE_QUERY_EVALUATIONS[0]!.query,
      repository,
    );

    expect(result.objects).toEqual([]);
    expect(result.provenance).toEqual([]);
    expect(result.evaluation).toMatchObject({ candidateCount: 0, matchedCount: 0 });
  });
});
