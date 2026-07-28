import { describe, expect, it } from "vitest";

import {
  KnowledgeQueryResultSchema,
  parseKnowledgeQueryResult,
  safeParseKnowledgeQueryResult,
} from "../src/index.js";
import { createMetadata } from "./fixtures.js";

function validResult() {
  const object = {
    metadata: createMetadata("knowledge"),
    content: "FounderOS architecture knowledge.",
  };

  return {
    schemaVersion: "1.0",
    query: {
      schemaVersion: "1.0",
      queryId: "query-knowledge",
      context: { consumerId: "knowledge-engine", consumerType: "service" },
      filters: { objectTypes: ["knowledge"] },
    },
    objects: [object],
    provenance: [{ objectId: object.metadata.id, source: object.metadata.source }],
    evaluation: {
      confidence: "deterministic",
      candidateCount: 2,
      matchedCount: 1,
      appliedConstraints: ["filters.objectTypes"],
    },
  };
}

describe("KnowledgeQueryResultSchema", () => {
  it("preserves query context, objects, and matching provenance", () => {
    const result = parseKnowledgeQueryResult(validResult());

    expect(result).toMatchObject({
      query: { queryId: "query-knowledge" },
      objects: [{ metadata: { id: "knowledge-001" } }],
      provenance: [{ objectId: "knowledge-001" }],
      evaluation: { confidence: "deterministic", matchedCount: 1 },
    });
  });

  it("supports a valid empty result", () => {
    const input = validResult();
    input.objects = [];
    input.provenance = [];
    input.evaluation.matchedCount = 0;

    expect(KnowledgeQueryResultSchema.parse(input).objects).toEqual([]);
  });

  it("rejects mismatched provenance identity", () => {
    const valid = validResult();
    const input = {
      ...valid,
      provenance: [{ ...valid.provenance[0]!, objectId: "different-object" }],
    };

    expect(safeParseKnowledgeQueryResult(input).success).toBe(false);
  });

  it("rejects mismatched provenance source metadata", () => {
    const valid = validResult();
    const input = {
      ...valid,
      provenance: [
        {
          ...valid.provenance[0]!,
          source: { ...valid.provenance[0]!.source, sourceReference: "different-source.md" },
        },
      ],
    };

    expect(safeParseKnowledgeQueryResult(input).success).toBe(false);
  });

  it("rejects inconsistent result counts", () => {
    const input = validResult();
    input.evaluation.matchedCount = 2;

    expect(safeParseKnowledgeQueryResult(input).success).toBe(false);
  });

  it("rejects unsorted or duplicate returned identities", () => {
    const input = validResult();
    const duplicate = structuredClone(input.objects[0]!);
    input.objects.push(duplicate);
    input.provenance.push(structuredClone(input.provenance[0]!));
    input.evaluation.matchedCount = 2;
    input.evaluation.candidateCount = 2;

    expect(safeParseKnowledgeQueryResult(input).success).toBe(false);
  });

  it("rejects unsorted or duplicate applied constraints", () => {
    const input = validResult();
    input.evaluation.appliedConstraints = ["filters.tags", "filters.objectTypes"];

    expect(safeParseKnowledgeQueryResult(input).success).toBe(false);
  });
});
