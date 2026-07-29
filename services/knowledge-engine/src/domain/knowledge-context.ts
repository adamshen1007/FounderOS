import {
  KnowledgeContextAssemblyResultSchema,
  KnowledgeContextPackageSchema,
  KnowledgeContextRequestSchema,
  KnowledgeContextVerificationResultSchema,
  KnowledgeObjectSchema,
  KnowledgeRepositorySnapshotSchema,
  RegistryIntegrityResultSchema,
  RegistryRecoveryResultSchema,
  type DurableSnapshotRegistrationRecord,
  type KnowledgeContextAssemblyIssue,
  type KnowledgeContextAssemblyResult,
  type KnowledgeContextExcludedEvidence,
  type KnowledgeContextIncludedObject,
  type KnowledgeContextOmittedEvidence,
  type KnowledgeContextPackage,
  type KnowledgeContextRequest,
  type KnowledgeContextTruncationEvidence,
  type KnowledgeContextVerificationResult,
  type KnowledgeObject,
  type KnowledgeQuery,
  type KnowledgeRepositorySnapshot,
  type RegistryIntegrityResult,
  type RegistryRecoveryResult,
} from "@founderos/knowledge-schema";

import {
  evaluateKnowledgeQueryCandidate,
  knowledgeObjectProjectReferences,
  queryKnowledgeObjects,
} from "../application/query-knowledge.js";
import {
  createCanonicalSha256Fingerprint,
  serializeCanonicalValue,
} from "./canonical-fingerprint.js";
import {
  createDurableSnapshotManifestFingerprint,
  verifyDurableSnapshotRegistrationRecord,
} from "./durable-registry.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

const MAX_ORDER = Number.MAX_SAFE_INTEGER;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function issue(
  code: KnowledgeContextAssemblyIssue["code"],
  path: string,
  message: string,
): KnowledgeContextAssemblyIssue {
  return { code, path, message };
}

function insufficient(
  requestId: string,
  issues: readonly KnowledgeContextAssemblyIssue[],
): KnowledgeContextAssemblyResult {
  return deepFreeze(
    KnowledgeContextAssemblyResultSchema.parse({
      schemaVersion: "1.0",
      status: "insufficient_context",
      requestId,
      issues,
    }),
  );
}

function valuesMatch(actual: string, expected: readonly string[] | undefined): boolean {
  return expected === undefined || expected.includes(actual);
}

function matchesProjects(object: KnowledgeObject, expected: readonly string[] | undefined) {
  return (
    expected === undefined ||
    expected.some((project) => knowledgeObjectProjectReferences(object).includes(project))
  );
}

function queryExclusionEvidence(
  object: KnowledgeObject,
  query: KnowledgeQuery,
): KnowledgeContextExcludedEvidence | null {
  const evaluation = evaluateKnowledgeQueryCandidate(object, query);
  return evaluation.matches
    ? null
    : {
        objectId: object.metadata.id,
        category: "filtered_out",
        filter: evaluation.filter!,
        reason: evaluation.reason!,
      };
}

function scopeExclusionEvidence(
  object: KnowledgeObject,
  request: KnowledgeContextRequest,
): KnowledgeContextExcludedEvidence | null {
  if (!valuesMatch(object.metadata.domain, request.scope.domains)) {
    return {
      objectId: object.metadata.id,
      category: "filtered_out",
      filter: "scope.domains",
      reason: "scope_domain_mismatch",
    };
  }
  if (!valuesMatch(object.metadata.objectType, request.scope.objectTypes)) {
    return {
      objectId: object.metadata.id,
      category: "filtered_out",
      filter: "scope.objectTypes",
      reason: "scope_object_type_mismatch",
    };
  }
  if (!matchesProjects(object, request.scope.projects)) {
    return {
      objectId: object.metadata.id,
      category: "filtered_out",
      filter: "scope.projects",
      reason: "scope_project_mismatch",
    };
  }
  return null;
}

function canonicalProjectIdentity(object: KnowledgeObject): string {
  return knowledgeObjectProjectReferences(object).sort(compareStrings)[0] ?? object.metadata.domain;
}

const STATUS_PRIORITY: Record<KnowledgeObject["metadata"]["status"], number> = {
  active: 0,
  review: 1,
  draft: 2,
  archived: 3,
  deprecated: 4,
};

const IMPORTANCE_PRIORITY = { critical: 0, high: 1, medium: 2, low: 3 } as const;

function orderIndex(values: readonly string[], value: string): number {
  const index = values.indexOf(value);
  return index === -1 ? MAX_ORDER : index;
}

function compareCandidates(
  request: KnowledgeContextRequest,
  left: KnowledgeObject,
  right: KnowledgeObject,
): number {
  const leftTuple: readonly (number | string)[] = [
    orderIndex(request.requiredObjectIds, left.metadata.id),
    orderIndex(request.requiredObjectTypes, left.metadata.objectType),
    orderIndex(request.preferredObjectTypes, left.metadata.objectType),
    STATUS_PRIORITY[left.metadata.status],
    IMPORTANCE_PRIORITY[left.metadata.importance],
    left.metadata.objectType,
    canonicalProjectIdentity(left),
    left.metadata.id,
  ];
  const rightTuple: readonly (number | string)[] = [
    orderIndex(request.requiredObjectIds, right.metadata.id),
    orderIndex(request.requiredObjectTypes, right.metadata.objectType),
    orderIndex(request.preferredObjectTypes, right.metadata.objectType),
    STATUS_PRIORITY[right.metadata.status],
    IMPORTANCE_PRIORITY[right.metadata.importance],
    right.metadata.objectType,
    canonicalProjectIdentity(right),
    right.metadata.id,
  ];
  for (let index = 0; index < leftTuple.length; index += 1) {
    const leftValue = leftTuple[index]!;
    const rightValue = rightTuple[index]!;
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      if (leftValue !== rightValue) return leftValue - rightValue;
    } else {
      const comparison = compareStrings(String(leftValue), String(rightValue));
      if (comparison !== 0) return comparison;
    }
  }
  return 0;
}

function selectionReason(
  object: KnowledgeObject,
  request: KnowledgeContextRequest,
): KnowledgeContextIncludedObject["selectionReason"] {
  if (request.requiredObjectIds.includes(object.metadata.id)) return "required_object_id";
  if (request.requiredObjectTypes.includes(object.metadata.objectType))
    return "required_object_type";
  if (request.preferredObjectTypes.includes(object.metadata.objectType))
    return "preferred_object_type";
  return "deterministic_policy";
}

function compareResolvedCandidates(
  request: KnowledgeContextRequest,
  representativeIdsByType: ReadonlyMap<string, string>,
  left: KnowledgeObject,
  right: KnowledgeObject,
): number {
  const leftRequiredId = orderIndex(request.requiredObjectIds, left.metadata.id);
  const rightRequiredId = orderIndex(request.requiredObjectIds, right.metadata.id);
  if (leftRequiredId !== rightRequiredId) return leftRequiredId - rightRequiredId;

  const leftRepresentativeType = request.requiredObjectTypes.findIndex(
    (type) => representativeIdsByType.get(type) === left.metadata.id,
  );
  const rightRepresentativeType = request.requiredObjectTypes.findIndex(
    (type) => representativeIdsByType.get(type) === right.metadata.id,
  );
  const leftRepresentativeOrder =
    leftRepresentativeType === -1 ? MAX_ORDER : leftRepresentativeType;
  const rightRepresentativeOrder =
    rightRepresentativeType === -1 ? MAX_ORDER : rightRepresentativeType;
  if (leftRepresentativeOrder !== rightRepresentativeOrder)
    return leftRepresentativeOrder - rightRepresentativeOrder;

  return compareCandidates(request, left, right);
}

function canonicalCharacterCount(value: string): number {
  return Array.from(value).length;
}

function unicodeSafePrefix(value: string, requestedLength: number): string {
  return Array.from(value).slice(0, requestedLength).join("");
}

interface PreparedCandidates {
  candidates: KnowledgeObject[];
  duplicateEvidence: KnowledgeContextOmittedEvidence[];
  conflictId: string | null;
}

function prepareCandidates(inputs: readonly unknown[]): PreparedCandidates {
  const byId = new Map<string, KnowledgeObject>();
  const duplicateIds: string[] = [];
  for (const input of inputs) {
    const candidate = KnowledgeObjectSchema.parse(input);
    const existing = byId.get(candidate.metadata.id);
    if (existing === undefined) {
      byId.set(candidate.metadata.id, candidate);
    } else if (
      createCanonicalSha256Fingerprint(existing) === createCanonicalSha256Fingerprint(candidate)
    ) {
      duplicateIds.push(candidate.metadata.id);
    } else {
      return { candidates: [], duplicateEvidence: [], conflictId: candidate.metadata.id };
    }
  }
  const candidates = [...byId.values()].sort((left, right) =>
    compareStrings(left.metadata.id, right.metadata.id),
  );
  return {
    candidates,
    conflictId: null,
    duplicateEvidence: duplicateIds.sort(compareStrings).map((objectId, index) => ({
      objectId,
      category: "duplicate",
      policyRule: "canonical_object_equivalence",
      orderingPosition: index + 1,
      reason: "equivalent_duplicate",
      characterImpact: 0,
    })),
  };
}

export interface VerifiedKnowledgeContextInputs {
  readonly registration: DurableSnapshotRegistrationRecord;
  readonly integrity: RegistryIntegrityResult;
  readonly recovery: RegistryRecoveryResult;
  readonly repositorySnapshot: KnowledgeRepositorySnapshot;
}

function captureVerifiedBindings(
  bindings: VerifiedKnowledgeContextInputs,
): VerifiedKnowledgeContextInputs | null {
  try {
    return deepFreeze({
      registration: verifyDurableSnapshotRegistrationRecord(bindings.registration),
      integrity: RegistryIntegrityResultSchema.parse(structuredClone(bindings.integrity)),
      recovery: RegistryRecoveryResultSchema.parse(structuredClone(bindings.recovery)),
      repositorySnapshot: KnowledgeRepositorySnapshotSchema.parse(
        structuredClone(bindings.repositorySnapshot),
      ),
    });
  } catch {
    return null;
  }
}

function validateBindings(
  requestId: string,
  bindings: VerifiedKnowledgeContextInputs,
): KnowledgeContextAssemblyResult | null {
  const integrityResult = RegistryIntegrityResultSchema.safeParse(bindings.integrity);
  if (!integrityResult.success || integrityResult.data.status !== "valid") {
    return insufficient(requestId, [
      issue(
        "registry_integrity_invalid",
        "registry.integrity",
        "Durable registry integrity verification failed",
      ),
    ]);
  }
  const recoveryResult = RegistryRecoveryResultSchema.safeParse(bindings.recovery);
  if (!recoveryResult.success || recoveryResult.data.status !== "recovered") {
    return insufficient(requestId, [
      issue("registry_recovery_failed", "registry.recovery", "Durable registry recovery failed"),
    ]);
  }
  const integrity = integrityResult.data;
  const recovery = recoveryResult.data;
  if (recovery.integrityFingerprint !== integrity.integrityFingerprint) {
    return insufficient(requestId, [
      issue(
        "registry_integrity_invalid",
        "registry.integrityFingerprint",
        "Recovery and integrity evidence do not bind the same durable state",
      ),
    ]);
  }
  if (
    recovery.committedTransactionCount !== integrity.verifiedTransactionCount ||
    recovery.committedRecordCount !== integrity.verifiedRecordCount ||
    recovery.lastCommittedAuditSequence !== integrity.verifiedThroughSequence ||
    recovery.lastRecordFingerprint !== integrity.lastRecordFingerprint
  ) {
    return insufficient(requestId, [
      issue(
        "registry_integrity_invalid",
        "registry.recoveryCoordinates",
        "Recovery and integrity evidence do not describe the same committed prefix",
      ),
    ]);
  }
  if (recovery.activeSnapshotId === null) {
    return insufficient(requestId, [
      issue(
        "active_snapshot_missing",
        "registry.activeSnapshotId",
        "No durably active snapshot exists",
      ),
    ]);
  }
  if (recovery.activeSnapshotId !== bindings.registration.snapshot.snapshotId) {
    return insufficient(requestId, [
      issue(
        "active_snapshot_mismatch",
        "registry.activeSnapshotId",
        "Recovered active snapshot does not match registration evidence",
      ),
    ]);
  }
  const snapshot = bindings.registration.snapshot;
  const parsedRepositorySnapshot = KnowledgeRepositorySnapshotSchema.safeParse(
    bindings.repositorySnapshot,
  );
  if (!parsedRepositorySnapshot.success) {
    return insufficient(requestId, [
      issue(
        "repository_snapshot_mismatch",
        "repository.snapshot",
        "Repository snapshot evidence is invalid",
      ),
    ]);
  }
  const repositorySnapshot = parsedRepositorySnapshot.data;
  if (repositorySnapshot.snapshotId !== snapshot.snapshotId) {
    return insufficient(requestId, [
      issue(
        "repository_snapshot_mismatch",
        "repository.snapshotId",
        "Repository snapshot does not match the durable active snapshot",
      ),
    ]);
  }
  if (repositorySnapshot.contentFingerprint !== snapshot.contentFingerprint) {
    return insufficient(requestId, [
      issue(
        "repository_content_mismatch",
        "repository.contentFingerprint",
        "Repository content does not match the durable active snapshot",
      ),
    ]);
  }
  if (
    createCanonicalSha256Fingerprint(repositorySnapshot) !==
    createCanonicalSha256Fingerprint(snapshot)
  ) {
    return insufficient(requestId, [
      issue(
        "repository_content_mismatch",
        "repository.snapshot",
        "Repository snapshot evidence differs from the durable registered snapshot",
      ),
    ]);
  }
  if (
    createDurableSnapshotManifestFingerprint(bindings.registration.manifestEvidence) !==
    bindings.registration.manifestFingerprint
  ) {
    return insufficient(requestId, [
      issue(
        "manifest_fingerprint_mismatch",
        "registry.manifestFingerprint",
        "Active manifest fingerprint is invalid",
      ),
    ]);
  }
  return null;
}

function fingerprintPayload(
  value: Omit<KnowledgeContextPackage, "contextPackageId" | "contextFingerprint" | "assembledAt">,
) {
  return value;
}

export function createKnowledgeContextFingerprint(
  value: Omit<KnowledgeContextPackage, "contextPackageId" | "contextFingerprint" | "assembledAt">,
): string {
  return createCanonicalSha256Fingerprint(fingerprintPayload(value));
}

export interface AssembleKnowledgeContextInput {
  readonly request: unknown;
  readonly candidateInputs: readonly unknown[];
  readonly bindings: VerifiedKnowledgeContextInputs;
}

export function assembleKnowledgeContextFromVerifiedInputs(
  input: AssembleKnowledgeContextInput,
): KnowledgeContextAssemblyResult {
  const request = KnowledgeContextRequestSchema.parse(input.request);
  const bindings = captureVerifiedBindings(input.bindings);
  if (bindings === null)
    return insufficient(request.requestId, [
      issue(
        "active_snapshot_mismatch",
        "registry.registration",
        "Durable active snapshot registration evidence is invalid",
      ),
    ]);
  const bindingFailure = validateBindings(request.requestId, bindings);
  if (bindingFailure !== null) return bindingFailure;

  const prepared = prepareCandidates(input.candidateInputs);
  if (prepared.conflictId !== null) {
    return insufficient(request.requestId, [
      issue(
        "conflicting_duplicate",
        `candidates.${prepared.conflictId}`,
        `Conflicting candidates use object ID ${prepared.conflictId}`,
      ),
    ]);
  }

  const snapshotDescriptors = new Map(
    bindings.repositorySnapshot.objects.map((descriptor) => [descriptor.objectId, descriptor]),
  );
  for (const candidate of prepared.candidates) {
    const descriptor = snapshotDescriptors.get(candidate.metadata.id);
    if (
      descriptor === undefined ||
      descriptor.objectType !== candidate.metadata.objectType ||
      descriptor.objectFingerprint !== createCanonicalSha256Fingerprint(candidate) ||
      descriptor.metadataFingerprint !== createCanonicalSha256Fingerprint(candidate.metadata)
    ) {
      return insufficient(request.requestId, [
        issue(
          "snapshot_object_mismatch",
          `candidates.${candidate.metadata.id}`,
          "Repository candidate does not match the active snapshot descriptor",
        ),
      ]);
    }
  }
  if (prepared.candidates.length !== snapshotDescriptors.size) {
    return insufficient(request.requestId, [
      issue(
        "snapshot_object_mismatch",
        "candidates",
        "Repository candidates do not exactly cover the active snapshot",
      ),
    ]);
  }

  const queryResult = queryKnowledgeObjects(request.query, prepared.candidates);
  const matchedByQuery = new Set(queryResult.objects.map((object) => object.metadata.id));
  const excluded: KnowledgeContextExcludedEvidence[] = [];
  const selected: KnowledgeObject[] = [];
  for (const candidate of prepared.candidates) {
    const queryEvidence = matchedByQuery.has(candidate.metadata.id)
      ? null
      : queryExclusionEvidence(candidate, request.query);
    const scopeEvidence =
      queryEvidence === null ? scopeExclusionEvidence(candidate, request) : null;
    if (queryEvidence !== null) excluded.push(queryEvidence);
    else if (scopeEvidence !== null) excluded.push(scopeEvidence);
    else selected.push(candidate);
  }
  excluded.sort((left, right) => compareStrings(left.objectId, right.objectId));
  selected.sort((left, right) => compareCandidates(request, left, right));

  const selectedIds = new Set(selected.map((object) => object.metadata.id));
  const missingIssues: KnowledgeContextAssemblyIssue[] = [];
  for (const id of request.requiredObjectIds) {
    if (!selectedIds.has(id))
      missingIssues.push(
        issue(
          "missing_required_object",
          `requiredObjectIds.${id}`,
          `Required object ${id} is unavailable after governed filters`,
        ),
      );
  }
  for (const type of request.requiredObjectTypes) {
    if (!selected.some((object) => object.metadata.objectType === type))
      missingIssues.push(
        issue(
          "missing_required_type",
          `requiredObjectTypes.${type}`,
          `Required object type ${type} is unavailable after governed filters`,
        ),
      );
  }
  if (missingIssues.length > 0) return insufficient(request.requestId, missingIssues);

  const requiredRepresentativeIds = new Set(request.requiredObjectIds);
  const representativeIdsByType = new Map<string, string>();
  for (const type of request.requiredObjectTypes) {
    const representative = selected.find((object) => object.metadata.objectType === type);
    if (representative !== undefined) {
      requiredRepresentativeIds.add(representative.metadata.id);
      representativeIdsByType.set(type, representative.metadata.id);
    }
  }
  selected.sort((left, right) =>
    compareResolvedCandidates(request, representativeIdsByType, left, right),
  );

  const included: KnowledgeContextIncludedObject[] = [];
  const omitted: KnowledgeContextOmittedEvidence[] = [...prepared.duplicateEvidence];
  const truncations: KnowledgeContextTruncationEvidence[] = [];
  let usedCharacters = 0;

  for (let index = 0; index < selected.length; index += 1) {
    const object = selected[index]!;
    const descriptor = snapshotDescriptors.get(object.metadata.id)!;
    const originalContent = serializeCanonicalValue(object);
    const required = requiredRepresentativeIds.has(object.metadata.id);
    const remainingCharacters = request.budget.maxCanonicalCharacters - usedCharacters;
    const originalCharacterCount = canonicalCharacterCount(originalContent);
    const objectLimit = Math.min(
      request.budget.perObjectCharacterLimit ?? MAX_ORDER,
      remainingCharacters,
    );
    const objectCountAvailable = included.length < request.budget.maxObjectCount;
    let canonicalContent = originalContent;
    let truncationReason: KnowledgeContextTruncationEvidence["reason"] | null = null;

    if (!objectCountAvailable) {
      if (required)
        return insufficient(request.requestId, [
          issue(
            "required_object_over_budget",
            `budget.${object.metadata.id}`,
            "Required knowledge exceeds maxObjectCount",
          ),
        ]);
      omitted.push({
        objectId: object.metadata.id,
        category: "over_budget",
        policyRule: "max_object_count",
        orderingPosition: index + 1,
        reason: "max_object_count",
        characterImpact: originalCharacterCount,
      });
      continue;
    }
    if (originalCharacterCount > objectLimit) {
      if (!request.budget.allowTruncation || objectLimit <= 0) {
        if (required)
          return insufficient(request.requestId, [
            issue(
              "required_object_over_budget",
              `budget.${object.metadata.id}`,
              "Required knowledge exceeds the canonical character budget",
            ),
          ]);
        const perObjectExceeded =
          request.budget.perObjectCharacterLimit !== undefined &&
          originalCharacterCount > request.budget.perObjectCharacterLimit;
        omitted.push({
          objectId: object.metadata.id,
          category: "over_budget",
          policyRule: perObjectExceeded ? "per_object_character_limit" : "max_canonical_characters",
          orderingPosition: index + 1,
          reason: perObjectExceeded ? "per_object_character_limit" : "max_canonical_characters",
          characterImpact: originalCharacterCount,
        });
        continue;
      }
      canonicalContent = unicodeSafePrefix(originalContent, objectLimit);
      if (canonicalCharacterCount(canonicalContent) === 0) {
        if (required)
          return insufficient(request.requestId, [
            issue(
              "required_object_over_budget",
              `budget.${object.metadata.id}`,
              "Required knowledge cannot be represented within the character budget",
            ),
          ]);
        omitted.push({
          objectId: object.metadata.id,
          category: "over_budget",
          policyRule: "max_canonical_characters",
          orderingPosition: index + 1,
          reason: "max_canonical_characters",
          characterImpact: originalCharacterCount,
        });
        continue;
      }
      truncationReason =
        request.budget.perObjectCharacterLimit !== undefined &&
        request.budget.perObjectCharacterLimit <= remainingCharacters
          ? "per_object_character_limit"
          : "max_canonical_characters";
    }

    const includedCharacterCount = canonicalCharacterCount(canonicalContent);
    const includedContentFingerprint = createCanonicalSha256Fingerprint(canonicalContent);
    const entry: KnowledgeContextIncludedObject = {
      objectId: object.metadata.id,
      objectType: object.metadata.objectType,
      lifecycleStatus: object.metadata.status,
      domain: object.metadata.domain,
      projectIds: knowledgeObjectProjectReferences(object)
        .filter((value, position, values) => values.indexOf(value) === position)
        .sort(compareStrings),
      canonicalContent,
      originalObjectFingerprint: descriptor.objectFingerprint,
      logicalSourceIdentifier: descriptor.sourcePath,
      sourceHash: descriptor.sourceHash,
      provenance: object.metadata.source,
      includedContentFingerprint,
      includedCharacterCount,
      selectionPosition: included.length + 1,
      selectionReason: selectionReason(object, request),
    };
    included.push(entry);
    usedCharacters += includedCharacterCount;
    if (truncationReason !== null) {
      truncations.push({
        objectId: object.metadata.id,
        originalCharacterCount,
        includedCharacterCount,
        boundary: includedCharacterCount,
        reason: truncationReason,
        originalObjectFingerprint: descriptor.objectFingerprint,
        includedContentFingerprint,
        logicalSourceIdentifier: descriptor.sourcePath,
      });
    }
  }

  if (
    selected.length > 0 &&
    included.length === 0 &&
    omitted.some((evidence) => evidence.category === "over_budget")
  ) {
    return insufficient(request.requestId, [
      issue(
        "context_over_budget",
        "budget",
        "Matching knowledge exists but none can be represented within the requested budget",
      ),
    ]);
  }

  if (included.length === 0 && request.budget.emptyContextBehavior === "fail") {
    return insufficient(request.requestId, [
      issue(
        "empty_context_disallowed",
        "budget.emptyContextBehavior",
        "The governed request does not permit an empty context",
      ),
    ]);
  }

  const requestFingerprint = createCanonicalSha256Fingerprint(request);
  const queryFingerprint = createCanonicalSha256Fingerprint(request.query);
  const queryResultFingerprint = createCanonicalSha256Fingerprint(queryResult);
  const integrity = bindings.integrity;
  const registration = bindings.registration;
  if (integrity.status !== "valid") throw new Error("Binding validation invariant failed");
  const unsigned = {
    schemaVersion: "1.0" as const,
    request,
    requestFingerprint,
    queryId: request.query.queryId,
    queryFingerprint,
    queryResultFingerprint,
    registryBinding: {
      registrySchemaVersion: integrity.schemaVersion,
      integrityFingerprint: integrity.integrityFingerprint,
      verifiedRecordCount: integrity.verifiedRecordCount,
      verifiedThroughSequence: integrity.verifiedThroughSequence,
      recoveredActiveSnapshotId: registration.snapshot.snapshotId,
    },
    snapshotBinding: {
      activeSnapshotId: registration.snapshot.snapshotId,
      activeContentFingerprint: registration.snapshot.contentFingerprint,
      activeManifestFingerprint: registration.manifestFingerprint,
      sourceManifestReference: registration.snapshot.sourceManifestReference,
      repositorySnapshotId: bindings.repositorySnapshot.snapshotId,
      repositoryContentFingerprint: bindings.repositorySnapshot.contentFingerprint,
    },
    assemblyPolicyVersion: request.assemblyPolicyVersion,
    budgetPolicy: request.budget,
    budgetUsage: {
      usedObjectCount: included.length,
      usedCanonicalCharacters: usedCharacters,
      perObject: included.map((entry) => ({
        objectId: entry.objectId,
        characterCount: entry.includedCharacterCount,
      })),
      characterCountingMethod: "unicode_code_points" as const,
    },
    included,
    excluded,
    omitted: omitted.sort(
      (left, right) =>
        left.orderingPosition - right.orderingPosition ||
        compareStrings(left.objectId, right.objectId),
    ),
    truncations,
    evidenceCounts: {
      included: included.length,
      excluded: excluded.length,
      omitted: omitted.length,
      truncated: truncations.length,
    },
    ...(request.evidenceTimestamp === undefined ? {} : { assembledAt: request.evidenceTimestamp }),
  };
  const identityInput = { ...unsigned };
  delete (identityInput as { assembledAt?: string }).assembledAt;
  const contextFingerprint = createKnowledgeContextFingerprint(identityInput);
  const contextPackage = KnowledgeContextPackageSchema.parse({
    ...unsigned,
    contextPackageId: `context-${contextFingerprint}`,
    contextFingerprint,
  });
  return deepFreeze(
    KnowledgeContextAssemblyResultSchema.parse({
      schemaVersion: "1.0",
      status: "assembled",
      package: contextPackage,
    }),
  );
}

function verificationIssue(
  code: KnowledgeContextVerificationResult["issues"][number]["code"],
  path: string,
  message: string,
) {
  return { code, path, message };
}

export interface VerifyKnowledgeContextPackageInput {
  readonly package: unknown;
  readonly candidateInputs: readonly unknown[];
  readonly bindings: VerifiedKnowledgeContextInputs;
  /** Trusted integrity and replay-derived active state for the exact historical registry prefix. */
  readonly historicalRegistryState?: {
    readonly integrity: RegistryIntegrityResult;
    readonly recovery: RegistryRecoveryResult;
  };
}

export function verifyKnowledgeContextPackage(
  input: VerifyKnowledgeContextPackageInput,
): KnowledgeContextVerificationResult {
  const parsed = KnowledgeContextPackageSchema.safeParse(input.package);
  if (!parsed.success) {
    return KnowledgeContextVerificationResultSchema.parse({
      schemaVersion: "1.0",
      status: "invalid",
      contextFingerprint: null,
      issues: [
        verificationIssue(
          "invalid_package",
          parsed.error.issues[0]?.path.join(".") || "package",
          parsed.error.issues[0]?.message ?? "Invalid context package",
        ),
      ],
    });
  }
  const contextPackage = parsed.data;
  const currentBindings = captureVerifiedBindings(input.bindings);
  const currentStateValid =
    currentBindings !== null &&
    currentBindings.integrity.status === "valid" &&
    currentBindings.recovery.status === "recovered" &&
    currentBindings.integrity.integrityFingerprint ===
      currentBindings.recovery.integrityFingerprint &&
    currentBindings.integrity.verifiedTransactionCount ===
      currentBindings.recovery.committedTransactionCount &&
    currentBindings.integrity.verifiedRecordCount ===
      currentBindings.recovery.committedRecordCount &&
    currentBindings.integrity.verifiedThroughSequence ===
      currentBindings.recovery.lastCommittedAuditSequence &&
    currentBindings.integrity.lastRecordFingerprint ===
      currentBindings.recovery.lastRecordFingerprint;
  const bindings =
    !currentStateValid || input.historicalRegistryState === undefined
      ? currentBindings
      : captureVerifiedBindings({
          ...currentBindings,
          integrity: input.historicalRegistryState.integrity,
          recovery: input.historicalRegistryState.recovery,
        });
  if (!currentStateValid || bindings === null) {
    return KnowledgeContextVerificationResultSchema.parse({
      schemaVersion: "1.0",
      status: "invalid",
      contextFingerprint: null,
      issues: [
        verificationIssue(
          "snapshot_binding_mismatch",
          "bindings.registration",
          "Trusted durable registration evidence is invalid",
        ),
      ],
    });
  }
  const issues: KnowledgeContextVerificationResult["issues"] = [];
  if (
    createCanonicalSha256Fingerprint(contextPackage.request) !== contextPackage.requestFingerprint
  )
    issues.push(
      verificationIssue(
        "request_fingerprint_mismatch",
        "requestFingerprint",
        "Request fingerprint does not verify",
      ),
    );
  if (
    createCanonicalSha256Fingerprint(contextPackage.request.query) !==
    contextPackage.queryFingerprint
  )
    issues.push(
      verificationIssue(
        "query_fingerprint_mismatch",
        "queryFingerprint",
        "Query fingerprint does not verify",
      ),
    );

  const bindingFailure = validateBindings(contextPackage.request.requestId, bindings);
  if (bindingFailure !== null)
    issues.push(
      verificationIssue(
        "snapshot_binding_mismatch",
        "bindings",
        "Trusted governed bindings do not verify",
      ),
    );
  if (
    bindings.integrity.status === "valid" &&
    (bindings.integrity.integrityFingerprint !==
      contextPackage.registryBinding.integrityFingerprint ||
      bindings.integrity.verifiedRecordCount !==
        contextPackage.registryBinding.verifiedRecordCount ||
      bindings.integrity.verifiedThroughSequence !==
        contextPackage.registryBinding.verifiedThroughSequence)
  )
    issues.push(
      verificationIssue(
        "registry_binding_mismatch",
        "registryBinding",
        "Registry binding differs from trusted integrity evidence",
      ),
    );
  if (
    bindings.registration.snapshot.snapshotId !== contextPackage.snapshotBinding.activeSnapshotId ||
    bindings.registration.snapshot.contentFingerprint !==
      contextPackage.snapshotBinding.activeContentFingerprint ||
    bindings.registration.manifestFingerprint !==
      contextPackage.snapshotBinding.activeManifestFingerprint ||
    bindings.repositorySnapshot.snapshotId !==
      contextPackage.snapshotBinding.repositorySnapshotId ||
    bindings.repositorySnapshot.contentFingerprint !==
      contextPackage.snapshotBinding.repositoryContentFingerprint
  )
    issues.push(
      verificationIssue(
        "snapshot_binding_mismatch",
        "snapshotBinding",
        "Snapshot binding differs from trusted active state",
      ),
    );

  const candidates = prepareCandidates(input.candidateInputs);
  if (candidates.conflictId !== null)
    issues.push(
      verificationIssue(
        "object_fingerprint_mismatch",
        `candidates.${candidates.conflictId}`,
        "Trusted candidates contain a conflicting identity",
      ),
    );
  const byId = new Map(candidates.candidates.map((object) => [object.metadata.id, object]));
  const descriptors = new Map(
    bindings.repositorySnapshot.objects.map((value) => [value.objectId, value]),
  );
  if (candidates.conflictId === null) {
    const trustedQueryResult = queryKnowledgeObjects(
      contextPackage.request.query,
      candidates.candidates,
    );
    if (
      createCanonicalSha256Fingerprint(trustedQueryResult) !== contextPackage.queryResultFingerprint
    )
      issues.push(
        verificationIssue(
          "query_result_fingerprint_mismatch",
          "queryResultFingerprint",
          "Query-result fingerprint does not reproduce from trusted candidates",
        ),
      );
  }
  for (const entry of contextPackage.included) {
    const object = byId.get(entry.objectId);
    const descriptor = descriptors.get(entry.objectId);
    if (
      createCanonicalSha256Fingerprint(entry.canonicalContent) !== entry.includedContentFingerprint
    )
      issues.push(
        verificationIssue(
          "included_content_fingerprint_mismatch",
          `included.${entry.objectId}`,
          "Included content fingerprint does not verify",
        ),
      );
    if (
      object === undefined ||
      descriptor === undefined ||
      createCanonicalSha256Fingerprint(object) !== entry.originalObjectFingerprint ||
      descriptor.objectFingerprint !== entry.originalObjectFingerprint
    )
      issues.push(
        verificationIssue(
          "object_fingerprint_mismatch",
          `included.${entry.objectId}.originalObjectFingerprint`,
          "Original object fingerprint does not verify",
        ),
      );
    if (
      object !== undefined &&
      (createCanonicalSha256Fingerprint(object.metadata.source) !==
        createCanonicalSha256Fingerprint(entry.provenance) ||
        descriptor?.sourceHash !== entry.sourceHash ||
        descriptor.sourcePath !== entry.logicalSourceIdentifier)
    )
      issues.push(
        verificationIssue(
          "provenance_mismatch",
          `included.${entry.objectId}.provenance`,
          "Included provenance does not match trusted knowledge",
        ),
      );
  }

  const reproduced = assembleKnowledgeContextFromVerifiedInputs({
    request: contextPackage.request,
    candidateInputs: input.candidateInputs,
    bindings,
  });
  if (reproduced.status !== "assembled") {
    issues.push(
      verificationIssue(
        "evidence_mismatch",
        "package",
        "Trusted inputs do not reproduce an assembled package",
      ),
    );
  } else {
    if (
      createCanonicalSha256Fingerprint(reproduced.package.included) !==
      createCanonicalSha256Fingerprint(contextPackage.included)
    )
      issues.push(
        verificationIssue(
          "included_content_fingerprint_mismatch",
          "included",
          "Included entries do not reproduce from trusted candidates",
        ),
      );
    if (
      createCanonicalSha256Fingerprint(
        reproduced.package.included.map(({ objectId, selectionPosition, selectionReason }) => ({
          objectId,
          selectionPosition,
          selectionReason,
        })),
      ) !==
      createCanonicalSha256Fingerprint(
        contextPackage.included.map(({ objectId, selectionPosition, selectionReason }) => ({
          objectId,
          selectionPosition,
          selectionReason,
        })),
      )
    )
      issues.push(
        verificationIssue(
          "ordering_mismatch",
          "included",
          "Included order or selection evidence does not reproduce",
        ),
      );
    if (
      createCanonicalSha256Fingerprint(reproduced.package.budgetUsage) !==
      createCanonicalSha256Fingerprint(contextPackage.budgetUsage)
    )
      issues.push(
        verificationIssue("budget_mismatch", "budgetUsage", "Budget arithmetic does not reproduce"),
      );
    if (
      createCanonicalSha256Fingerprint({
        excluded: reproduced.package.excluded,
        omitted: reproduced.package.omitted,
        truncations: reproduced.package.truncations,
        counts: reproduced.package.evidenceCounts,
      }) !==
      createCanonicalSha256Fingerprint({
        excluded: contextPackage.excluded,
        omitted: contextPackage.omitted,
        truncations: contextPackage.truncations,
        counts: contextPackage.evidenceCounts,
      })
    )
      issues.push(
        verificationIssue(
          "evidence_mismatch",
          "evidence",
          "Exclusion, omission, truncation, or count evidence does not reproduce",
        ),
      );
  }
  const {
    contextPackageId: _id,
    contextFingerprint: _fingerprint,
    assembledAt: _assembledAt,
    ...identity
  } = contextPackage;
  void _id;
  void _fingerprint;
  void _assembledAt;
  const expectedFingerprint = createKnowledgeContextFingerprint(identity);
  if (expectedFingerprint !== contextPackage.contextFingerprint)
    issues.push(
      verificationIssue(
        "context_fingerprint_mismatch",
        "contextFingerprint",
        "Context fingerprint does not verify",
      ),
    );
  return deepFreeze(
    KnowledgeContextVerificationResultSchema.parse({
      schemaVersion: "1.0",
      status: issues.length === 0 ? "valid" : "invalid",
      contextFingerprint: issues.length === 0 ? expectedFingerprint : null,
      issues,
    }),
  );
}
