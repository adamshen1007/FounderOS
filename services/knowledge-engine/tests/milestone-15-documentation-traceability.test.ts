import { access, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { M15_DURABLE_READINESS_EVALUATION_SCENARIOS } from "./fixtures/durable-readiness-evaluations.js";
import {
  Milestone15TraceabilityError,
  type Milestone15TraceabilityInput,
  validateMilestone15Traceability,
} from "./support/milestone-15-traceability.js";

const repositoryRoot = resolve(process.cwd(), "../..");
const milestoneRoot = join(repositoryRoot, "docs", "milestones", "milestone-15");
const acceptancePath = join(milestoneRoot, "FounderOS_Milestone_15_Acceptance_Criteria_v1.0.md");

async function traceabilityInput(): Promise<Milestone15TraceabilityInput> {
  const files = (await readdir(milestoneRoot)).filter((file) => file.endsWith(".md")).sort();
  const documents = new Map(
    await Promise.all(
      files.map(async (file) => [file, await readFile(join(milestoneRoot, file), "utf8")] as const),
    ),
  );
  const executableTestCases = new Map<string, Set<string>>();
  for (const mapping of M15_DURABLE_READINESS_EVALUATION_SCENARIOS) {
    const cases = executableTestCases.get(mapping.executableTestFile) ?? new Set<string>();
    cases.add(mapping.executableTestName);
    executableTestCases.set(mapping.executableTestFile, cases);
  }
  return {
    acceptanceSource: documents.get("FounderOS_Milestone_15_Acceptance_Criteria_v1.0.md")!,
    documents,
    scenarioMappings: M15_DURABLE_READINESS_EVALUATION_SCENARIOS,
    executableTestCases,
  };
}

function replaceSection(
  source: string,
  startHeading: string,
  endHeading: string,
  mutate: (section: string) => string,
): string {
  const start = source.indexOf(startHeading);
  const end = source.indexOf(endHeading, start + startHeading.length);
  if (start < 0 || end < 0) throw new Error("fixture-section-missing");
  return source.slice(0, start) + mutate(source.slice(start, end)) + source.slice(end);
}

function expectTraceabilityCode(input: Milestone15TraceabilityInput, code: string): void {
  try {
    validateMilestone15Traceability(input);
  } catch (error) {
    expect(error).toBeInstanceOf(Milestone15TraceabilityError);
    expect((error as Milestone15TraceabilityError).code).toBe(code);
    return;
  }
  throw new Error(`expected-traceability-error:${code}`);
}

describe("Milestone 15 documentation traceability", () => {
  it("maps 29 unique requirements, 29 acceptance criteria, and 72 contiguous scenarios", async () => {
    const input = await traceabilityInput();
    const report = validateMilestone15Traceability(input);
    expect(report.requirements).toHaveLength(29);
    expect(report.acceptanceCriteria).toHaveLength(29);
    expect(report.scenarios).toEqual(
      Array.from({ length: 72 }, (_, index) => `M15-SC-${String(index + 1).padStart(3, "0")}`),
    );
    expect(report.ownedDocuments).toHaveLength(13);
    expect(report.normativeClauseCount).toBeGreaterThan(0);
  });

  const sourceFixture = (label: string, code: string, mutate: (source: string) => string) =>
    [
      label,
      code,
      (input: Milestone15TraceabilityInput) => ({
        ...input,
        acceptanceSource: mutate(input.acceptanceSource),
      }),
    ] as const;

  it.each([
    sourceFixture("missing heading", "heading-missing", (source) =>
      source.replace("## Acceptance Criteria\n", ""),
    ),
    sourceFixture("renamed heading", "heading-missing", (source) =>
      source.replace("## Acceptance Criteria", "## Renamed Acceptance Criteria"),
    ),
    sourceFixture("duplicate requirement", "requirement-duplicate", (source) =>
      source.replace(
        "## Acceptance Criteria",
        "| `M15-ARCH-001` | duplicate | `M15-AC-ARCH-001` |\n\n## Acceptance Criteria",
      ),
    ),
    sourceFixture("duplicate acceptance", "acceptance-duplicate", (source) =>
      source.replace(
        "## Verification Scenario Catalog",
        "- [ ] `M15-AC-ARCH-001`: duplicate.\n\n## Verification Scenario Catalog",
      ),
    ),
    sourceFixture("duplicate scenario", "scenario-duplicate", (source) => {
      const row = source.match(/^\| `M15-SC-001` \|[^\n]+$/mu)?.[0];
      return source.replace(
        "## Normative Source-Section Ownership",
        `${row}\n\n## Normative Source-Section Ownership`,
      );
    }),
    sourceFixture("scenario gap", "scenario-gap-or-order-invalid", (source) =>
      source.replace("`M15-SC-036` |", "`M15-SC-099` |"),
    ),
    sourceFixture("unknown requirement", "scenario-requirement-unknown", (source) =>
      source.replace("`M15-ARCH-001`, `M15-REG-001`, `M15-IDEM-001` |", "`M15-UNKNOWN-999` |"),
    ),
    sourceFixture("missing acceptance", "acceptance-missing", (source) =>
      source.replace(/^- \[ \] `M15-AC-ARCH-001`:[^\n]*\n/mu, ""),
    ),
    sourceFixture("requirement without scenario", "requirement-without-scenario", (source) =>
      replaceSection(
        source,
        "## Verification Scenario Catalog",
        "## Normative Source-Section Ownership",
        (catalog) => catalog.replace("| `M15-PKG-001` |", "| `M15-ARCH-001` |"),
      ),
    ),
    [
      "scenario without test",
      "scenario-without-test",
      (input: Milestone15TraceabilityInput) => ({
        ...input,
        scenarioMappings: input.scenarioMappings.slice(0, -1),
      }),
    ],
    [
      "missing test file",
      "test-file-missing",
      (input: Milestone15TraceabilityInput) => ({
        ...input,
        scenarioMappings: input.scenarioMappings.map((mapping, index) =>
          index === 0 ? { ...mapping, executableTestFile: "tests/missing.test.ts" } : mapping,
        ),
      }),
    ],
    [
      "missing test case",
      "test-case-missing",
      (input: Milestone15TraceabilityInput) => ({
        ...input,
        scenarioMappings: input.scenarioMappings.map((mapping, index) =>
          index === 0 ? { ...mapping, executableTestName: "missing test case" } : mapping,
        ),
      }),
    ],
    sourceFixture("unlisted document", "ownership-unlisted-document", (source) =>
      source.replace(
        "`FounderOS_Milestone_15_Architecture_Specification_v1.0.md` |",
        "`FounderOS_Unlisted_v1.0.md` |",
      ),
    ),
    sourceFixture("duplicate document", "ownership-document-duplicate", (source) =>
      source.replace(
        "`FounderOS_Milestone_15_Architecture_Specification_v1.0.md` |",
        "`FounderOS_Milestone_15_Durable_Production_Provider_Readiness_Evaluation_Ledger_and_Replay_Verification_Registry_Foundation_Specification_v1.0.md` |",
      ),
    ),
    [
      "unmapped normative clause",
      "normative-clause-unmapped",
      (input: Milestone15TraceabilityInput) => {
        const documents = new Map(input.documents);
        const [file, source] = [...documents.entries()][0]!;
        documents.set(file, `This must be mapped.\n${source}`);
        return { ...input, documents };
      },
    ],
    sourceFixture("malformed override", "ownership-override-malformed", (source) =>
      source.replace(
        "`Authoritative Registration Flow` ->",
        "`Authoritative Registration Flow` =>",
      ),
    ),
    sourceFixture("nonexistent override heading", "ownership-override-heading-missing", (source) =>
      source.replace("`Authoritative Registration Flow` ->", "`Missing Registration Flow` ->"),
    ),
    sourceFixture("unknown traceability target", "traceability-target-unknown", (source) =>
      replaceSection(
        source,
        "## Normative Traceability Matrix",
        "## Definition of Done for Future Implementation",
        (matrix) => matrix.replace("`M15-SC-050`", "`M15-SC-999`"),
      ),
    ),
  ] as const)("rejects traceability parser negative fixture: %s", async (_label, code, mutate) => {
    expectTraceabilityCode(mutate(await traceabilityInput()), code);
  });

  it.each(["This cannot be left unmapped.", "This does not permit an unmapped rule."])(
    "recognizes additional normative prose: %s",
    async (clause) => {
      const input = await traceabilityInput();
      const documents = new Map(input.documents);
      const [file, source] = [...documents.entries()][0]!;
      documents.set(file, `${clause}\n${source}`);
      expectTraceabilityCode({ ...input, documents }, "normative-clause-unmapped");
    },
  );

  it("does not count an informational Markdown bullet as normative", async () => {
    const input = await traceabilityInput();
    const baseline = validateMilestone15Traceability(input).normativeClauseCount;
    const documents = new Map(input.documents);
    const [file, source] = [...documents.entries()][0]!;
    documents.set(file, `- Informational context for readers.\n${source}`);
    expect(validateMilestone15Traceability({ ...input, documents }).normativeClauseCount).toBe(
      baseline,
    );
  });

  it("preserves the exact 13-document inventory and valid relative Markdown links", async () => {
    const files = (await readdir(milestoneRoot)).filter((file) => file.endsWith(".md")).sort();
    expect(files).toHaveLength(13);
    const acceptanceSource = await readFile(acceptancePath, "utf8");
    const ownership = acceptanceSource.slice(
      acceptanceSource.indexOf("## Normative Source-Section Ownership"),
      acceptanceSource.indexOf("## Normative Traceability Matrix"),
    );
    const ownedFiles = [...ownership.matchAll(/^\| `([^`]+\.md)` \|/gmu)].map((match) => match[1]!);
    expect(ownedFiles).toHaveLength(13);
    expect(new Set(ownedFiles).size).toBe(13);
    expect([...ownedFiles].sort()).toEqual(files);
    for (const file of files) {
      const path = join(milestoneRoot, file);
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(/\[[^\]]*\]\((?!https?:|#)([^)]+\.md(?:#[^)]+)?)\)/gu)) {
        const target = match[1]!.split("#")[0]!;
        await expect(access(resolve(dirname(path), target))).resolves.toBeUndefined();
      }
    }
  });

  it("records accepted merged M15 while preserving the no-live-execution boundary", async () => {
    const adr = await readFile(join(repositoryRoot, "ARCHITECTURE_DECISIONS.md"), "utf8");
    const index = await readFile(join(repositoryRoot, "DOCUMENTATION_INDEX.md"), "utf8");
    const section = adr.slice(adr.indexOf("## ADR-0019"));
    expect(section).toContain("**Status:** Accepted");
    expect(index).toContain("**Implemented and merged.**");
    expect(index).toContain("ADR-0019 is Accepted");
    expect(index).toContain("live-execution authority are not authorized");
  });
});
