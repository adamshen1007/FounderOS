import {
  CredentialResolutionCommandSchema,
  CredentialResolutionPortResultSchema,
  CredentialRevocationRecordSchema,
  CredentialRotationRecordSchema,
  ExecutionAuthorizationIdentifierSchema,
  IsoTemporalSchema,
  ProviderReadinessLogicalReferenceSchema,
  Sha256DigestSchema,
  type CredentialResolutionCommand,
  type CredentialResolutionPortResult,
  type CredentialRevocationRecord,
  type CredentialRotationRecord,
} from "@founderos/knowledge-schema";

export interface SyntheticCredentialResolverConfiguration {
  readonly schemaVersion: "1.0";
  readonly resolverId: string;
  readonly credentialReferenceId: string;
  readonly credentialReferenceFingerprint: string;
  readonly initialRotationVersion: string;
  readonly initializedAt: string;
  readonly environmentClass: "development" | "evaluation" | "production" | "staging" | "test";
  readonly providerFamilyReference: string;
  readonly adapterId: string;
  readonly rotationAuthorityReference: string;
  readonly revocationAuthorityReference: string;
}

export type SyntheticCredentialRotationResult =
  | {
      readonly status: "rotated";
      readonly activeRotationVersion: string;
      readonly rotationSequence: number;
    }
  | { readonly status: "rejected"; readonly reasonCode: string };

export type SyntheticCredentialRevocationResult =
  | { readonly status: "revoked"; readonly revocationVersion: number }
  | { readonly status: "rejected"; readonly reasonCode: string };

export interface SyntheticCredentialResolverInspection {
  readonly resolverId: string;
  readonly activeRotationVersion: string;
  readonly rotationSequence: number;
  readonly currentRevocationVersion: number;
  readonly activeVersionRevoked: boolean;
  readonly materializationCount: number;
  readonly releaseCount: number;
  readonly lastReleaseAllZero: boolean | null;
}

export interface SyntheticCredentialResolver {
  readonly resolveAndRelease: (
    command: CredentialResolutionCommand,
  ) => CredentialResolutionPortResult;
  readonly rotate: (input: CredentialRotationRecord) => SyntheticCredentialRotationResult;
  readonly revoke: (input: CredentialRevocationRecord) => SyntheticCredentialRevocationResult;
  readonly inspect: () => SyntheticCredentialResolverInspection;
}

function immutableCopy<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (entry: unknown): void => {
    if (entry === null || typeof entry !== "object" || Object.isFrozen(entry)) return;
    for (const nested of Object.values(entry)) freeze(nested);
    Object.freeze(entry);
  };
  freeze(copy);
  return copy;
}

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`)
    .join(",")}}`;
}

function validRecordFingerprint(
  value: CredentialRotationRecord | CredentialRevocationRecord,
  domain: string,
): boolean {
  const { recordFingerprint, ...artifact } = value;
  return (
    recordFingerprint === createHash("sha256").update(canonical({ domain, artifact })).digest("hex")
  );
}

function captureExactOwnData<T extends object>(
  value: unknown,
  expected: readonly string[],
): T | null {
  try {
    if (
      value === null ||
      typeof value !== "object" ||
      Object.getPrototypeOf(value) !== Object.prototype
    ) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    if (
      !keys.every((key) => typeof key === "string") ||
      keys.length !== expected.length ||
      ![...(keys as string[])].sort().every((key, index) => key === [...expected].sort()[index])
    ) {
      return null;
    }
    const captured: Record<string, unknown> = {};
    for (const key of keys as string[]) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
        return null;
      }
      captured[key] = descriptor.value;
    }
    return captured as T;
  } catch {
    return null;
  }
}

const CONFIGURATION_KEYS = [
  "schemaVersion",
  "resolverId",
  "credentialReferenceId",
  "credentialReferenceFingerprint",
  "initialRotationVersion",
  "initializedAt",
  "environmentClass",
  "providerFamilyReference",
  "adapterId",
  "rotationAuthorityReference",
  "revocationAuthorityReference",
] as const;

function validConfiguration(value: SyntheticCredentialResolverConfiguration): boolean {
  return (
    value.schemaVersion === "1.0" &&
    ExecutionAuthorizationIdentifierSchema.safeParse(value.resolverId).success &&
    ExecutionAuthorizationIdentifierSchema.safeParse(value.credentialReferenceId).success &&
    Sha256DigestSchema.safeParse(value.credentialReferenceFingerprint).success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(value.initialRotationVersion).success &&
    IsoTemporalSchema.safeParse(value.initializedAt).success &&
    ["development", "evaluation", "production", "staging", "test"].includes(
      value.environmentClass,
    ) &&
    ProviderReadinessLogicalReferenceSchema.safeParse(value.providerFamilyReference).success &&
    ExecutionAuthorizationIdentifierSchema.safeParse(value.adapterId).success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(value.rotationAuthorityReference).success &&
    ProviderReadinessLogicalReferenceSchema.safeParse(value.revocationAuthorityReference).success
  );
}

function createResolver(
  configuration: SyntheticCredentialResolverConfiguration,
  faultMode: "none" | "after-materialization",
): SyntheticCredentialResolver {
  const captured = captureExactOwnData<SyntheticCredentialResolverConfiguration>(
    configuration,
    CONFIGURATION_KEYS,
  );
  if (captured === null || !validConfiguration(captured)) {
    throw new TypeError("Synthetic credential resolver configuration is invalid");
  }
  const config = immutableCopy(captured);
  let activeRotationVersion = config.initialRotationVersion;
  let rotationSequence = 1;
  let lastTransitionAt = config.initializedAt;
  let currentRevocationVersion = 0;
  let materializationCount = 0;
  let releaseCount = 0;
  let lastReleaseAllZero: boolean | null = null;
  const reservedRotationVersions = new Set([activeRotationVersion]);
  const revokedVersions = new Set<string>();
  const rotations = new Map<
    string,
    { canonicalInput: string; result: SyntheticCredentialRotationResult }
  >();
  const revocations = new Map<
    string,
    { canonicalInput: string; result: SyntheticCredentialRevocationResult }
  >();

  const facade: SyntheticCredentialResolver = {
    resolveAndRelease(command) {
      const parsed = CredentialResolutionCommandSchema.safeParse(command);
      if (!parsed.success) {
        return immutableCopy({ status: "rejected", reasonCodes: ["internal_integrity_failure"] });
      }
      const value = parsed.data;
      if (
        value.resolverId !== config.resolverId ||
        value.credentialReferenceId !== config.credentialReferenceId
      ) {
        return immutableCopy({
          status: "rejected",
          reasonCodes: ["credential_reference_not_found"],
        });
      }
      if (
        value.credentialReferenceFingerprint !== config.credentialReferenceFingerprint ||
        value.providerFamilyReference !== config.providerFamilyReference ||
        value.adapterId !== config.adapterId ||
        value.environmentClass !== config.environmentClass
      ) {
        return immutableCopy({
          status: "rejected",
          reasonCodes: ["credential_version_unavailable"],
        });
      }
      if (Date.parse(value.evaluatedAt) >= Date.parse(value.resolutionDeadline)) {
        return immutableCopy({ status: "rejected", reasonCodes: ["deadline_expired"] });
      }
      if (value.expectedRotationVersion !== activeRotationVersion) {
        return immutableCopy({ status: "rejected", reasonCodes: ["credential_version_stale"] });
      }
      if (revokedVersions.has(activeRotationVersion)) {
        return immutableCopy({ status: "rejected", reasonCodes: ["credential_version_revoked"] });
      }

      const materialCoordinates = `${config.resolverId}|${config.credentialReferenceId}|${activeRotationVersion}`;
      const owned = Uint8Array.from(
        materialCoordinates,
        (character, index) => (character.charCodeAt(0) + index * 31 + 17) % 251 || 1,
      );
      materializationCount += 1;
      let failed = false;
      try {
        if (faultMode === "after-materialization") throw new Error("synthetic-fault");
      } catch {
        failed = true;
      } finally {
        owned.fill(0);
        releaseCount += 1;
        lastReleaseAllZero = owned.every((entry) => entry === 0);
      }
      if (!lastReleaseAllZero) {
        return immutableCopy({ status: "rejected", reasonCodes: ["release_integrity_failure"] });
      }
      if (failed) {
        return immutableCopy({ status: "rejected", reasonCodes: ["materialization_failure"] });
      }
      return immutableCopy(
        CredentialResolutionPortResultSchema.parse({
          status: "resolved",
          evidence: {
            schemaVersion: "1.0",
            resolutionRequestId: value.resolutionRequestId,
            authorizationDecisionId: value.authorizationDecisionId,
            authorizationDecisionFingerprint: value.authorizationDecisionFingerprint,
            authorizationClaimId: value.authorizationClaimId,
            authorizationClaimFingerprint: value.authorizationClaimFingerprint,
            executionAttemptId: value.executionAttemptId,
            executionAttemptFingerprint: value.executionAttemptFingerprint,
            credentialReferenceId: value.credentialReferenceId,
            credentialReferenceFingerprint: value.credentialReferenceFingerprint,
            rotationVersion: value.expectedRotationVersion,
            providerFamilyReference: value.providerFamilyReference,
            adapterId: value.adapterId,
            adapterFingerprint: value.adapterFingerprint,
            environmentClass: value.environmentClass,
            operation: value.operation,
            evaluatedAt: value.evaluatedAt,
            resolutionDeadline: value.resolutionDeadline,
            resolverId: value.resolverId,
            sourceClass: "deterministic-synthetic",
            releaseStatus: "released",
          },
        }),
      );
    },
    rotate(input) {
      const parsed = CredentialRotationRecordSchema.safeParse(input);
      if (
        !parsed.success ||
        !validRecordFingerprint(parsed.data, "founderos.m18.credential-rotation-record.v1")
      )
        return immutableCopy({ status: "rejected", reasonCode: "invalid_input" });
      const value = parsed.data;
      const inputKey = canonical(value);
      const existing = rotations.get(value.rotationRecordId);
      if (existing !== undefined) {
        return existing.canonicalInput === inputKey
          ? existing.result
          : immutableCopy({ status: "rejected", reasonCode: "conflicting_identity" });
      }
      const transitionInvalid =
        value.credentialReferenceId !== config.credentialReferenceId ||
        value.credentialReferenceFingerprint !== config.credentialReferenceFingerprint ||
        value.environmentClass !== config.environmentClass ||
        value.providerFamilyReference !== config.providerFamilyReference ||
        value.adapterId !== config.adapterId ||
        value.rotationAuthorityReference !== config.rotationAuthorityReference ||
        value.priorRotationVersion !== activeRotationVersion ||
        value.rotationSequence !== rotationSequence + 1 ||
        reservedRotationVersions.has(value.nextRotationVersion) ||
        Date.parse(value.effectiveAt) < Date.parse(lastTransitionAt);
      reservedRotationVersions.add(value.nextRotationVersion);
      if (transitionInvalid) {
        const result = immutableCopy({
          status: "rejected" as const,
          reasonCode: "invalid_rotation_transition",
        });
        rotations.set(value.rotationRecordId, { canonicalInput: inputKey, result });
        return result;
      }
      const result = immutableCopy({
        status: "rotated" as const,
        activeRotationVersion: value.nextRotationVersion,
        rotationSequence: value.rotationSequence,
      });
      activeRotationVersion = value.nextRotationVersion;
      rotationSequence = value.rotationSequence;
      lastTransitionAt = value.effectiveAt;
      rotations.set(value.rotationRecordId, { canonicalInput: inputKey, result });
      return result;
    },
    revoke(input) {
      const parsed = CredentialRevocationRecordSchema.safeParse(input);
      if (
        !parsed.success ||
        !validRecordFingerprint(parsed.data, "founderos.m18.credential-revocation-record.v1")
      )
        return immutableCopy({ status: "rejected", reasonCode: "invalid_input" });
      const value = parsed.data;
      const inputKey = canonical(value);
      const existing = revocations.get(value.revocationRecordId);
      if (existing !== undefined) {
        return existing.canonicalInput === inputKey
          ? existing.result
          : immutableCopy({ status: "rejected", reasonCode: "conflicting_identity" });
      }
      if (
        value.credentialReferenceId !== config.credentialReferenceId ||
        value.credentialReferenceFingerprint !== config.credentialReferenceFingerprint ||
        value.revocationAuthorityReference !== config.revocationAuthorityReference ||
        value.rotationVersion !== activeRotationVersion ||
        value.revocationVersion <= currentRevocationVersion ||
        Date.parse(value.revokedAt) < Date.parse(lastTransitionAt)
      ) {
        const result = immutableCopy({
          status: "rejected" as const,
          reasonCode: "invalid_revocation_transition",
        });
        revocations.set(value.revocationRecordId, { canonicalInput: inputKey, result });
        return result;
      }
      const result = immutableCopy({
        status: "revoked" as const,
        revocationVersion: value.revocationVersion,
      });
      currentRevocationVersion = value.revocationVersion;
      lastTransitionAt = value.revokedAt;
      revokedVersions.add(value.rotationVersion);
      revocations.set(value.revocationRecordId, { canonicalInput: inputKey, result });
      return result;
    },
    inspect() {
      return immutableCopy({
        resolverId: config.resolverId,
        activeRotationVersion,
        rotationSequence,
        currentRevocationVersion,
        activeVersionRevoked: revokedVersions.has(activeRotationVersion),
        materializationCount,
        releaseCount,
        lastReleaseAllZero,
      });
    },
  };
  return Object.freeze(facade);
}

export function createSyntheticCredentialResolver(
  configuration: SyntheticCredentialResolverConfiguration,
): SyntheticCredentialResolver {
  return createResolver(configuration, "none");
}

export function runDisabledSyntheticCredentialReleaseHarness(input: {
  readonly configuration: SyntheticCredentialResolverConfiguration;
  readonly command: CredentialResolutionCommand;
  readonly faultMode: "after-materialization";
}): Readonly<{
  result: CredentialResolutionPortResult;
  inspection: SyntheticCredentialResolverInspection;
  liveExecutionReady: false;
}> {
  const resolver = createResolver(input.configuration, input.faultMode);
  const result = resolver.resolveAndRelease(input.command);
  return immutableCopy({ result, inspection: resolver.inspect(), liveExecutionReady: false });
}
import { createHash } from "node:crypto";
