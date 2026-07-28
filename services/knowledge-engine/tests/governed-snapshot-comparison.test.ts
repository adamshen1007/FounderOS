import { describe, expect, it } from "vitest";

import { generateKnowledgeGovernedChangeSet } from "../src/index.js";
import { createKnowledgeObjectContentFingerprint } from "../src/domain/canonical-fingerprint.js";
import {
  decisionKnowledgeObject,
  generalKnowledgeObject,
  HASH,
  snapshot,
  snapshotEvidence,
  snapshotEvidenceObject,
  snapshotObject,
  snapshotObjectForKnowledgeObject,
} from "./snapshot-lifecycle-fixtures.js";

describe("governed snapshot comparison", () => {
  it("classifies complete, stable object evidence and snapshot-level changes", () => {
    const modifiedKnowledgeObject = decisionKnowledgeObject("modified");
    const previousObjects = [
      snapshotObject("alpha"),
      snapshotObject("removed"),
      snapshotObject("modified"),
    ];
    const proposedObjects = [
      snapshotObject("added"),
      snapshotObject("alpha"),
      snapshotObjectForKnowledgeObject(modifiedKnowledgeObject, {
        sourcePath: "docs/moved-modified.md",
        sourceHash: HASH("source:changed"),
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
          object.objectId === "modified" ? { object: modifiedKnowledgeObject } : {},
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

  it("verifies distinct-snapshot content evidence against canonical object payloads", () => {
    const currentObject = snapshotObject("alpha");
    const proposedKnowledgeObject = generalKnowledgeObject("alpha", "Changed canonical content");
    const proposedObject = snapshotObjectForKnowledgeObject(proposedKnowledgeObject);
    const current = snapshot("content-current", [currentObject]);
    const proposed = snapshot("content-proposed", [proposedObject]);
    const currentEvidence = snapshotEvidence(current);
    const proposedEvidence = snapshotEvidence(proposed, [
      snapshotEvidenceObject(proposedObject, { object: proposedKnowledgeObject }),
    ]);

    const legitimate = generateKnowledgeGovernedChangeSet({
      currentSnapshot: current,
      currentSnapshotEvidence: currentEvidence,
      proposedSnapshot: proposed,
      proposedSnapshotEvidence: proposedEvidence,
    });
    expect(legitimate.modifiedObjects).toMatchObject([
      { objectId: "alpha", changeTypes: ["content"] },
    ]);

    const forgedEvidence = structuredClone(proposedEvidence);
    forgedEvidence.objects[0]!.contentFingerprint = HASH("forged-content");
    expect(() =>
      generateKnowledgeGovernedChangeSet({
        currentSnapshot: current,
        currentSnapshotEvidence: currentEvidence,
        proposedSnapshot: proposed,
        proposedSnapshotEvidence: forgedEvidence,
      }),
    ).toThrow(/content fingerprint.*canonical object payload/i);

    const forgedPayloadEvidence = structuredClone(proposedEvidence);
    const forgedPayload = forgedPayloadEvidence.objects[0]!.object;
    if (!("content" in forgedPayload)) throw new Error("Expected general knowledge payload");
    forgedPayload.content = "Caller-forged canonical content";
    forgedPayloadEvidence.objects[0]!.contentFingerprint =
      createKnowledgeObjectContentFingerprint(forgedPayload);
    expect(() =>
      generateKnowledgeGovernedChangeSet({
        currentSnapshot: current,
        currentSnapshotEvidence: currentEvidence,
        proposedSnapshot: proposed,
        proposedSnapshotEvidence: forgedPayloadEvidence,
      }),
    ).toThrow(/object fingerprint.*canonical object payload/i);
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
    const previousKnowledgeObject = generalKnowledgeObject("alpha");
    const previousObject = snapshotObjectForKnowledgeObject(previousKnowledgeObject);
    const current = snapshot("current", [previousObject]);
    const currentEvidence = snapshotEvidence(current);
    const metadataChangedKnowledgeObject = generalKnowledgeObject("alpha");
    metadataChangedKnowledgeObject.metadata.title = "Changed title";
    const typeChangedKnowledgeObject = decisionKnowledgeObject("alpha");
    const cases = [
      [
        ["metadata"],
        snapshotObjectForKnowledgeObject(metadataChangedKnowledgeObject),
        metadataChangedKnowledgeObject,
      ],
      [
        ["provenance"],
        snapshotObjectForKnowledgeObject(previousKnowledgeObject, {
          sourceHash: HASH("source-only"),
        }),
        previousKnowledgeObject,
      ],
      [
        ["content", "metadata", "object_type"],
        snapshotObjectForKnowledgeObject(typeChangedKnowledgeObject),
        typeChangedKnowledgeObject,
      ],
    ] as const;
    for (const [changeTypes, proposedObject, canonicalObject] of cases) {
      const proposed = snapshot(changeTypes.join("-"), [proposedObject]);
      const changeSet = generateKnowledgeGovernedChangeSet({
        currentSnapshot: current,
        currentSnapshotEvidence: currentEvidence,
        proposedSnapshot: proposed,
        proposedSnapshotEvidence: snapshotEvidence(proposed, [
          snapshotEvidenceObject(proposedObject, { object: canonicalObject }),
        ]),
      });
      expect(changeSet.modifiedObjects).toMatchObject([{ changeTypes }]);
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
    ).toThrow(/object fingerprint.*canonical object payload/i);
  });
});
