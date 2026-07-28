import { describe, expect, it } from "vitest";

import {
  createKnowledgeSnapshotLifecycleRecord,
  transitionKnowledgeSnapshotLifecycle,
} from "../src/index.js";
import { snapshot, snapshotObject, TRANSITION_TIMES } from "./snapshot-lifecycle-fixtures.js";

describe("snapshot lifecycle", () => {
  it("creates and transitions immutable records only in lifecycle order", () => {
    const proposed = snapshot("proposed", [snapshotObject("alpha")]);
    const created = createKnowledgeSnapshotLifecycleRecord(proposed);
    const records = TRANSITION_TIMES.reduce(
      (history, transitionedAt, index) => [
        ...history,
        transitionKnowledgeSnapshotLifecycle(history.at(-1)!, proposed, {
          actorId: `actor-${index + 1}`,
          transitionedAt,
        }),
      ],
      [created],
    );
    const archived = records.at(-1)!;

    expect(created).toMatchObject({ status: "created", transitions: [] });
    expect(archived.transitions.map((transition) => [transition.from, transition.to])).toEqual([
      ["created", "validated"],
      ["validated", "reviewing"],
      ["reviewing", "approved"],
      ["approved", "active"],
      ["active", "superseded"],
      ["superseded", "archived"],
    ]);
    expect(Object.isFrozen(archived.transitions)).toBe(true);
    expect(() =>
      transitionKnowledgeSnapshotLifecycle(records[1]!, proposed, {
        actorId: "reviewer",
        transitionedAt: TRANSITION_TIMES[0],
      }),
    ).toThrow(/increasing/i);
    expect(() =>
      transitionKnowledgeSnapshotLifecycle(created, snapshot("other", [snapshotObject("alpha")]), {
        actorId: "validator",
        transitionedAt: TRANSITION_TIMES[0],
      }),
    ).toThrow(/identity/i);
    expect(() =>
      transitionKnowledgeSnapshotLifecycle(archived, proposed, {
        actorId: "archivist",
        transitionedAt: "2026-07-28T00:07:00.000Z",
      }),
    ).toThrow(/archived/i);
  });

  it("rejects tampered skip, reversal, and repeat histories at the operation boundary", () => {
    const proposed = snapshot("proposed", [snapshotObject("alpha")]);
    const malformedRecords = [
      {
        snapshotId: proposed.snapshotId,
        status: "reviewing",
        transitions: [
          {
            from: "created",
            to: "reviewing",
            actorId: "tamperer",
            transitionedAt: TRANSITION_TIMES[0],
          },
        ],
      },
      {
        snapshotId: proposed.snapshotId,
        status: "created",
        transitions: [
          {
            from: "created",
            to: "validated",
            actorId: "tamperer",
            transitionedAt: TRANSITION_TIMES[0],
          },
          {
            from: "validated",
            to: "created",
            actorId: "tamperer",
            transitionedAt: TRANSITION_TIMES[1],
          },
        ],
      },
      {
        snapshotId: proposed.snapshotId,
        status: "validated",
        transitions: [
          {
            from: "created",
            to: "validated",
            actorId: "tamperer",
            transitionedAt: TRANSITION_TIMES[0],
          },
          {
            from: "validated",
            to: "validated",
            actorId: "tamperer",
            transitionedAt: TRANSITION_TIMES[1],
          },
        ],
      },
    ];

    for (const malformed of malformedRecords) {
      expect(() =>
        transitionKnowledgeSnapshotLifecycle(malformed as never, proposed, {
          actorId: "validator",
          transitionedAt: "2026-07-28T00:07:00.000Z",
        }),
      ).toThrow(/transition|history/i);
    }
  });
});
