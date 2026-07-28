import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { KnowledgeRepositorySnapshot } from "@founderos/knowledge-schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import {
  compareKnowledgeRepositorySnapshots,
  createKnowledgeRepositorySnapshot,
  initializeCorpusKnowledgeRepository,
  KnowledgeCorpusCandidateSource,
  KnowledgeCorpusMigrationRejectedError,
  queryKnowledgeObjects,
  queryKnowledgeRepository,
  serializeKnowledgeQueryResult,
} from "../src/index.js";
import type { AcceptedMigrationDocumentReport } from "../src/interfaces/migration-report.js";
import { PRIORITY_ONE_QUERY_EVALUATIONS } from "./fixtures/query-evaluations.js";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const MANIFEST_PATH = "knowledge/migration-manifest.yaml";
const CREATION = { createdAt: "2026-07-28T00:00:00Z", createdBy: "founderos-engine" } as const;
const PRIORITY_ONE_SOURCE_PATHS = [
  "docs/architecture/FounderOS_Data_Architecture_Specification_v1.0.md",
  "docs/architecture/FounderOS_MCP_Architecture_Specification_v1.0.md",
  "docs/architecture/FounderOS_Repository_Architecture_Specification_v1.0.md",
  "docs/architecture/FounderOS_Security_and_Governance_Architecture_Specification_v1.0.md",
  "docs/architecture/FounderOS_System_Architecture_Specification_v1.0.md",
  "docs/governance/FounderOS_Constitution_v1.0.md",
  "docs/governance/FounderOS_Decision_Framework_v1.0.md",
  "docs/governance/FounderOS_Design_Principles_v1.0.md",
] as const;

let initialized: Awaited<ReturnType<typeof initializeCorpusKnowledgeRepository>>;
let canonicalBytesBefore: Buffer[];
const temporaryDirectories: string[] = [];

function options(creation: { createdAt: string; createdBy: string } = CREATION) {
  return {
    rootPath: REPOSITORY_ROOT,
    manifestPath: MANIFEST_PATH,
    corpusVersion: "priority-1-v1",
    ...creation,
  };
}

function hash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

function acceptedDocuments(): AcceptedMigrationDocumentReport[] {
  return initialized.candidateSource.report.documents.flatMap((document) =>
    document.status === "accepted" ? [structuredClone(document)] : [],
  );
}

function snapshotFrom(documents: AcceptedMigrationDocumentReport[]): KnowledgeRepositorySnapshot {
  return createKnowledgeRepositorySnapshot({
    corpus: initialized.candidateSource.corpus,
    creation: CREATION,
    documents,
  });
}

beforeAll(async () => {
  canonicalBytesBefore = await Promise.all(
    PRIORITY_ONE_SOURCE_PATHS.map((path) => readFile(resolve(REPOSITORY_ROOT, path))),
  );
  initialized = await initializeCorpusKnowledgeRepository(options());
});

afterAll(async () => {
  await Promise.all(
    temporaryDirectories.map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("KnowledgeCorpusCandidateSource", () => {
  it("loads all eight approved objects with deterministic identity and provenance", async () => {
    const batch = await initialized.candidateSource.loadCandidates();
    const ids = batch.candidates.map((candidate) => candidate.metadata.id);

    expect(batch.source).toEqual({
      schemaVersion: "1.0",
      sourceId: "founderos-priority-1",
      sourceType: "knowledge_corpus",
      provenance: {
        sourceType: "migration_manifest",
        sourceReference: MANIFEST_PATH,
        originalCreator: "FounderOS",
      },
    });
    expect(initialized.candidateSource.corpus).toMatchObject({
      corpusId: "founderos-priority-1",
      corpusVersion: "priority-1-v1",
      sourceManifestReference: MANIFEST_PATH,
    });
    expect(ids).toHaveLength(8);
    expect(ids).toEqual([...ids].sort());

    for (const candidate of batch.candidates) {
      const reportDocument = initialized.candidateSource.report.documents.find(
        (document) => document.id === candidate.metadata.id,
      );
      expect(reportDocument?.status).toBe("accepted");
      expect(candidate.metadata.source).toEqual({
        sourceType: "official_specification",
        sourceReference: reportDocument?.sourcePath,
        originalCreator: "FounderOS",
      });
    }
  });

  it("rejects an invalid corpus atomically with its migration report", async () => {
    const rootPath = await mkdtemp(resolve(tmpdir(), "founderos-corpus-adapter-"));
    temporaryDirectories.push(rootPath);
    await mkdir(resolve(rootPath, "docs"));
    await writeFile(resolve(rootPath, "docs/source.md"), "# Changed source\n", "utf8");
    await writeFile(
      resolve(rootPath, "manifest.yaml"),
      stringify({
        schemaVersion: "1.0",
        corpusId: "invalid-corpus",
        documents: [
          {
            id: "invalid-object",
            objectType: "knowledge",
            sourcePath: "docs/source.md",
            destinationPath: "knowledge/research/invalid-object.md",
            sourceHash: hash("# Expected source\n"),
            migrationStatus: "ready",
            reviewStatus: "approved",
            metadata: {
              title: "Invalid object",
              domain: "FounderOS",
              createdAt: "2026-07-28",
              updatedAt: "2026-07-28",
              status: "active",
              confidence: "high",
              importance: "high",
            },
          },
        ],
      }),
      "utf8",
    );

    const error = await KnowledgeCorpusCandidateSource.create({
      rootPath,
      manifestPath: "manifest.yaml",
      corpusVersion: "invalid-v1",
      ...CREATION,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(KnowledgeCorpusMigrationRejectedError);
    expect((error as KnowledgeCorpusMigrationRejectedError).report).toMatchObject({
      corpusId: "invalid-corpus",
      status: "rejected",
      summary: { rejectedDocuments: 1 },
      documents: [{ status: "rejected", errors: [{ code: "source_hash_mismatch" }] }],
    });
  });

  it("keeps snapshot identity stable across creation metadata and deeply freezes snapshots", async () => {
    const second = await KnowledgeCorpusCandidateSource.create(
      options({ createdAt: "2030-01-01T00:00:00Z", createdBy: "another-builder" }),
    );

    expect(second.snapshot.snapshotId).toBe(initialized.snapshot.snapshotId);
    expect(second.snapshot.contentFingerprint).toBe(initialized.snapshot.contentFingerprint);
    expect(
      second.snapshotComparisonEvidence.objects.map((object) => object.contentFingerprint),
    ).toEqual(
      initialized.snapshotComparisonEvidence.objects.map((object) => object.contentFingerprint),
    );
    expect(
      initialized.snapshotComparisonEvidence.objects.every((object) =>
        /^[a-f0-9]{64}$/.test(object.contentFingerprint),
      ),
    ).toBe(true);
    expect("contentFingerprint" in initialized.snapshot.objects[0]!).toBe(false);
    expect(second.snapshot.creation).not.toEqual(initialized.snapshot.creation);
    expect(Object.isFrozen(initialized.snapshot)).toBe(true);
    expect(Object.isFrozen(initialized.snapshot.objects)).toBe(true);
    expect(Object.isFrozen(initialized.snapshot.objects[0])).toBe(true);
    expect(() => {
      initialized.snapshot.objects[0]!.sourceHash = "0".repeat(64);
    }).toThrow(TypeError);
  });

  it("queries through the corpus repository with Milestone 05 and 06 compatibility", async () => {
    const query = PRIORITY_ONE_QUERY_EVALUATIONS[0]!.query;
    const candidates = await initialized.candidateSource.loadCandidates();
    const repositoryResult = await queryKnowledgeRepository(query, initialized.repository);
    const candidateArrayResult = queryKnowledgeObjects(query, candidates.candidates);

    expect(serializeKnowledgeQueryResult(repositoryResult)).toBe(
      serializeKnowledgeQueryResult(candidateArrayResult),
    );
    expect(
      (await initialized.repository.getCandidates()).map((object) => object.metadata.id),
    ).toEqual(candidates.candidates.map((object) => object.metadata.id));
  });

  it("does not alter canonical document bytes during initialization", async () => {
    const after = await Promise.all(
      PRIORITY_ONE_SOURCE_PATHS.map((path) => readFile(resolve(REPOSITORY_ROOT, path))),
    );
    expect(after).toEqual(canonicalBytesBefore);
  });
});

describe("repository snapshots and change detection", () => {
  it("returns an unchanged comparison for identical snapshots", () => {
    expect(compareKnowledgeRepositorySnapshots(initialized.snapshot, initialized.snapshot)).toEqual(
      {
        schemaVersion: "1.0",
        previousSnapshotId: initialized.snapshot.snapshotId,
        currentSnapshotId: initialized.snapshot.snapshotId,
        previousCorpusVersion: "priority-1-v1",
        currentCorpusVersion: "priority-1-v1",
        corpusVersionChanged: false,
        previousContentFingerprint: initialized.snapshot.contentFingerprint,
        currentContentFingerprint: initialized.snapshot.contentFingerprint,
        contentFingerprintChanged: false,
        addedObjectIds: [],
        removedObjectIds: [],
        identityChanges: [],
        sourceHashChanges: [],
        metadataChanges: [],
        objectChanges: [],
        changed: false,
      },
    );
  });

  it("derives metadata, object, and source fingerprints from distinct inputs", () => {
    const baseDocuments = acceptedDocuments();
    const base = snapshotFrom(baseDocuments);
    const targetId = baseDocuments[0]!.object.metadata.id;

    const metadataDocuments = structuredClone(baseDocuments);
    metadataDocuments[0]!.object.metadata.title += " updated";
    const metadataChange = compareKnowledgeRepositorySnapshots(
      base,
      snapshotFrom(metadataDocuments),
    );
    expect(metadataChange.metadataChanges.map((change) => change.objectId)).toEqual([targetId]);
    expect(metadataChange.objectChanges.map((change) => change.objectId)).toEqual([targetId]);
    expect(metadataChange.sourceHashChanges).toEqual([]);

    const contentDocuments = structuredClone(baseDocuments);
    const contentObject = contentDocuments[0]!.object;
    if (!("content" in contentObject)) throw new Error("Expected Priority 1 knowledge object");
    contentObject.content += "\nChanged body.";
    const contentChange = compareKnowledgeRepositorySnapshots(base, snapshotFrom(contentDocuments));
    expect(contentChange.metadataChanges).toEqual([]);
    expect(contentChange.objectChanges.map((change) => change.objectId)).toEqual([targetId]);
    expect(contentChange.sourceHashChanges).toEqual([]);

    const sourceDocuments = structuredClone(baseDocuments);
    sourceDocuments[0]!.actualSourceHash = "a".repeat(64);
    const sourceChange = compareKnowledgeRepositorySnapshots(base, snapshotFrom(sourceDocuments));
    expect(sourceChange.metadataChanges).toEqual([]);
    expect(sourceChange.objectChanges).toEqual([]);
    expect(sourceChange.sourceHashChanges.map((change) => change.objectId)).toEqual([targetId]);
  });

  it("detects corpus version and canonical-path identity changes", () => {
    const current = structuredClone(initialized.snapshot);
    const identityRecord = current.objects[0]!;
    const previousIdentity = identityRecord.objectId;
    identityRecord.objectId = `${previousIdentity}-replacement`;
    current.objects.sort((left, right) => left.objectId.localeCompare(right.objectId));
    current.corpusVersion = "priority-1-v2";
    current.snapshotId = `snapshot-${"d".repeat(64)}`;
    current.contentFingerprint = "d".repeat(64);

    const changeSet = compareKnowledgeRepositorySnapshots(initialized.snapshot, current);
    expect(changeSet).toMatchObject({
      corpusVersionChanged: true,
      contentFingerprintChanged: true,
      addedObjectIds: [`${previousIdentity}-replacement`],
      removedObjectIds: [previousIdentity],
      identityChanges: [
        {
          sourcePath: identityRecord.sourcePath,
          previousObjectId: previousIdentity,
          currentObjectId: `${previousIdentity}-replacement`,
        },
      ],
      changed: true,
    });
  });

  it("detects content identity changes not represented by object fingerprints", () => {
    const pathDocuments = acceptedDocuments();
    pathDocuments[0]!.sourcePath = "docs/relocated-source.md";
    const changed = compareKnowledgeRepositorySnapshots(
      initialized.snapshot,
      snapshotFrom(pathDocuments),
    );

    expect(changed).toMatchObject({
      contentFingerprintChanged: true,
      sourceHashChanges: [],
      metadataChanges: [],
      objectChanges: [],
      changed: true,
    });
  });
});
