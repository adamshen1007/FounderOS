import { z } from "zod";

import {
  KnowledgeRepositorySnapshotObjectSchema,
  KnowledgeRepositorySnapshotSchema,
} from "./corpus.js";
import { IdentifierSchema, IsoTemporalSchema, NonEmptyStringSchema } from "./primitives.js";

const SNAPSHOT_LIFECYCLE_STATES = [
  "created",
  "validated",
  "reviewing",
  "approved",
  "active",
  "superseded",
  "archived",
] as const;

export const SnapshotLifecycleStatusSchema = z.enum(SNAPSHOT_LIFECYCLE_STATES);
export const SnapshotReviewStatusSchema = z.enum(["pending", "reviewing", "approved", "rejected"]);
export const SnapshotObjectChangeTypeSchema = z.enum([
  "content",
  "metadata",
  "object_type",
  "provenance",
]);

const ALLOWED_LIFECYCLE_STATUSES_BY_REVIEW_STATUS: Record<
  z.infer<typeof SnapshotReviewStatusSchema>,
  readonly z.infer<typeof SnapshotLifecycleStatusSchema>[]
> = {
  pending: ["created", "validated"],
  reviewing: ["reviewing"],
  approved: ["approved", "active"],
  rejected: ["reviewing"],
};

function isSortedUnique(values: readonly string[]): boolean {
  return (
    new Set(values).size === values.length &&
    values.every((value, index) => index === 0 || values[index - 1]! < value)
  );
}

function requireSortedUnique(
  values: readonly string[],
  context: z.RefinementCtx,
  path: string,
): void {
  if (!isSortedUnique(values)) {
    context.addIssue({
      code: "custom",
      message: `${path} must be unique and sorted`,
      path: [path],
    });
  }
}

function snapshotObjectChangeTypes(
  previous: z.infer<typeof KnowledgeRepositorySnapshotObjectSchema>,
  current: z.infer<typeof KnowledgeRepositorySnapshotObjectSchema>,
): string[] {
  const changeTypes: string[] = [];

  if (previous.contentFingerprint !== current.contentFingerprint) changeTypes.push("content");
  if (previous.metadataFingerprint !== current.metadataFingerprint) changeTypes.push("metadata");
  if (previous.sourceHash !== current.sourceHash || previous.sourcePath !== current.sourcePath) {
    changeTypes.push("provenance");
  }
  if (previous.objectType !== current.objectType) changeTypes.push("object_type");

  return changeTypes.sort();
}

function snapshotObjectsEqual(
  left: z.infer<typeof KnowledgeRepositorySnapshotObjectSchema>,
  right: z.infer<typeof KnowledgeRepositorySnapshotObjectSchema>,
): boolean {
  return (
    left.objectId === right.objectId &&
    left.objectType === right.objectType &&
    left.sourcePath === right.sourcePath &&
    left.sourceHash === right.sourceHash &&
    left.contentFingerprint === right.contentFingerprint &&
    left.metadataFingerprint === right.metadataFingerprint &&
    left.objectFingerprint === right.objectFingerprint
  );
}

function snapshotObjectCollectionsEqual(
  left: readonly z.infer<typeof KnowledgeRepositorySnapshotObjectSchema>[],
  right: readonly z.infer<typeof KnowledgeRepositorySnapshotObjectSchema>[],
): boolean {
  return (
    left.length === right.length &&
    left.every((object, index) => {
      const comparison = right[index];
      return comparison !== undefined && snapshotObjectsEqual(object, comparison);
    })
  );
}

export const KnowledgeSnapshotLifecycleTransitionSchema = z
  .object({
    from: SnapshotLifecycleStatusSchema,
    to: SnapshotLifecycleStatusSchema,
    actorId: IdentifierSchema,
    transitionedAt: IsoTemporalSchema,
  })
  .strict();

export const KnowledgeSnapshotLifecycleRecordSchema = z
  .object({
    snapshotId: IdentifierSchema,
    status: SnapshotLifecycleStatusSchema,
    transitions: z.array(KnowledgeSnapshotLifecycleTransitionSchema),
  })
  .strict()
  .superRefine((record, context) => {
    const statusIndex = SNAPSHOT_LIFECYCLE_STATES.indexOf(record.status);

    if (record.transitions.length !== statusIndex) {
      context.addIssue({
        code: "custom",
        message:
          "Transition history must contain every direct lifecycle transition to the current status",
        path: ["transitions"],
      });
    }

    record.transitions.forEach((transition, index) => {
      const expectedFrom = SNAPSHOT_LIFECYCLE_STATES[index];
      const expectedTo = SNAPSHOT_LIFECYCLE_STATES[index + 1];
      if (transition.from !== expectedFrom || transition.to !== expectedTo) {
        context.addIssue({
          code: "custom",
          message: "Transitions must follow the deterministic lifecycle in order",
          path: ["transitions", index],
        });
      }
      const previousTransition = record.transitions[index - 1];
      if (
        previousTransition &&
        Date.parse(previousTransition.transitionedAt) >= Date.parse(transition.transitionedAt)
      ) {
        context.addIssue({
          code: "custom",
          message: "Transition history must be ordered by increasing temporal evidence",
          path: ["transitions", index, "transitionedAt"],
        });
      }
    });

    const finalState = record.transitions.at(-1)?.to ?? "created";
    if (finalState !== record.status) {
      context.addIssue({
        code: "custom",
        message: "The final transition state must equal the lifecycle record status",
        path: ["status"],
      });
    }
  });

export const KnowledgeSnapshotComparisonRequestSchema = z
  .object({
    currentSnapshot: KnowledgeRepositorySnapshotSchema,
    proposedSnapshot: KnowledgeRepositorySnapshotSchema,
  })
  .strict()
  .superRefine((request, context) => {
    if (request.currentSnapshot.corpusId !== request.proposedSnapshot.corpusId) {
      context.addIssue({
        code: "custom",
        message: "Snapshot comparison requires snapshots from the same corpus",
        path: ["proposedSnapshot", "corpusId"],
      });
    }
    if (request.currentSnapshot.snapshotId === request.proposedSnapshot.snapshotId) {
      context.addIssue({
        code: "custom",
        message: "Snapshot comparison requires distinct snapshot identities",
        path: ["proposedSnapshot", "snapshotId"],
      });
    }
  });

export const KnowledgeModifiedSnapshotObjectSchema = z
  .object({
    objectId: IdentifierSchema,
    previous: KnowledgeRepositorySnapshotObjectSchema,
    current: KnowledgeRepositorySnapshotObjectSchema,
    changeTypes: z.array(SnapshotObjectChangeTypeSchema).min(1),
  })
  .strict()
  .superRefine((modified, context) => {
    if (modified.previous.objectId !== modified.objectId) {
      context.addIssue({
        code: "custom",
        message: "Modified object previous record must retain the modified object identity",
        path: ["previous", "objectId"],
      });
    }
    if (modified.current.objectId !== modified.objectId) {
      context.addIssue({
        code: "custom",
        message: "Modified object current record must retain the modified object identity",
        path: ["current", "objectId"],
      });
    }
    requireSortedUnique(modified.changeTypes, context, "changeTypes");

    const expectedChangeTypes = snapshotObjectChangeTypes(modified.previous, modified.current);
    if (
      expectedChangeTypes.length === 0 ||
      expectedChangeTypes.length !== modified.changeTypes.length ||
      expectedChangeTypes.some((changeType, index) => changeType !== modified.changeTypes[index])
    ) {
      context.addIssue({
        code: "custom",
        message: "Modified object changeTypes must exactly classify represented changes",
        path: ["changeTypes"],
      });
    }
  });

export const KnowledgeGovernedChangeSetSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    changeId: IdentifierSchema,
    sourceSnapshotId: IdentifierSchema,
    targetSnapshotId: IdentifierSchema,
    sourceCorpusVersion: NonEmptyStringSchema,
    targetCorpusVersion: NonEmptyStringSchema,
    corpusVersionChanged: z.boolean(),
    addedObjects: z.array(KnowledgeRepositorySnapshotObjectSchema),
    removedObjects: z.array(KnowledgeRepositorySnapshotObjectSchema),
    modifiedObjects: z.array(KnowledgeModifiedSnapshotObjectSchema),
    reviewStatus: SnapshotReviewStatusSchema,
    changed: z.boolean(),
  })
  .strict()
  .superRefine((changeSet, context) => {
    if (changeSet.sourceSnapshotId === changeSet.targetSnapshotId) {
      context.addIssue({
        code: "custom",
        message: "Governed change sets require distinct source and target snapshot identities",
        path: ["targetSnapshotId"],
      });
    }
    if (
      changeSet.changeId !== `change-${changeSet.sourceSnapshotId}-to-${changeSet.targetSnapshotId}`
    ) {
      context.addIssue({
        code: "custom",
        message:
          "changeId must be deterministically derived from source and target snapshot identities",
        path: ["changeId"],
      });
    }
    if (
      changeSet.corpusVersionChanged !==
      (changeSet.sourceCorpusVersion !== changeSet.targetCorpusVersion)
    ) {
      context.addIssue({
        code: "custom",
        message: "corpusVersionChanged must match the compared corpus versions",
        path: ["corpusVersionChanged"],
      });
    }

    requireSortedUnique(
      changeSet.addedObjects.map((object) => object.objectId),
      context,
      "addedObjects",
    );
    requireSortedUnique(
      changeSet.removedObjects.map((object) => object.objectId),
      context,
      "removedObjects",
    );
    requireSortedUnique(
      changeSet.modifiedObjects.map((object) => object.objectId),
      context,
      "modifiedObjects",
    );

    const objectIds = [
      ...changeSet.addedObjects.map((object) => object.objectId),
      ...changeSet.removedObjects.map((object) => object.objectId),
      ...changeSet.modifiedObjects.map((object) => object.objectId),
    ];
    if (new Set(objectIds).size !== objectIds.length) {
      context.addIssue({
        code: "custom",
        message: "An object may appear in only one governed change category",
        path: ["addedObjects"],
      });
    }

    const detected =
      changeSet.corpusVersionChanged ||
      changeSet.addedObjects.length > 0 ||
      changeSet.removedObjects.length > 0 ||
      changeSet.modifiedObjects.length > 0;
    if (changeSet.changed !== detected) {
      context.addIssue({
        code: "custom",
        message: "changed must reflect version, added, removed, or modified object changes",
        path: ["changed"],
      });
    }
  });

export const KnowledgeSnapshotApprovalWorkflowSchema = z
  .object({
    activeSnapshot: KnowledgeRepositorySnapshotSchema,
    proposedSnapshot: KnowledgeRepositorySnapshotSchema,
    changeSet: KnowledgeGovernedChangeSetSchema,
    proposedSnapshotLifecycle: KnowledgeSnapshotLifecycleRecordSchema,
    reviewStatus: SnapshotReviewStatusSchema,
  })
  .strict()
  .superRefine((workflow, context) => {
    if (workflow.activeSnapshot.corpusId !== workflow.proposedSnapshot.corpusId) {
      context.addIssue({
        code: "custom",
        message: "Workflow snapshots must belong to the same corpus",
        path: ["proposedSnapshot", "corpusId"],
      });
    }
    if (workflow.activeSnapshot.snapshotId !== workflow.changeSet.sourceSnapshotId) {
      context.addIssue({
        code: "custom",
        message: "The active snapshot must match the change set source snapshot",
        path: ["changeSet", "sourceSnapshotId"],
      });
    }
    if (workflow.proposedSnapshot.snapshotId !== workflow.changeSet.targetSnapshotId) {
      context.addIssue({
        code: "custom",
        message: "The proposed snapshot must match the change set target snapshot",
        path: ["changeSet", "targetSnapshotId"],
      });
    }
    if (workflow.activeSnapshot.corpusVersion !== workflow.changeSet.sourceCorpusVersion) {
      context.addIssue({
        code: "custom",
        message: "The active snapshot corpus version must match the change set source version",
        path: ["changeSet", "sourceCorpusVersion"],
      });
    }
    if (workflow.proposedSnapshot.corpusVersion !== workflow.changeSet.targetCorpusVersion) {
      context.addIssue({
        code: "custom",
        message: "The proposed snapshot corpus version must match the change set target version",
        path: ["changeSet", "targetCorpusVersion"],
      });
    }
    if (workflow.proposedSnapshot.snapshotId !== workflow.proposedSnapshotLifecycle.snapshotId) {
      context.addIssue({
        code: "custom",
        message: "The proposed snapshot lifecycle record must identify the proposed snapshot",
        path: ["proposedSnapshotLifecycle", "snapshotId"],
      });
    }
    if (workflow.reviewStatus !== workflow.changeSet.reviewStatus) {
      context.addIssue({
        code: "custom",
        message: "Workflow review status must match the governed change set review status",
        path: ["reviewStatus"],
      });
    }

    if (
      !ALLOWED_LIFECYCLE_STATUSES_BY_REVIEW_STATUS[workflow.reviewStatus].includes(
        workflow.proposedSnapshotLifecycle.status,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Review status must align with its allowed proposed snapshot lifecycle states",
        path: ["proposedSnapshotLifecycle", "status"],
      });
    }

    const activeObjectsById = new Map(
      workflow.activeSnapshot.objects.map((object) => [object.objectId, object]),
    );
    const proposedObjectsById = new Map(
      workflow.proposedSnapshot.objects.map((object) => [object.objectId, object]),
    );
    const expectedAddedObjects = workflow.proposedSnapshot.objects.filter(
      (object) => !activeObjectsById.has(object.objectId),
    );
    const expectedRemovedObjects = workflow.activeSnapshot.objects.filter(
      (object) => !proposedObjectsById.has(object.objectId),
    );
    const expectedModifiedObjects = workflow.activeSnapshot.objects
      .filter((previous) => {
        const current = proposedObjectsById.get(previous.objectId);
        return current !== undefined && !snapshotObjectsEqual(previous, current);
      })
      .map((previous) => ({
        objectId: previous.objectId,
        previous,
        current: proposedObjectsById.get(previous.objectId)!,
      }));

    if (!snapshotObjectCollectionsEqual(workflow.changeSet.addedObjects, expectedAddedObjects)) {
      context.addIssue({
        code: "custom",
        message: "Added object evidence must exactly match proposed-only snapshot records",
        path: ["changeSet", "addedObjects"],
      });
    }
    if (
      !snapshotObjectCollectionsEqual(workflow.changeSet.removedObjects, expectedRemovedObjects)
    ) {
      context.addIssue({
        code: "custom",
        message: "Removed object evidence must exactly match active-only snapshot records",
        path: ["changeSet", "removedObjects"],
      });
    }
    if (
      workflow.changeSet.modifiedObjects.length !== expectedModifiedObjects.length ||
      workflow.changeSet.modifiedObjects.some((modified, index) => {
        const expected = expectedModifiedObjects[index];
        return (
          expected === undefined ||
          modified.objectId !== expected.objectId ||
          !snapshotObjectsEqual(modified.previous, expected.previous) ||
          !snapshotObjectsEqual(modified.current, expected.current)
        );
      })
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Modified object evidence must exactly match changed active and proposed snapshot records",
        path: ["changeSet", "modifiedObjects"],
      });
    }
  });

export type SnapshotLifecycleStatus = z.infer<typeof SnapshotLifecycleStatusSchema>;
export type SnapshotReviewStatus = z.infer<typeof SnapshotReviewStatusSchema>;
export type SnapshotObjectChangeType = z.infer<typeof SnapshotObjectChangeTypeSchema>;
export type KnowledgeSnapshotLifecycleTransition = z.infer<
  typeof KnowledgeSnapshotLifecycleTransitionSchema
>;
export type KnowledgeSnapshotLifecycleRecord = z.infer<
  typeof KnowledgeSnapshotLifecycleRecordSchema
>;
export type KnowledgeSnapshotComparisonRequest = z.infer<
  typeof KnowledgeSnapshotComparisonRequestSchema
>;
export type KnowledgeModifiedSnapshotObject = z.infer<typeof KnowledgeModifiedSnapshotObjectSchema>;
export type KnowledgeGovernedChangeSet = z.infer<typeof KnowledgeGovernedChangeSetSchema>;
export type KnowledgeSnapshotApprovalWorkflow = z.infer<
  typeof KnowledgeSnapshotApprovalWorkflowSchema
>;

export const KnowledgeSnapshotLifecycleStatusSchema = SnapshotLifecycleStatusSchema;
export const KnowledgeSnapshotReviewStatusSchema = SnapshotReviewStatusSchema;
export const KnowledgeSnapshotObjectChangeTypeSchema = SnapshotObjectChangeTypeSchema;
export const SnapshotLifecycleRecordSchema = KnowledgeSnapshotLifecycleRecordSchema;
export const SnapshotComparisonRequestSchema = KnowledgeSnapshotComparisonRequestSchema;
export const GovernedKnowledgeChangeSetSchema = KnowledgeGovernedChangeSetSchema;
export const SnapshotApprovalWorkflowSchema = KnowledgeSnapshotApprovalWorkflowSchema;
