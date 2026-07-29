import { z } from "zod";

import {
  DurableCanonicalJsonObjectSchema,
  DurableCanonicalJsonValueSchema,
} from "./canonical-json.js";
import { KnowledgeRepositorySnapshotSchema } from "./corpus.js";
import { KnowledgeMigrationManifestEntrySchema, MigrationPathSchema } from "./migration.js";
import {
  IdentifierSchema,
  IsoTemporalSchema,
  NonEmptyStringSchema,
  Sha256DigestSchema,
} from "./primitives.js";
import {
  KnowledgeGovernedChangeSetSchema,
  KnowledgeSnapshotLifecycleTransitionSchema,
  KnowledgeSnapshotObjectComparisonEvidenceSchema,
  KnowledgeSnapshotReviewDecisionSchema,
  SnapshotReviewStatusSchema,
} from "./snapshot-lifecycle.js";

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
type SnapshotLifecycleState =
  "created" | "validated" | "reviewing" | "approved" | "active" | "superseded" | "archived";

export const DurableActorTypeSchema = z.enum(["human", "service", "system"]);
export const DurableRecordSequenceSchema = z.number().int().positive().max(MAX_SAFE_INTEGER);
export const DurableRecordCountSchema = z.number().int().nonnegative().max(MAX_SAFE_INTEGER);
export const DurablePreviousRecordFingerprintSchema = z.union([
  z.literal("genesis"),
  Sha256DigestSchema,
]);

function requireValidChainPosition(
  value: { sequence: number; previousRecordFingerprint: string },
  context: z.RefinementCtx,
): void {
  if (value.sequence === 1 && value.previousRecordFingerprint !== "genesis") {
    context.addIssue({
      code: "custom",
      message: "The first durable record must explicitly link to genesis",
      path: ["previousRecordFingerprint"],
    });
  }

  if (value.sequence > 1 && value.previousRecordFingerprint === "genesis") {
    context.addIssue({
      code: "custom",
      message: "Only the first durable record may link to genesis",
      path: ["previousRecordFingerprint"],
    });
  }
}

function requireNullableFingerprintBinding(
  identity: string | null,
  fingerprint: string | null,
  context: z.RefinementCtx,
  identityPath: string,
  fingerprintPath: string,
): void {
  if ((identity === null) !== (fingerprint === null)) {
    context.addIssue({
      code: "custom",
      message: `${identityPath} and ${fingerprintPath} must either both be present or both be null`,
      path: [identity === null ? identityPath : fingerprintPath],
    });
  }
}

function requireSnapshotIdentity(
  snapshotId: string,
  fingerprint: string,
  context: z.RefinementCtx,
  path: string,
): void {
  if (snapshotId !== `snapshot-${fingerprint}`) {
    context.addIssue({
      code: "custom",
      message: "Snapshot identity must match its bound content fingerprint",
      path: [path],
    });
  }
}

function isSortedUnique(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1]! < value)
  );
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

const DurableRecordChainFields = {
  transactionId: IdentifierSchema,
  sequence: DurableRecordSequenceSchema,
  previousRecordFingerprint: DurablePreviousRecordFingerprintSchema,
} as const;

const DurableRecordActorFields = {
  actorId: IdentifierSchema,
  actorType: DurableActorTypeSchema,
  reason: NonEmptyStringSchema,
} as const;

export const DurableSnapshotRegistrationProvenanceSchema = z
  .object({
    corpusId: IdentifierSchema,
    corpusVersion: NonEmptyStringSchema,
    sourceManifestReference: MigrationPathSchema,
    snapshotCreatedAt: IsoTemporalSchema,
    snapshotCreatedBy: IdentifierSchema,
  })
  .strict();

const DurableKnowledgeMigrationManifestEntrySchema = KnowledgeMigrationManifestEntrySchema.extend({
  objectData: DurableCanonicalJsonObjectSchema.default({}),
}).strict();

const DurableKnowledgeMigrationManifestFieldsSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    corpusId: IdentifierSchema,
    documents: z.array(DurableKnowledgeMigrationManifestEntrySchema),
  })
  .strict()
  .superRefine((manifest, context) => {
    const idIndexes = new Map<string, number[]>();
    const destinationIndexes = new Map<string, number[]>();
    manifest.documents.forEach((document, index) => {
      idIndexes.set(document.id, [...(idIndexes.get(document.id) ?? []), index]);
      destinationIndexes.set(document.destinationPath, [
        ...(destinationIndexes.get(document.destinationPath) ?? []),
        index,
      ]);
    });
    for (const [id, indexes] of idIndexes) {
      if (indexes.length < 2) continue;
      for (const index of indexes) {
        context.addIssue({
          code: "custom",
          message: `Knowledge object ID ${id} is duplicated in the durable manifest`,
          path: ["documents", index, "id"],
        });
      }
    }
    for (const [destinationPath, indexes] of destinationIndexes) {
      if (indexes.length < 2) continue;
      for (const index of indexes) {
        context.addIssue({
          code: "custom",
          message: `Destination path ${destinationPath} is duplicated in the durable manifest`,
          path: ["documents", index, "destinationPath"],
        });
      }
    }
  });

/**
 * A durable manifest retains the Milestone 04 entry contract while narrowing
 * arbitrary object data to canonical JSON and allowing an empty eligible corpus.
 */
export const DurableKnowledgeMigrationManifestSchema = DurableCanonicalJsonValueSchema.pipe(
  DurableKnowledgeMigrationManifestFieldsSchema,
);

const DurableSnapshotManifestEvidenceFieldsSchema = z
  .object({
    manifestReference: MigrationPathSchema,
    manifest: DurableKnowledgeMigrationManifestSchema,
  })
  .strict();

/**
 * Storage-independent evidence for the exact canonical migration manifest
 * associated with a snapshot. The reference is committed beside the parsed
 * manifest so replay can bind both the corpus identity and provenance path.
 */
export const DurableSnapshotManifestEvidenceSchema = DurableCanonicalJsonValueSchema.pipe(
  DurableSnapshotManifestEvidenceFieldsSchema,
);

interface ManifestSnapshotDescriptor {
  readonly objectId: string;
  readonly objectType: string;
  readonly sourceHash: string;
  readonly sourcePath: string;
}

function eligibleManifestSnapshotDescriptors(
  evidence: z.infer<typeof DurableSnapshotManifestEvidenceSchema>,
): ManifestSnapshotDescriptor[] {
  return evidence.manifest.documents
    .filter(
      (document) =>
        document.reviewStatus === "approved" &&
        (document.migrationStatus === "ready" || document.migrationStatus === "migrated"),
    )
    .map((document) => ({
      objectId: document.id,
      objectType: document.objectType,
      sourcePath: document.sourcePath,
      sourceHash: document.sourceHash,
    }))
    .sort((left, right) => compareStrings(left.objectId, right.objectId));
}

function snapshotManifestDescriptors(
  snapshot: z.infer<typeof KnowledgeRepositorySnapshotSchema>,
): ManifestSnapshotDescriptor[] {
  return snapshot.objects
    .map((object) => ({
      objectId: object.objectId,
      objectType: object.objectType,
      sourcePath: object.sourcePath,
      sourceHash: object.sourceHash,
    }))
    .sort((left, right) => compareStrings(left.objectId, right.objectId));
}

function requireManifestEvidenceBindings(
  evidence: z.infer<typeof DurableSnapshotManifestEvidenceSchema>,
  snapshot: z.infer<typeof KnowledgeRepositorySnapshotSchema>,
  context: z.RefinementCtx,
  pathPrefix: readonly (string | number)[] = ["manifestEvidence"],
): void {
  if (evidence.manifestReference !== snapshot.sourceManifestReference) {
    context.addIssue({
      code: "custom",
      message: "Manifest evidence reference must match the snapshot provenance reference",
      path: [...pathPrefix, "manifestReference"],
    });
  }
  if (evidence.manifest.corpusId !== snapshot.corpusId) {
    context.addIssue({
      code: "custom",
      message: "Manifest evidence corpus identity must match the registered snapshot",
      path: [...pathPrefix, "manifest", "corpusId"],
    });
  }
  const eligible = eligibleManifestSnapshotDescriptors(evidence);
  const registered = snapshotManifestDescriptors(snapshot);
  const matches =
    eligible.length === registered.length &&
    eligible.every((descriptor, index) => {
      const snapshotDescriptor = registered[index];
      return (
        snapshotDescriptor !== undefined &&
        descriptor.objectId === snapshotDescriptor.objectId &&
        descriptor.objectType === snapshotDescriptor.objectType &&
        descriptor.sourcePath === snapshotDescriptor.sourcePath &&
        descriptor.sourceHash === snapshotDescriptor.sourceHash
      );
    });
  if (!matches) {
    context.addIssue({
      code: "custom",
      message:
        "Approved ready-or-migrated manifest entries must exactly match the sorted snapshot object descriptors",
      path: [...pathPrefix, "manifest", "documents"],
    });
  }
}

export const DurableSnapshotRegistrationRecordSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    recordType: z.literal("snapshot_registration"),
    registrationId: IdentifierSchema,
    ...DurableRecordChainFields,
    snapshotContractVersion: z.literal("1.0"),
    snapshot: KnowledgeRepositorySnapshotSchema,
    manifestEvidence: DurableSnapshotManifestEvidenceSchema,
    manifestFingerprint: Sha256DigestSchema,
    provenanceSummary: DurableSnapshotRegistrationProvenanceSchema,
    ...DurableRecordActorFields,
    registeredAt: IsoTemporalSchema,
    recordFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((record, context) => {
    requireValidChainPosition(record, context);

    if (record.registrationId !== `registration-${record.snapshot.snapshotId}`) {
      context.addIssue({
        code: "custom",
        message: "Registration identity must be derived from the immutable snapshot identity",
        path: ["registrationId"],
      });
    }
    if (record.snapshotContractVersion !== record.snapshot.schemaVersion) {
      context.addIssue({
        code: "custom",
        message: "Snapshot contract version must match the registered snapshot",
        path: ["snapshotContractVersion"],
      });
    }
    requireManifestEvidenceBindings(record.manifestEvidence, record.snapshot, context);

    const expectedProvenance = {
      corpusId: record.snapshot.corpusId,
      corpusVersion: record.snapshot.corpusVersion,
      sourceManifestReference: record.snapshot.sourceManifestReference,
      snapshotCreatedAt: record.snapshot.creation.createdAt,
      snapshotCreatedBy: record.snapshot.creation.createdBy,
    } as const;
    for (const [field, expected] of Object.entries(expectedProvenance)) {
      if (record.provenanceSummary[field as keyof typeof expectedProvenance] !== expected) {
        context.addIssue({
          code: "custom",
          message: `${field} must match the registered snapshot provenance`,
          path: ["provenanceSummary", field],
        });
      }
    }

    if (Date.parse(record.registeredAt) < Date.parse(record.snapshot.creation.createdAt)) {
      context.addIssue({
        code: "custom",
        message: "Registration cannot occur before snapshot creation",
        path: ["registeredAt"],
      });
    }
  });

export const DurableLifecycleEvidenceBindingSchema = z
  .object({
    changeSetId: IdentifierSchema.nullable(),
    changeSetFingerprint: Sha256DigestSchema.nullable(),
    decisionId: IdentifierSchema.nullable(),
    decisionFingerprint: Sha256DigestSchema.nullable(),
    activationId: IdentifierSchema.nullable(),
  })
  .strict()
  .superRefine((binding, context) => {
    requireNullableFingerprintBinding(
      binding.changeSetId,
      binding.changeSetFingerprint,
      context,
      "changeSetId",
      "changeSetFingerprint",
    );
    requireNullableFingerprintBinding(
      binding.decisionId,
      binding.decisionFingerprint,
      context,
      "decisionId",
      "decisionFingerprint",
    );
  });

type LifecycleEvidencePresence = Readonly<{
  activation: boolean;
  changeSet: boolean;
  decision: boolean;
}>;

function durableLifecycleTransitionRecordSchema<
  From extends SnapshotLifecycleState,
  To extends SnapshotLifecycleState,
>(from: From, to: To, expectedBindings: LifecycleEvidencePresence) {
  return z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("lifecycle_transition"),
      transitionId: IdentifierSchema,
      ...DurableRecordChainFields,
      snapshotId: IdentifierSchema,
      from: z.literal(from),
      to: z.literal(to),
      actorId: KnowledgeSnapshotLifecycleTransitionSchema.shape.actorId,
      actorType: DurableActorTypeSchema,
      reason: NonEmptyStringSchema,
      transitionedAt: KnowledgeSnapshotLifecycleTransitionSchema.shape.transitionedAt,
      evidence: DurableLifecycleEvidenceBindingSchema,
      recordFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((record, context) => {
      requireValidChainPosition(record, context);

      const bindingPresence = {
        changeSet: record.evidence.changeSetId !== null,
        decision: record.evidence.decisionId !== null,
        activation: record.evidence.activationId !== null,
      } as const;
      for (const key of ["changeSet", "decision", "activation"] as const) {
        if (bindingPresence[key] !== expectedBindings[key]) {
          context.addIssue({
            code: "custom",
            message: `Transition to ${to} has invalid ${key} evidence bindings`,
            path: ["evidence"],
          });
        }
      }
    });
}

const DurableValidationLifecycleTransitionRecordSchema = durableLifecycleTransitionRecordSchema(
  "created",
  "validated",
  {
    changeSet: false,
    decision: false,
    activation: false,
  },
);
const DurableReviewingLifecycleTransitionRecordSchema = durableLifecycleTransitionRecordSchema(
  "validated",
  "reviewing",
  {
    changeSet: true,
    decision: false,
    activation: false,
  },
);
export const DurableApprovalLifecycleTransitionRecordSchema =
  durableLifecycleTransitionRecordSchema("reviewing", "approved", {
    changeSet: true,
    decision: true,
    activation: false,
  });
const DurableArchiveLifecycleTransitionRecordSchema = durableLifecycleTransitionRecordSchema(
  "superseded",
  "archived",
  {
    changeSet: false,
    decision: false,
    activation: false,
  },
);
export const DurableCandidateActivationTransitionRecordSchema =
  durableLifecycleTransitionRecordSchema("approved", "active", {
    changeSet: true,
    decision: true,
    activation: true,
  });
export const DurableActiveSupersessionTransitionRecordSchema =
  durableLifecycleTransitionRecordSchema("active", "superseded", {
    changeSet: false,
    decision: false,
    activation: true,
  });

export const NonActivationDurableLifecycleTransitionRecordSchema = z.union([
  DurableValidationLifecycleTransitionRecordSchema,
  DurableReviewingLifecycleTransitionRecordSchema,
  DurableApprovalLifecycleTransitionRecordSchema,
  DurableArchiveLifecycleTransitionRecordSchema,
]);

export const StandaloneDurableLifecycleTransitionRecordSchema = z.union([
  DurableValidationLifecycleTransitionRecordSchema,
  DurableReviewingLifecycleTransitionRecordSchema,
  DurableArchiveLifecycleTransitionRecordSchema,
]);

export const ActivationOwnedDurableLifecycleTransitionRecordSchema = z.union([
  DurableCandidateActivationTransitionRecordSchema,
  DurableActiveSupersessionTransitionRecordSchema,
]);

export const DurableLifecycleTransitionRecordSchema = z.union([
  DurableValidationLifecycleTransitionRecordSchema,
  DurableReviewingLifecycleTransitionRecordSchema,
  DurableApprovalLifecycleTransitionRecordSchema,
  DurableCandidateActivationTransitionRecordSchema,
  DurableActiveSupersessionTransitionRecordSchema,
  DurableArchiveLifecycleTransitionRecordSchema,
]);

function durableReviewDecisionRecordSchema<Decision extends "approved" | "rejected">(
  decision: Decision,
) {
  return z
    .object({
      schemaVersion: z.literal("1.0"),
      recordType: z.literal("review_decision"),
      decisionId: IdentifierSchema,
      ...DurableRecordChainFields,
      reviewDecision: z
        .object({
          ...KnowledgeSnapshotReviewDecisionSchema.shape,
          decision: z.literal(decision),
        })
        .strict(),
      changeSetFingerprint: Sha256DigestSchema,
      proposedSnapshotFingerprint: Sha256DigestSchema,
      actorId: IdentifierSchema,
      actorType: z.literal("human"),
      reason: NonEmptyStringSchema,
      decidedAt: IsoTemporalSchema,
      recordFingerprint: Sha256DigestSchema,
    })
    .strict()
    .superRefine((record, context) => {
      requireValidChainPosition(record, context);
      requireSnapshotIdentity(
        record.reviewDecision.proposedSnapshotId,
        record.proposedSnapshotFingerprint,
        context,
        "proposedSnapshotFingerprint",
      );

      const matchingFields = {
        actorId: record.reviewDecision.actorId,
        reason: record.reviewDecision.reason,
        decidedAt: record.reviewDecision.decidedAt,
      } as const;
      for (const [field, expected] of Object.entries(matchingFields)) {
        if (record[field as keyof typeof matchingFields] !== expected) {
          context.addIssue({
            code: "custom",
            message: `Durable ${field} must match immutable Milestone 08 decision evidence`,
            path: [field],
          });
        }
      }
    });
}

export const DurableApprovalDecisionRecordSchema = durableReviewDecisionRecordSchema("approved");
export const DurableRejectionDecisionRecordSchema = durableReviewDecisionRecordSchema("rejected");
export const DurableReviewDecisionRecordSchema = z.union([
  DurableApprovalDecisionRecordSchema,
  DurableRejectionDecisionRecordSchema,
]);

export const RejectionDecisionTransactionRecordsSchema = z.tuple([
  DurableRejectionDecisionRecordSchema,
]);

export const ApprovalDecisionTransactionRecordsSchema = z
  .tuple([DurableApprovalDecisionRecordSchema, DurableApprovalLifecycleTransitionRecordSchema])
  .superRefine(([decisionRecord, transitionRecord], context) => {
    const expectedBindings = {
      snapshotId: decisionRecord.reviewDecision.proposedSnapshotId,
      changeSetId: decisionRecord.reviewDecision.changeId,
      changeSetFingerprint: decisionRecord.changeSetFingerprint,
      decisionId: decisionRecord.decisionId,
      decisionFingerprint: decisionRecord.recordFingerprint,
      actorId: decisionRecord.actorId,
      actorType: decisionRecord.actorType,
      reason: decisionRecord.reason,
      transitionedAt: decisionRecord.decidedAt,
      transactionId: decisionRecord.transactionId,
      sequence: decisionRecord.sequence + 1,
      previousRecordFingerprint: decisionRecord.recordFingerprint,
    } as const;
    const actualBindings = {
      snapshotId: transitionRecord.snapshotId,
      changeSetId: transitionRecord.evidence.changeSetId,
      changeSetFingerprint: transitionRecord.evidence.changeSetFingerprint,
      decisionId: transitionRecord.evidence.decisionId,
      decisionFingerprint: transitionRecord.evidence.decisionFingerprint,
      actorId: transitionRecord.actorId,
      actorType: transitionRecord.actorType,
      reason: transitionRecord.reason,
      transitionedAt: transitionRecord.transitionedAt,
      transactionId: transitionRecord.transactionId,
      sequence: transitionRecord.sequence,
      previousRecordFingerprint: transitionRecord.previousRecordFingerprint,
    } as const;

    for (const field of Object.keys(expectedBindings) as (keyof typeof expectedBindings)[]) {
      if (actualBindings[field] !== expectedBindings[field]) {
        context.addIssue({
          code: "custom",
          message: `Approval transition ${field} must match its durable approval decision`,
          path: [1, field],
        });
      }
    }
  });

export const DecisionTransactionRecordsSchema = z.union([
  RejectionDecisionTransactionRecordsSchema,
  ApprovalDecisionTransactionRecordsSchema,
]);

export const BootstrapGovernedChangeSetSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    changeSetType: z.literal("bootstrap"),
    changeId: IdentifierSchema,
    sourceSnapshotId: z.null(),
    sourceSnapshotFingerprint: z.null(),
    targetSnapshotId: IdentifierSchema,
    targetSnapshotFingerprint: Sha256DigestSchema,
    targetManifestReference: MigrationPathSchema,
    targetCorpusVersion: NonEmptyStringSchema,
    addedObjects: z.array(KnowledgeSnapshotObjectComparisonEvidenceSchema),
    reviewStatus: SnapshotReviewStatusSchema,
    changed: z.literal(true),
  })
  .strict()
  .superRefine((changeSet, context) => {
    requireSnapshotIdentity(
      changeSet.targetSnapshotId,
      changeSet.targetSnapshotFingerprint,
      context,
      "targetSnapshotId",
    );
    if (changeSet.changeId !== `change-bootstrap-to-${changeSet.targetSnapshotId}`) {
      context.addIssue({
        code: "custom",
        message: "Bootstrap change identity must be derived from its target snapshot",
        path: ["changeId"],
      });
    }
    if (!isSortedUnique(changeSet.addedObjects.map((object) => object.objectId))) {
      context.addIssue({
        code: "custom",
        message: "Bootstrap addedObjects must be unique and sorted by objectId",
        path: ["addedObjects"],
      });
    }
  });

export const DurableGovernedChangeSetEvidenceSchema = z.discriminatedUnion("evidenceType", [
  z
    .object({
      evidenceType: z.literal("comparison"),
      changeSet: KnowledgeGovernedChangeSetSchema,
    })
    .strict(),
  z
    .object({
      evidenceType: z.literal("bootstrap"),
      changeSet: BootstrapGovernedChangeSetSchema,
    })
    .strict(),
]);

export const DurableGovernedChangeSetRecordSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    recordType: z.literal("governed_change_set"),
    changeSetId: IdentifierSchema,
    ...DurableRecordChainFields,
    evidence: DurableGovernedChangeSetEvidenceSchema,
    ...DurableRecordActorFields,
    recordedAt: IsoTemporalSchema,
    recordFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((record, context) => {
    requireValidChainPosition(record, context);
    if (record.changeSetId !== record.evidence.changeSet.changeId) {
      context.addIssue({
        code: "custom",
        message: "Durable change-set identity must match its governed evidence",
        path: ["changeSetId"],
      });
    }
  });

export const ActivationAuditRecordSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    recordType: z.literal("activation_audit"),
    activationId: IdentifierSchema,
    ...DurableRecordChainFields,
    candidateSnapshotId: IdentifierSchema,
    candidateSnapshotFingerprint: Sha256DigestSchema,
    previousActiveSnapshotId: IdentifierSchema.nullable(),
    previousActiveSnapshotFingerprint: Sha256DigestSchema.nullable(),
    expectedActiveSnapshotId: IdentifierSchema.nullable(),
    changeSetType: z.enum(["comparison", "bootstrap"]),
    changeSetId: IdentifierSchema,
    changeSetFingerprint: Sha256DigestSchema,
    approvalDecisionId: IdentifierSchema,
    approvalDecisionFingerprint: Sha256DigestSchema,
    candidateActivationTransitionId: IdentifierSchema,
    previousActiveSupersessionTransitionId: IdentifierSchema.nullable(),
    resultingActiveSnapshotId: IdentifierSchema,
    ...DurableRecordActorFields,
    activatedAt: IsoTemporalSchema,
    recordFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((record, context) => {
    requireValidChainPosition(record, context);
    requireSnapshotIdentity(
      record.candidateSnapshotId,
      record.candidateSnapshotFingerprint,
      context,
      "candidateSnapshotId",
    );
    requireNullableFingerprintBinding(
      record.previousActiveSnapshotId,
      record.previousActiveSnapshotFingerprint,
      context,
      "previousActiveSnapshotId",
      "previousActiveSnapshotFingerprint",
    );
    if (
      record.previousActiveSnapshotId !== null &&
      record.previousActiveSnapshotFingerprint !== null
    ) {
      requireSnapshotIdentity(
        record.previousActiveSnapshotId,
        record.previousActiveSnapshotFingerprint,
        context,
        "previousActiveSnapshotId",
      );
    }
    if (record.expectedActiveSnapshotId !== record.previousActiveSnapshotId) {
      context.addIssue({
        code: "custom",
        message:
          "Committed activation evidence must prove a satisfied expected-active precondition",
        path: ["expectedActiveSnapshotId"],
      });
    }
    if (record.resultingActiveSnapshotId !== record.candidateSnapshotId) {
      context.addIssue({
        code: "custom",
        message: "The resulting active identity must be the candidate snapshot",
        path: ["resultingActiveSnapshotId"],
      });
    }
    if (record.previousActiveSnapshotId === record.candidateSnapshotId) {
      context.addIssue({
        code: "custom",
        message: "Activation must replace a different snapshot identity",
        path: ["previousActiveSnapshotId"],
      });
    }

    const isBootstrap = record.changeSetType === "bootstrap";
    if (isBootstrap !== (record.previousActiveSnapshotId === null)) {
      context.addIssue({
        code: "custom",
        message: "Only a no-baseline first activation may use bootstrap change-set evidence",
        path: ["changeSetType"],
      });
    }
    const expectedChangeSetId = isBootstrap
      ? `change-bootstrap-to-${record.candidateSnapshotId}`
      : `change-${record.previousActiveSnapshotId}-to-${record.candidateSnapshotId}`;
    if (record.changeSetId !== expectedChangeSetId) {
      context.addIssue({
        code: "custom",
        message: "Activation change-set identity must bind its baseline and candidate snapshots",
        path: ["changeSetId"],
      });
    }

    if (
      (record.previousActiveSnapshotId === null) !==
      (record.previousActiveSupersessionTransitionId === null)
    ) {
      context.addIssue({
        code: "custom",
        message: "A previous active snapshot requires one supersession transition binding",
        path: ["previousActiveSupersessionTransitionId"],
      });
    }
    if (
      record.previousActiveSupersessionTransitionId !== null &&
      record.candidateActivationTransitionId === record.previousActiveSupersessionTransitionId
    ) {
      context.addIssue({
        code: "custom",
        message: "Candidate activation and prior supersession transitions require distinct IDs",
        path: ["previousActiveSupersessionTransitionId"],
      });
    }
  });

export const DurableAuditRecordSchema = z.union([
  DurableSnapshotRegistrationRecordSchema,
  DurableLifecycleTransitionRecordSchema,
  DurableReviewDecisionRecordSchema,
  DurableGovernedChangeSetRecordSchema,
  ActivationAuditRecordSchema,
]);

export const OrderedDurableAuditRecordsSchema = z
  .array(DurableAuditRecordSchema)
  .min(1)
  .superRefine((records, context) => {
    records.forEach((record, index) => {
      if (index === 0) return;

      const previous = records[index - 1]!;
      if (record.sequence !== previous.sequence + 1) {
        context.addIssue({
          code: "custom",
          message: "Durable audit records must be contiguous and ordered by sequence",
          path: [index, "sequence"],
        });
      }
      if (record.previousRecordFingerprint !== previous.recordFingerprint) {
        context.addIssue({
          code: "custom",
          message: "Durable audit records must preserve fingerprint-chain continuity",
          path: [index, "previousRecordFingerprint"],
        });
      }
    });
  });

export const RegistryTransactionTypeSchema = z.enum([
  "registration",
  "lifecycle",
  "change_set",
  "decision",
  "activation",
]);

function addEnvelopeIssue(
  context: z.RefinementCtx,
  message: string,
  path: (string | number)[],
): void {
  context.addIssue({ code: "custom", message, path });
}

function durableRecordIdentity(record: z.infer<typeof DurableAuditRecordSchema>): string {
  switch (record.recordType) {
    case "snapshot_registration":
      return record.registrationId;
    case "lifecycle_transition":
      return record.transitionId;
    case "review_decision":
      return record.decisionId;
    case "governed_change_set":
      return record.changeSetId;
    case "activation_audit":
      return record.activationId;
  }
}

export const CommittedRegistryTransactionEnvelopeSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.literal("committed"),
    transactionType: RegistryTransactionTypeSchema,
    transactionId: IdentifierSchema,
    firstSequence: DurableRecordSequenceSchema,
    lastSequence: DurableRecordSequenceSchema,
    previousRecordFingerprint: DurablePreviousRecordFingerprintSchema,
    lastRecordFingerprint: Sha256DigestSchema,
    recordCount: DurableRecordCountSchema,
    records: OrderedDurableAuditRecordsSchema,
    committedAt: IsoTemporalSchema,
    envelopeFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((envelope, context) => {
    if (envelope.recordCount !== envelope.records.length) {
      addEnvelopeIssue(context, "recordCount must equal the committed record count", [
        "recordCount",
      ]);
    }
    if (envelope.lastSequence !== envelope.firstSequence + envelope.records.length - 1) {
      addEnvelopeIssue(context, "Envelope sequence bounds must be contiguous", ["lastSequence"]);
    }
    if (
      (envelope.firstSequence === 1 && envelope.previousRecordFingerprint !== "genesis") ||
      (envelope.firstSequence > 1 && envelope.previousRecordFingerprint === "genesis")
    ) {
      addEnvelopeIssue(context, "Envelope predecessor must match its first audit sequence", [
        "previousRecordFingerprint",
      ]);
    }

    const identityIndexes = new Map<string, number>();
    envelope.records.forEach((record, index) => {
      if (record.transactionId !== envelope.transactionId) {
        addEnvelopeIssue(context, "Every committed record must bind the envelope transaction", [
          "records",
          index,
          "transactionId",
        ]);
      }
      if (record.sequence !== envelope.firstSequence + index) {
        addEnvelopeIssue(context, "Committed record sequences must be contiguous and ordered", [
          "records",
          index,
          "sequence",
        ]);
      }

      const expectedPrevious =
        index === 0
          ? envelope.previousRecordFingerprint
          : envelope.records[index - 1]!.recordFingerprint;
      if (record.previousRecordFingerprint !== expectedPrevious) {
        addEnvelopeIssue(
          context,
          "Committed records must preserve internal audit-chain continuity",
          ["records", index, "previousRecordFingerprint"],
        );
      }

      const identity = durableRecordIdentity(record);
      const previousIdentityIndex = identityIndexes.get(identity);
      if (previousIdentityIndex !== undefined) {
        addEnvelopeIssue(context, "Committed record identities must be unique within an envelope", [
          "records",
          index,
        ]);
        addEnvelopeIssue(context, "Committed record identity is duplicated later in the envelope", [
          "records",
          previousIdentityIndex,
        ]);
      } else {
        identityIndexes.set(identity, index);
      }
    });

    if (envelope.records.at(-1)?.recordFingerprint !== envelope.lastRecordFingerprint) {
      addEnvelopeIssue(context, "lastRecordFingerprint must identify the final committed record", [
        "lastRecordFingerprint",
      ]);
    }

    const allowedRecordTypes = {
      registration: new Set(["snapshot_registration"]),
      lifecycle: new Set(["lifecycle_transition"]),
      change_set: new Set(["governed_change_set"]),
      decision: new Set(["review_decision", "lifecycle_transition"]),
      activation: new Set(["lifecycle_transition", "activation_audit"]),
    } satisfies Record<z.infer<typeof RegistryTransactionTypeSchema>, ReadonlySet<string>>;
    envelope.records.forEach((record, index) => {
      if (!allowedRecordTypes[envelope.transactionType].has(record.recordType)) {
        addEnvelopeIssue(context, "Record type is not valid for the declared transaction type", [
          "records",
          index,
          "recordType",
        ]);
      }
    });

    if (
      envelope.transactionType === "lifecycle" &&
      envelope.records.some(
        (record) => !StandaloneDurableLifecycleTransitionRecordSchema.safeParse(record).success,
      )
    ) {
      addEnvelopeIssue(
        context,
        "Standalone lifecycle transactions cannot contain approval or activation-owned transitions",
        ["records"],
      );
    }

    if (
      envelope.transactionType === "decision" &&
      !DecisionTransactionRecordsSchema.safeParse(envelope.records).success
    ) {
      addEnvelopeIssue(
        context,
        "Decision transactions must be either one rejection or one bound approval transition",
        ["records"],
      );
    }

    if (envelope.transactionType !== "activation") return;

    const auditRecords = envelope.records.filter(
      (record) => record.recordType === "activation_audit",
    );
    if (auditRecords.length !== 1) {
      addEnvelopeIssue(context, "An activation transaction must contain exactly one audit record", [
        "records",
      ]);
      return;
    }
    const activation = auditRecords[0]!;
    if (envelope.records.at(-1) !== activation) {
      addEnvelopeIssue(context, "The activation audit record must be the final atomic effect", [
        "records",
      ]);
    }

    const expectsSupersession = activation.previousActiveSnapshotId !== null;
    if (
      expectsSupersession &&
      activation.candidateActivationTransitionId ===
        activation.previousActiveSupersessionTransitionId
    ) {
      addEnvelopeIssue(context, "Activation transition identities must be distinct", ["records"]);
    }
    if (envelope.records.length !== (expectsSupersession ? 3 : 2)) {
      addEnvelopeIssue(
        context,
        "Activation must contain the candidate transition, optional supersession, and audit record",
        ["records"],
      );
    }

    const candidateTransition = envelope.records[0];
    if (
      candidateTransition?.recordType !== "lifecycle_transition" ||
      candidateTransition.transitionId !== activation.candidateActivationTransitionId ||
      candidateTransition.snapshotId !== activation.candidateSnapshotId ||
      candidateTransition.from !== "approved" ||
      candidateTransition.to !== "active" ||
      candidateTransition.evidence.changeSetId !== activation.changeSetId ||
      candidateTransition.evidence.changeSetFingerprint !== activation.changeSetFingerprint ||
      candidateTransition.evidence.decisionId !== activation.approvalDecisionId ||
      candidateTransition.evidence.decisionFingerprint !== activation.approvalDecisionFingerprint ||
      candidateTransition.evidence.activationId !== activation.activationId ||
      candidateTransition.actorId !== activation.actorId ||
      candidateTransition.actorType !== activation.actorType ||
      candidateTransition.reason !== activation.reason ||
      candidateTransition.transitionedAt !== activation.activatedAt
    ) {
      addEnvelopeIssue(context, "Candidate activation transition must match the activation audit", [
        "records",
        0,
      ]);
    }

    if (expectsSupersession) {
      const supersession = envelope.records[1];
      if (
        supersession?.recordType !== "lifecycle_transition" ||
        supersession.transitionId !== activation.previousActiveSupersessionTransitionId ||
        supersession.snapshotId !== activation.previousActiveSnapshotId ||
        supersession.from !== "active" ||
        supersession.to !== "superseded" ||
        supersession.evidence.activationId !== activation.activationId ||
        supersession.actorId !== activation.actorId ||
        supersession.actorType !== activation.actorType ||
        supersession.reason !== activation.reason ||
        supersession.transitionedAt !== activation.activatedAt
      ) {
        addEnvelopeIssue(context, "Previous active supersession must match the activation audit", [
          "records",
          1,
        ]);
      }
    }
  });

const SnapshotActivationRequestFields = {
  schemaVersion: z.literal("1.0"),
  transactionId: IdentifierSchema,
  activationId: IdentifierSchema,
  candidateSnapshotId: IdentifierSchema,
  candidateSnapshotFingerprint: Sha256DigestSchema,
  baselineSnapshotId: IdentifierSchema.nullable(),
  baselineSnapshotFingerprint: Sha256DigestSchema.nullable(),
  expectedActiveSnapshotId: IdentifierSchema.nullable(),
  changeSetType: z.enum(["comparison", "bootstrap"]),
  changeSetId: IdentifierSchema,
  changeSetFingerprint: Sha256DigestSchema,
  approvalDecisionId: IdentifierSchema,
  approvalDecisionFingerprint: Sha256DigestSchema,
  ...DurableRecordActorFields,
  requestedAt: IsoTemporalSchema,
} as const;

const GovernedMutationActorFields = {
  actorId: IdentifierSchema,
  actorType: DurableActorTypeSchema,
  reason: NonEmptyStringSchema,
} as const;

export const RegisterGovernedSnapshotInputSchema = z
  .object({
    transactionId: IdentifierSchema,
    snapshot: KnowledgeRepositorySnapshotSchema,
    manifestEvidence: DurableSnapshotManifestEvidenceSchema,
    ...GovernedMutationActorFields,
    registeredAt: IsoTemporalSchema,
  })
  .strict()
  .superRefine((input, context) => {
    requireManifestEvidenceBindings(input.manifestEvidence, input.snapshot, context);
  });

export const RecordGovernedChangeSetInputSchema = z
  .object({
    transactionId: IdentifierSchema,
    evidence: DurableGovernedChangeSetEvidenceSchema,
    ...GovernedMutationActorFields,
    recordedAt: IsoTemporalSchema,
  })
  .strict();

export const GovernedLifecycleTransitionInputSchema = z
  .object({
    transactionId: IdentifierSchema,
    transitionId: IdentifierSchema,
    snapshotId: IdentifierSchema,
    ...GovernedMutationActorFields,
    transitionedAt: IsoTemporalSchema,
  })
  .strict();

export const BeginGovernedSnapshotReviewInputSchema = GovernedLifecycleTransitionInputSchema.extend(
  {
    changeSetId: IdentifierSchema,
    changeSetFingerprint: Sha256DigestSchema,
  },
).strict();

const GovernedSnapshotDecisionInputFields = {
  transactionId: IdentifierSchema,
  decisionId: IdentifierSchema,
  snapshotId: IdentifierSchema,
  snapshotFingerprint: Sha256DigestSchema,
  changeSetId: IdentifierSchema,
  changeSetFingerprint: Sha256DigestSchema,
  actorId: IdentifierSchema,
  actorType: z.literal("human"),
  reason: NonEmptyStringSchema,
  decidedAt: IsoTemporalSchema,
} as const;

export const ApproveGovernedSnapshotInputSchema = z
  .object({
    ...GovernedSnapshotDecisionInputFields,
    approvalTransitionId: IdentifierSchema,
  })
  .strict()
  .superRefine((input, context) => {
    requireSnapshotIdentity(
      input.snapshotId,
      input.snapshotFingerprint,
      context,
      "snapshotFingerprint",
    );
  });

export const RejectGovernedSnapshotInputSchema = z
  .object(GovernedSnapshotDecisionInputFields)
  .strict()
  .superRefine((input, context) => {
    requireSnapshotIdentity(
      input.snapshotId,
      input.snapshotFingerprint,
      context,
      "snapshotFingerprint",
    );
  });

export const SnapshotActivationRequestSchema = z
  .object(SnapshotActivationRequestFields)
  .strict()
  .superRefine((request, context) => {
    requireSnapshotIdentity(
      request.candidateSnapshotId,
      request.candidateSnapshotFingerprint,
      context,
      "candidateSnapshotId",
    );
    requireNullableFingerprintBinding(
      request.baselineSnapshotId,
      request.baselineSnapshotFingerprint,
      context,
      "baselineSnapshotId",
      "baselineSnapshotFingerprint",
    );
    if (request.baselineSnapshotId !== null && request.baselineSnapshotFingerprint !== null) {
      requireSnapshotIdentity(
        request.baselineSnapshotId,
        request.baselineSnapshotFingerprint,
        context,
        "baselineSnapshotId",
      );
    }
    if (request.expectedActiveSnapshotId !== request.baselineSnapshotId) {
      context.addIssue({
        code: "custom",
        message: "Expected active identity must match the governed change-set baseline",
        path: ["expectedActiveSnapshotId"],
      });
    }
    if (request.baselineSnapshotId === request.candidateSnapshotId) {
      context.addIssue({
        code: "custom",
        message: "Activation candidate must differ from its baseline",
        path: ["candidateSnapshotId"],
      });
    }

    const isBootstrap = request.changeSetType === "bootstrap";
    if (isBootstrap !== (request.baselineSnapshotId === null)) {
      context.addIssue({
        code: "custom",
        message: "Bootstrap activation requires an explicit no-baseline request",
        path: ["changeSetType"],
      });
    }
    const expectedChangeSetId = isBootstrap
      ? `change-bootstrap-to-${request.candidateSnapshotId}`
      : `change-${request.baselineSnapshotId}-to-${request.candidateSnapshotId}`;
    if (request.changeSetId !== expectedChangeSetId) {
      context.addIssue({
        code: "custom",
        message: "Activation request change set must bind the baseline and candidate identities",
        path: ["changeSetId"],
      });
    }
  });

export const SnapshotActivationCommittedResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.enum(["committed", "replayed"]),
    transactionId: IdentifierSchema,
    activationId: IdentifierSchema,
    candidateSnapshotId: IdentifierSchema,
    previousActiveSnapshotId: IdentifierSchema.nullable(),
    activeSnapshotId: IdentifierSchema,
    firstSequence: DurableRecordSequenceSchema,
    lastSequence: DurableRecordSequenceSchema,
    activationRecordFingerprint: Sha256DigestSchema,
    transactionEnvelopeFingerprint: Sha256DigestSchema,
    committedAt: IsoTemporalSchema,
  })
  .strict()
  .superRefine((result, context) => {
    if (result.activeSnapshotId !== result.candidateSnapshotId) {
      context.addIssue({
        code: "custom",
        message: "Committed activation result must expose the candidate as active",
        path: ["activeSnapshotId"],
      });
    }
    if (result.previousActiveSnapshotId === result.candidateSnapshotId) {
      context.addIssue({
        code: "custom",
        message: "Previous and resulting active snapshot identities must differ",
        path: ["previousActiveSnapshotId"],
      });
    }
    if (result.lastSequence < result.firstSequence) {
      context.addIssue({
        code: "custom",
        message: "Activation result sequence bounds must be ordered",
        path: ["lastSequence"],
      });
    }
    const expectedRecordCount = result.previousActiveSnapshotId === null ? 2 : 3;
    if (result.lastSequence - result.firstSequence + 1 !== expectedRecordCount) {
      context.addIssue({
        code: "custom",
        message: "Activation result must cover every atomic activation effect",
        path: ["lastSequence"],
      });
    }
  });

export const SnapshotActivationRejectedResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.literal("rejected"),
    transactionId: IdentifierSchema,
    candidateSnapshotId: IdentifierSchema,
    currentActiveSnapshotId: IdentifierSchema.nullable(),
    failureCode: IdentifierSchema,
    message: NonEmptyStringSchema,
    rejectedAt: IsoTemporalSchema,
  })
  .strict();

export const SnapshotActivationResultSchema = z.discriminatedUnion("status", [
  SnapshotActivationCommittedResultSchema,
  SnapshotActivationRejectedResultSchema,
]);

export const RegistryIntegrityIssueSchema = z
  .object({
    code: IdentifierSchema,
    message: NonEmptyStringSchema,
    transactionId: IdentifierSchema.nullable(),
    recordId: IdentifierSchema.nullable(),
    sequence: DurableRecordSequenceSchema.nullable(),
  })
  .strict();

export const RegistryDerivedIndexStatusSchema = z.enum([
  "not_checked",
  "current",
  "missing",
  "stale",
  "invalid",
]);

const RegistryDerivedIndexObservationFields = {
  derivedIndexStatus: RegistryDerivedIndexStatusSchema.default("not_checked"),
  derivedIndexIssues: z.array(RegistryIntegrityIssueSchema).default([]),
} as const;

function requireDerivedIndexObservation(
  result: {
    derivedIndexStatus: z.infer<typeof RegistryDerivedIndexStatusSchema>;
    derivedIndexIssues: readonly z.infer<typeof RegistryIntegrityIssueSchema>[];
  },
  context: z.RefinementCtx,
): void {
  const requiresIssues =
    result.derivedIndexStatus === "stale" || result.derivedIndexStatus === "invalid";
  if (requiresIssues !== result.derivedIndexIssues.length > 0) {
    context.addIssue({
      code: "custom",
      message: requiresIssues
        ? `${result.derivedIndexStatus} derived-index observations require actionable issues`
        : `${result.derivedIndexStatus} derived-index observations cannot contain issues`,
      path: ["derivedIndexIssues"],
    });
  }
}

function requireEmptyHistoryCoordinates(
  recordCount: number,
  throughSequence: number,
  lastRecordFingerprint: string,
  context: z.RefinementCtx,
): void {
  if (recordCount !== throughSequence) {
    context.addIssue({
      code: "custom",
      message: "A contiguous audit history has one durable sequence per record",
      path: ["verifiedThroughSequence"],
    });
  }
  if (
    (recordCount === 0 && lastRecordFingerprint !== "genesis") ||
    (recordCount > 0 && lastRecordFingerprint === "genesis")
  ) {
    context.addIssue({
      code: "custom",
      message: "Last-record evidence must represent either empty genesis or committed history",
      path: ["lastRecordFingerprint"],
    });
  }
}

const RegistryIntegritySummaryFields = {
  schemaVersion: z.literal("1.0"),
  verifiedTransactionCount: DurableRecordCountSchema,
  verifiedRecordCount: DurableRecordCountSchema,
  verifiedThroughSequence: DurableRecordCountSchema,
  lastRecordFingerprint: DurablePreviousRecordFingerprintSchema,
  ...RegistryDerivedIndexObservationFields,
} as const;

export const RegistryIntegrityValidResultSchema = z
  .object({
    ...RegistryIntegritySummaryFields,
    status: z.literal("valid"),
    integrityFingerprint: Sha256DigestSchema,
    issues: z.array(RegistryIntegrityIssueSchema).max(0),
  })
  .strict()
  .superRefine((result, context) => {
    requireEmptyHistoryCoordinates(
      result.verifiedRecordCount,
      result.verifiedThroughSequence,
      result.lastRecordFingerprint,
      context,
    );
    if (
      result.verifiedTransactionCount > result.verifiedRecordCount ||
      (result.verifiedRecordCount === 0) !== (result.verifiedTransactionCount === 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Verified transaction and record counts are inconsistent",
        path: ["verifiedTransactionCount"],
      });
    }
    requireDerivedIndexObservation(result, context);
  });

export const RegistryIntegrityInvalidResultSchema = z
  .object({
    ...RegistryIntegritySummaryFields,
    status: z.literal("invalid"),
    integrityFingerprint: z.null(),
    issues: z.array(RegistryIntegrityIssueSchema).min(1),
  })
  .strict()
  .superRefine((result, context) => {
    requireEmptyHistoryCoordinates(
      result.verifiedRecordCount,
      result.verifiedThroughSequence,
      result.lastRecordFingerprint,
      context,
    );
    if (result.verifiedTransactionCount > result.verifiedRecordCount) {
      context.addIssue({
        code: "custom",
        message: "Verified transaction count cannot exceed verified record count",
        path: ["verifiedTransactionCount"],
      });
    }
    requireDerivedIndexObservation(result, context);
  });

export const RegistryIntegrityResultSchema = z.discriminatedUnion("status", [
  RegistryIntegrityValidResultSchema,
  RegistryIntegrityInvalidResultSchema,
]);

const RegistryRecoverySummaryFields = {
  schemaVersion: z.literal("1.0"),
  activeSnapshotId: IdentifierSchema.nullable(),
  registeredSnapshotCount: DurableRecordCountSchema,
  lifecycleTransitionCount: DurableRecordCountSchema,
  decisionCount: DurableRecordCountSchema,
  activationCount: DurableRecordCountSchema,
  committedTransactionCount: DurableRecordCountSchema,
  committedRecordCount: DurableRecordCountSchema,
  lastCommittedAuditSequence: DurableRecordCountSchema,
  lastRecordFingerprint: DurablePreviousRecordFingerprintSchema,
  ...RegistryDerivedIndexObservationFields,
} as const;

function requireRecoveryCoordinates(
  result: {
    committedTransactionCount: number;
    committedRecordCount: number;
    lastCommittedAuditSequence: number;
    lastRecordFingerprint: string;
    registeredSnapshotCount: number;
    lifecycleTransitionCount: number;
    decisionCount: number;
    activationCount: number;
    derivedIndexStatus: z.infer<typeof RegistryDerivedIndexStatusSchema>;
    derivedIndexIssues: readonly z.infer<typeof RegistryIntegrityIssueSchema>[];
  },
  context: z.RefinementCtx,
): void {
  requireEmptyHistoryCoordinates(
    result.committedRecordCount,
    result.lastCommittedAuditSequence,
    result.lastRecordFingerprint,
    context,
  );
  if (
    result.committedTransactionCount > result.committedRecordCount ||
    (result.committedRecordCount === 0) !== (result.committedTransactionCount === 0)
  ) {
    context.addIssue({
      code: "custom",
      message: "Committed transaction and record counts are inconsistent",
      path: ["committedTransactionCount"],
    });
  }
  if (
    result.registeredSnapshotCount +
      result.lifecycleTransitionCount +
      result.decisionCount +
      result.activationCount >
    result.committedRecordCount
  ) {
    context.addIssue({
      code: "custom",
      message: "Recovered evidence counts cannot exceed committed durable records",
      path: ["committedRecordCount"],
    });
  }
  requireDerivedIndexObservation(result, context);
}

function requireFailedRecoveryCoordinates(
  result: {
    registeredSnapshotCount: number;
    lifecycleTransitionCount: number;
    decisionCount: number;
    activationCount: number;
    committedTransactionCount: number;
    committedRecordCount: number;
    lastCommittedAuditSequence: number;
    lastRecordFingerprint: string;
    derivedIndexStatus: z.infer<typeof RegistryDerivedIndexStatusSchema>;
    derivedIndexIssues: readonly z.infer<typeof RegistryIntegrityIssueSchema>[];
  },
  context: z.RefinementCtx,
): void {
  if (
    result.committedTransactionCount > result.committedRecordCount ||
    result.registeredSnapshotCount +
      result.lifecycleTransitionCount +
      result.decisionCount +
      result.activationCount >
      result.committedRecordCount ||
    result.committedRecordCount > result.lastCommittedAuditSequence
  ) {
    context.addIssue({
      code: "custom",
      message: "Failed recovery counts cannot exceed the committed history observed",
      path: ["committedRecordCount"],
    });
  }
  if (
    (result.lastCommittedAuditSequence === 0 && result.lastRecordFingerprint !== "genesis") ||
    (result.lastCommittedAuditSequence > 0 && result.lastRecordFingerprint === "genesis")
  ) {
    context.addIssue({
      code: "custom",
      message: "Failed recovery must report coherent last-record evidence",
      path: ["lastRecordFingerprint"],
    });
  }
  requireDerivedIndexObservation(result, context);
}

export const RegistryRecoverySuccessSchema = z
  .object({
    ...RegistryRecoverySummaryFields,
    status: z.literal("recovered"),
    integrityFingerprint: Sha256DigestSchema,
    errors: z.array(RegistryIntegrityIssueSchema).max(0),
  })
  .strict()
  .superRefine((result, context) => {
    requireRecoveryCoordinates(result, context);
    if (result.registeredSnapshotCount > result.committedRecordCount) {
      context.addIssue({
        code: "custom",
        message: "Registered snapshot count cannot exceed committed record count",
        path: ["registeredSnapshotCount"],
      });
    }
    if (result.activeSnapshotId !== null && result.registeredSnapshotCount === 0) {
      context.addIssue({
        code: "custom",
        message: "Recovered active state must refer to a registered snapshot",
        path: ["activeSnapshotId"],
      });
    }
  });

export const RegistryRecoveryFailureSchema = z
  .object({
    ...RegistryRecoverySummaryFields,
    status: z.literal("failed"),
    activeSnapshotId: z.null(),
    integrityFingerprint: z.null(),
    errors: z.array(RegistryIntegrityIssueSchema).min(1),
  })
  .strict()
  .superRefine(requireFailedRecoveryCoordinates);

export const RegistryRecoveryResultSchema = z.discriminatedUnion("status", [
  RegistryRecoverySuccessSchema,
  RegistryRecoveryFailureSchema,
]);

export const DerivedRegistryIndexSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    activeSnapshotId: IdentifierSchema.nullable(),
    indexedThroughSequence: DurableRecordCountSchema,
    authoritativeIntegrityFingerprint: Sha256DigestSchema,
    indexFingerprint: Sha256DigestSchema,
  })
  .strict();

export const DerivedRegistryIndexStatusSchema = z.enum([
  "current",
  "rebuilt",
  "missing",
  "stale",
  "invalid",
]);

export const DerivedRegistryIndexResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: DerivedRegistryIndexStatusSchema,
    index: DerivedRegistryIndexSchema.nullable(),
    authoritativeThroughSequence: DurableRecordCountSchema,
    authoritativeIntegrityFingerprint: Sha256DigestSchema,
    issues: z.array(RegistryIntegrityIssueSchema),
  })
  .strict()
  .superRefine((result, context) => {
    if (result.status === "current" || result.status === "rebuilt") {
      if (result.index === null) {
        context.addIssue({
          code: "custom",
          message: `${result.status} derived-index results require an index`,
          path: ["index"],
        });
      } else {
        if (result.index.indexedThroughSequence !== result.authoritativeThroughSequence) {
          context.addIssue({
            code: "custom",
            message: "Current derived index must cover complete authoritative history",
            path: ["index", "indexedThroughSequence"],
          });
        }
        if (
          result.index.authoritativeIntegrityFingerprint !==
          result.authoritativeIntegrityFingerprint
        ) {
          context.addIssue({
            code: "custom",
            message: "Derived index must bind the authoritative integrity fingerprint",
            path: ["index", "authoritativeIntegrityFingerprint"],
          });
        }
      }
      if (result.issues.length > 0) {
        context.addIssue({
          code: "custom",
          message: `${result.status} derived-index results cannot contain issues`,
          path: ["issues"],
        });
      }
      return;
    }

    if (result.status === "missing") {
      if (result.index !== null) {
        context.addIssue({
          code: "custom",
          message: "A missing derived index cannot contain index data",
          path: ["index"],
        });
      }
      if (result.issues.length > 0) {
        context.addIssue({
          code: "custom",
          message: "A missing rebuildable index is not authoritative corruption",
          path: ["issues"],
        });
      }
      return;
    }

    if (result.issues.length === 0) {
      context.addIssue({
        code: "custom",
        message: `${result.status} derived-index results require actionable issues`,
        path: ["issues"],
      });
    }
  });

export type DurableActorType = z.infer<typeof DurableActorTypeSchema>;
export type DurablePreviousRecordFingerprint = z.infer<
  typeof DurablePreviousRecordFingerprintSchema
>;
export type DurableSnapshotRegistrationProvenance = z.infer<
  typeof DurableSnapshotRegistrationProvenanceSchema
>;
export type DurableKnowledgeMigrationManifest = z.infer<
  typeof DurableKnowledgeMigrationManifestSchema
>;
export type DurableSnapshotManifestEvidence = z.infer<typeof DurableSnapshotManifestEvidenceSchema>;
export type DurableSnapshotRegistrationRecord = z.infer<
  typeof DurableSnapshotRegistrationRecordSchema
>;
export type DurableLifecycleEvidenceBinding = z.infer<typeof DurableLifecycleEvidenceBindingSchema>;
export type NonActivationDurableLifecycleTransitionRecord = z.infer<
  typeof NonActivationDurableLifecycleTransitionRecordSchema
>;
export type StandaloneDurableLifecycleTransitionRecord = z.infer<
  typeof StandaloneDurableLifecycleTransitionRecordSchema
>;
export type ActivationOwnedDurableLifecycleTransitionRecord = z.infer<
  typeof ActivationOwnedDurableLifecycleTransitionRecordSchema
>;
export type DurableLifecycleTransitionRecord = z.infer<
  typeof DurableLifecycleTransitionRecordSchema
>;
export type DurableApprovalDecisionRecord = z.infer<typeof DurableApprovalDecisionRecordSchema>;
export type DurableRejectionDecisionRecord = z.infer<typeof DurableRejectionDecisionRecordSchema>;
export type DurableReviewDecisionRecord = z.infer<typeof DurableReviewDecisionRecordSchema>;
export type ApprovalDecisionTransactionRecords = z.infer<
  typeof ApprovalDecisionTransactionRecordsSchema
>;
export type RejectionDecisionTransactionRecords = z.infer<
  typeof RejectionDecisionTransactionRecordsSchema
>;
export type DecisionTransactionRecords = z.infer<typeof DecisionTransactionRecordsSchema>;
export type BootstrapGovernedChangeSet = z.infer<typeof BootstrapGovernedChangeSetSchema>;
export type DurableGovernedChangeSetEvidence = z.infer<
  typeof DurableGovernedChangeSetEvidenceSchema
>;
export type DurableGovernedChangeSetRecord = z.infer<typeof DurableGovernedChangeSetRecordSchema>;
export type ActivationAuditRecord = z.infer<typeof ActivationAuditRecordSchema>;
export type DurableAuditRecord = z.infer<typeof DurableAuditRecordSchema>;
export type OrderedDurableAuditRecords = z.infer<typeof OrderedDurableAuditRecordsSchema>;
export type RegistryTransactionType = z.infer<typeof RegistryTransactionTypeSchema>;
export type CommittedRegistryTransactionEnvelope = z.infer<
  typeof CommittedRegistryTransactionEnvelopeSchema
>;
export type SnapshotActivationRequest = z.infer<typeof SnapshotActivationRequestSchema>;
export type RegisterGovernedSnapshotInput = z.infer<typeof RegisterGovernedSnapshotInputSchema>;
export type RecordGovernedChangeSetInput = z.infer<typeof RecordGovernedChangeSetInputSchema>;
export type GovernedLifecycleTransitionInput = z.infer<
  typeof GovernedLifecycleTransitionInputSchema
>;
export type BeginGovernedSnapshotReviewInput = z.infer<
  typeof BeginGovernedSnapshotReviewInputSchema
>;
export type ApproveGovernedSnapshotInput = z.infer<typeof ApproveGovernedSnapshotInputSchema>;
export type RejectGovernedSnapshotInput = z.infer<typeof RejectGovernedSnapshotInputSchema>;
export type SnapshotActivationCommittedResult = z.infer<
  typeof SnapshotActivationCommittedResultSchema
>;
export type SnapshotActivationRejectedResult = z.infer<
  typeof SnapshotActivationRejectedResultSchema
>;
export type SnapshotActivationResult = z.infer<typeof SnapshotActivationResultSchema>;
export type RegistryIntegrityIssue = z.infer<typeof RegistryIntegrityIssueSchema>;
export type RegistryDerivedIndexStatus = z.infer<typeof RegistryDerivedIndexStatusSchema>;
export type RegistryIntegrityResult = z.infer<typeof RegistryIntegrityResultSchema>;
export type RegistryRecoveryResult = z.infer<typeof RegistryRecoveryResultSchema>;
export type DerivedRegistryIndex = z.infer<typeof DerivedRegistryIndexSchema>;
export type DerivedRegistryIndexStatus = z.infer<typeof DerivedRegistryIndexStatusSchema>;
export type DerivedRegistryIndexResult = z.infer<typeof DerivedRegistryIndexResultSchema>;

export interface DurableSnapshotRegistry {
  activate(request: SnapshotActivationRequest): Promise<SnapshotActivationResult>;
  getActivationHistory(): Promise<readonly ActivationAuditRecord[]>;
  getCurrentActiveSnapshot(): Promise<DurableSnapshotRegistrationRecord | null>;
  getGovernedChangeSet(changeSetId: string): Promise<DurableGovernedChangeSetRecord | null>;
  getLifecycleHistory(snapshotId: string): Promise<readonly DurableLifecycleTransitionRecord[]>;
  getReviewDecisionHistory(snapshotId: string): Promise<readonly DurableReviewDecisionRecord[]>;
  getSnapshot(snapshotId: string): Promise<DurableSnapshotRegistrationRecord | null>;
  inspectDerivedIndex(): Promise<DerivedRegistryIndexResult>;
  listSnapshots(): Promise<readonly DurableSnapshotRegistrationRecord[]>;
  rebuildDerivedIndex(): Promise<DerivedRegistryIndexResult>;
  recover(): Promise<RegistryRecoveryResult>;
  verifyIntegrity(): Promise<RegistryIntegrityResult>;
}
