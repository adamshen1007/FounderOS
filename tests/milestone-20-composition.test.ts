import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";
import { M20FaultKindSchema } from "../packages/knowledge-schema/src/index.js";

import { createOpenAIResponsesFixtureEnvelope } from "../integrations/openai-responses/src/index.js";
import {
  createCredentialResolutionRequest,
  createM20DryRunRequest,
  verifyM20DryRunReport,
} from "../services/knowledge-engine/src/index.js";

import {
  M20_TEST_SCENARIO_CATALOG,
  M20_TEST_SCENARIO_DEFINITIONS,
  createM20IsolatedFixtureMapping,
  createM20TestComposition,
  createM20TestFinalControlAuthority,
  createM20TestFinalControlConfiguration,
  installM20AmbientNetworkTrap,
  m20TestFingerprint,
} from "./support/milestone-20/index.js";

const REQUIRED_NAMED_VARIANTS = Object.freeze([
  "m17-denied",
  "m17-expired",
  "m17-revoked",
  "m17-mismatched",
  "m17-already-claimed",
  "m14-m15-readiness-non-authoritative",
  "m14-m15-readiness-stale",
  "m19-terminal-malformed",
  "m19-terminal-preparation-id-mismatch",
  "m19-terminal-request-plan-id-mismatch",
  "m19-terminal-adapter-id-mismatch",
  "m19-terminal-adapter-fingerprint-mismatch",
  "m19-terminal-operation-mismatch",
  "m19-terminal-evaluation-time-mismatch",
] as const);

const NAMED_VARIANT_EVIDENCE = new Map<string, string>([
  ["m17-denied", "invalid_input"],
  ["m17-expired", "authorization_expired"],
  ["m17-revoked", "authorization_revoked"],
  ["m17-mismatched", "non_authoritative_artifact"],
  ["m17-already-claimed", "already_claimed"],
  ["m14-m15-readiness-non-authoritative", "readiness-authority-non-authoritative"],
  ["m14-m15-readiness-stale", "readiness-authority-stale"],
  ...REQUIRED_NAMED_VARIANTS.filter((variant) => variant.startsWith("m19-terminal-")).map(
    (variant) => [variant, variant] as const,
  ),
]);

const CANONICAL_SOURCE_FILES = Object.freeze([
  "docs/milestones/milestone-12/FounderOS_Atomic_Context_Delivery_Transaction_Semantics_v1.0.md",
  "docs/milestones/milestone-13/FounderOS_Consumption_Evidence_Finalization_Specification_v1.0.md",
  "docs/milestones/milestone-14/FounderOS_Disabled_Production_Provider_Adapter_Harness_Specification_v1.0.md",
  "docs/milestones/milestone-15/FounderOS_Durable_Readiness_Evaluation_Ledger_Contract_v1.0.md",
  "docs/milestones/milestone-16/FounderOS_Authentication_Authorization_and_Credential_Ownership_Specification_v1.0.md",
  "docs/milestones/milestone-17/FounderOS_Authorization_Decision_Claim_Revocation_and_Verification_Contract_v1.0.md",
  "docs/milestones/milestone-18/FounderOS_Credential_Resolution_Request_and_Evidence_Contract_v1.0.md",
  "docs/milestones/milestone-19/FounderOS_Disabled_Provider_Adapter_and_No_Network_Contract_v1.0.md",
]);

function canonicalFileSnapshot(): string {
  return m20TestFingerprint(
    Object.fromEntries(CANONICAL_SOURCE_FILES.map((path) => [path, readFileSync(path, "utf8")])),
  );
}

function catalogVariant(scenarioId: string): string | undefined {
  const scenario = M20_TEST_SCENARIO_CATALOG.scenarios.find(
    (candidate) => candidate.scenarioId === scenarioId,
  );
  const reference = scenario?.primaryFault?.fixtureReference;
  const prefix = "fixture/m20/variant/";
  return reference?.startsWith(prefix) ? reference.slice(prefix.length) : undefined;
}

const FINAL_CONTROL_DENIALS = new Map([
  ["final-control-global-disabled", "global_disabled"],
  ["final-control-provider-disabled", "provider_disabled"],
  ["final-control-adapter-disabled", "adapter_disabled"],
  ["final-control-model-disabled", "model_disabled"],
  ["final-control-environment-disabled", "environment_disabled"],
  ["final-control-operation-disabled", "operation_disabled"],
  ["final-control-incident-active", "incident_active"],
  ["final-control-credential-revoked", "credential_revoked"],
  ["final-control-credential-stale", "credential_stale"],
  ["final-control-circuit-not-closed", "circuit_not_closed"],
  ["final-control-health-not-healthy", "health_not_healthy"],
  ["final-control-authorization-revoked", "authorization_revoked"],
  ["final-control-authorization-expired", "authorization_expired"],
] as const);

describe("Milestone 20 repository composition", () => {
  it("exposes the closed immutable scenario catalog", () => {
    expect(Object.isFrozen(M20_TEST_SCENARIO_CATALOG)).toBe(true);
    expect(M20_TEST_SCENARIO_CATALOG.scenarios.length).toBeGreaterThan(0);
    const catalogKinds = new Set(
      M20_TEST_SCENARIO_CATALOG.scenarios.flatMap((scenario) =>
        [scenario.primaryFault?.faultKind, scenario.precedenceFault?.faultKind].filter(Boolean),
      ),
    );
    expect(catalogKinds).toEqual(new Set(M20FaultKindSchema.options));
    expect(
      M20_TEST_SCENARIO_CATALOG.scenarios.every(
        (scenario) =>
          Object.isFrozen(scenario) &&
          (scenario.primaryFault === undefined || Object.isFrozen(scenario.primaryFault)) &&
          (scenario.precedenceFault === undefined || Object.isFrozen(scenario.precedenceFault)),
      ),
    ).toBe(true);
    expect(createM20TestComposition).toBeTypeOf("function");
    expect(
      M20_TEST_SCENARIO_CATALOG.scenarios
        .map(({ scenarioId }) => catalogVariant(scenarioId))
        .filter(Boolean),
    ).toEqual(expect.arrayContaining([...REQUIRED_NAMED_VARIANTS]));
    expect(
      new Set(
        M20_TEST_SCENARIO_CATALOG.scenarios.flatMap((scenario) =>
          [
            scenario.primaryFault?.fixtureReference,
            scenario.precedenceFault?.fixtureReference,
          ].filter(Boolean),
        ),
      ).size,
    ).toBe(
      M20_TEST_SCENARIO_CATALOG.scenarios.reduce(
        (count, scenario) =>
          count +
          Number(scenario.primaryFault !== undefined) +
          Number(scenario.precedenceFault !== undefined),
        0,
      ),
    );
  });

  it("exposes exactly the two structural final-control methods", () => {
    const trap = installM20AmbientNetworkTrap();
    try {
      const authority = createM20TestFinalControlAuthority(
        createM20TestFinalControlConfiguration(),
      );
      expect(Reflect.ownKeys(authority)).toEqual(["issueSnapshot", "verifySnapshot"]);
      expect(trap.attemptedCalls()).toBe(0);
    } finally {
      trap.restore();
    }
  });

  it("rejects hostile factory configuration without invoking accessors", () => {
    const trap = installM20AmbientNetworkTrap();
    let reads = 0;
    const hostile = Object.defineProperty({}, "schemaVersion", {
      enumerable: true,
      get() {
        reads += 1;
        return "1.0";
      },
    });
    try {
      expect(() => createM20TestFinalControlAuthority(hostile as never)).toThrow(TypeError);
      expect(reads).toBe(0);
      expect(() => createM20TestFinalControlAuthority(new Proxy({}, {}) as never)).toThrow(
        TypeError,
      );
      expect(trap.attemptedCalls()).toBe(0);
    } finally {
      trap.restore();
    }
  });

  it("rejects every extra profiles-array descriptor without invoking accessors", () => {
    const trap = installM20AmbientNetworkTrap();
    try {
      for (const [name, descriptor] of [
        ["client", { value: () => undefined, enumerable: true }],
        ["callback", { value: () => undefined, enumerable: false }],
      ] as const) {
        const configuration = structuredClone(createM20TestFinalControlConfiguration());
        Object.defineProperty(configuration.profiles, name, {
          ...descriptor,
          configurable: true,
        });
        expect(() => createM20TestFinalControlAuthority(configuration)).toThrow(TypeError);
      }
      let reads = 0;
      const configuration = structuredClone(createM20TestFinalControlConfiguration());
      Object.defineProperty(configuration.profiles, "client", {
        enumerable: false,
        configurable: true,
        get() {
          reads += 1;
          return () => undefined;
        },
      });
      expect(() => createM20TestFinalControlAuthority(configuration)).toThrow(TypeError);
      expect(reads).toBe(0);
      expect(trap.attemptedCalls()).toBe(0);
    } finally {
      trap.restore();
    }
  });

  it("rejects hostile method inputs before registry access and normalizes all exceptions", () => {
    const trap = installM20AmbientNetworkTrap();
    const authority = createM20TestFinalControlAuthority(createM20TestFinalControlConfiguration());
    let reads = 0;
    const hostile = Object.defineProperty({}, "schemaVersion", {
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("must not run");
      },
    });
    try {
      expect(authority.issueSnapshot(hostile as never)).toEqual({
        status: "rejected",
        reasonCode: "invalid_snapshot_request",
      });
      expect(authority.verifySnapshot(hostile as never)).toEqual({
        status: "invalid",
        reasonCode: "snapshot_non_authoritative",
      });
      expect(authority.issueSnapshot(new Proxy({}, {}) as never)).toEqual({
        status: "rejected",
        reasonCode: "invalid_snapshot_request",
      });
      expect(reads).toBe(0);
      expect(trap.attemptedCalls()).toBe(0);
    } finally {
      trap.restore();
    }
  });

  it("rejects method inputs containing arrays with extra or executable descriptors", () => {
    const trap = installM20AmbientNetworkTrap();
    try {
      const authority = createM20TestFinalControlAuthority(
        createM20TestFinalControlConfiguration(),
      );
      let reads = 0;
      for (const descriptor of [
        { value: () => undefined, enumerable: true },
        { value: () => undefined, enumerable: false },
        {
          enumerable: false,
          get() {
            reads += 1;
            return () => undefined;
          },
        },
      ]) {
        const client: unknown[] = [];
        Object.defineProperty(client, "client", { ...descriptor, configurable: true });
        expect(authority.issueSnapshot({ schemaVersion: "1.0", client } as never)).toEqual({
          status: "rejected",
          reasonCode: "invalid_snapshot_request",
        });
        expect(authority.verifySnapshot({ schemaVersion: "1.0", client } as never)).toEqual({
          status: "invalid",
          reasonCode: "snapshot_non_authoritative",
        });
      }
      expect(reads).toBe(0);
      expect(trap.attemptedCalls()).toBe(0);
    } finally {
      trap.restore();
    }
  });

  it("retains defensive configuration copies after caller mutation", async () => {
    const runtime = createM20TestComposition();
    try {
      await runtime.run();
      const request = runtime.readFinalControlRequest();
      if (request === undefined) throw new Error("final-control request was not observed");
      const configuration = structuredClone(createM20TestFinalControlConfiguration());
      const authority = createM20TestFinalControlAuthority(configuration);
      const mutable = configuration as unknown as { authorityId: string; profiles: unknown[] };
      mutable.authorityId = "mutated-authority";
      mutable.profiles.splice(0, mutable.profiles.length);
      expect(Reflect.ownKeys(authority)).toEqual(["issueSnapshot", "verifySnapshot"]);
      expect(
        authority.issueSnapshot({
          ...request,
          runId: "run-defensive-configuration-copy",
          snapshotId: "snapshot-defensive-configuration-copy",
        }).status,
      ).toBe("issued");
      expect(runtime.trap.attemptedCalls()).toBe(0);
    } finally {
      runtime.restore();
    }
  });

  it("wraps every available ambient network global before dependency construction", () => {
    const names = ["fetch", "XMLHttpRequest", "WebSocket", "EventSource", "WebTransport"];
    const available = names.filter(
      (name) => typeof (globalThis as unknown as Record<string, unknown>)[name] === "function",
    );
    const trap = installM20AmbientNetworkTrap();
    try {
      expect(trap.wrappedGlobals).toEqual(available);
      expect(trap.attemptedCalls()).toBe(0);
    } finally {
      trap.restore();
    }
  });

  it("runs the concrete no-network success composition", async () => {
    const runtime = createM20TestComposition();
    try {
      const result = await runtime.run();
      expect(result.status).toBe("dry-run-verified");
      expect(runtime.trap.attemptedCalls()).toBe(0);
      expect(runtime.protectedCounts()).toEqual(runtime.scenario.expectedOwnerCallCounts);
    } finally {
      runtime.restore();
    }
  });

  it("rejects each credential-to-authorization coordinate substitution independently", async () => {
    const runtime = createM20TestComposition();
    try {
      const result = await runtime.run();
      expect(result.status).toBe("dry-run-verified");
      const request = runtime.readFinalControlRequest();
      if (request === undefined) throw new Error("final-control request was not observed");
      const { requestFingerprint: _fingerprint, ...unsignedCredential } =
        request.credentialResolutionRequest;
      void _fingerprint;
      const substitutions = [
        ["authorizationDecisionId", "decision-substituted"],
        ["authorizationDecisionFingerprint", "0".repeat(64)],
        ["authorizationClaimId", "claim-substituted"],
        ["authorizationClaimFingerprint", "0".repeat(64)],
        ["executionAttemptId", "attempt-substituted"],
        ["executionAttemptFingerprint", "0".repeat(64)],
        ["subjectReference", "subject/substituted"],
        ["consumerId", "consumer-substituted"],
        ["deliveryTransactionId", "delivery-substituted"],
        ["contextPackageId", "context-substituted"],
        ["invocationRequestId", "invocation-substituted"],
        ["providerFamilyReference", "provider-family/substituted"],
        ["adapterId", "adapter-substituted"],
        ["adapterFingerprint", "0".repeat(64)],
        ["environmentClass", "test"],
        ["credentialReferenceId", "credential-substituted"],
        ["credentialReferenceFingerprint", "0".repeat(64)],
        ["expectedRotationVersion", "rotation-substituted"],
      ] as const;
      for (const [field, value] of substitutions) {
        const authority = createM20TestFinalControlAuthority(
          createM20TestFinalControlConfiguration(),
        );
        const credential = createCredentialResolutionRequest({
          ...unsignedCredential,
          [field]: value,
        } as never);
        expect(
          authority.issueSnapshot({
            ...request,
            runId: `run-coordinate-${field}`,
            snapshotId: `snapshot-coordinate-${field}`,
            credentialResolutionRequest: credential,
          }),
        ).toEqual({ status: "rejected", reasonCode: "coordinate_mismatch" });
      }
    } finally {
      runtime.restore();
    }
  });

  it("uses canonical request bytes for retry identity and exact issued-object verification", async () => {
    const runtime = createM20TestComposition();
    try {
      await runtime.run();
      const request = runtime.readFinalControlRequest();
      if (request === undefined) throw new Error("final-control request was not observed");
      const authority = createM20TestFinalControlAuthority(
        createM20TestFinalControlConfiguration(),
      );
      const first = authority.issueSnapshot(structuredClone(request));
      const retry = authority.issueSnapshot(structuredClone(request));
      expect(first.status).toBe("issued");
      expect(retry.status).toBe("issued");
      if (first.status !== "issued" || retry.status !== "issued") return;
      expect(retry.snapshot).toBe(first.snapshot);
      expect(
        authority.verifySnapshot({
          schemaVersion: "1.0",
          runId: request.runId,
          snapshot: first.snapshot,
        }),
      ).toEqual({ status: "valid" });
      expect(
        authority.verifySnapshot({
          schemaVersion: "1.0",
          runId: request.runId,
          snapshot: structuredClone(first.snapshot),
        }),
      ).toEqual({ status: "invalid", reasonCode: "snapshot_non_authoritative" });
    } finally {
      runtime.restore();
    }
  });

  it.each(
    M20_TEST_SCENARIO_DEFINITIONS.filter(
      (definition) => definition.purpose !== "concurrency" && definition.purpose !== "replay",
    ),
  )("executes authoritative scenario $id", async ({ id, expectedReason }) => {
    const filesBefore = canonicalFileSnapshot();
    const runtime = createM20TestComposition(id);
    try {
      const result = await runtime.run();
      expect(result.status, JSON.stringify({ id, result, calls: runtime.protectedCounts() })).toBe(
        expectedReason === undefined ? "dry-run-verified" : "dry-run-rejected",
      );
      if (result.status === "dry-run-rejected") {
        expect(result.report.reasonCode).toBe(expectedReason);
      }
      expect(runtime.variant).toBe(catalogVariant(id));
      if (runtime.variant !== undefined) {
        expect(runtime.readVariantEvidence()).toBe(NAMED_VARIANT_EVIDENCE.get(runtime.variant));
      }
      if (runtime.variant?.startsWith("m19-terminal-")) {
        const mutation = runtime.readM19TerminalMutation();
        expect(mutation?.variant).toBe(runtime.variant);
        expect(mutation?.before).not.toEqual(mutation?.after);
        expect(mutation?.changedFields).toEqual(
          runtime.variant === "m19-terminal-malformed"
            ? ["requestPlanFingerprint"]
            : runtime.variant === "m19-terminal-preparation-id-mismatch"
              ? ["preparationId"]
              : runtime.variant === "m19-terminal-request-plan-id-mismatch"
                ? ["requestPlanId"]
                : runtime.variant === "m19-terminal-adapter-id-mismatch"
                  ? ["adapterId"]
                  : runtime.variant === "m19-terminal-adapter-fingerprint-mismatch"
                    ? ["adapterFingerprint"]
                    : runtime.variant === "m19-terminal-operation-mismatch"
                      ? ["operation"]
                      : ["evaluatedAt"],
        );
        if (mutation !== undefined) {
          const expected = new Map<string, readonly [string, unknown]>([
            ["m19-terminal-preparation-id-mismatch", ["preparationId", "preparation-substituted"]],
            [
              "m19-terminal-request-plan-id-mismatch",
              ["requestPlanId", "request-plan-substituted"],
            ],
            ["m19-terminal-adapter-id-mismatch", ["adapterId", "adapter-substituted"]],
            ["m19-terminal-adapter-fingerprint-mismatch", ["adapterFingerprint", "0".repeat(64)]],
            ["m19-terminal-operation-mismatch", ["operation", "substituted-operation"]],
            ["m19-terminal-evaluation-time-mismatch", ["evaluatedAt", "2026-08-23T01:00:01.000Z"]],
          ]);
          if (runtime.variant === "m19-terminal-malformed") {
            expect(Object.hasOwn(mutation.before, "requestPlanFingerprint")).toBe(true);
            expect(Object.hasOwn(mutation.after, "requestPlanFingerprint")).toBe(false);
          } else {
            const coordinate = expected.get(runtime.variant!);
            if (coordinate === undefined) throw new Error("missing terminal mutation expectation");
            expect(mutation.after[coordinate[0]]).toBe(coordinate[1]);
            expect(mutation.before[coordinate[0]]).not.toBe(coordinate[1]);
          }
        }
      }
      const scenarioFaults = [runtime.scenario.primaryFault, runtime.scenario.precedenceFault]
        .map((fault) => fault?.faultKind)
        .filter((kind) => kind !== undefined);
      const expectedDenial = [...FINAL_CONTROL_DENIALS].find(([kind]) =>
        scenarioFaults.includes(kind),
      )?.[1];
      if (expectedReason === "final_control_rehearsal_denied") {
        expect(runtime.readFinalControlDenialReason()).toBe(expectedDenial);
      }
      expect(runtime.protectedCounts()).toEqual(runtime.scenario.expectedOwnerCallCounts);
      expect(runtime.readSourceSnapshot()).toBe(runtime.sourceSnapshot);
      expect(runtime.readSourceInventory()).toBe(runtime.sourceInventory);
      expect(m20TestFingerprint(JSON.parse(runtime.readSourceSnapshot()))).toBe(
        runtime.sourceFingerprint,
      );
      expect(runtime.trap.attemptedCalls()).toBe(0);
      expect(canonicalFileSnapshot()).toBe(filesBefore);
      expect(Object.keys(runtime.sourceInventory)).toEqual([
        "m12Delivery",
        "m13Invocation",
        "m14Readiness",
        "m15ReadinessAuthority",
        "m16Policy",
        "m17Authorization",
        "m18CredentialResolution",
        "m19Preparation",
        "canonicalSourcesAndLedgers",
      ]);
    } finally {
      runtime.restore();
    }
  });

  it("keeps concurrent followers non-mutating and permanently replays the owner result", async () => {
    const filesBefore = canonicalFileSnapshot();
    const runtime = createM20TestComposition("90-concurrency");
    try {
      const ownerPromise = runtime.run();
      await Promise.resolve();
      const beforeFollower = runtime.protectedCounts();
      await expect(runtime.run()).resolves.toEqual({
        status: "in-flight",
        reason: "dry_run_in_progress",
      });
      expect(runtime.protectedCounts()).toEqual(beforeFollower);
      runtime.releaseConcurrency();
      const owner = await ownerPromise;
      expect(owner.status).toBe("dry-run-verified");
      const beforeReplay = runtime.protectedCounts();
      const replay = await runtime.run();
      expect(replay).toBe(owner);
      expect(runtime.protectedCounts()).toEqual(beforeReplay);
      expect(runtime.readSourceSnapshot()).toBe(runtime.sourceSnapshot);
      expect(runtime.trap.attemptedCalls()).toBe(0);
      expect(canonicalFileSnapshot()).toBe(filesBefore);
    } finally {
      runtime.restore();
    }
  });

  it("returns the exact frozen terminal result for the cataloged replay scenario", async () => {
    const filesBefore = canonicalFileSnapshot();
    const runtime = createM20TestComposition("91-replay");
    try {
      const owner = await runtime.run();
      const counts = runtime.protectedCounts();
      const replay = await runtime.run();
      expect(replay).toBe(owner);
      expect(Object.isFrozen(replay)).toBe(true);
      expect(runtime.protectedCounts()).toEqual(counts);
      expect(runtime.trap.attemptedCalls()).toBe(0);
      expect(runtime.readSourceSnapshot()).toBe(runtime.sourceSnapshot);
      expect(canonicalFileSnapshot()).toBe(filesBefore);
    } finally {
      runtime.restore();
    }
  });

  it("produces byte-identical reports and fingerprints across fresh conductors", async () => {
    const firstRuntime = createM20TestComposition();
    let first;
    try {
      first = await firstRuntime.run();
    } finally {
      firstRuntime.restore();
    }
    const secondRuntime = createM20TestComposition();
    try {
      const second = await secondRuntime.run();
      expect(first.status).toBe("dry-run-verified");
      expect(second.status).toBe("dry-run-verified");
      if (first.status !== "dry-run-verified" || second.status !== "dry-run-verified") return;
      expect(JSON.stringify(second.report)).toBe(JSON.stringify(first.report));
      expect(second.report.reportFingerprint).toBe(first.report.reportFingerprint);
      expect(secondRuntime.trap.attemptedCalls()).toBe(0);
    } finally {
      secondRuntime.restore();
    }
  });

  it("keeps invalid input and conflicting run identity outside the runtime catalog", async () => {
    const filesBefore = canonicalFileSnapshot();
    const runtime = createM20TestComposition();
    try {
      await expect(
        runtime.conductor.run({ ...runtime.request, requestFingerprint: "0".repeat(64) }),
      ).resolves.toEqual({
        status: "preflight-rejected",
        reasonCode: "invalid_input",
      });
      expect(runtime.readSourceSnapshot()).toBe(runtime.sourceSnapshot);
      expect(runtime.readSourceInventory()).toBe(runtime.sourceInventory);
      expect(canonicalFileSnapshot()).toBe(filesBefore);
      const owner = await runtime.run();
      expect(owner.status).toBe("dry-run-verified");
      expect(runtime.readSourceSnapshot()).toBe(runtime.sourceSnapshot);
      const { requestFingerprint: _fingerprint, ...input } = runtime.request;
      void _fingerprint;
      const conflict = createM20DryRunRequest({
        ...input,
        requestPlanId: "request-plan-conflicting",
      });
      await expect(runtime.conductor.run(conflict)).resolves.toEqual({
        status: "preflight-rejected",
        reasonCode: "conflicting_run_identity",
      });
      expect(runtime.readSourceSnapshot()).toBe(runtime.sourceSnapshot);
      const substitutedScenario = createM20DryRunRequest({
        ...input,
        runId: "run-substituted-scenario",
        scenarioId: "scenario-not-in-catalog",
        scenarioFingerprint: "0".repeat(64),
      });
      const substitutedResult = await runtime.conductor.run(substitutedScenario);
      expect(substitutedResult.status).toBe("dry-run-rejected");
      if (substitutedResult.status === "dry-run-rejected") {
        expect(substitutedResult.report.reasonCode).toBe("scenario_non_authoritative");
      }
      expect(runtime.readSourceSnapshot()).toBe(runtime.sourceSnapshot);
      await expect(
        runtime.conductor.run({ ...runtime.request, client: () => undefined }),
      ).resolves.toEqual({ status: "preflight-rejected", reasonCode: "invalid_input" });
      expect(runtime.trap.attemptedCalls()).toBe(0);
      expect(runtime.readSourceSnapshot()).toBe(runtime.sourceSnapshot);
      expect(runtime.readSourceInventory()).toBe(runtime.sourceInventory);
      expect(canonicalFileSnapshot()).toBe(filesBefore);
    } finally {
      runtime.restore();
    }
  });

  it("keeps report-verifier mutations outside the scenario catalog", async () => {
    const runtime = createM20TestComposition();
    try {
      const result = await runtime.run();
      if (result.status !== "dry-run-verified") throw new Error("M20 success fixture failed");
      const mutations = [
        { ...structuredClone(result.report), networkAttemptCount: 1 },
        { ...structuredClone(result.report), reportFingerprint: "0".repeat(64) },
        {
          ...structuredClone(result.report),
          observations: [...result.report.observations].reverse(),
        },
        {
          ...structuredClone(result.report),
          protectedCallCounts: { ...result.report.protectedCallCounts, m19PreparationCalls: 0 },
        },
      ];
      for (const mutation of mutations) {
        expect(
          verifyM20DryRunReport(mutation, runtime.request, M20_TEST_SCENARIO_CATALOG).status,
        ).toBe("invalid");
      }
      expect(runtime.trap.attemptedCalls()).toBe(0);
    } finally {
      runtime.restore();
    }
  });

  it("keeps the isolated M19 fixture-response regression matrix outside dry-run artifacts", async () => {
    const trap = installM20AmbientNetworkTrap();
    try {
      const { adapter, plan } = createM20IsolatedFixtureMapping();
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
      const cases = [
        [
          "mapped-success",
          {
            event: "completed",
            outputItems: [{ type: "text", role: "assistant", text: memo }],
            inputTokens: 1,
            outputTokens: 1,
          },
        ],
        [
          "provider-refused",
          { event: "refused", outputItems: [], inputTokens: 0, outputTokens: 0 },
        ],
        [
          "provider-rate-limited",
          { event: "rate-limited", outputItems: [], inputTokens: 0, outputTokens: 0 },
        ],
        [
          "provider-unavailable",
          { event: "unavailable", outputItems: [], inputTokens: 0, outputTokens: 0 },
        ],
        [
          "request-timeout-not-sent",
          { event: "timeout-before-acceptance", outputItems: [], inputTokens: 0, outputTokens: 0 },
        ],
        [
          "request-timeout-ambiguous",
          { event: "timeout-ambiguous", outputItems: [], inputTokens: 0, outputTokens: 0 },
        ],
        [
          "cancelled-before-send",
          { event: "cancelled-before-send", outputItems: [], inputTokens: 0, outputTokens: 0 },
        ],
        [
          "cancelled-after-send-ambiguous",
          { event: "cancelled-ambiguous", outputItems: [], inputTokens: 0, outputTokens: 0 },
        ],
        [
          "provider-response-invalid",
          { event: "partial", outputItems: [], inputTokens: 0, outputTokens: 0 },
        ],
        [
          "provider-response-oversized",
          {
            event: "completed",
            outputItems: [
              {
                type: "text",
                role: "assistant",
                text: `${memo}${"x".repeat(plan.maximumOutputCharacters)}`,
              },
            ],
            inputTokens: 1,
            outputTokens: 1,
          },
        ],
        [
          "provider-output-prohibited",
          { event: "completed", outputItems: [{ type: "tool" }], inputTokens: 1, outputTokens: 1 },
        ],
        [
          "provider-usage-invalid",
          {
            event: "completed",
            outputItems: [{ type: "text", role: "assistant", text: memo }],
            inputTokens: plan.maximumInputTokens + 1,
            outputTokens: 1,
          },
        ],
      ] as const;
      for (const [expected, fixture] of cases) {
        const envelope = createOpenAIResponsesFixtureEnvelope({
          schemaVersion: "1.0",
          fixtureId: `isolated-${expected}`,
          model: plan.providerProjection.model,
          serviceTier: "default",
          ...fixture,
        } as never);
        expect(adapter.mapFixture({ requestPlan: plan, fixture: envelope }).category).toBe(
          expected,
        );
      }
      expect(JSON.stringify(M20_TEST_SCENARIO_CATALOG)).not.toContain("isolated-mapped-success");
      expect(trap.attemptedCalls()).toBe(0);
    } finally {
      trap.restore();
    }
  });
});
