import type {
  ActivationAuditRecord,
  ContextDeliveryPolicyDecisionEvidence,
  DurableSnapshotRegistrationRecord,
  GovernedContextDeliveryRequest,
  KnowledgeContextPackage,
  KnowledgeContextRequest,
  KnowledgeObject,
  KnowledgeRepository,
  RegistryIntegrityResult,
  RegistryRecoveryResult,
} from "@founderos/knowledge-schema";

import {
  BoundedContextDeliveryIdempotencyStore,
  createContextConsumerDescriptor,
  createContextDeliveryPolicyDecisionEvidence,
  createGovernedContextDeliveryRequest,
  createKnowledgeRepositorySnapshot,
  type DeliverGovernedKnowledgeContextInput,
  type GovernedHistoricalSnapshotRegistry,
  type VerifiedKnowledgeContextInputs,
} from "../src/index.js";
import { createCanonicalSha256Fingerprint } from "../src/domain/canonical-fingerprint.js";
import { assembleKnowledgeContextFromVerifiedInputs } from "../src/domain/knowledge-context.js";
import {
  appendAdapterRegistration,
  createAdapterChainBuilder,
} from "./durable-registry-adapter-fixtures.js";
import { generalKnowledgeObject } from "./snapshot-lifecycle-fixtures.js";

export const DELIVERY_TIME = "2026-07-29T01:00:00.000Z";
export const PACKAGE_TIME = "2026-07-29T00:00:00.000Z";

function contextRequest(packageMode: "empty" | "normal" | "truncated"): KnowledgeContextRequest {
  return {
    schemaVersion: "1.0",
    requestId: "context-request-m11",
    purpose: "Assemble Milestone 11 delivery context",
    consumer: { consumerId: "context-service", consumerType: "service" },
    query: {
      schemaVersion: "1.0",
      queryId: "context-query-m11",
      context: { consumerId: "context-service", consumerType: "service", constraints: {} },
      filters:
        packageMode === "empty"
          ? { tagMatch: "all", tags: ["no-such-delivery-tag"] }
          : { tagMatch: "all" },
    },
    requiredObjectIds: [],
    requiredObjectTypes: [],
    preferredObjectTypes: [],
    scope: {},
    assemblyPolicyVersion: "1.0",
    budget: {
      maxObjectCount: 4,
      maxCanonicalCharacters: packageMode === "truncated" ? 500 : 100_000,
      allowTruncation: packageMode === "truncated",
      requiredObjectFailureBehavior: "fail",
      emptyContextBehavior: packageMode === "empty" ? "allow" : "fail",
    },
    reason: "Create deterministic governed context",
    evidenceTimestamp: PACKAGE_TIME,
  };
}

function activationRecord(
  registration: DurableSnapshotRegistrationRecord,
  sequence: number,
  previousActiveSnapshotId: string | null,
): ActivationAuditRecord {
  return {
    schemaVersion: "1.0",
    recordType: "activation_audit",
    activationId: `activation-${sequence}`,
    transactionId: `transaction-activation-${sequence}`,
    sequence,
    previousRecordFingerprint: registration.recordFingerprint,
    candidateSnapshotId: registration.snapshot.snapshotId,
    candidateSnapshotFingerprint: registration.snapshot.contentFingerprint,
    previousActiveSnapshotId,
    previousActiveSnapshotFingerprint:
      previousActiveSnapshotId === null ? null : createCanonicalSha256Fingerprint("previous"),
    expectedActiveSnapshotId: previousActiveSnapshotId,
    changeSetType: previousActiveSnapshotId === null ? "bootstrap" : "comparison",
    changeSetId: `change-bootstrap-to-${registration.snapshot.snapshotId}`,
    changeSetFingerprint: createCanonicalSha256Fingerprint(`change-${sequence}`),
    approvalDecisionId: `decision-${sequence}`,
    approvalDecisionFingerprint: createCanonicalSha256Fingerprint(`decision-${sequence}`),
    candidateActivationTransitionId: `transition-${sequence}`,
    previousActiveSupersessionTransitionId: null,
    resultingActiveSnapshotId: registration.snapshot.snapshotId,
    actorId: "fixture-actor",
    actorType: "human",
    reason: "Activate fixture",
    activatedAt: PACKAGE_TIME,
    recordFingerprint: createCanonicalSha256Fingerprint(`activation-${sequence}`),
  } as ActivationAuditRecord;
}

export interface ContextDeliveryFixture {
  readonly bindings: VerifiedKnowledgeContextInputs;
  readonly input: DeliverGovernedKnowledgeContextInput;
  readonly contextPackage: KnowledgeContextPackage;
  readonly objects: readonly KnowledgeObject[];
  readonly policy: ContextDeliveryPolicyDecisionEvidence;
  readonly registration: DurableSnapshotRegistrationRecord;
  readonly request: GovernedContextDeliveryRequest;
  readonly currentActivationSequence: number;
}

export function createContextDeliveryFixture(
  options: {
    readonly activeSnapshotId?: string;
    readonly consumerCapabilities?: Partial<
      GovernedContextDeliveryRequest["consumer"]["capabilities"]
    >;
    readonly consumerType?: GovernedContextDeliveryRequest["consumer"]["consumerType"];
    readonly evaluatedAt?: string;
    readonly freshnessPolicy?: Partial<GovernedContextDeliveryRequest["freshnessPolicy"]>;
    readonly idempotencyStore?: BoundedContextDeliveryIdempotencyStore;
    readonly policyOutcome?: ContextDeliveryPolicyDecisionEvidence["outcome"];
    readonly policyDecidedAt?: string;
    readonly policyExpiresAt?: string;
    readonly replayMode?: GovernedContextDeliveryRequest["replayPolicy"]["mode"];
    readonly packageMode?: "empty" | "normal" | "truncated";
  } = {},
): ContextDeliveryFixture {
  const objects = [
    generalKnowledgeObject("delivery-architecture", "Governed architecture"),
    generalKnowledgeObject("delivery-governance", "Governed policy"),
  ];
  const repositorySnapshot = createKnowledgeRepositorySnapshot({
    corpus: {
      schemaVersion: "1.0",
      corpusId: "founderos-priority-1",
      corpusVersion: "delivery-v1",
      sourceManifestReference: "knowledge/migration-manifest.yaml",
      source: {
        schemaVersion: "1.0",
        sourceId: "delivery-fixture",
        sourceType: "knowledge_corpus",
        provenance: {
          sourceType: "migration_manifest",
          sourceReference: "knowledge/migration-manifest.yaml",
        },
      },
    },
    creation: { createdAt: "2026-07-28T00:00:00.000Z", createdBy: "delivery-fixture" },
    documents: objects.map((object) => {
      const sourceHash = createCanonicalSha256Fingerprint(`source:${object.metadata.id}`);
      return {
        id: object.metadata.id,
        objectType: object.metadata.objectType,
        sourcePath: object.metadata.source.sourceReference!,
        destinationPath: `knowledge/${object.metadata.id}.md`,
        expectedSourceHash: sourceHash,
        actualSourceHash: sourceHash,
        migrationStatus: "ready" as const,
        reviewStatus: "approved" as const,
        byteLength: 1,
        object,
        status: "accepted" as const,
      };
    }),
  });
  const chain = createAdapterChainBuilder();
  const registrationEnvelope = appendAdapterRegistration(chain, repositorySnapshot, "delivery");
  const registration = registrationEnvelope.records[0] as DurableSnapshotRegistrationRecord;
  const packageActivation = activationRecord(registration, 3, null);
  const historicalIntegrityFingerprint = createCanonicalSha256Fingerprint(
    "delivery-registry-through-activation",
  );
  const historicalIntegrity: RegistryIntegrityResult = {
    schemaVersion: "1.0",
    status: "valid",
    integrityFingerprint: historicalIntegrityFingerprint,
    verifiedTransactionCount: 2,
    verifiedRecordCount: 3,
    verifiedThroughSequence: 3,
    lastRecordFingerprint: packageActivation.recordFingerprint,
    derivedIndexStatus: "not_checked",
    derivedIndexIssues: [],
    issues: [],
  };
  const activeSnapshotId = options.activeSnapshotId ?? repositorySnapshot.snapshotId;
  const historicalRecovery: RegistryRecoveryResult = {
    schemaVersion: "1.0",
    status: "recovered",
    activeSnapshotId: repositorySnapshot.snapshotId,
    registeredSnapshotCount: 1,
    lifecycleTransitionCount: 1,
    decisionCount: 0,
    activationCount: 1,
    committedTransactionCount: 2,
    committedRecordCount: 3,
    lastCommittedAuditSequence: 3,
    lastRecordFingerprint: packageActivation.recordFingerprint,
    derivedIndexStatus: "not_checked",
    derivedIndexIssues: [],
    integrityFingerprint: historicalIntegrityFingerprint,
    errors: [],
  };
  const context = assembleKnowledgeContextFromVerifiedInputs({
    request: contextRequest(options.packageMode ?? "normal"),
    candidateInputs: objects,
    bindings: {
      registration,
      integrity: historicalIntegrity,
      recovery: historicalRecovery,
      repositorySnapshot,
    },
  });
  if (context.status !== "assembled")
    throw new Error(`Fixture context assembly failed: ${JSON.stringify(context.issues)}`);
  const contextPackage = context.package;
  const replayMode = options.replayMode ?? "repeatable-identical";
  const consumer = createContextConsumerDescriptor({
    schemaVersion: "1.0",
    consumerId: "consumer-m11",
    consumerType:
      options.consumerType ??
      (replayMode === "evaluation-only" ? "evaluation-harness" : "internal-service"),
    displayName: "Milestone 11 Consumer",
    owningSystem: "knowledge/consumers/m11",
    purpose: "Consume governed FounderOS knowledge",
    capabilities: {
      acceptedContextPackageVersions: ["1.0"],
      acceptedAssemblyPolicyVersions: ["1.0"],
      maxObjectCount: 10,
      maxCanonicalCharacters: 1_000_000,
      supportsProvenance: true,
      supportsReplay: true,
      supportsReceipts: true,
      acceptsTruncatedContent: true,
      acceptsEmptyPackages: true,
      ...options.consumerCapabilities,
    },
    policySubjectReference: "policy/subjects/consumer-m11",
  });
  const freshnessPolicy = {
    schemaVersion: "1.0" as const,
    expiresAt: "2026-07-30T00:00:00.000Z",
    maxAgeSeconds: 86_400,
    invalidateOnNewerActiveSnapshot: false,
    allowHistoricalReplay: activeSnapshotId !== repositorySnapshot.snapshotId,
    ...options.freshnessPolicy,
  };
  const policyInput = {
    schemaVersion: "1.0" as const,
    subjectReference: consumer.policySubjectReference,
    consumerReference: consumer.consumerId,
    contextPackageReference: {
      contextPackageId: contextPackage.contextPackageId,
      contextFingerprint: contextPackage.contextFingerprint,
    },
    activeSnapshotReference: {
      snapshotId: repositorySnapshot.snapshotId,
      activationSequence: packageActivation.sequence,
    },
    intendedPurpose: "Consume governed FounderOS knowledge",
    projectScope: ["FounderOS"],
    domainScope: ["FounderOS"],
    dataClassification: "internal" as const,
    requestedOperation: "context_delivery" as const,
    requestTimestamp: PACKAGE_TIME,
  };
  const request = createGovernedContextDeliveryRequest({
    schemaVersion: "1.0",
    deliveryRequestId: "delivery-request-m11",
    contextPackageId: contextPackage.contextPackageId,
    contextPackageFingerprint: contextPackage.contextFingerprint,
    consumer,
    consumerDescriptorFingerprint: consumer.descriptorFingerprint,
    purpose: policyInput.intendedPurpose,
    capabilityRequirements: {
      requireProvenance: true,
      requireReplay: replayMode !== "single-delivery",
      requireReceipt: true,
    },
    policyInput,
    freshnessPolicy,
    idempotencyKey: "delivery:key:m11:0001",
    replayPolicy: { schemaVersion: "1.0", mode: replayMode },
    requestActor: { actorId: "delivery-test", actorType: "service" },
    reason: "Exercise the governed delivery boundary",
    requestedAt: PACKAGE_TIME,
  });
  const policyOutcome = options.policyOutcome ?? "allowed";
  const outcomeReason = {
    allowed: "policy_allowed",
    denied: "policy_denied",
    "review-required": "policy_review_required",
    "not-evaluated": "policy_not_evaluated",
  } as const;
  const policy = createContextDeliveryPolicyDecisionEvidence({
    schemaVersion: "1.0",
    decisionId: "policy-decision-m11",
    decisionVersion: "1.0",
    inputFingerprint: createCanonicalSha256Fingerprint(policyInput),
    deliveryRequestId: request.deliveryRequestId,
    deliveryRequestFingerprint: request.requestFingerprint,
    outcome: policyOutcome,
    contextPackageId: contextPackage.contextPackageId,
    contextPackageFingerprint: contextPackage.contextFingerprint,
    consumerId: consumer.consumerId,
    consumerDescriptorFingerprint: consumer.descriptorFingerprint,
    intendedPurpose: request.purpose,
    decisionAuthorityReference: "policy/decisions/m11",
    reasonCodes: [outcomeReason[policyOutcome]],
    decidedAt: options.policyDecidedAt ?? PACKAGE_TIME,
    expiresAt: options.policyExpiresAt ?? "2026-07-30T00:00:00.000Z",
  });
  const newerActivation =
    activeSnapshotId === repositorySnapshot.snapshotId
      ? null
      : ({
          ...activationRecord(registration, 6, repositorySnapshot.snapshotId),
          candidateSnapshotId: activeSnapshotId,
          resultingActiveSnapshotId: activeSnapshotId,
        } as ActivationAuditRecord);
  const activationHistory = [
    packageActivation,
    ...(newerActivation === null ? [] : [newerActivation]),
  ];
  const currentIntegrityFingerprint =
    newerActivation === null
      ? historicalIntegrityFingerprint
      : createCanonicalSha256Fingerprint("delivery-registry-current");
  const integrity: RegistryIntegrityResult =
    newerActivation === null
      ? historicalIntegrity
      : {
          ...historicalIntegrity,
          integrityFingerprint: currentIntegrityFingerprint,
          verifiedTransactionCount: 4,
          verifiedRecordCount: 6,
          verifiedThroughSequence: 6,
          lastRecordFingerprint: newerActivation.recordFingerprint,
        };
  const recovery: RegistryRecoveryResult =
    newerActivation === null
      ? historicalRecovery
      : {
          ...historicalRecovery,
          activeSnapshotId,
          registeredSnapshotCount: 2,
          lifecycleTransitionCount: 2,
          activationCount: 2,
          committedTransactionCount: 4,
          committedRecordCount: 6,
          lastCommittedAuditSequence: 6,
          lastRecordFingerprint: newerActivation.recordFingerprint,
          integrityFingerprint: currentIntegrityFingerprint,
        };
  const registry = {
    verifyIntegrity: async () => integrity,
    verifyIntegrityAtSequence: async (sequence: number) =>
      sequence === historicalIntegrity.verifiedThroughSequence
        ? historicalIntegrity
        : ({
            ...historicalIntegrity,
            status: "invalid",
            integrityFingerprint: null,
            issues: [
              {
                code: "integrity_sequence_not_committed_boundary",
                message: "Sequence is not a committed boundary",
                transactionId: null,
                recordId: null,
                sequence: null,
              },
            ],
          } as RegistryIntegrityResult),
    recoverAtSequence: async (sequence: number) =>
      sequence === historicalIntegrity.verifiedThroughSequence
        ? historicalRecovery
        : ({
            ...historicalRecovery,
            status: "failed",
            activeSnapshotId: null,
            integrityFingerprint: null,
            errors: [
              {
                code: "integrity_sequence_not_committed_boundary",
                message: "Sequence is not a committed boundary",
                transactionId: null,
                recordId: null,
                sequence: null,
              },
            ],
          } as RegistryRecoveryResult),
    recover: async () => recovery,
    getSnapshot: async (snapshotId: string) =>
      snapshotId === repositorySnapshot.snapshotId ? registration : null,
    getActivationHistory: async () => activationHistory,
  } as unknown as GovernedHistoricalSnapshotRegistry;
  const repository = {
    getCandidates: async () => structuredClone(objects),
  } as unknown as KnowledgeRepository;
  return {
    bindings: {
      registration,
      integrity: historicalIntegrity,
      recovery: historicalRecovery,
      repositorySnapshot,
    },
    objects,
    registration,
    contextPackage,
    request,
    currentActivationSequence:
      activeSnapshotId === repositorySnapshot.snapshotId
        ? packageActivation.sequence
        : newerActivation!.sequence,
    policy,
    input: {
      request,
      contextPackage,
      policyDecisionEvidence: policy,
      registry,
      repository,
      repositorySnapshot,
      idempotencyStore: options.idempotencyStore ?? new BoundedContextDeliveryIdempotencyStore(16),
      evaluatedAt: options.evaluatedAt ?? DELIVERY_TIME,
    },
  };
}
