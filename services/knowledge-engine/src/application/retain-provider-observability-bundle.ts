import {
  BoundedInMemoryProviderObservabilitySink,
  createProviderObservabilityBundle,
  createProviderObservabilityRetentionEvidence,
  verifyProviderObservabilityRetentionEvidence,
  type ProviderObservabilityBundle,
  type ProviderObservabilityBundleInput,
  type ProviderObservabilitySnapshot,
} from "../domain/provider-mapping-observability.js";
import { serializeDurableCanonicalJsonValue } from "../domain/canonical-fingerprint.js";
import { ProviderReadinessIntegrityError } from "../domain/provider-readiness.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import type { ProviderObservabilityRetentionEvidence } from "@founderos/knowledge-schema";

export type ObservabilityRetentionMode = "normal" | "fail-append" | "insufficient-capacity";

export interface ProviderObservabilityAppendAudit {
  appendCount: number;
}

export const INTERNAL_OBSERVABILITY_RETENTION_CONFIG = Object.freeze({
  sinkPolicyVersion: "1.0" as const,
  maximumEntriesPerArtifact: 2,
  maximumMetricLabelCardinality: 16,
});

class AppendRejectingProviderObservabilitySink extends BoundedInMemoryProviderObservabilitySink {
  public override appendBundle(bundle: ProviderObservabilityBundle): void {
    void bundle;
    throw new ProviderReadinessIntegrityError(
      "invalid_artifact",
      "Observability retention append failed",
    );
  }
}

class AuditedProviderObservabilitySink extends BoundedInMemoryProviderObservabilitySink {
  public constructor(
    options: ConstructorParameters<typeof BoundedInMemoryProviderObservabilitySink>[0],
    private readonly audit: ProviderObservabilityAppendAudit,
  ) {
    super(options);
  }

  public override appendBundle(bundle: ProviderObservabilityBundle): void {
    this.audit.appendCount += 1;
    super.appendBundle(bundle);
  }
}

function immutableCopy<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function sameCanonical(left: unknown, right: unknown): boolean {
  try {
    return serializeDurableCanonicalJsonValue(left) === serializeDurableCanonicalJsonValue(right);
  } catch {
    return false;
  }
}

/** Internal deterministic retention boundary; intentionally absent from the package facade. */
export function createAndVerifyRetainedProviderObservabilityBundle(
  input: ProviderObservabilityBundleInput,
  mode: ObservabilityRetentionMode = "normal",
  audit?: ProviderObservabilityAppendAudit,
): Readonly<{
  bundle: ProviderObservabilityBundle;
  retainedSnapshot: ProviderObservabilitySnapshot;
  retentionEvidence: ProviderObservabilityRetentionEvidence;
}> {
  const sinkOptions = {
    maximumEntriesPerArtifact:
      mode === "insufficient-capacity"
        ? 1
        : INTERNAL_OBSERVABILITY_RETENTION_CONFIG.maximumEntriesPerArtifact,
    maximumMetricLabelCardinality:
      INTERNAL_OBSERVABILITY_RETENTION_CONFIG.maximumMetricLabelCardinality,
  } as const;
  const sink =
    mode === "fail-append"
      ? new AppendRejectingProviderObservabilitySink(sinkOptions)
      : audit === undefined
        ? new BoundedInMemoryProviderObservabilitySink(sinkOptions)
        : new AuditedProviderObservabilitySink(sinkOptions, audit);
  const bundle = createProviderObservabilityBundle(input, sink);
  const retainedSnapshot = sink.snapshot();
  const expectedSnapshot: ProviderObservabilitySnapshot = {
    logs: [bundle.structuredLog],
    metrics: bundle.metrics,
    traces: bundle.traces,
    publicErrors: bundle.publicErrors,
  };
  if (!sameCanonical(retainedSnapshot, expectedSnapshot)) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Observability retention snapshot did not verify",
    );
  }
  const retentionEvidence = createProviderObservabilityRetentionEvidence({
    adapter: input.adapter,
    invocationRequest: input.authority.invocationRequest,
    bundle,
    retainedSnapshot,
    config: INTERNAL_OBSERVABILITY_RETENTION_CONFIG,
    appendCount: 1,
  });
  if (
    verifyProviderObservabilityRetentionEvidence({
      evidence: retentionEvidence,
      adapter: input.adapter,
      invocationRequest: input.authority.invocationRequest,
      bundle,
      retainedSnapshot,
      config: INTERNAL_OBSERVABILITY_RETENTION_CONFIG,
    }).status !== "valid"
  ) {
    throw new ProviderReadinessIntegrityError(
      "binding_mismatch",
      "Observability retention evidence did not verify",
    );
  }
  return immutableCopy({ bundle, retainedSnapshot, retentionEvidence });
}
