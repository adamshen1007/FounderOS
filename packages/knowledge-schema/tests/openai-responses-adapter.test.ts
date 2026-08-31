import { describe, expect, it } from "vitest";

describe("Milestone 19 OpenAI Responses shared contracts", () => {
  it("exports the complete closed M19 contract surface", async () => {
    const contracts = await import("../src/index.js");

    expect(contracts.M19PreparationFailureReasonCodeSchema).toBeDefined();
    expect(contracts.M19PreparationResultSchema).toBeDefined();
    expect(contracts.M19CurrentControlSnapshotSchema).toBeDefined();
    expect(contracts.M19ReadinessAuthorityEvidenceSchema).toBeDefined();
    expect(contracts.M19PolicyAuthorityEvidenceSchema).toBeDefined();
    expect(contracts.OpenAIModelPolicySchema).toBeDefined();
    expect(contracts.OpenAIPromptCachePolicySchema).toBeDefined();
    expect(contracts.FounderDecisionMemoInstructionProfileSchema).toBeDefined();
    expect(contracts.FounderDecisionMemoInputProjectionSchema).toBeDefined();
    expect(contracts.OpenAIResponsesRequestPlanSchema).toBeDefined();
    expect(contracts.OpenAIResponsesFixtureEnvelopeSchema).toBeDefined();
    expect(contracts.OpenAIResponsesMappingEvidenceSchema).toBeDefined();
    expect(contracts.M19DisabledAdapterPolicySchema).toBeDefined();

    expect(contracts.M19PreparationFailureReasonCodeSchema.options).toEqual([
      "invalid_input",
      "conflicting_preparation_identity",
      "authorization_non_authoritative",
      "readiness_non_authoritative",
      "model_policy_invalid",
      "instruction_profile_invalid",
      "prompt_cache_policy_invalid",
      "coordinate_mismatch",
      "authority_expired",
      "current_control_rejected",
      "request_plan_invalid",
      "credential_resolution_rejected",
      "credential_resolution_non_authoritative",
      "disabled_policy_invalid",
      "internal_integrity_failure",
    ]);
    expect(contracts.M16ErrorTaxonomyCodeSchema.options).toEqual([
      "provider-refused",
      "provider-rate-limited",
      "provider-unavailable",
      "request-timeout-not-sent",
      "request-timeout-ambiguous",
      "cancelled-before-send",
      "cancelled-after-send-ambiguous",
      "provider-response-invalid",
      "provider-response-oversized",
      "provider-output-prohibited",
      "provider-usage-invalid",
    ]);
  });
});
