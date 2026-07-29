import { describe, expect, it } from "vitest";

import {
  KnowledgeContextExclusionReasonSchema,
  KnowledgeContextLogicalSourceIdentifierSchema,
  KnowledgeContextRequestSchema,
} from "../src/index.js";

function request() {
  return {
    schemaVersion: "1.0",
    requestId: "context-request-1",
    purpose: "Assemble governed architecture context",
    consumer: { consumerId: "context-service", consumerType: "service" },
    query: {
      schemaVersion: "1.0",
      queryId: "context-query-1",
      context: { consumerId: "context-service", consumerType: "service", constraints: {} },
      filters: { tagMatch: "all" },
    },
    requiredObjectIds: [],
    requiredObjectTypes: ["knowledge"],
    preferredObjectTypes: ["decision"],
    scope: { domains: ["FounderOS"] },
    assemblyPolicyVersion: "1.0",
    budget: {
      maxObjectCount: 4,
      maxCanonicalCharacters: 8_000,
      perObjectCharacterLimit: 4_000,
      allowTruncation: false,
      requiredObjectFailureBehavior: "fail",
      emptyContextBehavior: "fail",
    },
    reason: "Use only approved knowledge for a deterministic decision input",
  };
}

describe("KnowledgeContextRequestSchema", () => {
  it("parses a strict, versioned, model-independent request", () => {
    expect(KnowledgeContextRequestSchema.parse(request())).toMatchObject({
      schemaVersion: "1.0",
      assemblyPolicyVersion: "1.0",
    });
  });

  it.each([
    ["unknown field", { unknown: true }],
    ["unsupported version", { schemaVersion: "2.0" }],
    ["non-positive object budget", { budget: { ...request().budget, maxObjectCount: 0 } }],
    [
      "unbounded character budget",
      { budget: { ...request().budget, maxCanonicalCharacters: Infinity } },
    ],
    ["duplicate required IDs", { requiredObjectIds: ["one", "one"] }],
    ["unsupported policy", { assemblyPolicyVersion: "2.0" }],
  ])("rejects %s", (_name, override) => {
    expect(() => KnowledgeContextRequestSchema.parse({ ...request(), ...override })).toThrow();
  });

  it("rejects contradictory consumer and type policy", () => {
    expect(() =>
      KnowledgeContextRequestSchema.parse({
        ...request(),
        consumer: { consumerId: "another-service", consumerType: "service" },
      }),
    ).toThrow(/consumer/i);
    expect(() =>
      KnowledgeContextRequestSchema.parse({
        ...request(),
        preferredObjectTypes: ["knowledge"],
      }),
    ).toThrow(/overlap/i);
    expect(() =>
      KnowledgeContextRequestSchema.parse({
        ...request(),
        query: {
          ...request().query,
          filters: { tagMatch: "all", objectTypes: ["decision"] },
        },
      }),
    ).toThrow(/requiredObjectTypes/i);
    expect(() =>
      KnowledgeContextRequestSchema.parse({
        ...request(),
        scope: { projects: ["project-a"] },
        query: {
          ...request().query,
          filters: { tagMatch: "all", projects: ["project-b"] },
        },
      }),
    ).toThrow(/Project scope/i);
  });

  it("rejects unsupported evidence reasons and physical or traversing source paths", () => {
    expect(KnowledgeContextExclusionReasonSchema.safeParse("model_relevance").success).toBe(false);
    expect(KnowledgeContextLogicalSourceIdentifierSchema.parse("docs/governance/spec.md")).toBe(
      "docs/governance/spec.md",
    );
    expect(
      KnowledgeContextLogicalSourceIdentifierSchema.safeParse("/Users/adam/spec.md").success,
    ).toBe(false);
    expect(
      KnowledgeContextLogicalSourceIdentifierSchema.safeParse("docs/../secret.md").success,
    ).toBe(false);
    for (const unsafe of [
      "C:/Users/adam/spec.md",
      "file://server/spec.md",
      "https://example.com/spec.md",
      "//server/share/spec.md",
      "docs/spec\0.md",
      "docs\\spec.md",
    ]) {
      expect(KnowledgeContextLogicalSourceIdentifierSchema.safeParse(unsafe).success).toBe(false);
    }
    expect(() =>
      KnowledgeContextRequestSchema.parse({
        ...request(),
        query: {
          ...request().query,
          filters: { tagMatch: "all", sourceReferences: ["/Users/adam/private.md"] },
        },
      }),
    ).toThrow(/repository-logical/i);
  });
});
