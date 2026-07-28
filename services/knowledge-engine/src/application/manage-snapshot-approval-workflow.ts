import {
  KnowledgeSnapshotApprovalWorkflowSchema,
  KnowledgeSnapshotLifecycleRecordSchema,
  KnowledgeSnapshotReviewDecisionSchema,
  type KnowledgeRepositorySnapshot,
  type KnowledgeSnapshotApprovalWorkflow,
  type KnowledgeSnapshotComparisonEvidence,
  type KnowledgeSnapshotLifecycleRecord,
  type KnowledgeSnapshotReviewDecision,
  type SnapshotReviewStatus,
} from "@founderos/knowledge-schema";

import {
  deepFreeze,
  KnowledgeSnapshotApprovalWorkflowError,
  parseKnowledgeSnapshotApprovalWorkflow,
  parseWithSnapshotDomainError,
  type SnapshotLifecycleTransitionEvidence,
} from "../domain/snapshot-lifecycle.js";
import { generateKnowledgeGovernedChangeSet } from "./generate-knowledge-governed-change-set.js";
import { advanceKnowledgeSnapshotLifecycle } from "./manage-knowledge-snapshot-lifecycle.js";

export interface InitializeKnowledgeSnapshotApprovalWorkflowInput {
  activeSnapshot: KnowledgeRepositorySnapshot;
  activeSnapshotEvidence: KnowledgeSnapshotComparisonEvidence;
  activeSnapshotLifecycle: KnowledgeSnapshotLifecycleRecord;
  proposedSnapshot: KnowledgeRepositorySnapshot;
  proposedSnapshotEvidence: KnowledgeSnapshotComparisonEvidence;
  proposedSnapshotLifecycle: KnowledgeSnapshotLifecycleRecord;
}

export interface SnapshotReviewDecisionInput {
  actorId: string;
  decidedAt: string;
  reason: string;
}

export function initializeKnowledgeSnapshotApprovalWorkflow(
  input: InitializeKnowledgeSnapshotApprovalWorkflowInput,
): KnowledgeSnapshotApprovalWorkflow {
  const activeSnapshotLifecycle = parseWithSnapshotDomainError(
    KnowledgeSnapshotLifecycleRecordSchema,
    input.activeSnapshotLifecycle,
    KnowledgeSnapshotApprovalWorkflowError,
    "Cannot initialize workflow with invalid active lifecycle",
  );
  if (activeSnapshotLifecycle.status !== "active") {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "A snapshot approval workflow requires an active baseline snapshot lifecycle",
    );
  }
  const proposedSnapshotLifecycle = parseWithSnapshotDomainError(
    KnowledgeSnapshotLifecycleRecordSchema,
    input.proposedSnapshotLifecycle,
    KnowledgeSnapshotApprovalWorkflowError,
    "Cannot initialize workflow with invalid proposed lifecycle",
  );
  if (proposedSnapshotLifecycle.status !== "validated") {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "A snapshot approval workflow requires a proposed snapshot lifecycle in validated status",
    );
  }
  const changeSet = generateKnowledgeGovernedChangeSet({
    currentSnapshot: input.activeSnapshot,
    currentSnapshotEvidence: input.activeSnapshotEvidence,
    proposedSnapshot: input.proposedSnapshot,
    proposedSnapshotEvidence: input.proposedSnapshotEvidence,
  });
  if (!changeSet.changed) {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "A snapshot approval workflow requires a proposed snapshot with governed changes",
    );
  }

  return deepFreeze(
    parseWithSnapshotDomainError(
      KnowledgeSnapshotApprovalWorkflowSchema,
      {
        activeSnapshot: input.activeSnapshot,
        activeSnapshotEvidence: input.activeSnapshotEvidence,
        activeSnapshotLifecycle,
        proposedSnapshot: input.proposedSnapshot,
        proposedSnapshotEvidence: input.proposedSnapshotEvidence,
        proposedSnapshotLifecycle,
        changeSet,
        reviewStatus: "pending",
        reviewDecision: null,
      },
      KnowledgeSnapshotApprovalWorkflowError,
      "Cannot initialize snapshot approval workflow",
    ),
  );
}

function updateWorkflow(
  workflow: KnowledgeSnapshotApprovalWorkflow,
  activeSnapshotLifecycle: KnowledgeSnapshotLifecycleRecord,
  proposedSnapshotLifecycle: KnowledgeSnapshotLifecycleRecord,
  reviewStatus: SnapshotReviewStatus,
  reviewDecision: KnowledgeSnapshotReviewDecision | null,
  context: string,
): KnowledgeSnapshotApprovalWorkflow {
  return deepFreeze(
    parseWithSnapshotDomainError(
      KnowledgeSnapshotApprovalWorkflowSchema,
      {
        ...workflow,
        activeSnapshotLifecycle,
        proposedSnapshotLifecycle,
        changeSet: { ...workflow.changeSet, reviewStatus },
        reviewStatus,
        reviewDecision,
      },
      KnowledgeSnapshotApprovalWorkflowError,
      context,
    ),
  );
}

function parseReviewDecision(
  workflow: KnowledgeSnapshotApprovalWorkflow,
  decision: "approved" | "rejected",
  input: SnapshotReviewDecisionInput,
): KnowledgeSnapshotReviewDecision {
  return parseWithSnapshotDomainError(
    KnowledgeSnapshotReviewDecisionSchema,
    {
      changeId: workflow.changeSet.changeId,
      proposedSnapshotId: workflow.proposedSnapshot.snapshotId,
      decision,
      actorId: input.actorId,
      decidedAt: input.decidedAt,
      reason: input.reason,
    },
    KnowledgeSnapshotApprovalWorkflowError,
    `Invalid ${decision} review decision evidence`,
  );
}

export function beginKnowledgeSnapshotApprovalReview(
  workflowInput: KnowledgeSnapshotApprovalWorkflow,
  evidence: SnapshotLifecycleTransitionEvidence,
): KnowledgeSnapshotApprovalWorkflow {
  const workflow = parseKnowledgeSnapshotApprovalWorkflow(
    workflowInput,
    "Cannot begin review for invalid workflow",
  );
  if (
    workflow.reviewStatus !== "pending" ||
    workflow.activeSnapshotLifecycle.status !== "active" ||
    workflow.proposedSnapshotLifecycle.status !== "validated"
  ) {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "Snapshot approval review can begin only from a validated workflow with active baseline and pending review",
    );
  }
  return updateWorkflow(
    workflow,
    workflow.activeSnapshotLifecycle,
    advanceKnowledgeSnapshotLifecycle(
      workflow.proposedSnapshotLifecycle,
      workflow.proposedSnapshot,
      "reviewing",
      evidence,
    ),
    "reviewing",
    null,
    "Cannot begin snapshot approval review",
  );
}

export function approveKnowledgeSnapshotApprovalWorkflow(
  workflowInput: KnowledgeSnapshotApprovalWorkflow,
  decisionInput: SnapshotReviewDecisionInput,
): KnowledgeSnapshotApprovalWorkflow {
  const workflow = parseKnowledgeSnapshotApprovalWorkflow(
    workflowInput,
    "Cannot approve invalid workflow",
  );
  if (
    workflow.reviewStatus !== "reviewing" ||
    workflow.activeSnapshotLifecycle.status !== "active" ||
    workflow.proposedSnapshotLifecycle.status !== "reviewing"
  ) {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "Snapshot approval workflow can be approved only while reviewing an active baseline",
    );
  }
  const reviewDecision = parseReviewDecision(workflow, "approved", decisionInput);
  return updateWorkflow(
    workflow,
    workflow.activeSnapshotLifecycle,
    advanceKnowledgeSnapshotLifecycle(
      workflow.proposedSnapshotLifecycle,
      workflow.proposedSnapshot,
      "approved",
      { actorId: reviewDecision.actorId, transitionedAt: reviewDecision.decidedAt },
    ),
    "approved",
    reviewDecision,
    "Cannot approve snapshot approval workflow",
  );
}

export function rejectKnowledgeSnapshotApprovalWorkflow(
  workflowInput: KnowledgeSnapshotApprovalWorkflow,
  decisionInput: SnapshotReviewDecisionInput,
): KnowledgeSnapshotApprovalWorkflow {
  const workflow = parseKnowledgeSnapshotApprovalWorkflow(
    workflowInput,
    "Cannot reject invalid workflow",
  );
  if (
    workflow.reviewStatus !== "reviewing" ||
    workflow.activeSnapshotLifecycle.status !== "active" ||
    workflow.proposedSnapshotLifecycle.status !== "reviewing"
  ) {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "Snapshot approval workflow can be rejected only while reviewing an active baseline",
    );
  }
  const reviewDecision = parseReviewDecision(workflow, "rejected", decisionInput);
  return updateWorkflow(
    workflow,
    workflow.activeSnapshotLifecycle,
    workflow.proposedSnapshotLifecycle,
    "rejected",
    reviewDecision,
    "Cannot reject snapshot approval workflow",
  );
}

export function activateKnowledgeSnapshotApprovalWorkflow(
  workflowInput: KnowledgeSnapshotApprovalWorkflow,
  evidence: SnapshotLifecycleTransitionEvidence,
): KnowledgeSnapshotApprovalWorkflow {
  const workflow = parseKnowledgeSnapshotApprovalWorkflow(
    workflowInput,
    "Cannot activate invalid workflow",
  );
  if (
    workflow.reviewStatus !== "approved" ||
    workflow.reviewDecision?.decision !== "approved" ||
    workflow.activeSnapshotLifecycle.status !== "active" ||
    workflow.proposedSnapshotLifecycle.status !== "approved"
  ) {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "Snapshot approval workflow can activate only after an approved review with an active baseline",
    );
  }

  const supersededActiveLifecycle = advanceKnowledgeSnapshotLifecycle(
    workflow.activeSnapshotLifecycle,
    workflow.activeSnapshot,
    "superseded",
    evidence,
  );
  const activeProposedLifecycle = advanceKnowledgeSnapshotLifecycle(
    workflow.proposedSnapshotLifecycle,
    workflow.proposedSnapshot,
    "active",
    evidence,
  );

  return updateWorkflow(
    workflow,
    supersededActiveLifecycle,
    activeProposedLifecycle,
    "approved",
    workflow.reviewDecision,
    "Cannot activate snapshot approval workflow",
  );
}
