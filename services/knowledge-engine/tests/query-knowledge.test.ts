import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { KnowledgeObject, KnowledgeQuery } from "@founderos/knowledge-schema";
import { beforeAll, describe, expect, it } from "vitest";

import {
  DuplicateKnowledgeObjectIdError,
  executeKnowledgeMigration,
  queryKnowledgeObjects,
  serializeKnowledgeQueryResult,
} from "../src/index.js";
import { PRIORITY_ONE_QUERY_EVALUATIONS } from "./fixtures/query-evaluations.js";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
let priorityOneObjects: KnowledgeObject[] = [];

function query(filters: KnowledgeQuery["filters"] = { tagMatch: "all" }): KnowledgeQuery {
  return {
    schemaVersion: "1.0",
    queryId: "query-test",
    context: {
      consumerId: "knowledge-engine-test",
      consumerType: "service",
      constraints: {},
    },
    filters,
  };
}

function decisionObject(): KnowledgeObject {
  return {
    metadata: {
      id: "decision-query-foundation",
      title: "Query foundation decision",
      objectType: "decision",
      domain: "FounderOS",
      category: "architecture",
      source: {
        sourceType: "decision_record",
        sourceReference: "docs/decisions/query-foundation.md",
        author: "FounderOS Engineering",
      },
      createdAt: "2026-07-28",
      updatedAt: "2026-07-28",
      status: "review",
      confidence: "high",
      importance: "high",
      tags: ["query", "architecture"],
      relationships: [],
    },
    context: "Milestone 05 requires deterministic query behavior.",
    problem: "Knowledge objects need a stable query contract.",
    options: ["Deterministic filters", "Semantic retrieval"],
    chosenOption: "Deterministic filters",
    reasoning: "Exact filters are the smallest trustworthy foundation.",
    expectedOutcome: "Stable query results.",
    risks: [],
    relatedProjectIds: ["founderos-core"],
    reviewDate: "2026-08-28",
    lessonsLearned: [],
  };
}

function projectObject(): KnowledgeObject {
  return {
    metadata: {
      id: "founderos-platform",
      title: "FounderOS Platform",
      objectType: "project",
      domain: "Product",
      source: {
        sourceType: "project_record",
        sourceReference: "docs/projects/founderos-platform.md",
      },
      createdAt: "2026-07-28",
      updatedAt: "2026-07-28",
      status: "active",
      confidence: "high",
      importance: "critical",
      tags: ["FounderOS"],
      relationships: [],
    },
    name: "FounderOS Platform",
    vision: "A reliable AI-native operating system foundation.",
    objectives: ["Improve founder decision quality"],
    projectStatus: "building",
    architecture: [],
    decisionIds: [],
    risks: [],
    milestones: ["KnowledgeOS Query Foundation"],
    team: [],
    relatedKnowledgeIds: [],
  };
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

describe("Priority 1 knowledge query evaluations", () => {
  for (const fixture of PRIORITY_ONE_QUERY_EVALUATIONS) {
    it(`returns the expected ${fixture.name}`, () => {
      const result = queryKnowledgeObjects(fixture.query, priorityOneObjects);

      expect(result.objects.map((object) => object.metadata.id)).toEqual(fixture.expectedObjectIds);
      expect(result.evaluation).toMatchObject({
        candidateCount: 8,
        confidence: "deterministic",
        matchedCount: fixture.expectedObjectIds.length,
      });
    });
  }
});

describe("deterministic knowledge filtering", () => {
  it("filters by metadata, source, project, and context constraints", () => {
    const result = queryKnowledgeObjects(
      {
        ...query({
          categories: ["architecture"],
          domains: ["FounderOS"],
          objectTypes: ["knowledge"],
          projects: ["FounderOS"],
          sourceReferences: [
            "docs/architecture/FounderOS_System_Architecture_Specification_v1.0.md",
          ],
          sourceTypes: ["official_specification"],
          statuses: ["active"],
          tagMatch: "all",
          tags: ["architecture", "system"],
        }),
        context: {
          consumerId: "bounded-service",
          consumerType: "service",
          constraints: {
            domains: ["FounderOS"],
            objectTypes: ["knowledge"],
            projects: ["FounderOS"],
            sourceTypes: ["official_specification"],
          },
        },
      },
      priorityOneObjects,
    );

    expect(result.objects.map((object) => object.metadata.id)).toEqual([
      "founderos-system-architecture-v1",
    ]);
    expect(result.evaluation.appliedConstraints).toEqual([
      "context.domains",
      "context.objectTypes",
      "context.projects",
      "context.sourceTypes",
      "filters.categories",
      "filters.domains",
      "filters.objectTypes",
      "filters.projects",
      "filters.sourceReferences",
      "filters.sourceTypes",
      "filters.statuses",
      "filters.tags",
    ]);
  });

  it("supports all and any tag matching", () => {
    const all = queryKnowledgeObjects(
      query({ tagMatch: "all", tags: ["architecture", "governance"] }),
      priorityOneObjects,
    );
    const any = queryKnowledgeObjects(
      query({ tagMatch: "any", tags: ["system", "constitution"] }),
      priorityOneObjects,
    );

    expect(all.objects.map((object) => object.metadata.id)).toEqual([
      "founderos-security-governance-architecture-v1",
    ]);
    expect(any.objects.map((object) => object.metadata.id)).toEqual([
      "founderos-constitution-v1",
      "founderos-system-architecture-v1",
    ]);
  });

  it("supports multiple object types and decision project references", () => {
    const result = queryKnowledgeObjects(
      query({
        objectTypes: ["decision", "knowledge"],
        projects: ["founderos-core"],
        tagMatch: "all",
      }),
      [...priorityOneObjects, decisionObject()],
    );

    expect(result.objects.map((object) => object.metadata.id)).toEqual([
      "decision-query-foundation",
    ]);
  });

  it("matches project objects by project identity and name", () => {
    const candidates = [...priorityOneObjects, projectObject()];
    const byId = queryKnowledgeObjects(
      query({ objectTypes: ["project"], projects: ["founderos-platform"], tagMatch: "all" }),
      candidates,
    );
    const byName = queryKnowledgeObjects(
      query({ objectTypes: ["project"], projects: ["FounderOS Platform"], tagMatch: "all" }),
      candidates,
    );

    expect(byId.objects.map((object) => object.metadata.id)).toEqual(["founderos-platform"]);
    expect(byName.objects.map((object) => object.metadata.id)).toEqual(["founderos-platform"]);
  });

  it("preserves exact source provenance in every result", () => {
    const result = queryKnowledgeObjects(
      query({ tagMatch: "all", tags: ["constitution"] }),
      priorityOneObjects,
    );

    expect(result.provenance).toEqual([
      {
        objectId: "founderos-constitution-v1",
        source: result.objects[0]?.metadata.source,
      },
    ]);
  });

  it("produces byte-identical results regardless of candidate order", () => {
    const input = query({ categories: ["architecture"], tagMatch: "all" });
    const first = queryKnowledgeObjects(input, priorityOneObjects);
    const second = queryKnowledgeObjects(input, [...priorityOneObjects].reverse());

    expect(serializeKnowledgeQueryResult(first)).toBe(serializeKnowledgeQueryResult(second));
  });

  it("returns a valid empty result", () => {
    const result = queryKnowledgeObjects(
      query({ statuses: ["deprecated"], tagMatch: "all" }),
      priorityOneObjects,
    );

    expect(result.objects).toEqual([]);
    expect(result.provenance).toEqual([]);
    expect(result.evaluation).toMatchObject({ candidateCount: 8, matchedCount: 0 });
  });

  it("rejects invalid queries before evaluation", () => {
    expect(() =>
      queryKnowledgeObjects(
        {
          ...query(),
          filters: { objectTypes: ["architecture"] },
        },
        priorityOneObjects,
      ),
    ).toThrow();
  });

  it("rejects invalid and duplicate candidate identities", () => {
    expect(() => queryKnowledgeObjects(query(), [{ metadata: {} }])).toThrow();
    expect(() =>
      queryKnowledgeObjects(query(), [priorityOneObjects[0], priorityOneObjects[0]]),
    ).toThrow(DuplicateKnowledgeObjectIdError);
  });
});
