import { readFile, rm } from "node:fs/promises";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type {
  DurableContextDeliveryLedger,
  ProviderObservabilityRetentionEvidence,
  ProductionProviderReadinessDecision,
} from "@founderos/knowledge-schema";

import {
  createProductionProviderReadinessEvaluator,
  ProductionProviderReadinessError,
  type EvaluateProductionProviderReadinessInput,
  type ProductionProviderReadinessEvaluation,
  type ProductionProviderReadinessEvaluator,
} from "../src/application/evaluate-production-provider-readiness.js";
import {
  createStaticProductionProviderTransportPolicyAuthority,
  resolveExpectedProductionProviderTransportPolicy,
} from "../src/application/production-provider-transport-policy-authority.js";
import {
  createProviderRequestPlan,
  mapProviderResponseFixture,
  redactProviderObservabilityValue,
  verifyProviderObservabilityBundle,
  verifyProviderRequestPlan,
  verifyProviderResponseFixtureMapping,
} from "../src/domain/provider-mapping-observability.js";
import {
  createAuthorizationDecisionEvidence,
  createCredentialReference,
  createPricingReference,
  createProductionProviderAdapterDescriptor,
  createSecureTransportPolicy,
  enforceAuthorizationDecision,
  fingerprintProviderReadinessArtifact,
  transitionCircuitState,
  verifyAuthorizationDecisionEvidence,
  verifyCircuitState,
  verifyCostAndBudgetDecision,
  verifyCredentialReference,
  verifyObservabilityReadinessEvidence,
  verifyPricingReference,
  verifyProductionProviderAdapterDescriptor,
  verifyProviderHealthEvidence,
  verifyProviderRateAndCapacityDecision,
  verifyProviderReadinessArtifactFingerprint,
  verifyProviderTransportPlan,
  verifySecureTransportPolicy,
  type AuthorizationAuthority,
} from "../src/domain/provider-readiness.js";
import {
  verifyReasoningCostEvidence,
  verifyReasoningExecutionAttempt,
  verifyReasoningExecutionReceipt,
  verifyReasoningFailureEvidence,
  verifyReasoningProviderOutcome,
  verifyReasoningProviderCompatibilityResult,
  verifyReasoningResultEnvelope,
  verifyReasoningResultEnvelopeArtifact,
  verifyReasoningTimeoutEvidence,
  verifyReasoningUsageEvidence,
} from "../src/domain/reasoning.js";
import {
  EXECUTABLE_PROVIDER_READINESS_EVALUATIONS,
  PROVIDER_READINESS_EVALUATED_AT,
  PROVIDER_READINESS_EVALUATION_CATEGORIES,
  cloneReadinessInput,
  createCanonicalProviderReadinessEvaluationRuntime,
  reconstructDisabledHarnessVerifierAuthorities,
  reconstructProviderReadinessVerifierAuthorities,
  type ProviderReadinessEvaluationDescriptor,
  type ProviderReadinessEvaluationExpected,
  type ProviderReadinessEvidenceKey,
} from "./fixtures/provider-readiness-evaluations.js";

type MutableReadinessInput = {
  -readonly [
    Key in keyof EvaluateProductionProviderReadinessInput
  ]: EvaluateProductionProviderReadinessInput[Key];
};

const roots: string[] = [];
let canonical: Awaited<ReturnType<typeof createCanonicalProviderReadinessEvaluationRuntime>>;

function evaluateProductionProviderReadiness(input: EvaluateProductionProviderReadinessInput) {
  return canonical.evaluator.evaluate(input);
}

function verifyProductionProviderReadinessDecision(input: {
  readonly decision: unknown;
  readonly authoritativeInput: EvaluateProductionProviderReadinessInput;
  readonly observabilityRetentionEvidence: ProviderObservabilityRetentionEvidence | null;
}) {
  return canonical.evaluator.verifyDecision(input);
}

function runDisabledProductionProviderAdapterHarness(
  input: Parameters<(typeof canonical.harness)["run"]>[0],
) {
  return canonical.harness.run(input);
}

beforeAll(async () => {
  canonical = await createCanonicalProviderReadinessEvaluationRuntime(roots);
});

afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

describe("Milestone 14 executable production-provider readiness catalog", () => {
  it("contains exactly 97 unique executable Section 21 scenarios across every category", () => {
    expect(EXECUTABLE_PROVIDER_READINESS_EVALUATIONS).toHaveLength(97);
    expect(
      new Set(EXECUTABLE_PROVIDER_READINESS_EVALUATIONS.map(({ scenarioId }) => scenarioId)).size,
    ).toBe(97);
    const semanticKeys = EXECUTABLE_PROVIDER_READINESS_EVALUATIONS.map(({ setup, mutation }) =>
      JSON.stringify({ setup, mutation }),
    );
    const duplicateSemanticKeys = semanticKeys.filter(
      (key, index) => semanticKeys.indexOf(key) !== index,
    );
    expect(duplicateSemanticKeys).toEqual([]);
    expect(
      [
        ...new Set(EXECUTABLE_PROVIDER_READINESS_EVALUATIONS.map(({ category }) => category)),
      ].sort(),
    ).toEqual([...PROVIDER_READINESS_EVALUATION_CATEGORIES].sort());
    expect(
      Object.fromEntries(
        PROVIDER_READINESS_EVALUATION_CATEGORIES.map((category) => [
          category,
          EXECUTABLE_PROVIDER_READINESS_EVALUATIONS.filter(
            (fixture) => fixture.category === category,
          ).length,
        ]),
      ),
    ).toEqual({
      "valid-readiness": 4,
      authorization: 9,
      credentials: 9,
      transport: 16,
      mapping: 8,
      "rate-capacity": 8,
      "cost-budget": 8,
      "circuit-health": 12,
      observability: 11,
      "harness-bypass": 12,
    });
    for (const fixture of EXECUTABLE_PROVIDER_READINESS_EVALUATIONS) {
      expect(fixture.mutation.operation.length).toBeGreaterThan(0);
      expect(fixture.expected.networkActionCount).toBe(0);
      expect(fixture.setup).toEqual({
        source: "canonical-governed-m13-delivery-invocation",
        evaluationTime: "explicit",
        adapterMode: "disabled-harness-dry-run",
      });
    }
  });

  it.each(EXECUTABLE_PROVIDER_READINESS_EVALUATIONS)("$category / $scenarioId", async (fixture) => {
    await runScenario(fixture);
  });

  it("retains a syntax-complete no-network import-closure proof for both public boundaries", async () => {
    const closure = await readTypeScriptImportClosure([
      new URL("../src/application/evaluate-production-provider-readiness.ts", import.meta.url),
      new URL(
        "../src/application/disabled-production-provider-adapter-harness.ts",
        import.meta.url,
      ),
    ]);
    expect(closure.size).toBeGreaterThan(8);
    const source = [...closure.values()].join("\n");
    expect(source).not.toMatch(
      /\bfetch\s*\(|process\.env|openSocket|networkClient|resolveCredential/u,
    );
    const specifiers = [...closure.values()].flatMap(extractTypeScriptModuleSpecifiers);
    expect(specifiers).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(
          /^(?:(?:node:)?(?:dgram|dns|http2?|https|net|tls|undici)(?:\/|$)|.*(?:openai|anthropic|provider-sdk|network-sdk))/iu,
        ),
      ]),
    );
  });

  it("rejects coherent re-signed substitutions with every authority-bearing semantic verifier", async () => {
    const input = cloneReadinessInput(canonical.input);
    const ready = await evaluateProductionProviderReadiness(input);
    const authorities = await reconstructProviderReadinessVerifierAuthorities(
      input,
      ready,
      canonical.transportPolicyAuthority,
    );

    const authorization = resign(
      { ...ready.evidence.authorization!, subjectReference: "subject/coherent-substitution" },
      "decisionFingerprint",
    );
    expect(
      verifyAuthorizationDecisionEvidence({
        evidence: authorization,
        authority: authorities.authorization.authority,
        expectedDecision: authorities.authorization.expectedDecision,
      }).status,
    ).toBe("invalid");

    const credential = resign(
      { ...input.credentialReference, scopeReference: "scope/coherent-substitution" },
      "referenceFingerprint",
    );
    expect(
      verifyCredentialReference({
        reference: credential,
        adapter: input.adapterDescriptor,
        expected: authorities.credentialExpected,
      }).status,
    ).toBe("invalid");

    const compatibility = resign(
      {
        ...ready.evidence.compatibility!,
        providerCapabilityFingerprint: "2".repeat(64),
      },
      "compatibilityFingerprint",
    );
    expect(
      verifyReasoningProviderCompatibilityResult({
        compatibility,
        invocationRequest: input.invocationRequest,
        providerCapability: input.providerCapability,
      }).status,
    ).toBe("invalid");

    const policy = resign(
      { ...input.transportPolicy, allowedHostnames: ["api.substituted.dev"] },
      "policyFingerprint",
    );
    expect(
      verifySecureTransportPolicy({
        policy,
        adapter: input.adapterDescriptor,
        expectedPolicy: authorities.transportPolicyInput,
      }).status,
    ).toBe("invalid");

    const transportPlan = resign(
      { ...ready.evidence.transportPlan!, transportPlanId: "transport-plan-substituted" },
      "planFingerprint",
    );
    expect(
      verifyProviderTransportPlan({
        plan: transportPlan,
        adapter: input.adapterDescriptor,
        policy: input.transportPolicy,
        expectedTransportPlanId: input.transportPlanId,
      }).status,
    ).toBe("invalid");

    const rate = resign(
      { ...ready.evidence.rateAndCapacity!, decisionId: "rate-substituted" },
      "decisionFingerprint",
    );
    expect(
      verifyProviderRateAndCapacityDecision({
        decision: rate,
        evaluation: authorities.rateEvaluation,
      }).status,
    ).toBe("invalid");

    const cost = resign(
      { ...ready.evidence.costAndBudget!, decisionId: "cost-substituted" },
      "decisionFingerprint",
    );
    expect(
      verifyCostAndBudgetDecision({
        decision: cost,
        evaluation: authorities.costEvaluation,
      }).status,
    ).toBe("invalid");

    const circuit = resign(
      { ...ready.evidence.circuit!, circuitStateId: "circuit-substituted" },
      "stateFingerprint",
    );
    expect(
      verifyCircuitState({ state: circuit, transition: authorities.circuitTransition }).status,
    ).toBe("invalid");

    const observabilityReadiness = resign(
      {
        ...ready.evidence.observability!.readiness,
        readinessEvidenceId: "observability-substituted",
      },
      "readinessFingerprint",
    );
    expect(
      verifyObservabilityReadinessEvidence({
        evidence: observabilityReadiness,
        expected: authorities.expectedObservability,
      }).status,
    ).toBe("invalid");
    expect(
      verifyProviderObservabilityBundle({
        bundle: { ...ready.evidence.observability!, readiness: observabilityReadiness },
        input: authorities.observabilityInput,
      }).status,
    ).toBe("invalid");

    const health = resign(
      { ...ready.evidence.health!, healthEvidenceId: "health-substituted" },
      "healthFingerprint",
    );
    expect(
      verifyProviderHealthEvidence({
        evidence: health,
        derivation: authorities.healthDerivation,
      }).status,
    ).toBe("invalid");

    const requestPlan = resign(
      { ...ready.evidence.requestPlan!, requestPlanId: "request-plan-substituted" },
      "requestPlanFingerprint",
    );
    expect(
      verifyProviderRequestPlan({
        plan: requestPlan,
        construction: authorities.requestPlanConstruction,
      }).status,
    ).toBe("invalid");
  });
});

async function runScenario(fixture: ProviderReadinessEvaluationDescriptor): Promise<void> {
  const input = cloneReadinessInput(canonical.input) as MutableReadinessInput;
  const mutation = fixture.mutation;
  switch (mutation.operation) {
    case "evaluate":
      return assertFacadeEvaluation(
        await evaluateProductionProviderReadiness(input),
        fixture.expected,
        input,
      );
    case "validate-distinct-credential-reference": {
      const { referenceFingerprint: _fingerprint, ...credential } = input.credentialReference;
      void _fingerprint;
      input.credentialReference = createCredentialReference({
        ...credential,
        credentialReferenceId: "credential-catalog-distinct-valid",
        scopeReference: "scope/reasoning-catalog-distinct",
        rotationVersion: "rotation-catalog-v2",
      });
      const result = await evaluateProductionProviderReadiness(input);
      await assertFacadeEvaluation(result, fixture.expected, input);
      expect(
        verifyProviderReadinessArtifactFingerprint(
          "credential-reference",
          input.credentialReference,
        ).status,
      ).toBe("valid");
      expect(
        verifyCredentialReference({
          reference: input.credentialReference,
          adapter: input.adapterDescriptor,
          expected: {
            ...credential,
            credentialReferenceId: "credential-catalog-distinct-valid",
            scopeReference: "scope/reasoning-catalog-distinct",
            rotationVersion: "rotation-catalog-v2",
            adapterCredentialReferenceClass: input.adapterDescriptor.credentialReferenceClass,
            expectedAdapterFingerprint: input.adapterDescriptor.adapterFingerprint,
          },
        }).status,
      ).toBe("valid");
      expect(result.evidence.requestPlan?.credentialReferenceId).toBe(
        input.credentialReference.credentialReferenceId,
      );
      return;
    }
    case "validate-distinct-transport-policy": {
      const { policyFingerprint: _fingerprint, ...policy } = input.transportPolicy;
      void _fingerprint;
      input.transportPolicy = createSecureTransportPolicy({
        ...policy,
        transportPolicyId: "transport-policy-catalog-distinct",
        allowedHostnames: ["api.distinct-provider.dev"],
        allowedPorts: [443],
        connectionTimeoutMilliseconds: 1_200,
        requestTimeoutMilliseconds: 6_000,
        maximumRequestBytes: 18_000,
        maximumResponseBytes: 38_000,
        retryTransportPolicy: "governed-idempotent-retry",
      });
      const transportPolicyAuthority = createStaticProductionProviderTransportPolicyAuthority({
        adapter: input.adapterDescriptor,
        expectedPolicy: input.transportPolicy,
      });
      const evaluator = createProductionProviderReadinessEvaluator({ transportPolicyAuthority });
      const result = await evaluator.evaluate(input);
      await assertFacadeEvaluation(
        result,
        fixture.expected,
        input,
        {},
        evaluator,
        transportPolicyAuthority,
      );
      expect(
        resolveExpectedProductionProviderTransportPolicy({
          authority: transportPolicyAuthority,
          adapter: input.adapterDescriptor,
        }),
      ).toEqual(input.transportPolicy);
      expect(input.transportPolicy).toMatchObject({
        allowedScheme: "https",
        allowedHostnames: ["api.distinct-provider.dev"],
        allowedPorts: [443],
        retryTransportPolicy: "governed-idempotent-retry",
      });
      expect(result.evidence.transportPlan).toMatchObject({
        scheme: "https",
        hostname: "api.distinct-provider.dev",
        port: 443,
        connectionTimeoutMilliseconds: 1_200,
        requestTimeoutMilliseconds: 6_000,
        maximumRequestBytes: 18_000,
        maximumResponseBytes: 38_000,
      });
      expect(
        verifyProviderTransportPlan({
          plan: result.evidence.transportPlan,
          adapter: input.adapterDescriptor,
          policy: input.transportPolicy,
          expectedTransportPlanId: input.transportPlanId,
        }).status,
      ).toBe("valid");
      const authorities = await reconstructProviderReadinessVerifierAuthorities(
        input,
        result,
        transportPolicyAuthority,
      );
      expect(
        verifyProviderRequestPlan({
          plan: result.evidence.requestPlan,
          construction: authorities.requestPlanConstruction,
        }),
      ).toEqual({ status: "valid", reason: null });
      return;
    }
    case "repeat-evaluation": {
      const first = await evaluateProductionProviderReadiness(input);
      const second = await evaluateProductionProviderReadiness(input);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
      return assertFacadeEvaluation(first, fixture.expected, input, { deterministicBytes: true });
    }
    case "verify-request-plan": {
      const result = await evaluateProductionProviderReadiness(input);
      await assertFacadeEvaluation(result, fixture.expected, input);
      expect(result.evidence.requestPlan).not.toBeNull();
      expect(
        verifyProviderReadinessArtifactFingerprint(
          "provider-request-plan",
          result.evidence.requestPlan,
        ).status,
      ).toBe("valid");
      if (mutation.focus === "mapping-contract") {
        expect(result.evidence.requestPlan).toMatchObject({
          methodClassification: "provider-request-post",
          logicalEndpointClassification: "reasoning-generation",
        });
        expect(
          result.evidence.requestPlan!.redactedHeaderPlan.map(
            ({ headerClassification }) => headerClassification,
          ),
        ).toEqual(["content-type", "idempotency-reference", "request-correlation"]);
      } else {
        const authorities = await reconstructProviderReadinessVerifierAuthorities(
          input,
          result,
          canonical.transportPolicyAuthority,
        );
        expect(
          verifyProviderRequestPlan({
            plan: result.evidence.requestPlan,
            construction: authorities.requestPlanConstruction,
          }),
        ).toEqual({ status: "valid", reason: null });
      }
      return;
    }
    case "response-fixture":
      return runResponseFixture(fixture, input);
    case "authorization-missing":
      input.authorizationEvidence = null;
      expect(
        enforceAuthorizationDecision({
          evidence: input.authorizationEvidence,
          authority: authorizationAuthority(input),
          expectedDecision: input.expectedAuthorizationDecision,
          evaluatedAt: input.evaluatedAt,
        }),
      ).toMatchObject({
        status: "rejected",
        outcome: "invalid-evidence",
        reasonCodes: ["authorization_invalid_evidence"],
      });
      poisonLaterGates(input);
      return assertFacadeEvaluation(
        await evaluateProductionProviderReadiness(input),
        fixture.expected,
        input,
      );
    case "authorization-outcome": {
      input.expectedAuthorizationDecision = {
        ...input.expectedAuthorizationDecision,
        outcome: mutation.outcome,
      };
      input.authorizationEvidence = createAuthorizationDecisionEvidence(
        input.expectedAuthorizationDecision,
        authorizationAuthority(input),
      );
      expect(
        enforceAuthorizationDecision({
          evidence: input.authorizationEvidence,
          authority: authorizationAuthority(input),
          expectedDecision: input.expectedAuthorizationDecision,
          evaluatedAt: input.evaluatedAt,
        }),
      ).toMatchObject({
        status: "rejected",
        outcome: mutation.outcome,
        reasonCodes: [
          mutation.outcome === "denied"
            ? "authorization_denied"
            : mutation.outcome === "review-required"
              ? "authorization_review_required"
              : "authorization_not_evaluated",
        ],
      });
      poisonLaterGates(input);
      return assertFacadeEvaluation(
        await evaluateProductionProviderReadiness(input),
        fixture.expected,
        input,
      );
    }
    case "authorization-expired": {
      input.expectedAuthorizationDecision = {
        ...input.expectedAuthorizationDecision,
        decidedAt: "2026-07-30T00:00:00.000Z",
        expiresAt: "2026-07-30T00:30:00.000Z",
        outcome: "allowed",
      };
      input.authorizationEvidence = createAuthorizationDecisionEvidence(
        input.expectedAuthorizationDecision,
        authorizationAuthority(input),
      );
      expect(input.authorizationEvidence.outcome).toBe("allowed");
      poisonLaterGates(input);
      const result = await evaluateProductionProviderReadiness(input);
      expect(
        verifyAuthorizationDecisionEvidence({
          evidence: input.authorizationEvidence,
          authority: authorizationAuthority(input),
          expectedDecision: input.expectedAuthorizationDecision,
        }).status,
      ).toBe("valid");
      expect(
        enforceAuthorizationDecision({
          evidence: input.authorizationEvidence,
          authority: authorizationAuthority(input),
          expectedDecision: input.expectedAuthorizationDecision,
          evaluatedAt: input.evaluatedAt,
        }),
      ).toMatchObject({
        status: "rejected",
        outcome: "expired",
        reasonCodes: ["authorization_expired"],
      });
      return assertFacadeEvaluation(result, fixture.expected, input);
    }
    case "authorization-substitution": {
      const evidence = structuredClone(input.authorizationEvidence!);
      if (mutation.field === "invocation") {
        evidence.invocationRequestId = "invocation-substituted";
        evidence.invocationRequestFingerprint = "1".repeat(64);
      } else if (mutation.field === "consumer") {
        evidence.consumerId = "consumer-substituted";
        evidence.consumerDescriptorFingerprint = "2".repeat(64);
      } else if (mutation.field === "adapter") {
        evidence.adapterId = "adapter-substituted";
        evidence.adapterFingerprint = "3".repeat(64);
      } else {
        evidence.requestedOperation = "validate-provider-adapter";
      }
      input.authorizationEvidence = resign(evidence, "decisionFingerprint");
      expect(
        enforceAuthorizationDecision({
          evidence: input.authorizationEvidence,
          authority: authorizationAuthority(input),
          expectedDecision: input.expectedAuthorizationDecision,
          evaluatedAt: input.evaluatedAt,
        }),
      ).toMatchObject({
        status: "rejected",
        outcome: "invalid-evidence",
        reasonCodes: ["authorization_invalid_evidence"],
      });
      poisonLaterGates(input);
      return assertFacadeEvaluation(
        await evaluateProductionProviderReadiness(input),
        fixture.expected,
        input,
      );
    }
    case "credential-availability": {
      const { referenceFingerprint: _fingerprint, ...credential } = input.credentialReference;
      void _fingerprint;
      input.credentialReference = createCredentialReference({
        ...credential,
        availability: mutation.availability,
      });
      return assertFacadeEvaluation(
        await evaluateProductionProviderReadiness(input),
        fixture.expected,
        input,
      );
    }
    case "inject-prohibited":
      return runProhibitedInjection(fixture, input);
    case "transport-field":
      input.transportPolicy = resign(
        {
          ...input.transportPolicy,
          [mutation.field]: mutation.value,
        },
        "policyFingerprint",
      ) as never;
      expect(
        verifySecureTransportPolicy({
          policy: input.transportPolicy,
          adapter: input.adapterDescriptor,
          expectedPolicy: withoutPolicyFingerprint(canonical.input.transportPolicy),
        }),
      ).toMatchObject({
        status: "invalid",
        issues: [{ code: "transport_policy_invalid" }],
      });
      return assertFacadeEvaluation(
        await evaluateProductionProviderReadiness(input),
        fixture.expected,
        input,
      );
    case "authoritative-alternate-host": {
      const candidate = resign(
        {
          ...input.transportPolicy,
          allowedHostnames: ["alternate.provider.dev"],
        },
        "policyFingerprint",
      );
      expect(
        verifyProviderReadinessArtifactFingerprint("secure-transport-policy", candidate).status,
      ).toBe("valid");
      expect(
        verifySecureTransportPolicy({
          policy: candidate,
          adapter: input.adapterDescriptor,
          expectedPolicy: withoutPolicyFingerprint(canonical.input.transportPolicy),
        }),
      ).toMatchObject({
        status: "invalid",
        issues: [{ code: "transport_policy_invalid" }],
      });
      input.transportPolicy = candidate;
      return assertFacadeEvaluation(
        await evaluateProductionProviderReadiness(input),
        fixture.expected,
        input,
      );
    }
    case "request-size-exceeded": {
      const { policyFingerprint: _fingerprint, ...policy } = input.transportPolicy;
      void _fingerprint;
      input.transportPolicy = createSecureTransportPolicy({ ...policy, maximumRequestBytes: 1 });
      const transportPolicyAuthority = createStaticProductionProviderTransportPolicyAuthority({
        adapter: input.adapterDescriptor,
        expectedPolicy: input.transportPolicy,
      });
      const evaluator = createProductionProviderReadinessEvaluator({
        transportPolicyAuthority,
      });
      return assertFacadeEvaluation(
        await evaluator.evaluate(input),
        fixture.expected,
        input,
        {},
        evaluator,
      );
    }
    case "request-plan-tamper": {
      const result = await evaluateProductionProviderReadiness(input);
      const tampered = { ...result.evidence.requestPlan!, requestPlanFingerprint: "0".repeat(64) };
      expect(
        verifyProviderReadinessArtifactFingerprint("provider-request-plan", tampered).status,
      ).toBe("invalid");
      return assertFacadeEvaluation(result, fixture.expected, input, {
        disposition: "tamper-rejected",
        verificationStatus: "invalid",
      });
    }
    case "mapping-header-secret":
      return runMappingHeaderSecret(fixture, input);
    case "rate":
      return runRateScenario(fixture, input);
    case "cost":
      return runCostScenario(fixture, input);
    case "circuit":
      return runCircuitScenario(fixture, input);
    case "adapter-disabled":
      return runDisabledAdapterScenario(fixture, input);
    case "adapter-enabled-harness": {
      input.adapterDescriptor = { ...input.adapterDescriptor, state: "enabled" } as never;
      let ledgerCalls = 0;
      input.deliveryLedger = countingDeliveryLedger(input.deliveryLedger, () => {
        ledgerCalls += 1;
      });
      const error = thrownOf(() =>
        runDisabledProductionProviderAdapterHarness({
          mode: "full-readiness-evaluation",
          readinessInput: input,
        }),
      );
      expect(error).toBeInstanceOf(TypeError);
      expect(ledgerCalls).toBe(0);
      expect(serialized(error)).not.toMatch(/provider client|network|credential material/iu);
      return assertRejectedObservation(fixture.expected, 0);
    }
    case "assert-no-live-state": {
      const result = await evaluateProductionProviderReadiness(input);
      await assertFacadeEvaluation(result, fixture.expected, input);
      expect(["not-assessed", "not-ready", "ready-for-dry-run", "disabled-by-policy"]).toContain(
        result.decision.status,
      );
      expect(result.decision.status).not.toMatch(/live|enabled|traffic/u);
      return;
    }
    case "observability-harness":
      return runObservabilityHarness(fixture, input);
    case "unsafe-source-redaction":
      return runUnsafeSourceRedaction(fixture, input);
    case "observability-bound":
      input.observabilityPolicy = {
        ...input.observabilityPolicy,
        [mutation.field]: mutation.value,
      };
      return assertFacadeEvaluation(
        await evaluateProductionProviderReadiness(input),
        fixture.expected,
        input,
      );
    case "static-import-closure": {
      const closure = await readTypeScriptImportClosure([
        new URL("../src/application/evaluate-production-provider-readiness.ts", import.meta.url),
        new URL(
          "../src/application/disabled-production-provider-adapter-harness.ts",
          import.meta.url,
        ),
      ]);
      const source = [...closure.values()].join("\n");
      const specifiers = [...closure.values()].flatMap(extractTypeScriptModuleSpecifiers);
      if (mutation.concern === "socket") {
        expect(specifiers).not.toEqual(
          expect.arrayContaining([expect.stringMatching(/^(?:node:)?(?:dgram|net|tls)(?:\/|$)/u)]),
        );
        expect(source).not.toMatch(/\b(?:createConnection|connect|openSocket)\s*\(/u);
      } else {
        expect(specifiers).not.toEqual(
          expect.arrayContaining([expect.stringMatching(/^(?:node:)?dns(?:\/|$)/u)]),
        );
        expect(source).not.toMatch(/\b(?:lookup|resolve4|resolve6|resolveAny)\s*\(/u);
      }
      return assertHarnessObservation(fixture.expected, {
        verificationStatus: "valid",
        deterministicBytes: false,
      });
    }
    case "unverified-delivery":
      input.deliveryIdentity = {
        ...input.deliveryIdentity,
        transactionId: "missing-catalog-transaction",
      };
      return assertAuthorityRejection(input, fixture.expected);
    case "unverified-invocation":
      input.invocationRequest = { ...input.invocationRequest, requestFingerprint: "0".repeat(64) };
      return assertAuthorityRejection(input, fixture.expected);
    case "decision-tamper":
    case "resigned-decision-substitution":
      return runDecisionTamper(fixture, input);
  }
}

async function assertFacadeEvaluation(
  result: ProductionProviderReadinessEvaluation,
  expected: ProviderReadinessEvaluationExpected,
  authoritativeInput: EvaluateProductionProviderReadinessInput,
  overrides: Partial<
    Pick<
      ProviderReadinessEvaluationExpected,
      "deterministicBytes" | "disposition" | "networkActionCount" | "verificationStatus"
    >
  > = {},
  evaluator: ProductionProviderReadinessEvaluator = canonical.evaluator,
  transportPolicyAuthority = canonical.transportPolicyAuthority,
): Promise<void> {
  const completed = result.gateTrace
    .filter(({ status }) => status === "completed")
    .map(({ gate }) => gate);
  const stoppedGate = result.gateTrace.find(({ status }) => status === "stopped")?.gate ?? null;
  const decisionVerification = await evaluator.verifyDecision({
    decision: result.decision,
    authoritativeInput,
    observabilityRetentionEvidence: result.evidence.observabilityRetention,
  });
  expect(decisionVerification).toEqual({ status: "valid", reason: null });
  const evidenceKeys = [
    "authorization",
    "compatibility",
    "transportPlan",
    "rateAndCapacity",
    "costAndBudget",
    "circuit",
    "observability",
    "health",
    "requestPlan",
  ] as const satisfies readonly ProviderReadinessEvidenceKey[];
  const evidencePresent = evidenceKeys.filter((key) => result.evidence[key] !== null);
  const observation: ProviderReadinessEvaluationExpected = {
    disposition: overrides.disposition ?? (stoppedGate === null ? "completed" : "stopped"),
    readinessStatus: result.decision.status,
    completedGatePrefix: completed,
    stoppedGate,
    blockerCodes: result.decision.blockingReasonCodes,
    warningCodes: result.decision.warningReasonCodes,
    evidencePresent,
    evidenceAbsent: evidenceKeys.filter((key) => !evidencePresent.includes(key)),
    responseClassification: null,
    responseOutcome: null,
    verificationStatus: overrides.verificationStatus ?? decisionVerification.status,
    deterministicBytes: overrides.deterministicBytes ?? false,
    networkActionCount: overrides.networkActionCount ?? 0,
  };
  assertScenarioObservation(observation, expected);
  assertSerializedPrivacy(result, []);
  expect(Object.isFrozen(result)).toBe(true);
  if (result.decision.status === "ready-for-dry-run") {
    await assertEveryExactSemanticVerifier(result, authoritativeInput, transportPolicyAuthority);
  }
}

function assertScenarioObservation(
  actual: ProviderReadinessEvaluationExpected,
  expected: ProviderReadinessEvaluationExpected,
): void {
  expect(actual).toEqual(expected);
}

function rejectedObservation(networkActionCount: 0): ProviderReadinessEvaluationExpected {
  return {
    disposition: "rejected",
    readinessStatus: null,
    completedGatePrefix: [],
    stoppedGate: null,
    blockerCodes: [],
    warningCodes: [],
    evidencePresent: [],
    evidenceAbsent: [
      "authorization",
      "compatibility",
      "transportPlan",
      "rateAndCapacity",
      "costAndBudget",
      "circuit",
      "observability",
      "health",
      "requestPlan",
    ],
    responseClassification: null,
    responseOutcome: null,
    verificationStatus: "not-applicable",
    deterministicBytes: false,
    networkActionCount,
  };
}

function assertRejectedObservation(
  expected: ProviderReadinessEvaluationExpected,
  networkActionCount: 0,
): void {
  assertScenarioObservation(rejectedObservation(networkActionCount), expected);
}

function assertHarnessObservation(
  expected: ProviderReadinessEvaluationExpected,
  actual: Partial<ProviderReadinessEvaluationExpected>,
): void {
  assertScenarioObservation(
    {
      ...rejectedObservation(0),
      disposition: "completed",
      verificationStatus: "valid",
      ...actual,
    },
    expected,
  );
}

async function assertEveryExactSemanticVerifier(
  evaluation: ProductionProviderReadinessEvaluation,
  input: EvaluateProductionProviderReadinessInput,
  transportPolicyAuthority = canonical.transportPolicyAuthority,
): Promise<void> {
  const authorities = await reconstructProviderReadinessVerifierAuthorities(
    input,
    evaluation,
    transportPolicyAuthority,
  );
  expect(
    verifyAuthorizationDecisionEvidence({
      evidence: evaluation.evidence.authorization,
      authority: authorities.authorization.authority,
      expectedDecision: authorities.authorization.expectedDecision,
    }).status,
  ).toBe("valid");
  expect(
    verifyProductionProviderAdapterDescriptor({
      descriptor: input.adapterDescriptor,
      providerCapability: input.providerCapability,
    }).status,
  ).toBe("valid");
  expect(
    verifyCredentialReference({
      reference: input.credentialReference,
      adapter: input.adapterDescriptor,
      expected: authorities.credentialExpected,
    }).status,
  ).toBe("valid");
  expect(
    verifyReasoningProviderCompatibilityResult({
      compatibility: evaluation.evidence.compatibility!,
      invocationRequest: input.invocationRequest,
      providerCapability: input.providerCapability,
    }).status,
  ).toBe("valid");
  expect(
    verifySecureTransportPolicy({
      policy: input.transportPolicy,
      adapter: input.adapterDescriptor,
      expectedPolicy: authorities.transportPolicyInput,
    }).status,
  ).toBe("valid");
  expect(
    verifyProviderTransportPlan({
      plan: evaluation.evidence.transportPlan,
      adapter: input.adapterDescriptor,
      policy: input.transportPolicy,
      expectedTransportPlanId: input.transportPlanId,
    }).status,
  ).toBe("valid");
  expect(
    verifyProviderRateAndCapacityDecision({
      decision: evaluation.evidence.rateAndCapacity,
      evaluation: authorities.rateEvaluation,
    }).status,
  ).toBe("valid");
  expect(
    verifyPricingReference({
      pricingReference: input.pricingReference,
      expected: withoutPricingFingerprint(input.pricingReference),
    }).status,
  ).toBe("valid");
  expect(
    verifyCostAndBudgetDecision({
      decision: evaluation.evidence.costAndBudget,
      evaluation: authorities.costEvaluation,
    }).status,
  ).toBe("valid");
  expect(
    verifyCircuitState({
      state: evaluation.evidence.circuit,
      transition: authorities.circuitTransition,
    }).status,
  ).toBe("valid");
  expect(
    verifyProviderObservabilityBundle({
      bundle: evaluation.evidence.observability,
      input: authorities.observabilityInput,
    }).status,
  ).toBe("valid");
  expect(
    verifyObservabilityReadinessEvidence({
      evidence: evaluation.evidence.observability!.readiness,
      expected: authorities.expectedObservability,
    }).status,
  ).toBe("valid");
  expect(
    verifyProviderHealthEvidence({
      evidence: evaluation.evidence.health,
      derivation: authorities.healthDerivation,
    }).status,
  ).toBe("valid");
  expect(
    verifyProviderRequestPlan({
      plan: evaluation.evidence.requestPlan,
      construction: authorities.requestPlanConstruction,
    }).status,
  ).toBe("valid");
}

async function runResponseFixture(
  fixture: ProviderReadinessEvaluationDescriptor,
  input: MutableReadinessInput,
): Promise<void> {
  if (fixture.mutation.operation !== "response-fixture") throw new Error("Unexpected mutation");
  const harnessInput = {
    mode: "response-mapping-fixture" as const,
    readinessInput: input,
    fixtureClassification: fixture.mutation.classification,
    mappingEvidenceId: `mapping-${fixture.scenarioId}`,
    resultEnvelopeId: `result-${fixture.scenarioId}`,
    executionAttemptId: `attempt-${fixture.scenarioId}`,
    startedAt: PROVIDER_READINESS_EVALUATED_AT,
  };
  const first = await runDisabledProductionProviderAdapterHarness(harnessInput);
  let deterministicBytes = false;
  if (fixture.expected.deterministicBytes) {
    const second = await runDisabledProductionProviderAdapterHarness(harnessInput);
    deterministicBytes = JSON.stringify(first) === JSON.stringify(second);
    expect(deterministicBytes).toBe(true);
  }
  if (first.mode !== "response-mapping-fixture") throw new Error("Unexpected harness result");
  const response = first.responseMappingFixture;
  const authorities = await reconstructDisabledHarnessVerifierAuthorities(
    input,
    canonical.transportPolicyAuthority,
  );
  const mappingInput = {
    schemaVersion: "1.0" as const,
    mappingEvidenceId: harnessInput.mappingEvidenceId,
    resultEnvelopeId: harnessInput.resultEnvelopeId,
    executionAttemptId: harnessInput.executionAttemptId,
    fixtureClassification: fixture.mutation.classification,
    startedAt: harnessInput.startedAt,
    requestPlan: createProviderRequestPlan(authorities.requestPlanConstruction),
    requestPlanConstruction: authorities.requestPlanConstruction,
    contextPackageObjectCount: authorities.authority.envelope.contextPackage.included.length,
  };
  expect(response.mapping.outcome.status).toBe(fixture.expected.responseOutcome);
  expect(response.mappingEvidence.fixtureClassification).toBe(
    fixture.mutation.classification === "usage-metadata" ||
      fixture.mutation.classification === "cost-metadata"
      ? "successful-response"
      : fixture.expected.responseClassification,
  );
  expect(
    verifyProviderResponseFixtureMapping({
      mapping: response.mapping,
      input: mappingInput,
    }),
  ).toEqual({ status: "valid", reason: null });
  expect(
    verifyProviderReadinessArtifactFingerprint(
      "provider-response-mapping-evidence",
      response.mappingEvidence,
    ).status,
  ).toBe("valid");
  let verificationStatus: ProviderReadinessEvaluationExpected["verificationStatus"] = "valid";
  let disposition: ProviderReadinessEvaluationExpected["disposition"] = "completed";
  if (fixture.mutation.tamperField !== undefined) {
    const tamperedEvidence = {
      ...response.mappingEvidence,
      mappingEvidenceFingerprint: "0".repeat(64),
    };
    expect(
      verifyProviderReadinessArtifactFingerprint(
        "provider-response-mapping-evidence",
        tamperedEvidence,
      ).status,
    ).toBe("invalid");
    expect(
      verifyProviderResponseFixtureMapping({
        mapping: { ...response.mapping, mappingEvidence: tamperedEvidence },
        input: mappingInput,
      }).status,
    ).toBe("invalid");
    verificationStatus = "invalid";
    disposition = "tamper-rejected";
  }
  assertMappedM13Evidence(response.mapping);
  if (fixture.mutation.classification === "redaction-failure") {
    expect(response.mappingEvidence.sanitizedMetadata.errorCategory).toBe("redaction-failure");
    const unsafeMappingInput = {
      ...mappingInput,
      rawErrorBody: "catalog raw error body",
    };
    const error = thrownOf(() => mapProviderResponseFixture(unsafeMappingInput as never));
    expect(error).toBeInstanceOf(Error);
    assertSerializedPrivacy(
      error,
      collectPrivacyMarkers({ rawErrorBody: unsafeMappingInput.rawErrorBody }),
    );
  }
  if (fixture.mutation.classification === "oversized-response") {
    expect(response.mappingEvidence.sanitizedMetadata.errorCategory).toBe("oversized-response");
    expect(input.transportPolicy.maximumResponseBytes).toBe(40_000);
  }
  assertSerializedPrivacy(
    first,
    collectPrivacyMarkers({
      rawErrorBody: "catalog raw error body",
      providerResponseBody: "catalog provider response body",
    }),
  );
  assertHarnessObservation(fixture.expected, {
    disposition,
    responseClassification: response.mappingEvidence.fixtureClassification,
    responseOutcome: response.mapping.outcome.status as "failed" | "succeeded" | "timed-out",
    verificationStatus,
    deterministicBytes,
  });
}

async function runMappingHeaderSecret(
  fixture: ProviderReadinessEvaluationDescriptor,
  input: MutableReadinessInput,
): Promise<void> {
  if (fixture.mutation.operation !== "mapping-header-secret") {
    throw new Error("Unexpected mutation");
  }
  const authorities = await reconstructDisabledHarnessVerifierAuthorities(
    input,
    canonical.transportPolicyAuthority,
  );
  const mappingInput = {
    schemaVersion: "1.0" as const,
    mappingEvidenceId: `mapping-${fixture.scenarioId}`,
    resultEnvelopeId: `result-${fixture.scenarioId}`,
    executionAttemptId: `attempt-${fixture.scenarioId}`,
    fixtureClassification: "successful-response" as const,
    startedAt: PROVIDER_READINESS_EVALUATED_AT,
    requestPlan: createProviderRequestPlan(authorities.requestPlanConstruction),
    requestPlanConstruction: authorities.requestPlanConstruction,
    contextPackageObjectCount: authorities.authority.envelope.contextPackage.included.length,
    headers: { authorization: "Bearer mappingHeaderSecretValue123" },
  };
  const error = thrownOf(() => mapProviderResponseFixture(mappingInput as never));
  expect(error).toBeInstanceOf(Error);
  assertSerializedPrivacy(
    error,
    collectPrivacyMarkers({
      headers: mappingInput.headers,
    }),
  );
  assertHarnessObservation(fixture.expected, {
    disposition: "tamper-rejected",
    verificationStatus: "invalid",
  });
}

function runProhibitedInjection(
  fixture: ProviderReadinessEvaluationDescriptor,
  input: MutableReadinessInput,
): void {
  if (fixture.mutation.operation !== "inject-prohibited") throw new Error("Unexpected mutation");
  let probeInvocations = 0;
  const mutation = fixture.mutation;
  const marker = mutation.value;
  const value =
    marker === "zero-invocation-probe"
      ? () => {
          probeInvocations += 1;
        }
      : fixture.mutation.value;
  const target =
    mutation.target === "root"
      ? input
      : (input[mutation.target] as unknown as Record<string, unknown>);
  const injected = {
    ...target,
    [mutation.field]: value,
  } as EvaluateProductionProviderReadinessInput;
  const candidate =
    mutation.target === "root" ? injected : { ...input, [mutation.target]: injected };
  let ledgerCalls = 0;
  const countedCandidate = {
    ...candidate,
    deliveryLedger: countingDeliveryLedger(candidate.deliveryLedger, () => {
      ledgerCalls += 1;
    }),
  };
  const markers = collectPrivacyMarkers({ [mutation.field]: marker });
  const error = thrownOf(() => evaluateProductionProviderReadiness(countedCandidate as never));
  expect(error).toBeInstanceOf(ProductionProviderReadinessError);
  expect(error).toMatchObject({ code: "invalid_input", gateTrace: [] });
  expect(ledgerCalls).toBe(0);
  expect(probeInvocations).toBe(fixture.expected.networkActionCount);
  assertSerializedPrivacy(error, markers);
  assertRejectedObservation(fixture.expected, 0);
}

async function runRateScenario(
  fixture: ProviderReadinessEvaluationDescriptor,
  input: MutableReadinessInput,
): Promise<void> {
  if (fixture.mutation.operation !== "rate") throw new Error("Unexpected mutation");
  const variant = fixture.mutation.variant;
  if (variant === "rate-limited" || variant === "stable-retry-after") {
    input.rateCounters = { ...input.rateCounters, requestsInWindow: input.ratePolicy.requestLimit };
  } else if (variant === "capacity-exhausted") {
    input.rateCounters = {
      ...input.rateCounters,
      concurrentInFlight: input.ratePolicy.concurrentLimit,
    };
  } else if (variant === "queue-full") {
    input.rateCounters = {
      ...input.rateCounters,
      concurrentInFlight: input.ratePolicy.concurrentLimit,
      queuedRequests: input.ratePolicy.maximumQueuedRequests,
    };
  } else if (variant === "provider-unavailable") {
    input.rateCounters = { ...input.rateCounters, providerCapacityState: "unavailable" };
  } else if (variant === "quota-exceeded") {
    input.rateCounters = {
      ...input.rateCounters,
      consumerQuotaUsed: input.ratePolicy.consumerQuotaLimit,
    };
  } else if (variant === "exact-window-boundary") {
    input.rateCounters = {
      ...input.rateCounters,
      windowStartedAt: "2026-07-30T00:59:00.000Z",
      requestsInWindow: input.ratePolicy.requestLimit,
    };
  }
  const first = await evaluateProductionProviderReadiness(input);
  if (variant === "stable-retry-after") {
    const second = await evaluateProductionProviderReadiness(input);
    expect(first.evidence.rateAndCapacity?.retryAfterMilliseconds).toBe(60_000);
    expect(JSON.stringify(first.evidence.rateAndCapacity)).toBe(
      JSON.stringify(second.evidence.rateAndCapacity),
    );
    return assertFacadeEvaluation(first, fixture.expected, input, { deterministicBytes: true });
  }
  await assertFacadeEvaluation(first, fixture.expected, input);
}

async function runCostScenario(
  fixture: ProviderReadinessEvaluationDescriptor,
  input: MutableReadinessInput,
): Promise<void> {
  if (fixture.mutation.operation !== "cost") throw new Error("Unexpected mutation");
  const variant = fixture.mutation.variant;
  if (variant === "input-budget-exceeded") {
    input.costPolicy = { ...input.costPolicy, maximumInputUnits: 1 };
  } else if (variant === "output-budget-exceeded") {
    input.costPolicy = { ...input.costPolicy, maximumOutputUnits: 1 };
  } else if (variant === "cost-ceiling-exceeded") {
    input.costPolicy = { ...input.costPolicy, costCeilingMinorUnits: 0 };
  } else if (variant === "pricing-unavailable") {
    const { pricingFingerprint: _fingerprint, ...pricing } = input.pricingReference;
    void _fingerprint;
    input.pricingReference = createPricingReference({ ...pricing, availability: "unavailable" });
  } else if (variant === "invalid-pricing-reference") {
    input.pricingReference = { ...input.pricingReference, pricingFingerprint: "0".repeat(64) };
  } else if (variant === "manual-review") {
    input.costPolicy = { ...input.costPolicy, manualReviewRequired: true };
  } else if (variant === "integer-minor-unit-boundary") {
    const baseline = await evaluateProductionProviderReadiness(input);
    input.costPolicy = {
      ...input.costPolicy,
      costCeilingMinorUnits: baseline.evidence.costAndBudget!.estimatedMaximumCostMinorUnits,
    };
  }
  const result = await evaluateProductionProviderReadiness(input);
  await assertFacadeEvaluation(result, fixture.expected, input);
  if (variant === "integer-minor-unit-boundary") {
    expect(result.evidence.costAndBudget?.estimatedMaximumCostMinorUnits).toBe(
      input.costPolicy.costCeilingMinorUnits,
    );
  }
}

async function runCircuitScenario(
  fixture: ProviderReadinessEvaluationDescriptor,
  input: MutableReadinessInput,
): Promise<void> {
  if (fixture.mutation.operation !== "circuit") throw new Error("Unexpected mutation");
  const variant = fixture.mutation.variant;
  if (variant === "open" || variant === "security-quarantine") {
    input.circuitFailureWindow = {
      windowStartedAt: PROVIDER_READINESS_EVALUATED_AT,
      failureCounts: [
        {
          category: variant === "open" ? "transport-failure" : "security-policy-violation",
          count: variant === "open" ? 3 : 1,
        },
      ],
    };
  } else if (variant === "quarantined" || variant === "reset-quarantined") {
    const priorAt = "2026-07-30T00:59:30.000Z";
    input.previousCircuitState = transitionCircuitState({
      circuitStateId: "circuit-catalog-prior-quarantine",
      adapter: input.adapterDescriptor,
      previousState: null,
      thresholdPolicy: input.circuitThresholdPolicy,
      failureWindow: {
        windowStartedAt: priorAt,
        failureCounts: [{ category: "security-policy-violation", count: 1 }],
      },
      evaluatedAt: priorAt,
      command: "evaluate",
      probeOutcome: "none",
      probesAlreadyUsed: 0,
    });
    input.circuitFailureWindow = {
      windowStartedAt: PROVIDER_READINESS_EVALUATED_AT,
      failureCounts: [],
    };
    if (variant === "reset-quarantined") input.circuitCommand = "reset";
  } else if (variant === "reset-disabled") {
    const priorAt = "2026-07-30T00:59:30.000Z";
    input.previousCircuitState = transitionCircuitState({
      circuitStateId: "circuit-catalog-prior-disabled",
      adapter: input.adapterDescriptor,
      previousState: null,
      thresholdPolicy: input.circuitThresholdPolicy,
      failureWindow: { windowStartedAt: priorAt, failureCounts: [] },
      evaluatedAt: priorAt,
      command: "disable",
      probeOutcome: "none",
      probesAlreadyUsed: 0,
    });
    input.circuitCommand = "reset";
  } else if (variant === "disabled") {
    input.circuitCommand = "disable";
  } else if (variant === "half-open" || variant === "degraded-health") {
    const openedAt =
      variant === "degraded-health" ? "2026-07-30T00:59:00.000Z" : "2026-07-30T00:59:30.000Z";
    input.previousCircuitState = transitionCircuitState({
      circuitStateId: "circuit-catalog-open-source",
      adapter: input.adapterDescriptor,
      previousState: null,
      thresholdPolicy: input.circuitThresholdPolicy,
      failureWindow: {
        windowStartedAt: openedAt,
        failureCounts: [{ category: "transport-failure", count: 3 }],
      },
      evaluatedAt: openedAt,
      command: "evaluate",
      probeOutcome: "none",
      probesAlreadyUsed: 0,
    });
    input.circuitFailureWindow = {
      windowStartedAt: PROVIDER_READINESS_EVALUATED_AT,
      failureCounts: [],
    };
    if (variant === "degraded-health") {
      input.previousCircuitState = transitionCircuitState({
        circuitStateId: "circuit-catalog-half-open-source",
        adapter: input.adapterDescriptor,
        previousState: input.previousCircuitState,
        thresholdPolicy: input.circuitThresholdPolicy,
        failureWindow: {
          windowStartedAt: "2026-07-30T00:59:30.000Z",
          failureCounts: [],
        },
        evaluatedAt: "2026-07-30T00:59:30.000Z",
        command: "evaluate",
        probeOutcome: "none",
        probesAlreadyUsed: 0,
      });
      input.circuitProbesAlreadyUsed = 1;
    }
  }
  if (fixture.mutation.harnessHealth) {
    const result = await runDisabledProductionProviderAdapterHarness({
      mode: "health-evaluation",
      readinessInput: input,
    });
    if (result.mode !== "health-evaluation") throw new Error("Unexpected harness result");
    const health = result.healthEvaluation as {
      health: { healthState: string };
    };
    const authorities = await reconstructDisabledHarnessVerifierAuthorities(
      input,
      canonical.transportPolicyAuthority,
    );
    expect(health.health.healthState).toBe("unavailable");
    expect(
      verifyProviderHealthEvidence({
        evidence: health.health,
        derivation: authorities.healthDerivation,
      }).status,
    ).toBe("valid");
    assertSerializedPrivacy(result, []);
    return assertHarnessObservation(fixture.expected, {
      verificationStatus: "valid",
    });
  }
  if (variant === "reset-disabled" || variant === "reset-quarantined") {
    let ledgerCalls = 0;
    input.deliveryLedger = countingDeliveryLedger(input.deliveryLedger, () => {
      ledgerCalls += 1;
    });
    const error = thrownOf(() => evaluateProductionProviderReadiness(input));
    expect(error).toMatchObject({ code: "invalid_input", gateTrace: [] });
    expect(ledgerCalls).toBe(0);
    return assertRejectedObservation(fixture.expected, 0);
  }
  const result = await evaluateProductionProviderReadiness(input);
  await assertFacadeEvaluation(result, fixture.expected, input);
  if (variant === "half-open" || variant === "degraded-health") {
    expect(result.evidence.circuit).toMatchObject({
      state: "half-open",
      probeAllowance: {
        maximumProbeCount: 2,
        remainingProbeCount: variant === "half-open" ? 2 : 1,
        dryRunProbePermitted: true,
      },
    });
    expect(result.evidence.health?.healthState).toBe("degraded");
  }
  if (variant === "security-quarantine") {
    expect(result.evidence.circuit).toMatchObject({
      state: "quarantined",
      transitionReason: "security_policy_violation",
      failureWindowEvidence: { totalFailureCount: 1 },
    });
  }
  if (variant === "quarantined") {
    expect(result.evidence.circuit).toMatchObject({
      state: "quarantined",
      previousState: "quarantined",
      failureWindowEvidence: { totalFailureCount: 0 },
    });
  }
}

async function runDisabledAdapterScenario(
  fixture: ProviderReadinessEvaluationDescriptor,
  input: MutableReadinessInput,
): Promise<void> {
  const {
    adapterFingerprint: _adapter,
    providerCapabilityFingerprint: _capability,
    providerCapabilityId: _capabilityId,
    ...descriptor
  } = input.adapterDescriptor;
  void _adapter;
  void _capability;
  void _capabilityId;
  input.adapterDescriptor = createProductionProviderAdapterDescriptor(
    { ...descriptor, state: "disabled" },
    input.providerCapability,
  );
  input.authorizationEvidence = createAuthorizationDecisionEvidence(
    input.expectedAuthorizationDecision,
    authorizationAuthority(input),
  );
  return assertFacadeEvaluation(
    await evaluateProductionProviderReadiness(input),
    fixture.expected,
    input,
  );
}

async function runObservabilityHarness(
  fixture: ProviderReadinessEvaluationDescriptor,
  input: MutableReadinessInput,
): Promise<void> {
  if (fixture.mutation.operation !== "observability-harness")
    throw new Error("Unexpected mutation");
  if (fixture.mutation.variant === "public-error-privacy") {
    input.circuitFailureWindow = {
      windowStartedAt: PROVIDER_READINESS_EVALUATED_AT,
      failureCounts: [{ category: "transport-failure", count: 3 }],
    };
  }
  const result = await runDisabledProductionProviderAdapterHarness({
    mode: "observability-redaction-simulation",
    readinessInput: input,
  });
  if (result.mode !== "observability-redaction-simulation") throw new Error("Unexpected result");
  const simulation = result.observabilitySimulation as {
    bundle: {
      structuredLog: Record<string, unknown>;
      metrics: readonly unknown[];
      traces: readonly unknown[];
      publicErrors: readonly Record<string, unknown>[];
      readiness: { status: string };
    };
  };
  const authorities = await reconstructDisabledHarnessVerifierAuthorities(
    input,
    canonical.transportPolicyAuthority,
  );
  expect(simulation.bundle.readiness.status).toBe("ready");
  expect(
    verifyProviderObservabilityBundle({
      bundle: simulation.bundle,
      input: authorities.observabilityInput,
    }).status,
  ).toBe("valid");
  expect(
    verifyObservabilityReadinessEvidence({
      evidence: simulation.bundle.readiness,
      expected: authorities.expectedObservability,
    }).status,
  ).toBe("valid");
  expect(simulation.bundle.metrics).toHaveLength(2);
  expect(simulation.bundle.traces).toHaveLength(1);
  if (fixture.mutation.variant === "public-error-privacy") {
    expect(simulation.bundle.publicErrors).toHaveLength(1);
    expect(simulation.bundle.publicErrors[0]).toMatchObject({
      code: "provider_not_ready",
      message: "Provider circuit requirements were not satisfied",
    });
  } else {
    expect(simulation.bundle.publicErrors).toEqual([]);
    expect(simulation.bundle.structuredLog).toMatchObject({
      eventType: "provider-readiness-evaluated",
      outcomeClassification: "ready-for-dry-run",
    });
  }
  assertSerializedPrivacy(result, []);
  assertHarnessObservation(fixture.expected, { verificationStatus: "valid" });
}

async function runUnsafeSourceRedaction(
  fixture: ProviderReadinessEvaluationDescriptor,
  input: MutableReadinessInput,
): Promise<void> {
  if (fixture.mutation.operation !== "unsafe-source-redaction") {
    throw new Error("Unexpected mutation");
  }
  const unsafeSource: Record<string, unknown> =
    fixture.mutation.variant === "credential-key"
      ? { safe: "kept", apiKey: "sk_live_catalog_redaction_key" }
      : fixture.mutation.variant === "credential-value"
        ? { safe: "kept", diagnostic: "ghp_catalogCredentialValue123456" }
        : fixture.mutation.variant === "authorization-header"
          ? { safe: "kept", authorization: "Bearer catalogAuthorizationValue123" }
          : fixture.mutation.variant === "raw-context"
            ? { safe: "kept", rawContext: "catalog raw Context content" }
            : fixture.mutation.variant === "raw-provider-body"
              ? { safe: "kept", providerResponseBody: "catalog raw provider body" }
              : fixture.mutation.variant === "physical-path"
                ? { safe: "kept", diagnostic: "/Users/catalog/private-readiness.txt" }
                : {
                    safe: "kept",
                    environmentDump: { PROVIDER_TOKEN: "catalog-environment-secret" },
                  };
  const sanitizedSource = redactProviderObservabilityValue(unsafeSource, {
    maximumDepth: 6,
    maximumFieldCount: 32,
    maximumValueCharacters: 128,
  });
  expect(sanitizedSource).toEqual({ safe: "kept" });
  const harness = await runDisabledProductionProviderAdapterHarness({
    mode: "observability-redaction-simulation",
    readinessInput: input,
  });
  if (harness.mode !== "observability-redaction-simulation") {
    throw new Error("Unexpected harness result");
  }
  const authorities = await reconstructDisabledHarnessVerifierAuthorities(
    input,
    canonical.transportPolicyAuthority,
  );
  const emitted = Object.freeze({
    bundle: harness.observabilitySimulation,
    sanitizedSource,
  });
  const markers = collectPrivacyMarkers(unsafeSource);
  expect(markers.length).toBeGreaterThan(0);
  assertSerializedPrivacy(emitted, markers);
  const simulation = harness.observabilitySimulation as {
    bundle: { readiness: unknown };
  };
  expect(
    verifyProviderObservabilityBundle({
      bundle: simulation.bundle,
      input: authorities.observabilityInput,
    }).status,
  ).toBe("valid");
  expect(
    verifyObservabilityReadinessEvidence({
      evidence: simulation.bundle.readiness,
      expected: authorities.expectedObservability,
    }).status,
  ).toBe("valid");
  assertHarnessObservation(fixture.expected, { verificationStatus: "valid" });
}

async function assertAuthorityRejection(
  input: EvaluateProductionProviderReadinessInput,
  expected: ProviderReadinessEvaluationExpected,
): Promise<void> {
  const error = await rejectionOf(evaluateProductionProviderReadiness(input));
  expect(error).toBeInstanceOf(ProductionProviderReadinessError);
  expect(error).toMatchObject({
    code: "delivery_authority_invalid",
    gateTrace: [{ gate: expected.stoppedGate, status: "stopped" }],
  });
  assertSerializedPrivacy(error, []);
  assertScenarioObservation(
    {
      ...rejectedObservation(0),
      stoppedGate: expected.stoppedGate,
    },
    expected,
  );
}

async function runDecisionTamper(
  fixture: ProviderReadinessEvaluationDescriptor,
  input: EvaluateProductionProviderReadinessInput,
): Promise<void> {
  const ready = await evaluateProductionProviderReadiness(input);
  let candidate: ProductionProviderReadinessDecision = {
    ...ready.decision,
    healthEvidenceFingerprint: "0".repeat(64),
  };
  if (fixture.mutation.operation === "resigned-decision-substitution") {
    candidate = resign(candidate, "decisionFingerprint");
  }
  expect(
    await verifyProductionProviderReadinessDecision({
      decision: candidate,
      authoritativeInput: input,
      observabilityRetentionEvidence: ready.evidence.observabilityRetention,
    }),
  ).toEqual({
    status: "invalid",
    reason: "readiness_decision_binding_mismatch",
  });
  return assertFacadeEvaluation(ready, fixture.expected, input, {
    disposition: "tamper-rejected",
    verificationStatus: "invalid",
  });
}

function authorizationAuthority(
  input: EvaluateProductionProviderReadinessInput,
): AuthorizationAuthority {
  return {
    deliveryAuthority: canonical.authority,
    adapter: input.adapterDescriptor,
    requestedOperation: input.requestedOperation,
    decisionAuthorityReference: input.decisionAuthorityReference,
  };
}

function resign<T extends Record<string, unknown>>(value: T, fingerprintField: string): T {
  const unsigned = structuredClone(value);
  delete unsigned[fingerprintField];
  return { ...unsigned, [fingerprintField]: fingerprintProviderReadinessArtifact(unsigned) } as T;
}

function withoutPolicyFingerprint(
  policy: EvaluateProductionProviderReadinessInput["transportPolicy"],
) {
  const { policyFingerprint: _fingerprint, ...unsigned } = policy;
  void _fingerprint;
  return unsigned;
}

function withoutPricingFingerprint(
  pricing: EvaluateProductionProviderReadinessInput["pricingReference"],
) {
  const { pricingFingerprint: _fingerprint, ...unsigned } = pricing;
  void _fingerprint;
  return unsigned;
}

function poisonLaterGates(input: MutableReadinessInput): void {
  input.credentialReference = {
    ...input.credentialReference,
    referenceFingerprint: "0".repeat(64),
  };
  input.transportPolicy = {
    ...input.transportPolicy,
    policyFingerprint: "1".repeat(64),
  };
  input.ratePolicy = { ...input.ratePolicy, requestLimit: 0 };
  input.costPolicy = { ...input.costPolicy, maximumInputUnits: 0 };
}

function countingDeliveryLedger(
  ledger: DurableContextDeliveryLedger,
  onCall: () => void,
): DurableContextDeliveryLedger {
  return new Proxy(ledger, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver) as unknown;
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        onCall();
        return Reflect.apply(value as (...currentArgs: unknown[]) => unknown, target, args);
      };
    },
  });
}

function assertMappedM13Evidence(mapping: {
  attempt: unknown;
  outcome: unknown;
  executionReceipt: unknown;
  usageEvidence: unknown;
  costEvidence: unknown;
  failureEvidence?: unknown;
  timeoutEvidence?: unknown;
  resultEnvelope: unknown;
}): void {
  const verifications = [
    verifyReasoningExecutionAttempt(mapping.attempt),
    verifyReasoningProviderOutcome(mapping.outcome),
    verifyReasoningExecutionReceipt(mapping.executionReceipt),
    verifyReasoningUsageEvidence(mapping.usageEvidence),
    verifyReasoningCostEvidence(mapping.costEvidence),
    verifyReasoningResultEnvelopeArtifact(mapping.resultEnvelope),
  ];
  if (mapping.failureEvidence !== undefined) {
    verifications.push(verifyReasoningFailureEvidence(mapping.failureEvidence));
  }
  if (mapping.timeoutEvidence !== undefined) {
    verifications.push(verifyReasoningTimeoutEvidence(mapping.timeoutEvidence));
  }
  expect(verifications.every(({ status }) => status === "valid")).toBe(true);
  expect(
    verifyReasoningResultEnvelope({
      resultEnvelope: mapping.resultEnvelope,
      invocationRequest: canonical.input.invocationRequest,
      providerCapability: canonical.input.providerCapability,
      attempt: mapping.attempt as never,
      attemptHistory: [mapping.attempt] as never,
      providerOutcome: mapping.outcome as never,
      outcomeHistory: [mapping.outcome] as never,
      contextPackageObjectCount: canonical.authority.envelope.contextPackage.included.length,
    }).status,
  ).toBe("valid");
  for (const artifact of [
    mapping.attempt,
    mapping.outcome,
    mapping.executionReceipt,
    mapping.usageEvidence,
    mapping.costEvidence,
    mapping.failureEvidence,
    mapping.timeoutEvidence,
    mapping.resultEnvelope,
  ]) {
    expect(Object.isFrozen(artifact)).toBe(true);
  }
}

function collectPrivacyMarkers(value: unknown): readonly string[] {
  const markers = new Set<string>();
  const pending: Array<{ value: unknown; sensitiveParent: boolean }> = [
    { value, sensitiveParent: false },
  ];
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (typeof current.value === "string") {
      if (
        current.sensitiveParent ||
        /Bearer|sk[_-]|gh[pousr]_|xox|token|secret|password|credential|https?:\/\/|(?:^|\s)\/[A-Za-z0-9._-]+\//iu.test(
          current.value,
        )
      ) {
        markers.add(current.value);
      }
      continue;
    }
    if (current.value === null || typeof current.value !== "object") continue;
    for (const [key, child] of Object.entries(current.value as Record<string, unknown>)) {
      const sensitive =
        current.sensitiveParent ||
        /authorization|callback|client|credential|secret|token|api.?key|password|cookie|request.?body|response.?body|provider|raw.?context|environment(?:dump)?|headers?|physical.?path|file.?path|network|socket|dns|url|hidden.?context|knowledge|query.?result|tool|function/iu.test(
          key,
        );
      if (sensitive) markers.add(key);
      pending.push({ value: child, sensitiveParent: sensitive });
    }
  }
  return [...markers].filter((marker) => marker.length > 0).sort();
}

function assertSerializedPrivacy(value: unknown, markers: readonly string[]): void {
  const output = serialized(value);
  expect(output).not.toMatch(
    /Bearer|sk_live|raw provider|raw context|\/Users\/|\\Users\\|PROVIDER_TOKEN|user:pass@/iu,
  );
  for (const marker of markers) {
    expect(output.toLowerCase()).not.toContain(marker.toLowerCase());
  }
}

function serialized(value: unknown): string {
  return `${String(value)} ${JSON.stringify(value)}`;
}

function thrownOf(operation: () => unknown): unknown {
  try {
    operation();
  } catch (error) {
    return error;
  }
  throw new Error("Expected operation to throw");
}

async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
    return new Error("Expected operation to reject");
  } catch (error) {
    return error;
  }
}

async function readTypeScriptImportClosure(entries: readonly URL[]): Promise<Map<string, string>> {
  const closure = new Map<string, string>();
  const pending = [...entries];
  while (pending.length > 0) {
    const current = pending.shift();
    if (current === undefined || closure.has(current.href)) continue;
    const source = await readFile(current, "utf8");
    closure.set(current.href, source);
    for (const specifier of extractTypeScriptModuleSpecifiers(source)) {
      if (specifier.startsWith(".")) {
        pending.push(new URL(specifier.replace(/\.js$/u, ".ts"), current));
      }
    }
  }
  return closure;
}

function extractTypeScriptModuleSpecifiers(source: string): string[] {
  const matches: Array<{ index: number; specifier: string }> = [];
  for (const pattern of [
    /\b(?:import|export)\s+(?:(?:type\s+)?[^"'();]*?\bfrom\s+)?["']([^"']+)["']/gu,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/gu,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/gu,
  ]) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) matches.push({ index: match.index, specifier: match[1] });
    }
  }
  return matches.sort((left, right) => left.index - right.index).map(({ specifier }) => specifier);
}
