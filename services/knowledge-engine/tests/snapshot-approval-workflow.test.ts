import { describe, expect, it } from "vitest";

import {
  activateKnowledgeSnapshotApprovalWorkflow,
  approveKnowledgeSnapshotApprovalWorkflow,
  beginKnowledgeSnapshotApprovalReview,
  initializeKnowledgeSnapshotApprovalWorkflow,
  rejectKnowledgeSnapshotApprovalWorkflow,
} from "../src/index.js";
import {
  activeLifecycle,
  HASH,
  snapshot,
  snapshotObject,
  TRANSITION_TIMES,
  validatedLifecycle,
} from "./snapshot-lifecycle-fixtures.js";

describe("snapshot approval workflow", () => {
  it("requires review approval before immutable activation", () => {
    const active = snapshot("active", [snapshotObject("alpha")]);
    const proposed = snapshot("proposed", [
      snapshotObject("alpha", { contentFingerprint: HASH("new") }),
    ]);
    const initialized = initializeKnowledgeSnapshotApprovalWorkflow({
      activeSnapshot: active,
      activeSnapshotLifecycle: activeLifecycle(active),
      proposedSnapshot: proposed,
      proposedSnapshotLifecycle: validatedLifecycle(proposed),
    });
    const reviewing = beginKnowledgeSnapshotApprovalReview(initialized, {
      actorId: "reviewer",
      transitionedAt: TRANSITION_TIMES[1],
    });
    expect(() =>
      activateKnowledgeSnapshotApprovalWorkflow(reviewing, {
        actorId: "activator",
        transitionedAt: TRANSITION_TIMES[2],
      }),
    ).toThrow(/approved/i);
    const approved = approveKnowledgeSnapshotApprovalWorkflow(reviewing, {
      actorId: "approver",
      transitionedAt: TRANSITION_TIMES[2],
    });
    const activated = activateKnowledgeSnapshotApprovalWorkflow(approved, {
      actorId: "activator",
      transitionedAt: TRANSITION_TIMES[3],
    });
    expect(initialized).toMatchObject({
      reviewStatus: "pending",
      proposedSnapshotLifecycle: { status: "validated" },
    });
    expect(activated).toMatchObject({
      reviewStatus: "approved",
      proposedSnapshotLifecycle: { status: "active" },
    });
    expect(Object.isFrozen(activated)).toBe(true);
  });

  it("rejects proposals and requires a matching active baseline lifecycle", () => {
    const active = snapshot("active", [snapshotObject("alpha")]);
    const proposed = snapshot("proposed", [snapshotObject("beta")]);
    const reviewing = beginKnowledgeSnapshotApprovalReview(
      initializeKnowledgeSnapshotApprovalWorkflow({
        activeSnapshot: active,
        activeSnapshotLifecycle: activeLifecycle(active),
        proposedSnapshot: proposed,
        proposedSnapshotLifecycle: validatedLifecycle(proposed),
      }),
      { actorId: "reviewer", transitionedAt: TRANSITION_TIMES[1] },
    );
    const rejected = rejectKnowledgeSnapshotApprovalWorkflow(reviewing);
    expect(rejected).toMatchObject({
      reviewStatus: "rejected",
      changeSet: { reviewStatus: "rejected" },
      proposedSnapshotLifecycle: { status: "reviewing" },
    });
    expect(() =>
      activateKnowledgeSnapshotApprovalWorkflow(rejected, {
        actorId: "activator",
        transitionedAt: TRANSITION_TIMES[2],
      }),
    ).toThrow(/approved/i);
    expect(() =>
      initializeKnowledgeSnapshotApprovalWorkflow({
        activeSnapshot: active,
        activeSnapshotLifecycle: validatedLifecycle(active),
        proposedSnapshot: proposed,
        proposedSnapshotLifecycle: validatedLifecycle(proposed),
      }),
    ).toThrow(/active baseline/i);
    expect(() =>
      initializeKnowledgeSnapshotApprovalWorkflow({
        activeSnapshot: active,
        activeSnapshotLifecycle: activeLifecycle(snapshot("other", [snapshotObject("alpha")])),
        proposedSnapshot: proposed,
        proposedSnapshotLifecycle: validatedLifecycle(proposed),
      }),
    ).toThrow(/active snapshot lifecycle/i);
    expect(() =>
      initializeKnowledgeSnapshotApprovalWorkflow({
        activeSnapshot: active,
        activeSnapshotLifecycle: undefined as never,
        proposedSnapshot: proposed,
        proposedSnapshotLifecycle: validatedLifecycle(proposed),
      }),
    ).toThrow(/invalid active lifecycle/i);
  });
});
