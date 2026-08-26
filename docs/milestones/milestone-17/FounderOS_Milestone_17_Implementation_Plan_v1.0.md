# FounderOS Milestone 17 Authorization Decision Authority Implementation Plan v1.0

> **Execution rule:** Follow this plan test-first, one task at a time. Publication actions are
> excluded until the user gives separate authorization.

## Goal

Implement a provider-neutral, process-local Authorization Decision authority that proves exact
service-identity and human-approval binding, deterministic decision issuance, permanent atomic
claim ownership, revocation, inspection, and independent verification without credentials,
provider mapping, transport, persistence, or production enablement.

## Architecture

`@founderos/knowledge-schema` will own strict, versioned, storage-independent data contracts.
`@founderos/knowledge-engine` will own deterministic evaluation and a factory-created in-memory
authority whose private registry linearizes issuance, claim, and revocation. A separate disabled
harness will exercise the authority without accepting callbacks or any I/O capability. Existing
Milestone 14 readiness evidence remains unchanged and is not treated as Milestone 17 execution
authorization.

## Tech Stack

- TypeScript 6 in strict ESM mode
- Zod 4 contracts
- Vitest 4 tests
- Existing canonical JSON and SHA-256 helpers
- Existing exact-own-data-descriptor and deep-immutability patterns
- pnpm 11 workspace scripts

## Global Constraints

- Preserve the dependency direction: schema contracts -> knowledge-engine behavior.
- Do not alter the semantics of `AuthorizationDecisionEvidenceSchema` in
  `provider-readiness.ts`; it remains readiness-only evidence.
- Do not add dependencies, databases, durable storage, distributed coordination, identity
  providers, credential resolution, secret reads, provider SDKs, mapping, transport, network
  access, Agents, Hermes, MCP, UI, deployment, release, or Milestone 18 behavior.
- No ambient clock reads may affect a fingerprinted artifact. Operation time is explicit data.
- Authorization binds the accepted Milestone 16 fixed processing tier `default`; omission,
  `auto`, or substitution fails before authority-state access.
- All public inputs are captured and shape-checked before protected property access.
- All public outputs are strict, canonical, sanitized, and deeply immutable defensive copies.
- A successful claim is permanent. No downstream outcome can reopen it.
- The only successful state transition is
  `allowed-unclaimed -> claimed-by-exact-attempt`.
- New tests must not modify the frozen Milestone 15 predecessor inventory. Update only the current
  knowledge-engine ordinary-suite inventory after observing the final Vitest count.
- Commit, push, pull request, merge, deployment, release, credential action, live execution, and
  Milestone 18 work require separate authorization and are not execution steps in this plan.

## Public Contract Outline

The implementation will use a dedicated `authorization.ts` module and the prefix
`ExecutionAuthorization` to prevent collision with Milestone 14 readiness evidence.

### Shared evidence and request contracts

```ts
type ExecutionAuthorizationOutcome = "allowed" | "denied" | "review-required";
type ExecutionAuthorizationDecisionState = "allowed-unclaimed" | "not-claimable";
type ExecutionAuthorizationClaimState = "claimed-by-exact-attempt";

interface VerifiedServiceIdentityEvidence {
  schemaVersion: "1.0";
  serviceIdentityEvidenceId: string;
  subjectReference: string;
  workloadIdentityReference: string;
  issuerReference: string;
  assuranceProfileReference: string;
  environmentClass: CredentialEnvironmentClass;
  audienceReference: string;
  issuedAt: string;
  notBefore: string;
  expiresAt: string;
  revocationVersion: number;
  revocationState: "active" | "revoked";
  issuerProofReference: string;
  evidenceFingerprint: string;
}

interface HumanExecutionApprovalEvidence {
  schemaVersion: "1.0";
  approvalEvidenceId: string;
  approverReference: string;
  approvalAuthorityReference: string;
  authorizationRequestId: string;
  authorizationRequestFingerprint: string;
  purpose: string;
  operation: "founder-decision-memo";
  environmentClass: CredentialEnvironmentClass;
  maximumDataClassification: ContextDeliveryDataClassification;
  approvedLimits: ExecutionAuthorizationLimits;
  issuedAt: string;
  expiresAt: string;
  outcome: ExecutionAuthorizationOutcome;
  reasonCodes: HumanExecutionApprovalReasonCode[];
  proofReference: string;
  evidenceFingerprint: string;
}

interface ExecutionAuthorizationRequest {
  schemaVersion: "1.0";
  authorizationRequestId: string;
  executionAttemptId: string;
  executionAttemptFingerprint: string;
  subjectReference: string;
  consumerId: string;
  consumerDescriptorFingerprint: string;
  deliveryTransactionId: string;
  deliveryTransactionFingerprint: string;
  contextPackageId: string;
  contextPackageFingerprint: string;
  invocationRequestId: string;
  invocationRequestFingerprint: string;
  adapterId: string;
  adapterFingerprint: string;
  providerFamilyReference: string;
  operation: "founder-decision-memo";
  processingTier: "default";
  modelPolicyReference: string;
  modelPolicyFingerprint: string;
  executionInstructionProfileReference: string;
  executionInstructionProfileFingerprint: string;
  credentialReferenceId: string;
  credentialReferenceFingerprint: string;
  credentialRotationVersion: string;
  environmentClass: CredentialEnvironmentClass;
  dataClassification: ContextDeliveryDataClassification;
  purpose: string;
  limits: ExecutionAuthorizationLimits;
  requestedAt: string;
  requestFingerprint: string;
}
```

`ExecutionAuthorizationLimits` is strict and uses positive safe integers for
`maximumInputBytes`, `maximumOutputBytes`, `maximumInputTokens`, `maximumOutputTokens`,
`timeoutMilliseconds`, `maximumAttempts`, `maximumRequestsPerMinute`,
`maximumConcurrentRequests`, and `maximumCostMinorUnits`, plus an ISO-4217 `currencyCode`.

### Decision and claim contracts

```ts
interface ExecutionAuthorizationDecision {
  schemaVersion: "1.0";
  authorizationDecisionId: string;
  decisionAuthorityReference: string;
  serviceIdentityEvidenceId: string;
  serviceIdentityEvidenceFingerprint: string;
  humanApprovalEvidenceId: string;
  humanApprovalEvidenceFingerprint: string;
  authorizationRequest: ExecutionAuthorizationRequest;
  outcome: ExecutionAuthorizationOutcome;
  state: ExecutionAuthorizationDecisionState;
  reasonCodes: ExecutionAuthorizationDecisionReasonCode[];
  issuedAt: string;
  expiresAt: string;
  revocationVersion: number;
  issuerProofReference: string;
  decisionFingerprint: string;
}

interface ExecutionAuthorizationClaim {
  schemaVersion: "1.0";
  authorizationClaimId: string;
  authorizationDecisionId: string;
  decisionFingerprint: string;
  executionAttemptId: string;
  executionAttemptFingerprint: string;
  state: "claimed-by-exact-attempt";
  claimedAt: string;
  claimSequence: number;
  decisionAuthorityReference: string;
  claimFingerprint: string;
}
```

Issuance, claim, inspection, revocation, and verification use strict discriminated unions with a
`status` discriminator and closed reason-code enums. Failure variants expose only IDs and safe
reason codes needed to correlate the operation; they never carry raw exceptions or rejected
payloads. Each public operation has an outer normalization boundary; inspection and verification
have explicit schema-valid internal-integrity results. Denied and review-required Decisions require
at least one binding or policy reason in addition to their matching outcome marker.

## Task 1: Add strict shared authorization contracts

**Files:**

- Create: `packages/knowledge-schema/src/authorization.ts`
- Create: `packages/knowledge-schema/tests/authorization.test.ts`
- Modify: `packages/knowledge-schema/src/index.ts`

### RED

1. Add tests that import the new schemas from the package facade and construct canonical fixtures.
2. Assert successful parsing for every public contract and result-union variant.
3. Assert rejection of:
   - unknown keys, symbol keys, inherited values, accessors, and non-plain prototypes;
   - unsafe text, paths, URLs, headers, credential-like values, and non-finite numbers;
   - unsorted or duplicate reason codes;
   - invalid chronology and inconsistent outcome/state/reason combinations;
   - approval request ID/fingerprint mismatch;
   - decision/request and claim/attempt binding mismatch;
   - invalid fingerprints and non-canonical data.
4. Run:

   ```bash
   pnpm --filter @founderos/knowledge-schema exec vitest run tests/authorization.test.ts
   ```

   Expected: failure because the authorization facade does not exist.

### GREEN

1. Implement strict Zod schemas and inferred types in `authorization.ts`.
2. Reuse exported primitives such as SHA-256, temporal, classification, and credential-environment
   schemas without broad refactoring.
3. Add module-local semantic refinements for chronology, sorted uniqueness, outcome/state
   coherence, and exact nested binding.
4. Export the module from `packages/knowledge-schema/src/index.ts`.
5. Rerun the focused test and package typecheck:

   ```bash
   pnpm --filter @founderos/knowledge-schema exec vitest run tests/authorization.test.ts
   pnpm --filter @founderos/knowledge-schema typecheck
   ```

   Expected: pass.

### Checkpoint

Review only the three Task 1 files. Do not commit without separate authorization.

## Task 2: Add canonical artifact construction and verification

**Files:**

- Create: `services/knowledge-engine/src/domain/execution-authorization.ts`
- Create: `services/knowledge-engine/tests/execution-authorization.test.ts`
- Modify: `services/knowledge-engine/src/index.ts`

### RED

1. Add tests for public domain functions:

   ```ts
   createExecutionAuthorizationRequest(input);
   createVerifiedServiceIdentityEvidence(input);
   createHumanExecutionApprovalEvidence(input);
   createExecutionAuthorizationDecision(input);
   createExecutionAuthorizationClaim(input);
   verifyExecutionAuthorizationRequest(value);
   verifyVerifiedServiceIdentityEvidence(value);
   verifyHumanExecutionApprovalEvidence(value);
   verifyExecutionAuthorizationDecision(value);
   verifyExecutionAuthorizationClaim(value);
   ```

2. Prove deterministic domain-separated fingerprints, canonical round trips, tamper rejection,
   sanitized failures, and defensive immutability.
3. Prove that accessor-backed or hidden input fails before getter access.
4. Run the focused engine test directly, bypassing the not-yet-updated aggregate inventory:

   ```bash
   pnpm --filter @founderos/knowledge-engine exec vitest run tests/execution-authorization.test.ts --maxWorkers=1
   ```

   Expected: failure because the domain module does not exist.

### GREEN

1. Implement constructors with explicit fingerprint omissions and existing canonical SHA-256
   helpers.
2. Validate complete wrappers with `captureExactOwnEnumerableDataDescriptors` before reading
   values.
3. Normalize all public failures to closed verification results; never return Zod issues or raw
   exception messages.
4. Deep-freeze structured defensive copies.
5. Export only intended public functions and types through the knowledge-engine facade.
6. Rerun focused tests and engine typecheck; expect pass.

### Checkpoint

Review fingerprint domain separation and every omitted fingerprint field. Do not commit.

## Task 3: Implement the factory-created in-memory authority and issuance

**Files:**

- Create: `services/knowledge-engine/src/application/in-memory-execution-authorization-authority.ts`
- Create: `services/knowledge-engine/tests/in-memory-execution-authorization-authority.test.ts`
- Modify: `services/knowledge-engine/src/index.ts`

### Authority facade

```ts
interface InMemoryExecutionAuthorizationAuthority {
  issueDecision(
    input: IssueExecutionAuthorizationDecisionInput,
  ): ExecutionAuthorizationIssuanceResult;
  claimDecision(input: ClaimExecutionAuthorizationDecisionInput): ExecutionAuthorizationClaimResult;
  inspectDecision(
    input: InspectExecutionAuthorizationDecisionInput,
  ): ExecutionAuthorizationInspectionResult;
  revokeDecision(
    input: RevokeExecutionAuthorizationDecisionInput,
  ): ExecutionAuthorizationRevocationResult;
  verifyDecision(
    input: VerifyRegisteredExecutionAuthorizationDecisionInput,
  ): ExecutionAuthorizationVerificationResult;
  verifyClaim(
    input: VerifyRegisteredExecutionAuthorizationClaimInput,
  ): ExecutionAuthorizationVerificationResult;
}
```

The factory captures an immutable authority ID, Decision issuer-proof reference, exact Service
Identity evidence ID, workload and issuer-proof references, subject, Consumer, Delivery, Context,
Invocation, and Execution Attempt coordinates, approved assurance and audience bindings, maximum
TTL, environment, operation, fixed processing tier `default`, provider family, adapter, model
policy, instruction profile, credential reference, classification ceiling, and limit ceilings.
Each operation receives an explicit `evaluatedAt`, `claimedAt`, or `revokedAt` timestamp.

### RED

1. Test the authority construction boundary: reject unknown configuration and return a frozen
   narrow facade with exactly the documented operations.
2. Test exact valid issuance and deterministic duplicate replay returning the original immutable
   result.
3. Test conflicting request/decision ID reuse fails before verifier or registry effects.
4. Test independently verified identity and approval failures: invalid, inactive, not-yet-valid,
   expired, revoked, wrong evidence ID, workload identity, issuer proof, issuer, assurance,
   audience, subject, environment, operation, fixed processing tier, classification, request ID,
   request fingerprint, or limits.
5. Test all Delivery, Context, Invocation, Attempt, Adapter, provider-family, model-policy,
   instruction-profile, Credential Reference, rotation-version, and ceiling substitutions.
6. Test allowed, denied, and review-required outcomes. Only allowed produces
   `allowed-unclaimed`; the other outcomes are `not-claimable`.
7. Test that input rejection occurs before authority lookup or registry access using direct-module
   count seams that are not exported from the package facade.
8. Run the focused file; expect missing-module failure.

### GREEN

1. Implement a private registry keyed by permanently reserved request and decision IDs.
2. Capture and freeze configuration once; return an `Object.freeze`-protected narrow facade with
   no mutable registry or callback hooks.
3. Validate shape, canonical data, and direct artifact fingerprints before any authority-state
   lookup.
4. Compare all bindings canonically and apply deterministic closed reason codes.
5. Issue immutable decisions and preserve exact idempotent results in the private registry.
6. Rerun focused tests and engine typecheck; expect pass.

### Checkpoint

Review operation ordering, idempotency, and that no callback or mutable registry escaped. Do not
commit.

## Task 4: Implement atomic permanent claim and monotonic revocation

**Files:**

- Modify: `services/knowledge-engine/src/application/in-memory-execution-authorization-authority.ts`
- Modify: `services/knowledge-engine/tests/in-memory-execution-authorization-authority.test.ts`
- Modify: `services/knowledge-engine/tests/execution-authorization.test.ts`

### RED

1. Test one successful claimant from simultaneous `Promise.all` calls.
2. Test exact same-attempt idempotent retry returns the original claim only when the retry flag and
   all coordinates match.
3. Test conflicting same-attempt retry, another attempt, expired decision, revoked decision,
   denied decision, review-required decision, non-authoritative decision, and stale state fail
   closed.
4. Model cancellation, timeout, credential failure, final-gate failure, transport failure, and
   ambiguous execution after claim; prove none releases or replaces ownership.
5. Test revocation versions are positive and monotonic; stale/equal conflicting versions fail, and
   a higher version cannot regress time.
6. Test revocation before claim blocks claim, while revocation after claim cannot be backdated,
   leaves the permanent claim visible, and invalidates current authorization.
7. Test inspection returns defensive immutable copies and no registry handle.
8. Test independent decision and claim verification detects pre-claim evaluation, expiry,
   revocation, tampering, attempt substitution, and foreign representations.
9. Test permanently reserved claim-ID reuse with altered coordinates has conflict precedence over
   mutable claimability, revocation, and expiry state.
10. Fault-inject every public authority operation and prove it returns only the closed sanitized
    internal-integrity result without exception text or paths.
11. Run focused files; expect failures for missing transitions.

### GREEN

1. Linearize registry inspection and transition synchronously before any promise yield.
2. Calculate the next claim sequence tentatively, complete all fallible claim/result construction,
   and only then atomically publish the sequence, permanent claim, and claim identity.
3. Never implement release, reset, delete, or reopen operations.
4. Apply authority-owned monotonic revocation without mutating the original decision artifact.
5. Implement current-state inspection and verification as immutable result projections.
6. Rerun focused tests and typecheck; expect pass.

### Checkpoint

Search the authority for release/reset/delete/reopen paths and verify none exist. Do not commit.

## Task 5: Add the disabled deterministic evaluation harness

**Files:**

- Create: `services/knowledge-engine/src/application/disabled-execution-authorization-harness.ts`
- Create: `services/knowledge-engine/tests/disabled-execution-authorization-harness.test.ts`
- Modify: `services/knowledge-engine/src/index.ts`

### RED

1. Test the harness accepts one exact plain-data input and returns only:
   `authorization-foundation-verified`, `authorization-foundation-rejected`, or
   `authorization-foundation-review-required`.
2. Test complete valid issuance, claim, inspection, successful revocation N, stale/equal rejection,
   successful later N+1, post-revocation inspection, and verification scenarios.
3. Test unknown keys, symbols, accessors, inherited values, callbacks, filesystem paths, URLs,
   environment objects, clients, headers, raw credentials, and provider bodies are rejected before
   protected-value access.
4. Test deterministic results for identical fixtures and explicit timestamps.
5. Test recursive import closure using deny-by-default external-import and path/member reflection
   allowlists plus full-source SHA-256 binding for every approved non-static computed access or
   property name: every reachable local/workspace module permits only explicit safe imports,
   reflection members, and reviewed dynamic access from byte-identical sources and rejects static
   bracketed/destructured loaders, network, filesystem,
   child-process, provider SDK,
   credential-resolution, Agent, Hermes, or MCP modules, including literal or variable dynamic
   imports, direct or reflectively recovered dynamic-code constructors regardless of computed-key
   spelling, callable declaration, assignment, factory return, object membership, array
   destructuring or indexing, inline or named parameter carriage, inline or named identity-call
   propagation, conditional selection, class or built-in callable use, or binding, reflection-root
   aliasing through direct, array, or parameter coordinates, or reflection-member destructuring,
   aliased or indirect loaders, process aliases, bracketed network globals, Node subpaths,
   `node:http2`, and filesystem-capable built-ins.
6. Test the independent runtime witness: stub global `fetch` and prove the disabled harness never
   calls it. Filesystem and process/module-loader acquisition remain covered by the static closure
   proof, not by runtime instrumentation.
7. Run the focused file; expect missing-module failure.

### GREEN

1. Implement a narrow composition wrapper over the approved in-memory authority.
2. Hard-code disabled evaluation status; do not accept callbacks or authority replacements.
3. Return sanitized immutable summaries only.
4. Export the harness through the knowledge-engine facade.
5. Rerun focused tests and typecheck; expect pass.

### Checkpoint

Inspect the transitive imports and public keys. Do not commit.

## Task 6: Complete the Milestone 17 documentation and traceability set

**Files:**

- Create: `docs/milestones/milestone-17/FounderOS_Milestone_17_Authorization_Decision_Authority_Specification_v1.0.md`
- Create: `docs/milestones/milestone-17/FounderOS_Service_Identity_Evidence_Contract_v1.0.md`
- Create: `docs/milestones/milestone-17/FounderOS_Human_Approval_and_Authorization_Request_Contract_v1.0.md`
- Create: `docs/milestones/milestone-17/FounderOS_Authorization_Decision_Claim_Revocation_and_Verification_Contract_v1.0.md`
- Create: `docs/milestones/milestone-17/FounderOS_Milestone_17_Acceptance_Criteria_v1.0.md`
- Create: `docs/milestones/milestone-17/FounderOS_Milestone_17_Verification_Checklist_v1.0.md`
- Create: `docs/milestones/milestone-17/FounderOS_Milestone_17_Package_README_v1.0.md`
- Create: `services/knowledge-engine/tests/milestone-17-documentation-traceability.test.ts`
- Modify: `README.md`
- Modify: `DOCUMENTATION_INDEX.md`
- Modify: `ARCHITECTURE_DECISIONS.md`
- Modify: `CHANGELOG.md`

### RED

1. Add a traceability test that maps each acceptance criterion to exact contracts and structural
   implementation anchors. Map behavioral criteria to facade-proven public symbols and exact
   registered test names; map repository-gate criteria to their actual executable scripts and
   structural runner anchors instead of unrelated package symbols.
2. Assert document inventory, versions, cross-links, non-goals, command names, and package
   ownership.
3. Assert prohibited production-readiness claims and unfinished drafting markers are absent.
4. Run the traceability test; expect failure because the document set is incomplete.

### GREEN

1. Write the documents from implemented behavior only, preserving terminology from the approved
   design.
2. Record a new ADR entry for provider-neutral process-local authorization authority and explicitly
   distinguish it from readiness evidence and production authorization infrastructure.
3. Update README, documentation index, and changelog with exact implemented commands and scope.
4. Rerun the traceability test and Markdown formatting check; expect pass.

### Checkpoint

Cross-check every documented public type, reason code, command, and limitation against source. Do
not commit.

## Task 7: Reconcile current-suite inventory and run full verification

**Files:**

- Modify: `services/knowledge-engine/scripts/run-tests.mjs`
- Modify only if required by actual implementation: `package.json`

### RED

1. Run the existing engine package test command before changing its inventory:

   ```bash
   pnpm --filter @founderos/knowledge-engine test
   ```

   Expected: the new tests pass under Vitest but the explicit ordinary-suite inventory rejects the
   old file/test totals.

### GREEN

1. Run Vitest directly with the existing split and record observed passed file/test totals.
2. Update only the `processA` ordinary-suite expected file and test counts in
   `services/knowledge-engine/scripts/run-tests.mjs`; leave the isolated 73-scenario inventory and
   frozen predecessor verifier unchanged.
3. Run the package test command again and expect exact inventory success.
4. Run all required repository gates in this order:

   ```bash
   pnpm format:check
   pnpm lint
   pnpm build
   pnpm typecheck
   pnpm test
   pnpm verify:m15-predecessor-bound
   ```

5. Run repository safety reviews:

   ```bash
   git diff --check
   git status --short
   git diff --stat 9af9d4b519e3d41be5a551c72ad5a3e5cf0dd48e
   git diff --name-status 9af9d4b519e3d41be5a551c72ad5a3e5cf0dd48e
   git ls-files --others --exclude-standard
   rg -n "TO[D]O|TB[D]|FIXM[E]|PLACEHOLD[E]R|exampl[e][.]com|api[_-]?key|bearer|private[_-]?key" \
     packages/knowledge-schema/src/authorization.ts \
     services/knowledge-engine/src/domain/execution-authorization.ts \
     services/knowledge-engine/src/application/in-memory-execution-authorization-authority.ts \
     services/knowledge-engine/src/application/disabled-execution-authorization-harness.ts \
     docs/milestones/milestone-17
   ```

6. Review the complete worktree diff against base, including untracked files, for scope,
   architecture, security, error leakage, mutable aliases, test quality, and documentation truth.
7. Remediate all Critical, Important, and Minor findings, then rerun every affected gate and the
   whole-branch review.

### Completion evidence

Prepare a sanitized Milestone 17 candidate report containing:

- base and candidate Git identities;
- complete tracked and untracked file inventory;
- acceptance-criteria mapping;
- exact commands, exit codes, file counts, test counts, and relevant hashes;
- whole-branch findings and remediations;
- explicit non-goals and authorization boundaries;
- decision `GO — M17 COMMIT READY`, `NO-GO — M17 NOT COMMIT READY`, or
  `HUMAN DECISION REQUIRED` based only on reproduced evidence.

If an external reviewer is used, send only the sanitized report, diffs, tests, and non-sensitive
artifacts. Continue the review/remediation loop until it returns the exact permitted commit-ready
decision or a genuine human decision is required. Do not treat review approval as publication
authorization.

## Planned Acceptance Matrix

| Area                                | Primary implementation          | Primary proof                             |
| ----------------------------------- | ------------------------------- | ----------------------------------------- |
| Strict shared contracts             | `authorization.ts`              | schema contract tests                     |
| Canonical evidence and fingerprints | `execution-authorization.ts`    | domain tamper/immutability tests          |
| Exact issuance and idempotency      | in-memory authority             | authority issuance tests                  |
| Atomic permanent claim              | in-memory registry              | concurrent claim and no-release tests     |
| Expiry and revocation               | in-memory authority             | chronology and monotonic-revocation tests |
| Independent verification            | domain + authority verification | foreign/tamper/substitution tests         |
| Disabled/no-execution boundary      | disabled harness                | import-closure and fetch-spy tests        |
| Documentation traceability          | M17 document set                | M17 traceability test                     |
| Regression preservation             | existing suites                 | full gates and M15 predecessor-bound gate |

## Exit Criteria

Milestone 17 implementation is eligible for a commit-ready review only when:

1. Every planned acceptance criterion is mapped to implementation and passing tests.
2. All required repository gates and the predecessor-bound gate pass from the exact candidate.
3. The whole-branch review has no unresolved Critical, Important, or Minor findings.
4. The worktree contains no unrelated or secret-bearing changes.
5. The evidence report states that the authority is process-local, non-production, and incapable of
   credential access or provider execution.
6. No publication or next-milestone action has occurred.
