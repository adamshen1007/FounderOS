export interface Milestone17ImplementationReference {
  readonly path: string;
  readonly anchors: readonly string[];
}

export interface Milestone17PublicSymbolReference {
  readonly sourcePath: string;
  readonly facadePath: string;
  readonly symbols: readonly string[];
}

export interface Milestone17TestReference {
  readonly path: string;
  readonly cases: readonly string[];
}

export interface Milestone17VerificationReference {
  readonly path: string;
  readonly anchors?: readonly string[];
  readonly packageScripts?: readonly string[];
}

export interface Milestone17AcceptanceTraceabilityRow {
  readonly id: `M17-AC-${string}`;
  readonly contractPaths: readonly string[];
  readonly implementation: readonly Milestone17ImplementationReference[];
  readonly publicSymbols?: readonly Milestone17PublicSymbolReference[];
  readonly tests?: readonly Milestone17TestReference[];
  readonly verification?: readonly Milestone17VerificationReference[];
}

const DESIGN =
  "docs/milestones/milestone-17/FounderOS_Milestone_17_Authorization_Decision_Authority_Design_v1.0.md";
const PLAN = "docs/milestones/milestone-17/FounderOS_Milestone_17_Implementation_Plan_v1.0.md";
const SPECIFICATION =
  "docs/milestones/milestone-17/FounderOS_Milestone_17_Authorization_Decision_Authority_Specification_v1.0.md";
const IDENTITY_CONTRACT =
  "docs/milestones/milestone-17/FounderOS_Service_Identity_Evidence_Contract_v1.0.md";
const REQUEST_CONTRACT =
  "docs/milestones/milestone-17/FounderOS_Human_Approval_and_Authorization_Request_Contract_v1.0.md";
const DECISION_CONTRACT =
  "docs/milestones/milestone-17/FounderOS_Authorization_Decision_Claim_Revocation_and_Verification_Contract_v1.0.md";
const ACCEPTANCE =
  "docs/milestones/milestone-17/FounderOS_Milestone_17_Acceptance_Criteria_v1.0.md";
const CHECKLIST =
  "docs/milestones/milestone-17/FounderOS_Milestone_17_Verification_Checklist_v1.0.md";
const SCHEMA = "packages/knowledge-schema/src/authorization.ts";
const SCHEMA_INDEX = "packages/knowledge-schema/src/index.ts";
const DOMAIN = "services/knowledge-engine/src/domain/execution-authorization.ts";
const AUTHORITY =
  "services/knowledge-engine/src/application/in-memory-execution-authorization-authority.ts";
const HARNESS =
  "services/knowledge-engine/src/application/disabled-execution-authorization-harness.ts";
const ENGINE_INDEX = "services/knowledge-engine/src/index.ts";
const RUNNER = "services/knowledge-engine/scripts/run-tests.mjs";
const SCHEMA_TEST = "packages/knowledge-schema/tests/authorization.test.ts";
const DOMAIN_TEST = "services/knowledge-engine/tests/execution-authorization.test.ts";
const AUTHORITY_TEST =
  "services/knowledge-engine/tests/in-memory-execution-authorization-authority.test.ts";
const HARNESS_TEST =
  "services/knowledge-engine/tests/disabled-execution-authorization-harness.test.ts";
const TRACEABILITY_TEST =
  "services/knowledge-engine/tests/milestone-17-documentation-traceability.test.ts";

function schemaPublicSymbols(...symbols: readonly string[]) {
  return [{ sourcePath: SCHEMA, facadePath: SCHEMA_INDEX, symbols }];
}

function domainPublicSymbols(...symbols: readonly string[]) {
  return [{ sourcePath: DOMAIN, facadePath: ENGINE_INDEX, symbols }];
}

function authorityPublicSymbols(...symbols: readonly string[]) {
  return [{ sourcePath: AUTHORITY, facadePath: ENGINE_INDEX, symbols }];
}

function harnessPublicSymbols(...symbols: readonly string[]) {
  return [{ sourcePath: HARNESS, facadePath: ENGINE_INDEX, symbols }];
}

export const MILESTONE_17_ACCEPTANCE_TRACEABILITY = [
  {
    id: "M17-AC-001",
    contractPaths: [IDENTITY_CONTRACT, REQUEST_CONTRACT, DECISION_CONTRACT],
    implementation: [
      {
        path: SCHEMA,
        anchors: [
          "VerifiedServiceIdentityEvidenceSchema",
          "HumanExecutionApprovalEvidenceSchema",
          "ExecutionAuthorizationRequestSchema",
          "ExecutionAuthorizationDecisionSchema",
          "ExecutionAuthorizationClaimSchema",
        ],
      },
    ],
    publicSymbols: schemaPublicSymbols(
      "VerifiedServiceIdentityEvidenceSchema",
      "HumanExecutionApprovalEvidenceSchema",
      "ExecutionAuthorizationRequestSchema",
      "ExecutionAuthorizationDecisionSchema",
      "ExecutionAuthorizationClaimSchema",
    ),
    tests: [{ path: SCHEMA_TEST, cases: ["accepts the complete canonical contract family"] }],
  },
  {
    id: "M17-AC-002",
    contractPaths: [DESIGN, SPECIFICATION],
    implementation: [
      {
        path: DOMAIN,
        anchors: ["createExecutionAuthorizationRequest", "createExecutionAuthorizationDecision"],
      },
    ],
    publicSymbols: domainPublicSymbols(
      "createExecutionAuthorizationRequest",
      "createExecutionAuthorizationDecision",
    ),
    tests: [{ path: DOMAIN_TEST, cases: ["creates deterministic domain-separated fingerprints"] }],
  },
  {
    id: "M17-AC-003",
    contractPaths: [IDENTITY_CONTRACT, DECISION_CONTRACT],
    implementation: [
      {
        path: DOMAIN,
        anchors: ["verifyExecutionAuthorizationDecision", "verifyExecutionAuthorizationClaim"],
      },
    ],
    publicSymbols: domainPublicSymbols(
      "verifyExecutionAuthorizationDecision",
      "verifyExecutionAuthorizationClaim",
    ),
    tests: [
      {
        path: DOMAIN_TEST,
        cases: [
          "rejects tampering with a sanitized result",
          "rejects construction and verification for %s with a foreign outcome marker",
        ],
      },
    ],
  },
  {
    id: "M17-AC-004",
    contractPaths: [DESIGN, SPECIFICATION],
    implementation: [
      { path: DOMAIN, anchors: ["createFingerprintedArtifact"] },
      { path: HARNESS, anchors: ["runDisabledExecutionAuthorizationHarness"] },
    ],
    publicSymbols: [
      ...domainPublicSymbols("createExecutionAuthorizationRequest"),
      ...harnessPublicSymbols("runDisabledExecutionAuthorizationHarness"),
    ],
    tests: [
      {
        path: SCHEMA_TEST,
        cases: ["rejects unknown, symbolic, inherited, accessor-backed, and unsafe data"],
      },
      { path: DOMAIN_TEST, cases: ["rejects an accessor before reading it"] },
      {
        path: HARNESS_TEST,
        cases: ["rejects unknown capabilities and accessors before reading them"],
      },
    ],
  },
  {
    id: "M17-AC-005",
    contractPaths: [DESIGN, SPECIFICATION],
    implementation: [
      {
        path: AUTHORITY,
        anchors: [
          "InMemoryExecutionAuthorizationAuthorityConfiguration",
          "createInMemoryExecutionAuthorizationAuthority",
        ],
      },
    ],
    publicSymbols: authorityPublicSymbols(
      "InMemoryExecutionAuthorizationAuthorityConfiguration",
      "createInMemoryExecutionAuthorizationAuthority",
    ),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: ["rejects unknown authority configuration and freezes its narrow facade"],
      },
    ],
  },
  {
    id: "M17-AC-006",
    contractPaths: [SPECIFICATION, DECISION_CONTRACT],
    implementation: [{ path: AUTHORITY, anchors: ["issueDecision"] }],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: ["issues one exact allowed-unclaimed decision and replays it idempotently"],
      },
    ],
  },
  {
    id: "M17-AC-007",
    contractPaths: [SPECIFICATION, IDENTITY_CONTRACT, REQUEST_CONTRACT, DECISION_CONTRACT],
    implementation: [{ path: AUTHORITY, anchors: ["issueDecision"] }],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: [
          "materializes a %s approval as a non-claimable decision",
          "materializes inactive, expired, and revoked evidence as exact non-claimable decisions",
        ],
      },
    ],
  },
  {
    id: "M17-AC-008",
    contractPaths: [DESIGN, REQUEST_CONTRACT],
    implementation: [{ path: AUTHORITY, anchors: ["issueDecision"] }],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: ["denies mismatched identity, approval, and captured policy bindings"],
      },
    ],
  },
  {
    id: "M17-AC-009",
    contractPaths: [DESIGN, SPECIFICATION],
    implementation: [{ path: AUTHORITY, anchors: ["requestIdentities", "attemptIdentities"] }],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: [
          "issues one exact allowed-unclaimed decision and replays it idempotently",
          "fails closed for tampered evidence and conflicting identity reuse",
        ],
      },
    ],
  },
  {
    id: "M17-AC-010",
    contractPaths: [DESIGN, DECISION_CONTRACT],
    implementation: [{ path: AUTHORITY, anchors: ["claimDecision", "claimSequence"] }],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: [
          "allows exactly one concurrent claim and permanently binds the exact attempt",
          "gives permanent claim identity conflicts precedence over mutable authorization state",
        ],
      },
    ],
  },
  {
    id: "M17-AC-011",
    contractPaths: [DESIGN, DECISION_CONTRACT],
    implementation: [{ path: AUTHORITY, anchors: ["claimDecision"] }],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: ["allows exactly one concurrent claim and permanently binds the exact attempt"],
      },
    ],
  },
  {
    id: "M17-AC-012",
    contractPaths: [DESIGN, DECISION_CONTRACT],
    implementation: [{ path: AUTHORITY, anchors: ["claimDecision"] }],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: [
          "allows exactly one concurrent claim and permanently binds the exact attempt",
          "gives permanent claim identity conflicts precedence over mutable authorization state",
        ],
      },
    ],
  },
  {
    id: "M17-AC-013",
    contractPaths: [DESIGN, DECISION_CONTRACT],
    implementation: [{ path: AUTHORITY, anchors: ["inspectDecision"] }],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: ["keeps claim ownership after modeled downstream failures"],
      },
    ],
  },
  {
    id: "M17-AC-014",
    contractPaths: [DESIGN, DECISION_CONTRACT],
    implementation: [{ path: AUTHORITY, anchors: ["revokeDecision"] }],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: [
          "applies monotonic revocation without reopening a claim",
          "rejects an unauthorized revocation authority and invalid limit configuration",
        ],
      },
    ],
  },
  {
    id: "M17-AC-015",
    contractPaths: [SPECIFICATION, DECISION_CONTRACT],
    implementation: [{ path: AUTHORITY, anchors: ["revokeDecision", "inspectDecision"] }],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      { path: AUTHORITY_TEST, cases: ["applies monotonic revocation without reopening a claim"] },
    ],
  },
  {
    id: "M17-AC-016",
    contractPaths: [SPECIFICATION, DECISION_CONTRACT],
    implementation: [
      {
        path: AUTHORITY,
        anchors: [
          "claimDecision",
          "claimIdentities",
          "claimSequence",
          "inspectDecision",
          "verifyDecision",
          "verifyClaim",
        ],
      },
    ],
    publicSymbols: authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
    tests: [
      {
        path: AUTHORITY_TEST,
        cases: [
          "verifies only registered exact decisions and claims at the supplied time",
          "normalizes unexpected internal faults without exposing exception details",
          "publishes claim sequence and ownership only after all fallible claim work succeeds",
        ],
      },
      { path: DOMAIN_TEST, cases: ["returns deeply immutable defensive artifacts"] },
    ],
  },
  {
    id: "M17-AC-017",
    contractPaths: [PLAN, SPECIFICATION, ACCEPTANCE],
    implementation: [{ path: HARNESS, anchors: ["runDisabledExecutionAuthorizationHarness"] }],
    publicSymbols: harnessPublicSymbols("runDisabledExecutionAuthorizationHarness"),
    tests: [
      {
        path: HARNESS_TEST,
        cases: [
          "deterministically verifies the non-production authorization foundation",
          "fails closed when the deterministic revocation sequence is invalid",
        ],
      },
    ],
  },
  {
    id: "M17-AC-018",
    contractPaths: [PLAN, SPECIFICATION, ACCEPTANCE],
    implementation: [
      { path: HARNESS, anchors: ["runDisabledExecutionAuthorizationHarness"] },
      {
        path: "services/knowledge-engine/tests/support/milestone-17-module-closure.ts",
        anchors: [
          "collectTransitiveTypeScriptModuleClosure",
          "findMilestone17CapabilityViolations",
        ],
      },
    ],
    publicSymbols: harnessPublicSymbols("runDisabledExecutionAuthorizationHarness"),
    tests: [
      {
        path: HARNESS_TEST,
        cases: [
          "never invokes fetch or reports live readiness",
          "keeps the authorization implementation import closure free of execution capabilities",
          "detects the %s capability-closure bypass",
        ],
      },
    ],
  },
  {
    id: "M17-AC-019",
    contractPaths: [ACCEPTANCE, CHECKLIST],
    implementation: [{ path: RUNNER, anchors: ["runKnowledgeEngineTests"] }],
    verification: [
      {
        path: "package.json",
        packageScripts: [
          "format:check",
          "lint",
          "build",
          "typecheck",
          "test",
          "verify:m15-predecessor-bound",
        ],
      },
      { path: RUNNER, anchors: ["runKnowledgeEngineTests", "requireInventory"] },
    ],
  },
  {
    id: "M17-AC-020",
    contractPaths: [PLAN, ACCEPTANCE, CHECKLIST],
    implementation: [
      {
        path: TRACEABILITY_TEST,
        anchors: ["structuralAnchorNames", "facadeExportsSymbol", "registeredTestCaseNames"],
      },
    ],
    publicSymbols: [
      ...authorityPublicSymbols("createInMemoryExecutionAuthorizationAuthority"),
      ...harnessPublicSymbols("runDisabledExecutionAuthorizationHarness"),
    ],
    tests: [
      {
        path: TRACEABILITY_TEST,
        cases: [
          "enforces an exact acceptance-to-contract-to-symbol-to-test mapping",
          "states the non-production and no-execution boundary without placeholders",
        ],
      },
    ],
  },
] as const satisfies readonly Milestone17AcceptanceTraceabilityRow[];
