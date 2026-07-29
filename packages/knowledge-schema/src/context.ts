import { z } from "zod";

import { KnowledgeObjectTypeSchema, KnowledgeStatusSchema } from "./enums.js";
import { SourceMetadataSchema } from "./metadata.js";
import {
  IdentifierSchema,
  IsoTemporalSchema,
  NonEmptyStringSchema,
  Sha256DigestSchema,
} from "./primitives.js";
import { KnowledgeQueryConsumerTypeSchema, KnowledgeQuerySchema } from "./query.js";

function uniqueArray<T extends z.ZodType>(schema: T) {
  return z
    .array(schema)
    .refine((values) => new Set(values).size === values.length, "Values must be unique");
}

function intersects(left: readonly string[] | undefined, right: readonly string[] | undefined) {
  return left === undefined || right === undefined || left.some((value) => right.includes(value));
}

function isLogicalSourceIdentifier(value: string): boolean {
  return (
    !value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\") &&
    !value.includes("\0") &&
    !/^[a-z][a-z0-9+.-]*:/iu.test(value) &&
    !value.split("/").some((segment) => segment === ".." || segment === "." || segment === "")
  );
}

export const KnowledgeContextAssemblyPolicyVersionSchema = z.literal("1.0");
export const KnowledgeContextRequiredObjectFailureBehaviorSchema = z.literal("fail");
export const KnowledgeContextEmptyBehaviorSchema = z.enum(["allow", "fail"]);

export const KnowledgeContextBudgetPolicySchema = z
  .object({
    maxObjectCount: z.number().int().positive(),
    maxCanonicalCharacters: z.number().int().positive(),
    perObjectCharacterLimit: z.number().int().positive().optional(),
    allowTruncation: z.boolean(),
    requiredObjectFailureBehavior: KnowledgeContextRequiredObjectFailureBehaviorSchema,
    emptyContextBehavior: KnowledgeContextEmptyBehaviorSchema,
  })
  .strict()
  .superRefine((budget, context) => {
    if (
      budget.perObjectCharacterLimit !== undefined &&
      budget.perObjectCharacterLimit > budget.maxCanonicalCharacters
    ) {
      context.addIssue({
        code: "custom",
        message: "perObjectCharacterLimit cannot exceed maxCanonicalCharacters",
        path: ["perObjectCharacterLimit"],
      });
    }
  });

export const KnowledgeContextScopeConstraintsSchema = z
  .object({
    domains: uniqueArray(NonEmptyStringSchema).min(1).optional(),
    objectTypes: uniqueArray(KnowledgeObjectTypeSchema).min(1).optional(),
    projects: uniqueArray(IdentifierSchema).min(1).optional(),
  })
  .strict();

export const KnowledgeContextConsumerSchema = z
  .object({
    consumerId: IdentifierSchema,
    consumerType: KnowledgeQueryConsumerTypeSchema,
  })
  .strict();

export const KnowledgeContextRequestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    requestId: IdentifierSchema,
    purpose: NonEmptyStringSchema,
    consumer: KnowledgeContextConsumerSchema,
    query: KnowledgeQuerySchema,
    requiredObjectIds: uniqueArray(IdentifierSchema).default([]),
    requiredObjectTypes: uniqueArray(KnowledgeObjectTypeSchema).default([]),
    preferredObjectTypes: uniqueArray(KnowledgeObjectTypeSchema).default([]),
    scope: KnowledgeContextScopeConstraintsSchema.default({}),
    assemblyPolicyVersion: KnowledgeContextAssemblyPolicyVersionSchema,
    budget: KnowledgeContextBudgetPolicySchema,
    reason: NonEmptyStringSchema,
    evidenceTimestamp: IsoTemporalSchema.optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (
      request.consumer.consumerId !== request.query.context.consumerId ||
      request.consumer.consumerType !== request.query.context.consumerType
    ) {
      context.addIssue({
        code: "custom",
        message: "Context consumer must match the embedded query consumer",
        path: ["consumer"],
      });
    }
    for (const [index, sourceReference] of (
      request.query.filters.sourceReferences ?? []
    ).entries()) {
      if (!isLogicalSourceIdentifier(sourceReference)) {
        context.addIssue({
          code: "custom",
          message: "Context query source references must be repository-logical identifiers",
          path: ["query", "filters", "sourceReferences", index],
        });
      }
    }
    const preferred = new Set(request.preferredObjectTypes);
    if (request.requiredObjectTypes.some((type) => preferred.has(type))) {
      context.addIssue({
        code: "custom",
        message: "Required and preferred object types must not overlap",
        path: ["preferredObjectTypes"],
      });
    }
    const queryTypes = request.query.filters.objectTypes;
    const queryConstraintTypes = request.query.context.constraints.objectTypes;
    if (
      !intersects(request.scope.objectTypes, queryTypes) ||
      !intersects(request.scope.objectTypes, queryConstraintTypes) ||
      !intersects(queryTypes, queryConstraintTypes)
    ) {
      context.addIssue({
        code: "custom",
        message: "Object-type scope contradicts the embedded query",
        path: ["scope", "objectTypes"],
      });
    }
    const allowedTypeSets = [request.scope.objectTypes, queryTypes, queryConstraintTypes];
    for (const [field, values] of [
      ["requiredObjectTypes", request.requiredObjectTypes],
      ["preferredObjectTypes", request.preferredObjectTypes],
    ] as const) {
      if (
        values.some((value) =>
          allowedTypeSets.some((allowed) => allowed !== undefined && !allowed.includes(value)),
        )
      ) {
        context.addIssue({
          code: "custom",
          message: `${field} contradicts an explicit object-type constraint`,
          path: [field],
        });
      }
    }
    const queryDomains = request.query.filters.domains;
    const queryConstraintDomains = request.query.context.constraints.domains;
    if (
      !intersects(request.scope.domains, queryDomains) ||
      !intersects(request.scope.domains, queryConstraintDomains) ||
      !intersects(queryDomains, queryConstraintDomains)
    ) {
      context.addIssue({
        code: "custom",
        message: "Domain scope contradicts the embedded query",
        path: ["scope", "domains"],
      });
    }
    const queryProjects = request.query.filters.projects;
    const queryConstraintProjects = request.query.context.constraints.projects;
    if (
      !intersects(request.scope.projects, queryProjects) ||
      !intersects(request.scope.projects, queryConstraintProjects) ||
      !intersects(queryProjects, queryConstraintProjects)
    ) {
      context.addIssue({
        code: "custom",
        message: "Project scope contradicts the embedded query",
        path: ["scope", "projects"],
      });
    }
  });

export const KnowledgeContextSelectionReasonSchema = z.enum([
  "required_object_id",
  "required_object_type",
  "preferred_object_type",
  "deterministic_policy",
]);

export const KnowledgeContextExclusionReasonSchema = z.enum([
  "category_mismatch",
  "domain_mismatch",
  "object_type_mismatch",
  "project_mismatch",
  "source_reference_mismatch",
  "source_type_mismatch",
  "status_mismatch",
  "tag_mismatch",
  "scope_domain_mismatch",
  "scope_object_type_mismatch",
  "scope_project_mismatch",
]);

export const KnowledgeContextOmissionReasonSchema = z.enum([
  "equivalent_duplicate",
  "max_object_count",
  "max_canonical_characters",
  "per_object_character_limit",
]);

export const KnowledgeContextTruncationReasonSchema = z.enum([
  "per_object_character_limit",
  "max_canonical_characters",
]);

export const KnowledgeContextLogicalSourceIdentifierSchema = NonEmptyStringSchema.refine(
  isLogicalSourceIdentifier,
  "Expected a safe repository-logical source identifier",
);

export const KnowledgeContextIncludedObjectSchema = z
  .object({
    objectId: IdentifierSchema,
    objectType: KnowledgeObjectTypeSchema,
    lifecycleStatus: KnowledgeStatusSchema,
    domain: NonEmptyStringSchema,
    projectIds: uniqueArray(IdentifierSchema),
    canonicalContent: z.string().min(1),
    originalObjectFingerprint: Sha256DigestSchema,
    logicalSourceIdentifier: KnowledgeContextLogicalSourceIdentifierSchema,
    sourceHash: Sha256DigestSchema,
    provenance: SourceMetadataSchema,
    includedContentFingerprint: Sha256DigestSchema,
    includedCharacterCount: z.number().int().positive(),
    selectionPosition: z.number().int().positive(),
    selectionReason: KnowledgeContextSelectionReasonSchema,
  })
  .strict()
  .superRefine((entry, context) => {
    if (Array.from(entry.canonicalContent).length !== entry.includedCharacterCount) {
      context.addIssue({
        code: "custom",
        message: "includedCharacterCount must equal the Unicode code-point count",
        path: ["includedCharacterCount"],
      });
    }
    if (
      entry.provenance.sourceReference !== undefined &&
      entry.provenance.sourceReference !== entry.logicalSourceIdentifier
    ) {
      context.addIssue({
        code: "custom",
        message: "Source provenance must use the logical source identifier",
        path: ["provenance", "sourceReference"],
      });
    }
  });

export const KnowledgeContextExcludedEvidenceSchema = z
  .object({
    objectId: IdentifierSchema,
    category: z.literal("filtered_out"),
    filter: NonEmptyStringSchema,
    reason: KnowledgeContextExclusionReasonSchema,
  })
  .strict()
  .superRefine((evidence, context) => {
    const reasonByFilter: Readonly<
      Record<string, z.infer<typeof KnowledgeContextExclusionReasonSchema>>
    > = {
      "filters.categories": "category_mismatch",
      "filters.domains": "domain_mismatch",
      "filters.objectTypes": "object_type_mismatch",
      "filters.projects": "project_mismatch",
      "filters.sourceReferences": "source_reference_mismatch",
      "filters.sourceTypes": "source_type_mismatch",
      "filters.statuses": "status_mismatch",
      "filters.tags": "tag_mismatch",
      "context.domains": "domain_mismatch",
      "context.objectTypes": "object_type_mismatch",
      "context.projects": "project_mismatch",
      "context.sourceTypes": "source_type_mismatch",
      "scope.domains": "scope_domain_mismatch",
      "scope.objectTypes": "scope_object_type_mismatch",
      "scope.projects": "scope_project_mismatch",
    };
    if (reasonByFilter[evidence.filter] !== evidence.reason) {
      context.addIssue({
        code: "custom",
        message: "Exclusion filter and reason must describe the same deterministic rule",
        path: ["reason"],
      });
    }
  });

export const KnowledgeContextOmittedEvidenceSchema = z
  .object({
    objectId: IdentifierSchema,
    category: z.enum(["duplicate", "over_budget"]),
    policyRule: NonEmptyStringSchema,
    orderingPosition: z.number().int().positive(),
    reason: KnowledgeContextOmissionReasonSchema,
    characterImpact: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((evidence, context) => {
    const duplicate = evidence.reason === "equivalent_duplicate";
    const expectedPolicyRule = duplicate ? "canonical_object_equivalence" : evidence.reason;
    if (
      (duplicate && (evidence.category !== "duplicate" || evidence.characterImpact !== 0)) ||
      (!duplicate && evidence.category !== "over_budget") ||
      evidence.policyRule !== expectedPolicyRule
    ) {
      context.addIssue({
        code: "custom",
        message: "Omission category and impact must agree with its reason",
        path: ["category"],
      });
    }
  });

export const KnowledgeContextTruncationEvidenceSchema = z
  .object({
    objectId: IdentifierSchema,
    originalCharacterCount: z.number().int().positive(),
    includedCharacterCount: z.number().int().positive(),
    boundary: z.number().int().positive(),
    reason: KnowledgeContextTruncationReasonSchema,
    originalObjectFingerprint: Sha256DigestSchema,
    includedContentFingerprint: Sha256DigestSchema,
    logicalSourceIdentifier: KnowledgeContextLogicalSourceIdentifierSchema,
  })
  .strict()
  .superRefine((evidence, context) => {
    if (
      evidence.includedCharacterCount >= evidence.originalCharacterCount ||
      evidence.boundary !== evidence.includedCharacterCount
    ) {
      context.addIssue({
        code: "custom",
        message: "Truncation boundary must equal a strictly smaller included character count",
        path: ["boundary"],
      });
    }
  });

export const KnowledgeContextRegistryBindingSchema = z
  .object({
    registrySchemaVersion: z.literal("1.0"),
    integrityFingerprint: Sha256DigestSchema,
    verifiedRecordCount: z.number().int().nonnegative(),
    verifiedThroughSequence: z.number().int().nonnegative(),
    recoveredActiveSnapshotId: IdentifierSchema,
  })
  .strict()
  .refine((value) => value.verifiedRecordCount === value.verifiedThroughSequence, {
    message: "Registry verification coordinates must describe contiguous history",
    path: ["verifiedThroughSequence"],
  });

export const KnowledgeContextSnapshotBindingSchema = z
  .object({
    activeSnapshotId: IdentifierSchema,
    activeContentFingerprint: Sha256DigestSchema,
    activeManifestFingerprint: Sha256DigestSchema,
    sourceManifestReference: KnowledgeContextLogicalSourceIdentifierSchema,
    repositorySnapshotId: IdentifierSchema,
    repositoryContentFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((binding, context) => {
    if (binding.activeSnapshotId !== binding.repositorySnapshotId) {
      context.addIssue({
        code: "custom",
        message: "Repository snapshot ID must match the active snapshot",
        path: ["repositorySnapshotId"],
      });
    }
    if (binding.activeContentFingerprint !== binding.repositoryContentFingerprint) {
      context.addIssue({
        code: "custom",
        message: "Repository content fingerprint must match the active snapshot",
        path: ["repositoryContentFingerprint"],
      });
    }
  });

export const KnowledgeContextBudgetUsageSchema = z
  .object({
    usedObjectCount: z.number().int().nonnegative(),
    usedCanonicalCharacters: z.number().int().nonnegative(),
    perObject: z.array(
      z
        .object({ objectId: IdentifierSchema, characterCount: z.number().int().positive() })
        .strict(),
    ),
    characterCountingMethod: z.literal("unicode_code_points"),
  })
  .strict();

export const KnowledgeContextEvidenceCountsSchema = z
  .object({
    included: z.number().int().nonnegative(),
    excluded: z.number().int().nonnegative(),
    omitted: z.number().int().nonnegative(),
    truncated: z.number().int().nonnegative(),
  })
  .strict();

export const KnowledgeContextPackageSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    contextPackageId: IdentifierSchema,
    request: KnowledgeContextRequestSchema,
    requestFingerprint: Sha256DigestSchema,
    queryId: IdentifierSchema,
    queryFingerprint: Sha256DigestSchema,
    queryResultFingerprint: Sha256DigestSchema,
    registryBinding: KnowledgeContextRegistryBindingSchema,
    snapshotBinding: KnowledgeContextSnapshotBindingSchema,
    assemblyPolicyVersion: KnowledgeContextAssemblyPolicyVersionSchema,
    budgetPolicy: KnowledgeContextBudgetPolicySchema,
    budgetUsage: KnowledgeContextBudgetUsageSchema,
    included: z.array(KnowledgeContextIncludedObjectSchema),
    excluded: z.array(KnowledgeContextExcludedEvidenceSchema),
    omitted: z.array(KnowledgeContextOmittedEvidenceSchema),
    truncations: z.array(KnowledgeContextTruncationEvidenceSchema),
    evidenceCounts: KnowledgeContextEvidenceCountsSchema,
    assembledAt: IsoTemporalSchema.optional(),
    contextFingerprint: Sha256DigestSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.contextPackageId !== `context-${value.contextFingerprint}`) {
      context.addIssue({
        code: "custom",
        message: "contextPackageId must derive from contextFingerprint",
        path: ["contextPackageId"],
      });
    }
    if (value.request.query.queryId !== value.queryId) {
      context.addIssue({
        code: "custom",
        message: "Package query identity must bind the requested query",
        path: ["queryId"],
      });
    }
    if (
      value.registryBinding.recoveredActiveSnapshotId !== value.snapshotBinding.activeSnapshotId
    ) {
      context.addIssue({
        code: "custom",
        message: "Recovered active snapshot must match the package snapshot binding",
        path: ["snapshotBinding", "activeSnapshotId"],
      });
    }
    if (value.assemblyPolicyVersion !== value.request.assemblyPolicyVersion) {
      context.addIssue({
        code: "custom",
        message: "Assembly policy must match the request",
        path: ["assemblyPolicyVersion"],
      });
    }
    if (JSON.stringify(value.budgetPolicy) !== JSON.stringify(value.request.budget)) {
      context.addIssue({
        code: "custom",
        message: "Budget policy must match the request",
        path: ["budgetPolicy"],
      });
    }
    if (
      (value.request.evidenceTimestamp === undefined && value.assembledAt !== undefined) ||
      (value.request.evidenceTimestamp !== undefined &&
        value.assembledAt !== value.request.evidenceTimestamp)
    ) {
      context.addIssue({
        code: "custom",
        message: "assembledAt must exactly mirror caller-bound request timestamp evidence",
        path: ["assembledAt"],
      });
    }
    const counts = value.evidenceCounts;
    if (
      counts.included !== value.included.length ||
      counts.excluded !== value.excluded.length ||
      counts.omitted !== value.omitted.length ||
      counts.truncated !== value.truncations.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Evidence counts must match evidence arrays",
        path: ["evidenceCounts"],
      });
    }
    if (
      value.budgetUsage.usedObjectCount !== value.included.length ||
      value.budgetUsage.perObject.length !== value.included.length
    ) {
      context.addIssue({
        code: "custom",
        message: "Budget object usage must match included entries",
        path: ["budgetUsage", "usedObjectCount"],
      });
    }
    const includedIds = value.included.map((entry) => entry.objectId);
    if (new Set(includedIds).size !== includedIds.length) {
      context.addIssue({
        code: "custom",
        message: "Included object IDs must be unique",
        path: ["included"],
      });
    }
    const usedCharacters = value.included.reduce(
      (sum, entry) => sum + entry.includedCharacterCount,
      0,
    );
    if (value.budgetUsage.usedCanonicalCharacters !== usedCharacters) {
      context.addIssue({
        code: "custom",
        message: "Character usage must equal included content",
        path: ["budgetUsage", "usedCanonicalCharacters"],
      });
    }
    value.included.forEach((entry, index) => {
      if (
        entry.selectionPosition !== index + 1 ||
        value.budgetUsage.perObject[index]?.objectId !== entry.objectId ||
        value.budgetUsage.perObject[index]?.characterCount !== entry.includedCharacterCount
      ) {
        context.addIssue({
          code: "custom",
          message: "Included positions and per-object usage must be aligned",
          path: ["included", index],
        });
      }
    });
    if (
      value.budgetUsage.usedObjectCount > value.budgetPolicy.maxObjectCount ||
      value.budgetUsage.usedCanonicalCharacters > value.budgetPolicy.maxCanonicalCharacters
    ) {
      context.addIssue({
        code: "custom",
        message: "Budget usage cannot exceed requested limits",
        path: ["budgetUsage"],
      });
    }
    if (
      value.budgetPolicy.perObjectCharacterLimit !== undefined &&
      value.included.some(
        (entry) => entry.includedCharacterCount > value.budgetPolicy.perObjectCharacterLimit!,
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Per-object character usage cannot exceed the requested limit",
        path: ["budgetUsage", "perObject"],
      });
    }
    if (!value.budgetPolicy.allowTruncation && value.truncations.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Truncation evidence requires an explicitly enabled truncation policy",
        path: ["truncations"],
      });
    }
    const includedById = new Map(value.included.map((entry) => [entry.objectId, entry]));
    for (const [index, truncation] of value.truncations.entries()) {
      const entry = includedById.get(truncation.objectId);
      if (
        entry === undefined ||
        entry.includedCharacterCount !== truncation.includedCharacterCount ||
        entry.includedContentFingerprint !== truncation.includedContentFingerprint ||
        entry.originalObjectFingerprint !== truncation.originalObjectFingerprint ||
        entry.logicalSourceIdentifier !== truncation.logicalSourceIdentifier
      ) {
        context.addIssue({
          code: "custom",
          message: "Truncation evidence must bind one matching included entry",
          path: ["truncations", index],
        });
      }
    }
  });

export const KnowledgeContextIssueCodeSchema = z.enum([
  "registry_integrity_invalid",
  "registry_recovery_failed",
  "active_snapshot_missing",
  "active_snapshot_mismatch",
  "repository_snapshot_mismatch",
  "repository_content_mismatch",
  "manifest_fingerprint_mismatch",
  "snapshot_object_mismatch",
  "conflicting_duplicate",
  "missing_required_object",
  "missing_required_type",
  "required_object_over_budget",
  "context_over_budget",
  "empty_context_disallowed",
  "context_package_invalid",
]);

export const KnowledgeContextAssemblyIssueSchema = z
  .object({
    code: KnowledgeContextIssueCodeSchema,
    path: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
  })
  .strict();

export const KnowledgeContextInsufficientResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.literal("insufficient_context"),
    requestId: IdentifierSchema,
    issues: z.array(KnowledgeContextAssemblyIssueSchema).min(1),
  })
  .strict();

export const KnowledgeContextAssemblySuccessSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.literal("assembled"),
    package: KnowledgeContextPackageSchema,
  })
  .strict();

export const KnowledgeContextAssemblyResultSchema = z.discriminatedUnion("status", [
  KnowledgeContextAssemblySuccessSchema,
  KnowledgeContextInsufficientResultSchema,
]);

export const KnowledgeContextVerificationIssueCodeSchema = z.enum([
  "invalid_package",
  "request_fingerprint_mismatch",
  "query_fingerprint_mismatch",
  "query_result_fingerprint_mismatch",
  "included_content_fingerprint_mismatch",
  "object_fingerprint_mismatch",
  "provenance_mismatch",
  "ordering_mismatch",
  "budget_mismatch",
  "evidence_mismatch",
  "snapshot_binding_mismatch",
  "registry_binding_mismatch",
  "context_fingerprint_mismatch",
]);

export const KnowledgeContextVerificationResultSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    status: z.enum(["valid", "invalid"]),
    contextFingerprint: Sha256DigestSchema.nullable(),
    issues: z.array(
      z
        .object({
          code: KnowledgeContextVerificationIssueCodeSchema,
          path: NonEmptyStringSchema,
          message: NonEmptyStringSchema,
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      (value.status === "valid") !== (value.issues.length === 0) ||
      (value.status === "valid") !== (value.contextFingerprint !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Verification status, fingerprint, and issues must agree",
        path: ["status"],
      });
    }
  });

export type KnowledgeContextRequest = z.infer<typeof KnowledgeContextRequestSchema>;
export type KnowledgeContextBudgetPolicy = z.infer<typeof KnowledgeContextBudgetPolicySchema>;
export type KnowledgeContextPackage = z.infer<typeof KnowledgeContextPackageSchema>;
export type KnowledgeContextAssemblyResult = z.infer<typeof KnowledgeContextAssemblyResultSchema>;
export type KnowledgeContextAssemblyIssue = z.infer<typeof KnowledgeContextAssemblyIssueSchema>;
export type KnowledgeContextIncludedObject = z.infer<typeof KnowledgeContextIncludedObjectSchema>;
export type KnowledgeContextExcludedEvidence = z.infer<
  typeof KnowledgeContextExcludedEvidenceSchema
>;
export type KnowledgeContextOmittedEvidence = z.infer<typeof KnowledgeContextOmittedEvidenceSchema>;
export type KnowledgeContextTruncationEvidence = z.infer<
  typeof KnowledgeContextTruncationEvidenceSchema
>;
export type KnowledgeContextVerificationResult = z.infer<
  typeof KnowledgeContextVerificationResultSchema
>;
