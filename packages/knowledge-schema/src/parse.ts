import {
  KnowledgeCorpusChangeSetSchema,
  KnowledgeCorpusSourceSchema,
  KnowledgeRepositorySnapshotSchema,
  type KnowledgeCorpusChangeSet,
  type KnowledgeCorpusSource,
  type KnowledgeRepositorySnapshot,
} from "./corpus.js";
import {
  ActivationAuditRecordSchema,
  ApproveGovernedSnapshotInputSchema,
  BeginGovernedSnapshotReviewInputSchema,
  DecisionTransactionRecordsSchema,
  BootstrapGovernedChangeSetSchema,
  CommittedRegistryTransactionEnvelopeSchema,
  DerivedRegistryIndexResultSchema,
  DurableKnowledgeMigrationManifestSchema,
  DurableSnapshotManifestEvidenceSchema,
  DurableAuditRecordSchema,
  DurableGovernedChangeSetEvidenceSchema,
  DurableGovernedChangeSetRecordSchema,
  DurableLifecycleTransitionRecordSchema,
  DurableReviewDecisionRecordSchema,
  DurableSnapshotRegistrationRecordSchema,
  GovernedLifecycleTransitionInputSchema,
  NonActivationDurableLifecycleTransitionRecordSchema,
  OrderedDurableAuditRecordsSchema,
  RegistryIntegrityResultSchema,
  RegistryRecoveryResultSchema,
  RecordGovernedChangeSetInputSchema,
  RegisterGovernedSnapshotInputSchema,
  RejectGovernedSnapshotInputSchema,
  SnapshotActivationRequestSchema,
  SnapshotActivationResultSchema,
  StandaloneDurableLifecycleTransitionRecordSchema,
  type ActivationAuditRecord,
  type ApproveGovernedSnapshotInput,
  type BeginGovernedSnapshotReviewInput,
  type DecisionTransactionRecords,
  type BootstrapGovernedChangeSet,
  type CommittedRegistryTransactionEnvelope,
  type DerivedRegistryIndexResult,
  type DurableKnowledgeMigrationManifest,
  type DurableSnapshotManifestEvidence,
  type DurableAuditRecord,
  type DurableGovernedChangeSetEvidence,
  type DurableGovernedChangeSetRecord,
  type DurableLifecycleTransitionRecord,
  type DurableReviewDecisionRecord,
  type DurableSnapshotRegistrationRecord,
  type GovernedLifecycleTransitionInput,
  type NonActivationDurableLifecycleTransitionRecord,
  type OrderedDurableAuditRecords,
  type RegistryIntegrityResult,
  type RegistryRecoveryResult,
  type RecordGovernedChangeSetInput,
  type RegisterGovernedSnapshotInput,
  type RejectGovernedSnapshotInput,
  type SnapshotActivationRequest,
  type SnapshotActivationResult,
  type StandaloneDurableLifecycleTransitionRecord,
} from "./durable-registry.js";
import { KnowledgeMetadataSchema, type KnowledgeMetadata } from "./metadata.js";
import { KnowledgeObjectSchema, type KnowledgeObject } from "./objects.js";
import { KnowledgeQuerySchema, type KnowledgeQuery } from "./query.js";
import { KnowledgeQueryResultSchema, type KnowledgeQueryResult } from "./query-result.js";
import {
  KnowledgeCandidateBatchSchema,
  KnowledgeCandidateSourceDescriptorSchema,
  KnowledgeRepositoryFindRequestSchema,
  type KnowledgeCandidateBatch,
  type KnowledgeCandidateSourceDescriptor,
  type KnowledgeRepositoryFindRequest,
} from "./repository.js";
import {
  KnowledgeGovernedChangeSetSchema,
  KnowledgeSnapshotApprovalWorkflowSchema,
  KnowledgeSnapshotComparisonEvidenceSchema,
  KnowledgeSnapshotComparisonRequestSchema,
  KnowledgeSnapshotLifecycleRecordSchema,
  KnowledgeSnapshotReviewDecisionSchema,
  type KnowledgeGovernedChangeSet,
  type KnowledgeSnapshotApprovalWorkflow,
  type KnowledgeSnapshotComparisonEvidence,
  type KnowledgeSnapshotComparisonRequest,
  type KnowledgeSnapshotLifecycleRecord,
  type KnowledgeSnapshotReviewDecision,
} from "./snapshot-lifecycle.js";

export function parseKnowledgeMetadata(input: unknown): KnowledgeMetadata {
  return KnowledgeMetadataSchema.parse(input);
}

export function safeParseKnowledgeMetadata(input: unknown) {
  return KnowledgeMetadataSchema.safeParse(input);
}

export function parseKnowledgeObject(input: unknown): KnowledgeObject {
  return KnowledgeObjectSchema.parse(input);
}

export function safeParseKnowledgeObject(input: unknown) {
  return KnowledgeObjectSchema.safeParse(input);
}

export function parseKnowledgeQuery(input: unknown): KnowledgeQuery {
  return KnowledgeQuerySchema.parse(input);
}

export function safeParseKnowledgeQuery(input: unknown) {
  return KnowledgeQuerySchema.safeParse(input);
}

export function parseKnowledgeQueryResult(input: unknown): KnowledgeQueryResult {
  return KnowledgeQueryResultSchema.parse(input);
}

export function safeParseKnowledgeQueryResult(input: unknown) {
  return KnowledgeQueryResultSchema.safeParse(input);
}

export function parseKnowledgeCandidateSourceDescriptor(
  input: unknown,
): KnowledgeCandidateSourceDescriptor {
  return KnowledgeCandidateSourceDescriptorSchema.parse(input);
}

export function safeParseKnowledgeCandidateSourceDescriptor(input: unknown) {
  return KnowledgeCandidateSourceDescriptorSchema.safeParse(input);
}

export function parseKnowledgeCandidateBatch(input: unknown): KnowledgeCandidateBatch {
  return KnowledgeCandidateBatchSchema.parse(input);
}

export function safeParseKnowledgeCandidateBatch(input: unknown) {
  return KnowledgeCandidateBatchSchema.safeParse(input);
}

export function parseKnowledgeRepositoryFindRequest(
  input: unknown,
): KnowledgeRepositoryFindRequest {
  return KnowledgeRepositoryFindRequestSchema.parse(input);
}

export function safeParseKnowledgeRepositoryFindRequest(input: unknown) {
  return KnowledgeRepositoryFindRequestSchema.safeParse(input);
}

export function parseKnowledgeCorpusSource(input: unknown): KnowledgeCorpusSource {
  return KnowledgeCorpusSourceSchema.parse(input);
}

export function safeParseKnowledgeCorpusSource(input: unknown) {
  return KnowledgeCorpusSourceSchema.safeParse(input);
}

export function parseKnowledgeRepositorySnapshot(input: unknown): KnowledgeRepositorySnapshot {
  return KnowledgeRepositorySnapshotSchema.parse(input);
}

export function safeParseKnowledgeRepositorySnapshot(input: unknown) {
  return KnowledgeRepositorySnapshotSchema.safeParse(input);
}

export function parseKnowledgeCorpusChangeSet(input: unknown): KnowledgeCorpusChangeSet {
  return KnowledgeCorpusChangeSetSchema.parse(input);
}

export function safeParseKnowledgeCorpusChangeSet(input: unknown) {
  return KnowledgeCorpusChangeSetSchema.safeParse(input);
}

export function parseKnowledgeSnapshotLifecycleRecord(
  input: unknown,
): KnowledgeSnapshotLifecycleRecord {
  return KnowledgeSnapshotLifecycleRecordSchema.parse(input);
}

export function safeParseKnowledgeSnapshotLifecycleRecord(input: unknown) {
  return KnowledgeSnapshotLifecycleRecordSchema.safeParse(input);
}

export function parseKnowledgeSnapshotComparisonEvidence(
  input: unknown,
): KnowledgeSnapshotComparisonEvidence {
  return KnowledgeSnapshotComparisonEvidenceSchema.parse(input);
}

export function safeParseKnowledgeSnapshotComparisonEvidence(input: unknown) {
  return KnowledgeSnapshotComparisonEvidenceSchema.safeParse(input);
}

export function parseKnowledgeSnapshotComparisonRequest(
  input: unknown,
): KnowledgeSnapshotComparisonRequest {
  return KnowledgeSnapshotComparisonRequestSchema.parse(input);
}

export function safeParseKnowledgeSnapshotComparisonRequest(input: unknown) {
  return KnowledgeSnapshotComparisonRequestSchema.safeParse(input);
}

export function parseKnowledgeGovernedChangeSet(input: unknown): KnowledgeGovernedChangeSet {
  return KnowledgeGovernedChangeSetSchema.parse(input);
}

export function safeParseKnowledgeGovernedChangeSet(input: unknown) {
  return KnowledgeGovernedChangeSetSchema.safeParse(input);
}

export function parseKnowledgeSnapshotApprovalWorkflow(
  input: unknown,
): KnowledgeSnapshotApprovalWorkflow {
  return KnowledgeSnapshotApprovalWorkflowSchema.parse(input);
}

export function safeParseKnowledgeSnapshotApprovalWorkflow(input: unknown) {
  return KnowledgeSnapshotApprovalWorkflowSchema.safeParse(input);
}

export function parseKnowledgeSnapshotReviewDecision(
  input: unknown,
): KnowledgeSnapshotReviewDecision {
  return KnowledgeSnapshotReviewDecisionSchema.parse(input);
}

export function safeParseKnowledgeSnapshotReviewDecision(input: unknown) {
  return KnowledgeSnapshotReviewDecisionSchema.safeParse(input);
}

export function parseDurableSnapshotRegistrationRecord(
  input: unknown,
): DurableSnapshotRegistrationRecord {
  return DurableSnapshotRegistrationRecordSchema.parse(input);
}

export function safeParseDurableSnapshotRegistrationRecord(input: unknown) {
  return DurableSnapshotRegistrationRecordSchema.safeParse(input);
}

export function parseDurableSnapshotManifestEvidence(
  input: unknown,
): DurableSnapshotManifestEvidence {
  return DurableSnapshotManifestEvidenceSchema.parse(input);
}

export function safeParseDurableSnapshotManifestEvidence(input: unknown) {
  return DurableSnapshotManifestEvidenceSchema.safeParse(input);
}

export function parseDurableKnowledgeMigrationManifest(
  input: unknown,
): DurableKnowledgeMigrationManifest {
  return DurableKnowledgeMigrationManifestSchema.parse(input);
}

export function safeParseDurableKnowledgeMigrationManifest(input: unknown) {
  return DurableKnowledgeMigrationManifestSchema.safeParse(input);
}

export function parseRegisterGovernedSnapshotInput(input: unknown): RegisterGovernedSnapshotInput {
  return RegisterGovernedSnapshotInputSchema.parse(input);
}

export function safeParseRegisterGovernedSnapshotInput(input: unknown) {
  return RegisterGovernedSnapshotInputSchema.safeParse(input);
}

export function parseRecordGovernedChangeSetInput(input: unknown): RecordGovernedChangeSetInput {
  return RecordGovernedChangeSetInputSchema.parse(input);
}

export function safeParseRecordGovernedChangeSetInput(input: unknown) {
  return RecordGovernedChangeSetInputSchema.safeParse(input);
}

export function parseGovernedLifecycleTransitionInput(
  input: unknown,
): GovernedLifecycleTransitionInput {
  return GovernedLifecycleTransitionInputSchema.parse(input);
}

export function safeParseGovernedLifecycleTransitionInput(input: unknown) {
  return GovernedLifecycleTransitionInputSchema.safeParse(input);
}

export function parseBeginGovernedSnapshotReviewInput(
  input: unknown,
): BeginGovernedSnapshotReviewInput {
  return BeginGovernedSnapshotReviewInputSchema.parse(input);
}

export function safeParseBeginGovernedSnapshotReviewInput(input: unknown) {
  return BeginGovernedSnapshotReviewInputSchema.safeParse(input);
}

export function parseApproveGovernedSnapshotInput(input: unknown): ApproveGovernedSnapshotInput {
  return ApproveGovernedSnapshotInputSchema.parse(input);
}

export function safeParseApproveGovernedSnapshotInput(input: unknown) {
  return ApproveGovernedSnapshotInputSchema.safeParse(input);
}

export function parseRejectGovernedSnapshotInput(input: unknown): RejectGovernedSnapshotInput {
  return RejectGovernedSnapshotInputSchema.parse(input);
}

export function safeParseRejectGovernedSnapshotInput(input: unknown) {
  return RejectGovernedSnapshotInputSchema.safeParse(input);
}

export function parseDurableLifecycleTransitionRecord(
  input: unknown,
): DurableLifecycleTransitionRecord {
  return DurableLifecycleTransitionRecordSchema.parse(input);
}

export function safeParseDurableLifecycleTransitionRecord(input: unknown) {
  return DurableLifecycleTransitionRecordSchema.safeParse(input);
}

export function parseNonActivationDurableLifecycleTransitionRecord(
  input: unknown,
): NonActivationDurableLifecycleTransitionRecord {
  return NonActivationDurableLifecycleTransitionRecordSchema.parse(input);
}

export function safeParseNonActivationDurableLifecycleTransitionRecord(input: unknown) {
  return NonActivationDurableLifecycleTransitionRecordSchema.safeParse(input);
}

export function parseStandaloneDurableLifecycleTransitionRecord(
  input: unknown,
): StandaloneDurableLifecycleTransitionRecord {
  return StandaloneDurableLifecycleTransitionRecordSchema.parse(input);
}

export function safeParseStandaloneDurableLifecycleTransitionRecord(input: unknown) {
  return StandaloneDurableLifecycleTransitionRecordSchema.safeParse(input);
}

export function parseDurableReviewDecisionRecord(input: unknown): DurableReviewDecisionRecord {
  return DurableReviewDecisionRecordSchema.parse(input);
}

export function safeParseDurableReviewDecisionRecord(input: unknown) {
  return DurableReviewDecisionRecordSchema.safeParse(input);
}

export function parseDecisionTransactionRecords(input: unknown): DecisionTransactionRecords {
  return DecisionTransactionRecordsSchema.parse(input);
}

export function safeParseDecisionTransactionRecords(input: unknown) {
  return DecisionTransactionRecordsSchema.safeParse(input);
}

export function parseBootstrapGovernedChangeSet(input: unknown): BootstrapGovernedChangeSet {
  return BootstrapGovernedChangeSetSchema.parse(input);
}

export function safeParseBootstrapGovernedChangeSet(input: unknown) {
  return BootstrapGovernedChangeSetSchema.safeParse(input);
}

export function parseDurableGovernedChangeSetEvidence(
  input: unknown,
): DurableGovernedChangeSetEvidence {
  return DurableGovernedChangeSetEvidenceSchema.parse(input);
}

export function safeParseDurableGovernedChangeSetEvidence(input: unknown) {
  return DurableGovernedChangeSetEvidenceSchema.safeParse(input);
}

export function parseDurableGovernedChangeSetRecord(
  input: unknown,
): DurableGovernedChangeSetRecord {
  return DurableGovernedChangeSetRecordSchema.parse(input);
}

export function safeParseDurableGovernedChangeSetRecord(input: unknown) {
  return DurableGovernedChangeSetRecordSchema.safeParse(input);
}

export function parseActivationAuditRecord(input: unknown): ActivationAuditRecord {
  return ActivationAuditRecordSchema.parse(input);
}

export function safeParseActivationAuditRecord(input: unknown) {
  return ActivationAuditRecordSchema.safeParse(input);
}

export function parseDurableAuditRecord(input: unknown): DurableAuditRecord {
  return DurableAuditRecordSchema.parse(input);
}

export function safeParseDurableAuditRecord(input: unknown) {
  return DurableAuditRecordSchema.safeParse(input);
}

export function parseOrderedDurableAuditRecords(input: unknown): OrderedDurableAuditRecords {
  return OrderedDurableAuditRecordsSchema.parse(input);
}

export function safeParseOrderedDurableAuditRecords(input: unknown) {
  return OrderedDurableAuditRecordsSchema.safeParse(input);
}

export function parseCommittedRegistryTransactionEnvelope(
  input: unknown,
): CommittedRegistryTransactionEnvelope {
  return CommittedRegistryTransactionEnvelopeSchema.parse(input);
}

export function safeParseCommittedRegistryTransactionEnvelope(input: unknown) {
  return CommittedRegistryTransactionEnvelopeSchema.safeParse(input);
}

export function parseSnapshotActivationRequest(input: unknown): SnapshotActivationRequest {
  return SnapshotActivationRequestSchema.parse(input);
}

export function safeParseSnapshotActivationRequest(input: unknown) {
  return SnapshotActivationRequestSchema.safeParse(input);
}

export function parseSnapshotActivationResult(input: unknown): SnapshotActivationResult {
  return SnapshotActivationResultSchema.parse(input);
}

export function safeParseSnapshotActivationResult(input: unknown) {
  return SnapshotActivationResultSchema.safeParse(input);
}

export function parseRegistryRecoveryResult(input: unknown): RegistryRecoveryResult {
  return RegistryRecoveryResultSchema.parse(input);
}

export function safeParseRegistryRecoveryResult(input: unknown) {
  return RegistryRecoveryResultSchema.safeParse(input);
}

export function parseRegistryIntegrityResult(input: unknown): RegistryIntegrityResult {
  return RegistryIntegrityResultSchema.parse(input);
}

export function safeParseRegistryIntegrityResult(input: unknown) {
  return RegistryIntegrityResultSchema.safeParse(input);
}

export function parseDerivedRegistryIndexResult(input: unknown): DerivedRegistryIndexResult {
  return DerivedRegistryIndexResultSchema.parse(input);
}

export function safeParseDerivedRegistryIndexResult(input: unknown) {
  return DerivedRegistryIndexResultSchema.safeParse(input);
}
