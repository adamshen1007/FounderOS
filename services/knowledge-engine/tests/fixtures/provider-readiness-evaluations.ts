import type {
  AuthorizationDecisionEvidence,
  CredentialReference,
  ObservabilityReadinessEvidence,
} from "@founderos/knowledge-schema";

import { resolveVerifiedGovernedReasoningAuthority } from "../../src/application/resolve-verified-governed-reasoning-authority.js";
import {
  createStaticProductionProviderTransportPolicyAuthority,
  resolveExpectedProductionProviderTransportPolicy,
  type ProductionProviderTransportPolicyAuthority,
} from "../../src/application/production-provider-transport-policy-authority.js";
import type {
  EvaluateProductionProviderReadinessInput,
  ProductionProviderReadinessGate,
  ProductionProviderReadinessEvaluation,
} from "../../src/application/evaluate-production-provider-readiness.js";
import { createProductionProviderReadinessEvaluator } from "../../src/application/evaluate-production-provider-readiness.js";
import { createDisabledProductionProviderAdapterHarness } from "../../src/application/disabled-production-provider-adapter-harness.js";
import type {
  ProviderObservabilityBundleInput,
  ProviderRequestPlanConstructionInput,
  ProviderResponseFixtureClassification,
} from "../../src/domain/provider-mapping-observability.js";
import { createProviderObservabilityBundle } from "../../src/domain/provider-mapping-observability.js";
import {
  createAuthorizationDecisionEvidence,
  createCredentialReference,
  createPricingReference,
  createProductionProviderAdapterDescriptor,
  createProviderTransportPlan,
  createSecureTransportPolicy,
  evaluateCostAndBudget,
  evaluateProviderRateAndCapacity,
  transitionCircuitState,
  type AuthorizationAuthority,
  type CircuitTransitionInput,
  type CredentialReferenceExpectation,
  type SecureTransportPolicyInput,
} from "../../src/domain/provider-readiness.js";
import { matchReasoningProviderCapabilities } from "../../src/domain/reasoning.js";
import { createDeterministicFakeReasoningProvider } from "../../src/infrastructure/deterministic-fake-reasoning-provider.js";
import { createInvocation, createReasoningTestRuntime } from "../reasoning-fixtures.js";

export const PROVIDER_READINESS_EVALUATED_AT = "2026-07-30T01:00:00.000Z";

export const PROVIDER_READINESS_EVALUATION_CATEGORIES = [
  "valid-readiness",
  "authorization",
  "credentials",
  "transport",
  "mapping",
  "rate-capacity",
  "cost-budget",
  "circuit-health",
  "observability",
  "harness-bypass",
] as const;

export type ProviderReadinessEvaluationCategory =
  (typeof PROVIDER_READINESS_EVALUATION_CATEGORIES)[number];

export type ProviderReadinessEvidenceKey =
  | "authorization"
  | "compatibility"
  | "transportPlan"
  | "rateAndCapacity"
  | "costAndBudget"
  | "circuit"
  | "observability"
  | "health"
  | "requestPlan";

type PublicInputTarget = "root" | "credentialReference" | "transportPolicy" | "observabilityPolicy";

export type ProviderReadinessEvaluationMutation =
  | Readonly<{ operation: "evaluate" | "repeat-evaluation" }>
  | Readonly<{
      operation: "verify-request-plan";
      focus: "mapping-contract" | "full-readiness-replay";
    }>
  | Readonly<{ operation: "validate-distinct-credential-reference" }>
  | Readonly<{ operation: "validate-distinct-transport-policy" }>
  | Readonly<{
      operation: "response-fixture";
      classification: ProviderResponseFixtureClassification | "usage-metadata" | "cost-metadata";
      tamperField?: "mappingEvidenceFingerprint";
    }>
  | Readonly<{
      operation: "authorization-outcome";
      outcome: Exclude<
        AuthorizationDecisionEvidence["outcome"],
        "allowed" | "expired" | "invalid-evidence"
      >;
    }>
  | Readonly<{ operation: "authorization-missing" | "authorization-expired" }>
  | Readonly<{
      operation: "authorization-substitution";
      field: "invocation" | "consumer" | "adapter" | "operation";
    }>
  | Readonly<{
      operation: "credential-availability";
      availability: Exclude<CredentialReference["availability"], "available">;
    }>
  | Readonly<{
      operation: "inject-prohibited";
      target: PublicInputTarget;
      field: string;
      value: unknown;
    }>
  | Readonly<{
      operation: "transport-field";
      field:
        | "allowedScheme"
        | "allowedHostnames"
        | "redirectPolicy"
        | "minimumTlsVersion"
        | "certificateValidationPolicy"
        | "maximumResponseBytes"
        | "connectionTimeoutMilliseconds";
      value: unknown;
    }>
  | Readonly<{ operation: "request-size-exceeded" }>
  | Readonly<{ operation: "authoritative-alternate-host" }>
  | Readonly<{ operation: "mapping-header-secret" }>
  | Readonly<{ operation: "request-plan-tamper" }>
  | Readonly<{
      operation: "rate";
      variant:
        | "admitted"
        | "rate-limited"
        | "capacity-exhausted"
        | "queue-full"
        | "provider-unavailable"
        | "quota-exceeded"
        | "stable-retry-after"
        | "exact-window-boundary";
    }>
  | Readonly<{
      operation: "cost";
      variant:
        | "within-budget"
        | "input-budget-exceeded"
        | "output-budget-exceeded"
        | "cost-ceiling-exceeded"
        | "pricing-unavailable"
        | "invalid-pricing-reference"
        | "manual-review"
        | "integer-minor-unit-boundary";
    }>
  | Readonly<{
      operation: "circuit";
      variant:
        | "closed"
        | "open"
        | "half-open"
        | "degraded-health"
        | "disabled"
        | "quarantined"
        | "reset-disabled"
        | "reset-quarantined"
        | "security-quarantine";
      harnessHealth?: boolean;
    }>
  | Readonly<{ operation: "adapter-disabled" | "assert-no-live-state" }>
  | Readonly<{ operation: "adapter-enabled-harness" }>
  | Readonly<{
      operation: "observability-harness";
      variant: "safe-log" | "public-error-privacy";
    }>
  | Readonly<{
      operation: "observability-bound";
      field: "maximumMetricLabelCount" | "maximumTraceAttributeCharacters";
      value: number;
    }>
  | Readonly<{
      operation: "unsafe-source-redaction";
      variant:
        | "credential-key"
        | "credential-value"
        | "authorization-header"
        | "raw-context"
        | "raw-provider-body"
        | "physical-path"
        | "environment-dump";
    }>
  | Readonly<{ operation: "static-import-closure"; concern: "dns" | "socket" }>
  | Readonly<{ operation: "unverified-delivery" | "unverified-invocation" }>
  | Readonly<{ operation: "decision-tamper" | "resigned-decision-substitution" }>;

export interface ProviderReadinessEvaluationExpected {
  readonly disposition: "completed" | "stopped" | "rejected" | "tamper-rejected";
  readonly readinessStatus:
    "ready-for-dry-run" | "not-ready" | "not-assessed" | "disabled-by-policy" | null;
  readonly completedGatePrefix: readonly ProductionProviderReadinessGate[];
  readonly stoppedGate: ProductionProviderReadinessGate | null;
  readonly blockerCodes: readonly string[];
  readonly warningCodes: readonly string[];
  readonly evidencePresent: readonly ProviderReadinessEvidenceKey[];
  readonly evidenceAbsent: readonly ProviderReadinessEvidenceKey[];
  readonly responseClassification: string | null;
  readonly responseOutcome: "succeeded" | "failed" | "timed-out" | null;
  readonly verificationStatus: "valid" | "invalid" | "not-applicable";
  readonly deterministicBytes: boolean;
  readonly networkActionCount: 0;
}

export interface ProviderReadinessEvaluationDescriptor {
  readonly scenarioId: string;
  readonly category: ProviderReadinessEvaluationCategory;
  readonly setup: Readonly<{
    source: "canonical-governed-m13-delivery-invocation";
    evaluationTime: "explicit";
    adapterMode: "disabled-harness-dry-run";
  }>;
  readonly mutation: ProviderReadinessEvaluationMutation;
  readonly expected: ProviderReadinessEvaluationExpected;
}

const COMPLETE_GATES: readonly ProductionProviderReadinessGate[] = [
  "durable-delivery-and-invocation",
  "authorization",
  "adapter-descriptor",
  "credential-reference",
  "capability",
  "transport-policy-plan",
  "rate-and-capacity",
  "cost-and-budget",
  "circuit",
  "observability-redaction",
  "health",
  "request-plan",
  "readiness-decision",
  "stop-before-transport",
];

const EVIDENCE_KEYS: readonly ProviderReadinessEvidenceKey[] = [
  "authorization",
  "compatibility",
  "transportPlan",
  "rateAndCapacity",
  "costAndBudget",
  "circuit",
  "observability",
  "health",
  "requestPlan",
];

const SETUP = {
  source: "canonical-governed-m13-delivery-invocation",
  evaluationTime: "explicit",
  adapterMode: "disabled-harness-dry-run",
} as const;

function completed(
  overrides: Partial<ProviderReadinessEvaluationExpected> = {},
): ProviderReadinessEvaluationExpected {
  return {
    disposition: "completed",
    readinessStatus: "ready-for-dry-run",
    completedGatePrefix: COMPLETE_GATES,
    stoppedGate: null,
    blockerCodes: [],
    warningCodes: ["cost_is_estimated", "dry_run_only"],
    evidencePresent: EVIDENCE_KEYS,
    evidenceAbsent: [],
    responseClassification: null,
    responseOutcome: null,
    verificationStatus: "valid",
    deterministicBytes: false,
    networkActionCount: 0,
    ...overrides,
  };
}

function rejected(
  overrides: Partial<ProviderReadinessEvaluationExpected> = {},
): ProviderReadinessEvaluationExpected {
  return {
    disposition: "rejected",
    readinessStatus: null,
    completedGatePrefix: [],
    stoppedGate: null,
    blockerCodes: [],
    warningCodes: [],
    evidencePresent: [],
    evidenceAbsent: EVIDENCE_KEYS,
    responseClassification: null,
    responseOutcome: null,
    verificationStatus: "not-applicable",
    deterministicBytes: false,
    networkActionCount: 0,
    ...overrides,
  };
}

function harnessCompleted(
  overrides: Partial<ProviderReadinessEvaluationExpected> = {},
): ProviderReadinessEvaluationExpected {
  return {
    disposition: "completed",
    readinessStatus: null,
    completedGatePrefix: [],
    stoppedGate: null,
    blockerCodes: [],
    warningCodes: [],
    evidencePresent: [],
    evidenceAbsent: EVIDENCE_KEYS,
    responseClassification: null,
    responseOutcome: null,
    verificationStatus: "valid",
    deterministicBytes: false,
    networkActionCount: 0,
    ...overrides,
  };
}

function stoppedAt(
  gate: ProductionProviderReadinessGate,
  blocker: string,
  completedGatePrefix: readonly ProductionProviderReadinessGate[],
  evidencePresent: readonly ProviderReadinessEvidenceKey[],
  overrides: Partial<ProviderReadinessEvaluationExpected> = {},
): ProviderReadinessEvaluationExpected {
  return {
    disposition: "stopped",
    readinessStatus: "not-ready",
    completedGatePrefix,
    stoppedGate: gate,
    blockerCodes: [blocker],
    warningCodes: [],
    evidencePresent,
    evidenceAbsent: EVIDENCE_KEYS.filter((key) => !evidencePresent.includes(key)),
    responseClassification: null,
    responseOutcome: null,
    verificationStatus: "valid",
    deterministicBytes: false,
    networkActionCount: 0,
    ...overrides,
  };
}

function descriptor(
  scenarioId: string,
  category: ProviderReadinessEvaluationCategory,
  mutation: ProviderReadinessEvaluationMutation,
  expected: ProviderReadinessEvaluationExpected,
): ProviderReadinessEvaluationDescriptor {
  return { scenarioId, category, setup: SETUP, mutation, expected };
}

const G1 = ["durable-delivery-and-invocation"] as const;
const G2 = [...G1, "authorization"] as const;
const G3 = [...G2, "adapter-descriptor"] as const;
const G4 = [...G3, "credential-reference"] as const;
const G5 = [...G4, "capability"] as const;
const G6 = [...G5, "transport-policy-plan"] as const;
const G7 = [...G6, "rate-and-capacity"] as const;
const G8 = [...G7, "cost-and-budget"] as const;
const G9 = [...G8, "circuit"] as const;

const RESPONSE_OUTCOMES: Readonly<Record<string, "succeeded" | "failed" | "timed-out">> = {
  "successful-response": "succeeded",
  "empty-response": "failed",
  "provider-timeout": "timed-out",
  "provider-rate-limit": "failed",
  "provider-server-failure": "failed",
  "invalid-provider-response": "failed",
  "credential-rejection": "failed",
  "transport-security-failure": "failed",
  "oversized-response": "failed",
  "redaction-failure": "failed",
  "usage-metadata": "succeeded",
  "cost-metadata": "succeeded",
};

const AUTHORIZATION_CASES = [
  descriptor(
    "authorization-missing",
    "authorization",
    { operation: "authorization-missing" },
    stoppedAt("authorization", "authorization_not_allowed", G1, []),
  ),
  ...(["denied", "review-required", "not-evaluated"] as const).map((outcome) =>
    descriptor(
      `authorization-${outcome}`,
      "authorization",
      { operation: "authorization-outcome", outcome },
      stoppedAt("authorization", "authorization_not_allowed", G1, ["authorization"]),
    ),
  ),
  descriptor(
    "authorization-expired",
    "authorization",
    { operation: "authorization-expired" },
    stoppedAt("authorization", "authorization_not_allowed", G1, ["authorization"]),
  ),
  ...(["invocation", "consumer", "adapter", "operation"] as const).map((field) =>
    descriptor(
      `authorization-${field}-mismatch`,
      "authorization",
      { operation: "authorization-substitution", field },
      stoppedAt("authorization", "authorization_not_allowed", G1, []),
    ),
  ),
];

const CREDENTIAL_CASES = [
  descriptor(
    "credential-valid-fake-reference",
    "credentials",
    { operation: "validate-distinct-credential-reference" },
    completed(),
  ),
  ...(["unavailable", "wrong-provider-family", "invalid-scope", "expired"] as const).map(
    (availability) =>
      descriptor(
        `credential-${availability}`,
        "credentials",
        { operation: "credential-availability", availability },
        stoppedAt("credential-reference", "credential_unavailable", G3, ["authorization"]),
      ),
  ),
  descriptor(
    "credential-raw-api-key",
    "credentials",
    {
      operation: "inject-prohibited",
      target: "credentialReference",
      field: "apiKey",
      value: "sk_live_catalog_secret",
    },
    rejected(),
  ),
  descriptor(
    "credential-bearer-token",
    "credentials",
    {
      operation: "inject-prohibited",
      target: "credentialReference",
      field: "token",
      value: "Bearer catalog-secret",
    },
    rejected(),
  ),
  descriptor(
    "credential-url",
    "credentials",
    {
      operation: "inject-prohibited",
      target: "credentialReference",
      field: "credentialUrl",
      value: "https://user:pass@provider.invalid",
    },
    rejected(),
  ),
  descriptor(
    "credential-secret-like-environment-value",
    "credentials",
    {
      operation: "inject-prohibited",
      target: "credentialReference",
      field: "environment",
      value: { PROVIDER_TOKEN: "secret-value" },
    },
    rejected(),
  ),
];

const TRANSPORT_REJECTIONS = [
  ["transport-http", "allowedScheme", "http"],
  ["transport-redirect", "redirectPolicy", "follow"],
  ["transport-loopback", "allowedHostnames", ["127.0.0.1"]],
  ["transport-private", "allowedHostnames", ["10.0.0.1"]],
  ["transport-link-local", "allowedHostnames", ["169.254.1.1"]],
  ["transport-metadata", "allowedHostnames", ["metadata.google.internal"]],
  ["transport-reserved", "allowedHostnames", ["192.0.2.1"]],
  ["transport-invalid-tls", "minimumTlsVersion", "TLSv1.0"],
  ["transport-certificate-validation-disabled", "certificateValidationPolicy", "disabled"],
  ["transport-invalid-timeout", "connectionTimeoutMilliseconds", 0],
] as const;

const TRANSPORT_CASES = [
  descriptor(
    "transport-valid-https-allowlist",
    "transport",
    { operation: "validate-distinct-transport-policy" },
    completed(),
  ),
  ...TRANSPORT_REJECTIONS.map(([scenarioId, field, value]) =>
    descriptor(
      scenarioId,
      "transport",
      { operation: "transport-field", field, value },
      stoppedAt("transport-policy-plan", "transport_policy_rejected", G5, [
        "authorization",
        "compatibility",
      ]),
    ),
  ),
  descriptor(
    "transport-arbitrary-host",
    "transport",
    { operation: "authoritative-alternate-host" },
    stoppedAt("transport-policy-plan", "transport_policy_rejected", G5, [
      "authorization",
      "compatibility",
    ]),
  ),
  descriptor(
    "transport-response-size-exceeded",
    "transport",
    { operation: "response-fixture", classification: "oversized-response" },
    harnessCompleted({
      responseClassification: "oversized-response",
      responseOutcome: "failed",
    }),
  ),
  descriptor(
    "transport-credential-in-url",
    "transport",
    {
      operation: "inject-prohibited",
      target: "transportPolicy",
      field: "endpointUrl",
      value: "https://user:pass@provider.invalid",
    },
    rejected(),
  ),
  descriptor(
    "transport-request-size-exceeded",
    "transport",
    { operation: "request-size-exceeded" },
    stoppedAt(
      "request-plan",
      "request_mapping_invalid",
      [...G9, "observability-redaction", "health"],
      [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
        "costAndBudget",
        "circuit",
        "observability",
        "health",
      ],
    ),
  ),
  descriptor(
    "transport-network-callback-injection",
    "transport",
    {
      operation: "inject-prohibited",
      target: "root",
      field: "callback",
      value: "zero-invocation-probe",
    },
    rejected(),
  ),
];

const MAPPING_CASES = [
  descriptor(
    "mapping-valid",
    "mapping",
    { operation: "verify-request-plan", focus: "mapping-contract" },
    completed(),
  ),
  descriptor(
    "mapping-hidden-context",
    "mapping",
    {
      operation: "inject-prohibited",
      target: "root",
      field: "hiddenContext",
      value: "catalog-hidden-context",
    },
    rejected(),
  ),
  descriptor(
    "mapping-tool-payload",
    "mapping",
    {
      operation: "inject-prohibited",
      target: "root",
      field: "toolPayload",
      value: { tools: ["catalog-tool"] },
    },
    rejected(),
  ),
  descriptor(
    "mapping-executable-provider-payload",
    "mapping",
    {
      operation: "inject-prohibited",
      target: "root",
      field: "providerPayload",
      value: { model: "live-model" },
    },
    rejected(),
  ),
  descriptor(
    "mapping-header-secret",
    "mapping",
    { operation: "mapping-header-secret" },
    harnessCompleted({ disposition: "tamper-rejected", verificationStatus: "invalid" }),
  ),
  descriptor(
    "mapping-fingerprint-tamper",
    "mapping",
    { operation: "request-plan-tamper" },
    completed({ disposition: "tamper-rejected", verificationStatus: "invalid" }),
  ),
  descriptor(
    "mapping-response-tamper",
    "mapping",
    {
      operation: "response-fixture",
      classification: "successful-response",
      tamperField: "mappingEvidenceFingerprint",
    },
    harnessCompleted({
      disposition: "tamper-rejected",
      responseClassification: "successful-response",
      responseOutcome: "succeeded",
      verificationStatus: "invalid",
    }),
  ),
  descriptor(
    "mapping-raw-error-body-persistence",
    "mapping",
    {
      operation: "response-fixture",
      classification: "redaction-failure",
    },
    harnessCompleted({
      responseClassification: "redaction-failure",
      responseOutcome: "failed",
    }),
  ),
];

const RATE_CASES = (
  [
    ["rate-admitted", "admitted", completed()],
    [
      "rate-limited",
      "rate-limited",
      stoppedAt("rate-and-capacity", "rate_capacity_rejected", G6, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
      ]),
    ],
    [
      "rate-capacity-exhausted",
      "capacity-exhausted",
      stoppedAt("rate-and-capacity", "rate_capacity_rejected", G6, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
      ]),
    ],
    [
      "rate-queue-full",
      "queue-full",
      stoppedAt("rate-and-capacity", "rate_capacity_rejected", G6, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
      ]),
    ],
    [
      "rate-provider-unavailable",
      "provider-unavailable",
      stoppedAt("rate-and-capacity", "rate_capacity_rejected", G6, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
      ]),
    ],
    [
      "rate-quota-exceeded",
      "quota-exceeded",
      stoppedAt("rate-and-capacity", "rate_capacity_rejected", G6, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
      ]),
    ],
    [
      "rate-stable-retry-after",
      "stable-retry-after",
      stoppedAt(
        "rate-and-capacity",
        "rate_capacity_rejected",
        G6,
        ["authorization", "compatibility", "transportPlan", "rateAndCapacity"],
        { deterministicBytes: true },
      ),
    ],
    ["rate-exact-time-window-boundary", "exact-window-boundary", completed()],
  ] as const
).map(([scenarioId, variant, expected]) =>
  descriptor(scenarioId, "rate-capacity", { operation: "rate", variant }, expected),
);

const COST_CASES = (
  [
    ["cost-within-budget", "within-budget", completed()],
    [
      "cost-input-budget-exceeded",
      "input-budget-exceeded",
      stoppedAt("cost-and-budget", "cost_budget_rejected", G7, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
        "costAndBudget",
      ]),
    ],
    [
      "cost-output-budget-exceeded",
      "output-budget-exceeded",
      stoppedAt("cost-and-budget", "cost_budget_rejected", G7, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
        "costAndBudget",
      ]),
    ],
    [
      "cost-ceiling-exceeded",
      "cost-ceiling-exceeded",
      stoppedAt("cost-and-budget", "cost_budget_rejected", G7, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
        "costAndBudget",
      ]),
    ],
    [
      "cost-pricing-unavailable",
      "pricing-unavailable",
      stoppedAt("cost-and-budget", "cost_budget_rejected", G7, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
        "costAndBudget",
      ]),
    ],
    [
      "cost-invalid-pricing-reference",
      "invalid-pricing-reference",
      stoppedAt("cost-and-budget", "cost_budget_rejected", G7, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
      ]),
    ],
    [
      "cost-manual-review",
      "manual-review",
      stoppedAt("cost-and-budget", "cost_budget_rejected", G7, [
        "authorization",
        "compatibility",
        "transportPlan",
        "rateAndCapacity",
        "costAndBudget",
      ]),
    ],
    ["cost-integer-minor-unit-boundary", "integer-minor-unit-boundary", completed()],
  ] as const
).map(([scenarioId, variant, expected]) =>
  descriptor(scenarioId, "cost-budget", { operation: "cost", variant }, expected),
);

const CIRCUIT_CASES = [
  descriptor(
    "circuit-closed",
    "circuit-health",
    { operation: "circuit", variant: "closed" },
    completed(),
  ),
  descriptor(
    "circuit-open",
    "circuit-health",
    { operation: "circuit", variant: "open" },
    stoppedAt("circuit", "circuit_not_ready", G8, [
      "authorization",
      "compatibility",
      "transportPlan",
      "rateAndCapacity",
      "costAndBudget",
      "circuit",
    ]),
  ),
  descriptor(
    "circuit-half-open-bounded-probe",
    "circuit-health",
    { operation: "circuit", variant: "half-open" },
    completed(),
  ),
  descriptor(
    "circuit-disabled",
    "circuit-health",
    { operation: "circuit", variant: "disabled" },
    stoppedAt("circuit", "circuit_not_ready", G8, [
      "authorization",
      "compatibility",
      "transportPlan",
      "rateAndCapacity",
      "costAndBudget",
      "circuit",
    ]),
  ),
  descriptor(
    "circuit-quarantined",
    "circuit-health",
    { operation: "circuit", variant: "quarantined" },
    stoppedAt("circuit", "circuit_not_ready", G8, [
      "authorization",
      "compatibility",
      "transportPlan",
      "rateAndCapacity",
      "costAndBudget",
      "circuit",
    ]),
  ),
  descriptor(
    "circuit-reset-disabled-rejected",
    "circuit-health",
    { operation: "circuit", variant: "reset-disabled" },
    rejected(),
  ),
  descriptor(
    "circuit-reset-quarantined-rejected",
    "circuit-health",
    { operation: "circuit", variant: "reset-quarantined" },
    rejected(),
  ),
  descriptor(
    "circuit-immediate-security-quarantine",
    "circuit-health",
    { operation: "circuit", variant: "security-quarantine" },
    stoppedAt("circuit", "circuit_not_ready", G8, [
      "authorization",
      "compatibility",
      "transportPlan",
      "rateAndCapacity",
      "costAndBudget",
      "circuit",
    ]),
  ),
  descriptor(
    "health-degraded",
    "circuit-health",
    { operation: "circuit", variant: "degraded-health" },
    completed(),
  ),
  descriptor(
    "health-unavailable",
    "circuit-health",
    { operation: "circuit", variant: "open", harnessHealth: true },
    harnessCompleted(),
  ),
  descriptor(
    "readiness-disabled",
    "circuit-health",
    { operation: "adapter-disabled" },
    stoppedAt("adapter-descriptor", "adapter_disabled", G2, ["authorization"], {
      readinessStatus: "disabled-by-policy",
    }),
  ),
  descriptor(
    "readiness-no-live-traffic-state",
    "circuit-health",
    { operation: "assert-no-live-state" },
    completed(),
  ),
];

const OBSERVABILITY_CASES = [
  descriptor(
    "observability-safe-structured-log",
    "observability",
    { operation: "observability-harness", variant: "safe-log" },
    harnessCompleted(),
  ),
  descriptor(
    "observability-credential-key-redaction",
    "observability",
    { operation: "unsafe-source-redaction", variant: "credential-key" },
    harnessCompleted(),
  ),
  descriptor(
    "observability-credential-value-redaction",
    "observability",
    { operation: "unsafe-source-redaction", variant: "credential-value" },
    harnessCompleted(),
  ),
  descriptor(
    "observability-authorization-header",
    "observability",
    { operation: "unsafe-source-redaction", variant: "authorization-header" },
    harnessCompleted(),
  ),
  descriptor(
    "observability-raw-context-omission",
    "observability",
    { operation: "unsafe-source-redaction", variant: "raw-context" },
    harnessCompleted(),
  ),
  descriptor(
    "observability-raw-provider-body-omission",
    "observability",
    { operation: "unsafe-source-redaction", variant: "raw-provider-body" },
    harnessCompleted(),
  ),
  descriptor(
    "observability-physical-path",
    "observability",
    { operation: "unsafe-source-redaction", variant: "physical-path" },
    harnessCompleted(),
  ),
  descriptor(
    "observability-environment-dump",
    "observability",
    { operation: "unsafe-source-redaction", variant: "environment-dump" },
    harnessCompleted(),
  ),
  descriptor(
    "observability-metric-cardinality",
    "observability",
    { operation: "observability-bound", field: "maximumMetricLabelCount", value: 2 },
    stoppedAt("observability-redaction", "observability_not_ready", G9, [
      "authorization",
      "compatibility",
      "transportPlan",
      "rateAndCapacity",
      "costAndBudget",
      "circuit",
    ]),
  ),
  descriptor(
    "observability-oversized-trace",
    "observability",
    { operation: "observability-bound", field: "maximumTraceAttributeCharacters", value: 1 },
    stoppedAt("observability-redaction", "observability_not_ready", G9, [
      "authorization",
      "compatibility",
      "transportPlan",
      "rateAndCapacity",
      "costAndBudget",
      "circuit",
    ]),
  ),
  descriptor(
    "observability-public-error-privacy",
    "observability",
    { operation: "observability-harness", variant: "public-error-privacy" },
    harnessCompleted(),
  ),
];

const BYPASS_CASES = [
  descriptor(
    "harness-enabled-adapter",
    "harness-bypass",
    { operation: "adapter-enabled-harness" },
    rejected(),
  ),
  descriptor(
    "harness-direct-network-attempt",
    "harness-bypass",
    {
      operation: "inject-prohibited",
      target: "root",
      field: "networkClient",
      value: "zero-invocation-probe",
    },
    rejected(),
  ),
  descriptor(
    "harness-socket-absence",
    "harness-bypass",
    { operation: "static-import-closure", concern: "socket" },
    harnessCompleted(),
  ),
  descriptor(
    "harness-dns-absence",
    "harness-bypass",
    { operation: "static-import-closure", concern: "dns" },
    harnessCompleted(),
  ),
  descriptor(
    "harness-provider-client",
    "harness-bypass",
    {
      operation: "inject-prohibited",
      target: "root",
      field: "providerClient",
      value: { kind: "catalog-client" },
    },
    rejected(),
  ),
  descriptor(
    "harness-raw-knowledge",
    "harness-bypass",
    {
      operation: "inject-prohibited",
      target: "root",
      field: "rawKnowledgeObject",
      value: { objectType: "decision" },
    },
    rejected(),
  ),
  descriptor(
    "harness-query-result",
    "harness-bypass",
    { operation: "inject-prohibited", target: "root", field: "queryResult", value: { items: [] } },
    rejected(),
  ),
  descriptor(
    "harness-unverified-delivery",
    "harness-bypass",
    { operation: "unverified-delivery" },
    rejected({ stoppedGate: "durable-delivery-and-invocation" }),
  ),
  descriptor(
    "harness-unverified-invocation",
    "harness-bypass",
    { operation: "unverified-invocation" },
    rejected({ stoppedGate: "durable-delivery-and-invocation" }),
  ),
  descriptor(
    "harness-low-level-request-plan",
    "harness-bypass",
    {
      operation: "inject-prohibited",
      target: "root",
      field: "requestPlan",
      value: { status: "prebuilt" },
    },
    rejected(),
  ),
  descriptor(
    "harness-decision-tamper",
    "harness-bypass",
    { operation: "decision-tamper" },
    completed({ disposition: "tamper-rejected", verificationStatus: "invalid" }),
  ),
  descriptor(
    "harness-resigned-semantic-substitution",
    "harness-bypass",
    { operation: "resigned-decision-substitution" },
    completed({ disposition: "tamper-rejected", verificationStatus: "invalid" }),
  ),
];

export const EXECUTABLE_PROVIDER_READINESS_EVALUATIONS: readonly ProviderReadinessEvaluationDescriptor[] =
  [
    descriptor("valid-full-readiness", "valid-readiness", { operation: "evaluate" }, completed()),
    descriptor(
      "valid-repeated-byte-stable",
      "valid-readiness",
      { operation: "repeat-evaluation" },
      completed({ deterministicBytes: true }),
    ),
    descriptor(
      "valid-request-plan-verification",
      "valid-readiness",
      { operation: "verify-request-plan", focus: "full-readiness-replay" },
      completed(),
    ),
    descriptor(
      "valid-deterministic-response-mapping",
      "valid-readiness",
      { operation: "response-fixture", classification: "successful-response" },
      harnessCompleted({
        responseClassification: "successful-response",
        responseOutcome: RESPONSE_OUTCOMES["successful-response"],
        deterministicBytes: true,
      }),
    ),
    ...AUTHORIZATION_CASES,
    ...CREDENTIAL_CASES,
    ...TRANSPORT_CASES,
    ...MAPPING_CASES,
    ...RATE_CASES,
    ...COST_CASES,
    ...CIRCUIT_CASES,
    ...OBSERVABILITY_CASES,
    ...BYPASS_CASES,
  ];

export async function createCanonicalProviderReadinessEvaluationRuntime(roots: string[]) {
  const runtime = await createReasoningTestRuntime(roots);
  const invocationRequest = createInvocation(runtime);
  const authority = await resolveVerifiedGovernedReasoningAuthority({
    deliveryLedger: runtime.deliveryLedger,
    deliveryIdentity: runtime.deliveryIdentity,
    invocationRequest,
  });
  const providerCapability = createDeterministicFakeReasoningProvider().providerCapability;
  const adapterDescriptor = createProductionProviderAdapterDescriptor(
    {
      schemaVersion: "1.0",
      adapterId: "adapter-readiness-catalog",
      providerFamilyReference: "provider-family/evaluation",
      requestMappingVersion: "1.0",
      responseMappingVersion: "1.0",
      transportPolicyVersion: "1.0",
      observabilityPolicyVersion: "1.0",
      credentialReferenceClass: "evaluation-fixture-reference",
      state: "dry-run-mapping",
    },
    providerCapability,
  );
  const expectedAuthorizationDecision = {
    authorizationDecisionId: "authorization-readiness-catalog",
    decidedAt: PROVIDER_READINESS_EVALUATED_AT,
    expiresAt: "2026-07-30T02:00:00.000Z",
    outcome: "allowed" as const,
  };
  const authorizationAuthority: AuthorizationAuthority = {
    deliveryAuthority: authority,
    adapter: adapterDescriptor,
    requestedOperation: "prepare-provider-request",
    decisionAuthorityReference: "authority/provider-readiness",
  };
  const transportPolicy = createSecureTransportPolicy({
    schemaVersion: "1.0",
    transportPolicyId: "transport-policy-catalog",
    providerFamilyReference: adapterDescriptor.providerFamilyReference,
    allowedScheme: "https",
    allowedHostnames: ["api.provider.dev"],
    allowedPorts: [443],
    dnsResolutionPolicy: "disabled-dry-run",
    redirectPolicy: "deny",
    tlsRequired: true,
    minimumTlsVersion: "TLSv1.3",
    certificateValidationPolicy: "system-trust-and-hostname-required",
    connectionTimeoutMilliseconds: 1_000,
    requestTimeoutMilliseconds: 5_000,
    maximumRequestBytes: 20_000,
    maximumResponseBytes: 40_000,
    retryTransportPolicy: "no-transport-retry",
    proxyPolicy: "deny",
    egressClassification: "public-provider",
  });
  const transportPolicyAuthority = createStaticProductionProviderTransportPolicyAuthority({
    adapter: adapterDescriptor,
    expectedPolicy: transportPolicy,
  });
  const evaluator = createProductionProviderReadinessEvaluator({ transportPolicyAuthority });
  const harness = createDisabledProductionProviderAdapterHarness({ transportPolicyAuthority });
  const input: EvaluateProductionProviderReadinessInput = {
    schemaVersion: "1.0",
    readinessDecisionId: "readiness-catalog",
    requestPlanId: "request-plan-catalog",
    transportPlanId: "transport-plan-catalog",
    healthEvidenceId: "health-catalog",
    observabilityReadinessEvidenceId: "observability-catalog",
    evaluatedAt: PROVIDER_READINESS_EVALUATED_AT,
    startedAt: PROVIDER_READINESS_EVALUATED_AT,
    deliveryLedger: runtime.deliveryLedger,
    deliveryIdentity: runtime.deliveryIdentity,
    invocationRequest,
    authorizationEvidence: createAuthorizationDecisionEvidence(
      expectedAuthorizationDecision,
      authorizationAuthority,
    ),
    expectedAuthorizationDecision,
    requestedOperation: "prepare-provider-request",
    decisionAuthorityReference: "authority/provider-readiness",
    adapterDescriptor,
    credentialReference: createCredentialReference({
      schemaVersion: "1.0",
      credentialReferenceId: "credential-readiness-catalog",
      providerFamilyReference: adapterDescriptor.providerFamilyReference,
      secretStoreClass: "external-secret-store",
      scopeReference: "scope/reasoning-dry-run",
      environmentClass: "evaluation",
      rotationVersion: "rotation-v1",
      availability: "available",
    }),
    providerCapability,
    transportPolicy,
    ratePolicy: {
      capacityPolicyVersion: "1.0",
      windowDurationMilliseconds: 60_000,
      requestLimit: 10,
      concurrentLimit: 2,
      maximumQueuedRequests: 3,
      consumerQuotaLimit: 20,
      policyPermitsAdmission: true,
    },
    rateCounters: {
      windowStartedAt: PROVIDER_READINESS_EVALUATED_AT,
      requestsInWindow: 1,
      concurrentInFlight: 0,
      queuedRequests: 0,
      consumerQuotaUsed: 1,
      providerCapacityState: "available",
    },
    priorityClass: "normal",
    pricingReference: createPricingReference({
      schemaVersion: "1.0",
      pricingReferenceId: "pricing-catalog",
      providerFamilyReference: adapterDescriptor.providerFamilyReference,
      pricingVersion: "pricing-v1",
      currencyCode: "USD",
      inputUnitSize: 1_000,
      inputUnitPriceMinorUnits: 2,
      outputUnitSize: 1_000,
      outputUnitPriceMinorUnits: 4,
      availability: "available",
      effectiveAt: PROVIDER_READINESS_EVALUATED_AT,
    }),
    costPolicy: {
      budgetPolicyVersion: "1.0",
      budgetReference: "budget/project-one",
      currencyCode: "USD",
      maximumInputUnits: 20_000,
      maximumOutputUnits: 4_000,
      costCeilingMinorUnits: 100,
      maximumAttemptCount: 1,
      timeoutBudgetMilliseconds: 1_000,
      costCeilingMandatory: true,
      manualReviewRequired: false,
    },
    circuitStateId: "circuit-catalog",
    previousCircuitState: null,
    circuitThresholdPolicy: {
      failureThreshold: 3,
      windowDurationMilliseconds: 60_000,
      openDurationMilliseconds: 30_000,
      halfOpenMaximumProbeCount: 2,
      securityViolationQuarantines: true,
    },
    circuitFailureWindow: {
      windowStartedAt: PROVIDER_READINESS_EVALUATED_AT,
      failureCounts: [],
    },
    circuitCommand: "evaluate",
    circuitProbeOutcome: "none",
    circuitProbesAlreadyUsed: 0,
    observabilityPolicy: {
      redactionPolicyVersion: "1.0",
      maximumLogFieldCharacters: 256,
      maximumTraceAttributeCharacters: 128,
      maximumMetricLabelCount: 8,
    },
  };
  return { runtime, authority, input, transportPolicyAuthority, evaluator, harness };
}

export function cloneReadinessInput(
  input: EvaluateProductionProviderReadinessInput,
): EvaluateProductionProviderReadinessInput {
  const { deliveryLedger, ...canonical } = input;
  return { ...structuredClone(canonical), deliveryLedger };
}

function withoutFingerprint<T extends Record<string, unknown>>(
  value: T,
  fingerprintField: keyof T,
): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== fingerprintField));
}

/** Reconstructs every exact verifier authority without exposing a production helper. */
export async function reconstructProviderReadinessVerifierAuthorities(
  input: EvaluateProductionProviderReadinessInput,
  evaluation: ProductionProviderReadinessEvaluation,
  transportPolicyAuthority: ProductionProviderTransportPolicyAuthority,
) {
  const authority = await resolveVerifiedGovernedReasoningAuthority({
    deliveryLedger: input.deliveryLedger,
    deliveryIdentity: input.deliveryIdentity,
    invocationRequest: input.invocationRequest,
  });
  const authorizationAuthority: AuthorizationAuthority = {
    deliveryAuthority: authority,
    adapter: input.adapterDescriptor,
    requestedOperation: input.requestedOperation,
    decisionAuthorityReference: input.decisionAuthorityReference,
  };
  const authorization = {
    evidence: evaluation.evidence.authorization!,
    authority: authorizationAuthority,
    expectedDecision: input.expectedAuthorizationDecision,
  };
  const credentialExpected = {
    ...withoutFingerprint(input.credentialReference, "referenceFingerprint"),
    adapterCredentialReferenceClass: input.adapterDescriptor.credentialReferenceClass,
    expectedAdapterFingerprint: input.adapterDescriptor.adapterFingerprint,
  } as unknown as CredentialReferenceExpectation;
  const expectedTransportPolicy = resolveExpectedProductionProviderTransportPolicy({
    authority: transportPolicyAuthority,
    adapter: input.adapterDescriptor,
  });
  if (expectedTransportPolicy === null) throw new Error("Transport Policy authority is required");
  const transportPolicyInput = withoutFingerprint(
    expectedTransportPolicy,
    "policyFingerprint",
  ) as unknown as SecureTransportPolicyInput;
  const rateEvaluation = {
    decisionId: `${input.readinessDecisionId}-rate`,
    invocationRequest: input.invocationRequest,
    adapter: input.adapterDescriptor,
    policy: input.ratePolicy,
    counters: input.rateCounters,
    priorityClass: input.priorityClass,
    evaluatedAt: input.evaluatedAt,
  } as const;
  const costEvaluation = {
    decisionId: `${input.readinessDecisionId}-cost`,
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
    adapter: input.adapterDescriptor,
    pricingReference: input.pricingReference,
    policy: input.costPolicy,
    evaluatedAt: input.evaluatedAt,
  } as const;
  const circuitTransition: CircuitTransitionInput = {
    circuitStateId: input.circuitStateId,
    adapter: input.adapterDescriptor,
    previousState: input.previousCircuitState,
    thresholdPolicy: input.circuitThresholdPolicy,
    failureWindow: input.circuitFailureWindow,
    evaluatedAt: input.evaluatedAt,
    command: input.circuitCommand,
    probeOutcome: input.circuitProbeOutcome,
    probesAlreadyUsed: input.circuitProbesAlreadyUsed,
  };
  const compatibility = evaluation.evidence.compatibility!;
  const transportPlan = evaluation.evidence.transportPlan!;
  const rateAndCapacity = evaluation.evidence.rateAndCapacity!;
  const costAndBudget = evaluation.evidence.costAndBudget!;
  const circuit = evaluation.evidence.circuit!;
  const observability = evaluation.evidence.observability!;
  const observabilityInput: ProviderObservabilityBundleInput = {
    schemaVersion: "1.0",
    readinessEvidenceId: input.observabilityReadinessEvidenceId,
    evaluatedAt: input.evaluatedAt,
    startedAt: input.startedAt,
    authority,
    adapter: input.adapterDescriptor,
    providerCapability: input.providerCapability,
    compatibility,
    authorization,
    rate: { decision: rateAndCapacity, evaluation: rateEvaluation },
    cost: { decision: costAndBudget, evaluation: costEvaluation },
    circuit: { state: circuit, transition: circuitTransition },
    policy: input.observabilityPolicy,
  };
  const expectedObservability = withoutFingerprint(
    observability.readiness,
    "readinessFingerprint",
  ) as unknown as Omit<ObservabilityReadinessEvidence, "readinessFingerprint">;
  const healthDerivation = {
    healthEvidenceId: input.healthEvidenceId,
    adapter: input.adapterDescriptor,
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
    authorization,
    credential: { reference: input.credentialReference, expected: credentialExpected },
    transport: {
      plan: transportPlan,
      policy: input.transportPolicy,
      policyInput: transportPolicyInput,
      expectedTransportPlanId: input.transportPlanId,
    },
    rate: { decision: rateAndCapacity, evaluation: rateEvaluation },
    cost: { decision: costAndBudget, evaluation: costEvaluation },
    circuit: { state: circuit, transition: circuitTransition },
    observability: { evidence: observability.readiness, expected: expectedObservability },
    evaluatedAt: input.evaluatedAt,
  } as const;
  const requestPlanConstruction: ProviderRequestPlanConstructionInput = {
    schemaVersion: "1.0",
    requestPlanId: input.requestPlanId,
    evaluatedAt: input.evaluatedAt,
    authority,
    adapter: input.adapterDescriptor,
    providerCapability: input.providerCapability,
    compatibility,
    authorization,
    credential: { reference: input.credentialReference, expected: credentialExpected },
    transport: {
      policy: input.transportPolicy,
      policyInput: transportPolicyInput,
      plan: transportPlan,
      expectedTransportPlanId: input.transportPlanId,
    },
    rate: { decision: rateAndCapacity, evaluation: rateEvaluation },
    cost: { decision: costAndBudget, evaluation: costEvaluation },
  };
  return {
    authority,
    authorization,
    credentialExpected,
    transportPolicyInput,
    rateEvaluation,
    costEvaluation,
    circuitTransition,
    observabilityInput,
    expectedObservability,
    healthDerivation,
    requestPlanConstruction,
  };
}

/** Reconstructs exact disabled-harness inputs without trusting returned verification fields. */
export async function reconstructDisabledHarnessVerifierAuthorities(
  input: EvaluateProductionProviderReadinessInput,
  transportPolicyAuthority: ProductionProviderTransportPolicyAuthority,
) {
  const authority = await resolveVerifiedGovernedReasoningAuthority({
    deliveryLedger: input.deliveryLedger,
    deliveryIdentity: input.deliveryIdentity,
    invocationRequest: input.invocationRequest,
  });
  const authorizationAuthority: AuthorizationAuthority = {
    deliveryAuthority: authority,
    adapter: input.adapterDescriptor,
    requestedOperation: input.requestedOperation,
    decisionAuthorityReference: input.decisionAuthorityReference,
  };
  if (input.authorizationEvidence === null) throw new Error("Authorization fixture is required");
  const authorization = {
    evidence: input.authorizationEvidence,
    authority: authorizationAuthority,
    expectedDecision: input.expectedAuthorizationDecision,
  };
  const credentialExpected = {
    ...withoutFingerprint(input.credentialReference, "referenceFingerprint"),
    adapterCredentialReferenceClass: input.adapterDescriptor.credentialReferenceClass,
    expectedAdapterFingerprint: input.adapterDescriptor.adapterFingerprint,
  } as unknown as CredentialReferenceExpectation;
  const expectedTransportPolicy = resolveExpectedProductionProviderTransportPolicy({
    authority: transportPolicyAuthority,
    adapter: input.adapterDescriptor,
  });
  if (expectedTransportPolicy === null) throw new Error("Transport Policy authority is required");
  const transportPolicyInput = withoutFingerprint(
    expectedTransportPolicy,
    "policyFingerprint",
  ) as unknown as SecureTransportPolicyInput;
  const transportPlan = createProviderTransportPlan({
    transportPlanId: input.transportPlanId,
    adapter: input.adapterDescriptor,
    policy: input.transportPolicy,
  });
  const compatibility = matchReasoningProviderCapabilities({
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
  });
  const rateEvaluation = {
    decisionId: `${input.readinessDecisionId}-rate`,
    invocationRequest: input.invocationRequest,
    adapter: input.adapterDescriptor,
    policy: input.ratePolicy,
    counters: input.rateCounters,
    priorityClass: input.priorityClass,
    evaluatedAt: input.evaluatedAt,
  } as const;
  const rateDecision = evaluateProviderRateAndCapacity(rateEvaluation);
  const costEvaluation = {
    decisionId: `${input.readinessDecisionId}-cost`,
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
    adapter: input.adapterDescriptor,
    pricingReference: input.pricingReference,
    policy: input.costPolicy,
    evaluatedAt: input.evaluatedAt,
  } as const;
  const costDecision = evaluateCostAndBudget(costEvaluation);
  const circuitTransition: CircuitTransitionInput = {
    circuitStateId: input.circuitStateId,
    adapter: input.adapterDescriptor,
    previousState: input.previousCircuitState,
    thresholdPolicy: input.circuitThresholdPolicy,
    failureWindow: input.circuitFailureWindow,
    evaluatedAt: input.evaluatedAt,
    command: input.circuitCommand,
    probeOutcome: input.circuitProbeOutcome,
    probesAlreadyUsed: input.circuitProbesAlreadyUsed,
  };
  const circuit = transitionCircuitState(circuitTransition);
  const observabilityInput: ProviderObservabilityBundleInput = {
    schemaVersion: "1.0",
    readinessEvidenceId: input.observabilityReadinessEvidenceId,
    evaluatedAt: input.evaluatedAt,
    startedAt: input.startedAt,
    authority,
    adapter: input.adapterDescriptor,
    providerCapability: input.providerCapability,
    compatibility,
    authorization,
    rate: { decision: rateDecision, evaluation: rateEvaluation },
    cost: { decision: costDecision, evaluation: costEvaluation },
    circuit: { state: circuit, transition: circuitTransition },
    policy: input.observabilityPolicy,
  };
  const observabilityBundle = createProviderObservabilityBundle(observabilityInput);
  const expectedObservability = withoutFingerprint(
    observabilityBundle.readiness,
    "readinessFingerprint",
  ) as unknown as Omit<ObservabilityReadinessEvidence, "readinessFingerprint">;
  const healthDerivation = {
    healthEvidenceId: input.healthEvidenceId,
    adapter: input.adapterDescriptor,
    invocationRequest: input.invocationRequest,
    providerCapability: input.providerCapability,
    authorization,
    credential: { reference: input.credentialReference, expected: credentialExpected },
    transport: {
      plan: transportPlan,
      policy: input.transportPolicy,
      policyInput: transportPolicyInput,
      expectedTransportPlanId: input.transportPlanId,
    },
    rate: { decision: rateDecision, evaluation: rateEvaluation },
    cost: { decision: costDecision, evaluation: costEvaluation },
    circuit: { state: circuit, transition: circuitTransition },
    observability: { evidence: observabilityBundle.readiness, expected: expectedObservability },
    evaluatedAt: input.evaluatedAt,
  } as const;
  const requestPlanConstruction: ProviderRequestPlanConstructionInput = {
    schemaVersion: "1.0",
    requestPlanId: input.requestPlanId,
    evaluatedAt: input.evaluatedAt,
    authority,
    adapter: input.adapterDescriptor,
    providerCapability: input.providerCapability,
    compatibility,
    authorization,
    credential: { reference: input.credentialReference, expected: credentialExpected },
    transport: {
      policy: input.transportPolicy,
      policyInput: transportPolicyInput,
      plan: transportPlan,
      expectedTransportPlanId: input.transportPlanId,
    },
    rate: { decision: rateDecision, evaluation: rateEvaluation },
    cost: { decision: costDecision, evaluation: costEvaluation },
  };
  return {
    authority,
    observabilityInput,
    observabilityBundle,
    expectedObservability,
    healthDerivation,
    requestPlanConstruction,
  };
}
