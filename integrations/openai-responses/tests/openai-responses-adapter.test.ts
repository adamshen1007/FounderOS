import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import type { MapOpenAIResponsesRequestInput } from "../src/index.js";
import {
  FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1,
  createOpenAIResponsesFixtureEnvelope,
  createDisabledOpenAIResponsesAdapter,
} from "../src/index.js";
import type { OpenAIResponsesFixtureEnvelope } from "@founderos/knowledge-schema";

const digest = (value: string) => value.repeat(64).slice(0, 64);

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.entries(value)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
    .join(",")}}`;
}

const REQUEST_MAPPING_FINGERPRINT = createHash("sha256")
  .update("founderos.m19.openai-responses-request-mapping.v1")
  .digest("hex");
const RESPONSE_MAPPING_FINGERPRINT = createHash("sha256")
  .update("founderos.m19.openai-responses-response-mapping.v1")
  .digest("hex");

function fixtureInput(): MapOpenAIResponsesRequestInput {
  const profile = {
    schemaVersion: "1.0",
    profileId: "founder-decision-memo-instructions-v1",
    serialization: "founderos-canonical-json-v1",
    instructionBlocks: [...FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1.instructionBlocks],
    sectionNames: [...FOUNDER_DECISION_MEMO_INSTRUCTION_PROFILE_V1.sectionNames],
    profileFingerprint: digest("1"),
  };
  const projectionContent = {
    schemaVersion: "1.0",
    question: "Which option should the founder choose?",
    deliveryTransactionId: "delivery-transaction-one",
    deliveryTransactionFingerprint: digest("41"),
    invocationRequestId: "invocation-request-one",
    invocationRequestFingerprint: digest("42"),
    contextPackageId: "context-package-one",
    contextPackageFingerprint: digest("2"),
    contextEntries: [
      {
        objectId: "knowledge-one",
        objectType: "decision",
        canonicalContent: "Evidence one",
        includedContentFingerprint: digest("3"),
        evidenceReference: "knowledge/one",
      },
    ],
  };
  const instructionContent = {
    schemaVersion: profile.schemaVersion,
    profileId: profile.profileId,
    serialization: profile.serialization,
    instructionBlocks: profile.instructionBlocks,
    sectionNames: profile.sectionNames,
  };
  const instructions = canonicalize(instructionContent);
  const input = canonicalize(projectionContent);
  const projection = {
    ...projectionContent,
    instructionCharacterCount: [...instructions].length,
    instructionUtf8ByteCount: Buffer.byteLength(instructions, "utf8"),
    inputCharacterCount: [...input].length,
    inputUtf8ByteCount: Buffer.byteLength(input, "utf8"),
    authorizedInputUtf8ByteCount:
      Buffer.byteLength(instructions, "utf8") + Buffer.byteLength(input, "utf8"),
    projectionFingerprint: digest("4"),
  };
  const modelPolicy = {
    schemaVersion: "1.0",
    policyId: "model-policy-one",
    policyVersion: "v1",
    issuerReference: "authority/model-policy",
    issuedAt: "2026-08-23T00:00:00.000Z",
    expiresAt: "2026-08-23T02:00:00.000Z",
    adapterId: "adapter-one",
    adapterFingerprint: digest("5"),
    environmentClass: "evaluation",
    providerFamilyReference: "provider-family/openai",
    apiFamily: "responses",
    operation: "founder-decision-memo",
    modelId: "fixture-model-2026-08-23",
    serviceTier: "default",
    maxOutputTokens: 2_000,
    m14ProviderCapabilityFingerprint: digest("31"),
    m14CompatibilityFingerprint: digest("32"),
    m14RateCapacityFingerprint: digest("33"),
    m14CostBudgetFingerprint: digest("34"),
    m14TransportPolicyFingerprint: digest("35"),
    privacyPolicyFingerprint: digest("36"),
    m14ReadinessDecisionFingerprint: digest("c"),
    pricingEvidenceId: "pricing-evidence-one",
    pricingEvidenceFingerprint: digest("37"),
    pricingReviewedAt: "2026-08-23T00:00:00.000Z",
    pricingExpiresAt: "2026-08-23T02:00:00.000Z",
    providerRetentionEvidenceId: "retention-evidence-one",
    providerRetentionEvidenceFingerprint: digest("38"),
    providerRetentionReviewedAt: "2026-08-23T00:00:00.000Z",
    providerRetentionExpiresAt: "2026-08-23T02:00:00.000Z",
    accountRetentionEvidenceId: "account-retention-evidence-one",
    accountRetentionEvidenceFingerprint: digest("3a"),
    accountRetentionReviewedAt: "2026-08-23T00:00:00.000Z",
    accountRetentionExpiresAt: "2026-08-23T02:00:00.000Z",
    promptCachePolicyId: "cache-policy-one",
    state: "approved-for-disabled-mapping",
    policyFingerprint: digest("7"),
  };
  const cachePolicy = {
    schemaVersion: "1.0",
    policyId: "cache-policy-one",
    policyVersion: "v1",
    adapterId: "adapter-one",
    adapterFingerprint: digest("5"),
    modelPolicyId: "model-policy-one",
    modelPolicyFingerprint: digest("7"),
    transportPolicyFingerprint: digest("35"),
    privacyPolicyFingerprint: digest("36"),
    operationFingerprint: digest("39"),
    providerRetentionEvidenceId: "retention-evidence-one",
    providerRetentionEvidenceFingerprint: digest("38"),
    accountRetentionEvidenceId: modelPolicy.accountRetentionEvidenceId,
    accountRetentionEvidenceFingerprint: modelPolicy.accountRetentionEvidenceFingerprint,
    privacyReviewedAt: "2026-08-23T00:00:00.000Z",
    privacyExpiresAt: "2026-08-23T02:00:00.000Z",
    providerRetentionReviewedAt: modelPolicy.providerRetentionReviewedAt,
    providerRetentionExpiresAt: modelPolicy.providerRetentionExpiresAt,
    accountRetentionReviewedAt: modelPolicy.accountRetentionReviewedAt,
    accountRetentionExpiresAt: modelPolicy.accountRetentionExpiresAt,
    operation: "founder-decision-memo",
    posture: "provider-managed-no-caller-controls",
    reviewedAt: "2026-08-23T00:00:00.000Z",
    expiresAt: "2026-08-23T02:00:00.000Z",
    evidenceReference: "evidence/cache-policy",
    policyFingerprint: digest("6"),
  };
  const readiness = {
    schemaVersion: "1.0",
    preparationId: "preparation-one",
    executionAttemptId: "attempt-one",
    executionAttemptFingerprint: digest("8"),
    authorizationDecisionId: "decision-one",
    authorizationDecisionFingerprint: digest("9"),
    authorizationClaimId: "claim-one",
    authorizationClaimFingerprint: digest("a"),
    adapterId: "adapter-one",
    adapterFingerprint: digest("5"),
    providerFamilyReference: "provider-family/openai",
    environmentClass: "evaluation",
    operation: "founder-decision-memo",
    readinessTransactionId: "readiness-one",
    readinessTransactionFingerprint: digest("b"),
    m14DecisionId: "m14-decision-one",
    m14DecisionFingerprint: digest("c"),
    m14RequestPlanId: "m14-plan-one",
    m14RequestPlanFingerprint: digest("d"),
    m14ProviderCapabilityFingerprint: modelPolicy.m14ProviderCapabilityFingerprint,
    m14CompatibilityFingerprint: modelPolicy.m14CompatibilityFingerprint,
    m14RateCapacityFingerprint: modelPolicy.m14RateCapacityFingerprint,
    m14CostBudgetFingerprint: modelPolicy.m14CostBudgetFingerprint,
    m14TransportPolicyFingerprint: modelPolicy.m14TransportPolicyFingerprint,
    privacyPolicyFingerprint: modelPolicy.privacyPolicyFingerprint,
    m14PricingEvidenceId: modelPolicy.pricingEvidenceId,
    m14PricingEvidenceFingerprint: modelPolicy.pricingEvidenceFingerprint,
    providerRetentionEvidenceId: modelPolicy.providerRetentionEvidenceId,
    providerRetentionEvidenceFingerprint: modelPolicy.providerRetentionEvidenceFingerprint,
    policyAuthorityEvidenceFingerprint: digest("3b"),
    pricingReviewedAt: modelPolicy.pricingReviewedAt,
    pricingExpiresAt: modelPolicy.pricingExpiresAt,
    privacyReviewedAt: "2026-08-23T00:00:00.000Z",
    privacyExpiresAt: "2026-08-23T02:00:00.000Z",
    providerRetentionReviewedAt: modelPolicy.providerRetentionReviewedAt,
    providerRetentionExpiresAt: modelPolicy.providerRetentionExpiresAt,
    accountRetentionEvidenceId: cachePolicy.accountRetentionEvidenceId,
    accountRetentionEvidenceFingerprint: cachePolicy.accountRetentionEvidenceFingerprint,
    accountRetentionReviewedAt: "2026-08-23T00:00:00.000Z",
    accountRetentionExpiresAt: "2026-08-23T02:00:00.000Z",
    operationFingerprint: cachePolicy.operationFingerprint,
    cachePolicyReviewedAt: cachePolicy.reviewedAt,
    cachePolicyExpiresAt: cachePolicy.expiresAt,
    cacheEvidenceReference: cachePolicy.evidenceReference,
    m14DecisionStatus: "ready-for-dry-run",
    adapterState: "dry-run-mapping",
    maximumRequestBytes: 50_000,
    maximumResponseBytes: 30_000,
    maximumInputCharacters: 20_000,
    maximumOutputCharacters: 10_000,
    evaluatedAt: "2026-08-23T01:00:00.000Z",
    expiresAt: "2026-08-23T01:30:00.000Z",
    issuerReference: "authority/readiness",
    evidenceFingerprint: digest("e"),
  };
  const currentControls = {
    schemaVersion: "1.0",
    preparationId: "preparation-one",
    executionAttemptId: "attempt-one",
    executionAttemptFingerprint: digest("8"),
    authorizationDecisionId: "decision-one",
    authorizationDecisionFingerprint: digest("9"),
    authorizationClaimId: "claim-one",
    authorizationClaimFingerprint: digest("a"),
    adapterId: "adapter-one",
    adapterFingerprint: digest("5"),
    providerFamilyReference: "provider-family/openai",
    environmentClass: "evaluation",
    operation: "founder-decision-memo",
    readinessTransactionId: "readiness-one",
    readinessTransactionFingerprint: digest("b"),
    m14DecisionId: "m14-decision-one",
    m14DecisionFingerprint: digest("c"),
    modelId: "fixture-model-2026-08-23",
    rateCapacity: "allowed",
    costBudget: "allowed",
    privacy: "allowed",
    retention: "allowed",
    observability: "allowed",
    circuit: "closed",
    health: "available",
    incident: "inactive",
    killSwitches: {
      global: "allowed",
      provider: "allowed",
      adapter: "allowed",
      model: "allowed",
      environment: "allowed",
      operation: "allowed",
    },
    evaluatedAt: "2026-08-23T01:00:00.000Z",
    expiresAt: "2026-08-23T01:05:00.000Z",
    issuerReference: "authority/current-controls",
    snapshotFingerprint: digest("f"),
  };
  const disabledPolicyArtifact = {
    schemaVersion: "1.0",
    policyId: "disabled-policy-one",
    policyVersion: "v1",
    state: "disabled",
    terminalResult: "disabled-by-policy",
    adapterId: "adapter-one",
    adapterFingerprint: digest("5"),
    readinessTransactionFingerprint: digest("b"),
    m14DecisionFingerprint: digest("c"),
    modelPolicyFingerprint: digest("7"),
    instructionProfileFingerprint: digest("1"),
    promptCachePolicyFingerprint: digest("6"),
    requestMappingProfileFingerprint: REQUEST_MAPPING_FINGERPRINT,
    responseMappingProfileFingerprint: RESPONSE_MAPPING_FINGERPRINT,
    environmentClass: "evaluation",
    operation: "founder-decision-memo",
  };
  const disabledPolicy = {
    ...disabledPolicyArtifact,
    policyFingerprint: createHash("sha256")
      .update(
        canonicalize({
          domain: "founderos.m19.disabled-adapter-policy.v1",
          artifact: disabledPolicyArtifact,
        }),
      )
      .digest("hex"),
  };
  return {
    schemaVersion: "1.0",
    requestPlanId: "openai-plan-one",
    readiness,
    currentControls,
    modelPolicy,
    instructionProfile: profile,
    inputProjection: projection,
    promptCachePolicy: cachePolicy,
    disabledPolicy,
    authorizationLimits: {
      maximumInputBytes: 20_000,
      maximumOutputBytes: 40_000,
      maximumInputTokens: 4_000,
      maximumOutputTokens: 2_000,
    },
  } as unknown as MapOpenAIResponsesRequestInput;
}

const memo = [
  "## Decision question\nChoose?",
  "## Executive summary\nSummary",
  "## Options considered\nA and B",
  "## Recommendation\nA",
  "## Evidence references\nknowledge/one",
  "## Assumptions and uncertainties\nOne assumption",
  "## Risks\nOne risk",
  "## Proposed next action\nReview",
].join("\n");

function mappedFixtureContext() {
  const adapter = createDisabledAdapter();
  const mapped = adapter.mapRequest(fixtureInput());
  if (mapped.status !== "mapped") throw new Error("request mapping fixture failed");
  const fixture = createOpenAIResponsesFixtureEnvelope({
    schemaVersion: "1.0",
    fixtureId: "fixture-one",
    event: "completed",
    model: "fixture-model-2026-08-23",
    serviceTier: "default",
    outputItems: [{ type: "text", role: "assistant", text: memo }],
    inputTokens: 100,
    outputTokens: 100,
  });
  return { adapter, fixture, plan: mapped.plan };
}

function reissueFixture(
  fixture: OpenAIResponsesFixtureEnvelope,
  overrides: Partial<Omit<OpenAIResponsesFixtureEnvelope, "fixtureFingerprint">>,
): OpenAIResponsesFixtureEnvelope {
  const { fixtureFingerprint: _fixtureFingerprint, ...input } = fixture;
  void _fixtureFingerprint;
  return createOpenAIResponsesFixtureEnvelope({ ...input, ...overrides });
}

function createDisabledAdapter() {
  return createDisabledOpenAIResponsesAdapter();
}

describe("Milestone 19 disabled OpenAI Responses adapter", () => {
  it("maps the fixed request deterministically without exposing transport", async () => {
    const adapterModule = await import("../src/index.js").catch(() => null);
    expect(adapterModule).not.toBeNull();
    const adapter = adapterModule!.createDisabledOpenAIResponsesAdapter();
    const first = adapter.mapRequest(fixtureInput());
    const second = adapter.mapRequest(fixtureInput());
    expect(first.status).toBe("mapped");
    expect(second).toEqual(first);
    if (first.status !== "mapped") throw new Error("request mapping fixture failed");
    expect(first.plan.providerProjection).toMatchObject({
      background: false,
      max_output_tokens: 2_000,
      service_tier: "default",
      store: false,
      stream: false,
      tools: [],
      truncation: "disabled",
    });
    expect(Object.keys(adapter).sort()).toEqual(["mapFixture", "mapRequest", "prepareDisabled"]);
  });

  it("rejects a same-length instruction substitution even when accounting still matches", async () => {
    const adapterModule = await import("../src/index.js");
    const adapter = adapterModule.createDisabledOpenAIResponsesAdapter();
    const input = fixtureInput();
    const original = input.instructionProfile.instructionBlocks[0];
    const substituted = `${original.startsWith("X") ? "Y" : "X"}${original.slice(1)}`;
    const result = adapter.mapRequest({
      ...input,
      instructionProfile: {
        ...input.instructionProfile,
        instructionBlocks: [
          substituted,
          input.instructionProfile.instructionBlocks[1],
          input.instructionProfile.instructionBlocks[2],
        ],
      },
    });
    expect(result).toEqual({ status: "rejected", reasonCode: "request_plan_invalid" });
  });

  it("enforces eight sections, same-unit bounds, and multi-fault precedence", async () => {
    const adapterModule = await import("../src/index.js");
    const adapter = adapterModule.createDisabledOpenAIResponsesAdapter();
    const mapped = adapter.mapRequest(fixtureInput());
    if (mapped.status !== "mapped") throw new Error("request mapping fixture failed");
    const fixture = createOpenAIResponsesFixtureEnvelope({
      schemaVersion: "1.0",
      fixtureId: "fixture-one",
      event: "completed",
      model: "fixture-model-2026-08-23",
      serviceTier: "default",
      outputItems: [{ type: "text", role: "assistant", text: memo }],
      inputTokens: 100,
      outputTokens: 100,
    });
    expect(adapter.mapFixture({ requestPlan: mapped.plan, fixture }).status).toBe("mapped-success");
    expect(
      adapter.mapFixture({
        requestPlan: mapped.plan,
        fixture: reissueFixture(fixture, {
          outputItems: [{ type: "text", role: "assistant", text: "hello" }],
        }),
      }).category,
    ).toBe("provider-response-invalid");
    expect(
      adapter.mapFixture({
        requestPlan: mapped.plan,
        fixture: reissueFixture(fixture, {
          outputItems: [
            { type: "tool" },
            { type: "text", role: "assistant", text: "x".repeat(40_001) },
          ],
        }),
      }).category,
    ).toBe("provider-output-prohibited");
    expect(
      adapter.mapFixture({
        requestPlan: mapped.plan,
        fixture: reissueFixture(fixture, {
          event: "refused",
          outputItems: [{ type: "refusal", text: "refused with content" }],
        }),
      }).category,
    ).toBe("provider-output-prohibited");
  });

  it("rejects a fixture whose content no longer matches its authority fingerprint", () => {
    const { adapter, fixture, plan } = mappedFixtureContext();
    const substituted = {
      ...fixture,
      outputItems: [
        {
          type: "text" as const,
          role: "assistant" as const,
          text: memo.replace("Summary", "Changed"),
        },
      ],
    };
    expect(adapter.mapFixture({ requestPlan: plan, fixture: substituted }).category).toBe(
      "provider-response-invalid",
    );
    expect(
      adapter.mapFixture({
        requestPlan: plan,
        fixture: reissueFixture(fixture, { outputItems: substituted.outputItems }),
      }).status,
    ).toBe("mapped-success");
  });

  it.each([
    { label: "missing", item: { type: "text", text: memo } },
    { label: "wrong", item: { type: "text", role: "user", text: memo } },
  ])("rejects a $label assistant-role coordinate", ({ item }) => {
    const adapter = createDisabledAdapter();
    const { fixture, plan } = mappedFixtureContext();
    expect(
      adapter.mapFixture({
        requestPlan: plan,
        fixture: { ...fixture, outputItems: [item] },
      } as never),
    ).toMatchObject({ status: "rejected", category: "provider-response-invalid" });
  });

  it.each([
    ["missing", memo.replace("## Risks\nOne risk\n", "")],
    ["duplicate", `${memo}\n## Risks\nAgain`],
    [
      "reordered",
      memo
        .replace("## Decision question", "## Executive summary")
        .replace("## Executive summary\nSummary", "## Decision question\nSummary"),
    ],
    ["renamed", memo.replace("## Risks", "## Risk")],
    ["extra", `${memo}\n## Appendix\nExtra`],
    ["empty", memo.replace("## Risks\nOne risk", "## Risks\n")],
    ["wrong level", memo.replace("## Risks", "### Risks")],
    ["carriage return", memo.replace("\n", "\r\n")],
    ["leading prose", `Preface\n${memo}`],
  ])("rejects the %s decision-memo shape", (_name, text) => {
    const { adapter, fixture, plan } = mappedFixtureContext();
    expect(
      adapter.mapFixture({
        requestPlan: plan,
        fixture: reissueFixture(fixture, {
          outputItems: [{ type: "text", role: "assistant", text }],
        }),
      }).category,
    ).toBe("provider-response-invalid");
  });

  it("enforces UTF-8 output bytes independently from character count", () => {
    const { adapter, fixture, plan } = mappedFixtureContext();
    const base = memo.replace("Review", "");
    const text = `${base}${"😀".repeat(plan.maximumOutputCharacters - [...base].length)}`;
    expect([...text].length).toBe(plan.maximumOutputCharacters);
    expect(Buffer.byteLength(text, "utf8")).toBeGreaterThan(plan.effectiveMaximumOutputBytes);
    expect(
      adapter.mapFixture({
        requestPlan: plan,
        fixture: reissueFixture(fixture, {
          outputItems: [{ type: "text", role: "assistant", text }],
        }),
      }).category,
    ).toBe("provider-response-oversized");
  });

  it("enforces input and output token ceilings and oversized-before-usage precedence", () => {
    const { adapter, fixture, plan } = mappedFixtureContext();
    expect(
      adapter.mapFixture({
        requestPlan: plan,
        fixture: reissueFixture(fixture, { inputTokens: plan.maximumInputTokens + 1 }),
      }).category,
    ).toBe("provider-usage-invalid");
    expect(
      adapter.mapFixture({
        requestPlan: plan,
        fixture: reissueFixture(fixture, { outputTokens: plan.maximumOutputTokens + 1 }),
      }).category,
    ).toBe("provider-usage-invalid");
    const base = memo.replace("Review", "");
    const oversized = `${base}${"x".repeat(plan.maximumOutputCharacters + 1)}`;
    expect(
      adapter.mapFixture({
        requestPlan: plan,
        fixture: reissueFixture(fixture, {
          outputItems: [{ type: "text", role: "assistant", text: oversized }],
          outputTokens: plan.maximumOutputTokens + 1,
        }),
      }).category,
    ).toBe("provider-response-oversized");
  });

  it("rejects tampered plans and public accessor or symbol input without invoking getters", () => {
    const { adapter, fixture, plan } = mappedFixtureContext();
    expect(
      adapter.mapFixture({
        requestPlan: { ...plan, maximumOutputCharacters: plan.maximumOutputCharacters + 1 },
        fixture,
      }).category,
    ).toBe("provider-response-invalid");

    let getterCalls = 0;
    const accessorInput = Object.defineProperty({}, "requestPlan", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return plan;
      },
    });
    expect(adapter.mapFixture(accessorInput as never).category).toBe("provider-response-invalid");
    expect(getterCalls).toBe(0);

    const symbolInput = { requestPlan: plan, fixture, [Symbol("hidden")]: true };
    expect(adapter.mapFixture(symbolInput as never).category).toBe("provider-response-invalid");
  });

  it("terminates structurally as disabled and makes no available ambient network call", async () => {
    const adapterModule = await import("../src/index.js");
    const adapter = adapterModule.createDisabledOpenAIResponsesAdapter();
    const mapped = adapter.mapRequest(fixtureInput());
    if (mapped.status !== "mapped") throw new Error("request mapping fixture failed");
    let networkCalls = 0;
    const networkGlobals = [
      "fetch",
      "WebSocket",
      "EventSource",
      "XMLHttpRequest",
      "navigator",
    ] as const;
    const originalDescriptors = new Map<string, PropertyDescriptor>();
    for (const name of networkGlobals) {
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
      if (descriptor === undefined || descriptor.configurable !== true) continue;
      originalDescriptors.set(name, descriptor);
      Object.defineProperty(globalThis, name, {
        configurable: true,
        get() {
          networkCalls += 1;
          throw new Error("network forbidden");
        },
      });
    }
    try {
      expect(adapter.mapRequest(fixtureInput()).status).toBe("mapped");
      expect(
        adapter.mapFixture({
          requestPlan: mapped.plan,
          fixture: mappedFixtureContext().fixture,
        }).status,
      ).toBe("mapped-success");
      const result = adapter.prepareDisabled({
        requestPlan: mapped.plan,
        credentialResolutionEvidenceFingerprint: digest("2b"),
        disabledPolicy: fixtureInput().disabledPolicy,
      });
      expect(result.status).toBe("disabled-by-policy");
      expect(networkCalls).toBe(0);
    } finally {
      for (const [name, descriptor] of originalDescriptors) {
        Object.defineProperty(globalThis, name, descriptor);
      }
    }
  });
});
