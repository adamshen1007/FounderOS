import {
  ContextDeliveryPolicyDecisionEvidenceSchema,
  findDurableCanonicalJsonIssue,
  GovernedContextDeliveryRequestSchema,
  GovernedContextDeliveryResultSchema,
  KnowledgeContextPackageSchema,
  RegistryIntegrityResultSchema,
  RegistryRecoveryResultSchema,
  type GovernedContextDeliveryRequest,
  type GovernedContextDeliveryResult,
  type KnowledgeRepository,
  type KnowledgeRepositorySnapshot,
  type ContextDeliveryReplayEvidence,
} from "@founderos/knowledge-schema";

import type { GovernedHistoricalSnapshotRegistry } from "./manage-governed-durable-snapshot-registry.js";
import {
  createContextConsumerAcknowledgment,
  createContextDeliveryAttemptEvidence,
  createContextDeliveryReceipt,
  createContextDeliveryReplayEvidence,
  createGovernedContextDeliveryEnvelope,
  createGovernedContextDeliveryRejected,
  evaluateContextDeliveryFreshness,
  findUnsafeContextDeliveryContent,
  matchContextConsumerCapabilities,
  verifyContextDeliveryPolicyDecisionEvidence,
  verifyContextDeliveryReceipt,
  verifyContextConsumerDescriptor,
  verifyGovernedContextDeliveryEnvelope,
  verifyGovernedContextDeliveryRequest,
} from "../domain/context-delivery.js";
import { createCanonicalSha256Fingerprint } from "../domain/canonical-fingerprint.js";
import { verifyKnowledgeContextPackage } from "../domain/knowledge-context.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";

interface IdempotencyEntry {
  readonly requestFingerprint: string;
  readonly result: GovernedContextDeliveryResult;
}

interface IdempotencyState {
  readonly capacity: number;
  readonly entries: Map<string, IdempotencyEntry>;
  readonly replayEvidence: Map<string, ContextDeliveryReplayEvidence>;
  deliverySequence: number;
}

const IDEMPOTENCY_STATES = new WeakMap<BoundedContextDeliveryIdempotencyStore, IdempotencyState>();

/**
 * Replaceable Milestone 11 proof store. Entries use deterministic FIFO eviction
 * and the caller selects an explicit positive retention bound.
 */
export class BoundedContextDeliveryIdempotencyStore {
  public constructor(capacity: number) {
    if (!Number.isSafeInteger(capacity) || capacity <= 0)
      throw new TypeError("Idempotency retention capacity must be a positive safe integer");
    IDEMPOTENCY_STATES.set(this, {
      capacity,
      entries: new Map(),
      replayEvidence: new Map(),
      deliverySequence: 0,
    });
  }

  public get capacity(): number {
    return idempotencyState(this).capacity;
  }

  public get size(): number {
    return idempotencyState(this).entries.size;
  }

  public inspect(idempotencyKey: string): IdempotencyEntry | null {
    const entry = idempotencyState(this).entries.get(idempotencyKey);
    return entry === undefined ? null : deepFreeze(structuredClone(entry));
  }

  public inspectReplayEvidence(idempotencyKey: string): ContextDeliveryReplayEvidence | null {
    const evidence = idempotencyState(this).replayEvidence.get(idempotencyKey);
    return evidence === undefined ? null : deepFreeze(structuredClone(evidence));
  }
}

function idempotencyState(store: BoundedContextDeliveryIdempotencyStore): IdempotencyState {
  const state = IDEMPOTENCY_STATES.get(store);
  if (state === undefined) throw new TypeError("Invalid bounded idempotency store instance");
  return state;
}

function nextDeliverySequence(store: BoundedContextDeliveryIdempotencyStore): number {
  const state = idempotencyState(store);
  if (state.deliverySequence === Number.MAX_SAFE_INTEGER)
    throw new RangeError("Delivery sequence exhausted");
  state.deliverySequence += 1;
  return state.deliverySequence;
}

function inspectDelivery(
  store: BoundedContextDeliveryIdempotencyStore,
  idempotencyKey: string,
): IdempotencyEntry | null {
  const entry = idempotencyState(store).entries.get(idempotencyKey);
  return entry === undefined ? null : deepFreeze(structuredClone(entry));
}

function rememberDelivery(
  store: BoundedContextDeliveryIdempotencyStore,
  idempotencyKey: string,
  requestFingerprint: string,
  result: GovernedContextDeliveryResult,
): void {
  const state = idempotencyState(store);
  if (!state.entries.has(idempotencyKey) && state.entries.size >= state.capacity) {
    const oldestKey = state.entries.keys().next().value as string | undefined;
    if (oldestKey !== undefined) state.entries.delete(oldestKey);
    if (oldestKey !== undefined) state.replayEvidence.delete(oldestKey);
  }
  state.entries.set(
    idempotencyKey,
    deepFreeze({
      requestFingerprint,
      result: structuredClone(GovernedContextDeliveryResultSchema.parse(result)),
    }),
  );
}

export interface DeliverGovernedKnowledgeContextInput {
  readonly request: unknown;
  readonly contextPackage: unknown;
  readonly policyDecisionEvidence: unknown;
  readonly registry: GovernedHistoricalSnapshotRegistry;
  readonly repository: KnowledgeRepository;
  readonly repositorySnapshot: KnowledgeRepositorySnapshot;
  readonly idempotencyStore: BoundedContextDeliveryIdempotencyStore;
  readonly evaluatedAt: string;
}

const DELIVERY_INPUT_FIELDS = [
  "request",
  "contextPackage",
  "policyDecisionEvidence",
  "registry",
  "repository",
  "repositorySnapshot",
  "idempotencyStore",
  "evaluatedAt",
] as const;

function captureDeliveryInput(input: unknown): DeliverGovernedKnowledgeContextInput {
  if (
    input === null ||
    typeof input !== "object" ||
    (Object.getPrototypeOf(input) !== Object.prototype && Object.getPrototypeOf(input) !== null)
  )
    throw new TypeError("Governed delivery input must be a plain object");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (
    keys.some((key) => typeof key !== "string" || !DELIVERY_INPUT_FIELDS.includes(key as never)) ||
    DELIVERY_INPUT_FIELDS.some((field) => !Object.hasOwn(descriptors, field))
  )
    throw new TypeError("Governed delivery input fields are incomplete or unsupported");
  const captured = Object.create(null) as Record<string, unknown>;
  for (const field of DELIVERY_INPUT_FIELDS) {
    const descriptor = descriptors[field]!;
    if (
      descriptor.enumerable !== true ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    )
      throw new TypeError(`Governed delivery input ${field} must be an enumerable data property`);
    captured[field] = descriptor.value;
  }
  return captured as unknown as DeliverGovernedKnowledgeContextInput;
}

function rejected(
  evaluatedAt: string,
  status: Parameters<typeof createContextDeliveryAttemptEvidence>[0]["deliveryStatus"],
  code: Parameters<typeof createContextDeliveryAttemptEvidence>[0]["issues"][number]["code"],
  path: string,
  message: string,
  request?: GovernedContextDeliveryRequest,
): GovernedContextDeliveryResult {
  return rejectedWithIssues(evaluatedAt, status, [{ code, path, message }], request);
}

function rejectedWithIssues(
  evaluatedAt: string,
  status: Parameters<typeof createContextDeliveryAttemptEvidence>[0]["deliveryStatus"],
  issues: Parameters<typeof createContextDeliveryAttemptEvidence>[0]["issues"],
  request?: GovernedContextDeliveryRequest,
): GovernedContextDeliveryResult {
  return createGovernedContextDeliveryRejected(
    createContextDeliveryAttemptEvidence({
      deliveryRequestId: request?.deliveryRequestId ?? null,
      contextPackageId: request?.contextPackageId ?? null,
      consumerId: request?.consumer.consumerId ?? null,
      evaluatedAt,
      deliveryStatus: status,
      issues,
    }),
  );
}

function firstVerificationMessage(
  result: ReturnType<typeof verifyGovernedContextDeliveryRequest>,
): string {
  return result.issues[0]?.message ?? "Artifact verification failed";
}

/**
 * The only public delivery operation. It obtains candidates from the repository,
 * independently verifies the exact package and durable bindings, then enforces
 * capability, authorization evidence, freshness, replay, and receipt controls.
 */
export async function deliverGovernedKnowledgeContext(
  rawInput: DeliverGovernedKnowledgeContextInput,
): Promise<GovernedContextDeliveryResult> {
  let input: DeliverGovernedKnowledgeContextInput;
  let verifiedRequest: GovernedContextDeliveryRequest | undefined;
  try {
    input = captureDeliveryInput(rawInput);
  } catch {
    return rejected(
      "1970-01-01T00:00:00.000Z",
      "integrity-failure",
      "invalid_delivery_request",
      "input",
      "Governed delivery input must contain only enumerable data properties",
    );
  }
  let evaluatedAt: string;
  try {
    evaluatedAt = new Date(input.evaluatedAt).toISOString();
    if (evaluatedAt !== input.evaluatedAt)
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "freshness_invalid",
        "evaluatedAt",
        "Evaluation timestamp must use canonical ISO-8601 form",
      );
  } catch {
    return rejected(
      "1970-01-01T00:00:00.000Z",
      "integrity-failure",
      "freshness_invalid",
      "evaluatedAt",
      "Evaluation timestamp is invalid",
    );
  }

  try {
    try {
      idempotencyState(input.idempotencyStore);
    } catch {
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "invalid_delivery_request",
        "idempotencyStore",
        "A valid bounded idempotency store is required",
      );
    }

    const requestVerification = verifyGovernedContextDeliveryRequest(input.request);
    if (requestVerification.status !== "valid")
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "invalid_delivery_request",
        "request",
        firstVerificationMessage(requestVerification),
      );
    const request = GovernedContextDeliveryRequestSchema.parse(input.request);
    verifiedRequest = request;
    const descriptorVerification = verifyContextConsumerDescriptor(request.consumer);
    if (descriptorVerification.status !== "valid")
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "invalid_consumer_descriptor",
        "request.consumer",
        firstVerificationMessage(descriptorVerification),
        request,
      );

    const unsafePackageInput = findDurableCanonicalJsonIssue(input.contextPackage);
    const unsafeRepositorySnapshot = findDurableCanonicalJsonIssue(input.repositorySnapshot);
    const privatePackageContent =
      unsafePackageInput === null ? findUnsafeContextDeliveryContent(input.contextPackage) : null;
    const privateRepositoryContent =
      unsafeRepositorySnapshot === null
        ? findUnsafeContextDeliveryContent(input.repositorySnapshot)
        : null;
    if (
      unsafePackageInput !== null ||
      unsafeRepositorySnapshot !== null ||
      privatePackageContent !== null ||
      privateRepositoryContent !== null
    )
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "unsafe_delivery_content",
        unsafePackageInput !== null || privatePackageContent !== null
          ? "contextPackage"
          : "repositorySnapshot",
        "Delivery artifacts must be finite accessor-safe canonical data",
        request,
      );
    const parsedPackage = KnowledgeContextPackageSchema.safeParse(input.contextPackage);
    if (!parsedPackage.success)
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "context_package_integrity_failure",
        "contextPackage",
        parsedPackage.error.issues[0]?.message ?? "Context Package is invalid",
        request,
      );
    const contextPackage = parsedPackage.data;
    if (
      request.contextPackageId !== contextPackage.contextPackageId ||
      request.contextPackageFingerprint !== contextPackage.contextFingerprint
    )
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "context_package_binding_mismatch",
        "request.contextPackageId",
        "Delivery Request does not bind the supplied Context Package",
        request,
      );

    const policyVerification = verifyContextDeliveryPolicyDecisionEvidence({
      evidence: input.policyDecisionEvidence,
      request,
    });
    if (policyVerification.status !== "valid")
      return rejected(
        evaluatedAt,
        "policy-denied",
        "policy_evidence_invalid",
        "policyDecisionEvidence",
        firstVerificationMessage(policyVerification),
        request,
      );
    const policy = ContextDeliveryPolicyDecisionEvidenceSchema.parse(input.policyDecisionEvidence);
    if (
      policy.inputFingerprint !== createCanonicalSha256Fingerprint(request.policyInput) ||
      policy.deliveryRequestId !== request.deliveryRequestId ||
      policy.deliveryRequestFingerprint !== request.requestFingerprint ||
      policy.contextPackageId !== request.contextPackageId ||
      policy.contextPackageFingerprint !== request.contextPackageFingerprint ||
      policy.consumerId !== request.consumer.consumerId ||
      policy.consumerDescriptorFingerprint !== request.consumerDescriptorFingerprint ||
      policy.intendedPurpose !== request.purpose
    )
      return rejected(
        evaluatedAt,
        "policy-denied",
        "policy_evidence_invalid",
        "policyDecisionEvidence",
        "Policy decision evidence does not bind the delivery request",
        request,
      );
    if (policy.outcome !== "allowed") {
      const outcomeCode = {
        denied: "policy_denied",
        "review-required": "policy_review_required",
        "not-evaluated": "policy_not_evaluated",
      } as const;
      return rejected(
        evaluatedAt,
        "policy-denied",
        outcomeCode[policy.outcome],
        "policyDecisionEvidence.outcome",
        `Policy outcome ${policy.outcome} does not authorize delivery`,
        request,
      );
    }

    const integrity = RegistryIntegrityResultSchema.parse(await input.registry.verifyIntegrity());
    const recovery = RegistryRecoveryResultSchema.parse(await input.registry.recover());
    if (integrity.status !== "valid" || recovery.status !== "recovered")
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "context_package_integrity_failure",
        "registry",
        "Durable registry integrity or recovery failed",
        request,
      );
    if (recovery.activeSnapshotId === null)
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "context_package_integrity_failure",
        "registry.activeSnapshotId",
        "No durably active snapshot exists",
        request,
      );
    const registration = await input.registry.getSnapshot(
      contextPackage.snapshotBinding.activeSnapshotId,
    );
    if (registration === null)
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "context_package_integrity_failure",
        "registry.registration",
        "The Context Package snapshot is not durably registered",
        request,
      );
    const activationHistory = await input.registry.getActivationHistory();
    const packageActivation = activationHistory.find(
      (record) =>
        record.candidateSnapshotId === registration.snapshot.snapshotId &&
        record.sequence === request.policyInput.activeSnapshotReference.activationSequence,
    );
    const currentActivation = activationHistory
      .filter((record) => record.resultingActiveSnapshotId === recovery.activeSnapshotId)
      .sort((left, right) => right.sequence - left.sequence)[0];
    if (
      packageActivation === undefined ||
      currentActivation === undefined ||
      request.policyInput.activeSnapshotReference.snapshotId !== registration.snapshot.snapshotId ||
      packageActivation.candidateSnapshotFingerprint !== registration.snapshot.contentFingerprint
    )
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "context_package_binding_mismatch",
        "request.policyInput.activeSnapshotReference",
        "Delivery Request activation evidence does not match durable history",
        request,
      );
    const candidates = await input.repository.getCandidates();
    const isHistorical = recovery.activeSnapshotId !== registration.snapshot.snapshotId;
    const historicalRegistryState = isHistorical
      ? {
          integrity: RegistryIntegrityResultSchema.parse(
            await input.registry.verifyIntegrityAtSequence(
              contextPackage.registryBinding.verifiedThroughSequence,
            ),
          ),
          recovery: RegistryRecoveryResultSchema.parse(
            await input.registry.recoverAtSequence(
              contextPackage.registryBinding.verifiedThroughSequence,
            ),
          ),
        }
      : undefined;
    if (
      historicalRegistryState !== undefined &&
      (historicalRegistryState.integrity.status !== "valid" ||
        historicalRegistryState.recovery.status !== "recovered")
    )
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "context_package_integrity_failure",
        "contextPackage.registryBinding",
        "Historical registry-prefix integrity verification failed",
        request,
      );
    const packageVerification = verifyKnowledgeContextPackage({
      package: contextPackage,
      candidateInputs: candidates,
      bindings: { registration, integrity, recovery, repositorySnapshot: input.repositorySnapshot },
      ...(historicalRegistryState === undefined ? {} : { historicalRegistryState }),
    });
    if (packageVerification.status !== "valid")
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "context_package_integrity_failure",
        "contextPackage",
        packageVerification.issues[0]?.message ?? "Context Package verification failed",
        request,
      );

    const compatibility = matchContextConsumerCapabilities(
      request.consumer,
      contextPackage,
      request.capabilityRequirements,
      request.replayPolicy,
    );
    if (compatibility.status !== "compatible")
      return rejected(
        evaluatedAt,
        "capability-mismatch",
        "consumer_capability_mismatch",
        "request.consumer.capabilities",
        compatibility.reasonCodes.join(", "),
        request,
      );

    const freshness = evaluateContextDeliveryFreshness({
      request,
      policyDecision: policy,
      contextPackage,
      currentActiveSnapshotId: recovery.activeSnapshotId,
      currentActivationSequence: currentActivation.sequence,
      evaluatedAt,
    });
    if (freshness.status !== "fresh") {
      const directCodes = new Set([
        "request_not_yet_valid",
        "request_expired",
        "policy_evidence_expired",
        "policy_decision_not_yet_valid",
        "maximum_age_exceeded",
        "newer_active_snapshot",
        "historical_replay_not_allowed",
        "timestamp_evidence_missing",
        "timestamp_evidence_invalid",
      ]);
      return rejectedWithIssues(
        evaluatedAt,
        "expired",
        freshness.reasonCodes.map((reason) => ({
          code: directCodes.has(reason) ? reason : "freshness_invalid",
          path: "request.freshnessPolicy",
          message: reason,
        })),
        request,
      );
    }

    const existing = inspectDelivery(input.idempotencyStore, request.idempotencyKey);
    if (existing !== null) {
      if (existing.requestFingerprint !== request.requestFingerprint)
        return rejected(
          evaluatedAt,
          "duplicate",
          "idempotency_key_conflict",
          "request.idempotencyKey",
          "Idempotency key was already used by a different canonical request",
          request,
        );
      if (request.replayPolicy.mode === "single-delivery")
        return rejected(
          evaluatedAt,
          "duplicate",
          "single_delivery_replay_rejected",
          "request.replayPolicy.mode",
          "Single-delivery requests cannot be replayed",
          request,
        );
      if (existing.result.status !== "delivered") throw new Error("Idempotency invariant failed");
      const replayEvidence = createContextDeliveryReplayEvidence({
        schemaVersion: "1.0",
        replayClassification:
          request.replayPolicy.mode === "evaluation-only"
            ? "evaluation-replay"
            : "identical-replay",
        deliveryRequestId: request.deliveryRequestId,
        deliveryRequestFingerprint: request.requestFingerprint,
        originalDeliveryEnvelopeId: existing.result.envelope.deliveryEnvelopeId,
        originalDeliveryEnvelopeFingerprint: existing.result.envelope.deliveryFingerprint,
        originalReceiptId: existing.result.receipt.receiptId,
        originalReceiptFingerprint: existing.result.receipt.receiptFingerprint,
        idempotencyKey: request.idempotencyKey,
        policyDecisionFingerprint: policy.decisionFingerprint,
        freshnessFingerprint: freshness.freshnessFingerprint,
        replayedAt: evaluatedAt,
      });
      idempotencyState(input.idempotencyStore).replayEvidence.set(
        request.idempotencyKey,
        replayEvidence,
      );
      return deepFreeze(structuredClone(existing.result));
    }

    const deliverySequence = nextDeliverySequence(input.idempotencyStore);
    const envelope = createGovernedContextDeliveryEnvelope({
      request,
      contextPackage,
      compatibility,
      policyDecisionEvidence: policy,
      freshnessEvidence: freshness,
      deliverySequence,
      createdAt: evaluatedAt,
    });
    const acknowledgment = createContextConsumerAcknowledgment({
      schemaVersion: "1.0",
      consumerId: request.consumer.consumerId,
      deliveryEnvelopeId: envelope.deliveryEnvelopeId,
      deliveryEnvelopeFingerprint: envelope.deliveryFingerprint,
      status: "accepted",
      acknowledgedAt: evaluatedAt,
      reasonCodes: [],
    });
    const receipt = createContextDeliveryReceipt({
      envelope,
      acknowledgment,
      replayClassification: "initial-delivery",
      receivedAt: evaluatedAt,
    });
    const envelopeVerification = verifyGovernedContextDeliveryEnvelope({
      envelope,
      request,
      policyDecisionEvidence: policy,
      candidateInputs: candidates,
      bindings: { registration, integrity, recovery, repositorySnapshot: input.repositorySnapshot },
      ...(historicalRegistryState === undefined ? {} : { historicalRegistryState }),
      currentActiveSnapshotId: recovery.activeSnapshotId,
      currentActivationSequence: currentActivation.sequence,
      expectedDeliverySequence: deliverySequence,
      evaluatedAt,
    });
    const receiptVerification = verifyContextDeliveryReceipt({
      receipt,
      envelope,
      acknowledgment,
      receivedAt: evaluatedAt,
    });
    if (envelopeVerification.status !== "valid" || receiptVerification.status !== "valid")
      return rejected(
        evaluatedAt,
        "integrity-failure",
        "context_package_integrity_failure",
        "deliveryEvidence",
        "Generated delivery evidence failed independent verification",
        request,
      );
    const result = deepFreeze(
      GovernedContextDeliveryResultSchema.parse({
        schemaVersion: "1.0",
        status: "delivered",
        envelope,
        acknowledgment,
        receipt,
      }),
    );
    rememberDelivery(
      input.idempotencyStore,
      request.idempotencyKey,
      request.requestFingerprint,
      result,
    );
    return result;
  } catch {
    return rejected(
      evaluatedAt,
      "integrity-failure",
      "context_package_integrity_failure",
      "deliveryDependencies",
      "Governed delivery dependency verification failed",
      verifiedRequest,
    );
  }
}
