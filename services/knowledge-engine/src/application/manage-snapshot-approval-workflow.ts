import {
  KnowledgeSnapshotApprovalWorkflowSchema,
  type KnowledgeSnapshotApprovalWorkflow,
  type KnowledgeSnapshotLifecycleRecord,
  type KnowledgeRepositorySnapshot,
} from "@founderos/knowledge-schema";

import {
  deepFreeze,
  KnowledgeSnapshotApprovalWorkflowError,
  parseKnowledgeSnapshotApprovalWorkflow,
  parseKnowledgeSnapshotLifecycleRecord,
  parseWithSnapshotDomainError,
  type SnapshotLifecycleTransitionEvidence,
} from "../domain/snapshot-lifecycle.js";
import { generateKnowledgeGovernedChangeSet } from "./generate-knowledge-governed-change-set.js";
import { transitionKnowledgeSnapshotLifecycle } from "./manage-knowledge-snapshot-lifecycle.js";

export interface InitializeKnowledgeSnapshotApprovalWorkflowInput {
  activeSnapshot: KnowledgeRepositorySnapshot;
  proposedSnapshot: KnowledgeRepositorySnapshot;
  proposedSnapshotLifecycle: KnowledgeSnapshotLifecycleRecord;
}

export function initializeKnowledgeSnapshotApprovalWorkflow(
  input: InitializeKnowledgeSnapshotApprovalWorkflowInput,
): KnowledgeSnapshotApprovalWorkflow {
  const proposedSnapshotLifecycle = parseKnowledgeSnapshotLifecycleRecord(
    input.proposedSnapshotLifecycle,
    "Cannot initialize workflow with invalid proposed lifecycle",
  );
  if (proposedSnapshotLifecycle.status !== "validated") {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "A snapshot approval workflow requires a proposed snapshot lifecycle in validated status",
    );
  }
  const changeSet = generateKnowledgeGovernedChangeSet({
    currentSnapshot: input.activeSnapshot,
    proposedSnapshot: input.proposedSnapshot,
  });

  return deepFreeze(
    parseWithSnapshotDomainError(
      KnowledgeSnapshotApprovalWorkflowSchema,
      {
        activeSnapshot: input.activeSnapshot,
        proposedSnapshot: input.proposedSnapshot,
        changeSet,
        proposedSnapshotLifecycle,
        reviewStatus: "pending",
      },
      KnowledgeSnapshotApprovalWorkflowError,
      "Cannot initialize snapshot approval workflow",
    ),
  );
}

function updateWorkflow(
  workflow: KnowledgeSnapshotApprovalWorkflow,
  lifecycle: KnowledgeSnapshotLifecycleRecord,
  reviewStatus: "pending" | "reviewing" | "approved" | "rejected",
  context: string,
): KnowledgeSnapshotApprovalWorkflow {
  return deepFreeze(
    parseWithSnapshotDomainError(
      KnowledgeSnapshotApprovalWorkflowSchema,
      {
        ...workflow,
        changeSet: { ...workflow.changeSet, reviewStatus },
        proposedSnapshotLifecycle: lifecycle,
        reviewStatus,
      },
      KnowledgeSnapshotApprovalWorkflowError,
      context,
    ),
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
    workflow.proposedSnapshotLifecycle.status !== "validated"
  ) {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "Snapshot approval review can begin only from a validated workflow with pending review",
    );
  }
  return updateWorkflow(
    workflow,
    transitionKnowledgeSnapshotLifecycle(
      workflow.proposedSnapshotLifecycle,
      workflow.proposedSnapshot,
      evidence,
    ),
    "reviewing",
    "Cannot begin snapshot approval review",
  );
}

export function approveKnowledgeSnapshotApprovalWorkflow(
  workflowInput: KnowledgeSnapshotApprovalWorkflow,
  evidence: SnapshotLifecycleTransitionEvidence,
): KnowledgeSnapshotApprovalWorkflow {
  const workflow = parseKnowledgeSnapshotApprovalWorkflow(
    workflowInput,
    "Cannot approve invalid workflow",
  );
  if (
    workflow.reviewStatus !== "reviewing" ||
    workflow.proposedSnapshotLifecycle.status !== "reviewing"
  ) {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "Snapshot approval workflow can be approved only while reviewing",
    );
  }
  return updateWorkflow(
    workflow,
    transitionKnowledgeSnapshotLifecycle(
      workflow.proposedSnapshotLifecycle,
      workflow.proposedSnapshot,
      evidence,
    ),
    "approved",
    "Cannot approve snapshot approval workflow",
  );
}

export function rejectKnowledgeSnapshotApprovalWorkflow(
  workflowInput: KnowledgeSnapshotApprovalWorkflow,
): KnowledgeSnapshotApprovalWorkflow {
  const workflow = parseKnowledgeSnapshotApprovalWorkflow(
    workflowInput,
    "Cannot reject invalid workflow",
  );
  if (
    workflow.reviewStatus !== "reviewing" ||
    workflow.proposedSnapshotLifecycle.status !== "reviewing"
  ) {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "Snapshot approval workflow can be rejected only while reviewing",
    );
  }
  return updateWorkflow(
    workflow,
    workflow.proposedSnapshotLifecycle,
    "rejected",
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
    workflow.proposedSnapshotLifecycle.status !== "approved"
  ) {
    throw new KnowledgeSnapshotApprovalWorkflowError(
      "Snapshot approval workflow can activate only after an approved review",
    );
  }
  return updateWorkflow(
    workflow,
    transitionKnowledgeSnapshotLifecycle(
      workflow.proposedSnapshotLifecycle,
      workflow.proposedSnapshot,
      evidence,
    ),
    "approved",
    "Cannot activate snapshot approval workflow",
  );
}
