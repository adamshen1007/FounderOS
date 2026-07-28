import { describe, expect, it } from "vitest";

import {
  KnowledgeQuerySchema,
  parseKnowledgeQuery,
  safeParseKnowledgeQuery,
} from "../src/index.js";

function validQuery() {
  return {
    schemaVersion: "1.0",
    queryId: "query-founder-architecture",
    context: {
      consumerId: "founder",
      consumerType: "human",
      purpose: "Review active FounderOS architecture knowledge",
      constraints: {
        domains: ["FounderOS"],
      },
    },
    filters: {
      objectTypes: ["knowledge", "decision"],
      projects: ["FounderOS"],
      statuses: ["active"],
      tags: ["architecture"],
    },
  };
}

describe("KnowledgeQuerySchema", () => {
  it("parses an explicit multi-type query and normalizes defaults", () => {
    const query = parseKnowledgeQuery(validQuery());

    expect(query).toMatchObject({
      queryId: "query-founder-architecture",
      filters: {
        objectTypes: ["knowledge", "decision"],
        tagMatch: "all",
      },
    });
  });

  it("supports a minimal query with empty filters and context constraints", () => {
    const query = KnowledgeQuerySchema.parse({
      schemaVersion: "1.0",
      queryId: "query-all",
      context: { consumerId: "knowledge-engine", consumerType: "service" },
    });

    expect(query.context.constraints).toEqual({});
    expect(query.filters).toEqual({ tagMatch: "all" });
  });

  it.each([
    ["invalid object type", { filters: { objectTypes: ["architecture"] } }],
    ["invalid object status", { filters: { statuses: ["approved"] } }],
    ["empty explicit filter", { filters: { tags: [] } }],
    ["duplicate filter values", { filters: { projects: ["FounderOS", "FounderOS"] } }],
    ["unknown query field", { unsupported: true }],
  ])("rejects %s", (_label, replacement) => {
    const input = { ...validQuery(), ...replacement };

    expect(safeParseKnowledgeQuery(input).success).toBe(false);
  });
});
