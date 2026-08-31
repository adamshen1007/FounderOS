import {
  CredentialResolutionPortResultSchema,
  CredentialResolutionRequestSchema,
  ExecutionAuthorizationClaimSchema,
  ExecutionAuthorizationDecisionSchema,
  type CredentialResolutionCommand,
  type CredentialResolutionPortResult,
  type CredentialResolutionRequest,
  type CredentialResolutionResult,
  type ExecutionAuthorizationClaim,
  type ExecutionAuthorizationDecision,
  type ExecutionAuthorizationVerificationResult,
} from "@founderos/knowledge-schema";

import {
  createCredentialResolutionEvidence,
  verifyCredentialResolutionRequest,
} from "../domain/credential-resolution.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import type { InMemoryExecutionAuthorizationAuthority } from "./in-memory-execution-authorization-authority.js";
import { captureExactOwnEnumerableDataDescriptors } from "./production-provider-readiness-input-safety.js";

export interface CredentialResolutionPort {
  readonly resolveAndRelease: (
    command: CredentialResolutionCommand,
  ) => CredentialResolutionPortResult;
}

export interface CredentialResolutionOrchestratorConfiguration {
  readonly schemaVersion: "1.0";
  readonly resolverId: string;
  readonly authority: Pick<
    InMemoryExecutionAuthorizationAuthority,
    "verifyDecision" | "verifyClaim"
  >;
  readonly port: CredentialResolutionPort;
}

export interface ResolveCredentialInput {
  readonly schemaVersion: "1.0";
  readonly request: CredentialResolutionRequest;
  readonly decision: ExecutionAuthorizationDecision;
  readonly claim: ExecutionAuthorizationClaim;
}

export interface CredentialResolutionOrchestrator {
  readonly resolve: (input: ResolveCredentialInput) => CredentialResolutionResult;
}

interface ReservedResolution {
  readonly requestFingerprint: string;
  result: CredentialResolutionResult | null;
}

interface CapturedOrchestratorConfiguration {
  readonly resolverId: string;
  readonly authority: CredentialResolutionOrchestratorConfiguration["authority"];
  readonly verifyDecision: CredentialResolutionOrchestratorConfiguration["authority"]["verifyDecision"];
  readonly verifyClaim: CredentialResolutionOrchestratorConfiguration["authority"]["verifyClaim"];
  readonly port: CredentialResolutionPort;
  readonly resolveAndRelease: CredentialResolutionPort["resolveAndRelease"];
}

const CONFIGURATION_KEYS = ["schemaVersion", "resolverId", "authority", "port"] as const;
const RESOLVE_KEYS = ["schemaVersion", "request", "decision", "claim"] as const;

function captureOwnCallable(value: unknown, key: string): ((...args: never[]) => unknown) | null {
  if (value === null || typeof value !== "object") return null;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined &&
    descriptor.enumerable === true &&
    "value" in descriptor &&
    typeof descriptor.value === "function"
    ? (descriptor.value as (...args: never[]) => unknown)
    : null;
}

function captureConfiguration(value: unknown): CapturedOrchestratorConfiguration | null {
  try {
    const descriptors = captureExactOwnEnumerableDataDescriptors(value, CONFIGURATION_KEYS);
    if (
      descriptors === null ||
      descriptors.schemaVersion.value !== "1.0" ||
      typeof descriptors.resolverId.value !== "string" ||
      descriptors.resolverId.value.length === 0
    ) {
      return null;
    }
    const authority = descriptors.authority.value;
    const port = descriptors.port.value;
    const verifyDecision = captureOwnCallable(authority, "verifyDecision");
    const verifyClaim = captureOwnCallable(authority, "verifyClaim");
    const resolveAndRelease = captureOwnCallable(port, "resolveAndRelease");
    if (verifyDecision === null || verifyClaim === null || resolveAndRelease === null) return null;
    return {
      resolverId: descriptors.resolverId.value,
      authority: authority as CredentialResolutionOrchestratorConfiguration["authority"],
      verifyDecision:
        verifyDecision as CredentialResolutionOrchestratorConfiguration["authority"]["verifyDecision"],
      verifyClaim:
        verifyClaim as CredentialResolutionOrchestratorConfiguration["authority"]["verifyClaim"],
      port: port as CredentialResolutionPort,
      resolveAndRelease: resolveAndRelease as CredentialResolutionPort["resolveAndRelease"],
    };
  } catch {
    return null;
  }
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

type CredentialResolutionFailureReason = Exclude<
  CredentialResolutionResult,
  { status: "resolved" }
>["reasonCodes"][number];

function rejected(reasonCode: CredentialResolutionFailureReason): CredentialResolutionResult {
  return immutableCopy({ status: "rejected", reasonCodes: [reasonCode] });
}

function verificationValid(value: ExecutionAuthorizationVerificationResult): boolean {
  return value.status === "valid";
}

function exactCoordinates(
  request: CredentialResolutionRequest,
  decision: ExecutionAuthorizationDecision,
  claim: ExecutionAuthorizationClaim,
): boolean {
  const authorization = decision.authorizationRequest;
  return (
    request.authorizationDecisionId === decision.authorizationDecisionId &&
    request.authorizationDecisionFingerprint === decision.decisionFingerprint &&
    request.authorizationClaimId === claim.authorizationClaimId &&
    request.authorizationClaimFingerprint === claim.claimFingerprint &&
    request.executionAttemptId === authorization.executionAttemptId &&
    request.executionAttemptFingerprint === authorization.executionAttemptFingerprint &&
    request.subjectReference === authorization.subjectReference &&
    request.consumerId === authorization.consumerId &&
    request.deliveryTransactionId === authorization.deliveryTransactionId &&
    request.contextPackageId === authorization.contextPackageId &&
    request.invocationRequestId === authorization.invocationRequestId &&
    request.providerFamilyReference === authorization.providerFamilyReference &&
    request.adapterId === authorization.adapterId &&
    request.adapterFingerprint === authorization.adapterFingerprint &&
    request.environmentClass === authorization.environmentClass &&
    request.operation === authorization.operation &&
    request.credentialReferenceId === authorization.credentialReferenceId &&
    request.credentialReferenceFingerprint === authorization.credentialReferenceFingerprint &&
    request.expectedRotationVersion === authorization.credentialRotationVersion &&
    request.purposeReference === `purpose/${authorization.operation}` &&
    claim.authorizationDecisionId === decision.authorizationDecisionId &&
    claim.decisionFingerprint === decision.decisionFingerprint &&
    claim.executionAttemptId === request.executionAttemptId &&
    claim.executionAttemptFingerprint === request.executionAttemptFingerprint
  );
}

function portEvidenceMatches(
  evidence: Extract<CredentialResolutionPortResult, { status: "resolved" }>["evidence"],
  command: CredentialResolutionCommand,
): boolean {
  return (
    evidence.schemaVersion === command.schemaVersion &&
    evidence.resolutionRequestId === command.resolutionRequestId &&
    evidence.authorizationDecisionId === command.authorizationDecisionId &&
    evidence.authorizationDecisionFingerprint === command.authorizationDecisionFingerprint &&
    evidence.authorizationClaimId === command.authorizationClaimId &&
    evidence.authorizationClaimFingerprint === command.authorizationClaimFingerprint &&
    evidence.executionAttemptId === command.executionAttemptId &&
    evidence.executionAttemptFingerprint === command.executionAttemptFingerprint &&
    evidence.credentialReferenceId === command.credentialReferenceId &&
    evidence.credentialReferenceFingerprint === command.credentialReferenceFingerprint &&
    evidence.rotationVersion === command.expectedRotationVersion &&
    evidence.providerFamilyReference === command.providerFamilyReference &&
    evidence.adapterId === command.adapterId &&
    evidence.adapterFingerprint === command.adapterFingerprint &&
    evidence.environmentClass === command.environmentClass &&
    evidence.operation === command.operation &&
    evidence.evaluatedAt === command.evaluatedAt &&
    evidence.resolutionDeadline === command.resolutionDeadline &&
    evidence.resolverId === command.resolverId &&
    evidence.sourceClass === "deterministic-synthetic" &&
    evidence.releaseStatus === "released"
  );
}

export function createCredentialResolutionOrchestrator(
  configuration: CredentialResolutionOrchestratorConfiguration,
): CredentialResolutionOrchestrator {
  const captured = captureConfiguration(configuration);
  if (captured === null) {
    throw new TypeError("Credential resolution orchestrator configuration is invalid");
  }
  const { authority, port, resolverId, resolveAndRelease, verifyClaim, verifyDecision } = captured;
  const reservations = new Map<string, ReservedResolution>();

  return Object.freeze({
    resolve(input: ResolveCredentialInput): CredentialResolutionResult {
      try {
        const inputDescriptors = captureExactOwnEnumerableDataDescriptors(input, RESOLVE_KEYS);
        if (
          inputDescriptors === null ||
          inputDescriptors.schemaVersion.value !== "1.0" ||
          !CredentialResolutionRequestSchema.safeParse(inputDescriptors.request.value).success ||
          !ExecutionAuthorizationDecisionSchema.safeParse(inputDescriptors.decision.value)
            .success ||
          !ExecutionAuthorizationClaimSchema.safeParse(inputDescriptors.claim.value).success
        ) {
          return rejected("invalid_input");
        }
        const request = inputDescriptors.request.value as CredentialResolutionRequest;
        const decision = inputDescriptors.decision.value as ExecutionAuthorizationDecision;
        const claim = inputDescriptors.claim.value as ExecutionAuthorizationClaim;
        if (verifyCredentialResolutionRequest(request).status !== "valid") {
          return rejected("invalid_input");
        }
        const existing = reservations.get(request.resolutionRequestId);
        if (existing !== undefined) {
          return existing.requestFingerprint === request.requestFingerprint
            ? (existing.result ?? rejected("internal_integrity_failure"))
            : rejected("conflicting_identity");
        }
        const decisionVerification = verifyDecision.call(authority, {
          schemaVersion: "1.0",
          authorizationDecision: decision,
          evaluatedAt: request.evaluatedAt,
        });
        const claimVerification = verifyClaim.call(authority, {
          schemaVersion: "1.0",
          authorizationDecision: decision,
          authorizationClaim: claim,
          evaluatedAt: request.evaluatedAt,
        });
        if (!verificationValid(decisionVerification) || !verificationValid(claimVerification)) {
          return rejected("authorization_non_authoritative");
        }
        if (!exactCoordinates(request, decision, claim)) {
          return rejected("coordinate_mismatch");
        }
        if (Date.parse(request.evaluatedAt) >= Date.parse(request.resolutionDeadline)) {
          return rejected("deadline_expired");
        }
        if (Date.parse(request.resolutionDeadline) > Date.parse(decision.expiresAt)) {
          return rejected("deadline_expired");
        }
        const { requestFingerprint, ...commandFields } = request;
        void requestFingerprint;
        const command: CredentialResolutionCommand = immutableCopy({
          ...commandFields,
          resolverId,
        });
        reservations.set(request.resolutionRequestId, {
          requestFingerprint: request.requestFingerprint,
          result: null,
        });
        const portResult = resolveAndRelease.call(port, command);
        const parsedPortResult = CredentialResolutionPortResultSchema.safeParse(portResult);
        let result: CredentialResolutionResult;
        if (!parsedPortResult.success) {
          result = rejected("internal_integrity_failure");
        } else if (parsedPortResult.data.status === "rejected") {
          result = immutableCopy(parsedPortResult.data);
        } else if (!portEvidenceMatches(parsedPortResult.data.evidence, command)) {
          result = rejected("internal_integrity_failure");
        } else {
          const evidence = createCredentialResolutionEvidence({
            ...parsedPortResult.data.evidence,
            requestFingerprint: request.requestFingerprint,
          });
          result = immutableCopy({ status: "resolved", evidence });
        }
        reservations.set(request.resolutionRequestId, {
          requestFingerprint: request.requestFingerprint,
          result,
        });
        return result;
      } catch {
        return rejected("internal_integrity_failure");
      }
    },
  });
}
