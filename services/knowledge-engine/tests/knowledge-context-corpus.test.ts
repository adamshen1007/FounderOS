import { resolve } from "node:path";

import type {
  DurableSnapshotRegistrationRecord,
  KnowledgeContextRequest,
  KnowledgeObject,
  RegistryIntegrityResult,
  RegistryRecoveryResult,
} from "@founderos/knowledge-schema";
import { beforeAll, describe, expect, it } from "vitest";

import { initializeCorpusKnowledgeRepository } from "../src/index.js";
import {
  assembleKnowledgeContextFromVerifiedInputs,
  verifyKnowledgeContextPackage,
  type VerifiedKnowledgeContextInputs,
} from "../src/domain/knowledge-context.js";
import {
  createCanonicalSha256Fingerprint,
  serializeCanonicalValue,
} from "../src/domain/canonical-fingerprint.js";
import {
  appendAdapterRegistration,
  createAdapterChainBuilder,
} from "./durable-registry-adapter-fixtures.js";
import {
  MILESTONE_10_CONTEXT_BEHAVIOR_EVALUATIONS,
  PRIORITY_ONE_CONTEXT_EVALUATIONS,
} from "./fixtures/context-evaluations.js";

describe("Priority 1 governed context evaluations", () => {
  let candidates: readonly KnowledgeObject[];
  let bindings: VerifiedKnowledgeContextInputs;

  beforeAll(async () => {
    const rootPath = resolve(import.meta.dirname, "../../..");
    const initialized = await initializeCorpusKnowledgeRepository({
      rootPath,
      manifestPath: "knowledge/migration-manifest.yaml",
      corpusVersion: "priority-1-v1",
      createdAt: "2026-07-28T00:00:00Z",
      createdBy: "milestone-10-evaluation",
    });
    candidates = await initialized.repository.getCandidates();
    const chain = createAdapterChainBuilder();
    const registration = appendAdapterRegistration(
      chain,
      initialized.snapshot,
      "milestone-10-evaluation",
    ).records[0] as DurableSnapshotRegistrationRecord;
    const integrityFingerprint = createCanonicalSha256Fingerprint({
      activeSnapshotId: initialized.snapshot.snapshotId,
      purpose: "milestone-10-evaluation",
    });
    const integrity: RegistryIntegrityResult = {
      schemaVersion: "1.0",
      status: "valid",
      integrityFingerprint,
      verifiedTransactionCount: 1,
      verifiedRecordCount: 1,
      verifiedThroughSequence: 1,
      lastRecordFingerprint: registration.recordFingerprint,
      derivedIndexStatus: "not_checked",
      derivedIndexIssues: [],
      issues: [],
    };
    const recovery: RegistryRecoveryResult = {
      schemaVersion: "1.0",
      status: "recovered",
      activeSnapshotId: initialized.snapshot.snapshotId,
      registeredSnapshotCount: 1,
      lifecycleTransitionCount: 0,
      decisionCount: 0,
      activationCount: 0,
      committedTransactionCount: 1,
      committedRecordCount: 1,
      lastCommittedAuditSequence: 1,
      lastRecordFingerprint: registration.recordFingerprint,
      derivedIndexStatus: "not_checked",
      derivedIndexIssues: [],
      integrityFingerprint,
      errors: [],
    };
    bindings = {
      registration,
      integrity,
      recovery,
      repositorySnapshot: initialized.snapshot,
    };
  });

  for (const evaluation of PRIORITY_ONE_CONTEXT_EVALUATIONS) {
    it(`assembles and verifies ${evaluation.name}`, () => {
      const result = assembleKnowledgeContextFromVerifiedInputs({
        request: evaluation.request,
        candidateInputs: candidates,
        bindings,
      });
      expect(result.status).toBe("assembled");
      if (result.status !== "assembled") throw new Error("Expected assembled context");
      expect(result.package.included.map((entry) => entry.objectId).sort()).toEqual(
        [...evaluation.expectedIncludedIds].sort(),
      );
      expect(
        verifyKnowledgeContextPackage({
          package: result.package,
          candidateInputs: candidates,
          bindings,
        }),
      ).toMatchObject({ status: "valid" });
    });
  }

  for (const evaluation of MILESTONE_10_CONTEXT_BEHAVIOR_EVALUATIONS) {
    it(`executes behavior fixture: ${evaluation.name}`, () => {
      const request = behaviorRequest(evaluation.requestMode, evaluation.name, candidates);
      applyBudgetMode(request, evaluation.budgetMode, candidates);
      const candidateInputs = mutateCandidates(candidates, evaluation.candidateMutation);
      const scenarioBindings = mutateBindings(bindings, evaluation.bindingMutation);
      const result = assembleKnowledgeContextFromVerifiedInputs({
        request,
        candidateInputs,
        bindings: scenarioBindings,
      });

      if (evaluation.packageMutation !== undefined) {
        expect(result.status).toBe("assembled");
        if (result.status !== "assembled") throw new Error("Expected package for tampering");
        const tampered = structuredClone(result.package);
        if (evaluation.packageMutation === "content") tampered.included[0]!.canonicalContent += "x";
        if (evaluation.packageMutation === "omission")
          tampered.omitted[0]!.policyRule = "per_object_character_limit";
        if (evaluation.packageMutation === "timestamp")
          tampered.assembledAt = "2026-07-29T12:00:00Z";
        expect(
          verifyKnowledgeContextPackage({
            package: tampered,
            candidateInputs,
            bindings: scenarioBindings,
          }).status,
        ).toBe(evaluation.expected.status);
        return;
      }

      expect(result.status).toBe(evaluation.expected.status);
      if (result.status === "insufficient_context") {
        expect(result.issues[0]?.code).toBe(evaluation.expected.issueCode);
        return;
      }
      if (result.status !== "assembled") return;
      if (evaluation.expected.includedIds !== undefined)
        expect(result.package.included.map((entry) => entry.objectId).sort()).toEqual(
          [...evaluation.expected.includedIds].sort(),
        );
      if (evaluation.expected.omittedReason !== undefined)
        expect(result.package.omitted).toContainEqual(
          expect.objectContaining({ reason: evaluation.expected.omittedReason }),
        );
      if (evaluation.expected.truncated === true) expect(result.package.truncations.length).toBe(1);
      expect(
        verifyKnowledgeContextPackage({
          package: result.package,
          candidateInputs,
          bindings: scenarioBindings,
        }).status,
      ).toBe("valid");
      if (evaluation.candidateMutation === "reverse") {
        const baseline = assembleKnowledgeContextFromVerifiedInputs({
          request,
          candidateInputs: candidates,
          bindings: scenarioBindings,
        });
        expect(baseline.status).toBe("assembled");
        if (baseline.status === "assembled")
          expect(result.package.contextFingerprint).toBe(baseline.package.contextFingerprint);
      }
    });
  }
});

function behaviorRequest(
  mode: (typeof MILESTONE_10_CONTEXT_BEHAVIOR_EVALUATIONS)[number]["requestMode"],
  name: string,
  candidates: readonly KnowledgeObject[],
): KnowledgeContextRequest {
  const presetIndex = mode === "governance" ? 0 : mode === "architecture" ? 1 : 2;
  if (mode === "governance" || mode === "architecture" || mode === "decision")
    return structuredClone(PRIORITY_ONE_CONTEXT_EVALUATIONS[presetIndex]!.request);
  const base = structuredClone(PRIORITY_ONE_CONTEXT_EVALUATIONS[0]!.request);
  base.requestId = `behavior-${name.replaceAll(" ", "-")}`;
  base.query.queryId = `query-${base.requestId}`;
  base.query.filters = { tagMatch: "all" };
  base.requiredObjectIds = [];
  base.requiredObjectTypes = [];
  base.budget.emptyContextBehavior = mode === "empty_allow" ? "allow" : "fail";
  if (mode === "empty_allow" || mode === "empty_fail")
    base.query.filters = { tagMatch: "all", tags: ["no-match"] };
  if (mode === "missing_id") base.requiredObjectIds = ["missing-required-object"];
  if (mode === "missing_type") base.requiredObjectTypes = ["decision"];
  if (mode === "all" && candidates.length === 0) throw new Error("Expected Priority 1 candidates");
  return base;
}

function applyBudgetMode(
  request: KnowledgeContextRequest,
  mode: (typeof MILESTONE_10_CONTEXT_BEHAVIOR_EVALUATIONS)[number]["budgetMode"],
  candidates: readonly KnowledgeObject[],
): void {
  if (mode === undefined) return;
  const firstId = [...candidates].sort((left, right) =>
    left.metadata.id < right.metadata.id ? -1 : left.metadata.id > right.metadata.id ? 1 : 0,
  )[0]!.metadata.id;
  const totalCharacters = candidates.reduce(
    (sum, candidate) => sum + Array.from(serializeCanonicalValue(candidate)).length,
    0,
  );
  if (mode === "exact_object") request.budget.maxObjectCount = candidates.length;
  if (mode === "omit_optional") request.budget.maxObjectCount = 1;
  if (mode === "exact_character") request.budget.maxCanonicalCharacters = totalCharacters;
  if (mode === "optional_total_over") {
    request.budget.maxCanonicalCharacters = 1;
    request.budget.emptyContextBehavior = "allow";
  }
  if (mode === "optional_per_object_over") {
    request.budget.perObjectCharacterLimit = 1;
    request.budget.emptyContextBehavior = "allow";
  }
  if (mode === "required_over" || mode === "truncate") {
    request.requiredObjectIds = [firstId];
    request.budget.maxObjectCount = 1;
    request.budget.maxCanonicalCharacters = 10;
    request.budget.perObjectCharacterLimit = 10;
    request.budget.allowTruncation = mode === "truncate";
  }
}

function mutateCandidates(
  candidates: readonly KnowledgeObject[],
  mutation: (typeof MILESTONE_10_CONTEXT_BEHAVIOR_EVALUATIONS)[number]["candidateMutation"],
): readonly KnowledgeObject[] {
  if (mutation === "reverse") return [...candidates].reverse();
  if (mutation === "equivalent_duplicate") return [...candidates, structuredClone(candidates[0]!)];
  if (mutation === "conflicting_duplicate") {
    const conflict = structuredClone(candidates[0]!);
    if (!("content" in conflict)) throw new Error("Expected knowledge fixture");
    conflict.content += " conflicting";
    return [...candidates, conflict];
  }
  return candidates;
}

function mutateBindings(
  bindings: VerifiedKnowledgeContextInputs,
  mutation: (typeof MILESTONE_10_CONTEXT_BEHAVIOR_EVALUATIONS)[number]["bindingMutation"],
): VerifiedKnowledgeContextInputs {
  if (mutation === "active_mismatch")
    return {
      ...bindings,
      recovery: { ...bindings.recovery, activeSnapshotId: "snapshot-mismatch" },
    } as VerifiedKnowledgeContextInputs;
  if (mutation === "corrupt_integrity")
    return {
      ...bindings,
      integrity: {
        ...bindings.integrity,
        status: "invalid",
        integrityFingerprint: null,
        issues: [
          {
            code: "record_fingerprint_mismatch",
            message: "corrupt",
            transactionId: null,
            recordId: null,
            sequence: 1,
          },
        ],
      },
    };
  if (mutation === "forged_repository")
    return {
      ...bindings,
      repositorySnapshot: { ...bindings.repositorySnapshot, corpusVersion: "forged-version" },
    };
  return bindings;
}
