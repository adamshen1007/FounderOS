import {
  ProductionProviderAdapterDescriptorSchema,
  SecureTransportPolicySchema,
  findDurableCanonicalJsonIssue,
  type ProductionProviderAdapterDescriptor,
  type SecureTransportPolicy,
} from "@founderos/knowledge-schema";

import { serializeDurableCanonicalJsonValue } from "../domain/canonical-fingerprint.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import { verifyProviderReadinessArtifactFingerprint } from "../domain/provider-readiness.js";
import { captureExactOwnEnumerableDataDescriptors } from "./production-provider-readiness-input-safety.js";

export interface ProductionProviderTransportPolicyBinding {
  readonly schemaVersion: "1.0";
  readonly adapterId: string;
  readonly adapterFingerprint: string;
  readonly providerFamilyReference: string;
  readonly transportPolicyVersion: "1.0";
}

/** A deterministic configuration authority. It has no transport, URL, client, or credential API. */
export interface ProductionProviderTransportPolicyAuthority {
  readonly getExpectedTransportPolicy: (
    binding: ProductionProviderTransportPolicyBinding,
  ) => SecureTransportPolicy | null;
}

const approvedAuthorities = new WeakSet<object>();
const authorityLookupCounts = new WeakMap<object, number>();
const BINDING_KEYS = [
  "schemaVersion",
  "adapterId",
  "adapterFingerprint",
  "providerFamilyReference",
  "transportPolicyVersion",
] as const;

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function bindingForAdapter(
  adapter: ProductionProviderAdapterDescriptor,
): ProductionProviderTransportPolicyBinding {
  return immutableCopy({
    schemaVersion: "1.0",
    adapterId: adapter.adapterId,
    adapterFingerprint: adapter.adapterFingerprint,
    providerFamilyReference: adapter.providerFamilyReference,
    transportPolicyVersion: adapter.transportPolicyVersion,
  });
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return serializeDurableCanonicalJsonValue(left) === serializeDurableCanonicalJsonValue(right);
  } catch {
    return false;
  }
}

export function createStaticProductionProviderTransportPolicyAuthority(input: {
  readonly adapter: ProductionProviderAdapterDescriptor;
  readonly expectedPolicy: SecureTransportPolicy;
}): ProductionProviderTransportPolicyAuthority {
  const descriptors = captureExactOwnEnumerableDataDescriptors(input, [
    "adapter",
    "expectedPolicy",
  ] as const);
  if (
    descriptors === null ||
    findDurableCanonicalJsonIssue(descriptors.adapter.value) !== null ||
    findDurableCanonicalJsonIssue(descriptors.expectedPolicy.value) !== null
  ) {
    throw new TypeError("Transport Policy authority configuration is invalid");
  }
  const adapter = ProductionProviderAdapterDescriptorSchema.parse(descriptors.adapter.value);
  const expectedPolicy = SecureTransportPolicySchema.parse(descriptors.expectedPolicy.value);
  if (
    verifyProviderReadinessArtifactFingerprint("production-provider-adapter-descriptor", adapter)
      .status !== "valid" ||
    verifyProviderReadinessArtifactFingerprint("secure-transport-policy", expectedPolicy).status !==
      "valid" ||
    expectedPolicy.providerFamilyReference !== adapter.providerFamilyReference ||
    expectedPolicy.schemaVersion !== adapter.transportPolicyVersion
  ) {
    throw new TypeError("Transport Policy authority configuration does not bind the Adapter");
  }
  const binding = bindingForAdapter(adapter);
  const capturedPolicy = immutableCopy(expectedPolicy);
  const authority = Object.freeze({
    getExpectedTransportPolicy(candidateBinding: ProductionProviderTransportPolicyBinding) {
      authorityLookupCounts.set(authority, (authorityLookupCounts.get(authority) ?? 0) + 1);
      const candidateDescriptors = captureExactOwnEnumerableDataDescriptors(
        candidateBinding,
        BINDING_KEYS,
      );
      if (candidateDescriptors === null) return null;
      const candidate = Object.fromEntries(
        BINDING_KEYS.map((key) => [key, candidateDescriptors[key].value]),
      );
      return sameCanonical(candidate, binding) ? immutableCopy(capturedPolicy) : null;
    },
  });
  approvedAuthorities.add(authority);
  authorityLookupCounts.set(authority, 0);
  return authority;
}

/** Direct-module test seam. Intentionally absent from the package facade. */
export function getProductionProviderTransportPolicyAuthorityLookupCountForTest(
  authority: ProductionProviderTransportPolicyAuthority,
): number {
  return authorityLookupCounts.get(authority) ?? 0;
}

export function captureProductionProviderTransportPolicyAuthority(
  value: unknown,
): ProductionProviderTransportPolicyAuthority {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Transport Policy authority port is invalid");
  }
  if (!approvedAuthorities.has(value)) {
    throw new TypeError("Transport Policy authority port was not created by the approved factory");
  }
  const descriptors = captureExactOwnEnumerableDataDescriptors(value, [
    "getExpectedTransportPolicy",
  ] as const);
  if (descriptors === null || typeof descriptors.getExpectedTransportPolicy.value !== "function") {
    throw new TypeError("Transport Policy authority port is invalid");
  }
  return value as ProductionProviderTransportPolicyAuthority;
}

export function resolveExpectedProductionProviderTransportPolicy(input: {
  readonly authority: ProductionProviderTransportPolicyAuthority;
  readonly adapter: ProductionProviderAdapterDescriptor;
}): SecureTransportPolicy | null {
  const adapter = ProductionProviderAdapterDescriptorSchema.safeParse(input.adapter);
  if (!adapter.success) return null;
  try {
    const expected = input.authority.getExpectedTransportPolicy(bindingForAdapter(adapter.data));
    if (
      expected === null ||
      expected.providerFamilyReference !== adapter.data.providerFamilyReference ||
      expected.schemaVersion !== adapter.data.transportPolicyVersion
    ) {
      return null;
    }
    return immutableCopy(expected);
  } catch {
    return null;
  }
}
