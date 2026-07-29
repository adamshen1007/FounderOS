import { describe, expect, it } from "vitest";

import { KnowledgeObjectSchema } from "@founderos/knowledge-schema";

import {
  createKnowledgeRepositorySnapshot,
  createKnowledgeSnapshotComparisonEvidence,
} from "../src/index.js";
import { corpus, CREATED_AT, document, metadata } from "./snapshot-lifecycle-fixtures.js";

describe("knowledge repository snapshot content fingerprints", () => {
  it("preserves the Milestone 07 snapshot v1 descriptor and identity", () => {
    const documents = [
      document({ metadata: metadata("knowledge", "knowledge"), content: "Knowledge" }),
    ];
    const result = createKnowledgeRepositorySnapshot({
      corpus,
      creation: { createdAt: CREATED_AT, createdBy: "founderos-engine" },
      documents,
    });

    expect(result).toMatchObject({
      snapshotId: "snapshot-dc58b54c2716fa60f63f5199012ecde3e870cf2f29d9ea2c987cf92e77b68b3b",
      contentFingerprint: "dc58b54c2716fa60f63f5199012ecde3e870cf2f29d9ea2c987cf92e77b68b3b",
      objects: [
        {
          objectId: "knowledge",
          objectType: "knowledge",
          sourcePath: "docs/knowledge.md",
          sourceHash: "646dd4852129089b7924274a6af02cc6adc3b2bc0178e0e835a67bb608368e4e",
          metadataFingerprint: "889c1d0858e3bcce719040b56951f799b455b471883c81dacc2f2ddb1cf80e01",
          objectFingerprint: "bc82e6fc5d83beadc00b0d64a17d270f656373b10f6576bd74b744d0dde7e90f",
        },
      ],
    });
    expect(Object.keys(result.objects[0]!)).toEqual([
      "objectId",
      "objectType",
      "sourcePath",
      "sourceHash",
      "metadataFingerprint",
      "objectFingerprint",
    ]);
  });

  it("preserves historical hashes for schema-valid explicit undefined optionals", () => {
    const decisionMetadata = metadata("decision-optional", "decision");
    const explicit = KnowledgeObjectSchema.parse({
      metadata: {
        ...decisionMetadata,
        category: undefined,
        source: { ...decisionMetadata.source, author: undefined },
      },
      context: "Context",
      problem: "Problem",
      options: ["A", "B"],
      chosenOption: "A",
      reasoning: "Reason",
      expectedOutcome: "Outcome",
      risks: [],
      relatedProjectIds: [],
      reviewDate: "2026-08-28T00:00:00.000Z",
      result: undefined,
      lessonsLearned: [],
    });
    const omitted = structuredClone(explicit);
    delete omitted.metadata.category;
    delete omitted.metadata.source.author;
    if (!("result" in omitted)) throw new Error("Expected a decision object");
    delete omitted.result;

    expect(Object.hasOwn(explicit, "result")).toBe(true);
    expect(Object.hasOwn(explicit.metadata, "category")).toBe(true);
    expect(Object.hasOwn(explicit.metadata.source, "author")).toBe(true);

    const creation = { createdAt: CREATED_AT, createdBy: "founderos-engine" };
    const explicitDocuments = [document(explicit)];
    const omittedDocuments = [document(omitted)];
    const explicitSnapshot = createKnowledgeRepositorySnapshot({
      corpus,
      creation,
      documents: explicitDocuments,
    });
    const omittedSnapshot = createKnowledgeRepositorySnapshot({
      corpus,
      creation,
      documents: omittedDocuments,
    });
    const explicitEvidence = createKnowledgeSnapshotComparisonEvidence({
      snapshot: explicitSnapshot,
      documents: explicitDocuments,
    });
    const omittedEvidence = createKnowledgeSnapshotComparisonEvidence({
      snapshot: omittedSnapshot,
      documents: omittedDocuments,
    });

    expect(explicitSnapshot).toEqual(omittedSnapshot);
    expect(explicitSnapshot).toMatchObject({
      snapshotId: "snapshot-8cf0bb165911eaefc37b2a06e02e9d4d5f1512b5bf875f1705e4b90a2605d00b",
      contentFingerprint: "8cf0bb165911eaefc37b2a06e02e9d4d5f1512b5bf875f1705e4b90a2605d00b",
      objects: [
        {
          objectId: "decision-optional",
          objectType: "decision",
          sourcePath: "docs/decision-optional.md",
          sourceHash: "0a058d0a4738891c486c7a93aa427268639c8ec14f0b2ca35d16d4243c702882",
          metadataFingerprint: "83726190f81d48947090c86597c11ca972db987e127fc8e2ec1717a1efa70a3d",
          objectFingerprint: "37f3e7f0dda272df23037bba818f945d93d2a194bfeba88eb180f3b401e8fa36",
        },
      ],
    });
    expect(explicitEvidence.objects[0]!.contentFingerprint).toBe(
      omittedEvidence.objects[0]!.contentFingerprint,
    );
    expect(Object.hasOwn(explicitEvidence.objects[0]!.object, "result")).toBe(true);
    expect(Object.hasOwn(explicitEvidence.objects[0]!.object.metadata, "category")).toBe(true);
    expect(Object.hasOwn(explicitEvidence.objects[0]!.object.metadata.source, "author")).toBe(true);
  });

  it("keeps metadata separate from non-metadata decision payloads", () => {
    const documents = [
      document({
        metadata: metadata("decision", "decision"),
        context: "Context",
        problem: "Problem",
        options: ["A", "B"],
        chosenOption: "A",
        reasoning: "Reason",
        expectedOutcome: "Outcome",
        risks: [],
        relatedProjectIds: [],
        reviewDate: "2026-08-28T00:00:00.000Z",
        lessonsLearned: [],
      }),
    ];
    const creation = { createdAt: CREATED_AT, createdBy: "founderos-engine" };
    const baseline = createKnowledgeRepositorySnapshot({ corpus, creation, documents });
    const metadataChanged = structuredClone(documents);
    metadataChanged[0]!.object.metadata.title = "Renamed";
    const payloadChanged = structuredClone(documents);
    if (!("chosenOption" in payloadChanged[0]!.object)) throw new Error("Expected decision object");
    payloadChanged[0]!.object.chosenOption = "B";
    const metadataSnapshot = createKnowledgeRepositorySnapshot({
      corpus,
      creation,
      documents: metadataChanged,
    });
    const payloadSnapshot = createKnowledgeRepositorySnapshot({
      corpus,
      creation,
      documents: payloadChanged,
    });
    const baselineEvidence = createKnowledgeSnapshotComparisonEvidence({
      snapshot: baseline,
      documents,
    });
    const metadataEvidence = createKnowledgeSnapshotComparisonEvidence({
      snapshot: metadataSnapshot,
      documents: metadataChanged,
    });
    const payloadEvidence = createKnowledgeSnapshotComparisonEvidence({
      snapshot: payloadSnapshot,
      documents: payloadChanged,
    });

    expect(metadataEvidence.objects[0]!.contentFingerprint).toBe(
      baselineEvidence.objects[0]!.contentFingerprint,
    );
    expect(payloadEvidence.objects[0]!.contentFingerprint).not.toBe(
      baselineEvidence.objects[0]!.contentFingerprint,
    );
    expect("contentFingerprint" in baseline.objects[0]!).toBe(false);
    expect(Object.isFrozen(baseline.objects[0])).toBe(true);
  });

  it("hashes stable changed payloads for all seven KnowledgeObject variants", () => {
    const documents = [
      document({ metadata: metadata("knowledge", "knowledge"), content: "Knowledge" }),
      document({
        metadata: metadata("decision", "decision"),
        context: "Context",
        problem: "Problem",
        options: ["A", "B"],
        chosenOption: "A",
        reasoning: "Reason",
        expectedOutcome: "Outcome",
        risks: [],
        relatedProjectIds: [],
        reviewDate: "2026-08-28T00:00:00.000Z",
        lessonsLearned: [],
      }),
      document({
        metadata: metadata("project", "project"),
        name: "Project",
        vision: "Vision",
        objectives: ["Objective"],
        projectStatus: "building",
        architecture: [],
        decisionIds: [],
        risks: [],
        milestones: ["Milestone"],
        team: [],
        relatedKnowledgeIds: [],
      }),
      document({
        metadata: metadata("research", "research"),
        question: "Question",
        sources: [{ sourceType: "official_specification" }],
        findings: ["Finding"],
        insights: [],
        implications: [],
        relatedDecisionIds: [],
      }),
      document({
        metadata: metadata("principle", "principle"),
        name: "Principle",
        statement: "Statement",
        reasoning: "Reason",
        examples: [],
        exceptions: [],
        createdFromIds: [],
      }),
      document({
        metadata: metadata("experiment", "experiment"),
        hypothesis: "Hypothesis",
        objective: "Objective",
        method: "Method",
        metrics: [{ name: "Metric" }],
      }),
      document({
        metadata: metadata("relationship", "relationship"),
        sourceObjectId: "knowledge",
        targetObjectId: "decision",
        relationshipType: "supports",
        strength: "high",
        relationshipConfidence: "validated",
      }),
    ];
    const creation = { createdAt: CREATED_AT, createdBy: "founderos-engine" };
    const baseline = createKnowledgeRepositorySnapshot({ corpus, creation, documents });
    const repeated = createKnowledgeRepositorySnapshot({
      corpus,
      creation: { createdAt: "2030-01-01T00:00:00.000Z", createdBy: "another-engine" },
      documents,
    });
    const changed = structuredClone(documents);
    const changes: Record<string, (object: Record<string, unknown>) => void> = {
      knowledge: (object) => {
        object.content = "Changed";
      },
      decision: (object) => {
        object.chosenOption = "B";
      },
      project: (object) => {
        object.name = "Changed";
      },
      research: (object) => {
        object.question = "Changed";
      },
      principle: (object) => {
        object.statement = "Changed";
      },
      experiment: (object) => {
        object.method = "Changed";
      },
      relationship: (object) => {
        object.relationshipType = "influences";
      },
    };
    for (const changedDocument of changed)
      changes[changedDocument.object.metadata.objectType]!(
        changedDocument.object as Record<string, unknown>,
      );
    const changedSnapshot = createKnowledgeRepositorySnapshot({
      corpus,
      creation,
      documents: changed,
    });
    const baselineEvidence = createKnowledgeSnapshotComparisonEvidence({
      snapshot: baseline,
      documents,
    });
    const repeatedEvidence = createKnowledgeSnapshotComparisonEvidence({
      snapshot: repeated,
      documents,
    });
    const changedEvidence = createKnowledgeSnapshotComparisonEvidence({
      snapshot: changedSnapshot,
      documents: changed,
    });

    expect(repeated.snapshotId).toBe(baseline.snapshotId);
    expect(repeatedEvidence).toEqual(baselineEvidence);
    for (const baselineObject of baselineEvidence.objects) {
      const changedObject = changedEvidence.objects.find(
        (object) => object.objectId === baselineObject.objectId,
      );
      expect(changedObject?.contentFingerprint).not.toBe(baselineObject.contentFingerprint);
      expect(changedObject?.metadataFingerprint).toBe(baselineObject.metadataFingerprint);
      expect(changedObject?.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
