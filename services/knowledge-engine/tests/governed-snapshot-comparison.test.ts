import { describe, expect, it } from "vitest";

import { generateKnowledgeGovernedChangeSet } from "../src/index.js";
import {
  HASH,
  snapshot,
  snapshotEvidence,
  snapshotEvidenceObject,
  snapshotObject,
} from "./snapshot-lifecycle-fixtures.js";

describe("governed snapshot comparison", () => {
  it("classifies complete, stable object evidence and snapshot-level changes", () => {
    const previousObjects = [
      snapshotObject("alpha"),
      snapshotObject("removed"),
      snapshotObject("modified"),
    ];
    const proposedObjects = [
      snapshotObject("added"),
      snapshotObject("alpha"),
      snapshotObject("modified", {
        objectType: "decision",
        sourcePath: "docs/moved-modified.md",
        sourceHash: HASH("source:changed"),
        metadataFingerprint: HASH("metadata:changed"),
        objectFingerprint: HASH("object:changed"),
      }),
    ];
    const previous = snapshot("previous", previousObjects);
    const proposed = snapshot("proposed", proposedObjects, "v2", "knowledge/next-manifest.yaml");
    const previousEvidence = snapshotEvidence(previous);
    const proposedEvidence = snapshotEvidence(
      proposed,
      proposed.objects.map((object) =>
        snapshotEvidenceObject(
          object,
          object.objectId === "modified" ? { contentFingerprint: HASH("content:changed") } : {},
        ),
      ),
    );
    const changeSet = generateKnowledgeGovernedChangeSet({
      currentSnapshot: previous,
      currentSnapshotEvidence: previousEvidence,
      proposedSnapshot: proposed,
      proposedSnapshotEvidence: proposedEvidence,
    });

    expect(changeSet).toMatchObject({
      changeId: `change-${previous.snapshotId}-to-${proposed.snapshotId}`,
      snapshotFingerprintChanged: true,
      manifestReferenceChanged: true,
      corpusVersionChanged: true,
      reviewStatus: "pending",
      changed: true,
    });
    expect(changeSet.addedObjects.map((object) => object.objectId)).toEqual(["added"]);
    expect(changeSet.removedObjects.map((object) => object.objectId)).toEqual(["removed"]);
    expect(changeSet.modifiedObjects).toMatchObject([
      { objectId: "modified", changeTypes: ["content", "metadata", "object_type", "provenance"] },
    ]);
    expect(Object.isFrozen(changeSet.modifiedObjects[0]?.current)).toBe(true);
  });

  it("returns a deterministic empty change set for the same content-addressed snapshot", () => {
    const current = snapshot("current", [snapshotObject("alpha")]);
    const evidence = snapshotEvidence(current);
    const first = generateKnowledgeGovernedChangeSet({
      currentSnapshot: current,
      currentSnapshotEvidence: evidence,
      proposedSnapshot: current,
      proposedSnapshotEvidence: evidence,
    });
    const second = generateKnowledgeGovernedChangeSet({
      currentSnapshot: current,
      currentSnapshotEvidence: evidence,
      proposedSnapshot: current,
      proposedSnapshotEvidence: evidence,
    });

    expect(first).toMatchObject({
      sourceSnapshotId: current.snapshotId,
      targetSnapshotId: current.snapshotId,
      snapshotFingerprintChanged: false,
      manifestReferenceChanged: false,
      corpusVersionChanged: false,
      changed: false,
      addedObjects: [],
      removedObjects: [],
      modifiedObjects: [],
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));

    const conflictingEvidence = structuredClone(evidence);
    conflictingEvidence.objects[0]!.contentFingerprint = HASH("forged-content");
    expect(() =>
      generateKnowledgeGovernedChangeSet({
        currentSnapshot: current,
        currentSnapshotEvidence: evidence,
        proposedSnapshot: current,
        proposedSnapshotEvidence: conflictingEvidence,
      }),
    ).toThrow(/same snapshot identity/i);
  });

  it("explains manifest-only identity changes and rejects invalid evidence boundaries", () => {
    const objects = [snapshotObject("alpha")];
    const current = snapshot("current", objects);
    const proposed = snapshot(
      "manifest-changed",
      objects,
      current.corpusVersion,
      "knowledge/next-manifest.yaml",
    );
    const currentEvidence = snapshotEvidence(current);
    const proposedEvidence = snapshotEvidence(proposed);
    const manifestOnly = generateKnowledgeGovernedChangeSet({
      currentSnapshot: current,
      currentSnapshotEvidence: currentEvidence,
      proposedSnapshot: proposed,
      proposedSnapshotEvidence: proposedEvidence,
    });

    expect(manifestOnly).toMatchObject({
      sourceManifestReference: current.sourceManifestReference,
      targetManifestReference: proposed.sourceManifestReference,
      snapshotFingerprintChanged: true,
      manifestReferenceChanged: true,
      changed: true,
      modifiedObjects: [],
    });
    expect(() =>
      generateKnowledgeGovernedChangeSet({
        currentSnapshot: current,
        currentSnapshotEvidence: proposedEvidence,
        proposedSnapshot: proposed,
        proposedSnapshotEvidence: proposedEvidence,
      }),
    ).toThrow(/evidence must identify/i);
    expect(() =>
      generateKnowledgeGovernedChangeSet({
        currentSnapshot: current,
        currentSnapshotEvidence: currentEvidence,
        proposedSnapshot: { ...proposed, corpusId: "other-corpus" },
        proposedSnapshotEvidence: proposedEvidence,
      }),
    ).toThrow(/same corpus/i);
  });

  it("detects each object change class and rejects unexplained aggregate changes", () => {
    const previousObject = snapshotObject("alpha");
    const current = snapshot("current", [previousObject]);
    const currentEvidence = snapshotEvidence(current);
    const cases = [
      [
        "content",
        snapshotObject("alpha", { objectFingerprint: HASH("object:content") }),
        { contentFingerprint: HASH("content-only") },
      ],
      [
        "metadata",
        snapshotObject("alpha", {
          metadataFingerprint: HASH("metadata-only"),
          objectFingerprint: HASH("object:metadata"),
        }),
        {},
      ],
      ["provenance", snapshotObject("alpha", { sourceHash: HASH("source-only") }), {}],
      [
        "object_type",
        snapshotObject("alpha", {
          objectType: "decision" as const,
          objectFingerprint: HASH("object:type"),
        }),
        {},
      ],
    ] as const;
    for (const [changeType, proposedObject, evidenceOverrides] of cases) {
      const proposed = snapshot(changeType, [proposedObject]);
      const changeSet = generateKnowledgeGovernedChangeSet({
        currentSnapshot: current,
        currentSnapshotEvidence: currentEvidence,
        proposedSnapshot: proposed,
        proposedSnapshotEvidence: snapshotEvidence(proposed, [
          snapshotEvidenceObject(proposedObject, evidenceOverrides),
        ]),
      });
      expect(changeSet.modifiedObjects).toMatchObject([{ changeTypes: [changeType] }]);
    }

    const unexplainedObject = snapshotObject("alpha", {
      objectFingerprint: HASH("unexplained"),
    });
    const unexplained = snapshot("unexplained", [unexplainedObject]);
    expect(() =>
      generateKnowledgeGovernedChangeSet({
        currentSnapshot: current,
        currentSnapshotEvidence: currentEvidence,
        proposedSnapshot: unexplained,
        proposedSnapshotEvidence: snapshotEvidence(unexplained),
      }),
    ).toThrow(/cannot explain object fingerprint change/i);
  });
});
