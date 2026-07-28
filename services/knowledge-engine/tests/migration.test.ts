import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";
import { stringify } from "yaml";

import {
  executeKnowledgeMigration,
  runMigrationCommand,
  serializeKnowledgeMigrationReport,
} from "../src/index.js";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const MANIFEST_PATH = "knowledge/migration-manifest.yaml";
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
const temporaryDirectories: string[] = [];

function sha256(source: string | Buffer): string {
  return createHash("sha256").update(source).digest("hex");
}

function manifestDocument(sourceHash: string) {
  return {
    id: "test-knowledge-v1",
    objectType: "knowledge",
    sourcePath: "docs/source.md",
    destinationPath: "knowledge/research/test-knowledge-v1.md",
    sourceHash,
    migrationStatus: "ready",
    reviewStatus: "approved",
    metadata: {
      title: "Test knowledge",
      domain: "FounderOS",
      createdAt: "2026-07-28",
      updatedAt: "2026-07-28",
      status: "active",
      confidence: "high",
      importance: "high",
      validationStatus: "validated",
      tags: ["test"],
      relationships: [],
    },
  };
}

function manifestWith(documents: unknown[]) {
  return {
    schemaVersion: "1.0",
    corpusId: "test-corpus",
    documents,
  };
}

async function temporaryRoot(source = "# Canonical source\n"): Promise<{
  manifestPath: string;
  rootPath: string;
  source: string;
}> {
  const rootPath = await mkdtemp(resolve(tmpdir(), "founderos-migration-"));
  temporaryDirectories.push(rootPath);
  await mkdir(resolve(rootPath, "docs"));
  await writeFile(resolve(rootPath, "docs/source.md"), source, "utf8");
  return { manifestPath: "manifest.yaml", rootPath, source };
}

async function writeManifest(rootPath: string, manifest: unknown): Promise<void> {
  await writeFile(resolve(rootPath, "manifest.yaml"), stringify(manifest), "utf8");
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("FounderOS Priority 1 migration", () => {
  it("migrates all eight canonical documents with provenance and no source mutation", async () => {
    const before = await Promise.all(
      PRIORITY_ONE_SOURCE_PATHS.map((path) => readFile(resolve(REPOSITORY_ROOT, path))),
    );

    const report = await executeKnowledgeMigration({
      manifestPath: MANIFEST_PATH,
      rootPath: REPOSITORY_ROOT,
    });

    const after = await Promise.all(
      PRIORITY_ONE_SOURCE_PATHS.map((path) => readFile(resolve(REPOSITORY_ROOT, path))),
    );
    expect(report.status).toBe("accepted");
    expect(report.summary).toMatchObject({
      acceptedDocuments: 8,
      byObjectType: { knowledge: 8 },
      rejectedDocuments: 0,
      totalDocuments: 8,
    });
    expect(report.documents.map((document) => document.sourcePath)).toEqual(
      PRIORITY_ONE_SOURCE_PATHS,
    );
    expect(after).toEqual(before);

    for (const document of report.documents) {
      expect(document.status).toBe("accepted");
      if (document.status === "accepted") {
        expect(document.actualSourceHash).toBe(document.expectedSourceHash);
        expect(document.object.metadata).toMatchObject({
          id: document.id,
          objectType: document.objectType,
          source: {
            originalCreator: "FounderOS",
            sourceReference: document.sourcePath,
            sourceType: "official_specification",
          },
        });
        expect(document.object).toHaveProperty(
          "content",
          (await readFile(resolve(REPOSITORY_ROOT, document.sourcePath), "utf8")).trim(),
        );
      }
    }
  });

  it("produces byte-identical reports and a correct report artifact", async () => {
    const first = await executeKnowledgeMigration({
      manifestPath: MANIFEST_PATH,
      rootPath: REPOSITORY_ROOT,
    });
    const second = await executeKnowledgeMigration({
      manifestPath: MANIFEST_PATH,
      rootPath: REPOSITORY_ROOT,
    });

    expect(serializeKnowledgeMigrationReport(first)).toBe(
      serializeKnowledgeMigrationReport(second),
    );

    const temporary = await temporaryRoot();
    await writeManifest(
      temporary.rootPath,
      manifestWith([manifestDocument(sha256(temporary.source))]),
    );
    await runMigrationCommand({
      ...temporary,
      outputPath: "migration-report.json",
    });
    const artifact = await readFile(resolve(temporary.rootPath, "migration-report.json"), "utf8");
    const parsed = JSON.parse(artifact) as { schemaVersion: string; status: string };

    expect(artifact.endsWith("\n")).toBe(true);
    expect(parsed).toMatchObject({ schemaVersion: "1.0", status: "accepted" });
  });
});

describe("migration manifest failures", () => {
  it("rejects duplicate object IDs before reading sources", async () => {
    const temporary = await temporaryRoot();
    const first = manifestDocument(sha256(temporary.source));
    await writeManifest(
      temporary.rootPath,
      manifestWith([first, { ...first, destinationPath: "knowledge/research/duplicate.md" }]),
    );

    const report = await executeKnowledgeMigration(temporary);

    expect(report).toMatchObject({
      documents: [],
      status: "rejected",
      summary: { totalDocuments: 0 },
    });
    expect(report.errors).toHaveLength(2);
    expect(report.errors.every((error) => error.code === "manifest_validation_error")).toBe(true);
  });

  it("reports a missing canonical source document", async () => {
    const temporary = await temporaryRoot();
    const document = {
      ...manifestDocument("0".repeat(64)),
      sourcePath: "docs/missing.md",
    };
    await writeManifest(temporary.rootPath, manifestWith([document]));

    const report = await executeKnowledgeMigration(temporary);

    expect(report.documents[0]).toMatchObject({
      errors: [{ code: "source_missing" }],
      status: "rejected",
    });
  });

  it("rejects invalid object types and metadata", async () => {
    const temporary = await temporaryRoot();
    const base = manifestDocument(sha256(temporary.source));
    await writeManifest(
      temporary.rootPath,
      manifestWith([
        {
          ...base,
          objectType: "architecture",
          metadata: { ...base.metadata, status: "validated" },
        },
      ]),
    );

    const report = await executeKnowledgeMigration(temporary);

    expect(report.status).toBe("rejected");
    expect(report.errors.map((error) => error.fieldPath)).toEqual(
      expect.arrayContaining(["documents.0.objectType", "documents.0.metadata.status"]),
    );
  });

  it("rejects source hash mismatches with expected and actual evidence", async () => {
    const temporary = await temporaryRoot();
    await writeManifest(temporary.rootPath, manifestWith([manifestDocument("0".repeat(64))]));

    const report = await executeKnowledgeMigration(temporary);

    expect(report.documents[0]).toMatchObject({
      actualSourceHash: sha256(temporary.source),
      errors: [{ code: "source_hash_mismatch", fieldPath: "sourceHash" }],
      expectedSourceHash: "0".repeat(64),
      status: "rejected",
    });
  });

  it("rejects entries that are not ready and human-approved", async () => {
    const temporary = await temporaryRoot();
    const document = {
      ...manifestDocument(sha256(temporary.source)),
      migrationStatus: "pending",
      reviewStatus: "pending",
    };
    await writeManifest(temporary.rootPath, manifestWith([document]));

    const report = await executeKnowledgeMigration(temporary);

    expect(report.documents[0]).toMatchObject({
      errors: [{ code: "migration_status_not_ready" }],
      status: "rejected",
    });
  });
});

describe("migration path safety", () => {
  it("rejects lexical traversal in source and output paths", async () => {
    const temporary = await temporaryRoot();
    const document = {
      ...manifestDocument(sha256(temporary.source)),
      sourcePath: "../outside.md",
    };
    await writeManifest(temporary.rootPath, manifestWith([document]));

    const report = await executeKnowledgeMigration(temporary);

    expect(report.errors).toEqual([
      expect.objectContaining({
        code: "manifest_validation_error",
        fieldPath: "documents.0.sourcePath",
      }),
    ]);
    await expect(
      runMigrationCommand({ ...temporary, outputPath: "../migration-report.json" }),
    ).rejects.toThrow("Unsafe migration output path");
    await expect(runMigrationCommand({ ...temporary, outputPath: "package.json" })).rejects.toThrow(
      "Migration output path must be migration-report.json",
    );
  });

  it("rejects a source symlink that points outside the approved root", async () => {
    const temporary = await temporaryRoot();
    const outsideRoot = await temporaryRoot("# Outside\n");
    await symlink(
      resolve(outsideRoot.rootPath, "docs/source.md"),
      resolve(temporary.rootPath, "docs/linked.md"),
    );
    const document = {
      ...manifestDocument(sha256(outsideRoot.source)),
      sourcePath: "docs/linked.md",
    };
    await writeManifest(temporary.rootPath, manifestWith([document]));

    const report = await executeKnowledgeMigration(temporary);

    expect(report.documents[0]).toMatchObject({
      errors: [{ code: "source_path_unsafe" }],
      status: "rejected",
    });
  });
});
