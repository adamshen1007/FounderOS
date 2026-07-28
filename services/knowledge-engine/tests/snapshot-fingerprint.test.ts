import { describe, expect, it } from "vitest";

import { createKnowledgeRepositorySnapshot } from "../src/index.js";
import { corpus, CREATED_AT, document, metadata } from "./snapshot-lifecycle-fixtures.js";

describe("knowledge repository snapshot content fingerprints", () => {
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

    expect(metadataSnapshot.objects[0]!.contentFingerprint).toBe(
      baseline.objects[0]!.contentFingerprint,
    );
    expect(payloadSnapshot.objects[0]!.contentFingerprint).not.toBe(
      baseline.objects[0]!.contentFingerprint,
    );
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

    expect(repeated.snapshotId).toBe(baseline.snapshotId);
    for (const baselineObject of baseline.objects) {
      const changedObject = changedSnapshot.objects.find(
        (object) => object.objectId === baselineObject.objectId,
      );
      expect(changedObject?.contentFingerprint).not.toBe(baselineObject.contentFingerprint);
      expect(changedObject?.metadataFingerprint).toBe(baselineObject.metadataFingerprint);
      expect(changedObject?.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});
