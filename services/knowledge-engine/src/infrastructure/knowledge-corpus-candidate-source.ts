import { createHash } from "node:crypto";

import {
  KnowledgeCandidateBatchSchema,
  KnowledgeCorpusSourceSchema,
  KnowledgeRepositorySnapshotCreationSchema,
  KnowledgeRepositorySnapshotSchema,
  KnowledgeSnapshotComparisonEvidenceSchema,
  MigrationPathSchema,
  NonEmptyStringSchema,
  type KnowledgeCandidateBatch,
  type KnowledgeCandidateSource,
  type KnowledgeCorpusSource,
  type KnowledgeRepositorySnapshot,
  type KnowledgeRepositorySnapshotObject,
  type KnowledgeSnapshotComparisonEvidence,
} from "@founderos/knowledge-schema";

import { executeKnowledgeMigration } from "../application/execute-knowledge-migration.js";
import type {
  AcceptedMigrationDocumentReport,
  KnowledgeMigrationReport,
} from "../interfaces/migration-report.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }

  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }

  const entries = Object.entries(value)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([left], [right]) => compareStrings(left, right));

  return `{${entries
    .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalize(entryValue)}`)
    .join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}

export class KnowledgeCorpusMigrationRejectedError extends Error {
  public readonly report: KnowledgeMigrationReport;

  public constructor(report: KnowledgeMigrationReport) {
    const rejectedDocumentCount = report.documents.filter(
      (document) => document.status === "rejected",
    ).length;
    super(
      `Knowledge corpus migration was rejected (${report.errors.length} manifest error(s), ${rejectedDocumentCount} rejected document(s))`,
    );
    this.name = "KnowledgeCorpusMigrationRejectedError";
    this.report = report;
  }
}

export interface CreateKnowledgeRepositorySnapshotInput {
  corpus: KnowledgeCorpusSource;
  creation: KnowledgeRepositorySnapshot["creation"];
  documents: readonly AcceptedMigrationDocumentReport[];
}

export function createKnowledgeRepositorySnapshot(
  input: CreateKnowledgeRepositorySnapshotInput,
): KnowledgeRepositorySnapshot {
  const corpus = KnowledgeCorpusSourceSchema.parse(input.corpus);
  const creation = KnowledgeRepositorySnapshotCreationSchema.parse(input.creation);
  const objects: KnowledgeRepositorySnapshotObject[] = input.documents
    .map((document) => ({
      metadataFingerprint: sha256(document.object.metadata),
      objectFingerprint: sha256(document.object),
      objectId: document.object.metadata.id,
      objectType: document.object.metadata.objectType,
      sourceHash: document.actualSourceHash,
      sourcePath: document.sourcePath,
    }))
    .sort((left, right) => compareStrings(left.objectId, right.objectId));
  const contentFingerprint = sha256({
    corpusId: corpus.corpusId,
    corpusVersion: corpus.corpusVersion,
    objects,
    sourceManifestReference: corpus.sourceManifestReference,
  });
  const snapshot = KnowledgeRepositorySnapshotSchema.parse({
    schemaVersion: "1.0",
    snapshotId: `snapshot-${contentFingerprint}`,
    corpusId: corpus.corpusId,
    corpusVersion: corpus.corpusVersion,
    sourceManifestReference: corpus.sourceManifestReference,
    contentFingerprint,
    objectCount: objects.length,
    creation,
    objects,
  });

  return deepFreeze(snapshot);
}

export interface CreateKnowledgeSnapshotComparisonEvidenceInput {
  snapshot: KnowledgeRepositorySnapshot;
  documents: readonly AcceptedMigrationDocumentReport[];
}

export function createKnowledgeSnapshotComparisonEvidence(
  input: CreateKnowledgeSnapshotComparisonEvidenceInput,
): KnowledgeSnapshotComparisonEvidence {
  const snapshot = KnowledgeRepositorySnapshotSchema.parse(input.snapshot);
  const snapshotObjectsById = new Map(snapshot.objects.map((object) => [object.objectId, object]));
  const objects = input.documents
    .map((document) => {
      const snapshotObject = snapshotObjectsById.get(document.object.metadata.id);
      if (snapshotObject === undefined) {
        throw new Error(
          `Cannot create comparison evidence for missing snapshot object ${document.object.metadata.id}`,
        );
      }
      const { metadata: _metadata, ...content } = document.object;
      void _metadata;
      return { ...snapshotObject, contentFingerprint: sha256(content) };
    })
    .sort((left, right) => compareStrings(left.objectId, right.objectId));

  return deepFreeze(
    KnowledgeSnapshotComparisonEvidenceSchema.parse({
      schemaVersion: "1.0",
      snapshotId: snapshot.snapshotId,
      objects,
    }),
  );
}

export interface CreateKnowledgeCorpusCandidateSourceOptions {
  rootPath: string;
  manifestPath: string;
  corpusVersion: string;
  createdAt: string;
  createdBy: string;
}

export class KnowledgeCorpusCandidateSource implements KnowledgeCandidateSource {
  readonly #batch: KnowledgeCandidateBatch;
  public readonly corpus: KnowledgeCorpusSource;
  public readonly report: KnowledgeMigrationReport;
  public readonly snapshot: KnowledgeRepositorySnapshot;
  public readonly snapshotComparisonEvidence: KnowledgeSnapshotComparisonEvidence;

  private constructor(
    batch: KnowledgeCandidateBatch,
    corpus: KnowledgeCorpusSource,
    report: KnowledgeMigrationReport,
    snapshot: KnowledgeRepositorySnapshot,
    snapshotComparisonEvidence: KnowledgeSnapshotComparisonEvidence,
  ) {
    this.#batch = batch;
    this.corpus = corpus;
    this.report = report;
    this.snapshot = snapshot;
    this.snapshotComparisonEvidence = snapshotComparisonEvidence;
  }

  public static async create(
    options: CreateKnowledgeCorpusCandidateSourceOptions,
  ): Promise<KnowledgeCorpusCandidateSource> {
    const rootPath = NonEmptyStringSchema.parse(options.rootPath);
    const manifestPath = MigrationPathSchema.parse(options.manifestPath);
    const corpusVersion = NonEmptyStringSchema.parse(options.corpusVersion);
    const creation = KnowledgeRepositorySnapshotCreationSchema.parse({
      createdAt: options.createdAt,
      createdBy: options.createdBy,
    });
    const report = await executeKnowledgeMigration({ rootPath, manifestPath });
    const acceptedDocuments = report.documents.filter(
      (document): document is AcceptedMigrationDocumentReport => document.status === "accepted",
    );

    if (
      report.status !== "accepted" ||
      report.corpusId === null ||
      acceptedDocuments.length !== report.documents.length
    ) {
      throw new KnowledgeCorpusMigrationRejectedError(report);
    }

    const corpus = KnowledgeCorpusSourceSchema.parse({
      schemaVersion: "1.0",
      corpusId: report.corpusId,
      corpusVersion,
      sourceManifestReference: report.manifestPath,
      source: {
        schemaVersion: "1.0",
        sourceId: report.corpusId,
        sourceType: "knowledge_corpus",
        provenance: {
          sourceType: "migration_manifest",
          sourceReference: report.manifestPath,
          originalCreator: "FounderOS",
        },
      },
    });
    const batch = KnowledgeCandidateBatchSchema.parse({
      schemaVersion: "1.0",
      source: corpus.source,
      candidates: acceptedDocuments
        .map((document) => document.object)
        .sort((left, right) => compareStrings(left.metadata.id, right.metadata.id)),
    });
    const snapshot = createKnowledgeRepositorySnapshot({
      corpus,
      creation,
      documents: acceptedDocuments,
    });
    const snapshotComparisonEvidence = createKnowledgeSnapshotComparisonEvidence({
      snapshot,
      documents: acceptedDocuments,
    });

    return new KnowledgeCorpusCandidateSource(
      batch,
      corpus,
      report,
      snapshot,
      snapshotComparisonEvidence,
    );
  }

  public async loadCandidates(): Promise<KnowledgeCandidateBatch> {
    return KnowledgeCandidateBatchSchema.parse(this.#batch);
  }
}
