import {
  AuthorizationDecisionEvidenceSchema,
  CircuitStateSchema,
  CostAndBudgetDecisionSchema,
  CredentialReferenceSchema,
  ObservabilityReadinessEvidenceSchema,
  PricingReferenceSchema,
  ProductionProviderAdapterDescriptorSchema,
  ProductionProviderReadinessDecisionSchema,
  ProviderHealthEvidenceSchema,
  ProviderObservabilityRetentionEvidenceSchema,
  ProviderRateAndCapacityDecisionSchema,
  ProviderReadinessArtifactVerificationResultSchema,
  ProviderRequestPlanSchema,
  ProviderResponseMappingEvidenceSchema,
  ProviderTransportPlanSchema,
  SecureTransportPolicySchema,
  findDurableCanonicalJsonIssue,
  type AuthorizationDecisionEvidence,
  type CircuitState,
  type CostAndBudgetDecision,
  type CredentialReference,
  type ObservabilityReadinessEvidence,
  type PricingReference,
  type ProductionProviderAdapterDescriptor,
  type ProviderHealthEvidence,
  type ProviderRateAndCapacityDecision,
  type ProviderReadinessArtifactVerificationResult,
  type ProviderTransportPlan,
  type ReasoningInvocationRequest,
  type ReasoningProviderCapabilityDescriptor,
  type SecureTransportPolicy,
} from "@founderos/knowledge-schema";

import {
  createDurableCanonicalJsonSha256Fingerprint,
  serializeDurableCanonicalJsonValue,
} from "./canonical-fingerprint.js";
import {
  countCanonicalCharacters,
  verifyReasoningInvocationRequest,
  verifyReasoningProviderCapabilityDescriptor,
} from "./reasoning.js";
import { deepFreeze } from "./snapshot-lifecycle.js";

type CanonicalRecord = Readonly<Record<string, unknown>>;
type Schema<T> = { parse(input: unknown): T };
type ReadinessArtifactType = ProviderReadinessArtifactVerificationResult["artifactType"];
type VerificationIssueCode = ProviderReadinessArtifactVerificationResult["issues"][number]["code"];

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;

export class ProviderReadinessIntegrityError extends Error {
  public constructor(
    public readonly code:
      | "binding_mismatch"
      | "fingerprint_mismatch"
      | "invalid_artifact"
      | "invalid_chronology"
      | "unsafe_content",
    message: string,
  ) {
    super(message);
    this.name = "ProviderReadinessIntegrityError";
  }
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function captureRecord(value: unknown, label: string): CanonicalRecord {
  if (findDurableCanonicalJsonIssue(value) !== null || value === null || Array.isArray(value)) {
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      `${label} must contain only accessor-free canonical data`,
    );
  }
  return immutableCopy(value as CanonicalRecord);
}

function omitField(value: CanonicalRecord, field: string): CanonicalRecord {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== field));
}

function requireExactKeys(
  value: CanonicalRecord,
  expectedKeys: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (!sameCanonical(actual, expected)) {
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      `${label} contains unknown fields`,
    );
  }
}

function parseSigned<T>(
  schema: Schema<T>,
  unsignedInput: unknown,
  fingerprintField: string,
  label: string,
): T {
  try {
    const unsigned = captureRecord(unsignedInput, label);
    return immutableCopy(
      schema.parse({
        ...unsigned,
        [fingerprintField]: createDurableCanonicalJsonSha256Fingerprint(unsigned),
      }),
    );
  } catch (error) {
    if (error instanceof ProviderReadinessIntegrityError) throw error;
    throw new ProviderReadinessIntegrityError("invalid_artifact", `${label} is invalid`);
  }
}

function invalidVerification(
  artifactType: ReadinessArtifactType,
  code: VerificationIssueCode,
  path: string,
): ProviderReadinessArtifactVerificationResult {
  return immutableCopy(
    ProviderReadinessArtifactVerificationResultSchema.parse({
      schemaVersion: "1.0",
      artifactType,
      status: "invalid",
      fingerprint: null,
      issues: [
        {
          code,
          path,
          message: "Provider readiness artifact verification failed",
        },
      ],
    }),
  );
}

function validVerification(
  artifactType: ReadinessArtifactType,
  fingerprint: string,
): ProviderReadinessArtifactVerificationResult {
  return immutableCopy(
    ProviderReadinessArtifactVerificationResultSchema.parse({
      schemaVersion: "1.0",
      artifactType,
      status: "valid",
      fingerprint,
      issues: [],
    }),
  );
}

const ARTIFACT_DEFINITIONS = {
  "authorization-decision-evidence": {
    schema: AuthorizationDecisionEvidenceSchema,
    fingerprintField: "decisionFingerprint",
  },
  "circuit-state": { schema: CircuitStateSchema, fingerprintField: "stateFingerprint" },
  "cost-and-budget-decision": {
    schema: CostAndBudgetDecisionSchema,
    fingerprintField: "decisionFingerprint",
  },
  "credential-reference": {
    schema: CredentialReferenceSchema,
    fingerprintField: "referenceFingerprint",
  },
  "observability-readiness-evidence": {
    schema: ObservabilityReadinessEvidenceSchema,
    fingerprintField: "readinessFingerprint",
  },
  "provider-observability-retention-evidence": {
    schema: ProviderObservabilityRetentionEvidenceSchema,
    fingerprintField: "retentionFingerprint",
  },
  "pricing-reference": { schema: PricingReferenceSchema, fingerprintField: "pricingFingerprint" },
  "production-provider-adapter-descriptor": {
    schema: ProductionProviderAdapterDescriptorSchema,
    fingerprintField: "adapterFingerprint",
  },
  "production-provider-readiness-decision": {
    schema: ProductionProviderReadinessDecisionSchema,
    fingerprintField: "decisionFingerprint",
  },
  "provider-health-evidence": {
    schema: ProviderHealthEvidenceSchema,
    fingerprintField: "healthFingerprint",
  },
  "provider-request-plan": {
    schema: ProviderRequestPlanSchema,
    fingerprintField: "requestPlanFingerprint",
  },
  "provider-response-mapping-evidence": {
    schema: ProviderResponseMappingEvidenceSchema,
    fingerprintField: "mappingEvidenceFingerprint",
  },
  "rate-and-capacity-decision": {
    schema: ProviderRateAndCapacityDecisionSchema,
    fingerprintField: "decisionFingerprint",
  },
  "secure-transport-policy": {
    schema: SecureTransportPolicySchema,
    fingerprintField: "policyFingerprint",
  },
  "transport-plan": { schema: ProviderTransportPlanSchema, fingerprintField: "planFingerprint" },
} as const;

type GenericSupportedArtifactType = keyof typeof ARTIFACT_DEFINITIONS;

export function fingerprintProviderReadinessArtifact(unsignedArtifact: unknown): string {
  return createDurableCanonicalJsonSha256Fingerprint(
    captureRecord(unsignedArtifact, "Provider readiness unsigned artifact"),
  );
}

export function verifyProviderReadinessArtifactFingerprint(
  artifactType: GenericSupportedArtifactType,
  raw: unknown,
): ProviderReadinessArtifactVerificationResult {
  const definition = ARTIFACT_DEFINITIONS[artifactType];
  try {
    const canonical = captureRecord(raw, artifactType);
    const parsed = definition.schema.parse(canonical) as CanonicalRecord;
    const stored = parsed[definition.fingerprintField];
    const expected = createDurableCanonicalJsonSha256Fingerprint(
      omitField(parsed, definition.fingerprintField),
    );
    if (typeof stored !== "string" || stored !== expected) {
      return invalidVerification(artifactType, "fingerprint_mismatch", definition.fingerprintField);
    }
    return validVerification(artifactType, stored);
  } catch (error) {
    return invalidVerification(
      artifactType,
      error instanceof ProviderReadinessIntegrityError ? "noncanonical_value" : "unsafe_content",
      "artifact",
    );
  }
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return serializeDurableCanonicalJsonValue(left) === serializeDurableCanonicalJsonValue(right);
  } catch {
    return false;
  }
}

function semanticVerification(
  artifactType: GenericSupportedArtifactType,
  actual: unknown,
  expected: unknown,
  mismatchCode: VerificationIssueCode,
  mismatchPath: string,
): ProviderReadinessArtifactVerificationResult {
  const basic = verifyProviderReadinessArtifactFingerprint(artifactType, actual);
  if (basic.status !== "valid") return basic;
  if (!sameCanonical(actual, expected)) {
    return invalidVerification(artifactType, mismatchCode, mismatchPath);
  }
  return basic;
}

function assertM13Authority(
  invocationRequest: ReasoningInvocationRequest,
  providerCapability: ReasoningProviderCapabilityDescriptor,
): void {
  if (
    verifyReasoningInvocationRequest(invocationRequest).status !== "valid" ||
    verifyReasoningProviderCapabilityDescriptor(providerCapability).status !== "valid"
  ) {
    throw new ProviderReadinessIntegrityError(
      "fingerprint_mismatch",
      "Authoritative Milestone 13 artifacts do not verify",
    );
  }
}

export type ProductionProviderAdapterDescriptorInput = Omit<
  ProductionProviderAdapterDescriptor,
  "adapterFingerprint" | "providerCapabilityFingerprint" | "providerCapabilityId"
>;

export function createProductionProviderAdapterDescriptor(
  input: ProductionProviderAdapterDescriptorInput,
  providerCapability: ReasoningProviderCapabilityDescriptor,
): ProductionProviderAdapterDescriptor {
  const captured = captureRecord(input, "Production Provider Adapter input");
  requireExactKeys(
    captured,
    [
      "schemaVersion",
      "adapterId",
      "providerFamilyReference",
      "requestMappingVersion",
      "responseMappingVersion",
      "transportPolicyVersion",
      "observabilityPolicyVersion",
      "credentialReferenceClass",
      "state",
    ],
    "Production Provider Adapter input",
  );
  if (verifyReasoningProviderCapabilityDescriptor(providerCapability).status !== "valid") {
    throw new ProviderReadinessIntegrityError(
      "fingerprint_mismatch",
      "Provider Capability does not verify",
    );
  }
  return parseSigned(
    ProductionProviderAdapterDescriptorSchema,
    {
      ...captured,
      providerCapabilityId: providerCapability.providerCapabilityId,
      providerCapabilityFingerprint: providerCapability.descriptorFingerprint,
    },
    "adapterFingerprint",
    "Production Provider Adapter Descriptor",
  );
}

export function verifyProductionProviderAdapterDescriptor(input: {
  readonly descriptor: unknown;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Adapter verification input");
    const descriptor = ProductionProviderAdapterDescriptorSchema.parse(wrapper.descriptor);
    const capability = wrapper.providerCapability as ReasoningProviderCapabilityDescriptor;
    if (verifyReasoningProviderCapabilityDescriptor(capability).status !== "valid") {
      return invalidVerification(
        "production-provider-adapter-descriptor",
        "adapter_binding_mismatch",
        "providerCapability",
      );
    }
    const {
      adapterFingerprint: _adapterFingerprint,
      providerCapabilityFingerprint: _providerCapabilityFingerprint,
      providerCapabilityId: _providerCapabilityId,
      ...unsignedDescriptor
    } = descriptor;
    void _adapterFingerprint;
    void _providerCapabilityFingerprint;
    void _providerCapabilityId;
    const expected = createProductionProviderAdapterDescriptor(unsignedDescriptor, capability);
    return semanticVerification(
      "production-provider-adapter-descriptor",
      descriptor,
      expected,
      "adapter_binding_mismatch",
      "providerCapability",
    );
  } catch {
    return invalidVerification(
      "production-provider-adapter-descriptor",
      "adapter_binding_mismatch",
      "descriptor",
    );
  }
}

export interface ResolvedDurableDeliveryAuthorityProjection {
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly transaction: Readonly<{
    transactionId: string;
    transactionFingerprint: string;
    requestRegistration: Readonly<{
      deliveryRequestId: string;
      deliveryRequestFingerprint: string;
    }>;
  }>;
  readonly deliveryRequest: Readonly<{
    deliveryRequestId: string;
    requestFingerprint: string;
    contextPackageId: string;
    contextPackageFingerprint: string;
    consumerDescriptorFingerprint: string;
    consumer: Readonly<{
      consumerId: string;
      descriptorFingerprint: string;
    }>;
    policyInput: Readonly<{ subjectReference: string }>;
  }>;
  readonly envelope: Readonly<{
    deliveryEnvelopeId: string;
    deliveryFingerprint: string;
    deliveryRequestId: string;
    deliveryRequestFingerprint: string;
    contextPackageId: string;
    contextPackageFingerprint: string;
    consumerId: string;
    consumerDescriptorFingerprint: string;
  }>;
  readonly receipt: Readonly<{
    receiptId: string;
    receiptFingerprint: string;
    deliveryEnvelopeId: string;
    deliveryEnvelopeFingerprint: string;
    contextPackageId: string;
    contextPackageFingerprint: string;
    consumerId: string;
    consumerDescriptorFingerprint: string;
    deliveryStatus: string;
  }>;
}

export interface AuthorizationAuthority {
  readonly deliveryAuthority: ResolvedDurableDeliveryAuthorityProjection;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly requestedOperation: AuthorizationDecisionEvidence["requestedOperation"];
  readonly decisionAuthorityReference: string;
}

export interface AuthorizationDecisionInput {
  readonly authorizationDecisionId: string;
  readonly decidedAt: string;
  readonly expiresAt: string;
  readonly outcome: AuthorizationDecisionEvidence["outcome"];
}

const AUTHORIZATION_REASON = {
  allowed: "authorization_allowed",
  denied: "authorization_denied",
  expired: "authorization_expired",
  "invalid-evidence": "authorization_invalid_evidence",
  "not-evaluated": "authorization_not_evaluated",
  "review-required": "authorization_review_required",
} as const;

export function createAuthorizationDecisionEvidence(
  decision: AuthorizationDecisionInput,
  authority: AuthorizationAuthority,
): AuthorizationDecisionEvidence {
  const capturedDecision = captureRecord(decision, "Authorization decision input");
  const capturedAuthority = captureRecord(authority, "Authorization authority");
  requireExactKeys(
    capturedDecision,
    ["authorizationDecisionId", "decidedAt", "expiresAt", "outcome"],
    "Authorization decision input",
  );
  requireExactKeys(
    capturedAuthority,
    ["deliveryAuthority", "adapter", "requestedOperation", "decisionAuthorityReference"],
    "Authorization authority",
  );
  const deliveryAuthority =
    capturedAuthority.deliveryAuthority as unknown as ResolvedDurableDeliveryAuthorityProjection;
  const request = deliveryAuthority.invocationRequest;
  const currentAdapter = capturedAuthority.adapter as ProductionProviderAdapterDescriptor;
  if (
    verifyReasoningInvocationRequest(request).status !== "valid" ||
    verifyProviderReadinessArtifactFingerprint(
      "production-provider-adapter-descriptor",
      currentAdapter,
    ).status !== "valid"
  ) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Authorization authority is invalid",
    );
  }
  const transaction = deliveryAuthority.transaction;
  const deliveryRequest = deliveryAuthority.deliveryRequest;
  const envelope = deliveryAuthority.envelope;
  const receipt = deliveryAuthority.receipt;
  const exactDelivery =
    transaction.transactionId === request.deliveryTransactionId &&
    transaction.requestRegistration.deliveryRequestId === deliveryRequest.deliveryRequestId &&
    transaction.requestRegistration.deliveryRequestFingerprint ===
      deliveryRequest.requestFingerprint &&
    envelope.deliveryRequestId === deliveryRequest.deliveryRequestId &&
    envelope.deliveryRequestFingerprint === deliveryRequest.requestFingerprint &&
    deliveryRequest.contextPackageId === request.contextPackageId &&
    deliveryRequest.contextPackageFingerprint === request.contextPackageFingerprint &&
    deliveryRequest.consumer.consumerId === request.consumerId &&
    deliveryRequest.consumer.descriptorFingerprint === request.consumerDescriptorFingerprint &&
    deliveryRequest.consumerDescriptorFingerprint === request.consumerDescriptorFingerprint &&
    envelope.deliveryEnvelopeId === request.deliveryEnvelopeId &&
    envelope.deliveryFingerprint === request.deliveryEnvelopeFingerprint &&
    envelope.contextPackageId === request.contextPackageId &&
    envelope.contextPackageFingerprint === request.contextPackageFingerprint &&
    envelope.consumerId === request.consumerId &&
    envelope.consumerDescriptorFingerprint === request.consumerDescriptorFingerprint &&
    receipt.receiptId === request.deliveryReceiptId &&
    receipt.receiptFingerprint === request.deliveryReceiptFingerprint &&
    receipt.deliveryEnvelopeId === request.deliveryEnvelopeId &&
    receipt.deliveryEnvelopeFingerprint === request.deliveryEnvelopeFingerprint &&
    receipt.contextPackageId === request.contextPackageId &&
    receipt.contextPackageFingerprint === request.contextPackageFingerprint &&
    receipt.consumerId === request.consumerId &&
    receipt.consumerDescriptorFingerprint === request.consumerDescriptorFingerprint &&
    receipt.deliveryStatus === "accepted";
  if (!exactDelivery) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Authorization requires one exact resolved Durable Delivery authority",
    );
  }
  const decidedAt = String(capturedDecision.decidedAt);
  const expiresAt = String(capturedDecision.expiresAt);
  if (
    !Number.isFinite(Date.parse(decidedAt)) ||
    !Number.isFinite(Date.parse(expiresAt)) ||
    Date.parse(decidedAt) < Date.parse(request.requestedAt) ||
    Date.parse(expiresAt) <= Date.parse(decidedAt)
  ) {
    throw new ProviderReadinessIntegrityError(
      "invalid_chronology",
      "Authorization expiration must follow the decision",
    );
  }
  const outcome = capturedDecision.outcome as AuthorizationDecisionEvidence["outcome"];
  return parseSigned(
    AuthorizationDecisionEvidenceSchema,
    {
      schemaVersion: "1.0",
      authorizationDecisionId: capturedDecision.authorizationDecisionId,
      subjectReference: deliveryRequest.policyInput.subjectReference,
      consumerId: request.consumerId,
      consumerDescriptorFingerprint: request.consumerDescriptorFingerprint,
      invocationRequestId: request.invocationRequestId,
      invocationRequestFingerprint: request.requestFingerprint,
      deliveryTransactionId: request.deliveryTransactionId,
      deliveryTransactionFingerprint: transaction.transactionFingerprint,
      contextPackageId: request.contextPackageId,
      contextPackageFingerprint: request.contextPackageFingerprint,
      adapterId: currentAdapter.adapterId,
      adapterFingerprint: currentAdapter.adapterFingerprint,
      requestedOperation: capturedAuthority.requestedOperation,
      decisionAuthorityReference: capturedAuthority.decisionAuthorityReference,
      decidedAt,
      expiresAt,
      outcome,
      reasonCodes: [AUTHORIZATION_REASON[outcome]],
    },
    "decisionFingerprint",
    "Authorization Decision Evidence",
  );
}

export function verifyAuthorizationDecisionEvidence(input: {
  readonly evidence: unknown;
  readonly authority: AuthorizationAuthority;
  readonly expectedDecision: AuthorizationDecisionInput;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Authorization verification input");
    const evidence = AuthorizationDecisionEvidenceSchema.parse(wrapper.evidence);
    const expected = createAuthorizationDecisionEvidence(
      wrapper.expectedDecision as unknown as AuthorizationDecisionInput,
      wrapper.authority as unknown as AuthorizationAuthority,
    );
    return semanticVerification(
      "authorization-decision-evidence",
      evidence,
      expected,
      "authorization_binding_mismatch",
      "authority",
    );
  } catch {
    return invalidVerification(
      "authorization-decision-evidence",
      "authorization_binding_mismatch",
      "evidence",
    );
  }
}

export type AuthorizationEnforcementResult =
  | Readonly<{
      status: "allowed";
      outcome: "allowed";
      decisionFingerprint: string;
      reasonCodes: readonly ["authorization_allowed"];
    }>
  | Readonly<{
      status: "rejected";
      outcome: AuthorizationDecisionEvidence["outcome"];
      decisionFingerprint: string | null;
      reasonCodes: readonly string[];
    }>;

export function enforceAuthorizationDecision(input: {
  readonly evidence: unknown;
  readonly authority: AuthorizationAuthority;
  readonly expectedDecision: AuthorizationDecisionInput;
  readonly evaluatedAt: string;
}): AuthorizationEnforcementResult {
  let captured: CanonicalRecord;
  try {
    captured = captureRecord(input, "Authorization enforcement input");
  } catch {
    return immutableCopy({
      status: "rejected",
      outcome: "invalid-evidence",
      decisionFingerprint: null,
      reasonCodes: ["authorization_invalid_evidence"],
    });
  }
  const verification = verifyAuthorizationDecisionEvidence({
    evidence: captured.evidence,
    authority: captured.authority as unknown as AuthorizationAuthority,
    expectedDecision: captured.expectedDecision as unknown as AuthorizationDecisionInput,
  });
  if (verification.status !== "valid") {
    return immutableCopy({
      status: "rejected",
      outcome: "invalid-evidence",
      decisionFingerprint: null,
      reasonCodes: ["authorization_invalid_evidence"],
    });
  }
  const evidence = captured.evidence as AuthorizationDecisionEvidence;
  const evaluatedAt = String(captured.evaluatedAt);
  if (
    !Number.isFinite(Date.parse(evaluatedAt)) ||
    Date.parse(evaluatedAt) < Date.parse(evidence.decidedAt)
  ) {
    return immutableCopy({
      status: "rejected",
      outcome: "invalid-evidence",
      decisionFingerprint: evidence.decisionFingerprint,
      reasonCodes: ["authorization_invalid_evidence"],
    });
  }
  if (Date.parse(evaluatedAt) >= Date.parse(evidence.expiresAt)) {
    return immutableCopy({
      status: "rejected",
      outcome: "expired",
      decisionFingerprint: evidence.decisionFingerprint,
      reasonCodes: ["authorization_expired"],
    });
  }
  if (evidence.outcome !== "allowed") {
    return immutableCopy({
      status: "rejected",
      outcome: evidence.outcome,
      decisionFingerprint: evidence.decisionFingerprint,
      reasonCodes: evidence.reasonCodes,
    });
  }
  return immutableCopy({
    status: "allowed",
    outcome: "allowed",
    decisionFingerprint: evidence.decisionFingerprint,
    reasonCodes: ["authorization_allowed"] as const,
  });
}

export type CredentialReferenceInput = Omit<CredentialReference, "referenceFingerprint">;

export interface CredentialReferenceExpectation extends Omit<
  CredentialReferenceInput,
  "schemaVersion"
> {
  readonly adapterCredentialReferenceClass: ProductionProviderAdapterDescriptor["credentialReferenceClass"];
  readonly expectedAdapterFingerprint: string;
}

export function createCredentialReference(input: CredentialReferenceInput): CredentialReference {
  requireExactKeys(
    captureRecord(input, "Credential Reference input"),
    [
      "schemaVersion",
      "credentialReferenceId",
      "providerFamilyReference",
      "secretStoreClass",
      "scopeReference",
      "environmentClass",
      "rotationVersion",
      "availability",
    ],
    "Credential Reference input",
  );
  return parseSigned(
    CredentialReferenceSchema,
    input,
    "referenceFingerprint",
    "Credential Reference",
  );
}

export function verifyCredentialReference(input: {
  readonly reference: unknown;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly expected: CredentialReferenceExpectation;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Credential Reference verification input");
    const reference = CredentialReferenceSchema.parse(wrapper.reference);
    const currentAdapter = ProductionProviderAdapterDescriptorSchema.parse(wrapper.adapter);
    const expected = wrapper.expected as unknown as CredentialReferenceExpectation;
    if (
      verifyProviderReadinessArtifactFingerprint(
        "production-provider-adapter-descriptor",
        currentAdapter,
      ).status !== "valid" ||
      currentAdapter.providerFamilyReference !== expected.providerFamilyReference ||
      currentAdapter.credentialReferenceClass !== expected.adapterCredentialReferenceClass ||
      currentAdapter.adapterFingerprint !== expected.expectedAdapterFingerprint
    ) {
      return invalidVerification("credential-reference", "credential_reference_invalid", "adapter");
    }
    const expectedArtifact = createCredentialReference({
      schemaVersion: "1.0",
      credentialReferenceId: expected.credentialReferenceId,
      providerFamilyReference: expected.providerFamilyReference,
      secretStoreClass: expected.secretStoreClass,
      scopeReference: expected.scopeReference,
      environmentClass: expected.environmentClass,
      rotationVersion: expected.rotationVersion,
      availability: expected.availability,
    });
    return semanticVerification(
      "credential-reference",
      reference,
      expectedArtifact,
      "credential_reference_invalid",
      "expected",
    );
  } catch {
    return invalidVerification("credential-reference", "credential_reference_invalid", "reference");
  }
}

export type SecureTransportPolicyInput = Omit<SecureTransportPolicy, "policyFingerprint">;

function isReservedPublicHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  const reservedDomains = ["example.com", "example.net", "example.org", "home.arpa"];
  const reservedSuffixes = [
    "alt",
    "localhost",
    "local",
    "test",
    "example",
    "invalid",
    "onion",
    "arpa",
  ];
  return (
    reservedDomains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`)) ||
    reservedSuffixes.some((suffix) => normalized === suffix || normalized.endsWith(`.${suffix}`))
  );
}

export function createSecureTransportPolicy(
  input: SecureTransportPolicyInput,
): SecureTransportPolicy {
  const captured = captureRecord(input, "Secure Transport Policy input");
  requireExactKeys(
    captured,
    [
      "schemaVersion",
      "transportPolicyId",
      "providerFamilyReference",
      "allowedScheme",
      "allowedHostnames",
      "allowedPorts",
      "dnsResolutionPolicy",
      "redirectPolicy",
      "tlsRequired",
      "minimumTlsVersion",
      "certificateValidationPolicy",
      "connectionTimeoutMilliseconds",
      "requestTimeoutMilliseconds",
      "maximumRequestBytes",
      "maximumResponseBytes",
      "retryTransportPolicy",
      "proxyPolicy",
      "egressClassification",
    ],
    "Secure Transport Policy input",
  );
  const configuredHostnames = captured.allowedHostnames;
  if (
    captured.egressClassification === "public-provider" &&
    (!Array.isArray(configuredHostnames) ||
      configuredHostnames.some(
        (hostname) => typeof hostname !== "string" || isReservedPublicHostname(hostname),
      ))
  ) {
    throw new ProviderReadinessIntegrityError(
      "unsafe_content",
      "Public provider hostnames cannot use reserved or special-use names",
    );
  }
  return parseSigned(
    SecureTransportPolicySchema,
    {
      ...captured,
      allowedHostnames: [...(captured.allowedHostnames as readonly string[])].sort(),
      allowedPorts: [...(captured.allowedPorts as readonly number[])].sort(
        (left, right) => left - right,
      ),
    },
    "policyFingerprint",
    "Secure Transport Policy",
  );
}

export function verifySecureTransportPolicy(input: {
  readonly policy: unknown;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly expectedPolicy: SecureTransportPolicyInput;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Secure Transport Policy verification input");
    const policy = SecureTransportPolicySchema.parse(wrapper.policy);
    const currentAdapter = ProductionProviderAdapterDescriptorSchema.parse(wrapper.adapter);
    if (
      verifyProviderReadinessArtifactFingerprint(
        "production-provider-adapter-descriptor",
        currentAdapter,
      ).status !== "valid" ||
      currentAdapter.providerFamilyReference !== policy.providerFamilyReference ||
      currentAdapter.transportPolicyVersion !== policy.schemaVersion
    ) {
      return invalidVerification("secure-transport-policy", "transport_policy_invalid", "adapter");
    }
    const expected = createSecureTransportPolicy(
      wrapper.expectedPolicy as unknown as SecureTransportPolicyInput,
    );
    return semanticVerification(
      "secure-transport-policy",
      policy,
      expected,
      "transport_policy_invalid",
      "expectedPolicy",
    );
  } catch {
    return invalidVerification("secure-transport-policy", "transport_policy_invalid", "policy");
  }
}

/** Verifies the cross-layer Invocation deadline / Transport request-timeout boundary. */
export function verifyInvocationTransportTimeoutCompatibility(input: {
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly policy: SecureTransportPolicy;
}): boolean {
  try {
    const captured = captureRecord(input, "Invocation and Transport Policy compatibility");
    const request = captured.invocationRequest as ReasoningInvocationRequest;
    const policy = SecureTransportPolicySchema.parse(captured.policy);
    if (
      verifyReasoningInvocationRequest(request).status !== "valid" ||
      verifyProviderReadinessArtifactFingerprint("secure-transport-policy", policy).status !==
        "valid" ||
      request.executionPolicy.timeoutMilliseconds > policy.requestTimeoutMilliseconds
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function createProviderTransportPlan(input: {
  readonly transportPlanId: string;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly policy: SecureTransportPolicy;
}): ProviderTransportPlan {
  const captured = captureRecord(input, "Transport Plan input");
  requireExactKeys(captured, ["transportPlanId", "adapter", "policy"], "Transport Plan input");
  const currentAdapter = ProductionProviderAdapterDescriptorSchema.parse(captured.adapter);
  const currentPolicy = SecureTransportPolicySchema.parse(captured.policy);
  if (
    verifyProviderReadinessArtifactFingerprint(
      "production-provider-adapter-descriptor",
      currentAdapter,
    ).status !== "valid" ||
    verifyProviderReadinessArtifactFingerprint("secure-transport-policy", currentPolicy).status !==
      "valid" ||
    currentAdapter.providerFamilyReference !== currentPolicy.providerFamilyReference
  ) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Transport Plan authority does not verify",
    );
  }
  return parseSigned(
    ProviderTransportPlanSchema,
    {
      schemaVersion: "1.0",
      transportPlanId: captured.transportPlanId,
      adapterId: currentAdapter.adapterId,
      adapterFingerprint: currentAdapter.adapterFingerprint,
      transportPolicyId: currentPolicy.transportPolicyId,
      transportPolicyFingerprint: currentPolicy.policyFingerprint,
      providerFamilyReference: currentPolicy.providerFamilyReference,
      scheme: currentPolicy.allowedScheme,
      hostname: currentPolicy.allowedHostnames[0],
      port: currentPolicy.allowedPorts[0],
      dnsResolutionPolicy: currentPolicy.dnsResolutionPolicy,
      redirectPolicy: currentPolicy.redirectPolicy,
      tlsRequired: currentPolicy.tlsRequired,
      minimumTlsVersion: currentPolicy.minimumTlsVersion,
      certificateValidationPolicy: currentPolicy.certificateValidationPolicy,
      connectionTimeoutMilliseconds: currentPolicy.connectionTimeoutMilliseconds,
      requestTimeoutMilliseconds: currentPolicy.requestTimeoutMilliseconds,
      maximumRequestBytes: currentPolicy.maximumRequestBytes,
      maximumResponseBytes: currentPolicy.maximumResponseBytes,
      retryTransportPolicy: currentPolicy.retryTransportPolicy,
      proxyPolicy: currentPolicy.proxyPolicy,
      egressClassification: currentPolicy.egressClassification,
      status: "validated-dry-run",
      reasonCodes: ["transport_plan_valid"],
    },
    "planFingerprint",
    "Provider Transport Plan",
  );
}

export function verifyProviderTransportPlan(input: {
  readonly plan: unknown;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly policy: SecureTransportPolicy;
  readonly expectedTransportPlanId: string;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Transport Plan verification input");
    const plan = ProviderTransportPlanSchema.parse(wrapper.plan);
    const expected = createProviderTransportPlan({
      transportPlanId: String(wrapper.expectedTransportPlanId),
      adapter: wrapper.adapter as ProductionProviderAdapterDescriptor,
      policy: wrapper.policy as SecureTransportPolicy,
    });
    return semanticVerification(
      "transport-plan",
      plan,
      expected,
      "transport_policy_invalid",
      "plan",
    );
  } catch {
    return invalidVerification("transport-plan", "transport_policy_invalid", "plan");
  }
}

export interface RateAndCapacityPolicy {
  readonly capacityPolicyVersion: "1.0";
  readonly windowDurationMilliseconds: number;
  readonly requestLimit: number;
  readonly concurrentLimit: number;
  readonly maximumQueuedRequests: number;
  readonly consumerQuotaLimit: number;
  readonly policyPermitsAdmission: boolean;
}

export interface RateAndCapacityCounters {
  readonly windowStartedAt: string;
  readonly requestsInWindow: number;
  readonly concurrentInFlight: number;
  readonly queuedRequests: number;
  readonly consumerQuotaUsed: number;
  readonly providerCapacityState: ProviderRateAndCapacityDecision["providerCapacityState"];
}

export interface RateAndCapacityEvaluationInput {
  readonly decisionId: string;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly policy: RateAndCapacityPolicy;
  readonly counters: RateAndCapacityCounters;
  readonly priorityClass: ProviderRateAndCapacityDecision["priorityClass"];
  readonly evaluatedAt: string;
}

function isSafeInteger(value: unknown, minimum: number): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= MAX_SAFE_INTEGER
  );
}

export function evaluateProviderRateAndCapacity(
  input: RateAndCapacityEvaluationInput,
): ProviderRateAndCapacityDecision {
  const captured = captureRecord(input, "Rate and Capacity evaluation input");
  requireExactKeys(
    captured,
    [
      "decisionId",
      "invocationRequest",
      "adapter",
      "policy",
      "counters",
      "priorityClass",
      "evaluatedAt",
    ],
    "Rate and Capacity evaluation input",
  );
  const request = captured.invocationRequest as ReasoningInvocationRequest;
  const currentAdapter = captured.adapter as ProductionProviderAdapterDescriptor;
  const policy = captured.policy as unknown as RateAndCapacityPolicy;
  const counters = captured.counters as unknown as RateAndCapacityCounters;
  requireExactKeys(
    captured.policy as CanonicalRecord,
    [
      "capacityPolicyVersion",
      "windowDurationMilliseconds",
      "requestLimit",
      "concurrentLimit",
      "maximumQueuedRequests",
      "consumerQuotaLimit",
      "policyPermitsAdmission",
    ],
    "Rate and Capacity policy",
  );
  requireExactKeys(
    captured.counters as CanonicalRecord,
    [
      "windowStartedAt",
      "requestsInWindow",
      "concurrentInFlight",
      "queuedRequests",
      "consumerQuotaUsed",
      "providerCapacityState",
    ],
    "Rate and Capacity counters",
  );
  if (
    verifyReasoningInvocationRequest(request).status !== "valid" ||
    verifyProviderReadinessArtifactFingerprint(
      "production-provider-adapter-descriptor",
      currentAdapter,
    ).status !== "valid" ||
    !isSafeInteger(policy.windowDurationMilliseconds, 1) ||
    !isSafeInteger(policy.requestLimit, 1) ||
    !isSafeInteger(policy.concurrentLimit, 1) ||
    !isSafeInteger(policy.maximumQueuedRequests, 0) ||
    !isSafeInteger(policy.consumerQuotaLimit, 1) ||
    typeof policy.policyPermitsAdmission !== "boolean" ||
    !isSafeInteger(counters.requestsInWindow, 0) ||
    !isSafeInteger(counters.concurrentInFlight, 0) ||
    !isSafeInteger(counters.queuedRequests, 0) ||
    !isSafeInteger(counters.consumerQuotaUsed, 0)
  ) {
    throw new ProviderReadinessIntegrityError("invalid_artifact", "Rate policy is invalid");
  }
  const evaluatedAt = String(captured.evaluatedAt);
  const suppliedWindowStart = counters.windowStartedAt;
  const elapsed = Date.parse(evaluatedAt) - Date.parse(suppliedWindowStart);
  if (!Number.isFinite(elapsed) || elapsed < 0) {
    throw new ProviderReadinessIntegrityError(
      "invalid_chronology",
      "Rate evaluation cannot precede its window",
    );
  }
  const windowExpired = elapsed >= policy.windowDurationMilliseconds;
  const windowStartedAt = windowExpired ? evaluatedAt : suppliedWindowStart;
  const requestsInWindow = windowExpired ? 0 : counters.requestsInWindow;
  let outcome: ProviderRateAndCapacityDecision["outcome"] = "admitted";
  let reasonCodes: ProviderRateAndCapacityDecision["reasonCodes"] = ["admitted"];
  let retryAfterMilliseconds: number | null = null;

  if (!policy.policyPermitsAdmission) {
    outcome = "policy-denied";
    reasonCodes = ["policy_denied"];
  } else if (counters.providerCapacityState === "unavailable") {
    outcome = "provider-unavailable";
    reasonCodes = ["provider_unavailable"];
    retryAfterMilliseconds = policy.windowDurationMilliseconds;
  } else if (counters.consumerQuotaUsed >= policy.consumerQuotaLimit) {
    outcome = "policy-denied";
    reasonCodes = ["consumer_quota_exceeded", "policy_denied"];
  } else if (requestsInWindow >= policy.requestLimit) {
    outcome = "rate-limited";
    reasonCodes = ["rate_limit_exceeded"];
    retryAfterMilliseconds = Math.max(
      1,
      policy.windowDurationMilliseconds - (Date.parse(evaluatedAt) - Date.parse(windowStartedAt)),
    );
  } else if (
    counters.concurrentInFlight >= policy.concurrentLimit &&
    counters.queuedRequests >= policy.maximumQueuedRequests
  ) {
    outcome = "queue-full";
    reasonCodes = ["queue_full"];
    retryAfterMilliseconds = 1_000;
  } else if (
    counters.providerCapacityState === "degraded" ||
    counters.concurrentInFlight >= policy.concurrentLimit
  ) {
    outcome = "capacity-exhausted";
    reasonCodes = ["capacity_exhausted"];
    retryAfterMilliseconds = 1_000;
  }

  return parseSigned(
    ProviderRateAndCapacityDecisionSchema,
    {
      schemaVersion: "1.0",
      decisionId: captured.decisionId,
      invocationRequestFingerprint: request.requestFingerprint,
      adapterFingerprint: currentAdapter.adapterFingerprint,
      capacityPolicyVersion: policy.capacityPolicyVersion,
      evaluatedAt,
      windowStartedAt,
      windowDurationMilliseconds: policy.windowDurationMilliseconds,
      requestsInWindow,
      requestLimit: policy.requestLimit,
      concurrentInFlight: counters.concurrentInFlight,
      concurrentLimit: policy.concurrentLimit,
      queuedRequests: counters.queuedRequests,
      maximumQueuedRequests: policy.maximumQueuedRequests,
      consumerQuotaUsed: counters.consumerQuotaUsed,
      consumerQuotaLimit: policy.consumerQuotaLimit,
      providerCapacityState: counters.providerCapacityState,
      priorityClass: captured.priorityClass,
      retryAfterMilliseconds,
      outcome,
      reasonCodes: [...reasonCodes].sort(),
    },
    "decisionFingerprint",
    "Rate and Capacity Decision",
  );
}

export function verifyProviderRateAndCapacityDecision(input: {
  readonly decision: unknown;
  readonly evaluation: RateAndCapacityEvaluationInput;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Rate and Capacity verification input");
    const expected = evaluateProviderRateAndCapacity(
      wrapper.evaluation as unknown as RateAndCapacityEvaluationInput,
    );
    return semanticVerification(
      "rate-and-capacity-decision",
      wrapper.decision,
      expected,
      "capacity_arithmetic_invalid",
      "evaluation",
    );
  } catch {
    return invalidVerification(
      "rate-and-capacity-decision",
      "capacity_arithmetic_invalid",
      "decision",
    );
  }
}

export type PricingReferenceInput = Omit<PricingReference, "pricingFingerprint">;

export function createPricingReference(input: PricingReferenceInput): PricingReference {
  requireExactKeys(
    captureRecord(input, "Pricing Reference input"),
    [
      "schemaVersion",
      "pricingReferenceId",
      "providerFamilyReference",
      "pricingVersion",
      "currencyCode",
      "inputUnitSize",
      "inputUnitPriceMinorUnits",
      "outputUnitSize",
      "outputUnitPriceMinorUnits",
      "availability",
      "effectiveAt",
    ],
    "Pricing Reference input",
  );
  return parseSigned(PricingReferenceSchema, input, "pricingFingerprint", "Pricing Reference");
}

export function verifyPricingReference(input: {
  readonly pricingReference: unknown;
  readonly expected: PricingReferenceInput | PricingReference;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Pricing Reference verification input");
    const expectedRecord = captureRecord(wrapper.expected, "Expected Pricing Reference");
    const expected = createPricingReference(
      omitField(expectedRecord, "pricingFingerprint") as PricingReferenceInput,
    );
    return semanticVerification(
      "pricing-reference",
      wrapper.pricingReference,
      expected,
      "cost_arithmetic_invalid",
      "expected",
    );
  } catch {
    return invalidVerification("pricing-reference", "cost_arithmetic_invalid", "pricingReference");
  }
}

export interface CostAndBudgetPolicy {
  readonly budgetPolicyVersion: "1.0";
  readonly budgetReference: string;
  readonly currencyCode: string;
  readonly maximumInputUnits: number;
  readonly maximumOutputUnits: number;
  readonly costCeilingMinorUnits: number;
  readonly maximumAttemptCount: number;
  readonly timeoutBudgetMilliseconds: number;
  readonly costCeilingMandatory: boolean;
  readonly manualReviewRequired: boolean;
}

export interface CostAndBudgetEvaluationInput {
  readonly decisionId: string;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly pricingReference: PricingReference;
  readonly policy: CostAndBudgetPolicy;
  readonly evaluatedAt: string;
}

function checkedCeilingCost(units: number, unitSize: number, unitPrice: number): bigint {
  return ((BigInt(units) + BigInt(unitSize) - 1n) / BigInt(unitSize)) * BigInt(unitPrice);
}

export function evaluateCostAndBudget(input: CostAndBudgetEvaluationInput): CostAndBudgetDecision {
  const captured = captureRecord(input, "Cost and Budget evaluation input");
  requireExactKeys(
    captured,
    [
      "decisionId",
      "invocationRequest",
      "providerCapability",
      "adapter",
      "pricingReference",
      "policy",
      "evaluatedAt",
    ],
    "Cost and Budget evaluation input",
  );
  const request = captured.invocationRequest as ReasoningInvocationRequest;
  const providerCapability = captured.providerCapability as ReasoningProviderCapabilityDescriptor;
  const currentAdapter = captured.adapter as ProductionProviderAdapterDescriptor;
  const currentPricing = PricingReferenceSchema.parse(captured.pricingReference);
  const policy = captured.policy as unknown as CostAndBudgetPolicy;
  requireExactKeys(
    captured.policy as CanonicalRecord,
    [
      "budgetPolicyVersion",
      "budgetReference",
      "currencyCode",
      "maximumInputUnits",
      "maximumOutputUnits",
      "costCeilingMinorUnits",
      "maximumAttemptCount",
      "timeoutBudgetMilliseconds",
      "costCeilingMandatory",
      "manualReviewRequired",
    ],
    "Cost and Budget policy",
  );
  assertM13Authority(request, providerCapability);
  if (
    verifyProductionProviderAdapterDescriptor({
      descriptor: currentAdapter,
      providerCapability,
    }).status !== "valid" ||
    verifyProviderReadinessArtifactFingerprint("pricing-reference", currentPricing).status !==
      "valid"
  ) {
    throw new ProviderReadinessIntegrityError("binding_mismatch", "Cost authority does not verify");
  }
  const evaluatedAt = String(captured.evaluatedAt);
  if (!Number.isFinite(Date.parse(evaluatedAt))) {
    throw new ProviderReadinessIntegrityError(
      "invalid_chronology",
      "Cost evaluation time is invalid",
    );
  }
  const estimatedInputUnits = countCanonicalCharacters(request.reasoningInput);
  const estimatedOutputUnits = request.executionPolicy.maxOutputCharacters;
  const policyIntegersValid =
    isSafeInteger(policy.maximumInputUnits, 1) &&
    isSafeInteger(policy.maximumOutputUnits, 1) &&
    isSafeInteger(policy.costCeilingMinorUnits, 0) &&
    isSafeInteger(policy.maximumAttemptCount, 1) &&
    isSafeInteger(policy.timeoutBudgetMilliseconds, 1) &&
    typeof policy.costCeilingMandatory === "boolean" &&
    typeof policy.manualReviewRequired === "boolean";
  const exactBindingsValid =
    currentPricing.providerFamilyReference === currentAdapter.providerFamilyReference &&
    currentPricing.currencyCode === policy.currencyCode &&
    Date.parse(currentPricing.effectiveAt) <= Date.parse(evaluatedAt) &&
    policy.maximumAttemptCount >= request.executionPolicy.maxAttemptCount &&
    policy.timeoutBudgetMilliseconds >= request.executionPolicy.timeoutMilliseconds &&
    request.executionPolicy.maxInputCharacters <= providerCapability.maxInputCharacters &&
    request.executionPolicy.maxOutputCharacters <= providerCapability.maxOutputCharacters;

  const totalCost =
    (checkedCeilingCost(
      estimatedInputUnits,
      currentPricing.inputUnitSize,
      currentPricing.inputUnitPriceMinorUnits,
    ) +
      checkedCeilingCost(
        estimatedOutputUnits,
        currentPricing.outputUnitSize,
        currentPricing.outputUnitPriceMinorUnits,
      )) *
    BigInt(Math.max(1, request.executionPolicy.maxAttemptCount));
  if (totalCost > BigInt(MAX_SAFE_INTEGER)) {
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      "Estimated cost exceeds safe integer range",
    );
  }
  const estimatedMaximumCostMinorUnits = Number(totalCost);
  let outcome: CostAndBudgetDecision["outcome"] = "within-budget";
  if (!policyIntegersValid || !exactBindingsValid) outcome = "invalid-budget-evidence";
  else if (currentPricing.availability !== "available" && policy.costCeilingMandatory)
    outcome = "pricing-unavailable";
  else if (estimatedInputUnits > policy.maximumInputUnits) outcome = "input-budget-exceeded";
  else if (estimatedOutputUnits > policy.maximumOutputUnits) outcome = "output-budget-exceeded";
  else if (estimatedMaximumCostMinorUnits > policy.costCeilingMinorUnits)
    outcome = "cost-ceiling-exceeded";
  else if (policy.manualReviewRequired) outcome = "manual-review-required";

  return parseSigned(
    CostAndBudgetDecisionSchema,
    {
      schemaVersion: "1.0",
      decisionId: captured.decisionId,
      invocationRequestFingerprint: request.requestFingerprint,
      adapterFingerprint: currentAdapter.adapterFingerprint,
      pricingReferenceId: currentPricing.pricingReferenceId,
      pricingReferenceFingerprint: currentPricing.pricingFingerprint,
      pricingReferenceVersion: currentPricing.pricingVersion,
      budgetPolicyVersion: policy.budgetPolicyVersion,
      budgetReference: policy.budgetReference,
      currencyCode: policy.currencyCode,
      estimatedInputUnits,
      maximumInputUnits: isSafeInteger(policy.maximumInputUnits, 1) ? policy.maximumInputUnits : 1,
      estimatedOutputUnits,
      maximumOutputUnits: isSafeInteger(policy.maximumOutputUnits, 1)
        ? policy.maximumOutputUnits
        : 1,
      estimatedMaximumCostMinorUnits,
      costCeilingMinorUnits: isSafeInteger(policy.costCeilingMinorUnits, 0)
        ? policy.costCeilingMinorUnits
        : 0,
      maximumAttemptCount: isSafeInteger(policy.maximumAttemptCount, 1)
        ? policy.maximumAttemptCount
        : 1,
      timeoutBudgetMilliseconds: isSafeInteger(policy.timeoutBudgetMilliseconds, 1)
        ? policy.timeoutBudgetMilliseconds
        : 1,
      evaluatedAt,
      outcome,
      reasonCodes: [outcome.replaceAll("-", "_")],
    },
    "decisionFingerprint",
    "Cost and Budget Decision",
  );
}

export function verifyCostAndBudgetDecision(input: {
  readonly decision: unknown;
  readonly evaluation: CostAndBudgetEvaluationInput;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Cost and Budget verification input");
    const expected = evaluateCostAndBudget(
      wrapper.evaluation as unknown as CostAndBudgetEvaluationInput,
    );
    return semanticVerification(
      "cost-and-budget-decision",
      wrapper.decision,
      expected,
      "cost_arithmetic_invalid",
      "evaluation",
    );
  } catch {
    return invalidVerification("cost-and-budget-decision", "cost_arithmetic_invalid", "decision");
  }
}

export interface CircuitThresholdPolicyInput {
  readonly failureThreshold: number;
  readonly windowDurationMilliseconds: number;
  readonly openDurationMilliseconds: number;
  readonly halfOpenMaximumProbeCount: number;
  readonly securityViolationQuarantines: boolean;
}

export interface CircuitFailureWindowInput {
  readonly windowStartedAt: string;
  readonly failureCounts: readonly Readonly<{
    category: CircuitState["failureWindowEvidence"]["failureCounts"][number]["category"];
    count: number;
  }>[];
}

export interface CircuitTransitionInput {
  readonly circuitStateId: string;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly previousState: CircuitState | null;
  readonly thresholdPolicy: CircuitThresholdPolicyInput;
  readonly failureWindow: CircuitFailureWindowInput;
  readonly evaluatedAt: string;
  readonly command: "disable" | "evaluate" | "reset";
  readonly probeOutcome: "failed" | "none" | "succeeded";
  readonly probesAlreadyUsed: number;
}

function addMilliseconds(timestamp: string, milliseconds: number): string {
  return new Date(Date.parse(timestamp) + milliseconds).toISOString();
}

export function transitionCircuitState(input: CircuitTransitionInput): CircuitState {
  const captured = captureRecord(input, "Circuit transition input");
  requireExactKeys(
    captured,
    [
      "circuitStateId",
      "adapter",
      "previousState",
      "thresholdPolicy",
      "failureWindow",
      "evaluatedAt",
      "command",
      "probeOutcome",
      "probesAlreadyUsed",
    ],
    "Circuit transition input",
  );
  const currentAdapter = captured.adapter as ProductionProviderAdapterDescriptor;
  const previous = captured.previousState as CircuitState | null;
  const policy = captured.thresholdPolicy as unknown as CircuitThresholdPolicyInput;
  const failureWindow = captured.failureWindow as unknown as CircuitFailureWindowInput;
  const evaluatedAt = String(captured.evaluatedAt);
  requireExactKeys(
    captured.thresholdPolicy as CanonicalRecord,
    [
      "failureThreshold",
      "windowDurationMilliseconds",
      "openDurationMilliseconds",
      "halfOpenMaximumProbeCount",
      "securityViolationQuarantines",
    ],
    "Circuit threshold policy",
  );
  requireExactKeys(
    captured.failureWindow as CanonicalRecord,
    ["windowStartedAt", "failureCounts"],
    "Circuit failure window",
  );
  if (
    verifyProviderReadinessArtifactFingerprint(
      "production-provider-adapter-descriptor",
      currentAdapter,
    ).status !== "valid" ||
    !isSafeInteger(policy.failureThreshold, 1) ||
    !isSafeInteger(policy.windowDurationMilliseconds, 1) ||
    !isSafeInteger(policy.openDurationMilliseconds, 1) ||
    !isSafeInteger(policy.halfOpenMaximumProbeCount, 1) ||
    typeof policy.securityViolationQuarantines !== "boolean" ||
    !(["disable", "evaluate", "reset"] as const).includes(captured.command as never) ||
    !(["failed", "none", "succeeded"] as const).includes(captured.probeOutcome as never) ||
    !isSafeInteger(captured.probesAlreadyUsed, 0)
  ) {
    throw new ProviderReadinessIntegrityError("invalid_artifact", "Circuit policy is invalid");
  }
  if (
    previous !== null &&
    (verifyProviderReadinessArtifactFingerprint("circuit-state", previous).status !== "valid" ||
      previous.adapterFingerprint !== currentAdapter.adapterFingerprint ||
      Date.parse(evaluatedAt) < Date.parse(previous.evaluatedAt))
  ) {
    throw new ProviderReadinessIntegrityError(
      "invalid_chronology",
      "Previous Circuit state is invalid",
    );
  }
  if (
    previous?.state !== "half-open" &&
    (captured.probeOutcome !== "none" || captured.probesAlreadyUsed !== 0)
  ) {
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      "Probe evidence is valid only after the Circuit is already half-open",
    );
  }
  const windowElapsed = Date.parse(evaluatedAt) - Date.parse(failureWindow.windowStartedAt);
  if (
    !Number.isFinite(windowElapsed) ||
    windowElapsed < 0 ||
    windowElapsed > policy.windowDurationMilliseconds
  ) {
    throw new ProviderReadinessIntegrityError(
      "invalid_chronology",
      "Circuit failure window is invalid",
    );
  }
  const orderedCounts = [...failureWindow.failureCounts].sort((left, right) =>
    left.category < right.category ? -1 : left.category > right.category ? 1 : 0,
  );
  if (
    orderedCounts.some((entry) => !isSafeInteger(entry.count, 1)) ||
    new Set(orderedCounts.map((entry) => entry.category)).size !== orderedCounts.length
  ) {
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      "Circuit failure counts are invalid",
    );
  }
  const totalFailureCount = orderedCounts.reduce((total, entry) => total + entry.count, 0);
  if (!Number.isSafeInteger(totalFailureCount)) {
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      "Circuit failure total is unsafe",
    );
  }
  const failureWindowUnsigned = {
    windowStartedAt: failureWindow.windowStartedAt,
    evaluatedAt,
    totalFailureCount,
    failureCounts: orderedCounts,
  };
  const failureWindowEvidence = {
    ...failureWindowUnsigned,
    evidenceFingerprint: fingerprintProviderReadinessArtifact(failureWindowUnsigned),
  };
  const thresholdUnsigned = {
    failureThreshold: policy.failureThreshold,
    windowDurationMilliseconds: policy.windowDurationMilliseconds,
    openDurationMilliseconds: policy.openDurationMilliseconds,
    halfOpenMaximumProbeCount: policy.halfOpenMaximumProbeCount,
    securityViolationQuarantines: policy.securityViolationQuarantines,
  };
  const thresholdPolicy = {
    ...thresholdUnsigned,
    policyFingerprint: fingerprintProviderReadinessArtifact(thresholdUnsigned),
  };
  const hasSecurityViolation = orderedCounts.some(
    (entry) => entry.category === "security-policy-violation",
  );
  let state: CircuitState["state"];
  let transitionReason: CircuitState["transitionReason"];
  let openedAt: string | null = null;
  let nextEvaluationAt: string | null = null;
  let maximumProbeCount = 0;
  let remainingProbeCount = 0;

  if (captured.command === "disable") {
    state = "disabled";
    transitionReason = "manual_disable";
  } else if (previous?.state === "disabled" || previous?.state === "quarantined") {
    state = previous.state;
    transitionReason = previous.transitionReason;
  } else if (captured.command === "reset") {
    state = "closed";
    transitionReason = "policy_reset";
  } else if (hasSecurityViolation && policy.securityViolationQuarantines) {
    state = "quarantined";
    transitionReason = "security_policy_violation";
  } else if (previous?.state === "open") {
    if (Date.parse(evaluatedAt) >= Date.parse(previous.nextEvaluationAt!)) {
      if (captured.probesAlreadyUsed !== 0) {
        throw new ProviderReadinessIntegrityError(
          "invalid_artifact",
          "A new half-open period must begin with an unused probe allowance",
        );
      }
      state = "half-open";
      transitionReason = "open_period_elapsed";
      openedAt = previous.openedAt;
      nextEvaluationAt = addMilliseconds(evaluatedAt, policy.openDurationMilliseconds);
      maximumProbeCount = policy.halfOpenMaximumProbeCount;
      remainingProbeCount = policy.halfOpenMaximumProbeCount;
    } else {
      state = "open";
      transitionReason = previous.transitionReason;
      openedAt = previous.openedAt;
      nextEvaluationAt = previous.nextEvaluationAt;
    }
  } else if (previous?.state === "half-open") {
    const previousMaximumProbeCount = previous.probeAllowance.maximumProbeCount;
    const previousUsedProbeCount =
      previousMaximumProbeCount - previous.probeAllowance.remainingProbeCount;
    if (
      previousMaximumProbeCount !== policy.halfOpenMaximumProbeCount ||
      captured.probesAlreadyUsed < previousUsedProbeCount ||
      captured.probesAlreadyUsed > previousMaximumProbeCount ||
      (captured.probeOutcome !== "none" && captured.probesAlreadyUsed <= previousUsedProbeCount) ||
      (captured.probeOutcome === "none" && captured.probesAlreadyUsed === previousMaximumProbeCount)
    ) {
      throw new ProviderReadinessIntegrityError(
        "invalid_artifact",
        "Half-open probe consumption must be monotonic and bounded",
      );
    }
    if (captured.probeOutcome === "succeeded") {
      state = "closed";
      transitionReason = "half_open_probe_succeeded";
    } else if (
      captured.probeOutcome === "failed" ||
      captured.probesAlreadyUsed >= previousMaximumProbeCount
    ) {
      state = "open";
      transitionReason = "half_open_probe_failed";
      openedAt = evaluatedAt;
      nextEvaluationAt = addMilliseconds(evaluatedAt, policy.openDurationMilliseconds);
    } else {
      state = "half-open";
      transitionReason = "open_period_elapsed";
      openedAt = previous.openedAt;
      nextEvaluationAt = addMilliseconds(evaluatedAt, policy.openDurationMilliseconds);
      maximumProbeCount = previousMaximumProbeCount;
      remainingProbeCount = previousMaximumProbeCount - captured.probesAlreadyUsed;
    }
  } else if (totalFailureCount >= policy.failureThreshold) {
    state = "open";
    transitionReason = "failure_threshold_reached";
    openedAt = evaluatedAt;
    nextEvaluationAt = addMilliseconds(evaluatedAt, policy.openDurationMilliseconds);
  } else {
    state = "closed";
    transitionReason = previous === null ? "initial_state" : "policy_reset";
  }

  return parseSigned(
    CircuitStateSchema,
    {
      schemaVersion: "1.0",
      circuitStateId: captured.circuitStateId,
      adapterId: currentAdapter.adapterId,
      adapterFingerprint: currentAdapter.adapterFingerprint,
      state,
      previousState: previous?.state ?? null,
      transitionReason,
      failureWindowEvidence,
      thresholdPolicy,
      openedAt,
      nextEvaluationAt,
      probeAllowance: {
        maximumProbeCount,
        remainingProbeCount,
        dryRunProbePermitted: state === "half-open" && remainingProbeCount > 0,
      },
      evaluatedAt,
      reasonCodes: [`circuit_${state.replaceAll("-", "_")}`],
    },
    "stateFingerprint",
    "Circuit State",
  );
}

export function verifyCircuitState(input: {
  readonly state: unknown;
  readonly transition: CircuitTransitionInput;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Circuit verification input");
    const expected = transitionCircuitState(
      wrapper.transition as unknown as CircuitTransitionInput,
    );
    return semanticVerification(
      "circuit-state",
      wrapper.state,
      expected,
      "circuit_transition_invalid",
      "transition",
    );
  } catch {
    return invalidVerification("circuit-state", "circuit_transition_invalid", "state");
  }
}

export type ObservabilityReadinessExpectation = Omit<
  ObservabilityReadinessEvidence,
  "readinessFingerprint"
>;

export function verifyObservabilityReadinessEvidence(input: {
  readonly evidence: unknown;
  readonly expected: ObservabilityReadinessExpectation;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Observability readiness verification input");
    const expected = parseSigned(
      ObservabilityReadinessEvidenceSchema,
      wrapper.expected,
      "readinessFingerprint",
      "Expected Observability Readiness Evidence",
    );
    return semanticVerification(
      "observability-readiness-evidence",
      wrapper.evidence,
      expected,
      "redaction_invalid",
      "expected",
    );
  } catch {
    return invalidVerification("observability-readiness-evidence", "redaction_invalid", "evidence");
  }
}

export interface ProviderHealthDerivationInput {
  readonly healthEvidenceId: string;
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly authorization: Readonly<{
    evidence: AuthorizationDecisionEvidence;
    authority: AuthorizationAuthority;
    expectedDecision: AuthorizationDecisionInput;
  }>;
  readonly credential: Readonly<{
    reference: CredentialReference;
    expected: CredentialReferenceExpectation;
  }>;
  readonly transport: Readonly<{
    plan: ProviderTransportPlan;
    policy: SecureTransportPolicy;
    policyInput: SecureTransportPolicyInput;
    expectedTransportPlanId: string;
  }>;
  readonly rate: Readonly<{
    decision: ProviderRateAndCapacityDecision;
    evaluation: RateAndCapacityEvaluationInput;
  }>;
  readonly cost: Readonly<{
    decision: CostAndBudgetDecision;
    evaluation: CostAndBudgetEvaluationInput;
  }>;
  readonly circuit: Readonly<{
    state: CircuitState;
    transition: CircuitTransitionInput;
  }>;
  readonly observability: Readonly<{
    evidence: ObservabilityReadinessEvidence;
    expected: ObservabilityReadinessExpectation;
  }>;
  readonly evaluatedAt: string;
}

function ensureHealthInputsVerify(input: ProviderHealthDerivationInput): void {
  const exactAdapterFingerprint = input.adapter.adapterFingerprint;
  const exactInvocationFingerprint = input.invocationRequest.requestFingerprint;
  if (
    verifyReasoningInvocationRequest(input.invocationRequest).status !== "valid" ||
    verifyProductionProviderAdapterDescriptor({
      descriptor: input.adapter,
      providerCapability: input.providerCapability,
    }).status !== "valid" ||
    verifyAuthorizationDecisionEvidence(input.authorization).status !== "valid" ||
    verifyCredentialReference({
      reference: input.credential.reference,
      adapter: input.adapter,
      expected: input.credential.expected,
    }).status !== "valid" ||
    verifySecureTransportPolicy({
      policy: input.transport.policy,
      adapter: input.adapter,
      expectedPolicy: input.transport.policyInput,
    }).status !== "valid" ||
    verifyProviderTransportPlan({
      plan: input.transport.plan,
      adapter: input.adapter,
      policy: input.transport.policy,
      expectedTransportPlanId: input.transport.expectedTransportPlanId,
    }).status !== "valid" ||
    verifyProviderRateAndCapacityDecision({
      decision: input.rate.decision,
      evaluation: input.rate.evaluation,
    }).status !== "valid" ||
    verifyCostAndBudgetDecision({
      decision: input.cost.decision,
      evaluation: input.cost.evaluation,
    }).status !== "valid" ||
    verifyCircuitState({ state: input.circuit.state, transition: input.circuit.transition })
      .status !== "valid" ||
    verifyObservabilityReadinessEvidence(input.observability).status !== "valid" ||
    input.authorization.authority.adapter.adapterFingerprint !== exactAdapterFingerprint ||
    input.authorization.authority.deliveryAuthority.invocationRequest.requestFingerprint !==
      exactInvocationFingerprint ||
    input.rate.evaluation.adapter.adapterFingerprint !== exactAdapterFingerprint ||
    input.rate.evaluation.invocationRequest.requestFingerprint !== exactInvocationFingerprint ||
    input.cost.evaluation.adapter.adapterFingerprint !== exactAdapterFingerprint ||
    input.cost.evaluation.invocationRequest.requestFingerprint !== exactInvocationFingerprint ||
    input.circuit.transition.adapter.adapterFingerprint !== exactAdapterFingerprint ||
    input.transport.plan.adapterFingerprint !== exactAdapterFingerprint ||
    input.transport.policy.providerFamilyReference !== input.adapter.providerFamilyReference ||
    input.credential.reference.providerFamilyReference !== input.adapter.providerFamilyReference ||
    input.observability.evidence.adapterFingerprint !== exactAdapterFingerprint ||
    input.observability.expected.adapterFingerprint !== exactAdapterFingerprint ||
    input.observability.evidence.evaluatedAt !== input.evaluatedAt ||
    input.observability.expected.evaluatedAt !== input.evaluatedAt ||
    input.rate.decision.evaluatedAt !== input.evaluatedAt ||
    input.cost.decision.evaluatedAt !== input.evaluatedAt ||
    input.circuit.state.evaluatedAt !== input.evaluatedAt ||
    (input.adapter.state === "disabled" && input.circuit.state.state !== "disabled")
  ) {
    throw new ProviderReadinessIntegrityError("binding_mismatch", "Health inputs do not verify");
  }
}

export function deriveProviderHealthEvidence(
  input: ProviderHealthDerivationInput,
): ProviderHealthEvidence {
  const captured = captureRecord(
    input,
    "Provider Health derivation input",
  ) as unknown as ProviderHealthDerivationInput;
  requireExactKeys(
    captured as unknown as CanonicalRecord,
    [
      "healthEvidenceId",
      "adapter",
      "invocationRequest",
      "providerCapability",
      "authorization",
      "credential",
      "transport",
      "rate",
      "cost",
      "circuit",
      "observability",
      "evaluatedAt",
    ],
    "Provider Health derivation input",
  );
  ensureHealthInputsVerify(captured);
  const authorizationResult = enforceAuthorizationDecision({
    ...captured.authorization,
    evaluatedAt: captured.evaluatedAt,
  });
  const authorizationReadiness = authorizationResult.status === "allowed" ? "ready" : "not-ready";
  const transportPolicyReadiness =
    captured.transport.plan.status === "validated-dry-run" ? "ready" : "not-ready";
  const rateAndCapacityReadiness =
    captured.rate.decision.outcome === "admitted" ? "ready" : "not-ready";
  const costReadiness = captured.cost.decision.outcome === "within-budget" ? "ready" : "not-ready";
  const observabilityReadiness =
    captured.observability.evidence.status === "ready" ? "ready" : "not-ready";
  const reasons: ProviderHealthEvidence["reasonCodes"] = [];
  if (authorizationReadiness !== "ready") reasons.push("authorization_not_ready");
  if (transportPolicyReadiness !== "ready") reasons.push("transport_not_ready");
  if (rateAndCapacityReadiness !== "ready") reasons.push("rate_capacity_not_ready");
  if (costReadiness !== "ready") reasons.push("cost_not_ready");
  if (observabilityReadiness !== "ready") reasons.push("observability_not_ready");
  if (captured.credential.reference.availability !== "available")
    reasons.push("credential_not_available");
  if (captured.circuit.state.state !== "closed") reasons.push("circuit_not_ready");

  let healthState: ProviderHealthEvidence["healthState"];
  if (captured.circuit.state.state === "disabled") healthState = "disabled";
  else if (captured.circuit.state.state === "quarantined") healthState = "quarantined";
  else if (
    captured.authorization.evidence.outcome === "not-evaluated" ||
    captured.authorization.evidence.outcome === "invalid-evidence"
  )
    healthState = "unknown";
  else if (
    captured.circuit.state.state === "open" ||
    captured.credential.reference.availability !== "available" ||
    captured.rate.decision.outcome === "provider-unavailable" ||
    captured.rate.decision.outcome === "capacity-exhausted"
  )
    healthState = "unavailable";
  else if (reasons.length > 0) healthState = "degraded";
  else healthState = "healthy";

  const finalReasons: ProviderHealthEvidence["reasonCodes"] =
    healthState === "healthy" || healthState === "disabled" || healthState === "quarantined"
      ? [healthState]
      : [...new Set([...reasons, healthState])].sort();

  return parseSigned(
    ProviderHealthEvidenceSchema,
    {
      schemaVersion: "1.0",
      healthEvidenceId: captured.healthEvidenceId,
      adapterId: captured.adapter.adapterId,
      adapterFingerprint: captured.adapter.adapterFingerprint,
      healthState,
      circuitState: captured.circuit.state.state,
      circuitStateFingerprint: captured.circuit.state.stateFingerprint,
      credentialReferenceAvailability: captured.credential.reference.availability,
      authorizationReadiness,
      transportPolicyReadiness,
      rateAndCapacityReadiness,
      costReadiness,
      observabilityReadiness,
      lastEvaluatedAt: captured.evaluatedAt,
      reasonCodes: finalReasons,
    },
    "healthFingerprint",
    "Provider Health Evidence",
  );
}

export function verifyProviderHealthEvidence(input: {
  readonly evidence: unknown;
  readonly derivation: ProviderHealthDerivationInput;
}): ProviderReadinessArtifactVerificationResult {
  try {
    const wrapper = captureRecord(input, "Provider Health verification input");
    const expected = deriveProviderHealthEvidence(
      wrapper.derivation as unknown as ProviderHealthDerivationInput,
    );
    return semanticVerification(
      "provider-health-evidence",
      wrapper.evidence,
      expected,
      "health_derivation_invalid",
      "derivation",
    );
  } catch {
    return invalidVerification("provider-health-evidence", "health_derivation_invalid", "evidence");
  }
}
