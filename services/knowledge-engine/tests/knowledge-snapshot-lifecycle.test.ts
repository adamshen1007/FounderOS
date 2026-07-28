import { describe, expect, it } from "vitest";

import * as knowledgeEngine from "../src/index.js";
import {
  archiveKnowledgeSnapshotLifecycle,
  createKnowledgeSnapshotLifecycleRecord,
  validateKnowledgeSnapshotLifecycle,
} from "../src/index.js";
import {
  lifecycle,
  snapshot,
  snapshotObject,
  TRANSITION_TIMES,
} from "./snapshot-lifecycle-fixtures.js";

describe("snapshot lifecycle", () => {
  it("exposes validation and archival without a public raw governance bypass", () => {
    const proposed = snapshot("proposed", [snapshotObject("alpha")]);
    const created = createKnowledgeSnapshotLifecycleRecord(proposed);
    const validated = validateKnowledgeSnapshotLifecycle(created, proposed, {
      actorId: "validator",
      transitionedAt: TRANSITION_TIMES[0],
    });
    const superseded = lifecycle(proposed, "superseded");
    const archived = archiveKnowledgeSnapshotLifecycle(superseded, proposed, {
      actorId: "archivist",
      transitionedAt: TRANSITION_TIMES[5],
    });

    expect(created).toMatchObject({
      snapshotCreatedAt: proposed.creation.createdAt,
      status: "created",
      transitions: [],
    });
    expect(validated).toMatchObject({ status: "validated" });
    expect(archived).toMatchObject({ status: "archived" });
    expect(Object.isFrozen(validated.transitions)).toBe(true);
    expect("transitionKnowledgeSnapshotLifecycle" in knowledgeEngine).toBe(false);
    expect("advanceKnowledgeSnapshotLifecycle" in knowledgeEngine).toBe(false);
  });

  it("rejects identity mismatch, repeated validation, and pre-creation evidence", () => {
    const proposed = snapshot("proposed", [snapshotObject("alpha")]);
    const created = createKnowledgeSnapshotLifecycleRecord(proposed);
    const validated = validateKnowledgeSnapshotLifecycle(created, proposed, {
      actorId: "validator",
      transitionedAt: TRANSITION_TIMES[0],
    });

    expect(() =>
      validateKnowledgeSnapshotLifecycle(created, snapshot("other", [snapshotObject("alpha")]), {
        actorId: "validator",
        transitionedAt: TRANSITION_TIMES[0],
      }),
    ).toThrow(/identity|creation/i);
    expect(() =>
      validateKnowledgeSnapshotLifecycle(validated, proposed, {
        actorId: "validator",
        transitionedAt: TRANSITION_TIMES[1],
      }),
    ).toThrow(/created/i);
    expect(() =>
      validateKnowledgeSnapshotLifecycle(created, proposed, {
        actorId: "validator",
        transitionedAt: proposed.creation.createdAt,
      }),
    ).toThrow(/after snapshot creation/i);
  });

  it("rejects tampered lifecycle history at every public operation boundary", () => {
    const proposed = snapshot("proposed", [snapshotObject("alpha")]);
    const malformed = {
      snapshotId: proposed.snapshotId,
      snapshotCreatedAt: proposed.creation.createdAt,
      status: "superseded",
      transitions: [
        {
          from: "created",
          to: "superseded",
          actorId: "tamperer",
          transitionedAt: TRANSITION_TIMES[0],
        },
      ],
    };

    expect(() =>
      archiveKnowledgeSnapshotLifecycle(malformed as never, proposed, {
        actorId: "archivist",
        transitionedAt: TRANSITION_TIMES[5],
      }),
    ).toThrow(/transition history|lifecycle/i);
  });
});
