import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import {
  ingestMarkdownDirectory,
  ingestMarkdownFile,
  serializeDirectoryIngestionReport,
} from "../src/index.js";

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const TEMPLATE_DIRECTORY = resolve(REPOSITORY_ROOT, "specs/knowledge-templates");
const CORE_FIXTURE_DIRECTORY = fileURLToPath(new URL("fixtures/founderos-core", import.meta.url));
const temporaryDirectories: string[] = [];

function validKnowledge(id: string, body = "Body"): string {
  return `---
id: ${id}
title: ${id}
type: knowledge
domain: FounderOS
created_at: 2026-07-27
updated_at: 2026-07-27
status: active
confidence: high
importance: high
---
${body}`;
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(resolve(tmpdir(), "founderos-ingestion-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("canonical knowledge templates", () => {
  it("validates all seven object-type templates", async () => {
    const expectedTypes = new Map([
      ["decision.md", "decision"],
      ["experiment.md", "experiment"],
      ["knowledge.md", "knowledge"],
      ["principle.md", "principle"],
      ["project.md", "project"],
      ["relationship.md", "relationship"],
      ["research.md", "research"],
    ]);

    for (const [fileName, objectType] of expectedTypes) {
      const report = await ingestMarkdownFile(resolve(TEMPLATE_DIRECTORY, fileName), fileName);
      expect(report.status, fileName).toBe("accepted");
      if (report.status === "accepted") {
        expect(report.object.metadata.objectType).toBe(objectType);
      }
    }
  });
});

describe("directory ingestion", () => {
  it("discovers Markdown recursively in stable relative-path order", async () => {
    const directory = await temporaryDirectory();
    await mkdir(resolve(directory, "nested"));
    await writeFile(resolve(directory, "z.md"), validKnowledge("z"));
    await writeFile(resolve(directory, "a.md"), validKnowledge("a"));
    await writeFile(resolve(directory, "nested", "b.MD"), validKnowledge("b"));
    await writeFile(resolve(directory, "ignored.txt"), validKnowledge("ignored"));

    const report = await ingestMarkdownDirectory(directory);

    expect(report.files.map((file) => file.source.path)).toEqual(["a.md", "nested/b.MD", "z.md"]);
    expect(report.summary).toMatchObject({ acceptedFiles: 3, rejectedFiles: 0, totalFiles: 3 });
  });

  it("keeps valid files when another file is invalid", async () => {
    const directory = await temporaryDirectory();
    await writeFile(resolve(directory, "valid.md"), validKnowledge("valid"));
    await writeFile(resolve(directory, "invalid.md"), "# Missing frontmatter");

    const report = await ingestMarkdownDirectory(directory);

    expect(report.status).toBe("rejected");
    expect(report.summary).toMatchObject({ acceptedFiles: 1, rejectedFiles: 1, totalFiles: 2 });
  });

  it("rejects every file sharing a canonical object ID", async () => {
    const directory = await temporaryDirectory();
    await writeFile(resolve(directory, "first.md"), validKnowledge("duplicate", "First"));
    await writeFile(resolve(directory, "second.md"), validKnowledge("duplicate", "Second"));

    const report = await ingestMarkdownDirectory(directory);

    expect(report.summary.acceptedFiles).toBe(0);
    expect(report.conflicts.duplicateObjectIds).toEqual([
      { objectId: "duplicate", paths: ["first.md", "second.md"] },
    ]);
    expect(
      report.files.every(
        (file) =>
          file.status === "rejected" &&
          file.errors.some((error) => error.code === "duplicate_object_id"),
      ),
    ).toBe(true);
  });

  it("reports duplicate source hashes deterministically", async () => {
    const directory = await temporaryDirectory();
    const duplicate = "# Identical invalid source";
    await writeFile(resolve(directory, "first.md"), duplicate);
    await writeFile(resolve(directory, "second.md"), duplicate);

    const first = await ingestMarkdownDirectory(directory);
    const second = await ingestMarkdownDirectory(directory);

    expect(first.conflicts.duplicateSourceHashes).toHaveLength(1);
    expect(first.conflicts.duplicateSourceHashes[0]?.paths).toEqual(["first.md", "second.md"]);
    expect(serializeDirectoryIngestionReport(first)).toBe(
      serializeDirectoryIngestionReport(second),
    );
  });

  it("does not follow symbolic links outside the selected directory", async () => {
    const directory = await temporaryDirectory();
    const outsideDirectory = await temporaryDirectory();
    const outsideFile = resolve(outsideDirectory, "outside.md");
    await writeFile(resolve(directory, "inside.md"), validKnowledge("inside"));
    await writeFile(outsideFile, validKnowledge("outside"));
    await symlink(outsideFile, resolve(directory, "linked.md"));

    const report = await ingestMarkdownDirectory(directory);

    expect(report.files.map((file) => file.source.path)).toEqual(["inside.md"]);
  });

  it("returns a structured error for a non-directory root", async () => {
    const directory = await temporaryDirectory();
    const filePath = resolve(directory, "file.md");
    await writeFile(filePath, validKnowledge("file"));

    const report = await ingestMarkdownDirectory(filePath);

    expect(report).toMatchObject({
      errors: [{ code: "directory_read_error" }],
      files: [],
      status: "rejected",
    });
  });

  it("rejects a symbolic-link root", async () => {
    const parentDirectory = await temporaryDirectory();
    const targetDirectory = await temporaryDirectory();
    const linkedDirectory = resolve(parentDirectory, "linked-root");
    await writeFile(resolve(targetDirectory, "outside.md"), validKnowledge("outside"));
    await symlink(targetDirectory, linkedDirectory, "dir");

    const report = await ingestMarkdownDirectory(linkedDirectory);

    expect(report).toMatchObject({
      errors: [{ code: "directory_read_error" }],
      files: [],
      status: "rejected",
    });
  });
});

describe("FounderOS Core migration pilot", () => {
  it("accepts five unique core documents without modifying their bytes", async () => {
    const fileNames = [
      "constitution.md",
      "decision-framework.md",
      "design-principles.md",
      "repository-architecture.md",
      "system-architecture.md",
    ];
    const before = await Promise.all(
      fileNames.map((fileName) => readFile(resolve(CORE_FIXTURE_DIRECTORY, fileName))),
    );

    const report = await ingestMarkdownDirectory(CORE_FIXTURE_DIRECTORY);

    const after = await Promise.all(
      fileNames.map((fileName) => readFile(resolve(CORE_FIXTURE_DIRECTORY, fileName))),
    );
    expect(report.status).toBe("accepted");
    expect(report.summary).toMatchObject({ acceptedFiles: 5, rejectedFiles: 0, totalFiles: 5 });
    expect(new Set(report.files.map((file) => file.source.sha256)).size).toBe(5);
    expect(
      new Set(
        report.files.flatMap((file) =>
          file.status === "accepted" ? [file.object.metadata.id] : [],
        ),
      ).size,
    ).toBe(5);
    expect(after).toEqual(before);
    expect(report.files.map((file) => basename(file.source.path))).toEqual(fileNames);
  });
});
