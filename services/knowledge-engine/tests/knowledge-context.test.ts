import type {
  DurableSnapshotRegistrationRecord,
  KnowledgeContextPackage,
  KnowledgeContextRequest,
  KnowledgeObject,
  RegistryIntegrityResult,
  RegistryRecoveryResult,
} from "@founderos/knowledge-schema";
import { KnowledgeContextPackageSchema } from "@founderos/knowledge-schema";
import { describe, expect, it } from "vitest";

import {
  assembleGovernedKnowledgeContext,
  createKnowledgeRepositorySnapshot,
  InMemoryKnowledgeCandidateSource,
  InMemoryKnowledgeRepository,
  type GovernedDurableSnapshotRegistry,
} from "../src/index.js";
import {
  createCanonicalSha256Fingerprint,
  serializeCanonicalValue,
} from "../src/domain/canonical-fingerprint.js";
import {
  createDurableAuditRecordFingerprint,
  createDurableSnapshotManifestFingerprint,
} from "../src/domain/durable-registry.js";
import {
  assembleKnowledgeContextFromVerifiedInputs,
  verifyKnowledgeContextPackage,
  type VerifiedKnowledgeContextInputs,
} from "../src/domain/knowledge-context.js";
import {
  appendAdapterRegistration,
  createAdapterChainBuilder,
} from "./durable-registry-adapter-fixtures.js";
import { generalKnowledgeObject } from "./snapshot-lifecycle-fixtures.js";

const INTEGRITY = createCanonicalSha256Fingerprint("registry-integrity");

function decisionObject(id: string): KnowledgeObject {
  return {
    metadata: {
      ...generalKnowledgeObject(id).metadata,
      objectType: "decision",
      importance: "critical",
    },
    context: "FounderOS architecture",
    problem: "Choose a governed context boundary",
    options: ["governed", "ungoverned"],
    chosenOption: "governed",
    reasoning: "Governance preserves auditability",
    expectedOutcome: "Reproducible context",
    risks: [],
    relatedProjectIds: ["FounderOS"],
    reviewDate: "2026-08-01",
    lessonsLearned: [],
  };
}

function fixture(content = "Architecture knowledge") {
  const objects: KnowledgeObject[] = [
    generalKnowledgeObject("architecture-a", content),
    decisionObject("decision-a"),
    generalKnowledgeObject("governance-a", "Governance knowledge"),
  ];
  const repositorySnapshot = createKnowledgeRepositorySnapshot({
    corpus: {
      schemaVersion: "1.0",
      corpusId: "founderos-priority-1",
      corpusVersion: "context-v1",
      sourceManifestReference: "knowledge/migration-manifest.yaml",
      source: {
        schemaVersion: "1.0",
        sourceId: "context-fixture",
        sourceType: "knowledge_corpus",
        provenance: {
          sourceType: "migration_manifest",
          sourceReference: "knowledge/migration-manifest.yaml",
        },
      },
    },
    creation: { createdAt: "2026-07-28T00:00:00Z", createdBy: "context-fixture" },
    documents: objects.map((object) => {
      const sourceHash = createCanonicalSha256Fingerprint(`source:${object.metadata.id}`);
      return {
        id: object.metadata.id,
        objectType: object.metadata.objectType,
        sourcePath: object.metadata.source.sourceReference!,
        destinationPath: `knowledge/${object.metadata.id}.md`,
        expectedSourceHash: sourceHash,
        actualSourceHash: sourceHash,
        migrationStatus: "ready" as const,
        reviewStatus: "approved" as const,
        byteLength: 1,
        object,
        status: "accepted" as const,
      };
    }),
  });
  const chain = createAdapterChainBuilder();
  const envelope = appendAdapterRegistration(chain, repositorySnapshot, "context");
  const registration = envelope.records[0] as DurableSnapshotRegistrationRecord;
  const integrity: RegistryIntegrityResult = {
    schemaVersion: "1.0",
    status: "valid",
    integrityFingerprint: INTEGRITY,
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
    activeSnapshotId: repositorySnapshot.snapshotId,
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
    integrityFingerprint: INTEGRITY,
    errors: [],
  };
  return {
    objects,
    bindings: {
      registration,
      integrity,
      recovery,
      repositorySnapshot,
    } satisfies VerifiedKnowledgeContextInputs,
  };
}

function request(overrides: Partial<KnowledgeContextRequest> = {}): KnowledgeContextRequest {
  return {
    schemaVersion: "1.0",
    requestId: "context-request",
    purpose: "Assemble FounderOS context",
    consumer: { consumerId: "context-service", consumerType: "service" },
    query: {
      schemaVersion: "1.0",
      queryId: "context-query",
      context: { consumerId: "context-service", consumerType: "service", constraints: {} },
      filters: { tagMatch: "all" },
    },
    requiredObjectIds: [],
    requiredObjectTypes: [],
    preferredObjectTypes: ["decision"],
    scope: {},
    assemblyPolicyVersion: "1.0",
    budget: {
      maxObjectCount: 3,
      maxCanonicalCharacters: 20_000,
      allowTruncation: false,
      requiredObjectFailureBehavior: "fail",
      emptyContextBehavior: "fail",
    },
    reason: "Provide deterministic governed knowledge",
    ...overrides,
  };
}

describe("governed knowledge context domain", () => {
  it("assembles byte-identical packages independent of candidate order", () => {
    const { objects, bindings } = fixture();
    const originalCandidates = structuredClone(objects);
    const first = assembleKnowledgeContextFromVerifiedInputs({
      request: request(),
      candidateInputs: objects,
      bindings,
    });
    const second = assembleKnowledgeContextFromVerifiedInputs({
      request: request(),
      candidateInputs: [...objects].reverse(),
      bindings,
    });
    expect(first.status).toBe("assembled");
    expect(second).toEqual(first);
    if (first.status !== "assembled") throw new Error("Expected assembled context");
    expect(first.package.included.map((entry) => entry.objectId)).toEqual([
      "decision-a",
      "architecture-a",
      "governance-a",
    ]);
    expect(first.package.contextPackageId).toBe(`context-${first.package.contextFingerprint}`);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.package.included[0])).toBe(true);
    expect(objects).toEqual(originalCandidates);
    expect(
      verifyKnowledgeContextPackage({ package: first.package, candidateInputs: objects, bindings }),
    ).toMatchObject({ status: "valid", contextFingerprint: first.package.contextFingerprint });
  });

  it("fails closed for missing required knowledge and forged active bindings", () => {
    const { objects, bindings } = fixture();
    const missing = assembleKnowledgeContextFromVerifiedInputs({
      request: request({ requiredObjectIds: ["missing"] }),
      candidateInputs: objects,
      bindings,
    });
    expect(missing).toMatchObject({
      status: "insufficient_context",
      issues: [{ code: "missing_required_object" }],
    });

    const mismatch: VerifiedKnowledgeContextInputs = {
      ...bindings,
      recovery: { ...bindings.recovery, activeSnapshotId: "snapshot-forged" },
    } as VerifiedKnowledgeContextInputs;
    expect(
      assembleKnowledgeContextFromVerifiedInputs({
        request: request(),
        candidateInputs: objects,
        bindings: mismatch,
      }),
    ).toMatchObject({
      status: "insufficient_context",
      issues: [{ code: "active_snapshot_mismatch" }],
    });
  });

  it("enforces object and character budgets with explicit omission evidence", () => {
    const { objects, bindings } = fixture();
    const result = assembleKnowledgeContextFromVerifiedInputs({
      request: request({ budget: { ...request().budget, maxObjectCount: 1 } }),
      candidateInputs: objects,
      bindings,
    });
    expect(result.status).toBe("assembled");
    if (result.status !== "assembled") throw new Error("Expected assembled context");
    expect(result.package.budgetUsage.usedObjectCount).toBe(1);
    expect(result.package.omitted).toHaveLength(2);
    expect(result.package.omitted.every((entry) => entry.reason === "max_object_count")).toBe(true);
    expect(JSON.stringify(result.package)).not.toContain("Governance knowledge");
    const contradictoryOmission = structuredClone(result.package);
    contradictoryOmission.omitted[0]!.policyRule = "per_object_character_limit";
    expect(KnowledgeContextPackageSchema.safeParse(contradictoryOmission).success).toBe(false);

    const firstContentCharacters = Array.from(
      serializeCanonicalValue(decisionObject("decision-a")),
    ).length;
    const exact = assembleKnowledgeContextFromVerifiedInputs({
      request: request({
        budget: {
          ...request().budget,
          maxObjectCount: 1,
          maxCanonicalCharacters: firstContentCharacters,
        },
      }),
      candidateInputs: objects,
      bindings,
    });
    expect(exact).toMatchObject({
      status: "assembled",
      package: {
        budgetUsage: {
          usedObjectCount: 1,
          usedCanonicalCharacters: firstContentCharacters,
        },
      },
    });

    for (const budget of [
      { ...request().budget, maxCanonicalCharacters: 1, emptyContextBehavior: "allow" as const },
      {
        ...request().budget,
        perObjectCharacterLimit: 1,
        emptyContextBehavior: "allow" as const,
      },
    ]) {
      expect(
        assembleKnowledgeContextFromVerifiedInputs({
          request: request({ budget }),
          candidateInputs: objects,
          bindings,
        }),
      ).toMatchObject({
        status: "insufficient_context",
        issues: [{ code: "context_over_budget" }],
      });
    }
  });

  it("fails instead of silently dropping required objects beyond either hard boundary", () => {
    const { objects, bindings } = fixture();
    const objectBoundary = assembleKnowledgeContextFromVerifiedInputs({
      request: request({
        requiredObjectIds: ["architecture-a", "governance-a"],
        preferredObjectTypes: [],
        budget: { ...request().budget, maxObjectCount: 1 },
      }),
      candidateInputs: objects,
      bindings,
    });
    expect(objectBoundary).toMatchObject({
      status: "insufficient_context",
      issues: [{ code: "required_object_over_budget" }],
    });

    const characterBoundary = assembleKnowledgeContextFromVerifiedInputs({
      request: request({
        requiredObjectIds: ["architecture-a"],
        preferredObjectTypes: [],
        budget: { ...request().budget, maxCanonicalCharacters: 1 },
      }),
      candidateInputs: objects,
      bindings,
    });
    expect(characterBoundary).toMatchObject({
      status: "insufficient_context",
      issues: [{ code: "required_object_over_budget" }],
    });
  });

  it("reserves one deterministic representative for every required type", () => {
    const { objects, bindings } = fixture();
    const result = assembleKnowledgeContextFromVerifiedInputs({
      request: request({
        requiredObjectTypes: ["knowledge", "decision"],
        preferredObjectTypes: [],
        budget: { ...request().budget, maxObjectCount: 2 },
      }),
      candidateInputs: objects,
      bindings,
    });
    expect(result.status).toBe("assembled");
    if (result.status !== "assembled") throw new Error("Expected assembled context");
    expect(result.package.included.map((entry) => entry.objectType)).toEqual([
      "knowledge",
      "decision",
    ]);
  });

  it("truncates deterministically without splitting a surrogate pair", () => {
    const { objects, bindings } = fixture("before😀after");
    const canonical = serializeCanonicalValue(objects[0]);
    const emojiBoundary = Array.from(canonical.slice(0, canonical.indexOf("😀"))).length + 1;
    const result = assembleKnowledgeContextFromVerifiedInputs({
      request: request({
        requiredObjectIds: ["architecture-a"],
        preferredObjectTypes: [],
        budget: {
          ...request().budget,
          maxObjectCount: 1,
          maxCanonicalCharacters: emojiBoundary,
          perObjectCharacterLimit: emojiBoundary,
          allowTruncation: true,
        },
      }),
      candidateInputs: objects,
      bindings,
    });
    expect(result.status).toBe("assembled");
    if (result.status !== "assembled") throw new Error("Expected assembled context");
    const entry = result.package.included[0]!;
    expect(entry.includedCharacterCount).toBe(emojiBoundary);
    expect(entry.canonicalContent.endsWith("😀")).toBe(true);
    expect(
      entry.canonicalContent.charCodeAt(entry.canonicalContent.length - 1),
    ).toBeGreaterThanOrEqual(0xdc00);
    expect(result.package.truncations).toMatchObject([
      { objectId: "architecture-a", boundary: emojiBoundary },
    ]);
  });

  it("records query exclusions and detects content and evidence tampering", () => {
    const { objects, bindings } = fixture();
    const scopedRequest = request({
      query: {
        ...request().query,
        filters: { tagMatch: "all", objectTypes: ["knowledge"] },
      },
      preferredObjectTypes: [],
    });
    const result = assembleKnowledgeContextFromVerifiedInputs({
      request: scopedRequest,
      candidateInputs: objects,
      bindings,
    });
    expect(result.status).toBe("assembled");
    if (result.status !== "assembled") throw new Error("Expected assembled context");
    expect(result.package.excluded).toContainEqual({
      objectId: "decision-a",
      category: "filtered_out",
      filter: "filters.objectTypes",
      reason: "object_type_mismatch",
    });
    expect(JSON.stringify(result.package)).not.toContain("Governance preserves auditability");

    const contradictoryExclusion = structuredClone(result.package);
    contradictoryExclusion.excluded[0]!.reason = "domain_mismatch";
    expect(KnowledgeContextPackageSchema.safeParse(contradictoryExclusion).success).toBe(false);
    expect(
      KnowledgeContextPackageSchema.safeParse({ ...result.package, schemaVersion: "2.0" }).success,
    ).toBe(false);
    expect(
      KnowledgeContextPackageSchema.safeParse({ ...result.package, unknownField: true }).success,
    ).toBe(false);

    const tampered = structuredClone(result.package);
    tampered.included[0]!.canonicalContent += "forged";
    expect(
      verifyKnowledgeContextPackage({ package: tampered, candidateInputs: objects, bindings })
        .status,
    ).toBe("invalid");
    expect(
      verifyKnowledgeContextPackage({
        package: { ...result.package, unknownField: true },
        candidateInputs: objects,
        bindings,
      }).status,
    ).toBe("invalid");
    const missingEvidence = structuredClone(result.package);
    missingEvidence.excluded = [];
    missingEvidence.evidenceCounts.excluded = 0;
    expect(
      verifyKnowledgeContextPackage({
        package: missingEvidence,
        candidateInputs: objects,
        bindings,
      }).status,
    ).toBe("invalid");

    const tamperCases: Array<(value: KnowledgeContextPackage) => void> = [
      (value) => {
        value.included[0]!.provenance.originalCreator = "forged-creator";
      },
      (value) => {
        value.included[0]!.sourceHash = createCanonicalSha256Fingerprint("forged-source");
      },
      (value) => {
        value.included[0]!.originalObjectFingerprint =
          createCanonicalSha256Fingerprint("forged-object");
      },
      (value) => {
        value.registryBinding.integrityFingerprint =
          createCanonicalSha256Fingerprint("forged-registry");
      },
      (value) => {
        value.budgetUsage.usedCanonicalCharacters += 1;
      },
      (value) => {
        value.contextFingerprint = createCanonicalSha256Fingerprint("forged-context");
        value.contextPackageId = `context-${value.contextFingerprint}`;
      },
    ];
    for (const tamper of tamperCases) {
      const value = structuredClone(result.package);
      tamper(value);
      expect(
        verifyKnowledgeContextPackage({ package: value, candidateInputs: objects, bindings })
          .status,
      ).toBe("invalid");
    }
  });

  it("allows an explicitly governed empty result and rejects it otherwise", () => {
    const { objects, bindings } = fixture();
    const emptyQuery = {
      ...request().query,
      filters: { tagMatch: "all" as const, tags: ["no-match"] },
    };
    const allowed = assembleKnowledgeContextFromVerifiedInputs({
      request: request({
        query: emptyQuery,
        preferredObjectTypes: [],
        budget: { ...request().budget, emptyContextBehavior: "allow" },
      }),
      candidateInputs: objects,
      bindings,
    });
    expect(allowed).toMatchObject({
      status: "assembled",
      package: { included: [], budgetUsage: { usedObjectCount: 0 } },
    });
    expect(
      assembleKnowledgeContextFromVerifiedInputs({
        request: request({ query: emptyQuery, preferredObjectTypes: [] }),
        candidateInputs: objects,
        bindings,
      }),
    ).toMatchObject({
      status: "insufficient_context",
      issues: [{ code: "empty_context_disallowed" }],
    });
  });

  it("binds optional caller timestamp evidence and rejects add, change, or removal", () => {
    const { objects, bindings } = fixture();
    const result = assembleKnowledgeContextFromVerifiedInputs({
      request: request({ evidenceTimestamp: "2026-07-29T12:00:00Z" }),
      candidateInputs: objects,
      bindings,
    });
    expect(result.status).toBe("assembled");
    if (result.status !== "assembled") throw new Error("Expected assembled context");
    expect(result.package.assembledAt).toBe("2026-07-29T12:00:00Z");
    for (const assembledAt of [undefined, "2026-07-29T12:01:00Z"] as const) {
      const tampered = structuredClone(result.package);
      if (assembledAt === undefined) delete tampered.assembledAt;
      else tampered.assembledAt = assembledAt;
      expect(
        verifyKnowledgeContextPackage({ package: tampered, candidateInputs: objects, bindings })
          .status,
      ).toBe("invalid");
    }

    const withoutTimestamp = assembleKnowledgeContextFromVerifiedInputs({
      request: request(),
      candidateInputs: objects,
      bindings,
    });
    if (withoutTimestamp.status !== "assembled") throw new Error("Expected assembled context");
    const added = structuredClone(withoutTimestamp.package);
    added.assembledAt = "2026-07-29T12:00:00Z";
    expect(
      verifyKnowledgeContextPackage({ package: added, candidateInputs: objects, bindings }).status,
    ).toBe("invalid");
  });

  it("uses the authoritative query evaluator for every stable exact-filter reason", () => {
    const { objects, bindings } = fixture();
    const cases: Array<[KnowledgeContextRequest["query"]["filters"], string]> = [
      [{ tagMatch: "all", categories: ["other"] }, "category_mismatch"],
      [{ tagMatch: "all", domains: ["OtherOS"] }, "domain_mismatch"],
      [{ tagMatch: "all", objectTypes: ["experiment"] }, "object_type_mismatch"],
      [{ tagMatch: "all", projects: ["OtherOS"] }, "project_mismatch"],
      [{ tagMatch: "all", sourceReferences: ["docs/other.md"] }, "source_reference_mismatch"],
      [{ tagMatch: "all", sourceTypes: ["other"] }, "source_type_mismatch"],
      [{ tagMatch: "all", statuses: ["draft"] }, "status_mismatch"],
      [{ tagMatch: "all", tags: ["missing"] }, "tag_mismatch"],
    ];
    for (const [filter, reason] of cases) {
      const base = request();
      const result = assembleKnowledgeContextFromVerifiedInputs({
        request: request({
          preferredObjectTypes: [],
          query: { ...base.query, filters: filter },
          budget: { ...base.budget, emptyContextBehavior: "allow" },
        }),
        candidateInputs: objects,
        bindings,
      });
      expect(result.status).toBe("assembled");
      if (result.status !== "assembled") throw new Error("Expected assembled context");
      expect(result.package.excluded[0]?.reason).toBe(reason);
    }
  });

  it("rejects forged durable registration, manifest, and snapshot content evidence", () => {
    const { objects, bindings } = fixture();
    const forgedFingerprint = structuredClone(bindings.registration);
    forgedFingerprint.recordFingerprint = createCanonicalSha256Fingerprint("forged-record");

    const forgedManifest = structuredClone(bindings.registration);
    forgedManifest.manifestEvidence.manifest.documents[0]!.sourceHash =
      createCanonicalSha256Fingerprint("forged-source");
    forgedManifest.manifestFingerprint = createDurableSnapshotManifestFingerprint(
      forgedManifest.manifestEvidence,
    );
    forgedManifest.recordFingerprint = createDurableAuditRecordFingerprint(forgedManifest);

    const forgedSnapshot = structuredClone(bindings.registration);
    forgedSnapshot.snapshot.corpusVersion = "forged-version";
    forgedSnapshot.provenanceSummary.corpusVersion = "forged-version";
    forgedSnapshot.recordFingerprint = createDurableAuditRecordFingerprint(forgedSnapshot);

    for (const [registration, repositorySnapshot] of [
      [forgedFingerprint, bindings.repositorySnapshot],
      [forgedManifest, bindings.repositorySnapshot],
      [forgedSnapshot, forgedSnapshot.snapshot],
    ] as const) {
      expect(
        assembleKnowledgeContextFromVerifiedInputs({
          request: request(),
          candidateInputs: objects,
          bindings: { ...bindings, registration, repositorySnapshot },
        }),
      ).toMatchObject({
        status: "insufficient_context",
        issues: [{ code: "active_snapshot_mismatch" }],
      });
    }
  });

  it.each([
    [
      "invalid registry",
      (bindings: VerifiedKnowledgeContextInputs) => ({
        ...bindings,
        integrity: {
          ...bindings.integrity,
          status: "invalid",
          integrityFingerprint: null,
          issues: [
            { code: "record_fingerprint_mismatch", message: "corrupt", path: "audit", sequence: 1 },
          ],
        },
      }),
    ],
    [
      "repository mismatch",
      (bindings: VerifiedKnowledgeContextInputs) => ({
        ...bindings,
        repositorySnapshot: {
          ...bindings.repositorySnapshot,
          corpusVersion: "forged-context-version",
        },
      }),
    ],
    [
      "manifest mismatch",
      (bindings: VerifiedKnowledgeContextInputs) => ({
        ...bindings,
        registration: {
          ...bindings.registration,
          manifestFingerprint: createCanonicalSha256Fingerprint("forged"),
        },
      }),
    ],
  ])("fails closed for %s", (_name, mutate) => {
    const { objects, bindings } = fixture();
    expect(
      assembleKnowledgeContextFromVerifiedInputs({
        request: request(),
        candidateInputs: objects,
        bindings: mutate(bindings) as VerifiedKnowledgeContextInputs,
      }).status,
    ).toBe("insufficient_context");
  });

  it("deduplicates equivalent candidates and rejects conflicting identities", () => {
    const { objects, bindings } = fixture();
    const equivalent = assembleKnowledgeContextFromVerifiedInputs({
      request: request(),
      candidateInputs: [...objects, structuredClone(objects[0])],
      bindings,
    });
    expect(equivalent.status).toBe("assembled");
    if (equivalent.status !== "assembled") throw new Error("Expected assembled context");
    expect(equivalent.package.omitted).toContainEqual(
      expect.objectContaining({ objectId: "architecture-a", reason: "equivalent_duplicate" }),
    );

    const conflicting = generalKnowledgeObject("architecture-a", "conflicting content");
    expect(
      assembleKnowledgeContextFromVerifiedInputs({
        request: request(),
        candidateInputs: [...objects, conflicting],
        bindings,
      }),
    ).toMatchObject({
      status: "insufficient_context",
      issues: [{ code: "conflicting_duplicate" }],
    });
  });

  it("uses the public registry and repository boundaries and holds one active binding", async () => {
    const { objects, bindings } = fixture();
    let activeRegistration = bindings.registration;
    const calls: string[] = [];
    const registry = {
      async verifyIntegrity() {
        calls.push("verify");
        return bindings.integrity;
      },
      async recover() {
        calls.push("recover");
        return bindings.recovery;
      },
      async getCurrentActiveSnapshot() {
        calls.push("active");
        const captured = activeRegistration;
        activeRegistration = {
          ...activeRegistration,
          snapshot: { ...activeRegistration.snapshot, snapshotId: "snapshot-later-activation" },
        };
        return captured;
      },
    } as unknown as GovernedDurableSnapshotRegistry;
    const source = new InMemoryKnowledgeCandidateSource(
      {
        schemaVersion: "1.0",
        sourceId: "context-fixture",
        sourceType: "test",
        provenance: { sourceType: "test" },
      },
      objects,
    );
    const repository = await InMemoryKnowledgeRepository.create([source]);
    const result = await assembleGovernedKnowledgeContext({
      request: request(),
      registry,
      repository,
      repositorySnapshot: bindings.repositorySnapshot,
    });
    expect(calls).toEqual(["verify", "recover", "active"]);
    expect(result.status).toBe("assembled");
    if (result.status !== "assembled") throw new Error("Expected assembled context");
    expect(result.package.snapshotBinding.activeSnapshotId).toBe(
      bindings.repositorySnapshot.snapshotId,
    );
  });
});
