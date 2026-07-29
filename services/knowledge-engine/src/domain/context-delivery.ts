import {
  ContextConsumerAcknowledgmentSchema,
  ContextConsumerCompatibilityResultSchema,
  ContextConsumerDescriptorSchema,
  ContextConsumptionEvidenceSchema,
  ContextDeliveryArtifactVerificationResultSchema,
  ContextDeliveryAttemptEvidenceSchema,
  ContextDeliveryFreshnessEvidenceSchema,
  ContextDeliveryPolicyDecisionEvidenceSchema,
  ContextDeliveryReceiptSchema,
  ContextDeliveryReplayEvidenceSchema,
  GovernedContextDeliveryEnvelopeSchema,
  GovernedContextDeliveryRequestSchema,
  GovernedContextDeliveryResultSchema,
  KnowledgeContextPackageSchema,
  findDurableCanonicalJsonIssue,
  type ContextConsumerAcknowledgment,
  type ContextConsumerCompatibilityResult,
  type ContextConsumerDescriptor,
  type ContextConsumptionEvidence,
  type ContextDeliveryArtifactVerificationResult,
  type ContextDeliveryAttemptEvidence,
  type ContextDeliveryFreshnessEvidence,
  type ContextDeliveryIssue,
  type ContextDeliveryPolicyDecisionEvidence,
  type ContextDeliveryReceipt,
  type ContextDeliveryReplayEvidence,
  type GovernedContextDeliveryEnvelope,
  type GovernedContextDeliveryRequest,
  type GovernedContextDeliveryResult,
  type KnowledgeContextPackage,
  type RegistryIntegrityResult,
  type RegistryRecoveryResult,
} from "@founderos/knowledge-schema";

import {
  createCanonicalSha256Fingerprint,
  serializeCanonicalValue,
} from "./canonical-fingerprint.js";
import { deepFreeze } from "./snapshot-lifecycle.js";
import {
  verifyKnowledgeContextPackage,
  type VerifiedKnowledgeContextInputs,
} from "./knowledge-context.js";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function secondsBetween(later: string, earlier: string): number {
  return Math.floor((Date.parse(later) - Date.parse(earlier)) / 1_000);
}

function rawInputIssue(input: unknown): string | null {
  const issue = findDurableCanonicalJsonIssue(input);
  return issue === null ? null : issue.path.map(String).join(".") || "artifact";
}

const EMPTY_FINGERPRINT = "0".repeat(64);

function captureCanonicalBuilderRecord(input: unknown, label: string): Record<string, unknown> {
  const issue = findDurableCanonicalJsonIssue(input);
  if (issue !== null)
    throw new TypeError(
      `${label} must be finite accessor-safe canonical data at ${issue.path.map(String).join(".") || label}`,
    );
  if (input === null || typeof input !== "object" || Array.isArray(input))
    throw new TypeError(`${label} must be a plain canonical object`);
  return structuredClone(input) as Record<string, unknown>;
}

export function findUnsafeContextDeliveryContent(input: unknown): string | null {
  const stack: Array<{ path: string; value: unknown }> = [{ path: "artifact", value: input }];
  while (stack.length > 0) {
    const { path, value } = stack.pop()!;
    if (typeof value === "string") {
      if (
        /(?:^|[\s"'`=:([])\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*/u.test(value) ||
        /file:\/\//iu.test(value) ||
        /(?:^|[\s"'`=:([])[A-Za-z]:[\\/]/u.test(value) ||
        /(?:^|[\s"'`=:([])\\\\[^\\\s]+\\/u.test(value) ||
        /\b(?:bearer\s+[A-Za-z0-9._~+/-]+=*|sk-[A-Za-z0-9_-]{8,})/iu.test(value)
      ) {
        return path;
      }
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    for (const [key, child] of Object.entries(value)) {
      const normalizedKey = key.replace(/[_-]/gu, "").toLowerCase();
      if (
        /^(?:apikey|accesstoken|authorization|bearertoken|clientsecret|cookie|credential|password|privatekey|refreshtoken|secret|sessiontoken|setcookie|signingkey|token)$/u.test(
          normalizedKey,
        )
      )
        return `${path}.${key}`;
      stack.push({ path: `${path}.${key}`, value: child });
    }
  }
  return null;
}

type ArtifactType = ContextDeliveryArtifactVerificationResult["artifactType"];
type VerificationCode = ContextDeliveryArtifactVerificationResult["issues"][number]["code"];

function verificationResult(
  artifactType: ArtifactType,
  fingerprint: string | null,
  issues: ContextDeliveryArtifactVerificationResult["issues"],
): ContextDeliveryArtifactVerificationResult {
  return deepFreeze(
    ContextDeliveryArtifactVerificationResultSchema.parse({
      schemaVersion: "1.0",
      artifactType,
      status: issues.length === 0 ? "valid" : "invalid",
      fingerprint: issues.length === 0 ? fingerprint : null,
      issues,
    }),
  );
}

function verificationIssue(code: VerificationCode, path: string, message: string) {
  return { code, path, message };
}

function verifyFingerprintArtifact<T>(input: {
  artifactType: ArtifactType;
  fingerprintField: string;
  idField?: string;
  idPrefix?: string;
  schema: {
    safeParse(value: unknown):
      | { success: true; data: T }
      | {
          success: false;
          error: { issues?: readonly { path?: readonly PropertyKey[]; message?: string }[] };
        };
  };
  value: unknown;
}): ContextDeliveryArtifactVerificationResult {
  const rawIssue = rawInputIssue(input.value);
  if (rawIssue !== null) {
    return verificationResult(input.artifactType, null, [
      verificationIssue(
        "invalid_artifact",
        rawIssue,
        "Artifact is not accessor-safe canonical data",
      ),
    ]);
  }
  const parsed = input.schema.safeParse(input.value);
  if (!parsed.success) {
    return verificationResult(input.artifactType, null, [
      verificationIssue(
        "invalid_artifact",
        parsed.error.issues?.[0]?.path?.join(".") || "artifact",
        parsed.error.issues?.[0]?.message ?? "Artifact schema validation failed",
      ),
    ]);
  }
  if (serializeCanonicalValue(input.value) !== serializeCanonicalValue(parsed.data)) {
    return verificationResult(input.artifactType, null, [
      verificationIssue(
        "invalid_artifact",
        "artifact",
        "Artifact must already be in its strict canonical schema representation",
      ),
    ]);
  }
  const record = parsed.data as Record<string, unknown>;
  const suppliedFingerprint = record[input.fingerprintField] as string;
  const identity = { ...record };
  delete identity[input.fingerprintField];
  if (input.idField !== undefined) delete identity[input.idField];
  const expectedFingerprint = createCanonicalSha256Fingerprint(identity);
  const issues: ContextDeliveryArtifactVerificationResult["issues"] = [];
  if (suppliedFingerprint !== expectedFingerprint) {
    issues.push(
      verificationIssue(
        "fingerprint_mismatch",
        input.fingerprintField,
        "Canonical artifact fingerprint does not verify",
      ),
    );
  }
  if (
    input.idField !== undefined &&
    record[input.idField] !== `${input.idPrefix ?? ""}${expectedFingerprint}`
  ) {
    issues.push(
      verificationIssue(
        "fingerprint_mismatch",
        input.idField,
        "Artifact identity does not derive from its fingerprint",
      ),
    );
  }
  const unsafePath = findUnsafeContextDeliveryContent(record);
  if (unsafePath !== null)
    issues.push(
      verificationIssue(
        "unsafe_content",
        unsafePath,
        "Artifact contains a physical path or secret-bearing field",
      ),
    );
  return verificationResult(input.artifactType, expectedFingerprint, issues);
}

export type ContextConsumerDescriptorInput = Omit<
  ContextConsumerDescriptor,
  "descriptorFingerprint"
>;

export function createContextConsumerDescriptor(
  input: ContextConsumerDescriptorInput,
): ContextConsumerDescriptor {
  const captured = captureCanonicalBuilderRecord(input, "Consumer Descriptor");
  const parsed = ContextConsumerDescriptorSchema.parse({
    ...captured,
    descriptorFingerprint: EMPTY_FINGERPRINT,
  });
  const { descriptorFingerprint: _placeholder, ...normalized } = parsed;
  void _placeholder;
  const descriptorFingerprint = createCanonicalSha256Fingerprint(normalized);
  return immutableCopy(
    ContextConsumerDescriptorSchema.parse({ ...normalized, descriptorFingerprint }),
  );
}

export function verifyContextConsumerDescriptor(
  input: unknown,
): ContextDeliveryArtifactVerificationResult {
  return verifyFingerprintArtifact({
    artifactType: "consumer-descriptor",
    fingerprintField: "descriptorFingerprint",
    schema: ContextConsumerDescriptorSchema,
    value: input,
  });
}

export type GovernedContextDeliveryRequestInput = Omit<
  GovernedContextDeliveryRequest,
  "requestFingerprint"
>;

export function createGovernedContextDeliveryRequest(
  input: GovernedContextDeliveryRequestInput,
): GovernedContextDeliveryRequest {
  const captured = captureCanonicalBuilderRecord(input, "Delivery Request");
  if (verifyContextConsumerDescriptor(captured.consumer).status !== "valid")
    throw new TypeError("Delivery Request requires a verified Consumer Descriptor");
  const parsed = GovernedContextDeliveryRequestSchema.parse({
    ...captured,
    requestFingerprint: EMPTY_FINGERPRINT,
  });
  const { requestFingerprint: _placeholder, ...normalized } = parsed;
  void _placeholder;
  const requestFingerprint = createCanonicalSha256Fingerprint(normalized);
  return immutableCopy(
    GovernedContextDeliveryRequestSchema.parse({ ...normalized, requestFingerprint }),
  );
}

export function verifyGovernedContextDeliveryRequest(
  input: unknown,
): ContextDeliveryArtifactVerificationResult {
  const outer = verifyFingerprintArtifact({
    artifactType: "delivery-request",
    fingerprintField: "requestFingerprint",
    schema: GovernedContextDeliveryRequestSchema,
    value: input,
  });
  if (outer.status !== "valid") return outer;
  const request = GovernedContextDeliveryRequestSchema.parse(input);
  const descriptor = verifyContextConsumerDescriptor(request.consumer);
  return descriptor.status === "valid"
    ? outer
    : verificationResult("delivery-request", null, [
        verificationIssue(
          "consumer_binding_mismatch",
          "consumer.descriptorFingerprint",
          "Embedded Consumer Descriptor fingerprint does not verify",
        ),
      ]);
}

export type ContextDeliveryPolicyDecisionEvidenceInput = Omit<
  ContextDeliveryPolicyDecisionEvidence,
  "decisionFingerprint"
>;

export function createContextDeliveryPolicyDecisionEvidence(
  input: ContextDeliveryPolicyDecisionEvidenceInput,
): ContextDeliveryPolicyDecisionEvidence {
  const captured = captureCanonicalBuilderRecord(input, "Policy Decision Evidence");
  const parsed = ContextDeliveryPolicyDecisionEvidenceSchema.parse({
    ...captured,
    decisionFingerprint: EMPTY_FINGERPRINT,
  });
  const { decisionFingerprint: _placeholder, ...normalized } = parsed;
  void _placeholder;
  const decisionFingerprint = createCanonicalSha256Fingerprint(normalized);
  return immutableCopy(
    ContextDeliveryPolicyDecisionEvidenceSchema.parse({ ...normalized, decisionFingerprint }),
  );
}

export interface VerifyContextDeliveryPolicyDecisionEvidenceInput {
  readonly evidence: unknown;
  readonly request: unknown;
}

export function verifyContextDeliveryPolicyDecisionEvidence(
  input: VerifyContextDeliveryPolicyDecisionEvidenceInput,
): ContextDeliveryArtifactVerificationResult {
  const local = verifyFingerprintArtifact({
    artifactType: "policy-decision",
    fingerprintField: "decisionFingerprint",
    schema: ContextDeliveryPolicyDecisionEvidenceSchema,
    value: input.evidence,
  });
  if (local.status !== "valid") return local;
  try {
    if (verifyGovernedContextDeliveryRequest(input.request).status !== "valid")
      throw new Error("Authoritative request does not verify");
    const evidence = ContextDeliveryPolicyDecisionEvidenceSchema.parse(input.evidence);
    const request = GovernedContextDeliveryRequestSchema.parse(input.request);
    if (
      evidence.inputFingerprint !== createCanonicalSha256Fingerprint(request.policyInput) ||
      evidence.deliveryRequestId !== request.deliveryRequestId ||
      evidence.deliveryRequestFingerprint !== request.requestFingerprint ||
      evidence.contextPackageId !== request.contextPackageId ||
      evidence.contextPackageFingerprint !== request.contextPackageFingerprint ||
      evidence.consumerId !== request.consumer.consumerId ||
      evidence.consumerDescriptorFingerprint !== request.consumerDescriptorFingerprint ||
      evidence.intendedPurpose !== request.purpose ||
      Date.parse(evidence.decidedAt) < Date.parse(request.requestedAt)
    )
      throw new Error("Policy binding mismatch");
    return local;
  } catch {
    return verificationResult("policy-decision", null, [
      verificationIssue(
        "policy_binding_mismatch",
        "policyDecisionEvidence",
        "Policy Decision Evidence does not bind the authoritative Delivery Request",
      ),
    ]);
  }
}

function compatibilityMismatch(
  field: string,
  reason: ContextConsumerCompatibilityResult["reasonCodes"][number],
  expected: boolean | number | string | string[],
  actual: boolean | number | string | string[],
) {
  return { field, reason, expected, actual };
}

export function matchContextConsumerCapabilities(
  consumerInput: unknown,
  packageInput: unknown,
  requirements: GovernedContextDeliveryRequest["capabilityRequirements"],
  replayPolicy: GovernedContextDeliveryRequest["replayPolicy"],
): ContextConsumerCompatibilityResult {
  const consumer = ContextConsumerDescriptorSchema.parse(consumerInput);
  const contextPackage = KnowledgeContextPackageSchema.parse(packageInput);
  const capabilities = consumer.capabilities;
  const mismatches: ContextConsumerCompatibilityResult["mismatches"] = [];
  if (!capabilities.acceptedContextPackageVersions.includes(contextPackage.schemaVersion))
    mismatches.push(
      compatibilityMismatch(
        "schemaVersion",
        "context_package_version_unsupported",
        capabilities.acceptedContextPackageVersions,
        contextPackage.schemaVersion,
      ),
    );
  if (!capabilities.acceptedAssemblyPolicyVersions.includes(contextPackage.assemblyPolicyVersion))
    mismatches.push(
      compatibilityMismatch(
        "assemblyPolicyVersion",
        "assembly_policy_version_unsupported",
        capabilities.acceptedAssemblyPolicyVersions,
        contextPackage.assemblyPolicyVersion,
      ),
    );
  if (contextPackage.budgetUsage.usedObjectCount > capabilities.maxObjectCount)
    mismatches.push(
      compatibilityMismatch(
        "budgetUsage.usedObjectCount",
        "object_count_exceeded",
        capabilities.maxObjectCount,
        contextPackage.budgetUsage.usedObjectCount,
      ),
    );
  if (contextPackage.budgetUsage.usedCanonicalCharacters > capabilities.maxCanonicalCharacters)
    mismatches.push(
      compatibilityMismatch(
        "budgetUsage.usedCanonicalCharacters",
        "character_count_exceeded",
        capabilities.maxCanonicalCharacters,
        contextPackage.budgetUsage.usedCanonicalCharacters,
      ),
    );
  if (contextPackage.truncations.length > 0 && !capabilities.acceptsTruncatedContent)
    mismatches.push(
      compatibilityMismatch(
        "capabilities.acceptsTruncatedContent",
        "truncated_content_unsupported",
        true,
        false,
      ),
    );
  if (contextPackage.included.length === 0 && !capabilities.acceptsEmptyPackages)
    mismatches.push(
      compatibilityMismatch(
        "capabilities.acceptsEmptyPackages",
        "empty_package_unsupported",
        true,
        false,
      ),
    );
  if (requirements.requireProvenance && !capabilities.supportsProvenance)
    mismatches.push(
      compatibilityMismatch(
        "capabilities.supportsProvenance",
        "provenance_unsupported",
        true,
        false,
      ),
    );
  if (
    (requirements.requireReplay || replayPolicy.mode !== "single-delivery") &&
    !capabilities.supportsReplay
  )
    mismatches.push(
      compatibilityMismatch("capabilities.supportsReplay", "replay_unsupported", true, false),
    );
  if (requirements.requireReceipt && !capabilities.supportsReceipts)
    mismatches.push(
      compatibilityMismatch("capabilities.supportsReceipts", "receipt_unsupported", true, false),
    );
  mismatches.sort((left, right) =>
    compareStrings(`${left.field}\0${left.reason}`, `${right.field}\0${right.reason}`),
  );
  const reasonCodes = [...new Set(mismatches.map((value) => value.reason))].sort(compareStrings);
  const unsigned = {
    schemaVersion: "1.0" as const,
    status: mismatches.length === 0 ? ("compatible" as const) : ("incompatible" as const),
    reasonCodes,
    mismatches,
    consumerDescriptorFingerprint: consumer.descriptorFingerprint,
    contextPackageFingerprint: contextPackage.contextFingerprint,
  };
  return immutableCopy(
    ContextConsumerCompatibilityResultSchema.parse({
      ...unsigned,
      compatibilityFingerprint: createCanonicalSha256Fingerprint(unsigned),
    }),
  );
}

export interface VerifyContextConsumerCompatibilityResultInput {
  readonly result: unknown;
  readonly consumer: unknown;
  readonly contextPackage: unknown;
  readonly requirements: GovernedContextDeliveryRequest["capabilityRequirements"];
  readonly replayPolicy: GovernedContextDeliveryRequest["replayPolicy"];
}

export function verifyContextConsumerCompatibilityResult(
  input: VerifyContextConsumerCompatibilityResultInput,
): ContextDeliveryArtifactVerificationResult {
  const local = verifyFingerprintArtifact({
    artifactType: "compatibility-result",
    fingerprintField: "compatibilityFingerprint",
    schema: ContextConsumerCompatibilityResultSchema,
    value: input.result,
  });
  if (local.status !== "valid") return local;
  try {
    if (verifyContextConsumerDescriptor(input.consumer).status !== "valid")
      throw new Error("Consumer does not verify");
    if (findDurableCanonicalJsonIssue(input.contextPackage) !== null)
      throw new Error("Context Package is not canonical data");
    const contextPackage = KnowledgeContextPackageSchema.parse(input.contextPackage);
    if (serializeCanonicalValue(input.contextPackage) !== serializeCanonicalValue(contextPackage))
      throw new Error("Context Package is not in canonical schema form");
    const expected = matchContextConsumerCapabilities(
      input.consumer,
      contextPackage,
      input.requirements,
      input.replayPolicy,
    );
    return serializeCanonicalValue(expected) ===
      serializeCanonicalValue(ContextConsumerCompatibilityResultSchema.parse(input.result))
      ? local
      : verificationResult("compatibility-result", null, [
          verificationIssue(
            "consumer_binding_mismatch",
            "compatibility",
            "Compatibility evidence does not reproduce from the bound Consumer and package",
          ),
        ]);
  } catch {
    return verificationResult("compatibility-result", null, [
      verificationIssue(
        "consumer_binding_mismatch",
        "compatibility",
        "Compatibility verification inputs are invalid",
      ),
    ]);
  }
}

export interface EvaluateContextDeliveryFreshnessInput {
  readonly request: GovernedContextDeliveryRequest;
  readonly policyDecision: ContextDeliveryPolicyDecisionEvidence;
  readonly contextPackage: KnowledgeContextPackage;
  readonly currentActiveSnapshotId: string;
  readonly currentActivationSequence: number;
  readonly evaluatedAt: string;
}

export function evaluateContextDeliveryFreshness(
  input: EvaluateContextDeliveryFreshnessInput,
): ContextDeliveryFreshnessEvidence {
  const request = GovernedContextDeliveryRequestSchema.parse(input.request);
  const policy = ContextDeliveryPolicyDecisionEvidenceSchema.parse(input.policyDecision);
  const contextPackage = KnowledgeContextPackageSchema.parse(input.contextPackage);
  const evaluatedAt = new Date(input.evaluatedAt).toISOString();
  const evaluatedMs = Date.parse(evaluatedAt);
  const packageSequence = request.policyInput.activeSnapshotReference.activationSequence;
  const historicalReplay =
    contextPackage.snapshotBinding.activeSnapshotId !== input.currentActiveSnapshotId ||
    packageSequence < input.currentActivationSequence;
  const reasons = new Set<ContextDeliveryFreshnessEvidence["reasonCodes"][number]>();
  const freshness = request.freshnessPolicy;
  if (freshness.notBefore !== undefined && evaluatedMs < Date.parse(freshness.notBefore))
    reasons.add("request_not_yet_valid");
  if (freshness.expiresAt !== undefined && evaluatedMs >= Date.parse(freshness.expiresAt))
    reasons.add("request_expired");
  if (policy.expiresAt !== undefined && evaluatedMs >= Date.parse(policy.expiresAt))
    reasons.add("policy_evidence_expired");
  if (evaluatedMs < Date.parse(policy.decidedAt)) reasons.add("policy_decision_not_yet_valid");
  if (evaluatedMs < Date.parse(request.requestedAt)) reasons.add("request_not_yet_valid");
  const packageTimestamp = contextPackage.assembledAt ?? contextPackage.request.evidenceTimestamp;
  const packageAgeSeconds =
    packageTimestamp === undefined
      ? null
      : Math.max(0, secondsBetween(evaluatedAt, packageTimestamp));
  if (packageTimestamp !== undefined && evaluatedMs < Date.parse(packageTimestamp))
    reasons.add("timestamp_evidence_invalid");
  if (freshness.maxAgeSeconds !== undefined) {
    if (packageAgeSeconds === null) reasons.add("timestamp_evidence_missing");
    else if (packageAgeSeconds > freshness.maxAgeSeconds) reasons.add("maximum_age_exceeded");
  }
  if (historicalReplay && freshness.invalidateOnNewerActiveSnapshot)
    reasons.add("newer_active_snapshot");
  if (historicalReplay && !freshness.allowHistoricalReplay)
    reasons.add("historical_replay_not_allowed");
  const reasonCodes = [...reasons].sort(compareStrings);
  const unsigned = {
    schemaVersion: "1.0" as const,
    status: reasonCodes.length === 0 ? ("fresh" as const) : ("stale" as const),
    evaluatedAt,
    packageSnapshotId: contextPackage.snapshotBinding.activeSnapshotId,
    packageActivationSequence: packageSequence,
    currentActiveSnapshotId: input.currentActiveSnapshotId,
    currentActivationSequence: input.currentActivationSequence,
    packageAgeSeconds,
    historicalReplay,
    reasonCodes,
  };
  return immutableCopy(
    ContextDeliveryFreshnessEvidenceSchema.parse({
      ...unsigned,
      freshnessFingerprint: createCanonicalSha256Fingerprint(unsigned),
    }),
  );
}

export interface VerifyContextDeliveryFreshnessEvidenceInput extends EvaluateContextDeliveryFreshnessInput {
  readonly evidence: unknown;
}

export function verifyContextDeliveryFreshnessEvidence(
  input: VerifyContextDeliveryFreshnessEvidenceInput,
): ContextDeliveryArtifactVerificationResult {
  const local = verifyFingerprintArtifact({
    artifactType: "freshness-evidence",
    fingerprintField: "freshnessFingerprint",
    schema: ContextDeliveryFreshnessEvidenceSchema,
    value: input.evidence,
  });
  if (local.status !== "valid") return local;
  try {
    if (verifyGovernedContextDeliveryRequest(input.request).status !== "valid")
      throw new Error("Request does not verify");
    if (
      verifyContextDeliveryPolicyDecisionEvidence({
        evidence: input.policyDecision,
        request: input.request,
      }).status !== "valid"
    )
      throw new Error("Policy does not verify");
    if (findDurableCanonicalJsonIssue(input.contextPackage) !== null)
      throw new Error("Context Package is not canonical data");
    const contextPackage = KnowledgeContextPackageSchema.parse(input.contextPackage);
    if (serializeCanonicalValue(input.contextPackage) !== serializeCanonicalValue(contextPackage))
      throw new Error("Context Package is not in canonical schema form");
    const expected = evaluateContextDeliveryFreshness(input);
    return serializeCanonicalValue(expected) ===
      serializeCanonicalValue(ContextDeliveryFreshnessEvidenceSchema.parse(input.evidence))
      ? local
      : verificationResult("freshness-evidence", null, [
          verificationIssue(
            "freshness_binding_mismatch",
            "freshnessEvidence",
            "Freshness evidence does not reproduce from authoritative inputs",
          ),
        ]);
  } catch {
    return verificationResult("freshness-evidence", null, [
      verificationIssue(
        "freshness_binding_mismatch",
        "freshnessEvidence",
        "Freshness verification inputs are invalid",
      ),
    ]);
  }
}

export interface CreateGovernedContextDeliveryEnvelopeInput {
  readonly request: GovernedContextDeliveryRequest;
  readonly contextPackage: KnowledgeContextPackage;
  readonly compatibility: ContextConsumerCompatibilityResult;
  readonly policyDecisionEvidence: ContextDeliveryPolicyDecisionEvidence;
  readonly freshnessEvidence: ContextDeliveryFreshnessEvidence;
  readonly deliverySequence: number;
  readonly createdAt: string;
}

export function createGovernedContextDeliveryEnvelope(
  input: CreateGovernedContextDeliveryEnvelopeInput,
): GovernedContextDeliveryEnvelope {
  const unsigned = {
    schemaVersion: "1.0" as const,
    deliveryRequestId: input.request.deliveryRequestId,
    deliveryRequestFingerprint: input.request.requestFingerprint,
    contextPackageId: input.contextPackage.contextPackageId,
    contextPackageFingerprint: input.contextPackage.contextFingerprint,
    contextPackage: input.contextPackage,
    consumerId: input.request.consumer.consumerId,
    consumerDescriptorFingerprint: input.request.consumerDescriptorFingerprint,
    deliveryPurpose: input.request.purpose,
    activeSnapshotBinding: input.contextPackage.snapshotBinding,
    registryIntegrityBinding: input.contextPackage.registryBinding,
    compatibility: input.compatibility,
    policyDecisionEvidence: input.policyDecisionEvidence,
    freshnessEvidence: input.freshnessEvidence,
    idempotencyKey: input.request.idempotencyKey,
    replayPolicy: input.request.replayPolicy,
    deliverySequence: input.deliverySequence,
    createdAt: input.createdAt,
  };
  const deliveryFingerprint = createCanonicalSha256Fingerprint(unsigned);
  return immutableCopy(
    GovernedContextDeliveryEnvelopeSchema.parse({
      ...unsigned,
      deliveryEnvelopeId: `delivery-${deliveryFingerprint}`,
      deliveryFingerprint,
    }),
  );
}

export interface VerifyGovernedContextDeliveryEnvelopeInput {
  readonly envelope: unknown;
  readonly request: unknown;
  readonly policyDecisionEvidence: unknown;
  readonly candidateInputs: readonly unknown[];
  readonly bindings: VerifiedKnowledgeContextInputs;
  readonly historicalRegistryState?: {
    readonly integrity: RegistryIntegrityResult;
    readonly recovery: RegistryRecoveryResult;
  };
  readonly currentActiveSnapshotId: string;
  readonly currentActivationSequence: number;
  readonly expectedDeliverySequence: number;
  readonly evaluatedAt: string;
}

export function verifyGovernedContextDeliveryEnvelope(
  input: VerifyGovernedContextDeliveryEnvelopeInput,
): ContextDeliveryArtifactVerificationResult {
  const outer = verifyFingerprintArtifact({
    artifactType: "delivery-envelope",
    fingerprintField: "deliveryFingerprint",
    idField: "deliveryEnvelopeId",
    idPrefix: "delivery-",
    schema: GovernedContextDeliveryEnvelopeSchema,
    value: input.envelope,
  });
  if (outer.status !== "valid") return outer;
  const envelope = GovernedContextDeliveryEnvelopeSchema.parse(input.envelope);
  const requestVerification = verifyGovernedContextDeliveryRequest(input.request);
  if (requestVerification.status !== "valid")
    return verificationResult("delivery-envelope", null, [
      verificationIssue(
        "request_binding_mismatch",
        "request",
        "Authoritative Delivery Request does not verify",
      ),
    ]);
  const request = GovernedContextDeliveryRequestSchema.parse(input.request);
  const issues: ContextDeliveryArtifactVerificationResult["issues"] = [];
  const packageVerification = verifyKnowledgeContextPackage({
    package: envelope.contextPackage,
    candidateInputs: input.candidateInputs,
    bindings: input.bindings,
    ...(input.historicalRegistryState === undefined
      ? {}
      : { historicalRegistryState: input.historicalRegistryState }),
  });
  if (packageVerification.status !== "valid")
    issues.push(
      verificationIssue(
        "context_package_binding_mismatch",
        "contextPackage",
        "Embedded Context Package does not verify against trusted knowledge state",
      ),
    );
  const compatibility = verifyContextConsumerCompatibilityResult({
    result: envelope.compatibility,
    consumer: request.consumer,
    contextPackage: envelope.contextPackage,
    requirements: request.capabilityRequirements,
    replayPolicy: request.replayPolicy,
  });
  if (compatibility.status !== "valid")
    issues.push(
      verificationIssue(
        "consumer_binding_mismatch",
        "compatibility",
        "Consumer compatibility does not reproduce from the authoritative request",
      ),
    );
  const policy = verifyContextDeliveryPolicyDecisionEvidence({
    evidence: input.policyDecisionEvidence,
    request,
  });
  if (
    policy.status !== "valid" ||
    serializeCanonicalValue(envelope.policyDecisionEvidence) !==
      serializeCanonicalValue(input.policyDecisionEvidence) ||
    envelope.policyDecisionEvidence.inputFingerprint !==
      createCanonicalSha256Fingerprint(request.policyInput) ||
    envelope.policyDecisionEvidence.deliveryRequestId !== request.deliveryRequestId ||
    envelope.policyDecisionEvidence.deliveryRequestFingerprint !== request.requestFingerprint
  )
    issues.push(
      verificationIssue(
        "policy_binding_mismatch",
        "policyDecisionEvidence",
        "Policy evidence does not bind the authoritative request",
      ),
    );
  const freshness = verifyContextDeliveryFreshnessEvidence({
    evidence: envelope.freshnessEvidence,
    request,
    policyDecision: input.policyDecisionEvidence as ContextDeliveryPolicyDecisionEvidence,
    contextPackage: envelope.contextPackage,
    currentActiveSnapshotId: input.currentActiveSnapshotId,
    currentActivationSequence: input.currentActivationSequence,
    evaluatedAt: input.evaluatedAt,
  });
  if (freshness.status !== "valid")
    issues.push(
      verificationIssue(
        "freshness_binding_mismatch",
        "freshnessEvidence",
        "Freshness evidence does not reproduce from the authoritative request",
      ),
    );
  if (
    envelope.deliveryRequestId !== request.deliveryRequestId ||
    envelope.createdAt !== input.evaluatedAt ||
    envelope.deliveryRequestFingerprint !== request.requestFingerprint ||
    envelope.consumerId !== request.consumer.consumerId ||
    envelope.consumerDescriptorFingerprint !== request.consumerDescriptorFingerprint ||
    envelope.contextPackageId !== request.contextPackageId ||
    envelope.contextPackageFingerprint !== request.contextPackageFingerprint ||
    envelope.idempotencyKey !== request.idempotencyKey ||
    envelope.deliverySequence !== input.expectedDeliverySequence ||
    serializeCanonicalValue(envelope.replayPolicy) !== serializeCanonicalValue(request.replayPolicy)
  )
    issues.push(
      verificationIssue(
        "request_binding_mismatch",
        "envelope",
        "Delivery Envelope does not exactly bind the authoritative request",
      ),
    );
  return verificationResult(
    "delivery-envelope",
    issues.length === 0 ? envelope.deliveryFingerprint : null,
    issues,
  );
}

export type ContextConsumerAcknowledgmentInput = Omit<
  ContextConsumerAcknowledgment,
  "acknowledgmentFingerprint"
>;

export function createContextConsumerAcknowledgment(
  input: ContextConsumerAcknowledgmentInput,
): ContextConsumerAcknowledgment {
  const captured = captureCanonicalBuilderRecord(input, "Consumer Acknowledgment");
  const parsed = ContextConsumerAcknowledgmentSchema.parse({
    ...captured,
    acknowledgmentFingerprint: EMPTY_FINGERPRINT,
  });
  const { acknowledgmentFingerprint: _placeholder, ...normalized } = parsed;
  void _placeholder;
  const acknowledgmentFingerprint = createCanonicalSha256Fingerprint(normalized);
  return immutableCopy(
    ContextConsumerAcknowledgmentSchema.parse({ ...normalized, acknowledgmentFingerprint }),
  );
}

export interface CreateContextDeliveryReceiptInput {
  readonly envelope: GovernedContextDeliveryEnvelope;
  readonly acknowledgment: ContextConsumerAcknowledgment;
  readonly replayClassification: ContextDeliveryReceipt["replayClassification"];
  readonly receivedAt: string;
}

export function createContextDeliveryReceipt(
  input: CreateContextDeliveryReceiptInput,
): ContextDeliveryReceipt {
  const envelope = GovernedContextDeliveryEnvelopeSchema.parse(input.envelope);
  const acknowledgment = ContextConsumerAcknowledgmentSchema.parse(input.acknowledgment);
  if (
    acknowledgment.consumerId !== envelope.consumerId ||
    acknowledgment.deliveryEnvelopeId !== envelope.deliveryEnvelopeId ||
    acknowledgment.deliveryEnvelopeFingerprint !== envelope.deliveryFingerprint
  )
    throw new Error("Consumer acknowledgment does not bind the delivery envelope");
  const unsigned = {
    schemaVersion: "1.0" as const,
    deliveryEnvelopeId: envelope.deliveryEnvelopeId,
    deliveryEnvelopeFingerprint: envelope.deliveryFingerprint,
    contextPackageId: envelope.contextPackageId,
    contextPackageFingerprint: envelope.contextPackageFingerprint,
    consumerId: envelope.consumerId,
    consumerDescriptorFingerprint: envelope.consumerDescriptorFingerprint,
    deliveryStatus: acknowledgment.status,
    deliverySequence: envelope.deliverySequence,
    receivedAt: input.receivedAt,
    idempotencyKey: envelope.idempotencyKey,
    replayClassification: input.replayClassification,
    consumerAcknowledgmentFingerprint: acknowledgment.acknowledgmentFingerprint,
  };
  const receiptFingerprint = createCanonicalSha256Fingerprint(unsigned);
  return immutableCopy(
    ContextDeliveryReceiptSchema.parse({
      ...unsigned,
      receiptId: `receipt-${receiptFingerprint}`,
      receiptFingerprint,
    }),
  );
}

export interface VerifyContextDeliveryReceiptInput {
  readonly receipt: unknown;
  readonly envelope: unknown;
  readonly acknowledgment: unknown;
  readonly receivedAt: string;
}

export function verifyContextDeliveryReceipt(
  input: VerifyContextDeliveryReceiptInput,
): ContextDeliveryArtifactVerificationResult {
  const local = verifyFingerprintArtifact({
    artifactType: "delivery-receipt",
    fingerprintField: "receiptFingerprint",
    idField: "receiptId",
    idPrefix: "receipt-",
    schema: ContextDeliveryReceiptSchema,
    value: input.receipt,
  });
  if (local.status !== "valid") return local;
  const envelopeLocal = verifyFingerprintArtifact({
    artifactType: "delivery-envelope",
    fingerprintField: "deliveryFingerprint",
    idField: "deliveryEnvelopeId",
    idPrefix: "delivery-",
    schema: GovernedContextDeliveryEnvelopeSchema,
    value: input.envelope,
  });
  if (envelopeLocal.status !== "valid")
    return verificationResult("delivery-receipt", null, [
      verificationIssue(
        "receipt_binding_mismatch",
        "envelope",
        "Authoritative Delivery Envelope does not verify locally",
      ),
    ]);
  try {
    const envelope = GovernedContextDeliveryEnvelopeSchema.parse(input.envelope);
    if (findDurableCanonicalJsonIssue(input.acknowledgment) !== null)
      throw new Error("Acknowledgment is not canonical data");
    const acknowledgment = ContextConsumerAcknowledgmentSchema.parse(input.acknowledgment);
    if (serializeCanonicalValue(input.acknowledgment) !== serializeCanonicalValue(acknowledgment))
      throw new Error("Acknowledgment is not in canonical schema form");
    const receipt = ContextDeliveryReceiptSchema.parse(input.receipt);
    const { acknowledgmentFingerprint: _fingerprint, ...acknowledgmentIdentity } = acknowledgment;
    void _fingerprint;
    if (
      createCanonicalSha256Fingerprint(acknowledgmentIdentity) !==
        acknowledgment.acknowledgmentFingerprint ||
      acknowledgment.acknowledgedAt !== input.receivedAt ||
      receipt.receivedAt !== input.receivedAt
    )
      throw new Error("Acknowledgment fingerprint does not verify");
    const expected = createContextDeliveryReceipt({
      envelope,
      acknowledgment,
      replayClassification: "initial-delivery",
      receivedAt: input.receivedAt,
    });
    return serializeCanonicalValue(expected) === serializeCanonicalValue(receipt)
      ? local
      : verificationResult("delivery-receipt", null, [
          verificationIssue(
            "receipt_binding_mismatch",
            "receipt",
            "Receipt does not reproduce from the bound Envelope and acknowledgment",
          ),
        ]);
  } catch {
    return verificationResult("delivery-receipt", null, [
      verificationIssue(
        "receipt_binding_mismatch",
        "receipt",
        "Receipt verification inputs are invalid or do not bind",
      ),
    ]);
  }
}

export type ContextDeliveryReplayEvidenceInput = Omit<
  ContextDeliveryReplayEvidence,
  "replayFingerprint"
>;

export function createContextDeliveryReplayEvidence(
  input: ContextDeliveryReplayEvidenceInput,
): ContextDeliveryReplayEvidence {
  const captured = captureCanonicalBuilderRecord(input, "Replay Evidence");
  const parsed = ContextDeliveryReplayEvidenceSchema.parse({
    ...captured,
    replayFingerprint: EMPTY_FINGERPRINT,
  });
  const { replayFingerprint: _placeholder, ...normalized } = parsed;
  void _placeholder;
  const replayFingerprint = createCanonicalSha256Fingerprint(normalized);
  return immutableCopy(
    ContextDeliveryReplayEvidenceSchema.parse({ ...normalized, replayFingerprint }),
  );
}

export interface VerifyContextDeliveryReplayEvidenceInput {
  readonly evidence: unknown;
  readonly request: unknown;
  readonly originalResult: unknown;
  readonly policyDecision: unknown;
  readonly freshnessEvidence: unknown;
  readonly currentActiveSnapshotId: string;
  readonly currentActivationSequence: number;
  readonly evaluatedAt: string;
}

export function verifyContextDeliveryReplayEvidence(
  input: VerifyContextDeliveryReplayEvidenceInput,
): ContextDeliveryArtifactVerificationResult {
  const local = verifyFingerprintArtifact({
    artifactType: "replay-evidence",
    fingerprintField: "replayFingerprint",
    schema: ContextDeliveryReplayEvidenceSchema,
    value: input.evidence,
  });
  if (local.status !== "valid") return local;
  try {
    const evidence = ContextDeliveryReplayEvidenceSchema.parse(input.evidence);
    const requestVerification = verifyGovernedContextDeliveryRequest(input.request);
    if (requestVerification.status !== "valid") throw new Error("Request does not verify");
    const request = GovernedContextDeliveryRequestSchema.parse(input.request);
    if (findDurableCanonicalJsonIssue(input.originalResult) !== null)
      throw new Error("Original result is not canonical data");
    const result = GovernedContextDeliveryResultSchema.parse(input.originalResult);
    if (serializeCanonicalValue(input.originalResult) !== serializeCanonicalValue(result))
      throw new Error("Original result is not in canonical schema form");
    const policyVerification = verifyContextDeliveryPolicyDecisionEvidence({
      evidence: input.policyDecision,
      request,
    });
    if (policyVerification.status !== "valid") throw new Error("Policy does not verify");
    const policy = ContextDeliveryPolicyDecisionEvidenceSchema.parse(input.policyDecision);
    const freshnessLocal = verifyFingerprintArtifact({
      artifactType: "freshness-evidence",
      fingerprintField: "freshnessFingerprint",
      schema: ContextDeliveryFreshnessEvidenceSchema,
      value: input.freshnessEvidence,
    });
    if (freshnessLocal.status !== "valid") throw new Error("Freshness does not verify locally");
    const freshness = ContextDeliveryFreshnessEvidenceSchema.parse(input.freshnessEvidence);
    const freshnessVerification =
      result.status === "delivered"
        ? verifyContextDeliveryFreshnessEvidence({
            evidence: freshness,
            request,
            policyDecision: policy,
            contextPackage: result.envelope.contextPackage,
            currentActiveSnapshotId: input.currentActiveSnapshotId,
            currentActivationSequence: input.currentActivationSequence,
            evaluatedAt: input.evaluatedAt,
          })
        : null;
    const envelopeVerification = verifyFingerprintArtifact({
      artifactType: "delivery-envelope",
      fingerprintField: "deliveryFingerprint",
      idField: "deliveryEnvelopeId",
      idPrefix: "delivery-",
      schema: GovernedContextDeliveryEnvelopeSchema,
      value: result.status === "delivered" ? result.envelope : null,
    });
    const receiptVerification =
      result.status === "delivered"
        ? verifyContextDeliveryReceipt({
            receipt: result.receipt,
            envelope: result.envelope,
            acknowledgment: result.acknowledgment,
            receivedAt: result.receipt.receivedAt,
          })
        : null;
    const expectedClassification =
      request.replayPolicy.mode === "evaluation-only" ? "evaluation-replay" : "identical-replay";
    if (
      result.status !== "delivered" ||
      requestVerification.status !== "valid" ||
      policyVerification.status !== "valid" ||
      policy.outcome !== "allowed" ||
      freshnessVerification?.status !== "valid" ||
      freshness.status !== "fresh" ||
      envelopeVerification.status !== "valid" ||
      receiptVerification?.status !== "valid" ||
      request.replayPolicy.mode === "single-delivery" ||
      evidence.replayClassification !== expectedClassification ||
      evidence.deliveryRequestId !== request.deliveryRequestId ||
      evidence.deliveryRequestFingerprint !== request.requestFingerprint ||
      evidence.originalDeliveryEnvelopeId !== result.envelope.deliveryEnvelopeId ||
      evidence.originalDeliveryEnvelopeFingerprint !== result.envelope.deliveryFingerprint ||
      evidence.originalReceiptId !== result.receipt.receiptId ||
      evidence.originalReceiptFingerprint !== result.receipt.receiptFingerprint ||
      evidence.idempotencyKey !== request.idempotencyKey ||
      evidence.policyDecisionFingerprint !== policy.decisionFingerprint ||
      evidence.freshnessFingerprint !== freshness.freshnessFingerprint ||
      evidence.replayedAt !== freshness.evaluatedAt ||
      evidence.replayedAt !== input.evaluatedAt
    )
      throw new Error("Replay binding mismatch");
    return local;
  } catch {
    return verificationResult("replay-evidence", null, [
      verificationIssue(
        "replay_binding_mismatch",
        "replayEvidence",
        "Replay Evidence does not bind authoritative delivery artifacts",
      ),
    ]);
  }
}

export type ContextConsumptionEvidenceInput = Omit<
  ContextConsumptionEvidence,
  "consumptionId" | "consumptionFingerprint"
>;

export function createContextConsumptionEvidence(
  input: ContextConsumptionEvidenceInput,
): ContextConsumptionEvidence {
  const captured = captureCanonicalBuilderRecord(input, "Consumption Evidence");
  const parsed = ContextConsumptionEvidenceSchema.parse({
    ...captured,
    consumptionId: "consumption-placeholder",
    consumptionFingerprint: EMPTY_FINGERPRINT,
  });
  const {
    consumptionId: _placeholderId,
    consumptionFingerprint: _placeholderFingerprint,
    ...normalized
  } = parsed;
  void _placeholderId;
  void _placeholderFingerprint;
  const consumptionFingerprint = createCanonicalSha256Fingerprint(normalized);
  return immutableCopy(
    ContextConsumptionEvidenceSchema.parse({
      ...normalized,
      consumptionId: `consumption-${consumptionFingerprint}`,
      consumptionFingerprint,
    }),
  );
}

export interface VerifyContextConsumptionEvidenceInput {
  readonly evidence: unknown;
  readonly receipt: unknown;
  readonly envelope: unknown;
  readonly acknowledgment: unknown;
  readonly receivedAt: string;
}

export function verifyContextConsumptionEvidence(
  input: VerifyContextConsumptionEvidenceInput,
): ContextDeliveryArtifactVerificationResult {
  const local = verifyFingerprintArtifact({
    artifactType: "consumption-evidence",
    fingerprintField: "consumptionFingerprint",
    idField: "consumptionId",
    idPrefix: "consumption-",
    schema: ContextConsumptionEvidenceSchema,
    value: input.evidence,
  });
  if (local.status !== "valid") return local;
  const evidence = ContextConsumptionEvidenceSchema.parse(input.evidence);
  const receipt = ContextDeliveryReceiptSchema.safeParse(input.receipt);
  const receiptVerification = verifyContextDeliveryReceipt({
    receipt: input.receipt,
    envelope: input.envelope,
    acknowledgment: input.acknowledgment,
    receivedAt: input.receivedAt,
  });
  return receipt.success &&
    receiptVerification.status === "valid" &&
    receipt.data.receiptId === evidence.receiptId
    ? local
    : verificationResult("consumption-evidence", null, [
        verificationIssue(
          "receipt_binding_mismatch",
          "receiptId",
          "Consumption Evidence does not bind a valid Delivery Receipt",
        ),
      ]);
}

export function createContextDeliveryAttemptEvidence(input: {
  deliveryRequestId: string | null;
  contextPackageId: string | null;
  consumerId: string | null;
  evaluatedAt: string;
  deliveryStatus: ContextDeliveryAttemptEvidence["deliveryStatus"];
  issues: readonly ContextDeliveryIssue[];
}): ContextDeliveryAttemptEvidence {
  const issues = [...input.issues].sort((left, right) =>
    compareStrings(
      `${left.code}\0${left.path}\0${left.message}`,
      `${right.code}\0${right.path}\0${right.message}`,
    ),
  );
  const unsigned = {
    schemaVersion: "1.0" as const,
    deliveryRequestId: input.deliveryRequestId,
    contextPackageId: input.contextPackageId,
    consumerId: input.consumerId,
    evaluatedAt: input.evaluatedAt,
    deliveryStatus: input.deliveryStatus,
    reasonCodes: [...new Set(issues.map((issue) => issue.code))].sort(compareStrings),
    issues,
  };
  return immutableCopy(
    ContextDeliveryAttemptEvidenceSchema.parse({
      ...unsigned,
      attemptFingerprint: createCanonicalSha256Fingerprint(unsigned),
    }),
  );
}

export function createGovernedContextDeliveryRejected(
  evidence: ContextDeliveryAttemptEvidence,
): GovernedContextDeliveryResult {
  return immutableCopy(
    GovernedContextDeliveryResultSchema.parse({
      schemaVersion: "1.0",
      status: "rejected",
      evidence,
    }),
  );
}

export function serializeGovernedContextDeliveryResult(
  result: GovernedContextDeliveryResult,
): string {
  return serializeCanonicalValue(GovernedContextDeliveryResultSchema.parse(result));
}
