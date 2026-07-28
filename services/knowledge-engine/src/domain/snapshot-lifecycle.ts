import {
  KnowledgeSnapshotApprovalWorkflowSchema,
  KnowledgeSnapshotLifecycleRecordSchema,
  KnowledgeRepositorySnapshotSchema,
  type KnowledgeSnapshotApprovalWorkflow,
  type KnowledgeSnapshotLifecycleRecord,
  type KnowledgeRepositorySnapshot,
} from "@founderos/knowledge-schema";

import { findKnowledgeSnapshotComparisonEvidenceIntegrityIssue } from "./knowledge-snapshot-comparison-evidence.js";

export class KnowledgeSnapshotLifecycleError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KnowledgeSnapshotLifecycleError";
  }
}

export class KnowledgeSnapshotComparisonError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KnowledgeSnapshotComparisonError";
  }
}

export class KnowledgeSnapshotApprovalWorkflowError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "KnowledgeSnapshotApprovalWorkflowError";
  }
}

interface SchemaIssue {
  message: string;
  path: PropertyKey[];
}

interface SafeParseSchema<T> {
  safeParse(
    input: unknown,
  ): { success: true; data: T } | { success: false; error: { issues: readonly SchemaIssue[] } };
}

type SnapshotDomainError =
  | typeof KnowledgeSnapshotLifecycleError
  | typeof KnowledgeSnapshotComparisonError
  | typeof KnowledgeSnapshotApprovalWorkflowError;

function validationMessage(error: { issues: readonly SchemaIssue[] }): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`)
    .join("; ");
}

export function parseWithSnapshotDomainError<T>(
  schema: SafeParseSchema<T>,
  input: unknown,
  ErrorType: SnapshotDomainError,
  context: string,
): T {
  const result = schema.safeParse(structuredClone(input));
  if (!result.success) throw new ErrorType(`${context}: ${validationMessage(result.error)}`);
  return result.data;
}

export function parseKnowledgeRepositorySnapshot(
  input: unknown,
  context: string,
): KnowledgeRepositorySnapshot {
  return parseWithSnapshotDomainError(
    KnowledgeRepositorySnapshotSchema,
    input,
    KnowledgeSnapshotLifecycleError,
    context,
  );
}

export function parseKnowledgeSnapshotLifecycleRecord(
  input: unknown,
  context: string,
): KnowledgeSnapshotLifecycleRecord {
  return parseWithSnapshotDomainError(
    KnowledgeSnapshotLifecycleRecordSchema,
    input,
    KnowledgeSnapshotLifecycleError,
    context,
  );
}

export function parseKnowledgeSnapshotApprovalWorkflow(
  input: unknown,
  context: string,
): KnowledgeSnapshotApprovalWorkflow {
  const workflow = parseWithSnapshotDomainError(
    KnowledgeSnapshotApprovalWorkflowSchema,
    input,
    KnowledgeSnapshotApprovalWorkflowError,
    context,
  );
  for (const [label, evidence] of [
    ["active", workflow.activeSnapshotEvidence],
    ["proposed", workflow.proposedSnapshotEvidence],
  ] as const) {
    const integrityIssue = findKnowledgeSnapshotComparisonEvidenceIntegrityIssue(evidence);
    if (integrityIssue !== null) {
      throw new KnowledgeSnapshotApprovalWorkflowError(
        `${context}: ${label} snapshot evidence failed integrity verification: ${integrityIssue}`,
      );
    }
  }
  return workflow;
}

export function deepFreeze<T>(value: T, visited = new WeakSet<object>()): T {
  if (value === null || typeof value !== "object" || visited.has(value)) return value;

  visited.add(value);
  for (const child of Object.values(value)) deepFreeze(child, visited);
  return Object.freeze(value);
}

export interface SnapshotLifecycleTransitionEvidence {
  actorId: string;
  transitionedAt: string;
}
