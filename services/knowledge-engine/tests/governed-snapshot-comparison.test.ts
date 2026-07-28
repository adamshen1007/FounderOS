import { describe, expect, it } from "vitest";

import { generateKnowledgeGovernedChangeSet } from "../src/index.js";
import { HASH, snapshot, snapshotObject } from "./snapshot-lifecycle-fixtures.js";

describe("governed snapshot comparison", () => {
  it("classifies complete, stable object evidence and version-only changes", () => {
    const previous = snapshot("previous", [
      snapshotObject("alpha"),
      snapshotObject("removed"),
      snapshotObject("modified"),
    ]);
    const proposed = snapshot(
      "proposed",
      [
        snapshotObject("added"),
        snapshotObject("alpha"),
        snapshotObject("modified", {
          objectType: "decision",
          sourcePath: "docs/moved-modified.md",
          sourceHash: HASH("source:changed"),
          contentFingerprint: HASH("content:changed"),
          metadataFingerprint: HASH("metadata:changed"),
          objectFingerprint: HASH("object:changed"),
        }),
      ],
      "v2",
    );
    const changeSet = generateKnowledgeGovernedChangeSet({
      currentSnapshot: previous,
      proposedSnapshot: proposed,
    });

    expect(changeSet).toMatchObject({
      changeId: `change-${previous.snapshotId}-to-${proposed.snapshotId}`,
      corpusVersionChanged: true,
      reviewStatus: "pending",
      changed: true,
    });
    expect(changeSet.addedObjects.map((object) => object.objectId)).toEqual(["added"]);
    expect(changeSet.removedObjects.map((object) => object.objectId)).toEqual(["removed"]);
    expect(changeSet.modifiedObjects).toMatchObject([
      { objectId: "modified", changeTypes: ["content", "metadata", "object_type", "provenance"] },
    ]);
    expect(
      generateKnowledgeGovernedChangeSet({
        currentSnapshot: previous,
        proposedSnapshot: snapshot("version-only", previous.objects, "v2"),
      }),
    ).toMatchObject({ changed: true, corpusVersionChanged: true, modifiedObjects: [] });
  });

  it("isolates classifications, stable empty evidence, and invalid boundaries", () => {
    const current = snapshot("current", [snapshotObject("alpha")]);
    const cases = [
      ["content", { contentFingerprint: HASH("content-only") }],
      ["metadata", { metadataFingerprint: HASH("metadata-only") }],
      ["provenance", { sourceHash: HASH("source-only") }],
      ["object_type", { objectType: "decision" as const }],
    ] as const;
    for (const [changeType, overrides] of cases) {
      const changeSet = generateKnowledgeGovernedChangeSet({
        currentSnapshot: current,
        proposedSnapshot: snapshot(changeType, [snapshotObject("alpha", overrides)]),
      });
      expect(changeSet.modifiedObjects).toMatchObject([{ changeTypes: [changeType] }]);
      expect(changeSet.addedObjects).toEqual([]);
      expect(changeSet.removedObjects).toEqual([]);
    }
    const unchanged = generateKnowledgeGovernedChangeSet({
      currentSnapshot: current,
      proposedSnapshot: snapshot("different-identity", current.objects),
    });
    expect(unchanged).toMatchObject({
      changed: false,
      corpusVersionChanged: false,
      addedObjects: [],
      removedObjects: [],
      modifiedObjects: [],
    });
    expect(JSON.stringify(unchanged)).toBe(
      JSON.stringify(
        generateKnowledgeGovernedChangeSet({
          currentSnapshot: current,
          proposedSnapshot: snapshot("different-identity", current.objects),
        }),
      ),
    );
    expect(() =>
      generateKnowledgeGovernedChangeSet({ currentSnapshot: current, proposedSnapshot: current }),
    ).toThrow(/distinct/i);
    expect(() =>
      generateKnowledgeGovernedChangeSet({
        currentSnapshot: current,
        proposedSnapshot: {
          ...snapshot("other-corpus", current.objects),
          corpusId: "other-corpus",
        },
      }),
    ).toThrow(/same corpus/i);
  });
});
