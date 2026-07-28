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
  snapshotEvidence,
  snapshotEvidenceObject,
  snapshotObject,
  TRANSITION_TIMES,
  validatedLifecycle,
} from "./snapshot-lifecycle-fixtures.js";

function workflowInput() {
  const activeObject = snapshotObject("alpha");
  const proposedObject = snapshotObject("alpha", {
    objectFingerprint: HASH("object:new"),
  });
  const activeSnapshot = snapshot("active", [activeObject]);
  const proposedSnapshot = snapshot("proposed", [proposedObject]);
  return {
    activeSnapshot,
    activeSnapshotEvidence: snapshotEvidence(activeSnapshot),
    activeSnapshotLifecycle: activeLifecycle(activeSnapshot),
    proposedSnapshot,
    proposedSnapshotEvidence: snapshotEvidence(proposedSnapshot, [
      snapshotEvidenceObject(proposedObject, { contentFingerprint: HASH("content:new") }),
    ]),
    proposedSnapshotLifecycle: validatedLifecycle(proposedSnapshot),
  };
}

describe("snapshot approval workflow", () => {
  it("requires review approval and atomically supersedes the active baseline on activation", () => {
    const initialized = initializeKnowledgeSnapshotApprovalWorkflow(workflowInput());
    const reviewing = beginKnowledgeSnapshotApprovalReview(initialized, {
      actorId: "reviewer",
      transitionedAt: TRANSITION_TIMES[1],
    });
    expect(() =>
      activateKnowledgeSnapshotApprovalWorkflow(reviewing, {
        actorId: "activator",
        transitionedAt: TRANSITION_TIMES[4],
      }),
    ).toThrow(/approved/i);
    const approved = approveKnowledgeSnapshotApprovalWorkflow(reviewing, {
      actorId: "approver",
      decidedAt: TRANSITION_TIMES[2],
      reason: "The source, metadata, provenance, and impact were reviewed.",
    });
    const activated = activateKnowledgeSnapshotApprovalWorkflow(approved, {
      actorId: "activator",
      transitionedAt: TRANSITION_TIMES[4],
    });

    expect(initialized).toMatchObject({
      reviewStatus: "pending",
      reviewDecision: null,
      activeSnapshotLifecycle: { status: "active" },
      proposedSnapshotLifecycle: { status: "validated" },
    });
    expect(approved.reviewDecision).toMatchObject({
      changeId: approved.changeSet.changeId,
      proposedSnapshotId: approved.proposedSnapshot.snapshotId,
      decision: "approved",
      actorId: "approver",
      decidedAt: TRANSITION_TIMES[2],
    });
    expect(activated).toMatchObject({
      reviewStatus: "approved",
      activeSnapshotLifecycle: { status: "superseded" },
      proposedSnapshotLifecycle: { status: "active" },
    });
    expect(activated.activeSnapshotLifecycle.transitions.at(-1)).toMatchObject({
      from: "active",
      to: "superseded",
    });
    expect(Object.isFrozen(activated.reviewDecision)).toBe(true);
  });

  it("records immutable rejection evidence and rejects forged reduced workflows", () => {
    const initialized = initializeKnowledgeSnapshotApprovalWorkflow(workflowInput());
    const reviewing = beginKnowledgeSnapshotApprovalReview(initialized, {
      actorId: "reviewer",
      transitionedAt: TRANSITION_TIMES[1],
    });
    const rejected = rejectKnowledgeSnapshotApprovalWorkflow(reviewing, {
      actorId: "reviewer",
      decidedAt: TRANSITION_TIMES[2],
      reason: "The proposed source provenance is not acceptable.",
    });

    expect(rejected).toMatchObject({
      reviewStatus: "rejected",
      changeSet: { reviewStatus: "rejected" },
      activeSnapshotLifecycle: { status: "active" },
      proposedSnapshotLifecycle: { status: "reviewing" },
      reviewDecision: {
        decision: "rejected",
        actorId: "reviewer",
        decidedAt: TRANSITION_TIMES[2],
      },
    });
    expect(() =>
      activateKnowledgeSnapshotApprovalWorkflow(rejected, {
        actorId: "activator",
        transitionedAt: TRANSITION_TIMES[4],
      }),
    ).toThrow(/approved/i);

    const { activeSnapshotLifecycle: _omitted, ...forgedReducedWorkflow } = initialized;
    void _omitted;
    expect(() =>
      beginKnowledgeSnapshotApprovalReview(forgedReducedWorkflow as never, {
        actorId: "reviewer",
        transitionedAt: TRANSITION_TIMES[1],
      }),
    ).toThrow(/activeSnapshotLifecycle|invalid workflow/i);

    const tampered = structuredClone(reviewing);
    tampered.activeSnapshotLifecycle.snapshotId = tampered.proposedSnapshot.snapshotId;
    expect(() =>
      approveKnowledgeSnapshotApprovalWorkflow(tampered, {
        actorId: "approver",
        decidedAt: TRANSITION_TIMES[2],
        reason: "Attempted approval with a forged baseline.",
      }),
    ).toThrow(/lifecycle record|invalid workflow/i);
  });

  it("requires a matching active baseline and rejects no-op workflow initialization", () => {
    const input = workflowInput();
    expect(() =>
      initializeKnowledgeSnapshotApprovalWorkflow({
        ...input,
        activeSnapshotLifecycle: validatedLifecycle(input.activeSnapshot),
      }),
    ).toThrow(/active baseline/i);

    const sameSnapshot = snapshot("same", [snapshotObject("alpha")]);
    expect(() =>
      initializeKnowledgeSnapshotApprovalWorkflow({
        activeSnapshot: sameSnapshot,
        activeSnapshotEvidence: snapshotEvidence(sameSnapshot),
        activeSnapshotLifecycle: activeLifecycle(sameSnapshot),
        proposedSnapshot: sameSnapshot,
        proposedSnapshotEvidence: snapshotEvidence(sameSnapshot),
        proposedSnapshotLifecycle: validatedLifecycle(sameSnapshot),
      }),
    ).toThrow(/governed changes/i);

    const forgedEvidence = snapshotEvidence(sameSnapshot);
    forgedEvidence.objects[0]!.contentFingerprint = HASH("forged-content");
    expect(() =>
      initializeKnowledgeSnapshotApprovalWorkflow({
        activeSnapshot: sameSnapshot,
        activeSnapshotEvidence: snapshotEvidence(sameSnapshot),
        activeSnapshotLifecycle: activeLifecycle(sameSnapshot),
        proposedSnapshot: sameSnapshot,
        proposedSnapshotEvidence: forgedEvidence,
        proposedSnapshotLifecycle: validatedLifecycle(sameSnapshot),
      }),
    ).toThrow(/same snapshot identity/i);

    const reviewing = beginKnowledgeSnapshotApprovalReview(
      initializeKnowledgeSnapshotApprovalWorkflow(input),
      { actorId: "reviewer", transitionedAt: TRANSITION_TIMES[1] },
    );
    expect(() =>
      rejectKnowledgeSnapshotApprovalWorkflow(reviewing, {
        actorId: "reviewer",
        decidedAt: TRANSITION_TIMES[1],
        reason: "This timestamp is not after review began.",
      }),
    ).toThrow(/after review begins/i);
  });
});
