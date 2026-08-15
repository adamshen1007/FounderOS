export class Milestone15TraceabilityError extends Error {
  public constructor(public readonly code: string) {
    super(code);
    this.name = "Milestone15TraceabilityError";
  }
}

export interface Milestone15ScenarioMapping {
  readonly scenarioId: string;
  readonly requirements: readonly string[];
  readonly executableTestFile: string;
  readonly executableTestName: string;
}

export interface Milestone15TraceabilityInput {
  readonly acceptanceSource: string;
  readonly documents: ReadonlyMap<string, string>;
  readonly scenarioMappings: readonly Milestone15ScenarioMapping[];
  readonly executableTestCases: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface Milestone15TraceabilityReport {
  readonly requirements: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  readonly scenarios: readonly string[];
  readonly ownedDocuments: readonly string[];
  readonly normativeClauseCount: number;
}

const ACCEPTANCE_FILE = "FounderOS_Milestone_15_Acceptance_Criteria_v1.0.md";
const REQUIRED_HEADINGS = [
  "Normative Requirement Catalog",
  "Acceptance Criteria",
  "Verification Scenario Catalog",
  "Normative Source-Section Ownership",
  "Normative Traceability Matrix",
] as const;
const REQUIREMENT = /^M15-(?!AC-|SC-)[A-Z]+-\d{3}$/u;
const ACCEPTANCE = /^M15-AC-[A-Z]+-\d{3}$/u;
const SCENARIO = /^M15-SC-(\d{3})$/u;
const NORMATIVE_TOKEN = /\b(?:must|shall|required|only|never|cannot)\b|\b(?:may|does|do) not\b/iu;

function fail(code: string): never {
  throw new Milestone15TraceabilityError(code);
}

function exactUnique(values: readonly string[], duplicateCode: string): void {
  if (new Set(values).size !== values.length) fail(duplicateCode);
}

function lines(source: string): readonly string[] {
  return source.replaceAll("\r\n", "\n").split("\n");
}

function section(source: string, heading: string, nextHeading?: string): string {
  const all = lines(source);
  const starts = all
    .map((line, index) => (line === `## ${heading}` ? index : -1))
    .filter((index) => index >= 0);
  if (starts.length === 0) fail("heading-missing");
  if (starts.length !== 1) fail("heading-duplicate");
  const start = starts[0]!;
  const end =
    nextHeading === undefined
      ? all.length
      : all.findIndex((line, index) => index > start && line === `## ${nextHeading}`);
  if (end < 0) fail("heading-order-invalid");
  return all.slice(start + 1, end).join("\n");
}

function splitTableRow(line: string): readonly string[] {
  if (!line.startsWith("|") || !line.endsWith("|")) fail("table-row-malformed");
  const cells: string[] = [];
  let cell = "";
  let inCode = false;
  for (const character of line.slice(1, -1)) {
    if (character === "`") inCode = !inCode;
    if (character === "|" && !inCode) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  if (inCode) fail("table-row-malformed");
  cells.push(cell.trim());
  return cells;
}

function unquote(value: string): string {
  const match = /^`([^`]+)`$/u.exec(value.trim());
  if (match === null) fail("identifier-malformed");
  return match[1]!;
}

function tableRows(source: string, columns: number): readonly (readonly string[])[] {
  return lines(source)
    .filter((line) => line.startsWith("| `"))
    .map((line) => {
      const cells = splitTableRow(line);
      if (cells.length !== columns) fail("table-row-malformed");
      return cells;
    });
}

function identifiers(value: string, pattern: RegExp, code: string): readonly string[] {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length === 0 || parts.some((part) => part === "")) fail(code);
  const result = parts.map(unquote);
  if (result.some((id) => !pattern.test(id))) fail(code);
  exactUnique(result, code);
  return result;
}

function normalizeHeading(value: string): string {
  return value.replace(/\s+\([^)]*M15-[^)]+\)\s*$/u, "").trim();
}

function markdownHeadings(source: string): readonly string[] {
  const result: string[] = [];
  let fence: "```" | "~~~" | null = null;
  for (const line of lines(source)) {
    const marker = /^\s*(```|~~~)/u.exec(line)?.[1] as "```" | "~~~" | undefined;
    if (marker !== undefined) {
      fence = fence === null ? marker : fence === marker ? null : fence;
      continue;
    }
    if (fence !== null) continue;
    const match = /^#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line);
    if (match !== null) result.push(normalizeHeading(match[1]!));
  }
  return result;
}

function parseOwnershipRequirements(
  value: string,
  known: ReadonlySet<string>,
  code: string,
): readonly string[] {
  if (
    value.trim() === "every requirement listed in the catalog" ||
    value.trim() === "every cataloged requirement"
  ) {
    return [...known].sort();
  }
  const result = identifiers(value, REQUIREMENT, code);
  if (result.some((id) => !known.has(id))) fail("ownership-unknown-requirement");
  return result;
}

interface Ownership {
  readonly defaults: readonly string[];
  readonly overrides: ReadonlyMap<string, readonly string[]>;
}

function parseOwnership(
  value: string,
  known: ReadonlySet<string>,
  documentSource: string,
): ReadonlyMap<string, readonly string[]> {
  const overrides = new Map<string, readonly string[]>();
  if (value.trim() === "") return overrides;
  const documentHeadings = markdownHeadings(documentSource);
  for (const entry of value.split(";").map((part) => part.trim())) {
    const arrows = entry.split("->");
    if (arrows.length !== 2 || arrows.some((part) => part.trim() === "")) {
      fail("ownership-override-malformed");
    }
    const headings = identifiers(arrows[0]!, /^.+$/u, "ownership-override-malformed");
    const requirements = parseOwnershipRequirements(
      arrows[1]!,
      known,
      "ownership-override-malformed",
    );
    for (const heading of headings) {
      if (documentHeadings.filter((candidate) => candidate === heading).length !== 1) {
        fail("ownership-override-heading-missing");
      }
      if (overrides.has(heading)) fail("ownership-override-duplicate");
      overrides.set(heading, requirements);
    }
  }
  return overrides;
}

function normativeClauses(source: string): readonly { heading: string | null; text: string }[] {
  const result: Array<{ heading: string | null; text: string }> = [];
  let heading: string | null = null;
  let fence: "```" | "~~~" | null = null;
  let listClause: { heading: string | null; text: string } | null = null;
  const flushList = () => {
    if (listClause !== null && NORMATIVE_TOKEN.test(listClause.text)) result.push(listClause);
    listClause = null;
  };
  for (const line of lines(source)) {
    const marker = /^\s*(```|~~~)/u.exec(line)?.[1] as "```" | "~~~" | undefined;
    if (marker !== undefined) {
      flushList();
      fence = fence === null ? marker : fence === marker ? null : fence;
      continue;
    }
    if (fence !== null) continue;
    const headingMatch = /^#{1,6}\s+(.+?)\s*#*\s*$/u.exec(line);
    if (headingMatch !== null) {
      flushList();
      heading = normalizeHeading(headingMatch[1]!);
      continue;
    }
    const listMatch = /^\s*(?:[-*+] |\d+[.)] )(.*)$/u.exec(line);
    if (listMatch !== null) {
      flushList();
      listClause = { heading, text: listMatch[1]!.trim() };
      continue;
    }
    if (listClause !== null && line.trim() !== "" && !line.startsWith("|")) {
      listClause = { ...listClause, text: `${listClause.text} ${line.trim()}` };
      continue;
    }
    flushList();
    if (line.startsWith("|")) {
      if (NORMATIVE_TOKEN.test(line)) result.push({ heading, text: line });
      continue;
    }
    for (const sentence of line.split(/(?<=[.!?])\s+/u)) {
      if (NORMATIVE_TOKEN.test(sentence)) result.push({ heading, text: sentence.trim() });
    }
  }
  flushList();
  return result;
}

function expandScenarioTargets(value: string, known: ReadonlySet<string>): readonly string[] {
  const expanded: string[] = [];
  for (const token of value.split(",").map((part) => part.trim())) {
    const match = /^`(M15-SC-(\d{3}))`(?:–`(M15-SC-(\d{3}))`)?$/u.exec(token);
    if (match === null) fail("traceability-target-malformed");
    const start = Number(match[2]);
    const end = match[4] === undefined ? start : Number(match[4]);
    if (start > end) fail("traceability-target-malformed");
    for (let number = start; number <= end; number += 1) {
      const id = `M15-SC-${String(number).padStart(3, "0")}`;
      if (!known.has(id)) fail("traceability-target-unknown");
      if (expanded.includes(id)) fail("traceability-target-duplicate");
      expanded.push(id);
    }
  }
  return expanded;
}

export function validateMilestone15Traceability(
  input: Milestone15TraceabilityInput,
): Milestone15TraceabilityReport {
  const headingPositions = REQUIRED_HEADINGS.map((heading) => {
    const matches = lines(input.acceptanceSource)
      .map((line, index) => (line === `## ${heading}` ? index : -1))
      .filter((index) => index >= 0);
    if (matches.length === 0) fail("heading-missing");
    if (matches.length !== 1) fail("heading-duplicate");
    return matches[0]!;
  });
  if (
    headingPositions.some(
      (position, index) => index > 0 && position <= headingPositions[index - 1]!,
    )
  ) {
    fail("heading-order-invalid");
  }

  const requirementRows = tableRows(
    section(input.acceptanceSource, REQUIRED_HEADINGS[0], REQUIRED_HEADINGS[1]),
    3,
  );
  const requirements = requirementRows.map((row) => unquote(row[0]!));
  if (requirements.some((id) => !REQUIREMENT.test(id))) fail("requirement-malformed");
  exactUnique(requirements, "requirement-duplicate");
  if (requirements.length !== 29) fail("requirement-cardinality-invalid");
  const requirementSet = new Set(requirements);
  const catalogAcceptance = requirementRows.map((row) => unquote(row[2]!));
  if (catalogAcceptance.some((id) => !ACCEPTANCE.test(id))) fail("acceptance-malformed");
  exactUnique(catalogAcceptance, "acceptance-duplicate");

  const acceptanceSection = section(
    input.acceptanceSource,
    REQUIRED_HEADINGS[1],
    REQUIRED_HEADINGS[2],
  );
  const acceptanceCriteria = lines(acceptanceSection)
    .map((line) => /^- \[ \] `(M15-AC-[A-Z]+-\d{3})`:/u.exec(line)?.[1])
    .filter((id): id is string => id !== undefined);
  exactUnique(acceptanceCriteria, "acceptance-duplicate");
  if (acceptanceCriteria.length !== 29) fail("acceptance-missing");
  if ([...catalogAcceptance].sort().join("\0") !== [...acceptanceCriteria].sort().join("\0")) {
    fail("requirement-acceptance-bijection-invalid");
  }

  const scenarioRows = tableRows(
    section(input.acceptanceSource, REQUIRED_HEADINGS[2], REQUIRED_HEADINGS[3]),
    4,
  );
  const scenarios = scenarioRows.map((row) => unquote(row[0]!));
  if (scenarios.some((id) => !SCENARIO.test(id))) fail("scenario-malformed");
  exactUnique(scenarios, "scenario-duplicate");
  if (scenarios.length !== 72) fail("scenario-cardinality-invalid");
  const expectedScenarios = Array.from(
    { length: 72 },
    (_, index) => `M15-SC-${String(index + 1).padStart(3, "0")}`,
  );
  if (scenarios.join("\0") !== expectedScenarios.join("\0")) fail("scenario-gap-or-order-invalid");
  const scenarioSet = new Set(scenarios);
  const scenarioRequirements = new Map<string, readonly string[]>();
  for (const row of scenarioRows) {
    const id = unquote(row[0]!);
    const references = identifiers(row[3]!, REQUIREMENT, "scenario-requirement-malformed");
    if (references.some((reference) => !requirementSet.has(reference))) {
      fail("scenario-requirement-unknown");
    }
    scenarioRequirements.set(id, references);
  }
  for (const requirement of requirements) {
    if (
      ![...scenarioRequirements.values()].some((references) => references.includes(requirement))
    ) {
      fail("requirement-without-scenario");
    }
  }

  const mappingIds = input.scenarioMappings.map((mapping) => mapping.scenarioId);
  exactUnique(mappingIds, "scenario-mapping-duplicate");
  if (mappingIds.join("\0") !== scenarios.join("\0")) fail("scenario-without-test");
  for (const mapping of input.scenarioMappings) {
    if (
      mapping.requirements.join("\0") !== scenarioRequirements.get(mapping.scenarioId)?.join("\0")
    ) {
      fail("scenario-mapping-requirements-mismatch");
    }
    const cases = input.executableTestCases.get(mapping.executableTestFile);
    if (cases === undefined) fail("test-file-missing");
    if (!cases.has(mapping.executableTestName)) fail("test-case-missing");
  }

  const documents = new Map(input.documents);
  documents.set(ACCEPTANCE_FILE, input.acceptanceSource);
  const markdownFiles = [...documents.keys()].filter((file) => file.endsWith(".md")).sort();
  if (markdownFiles.length !== 13) fail("document-cardinality-invalid");
  const ownershipRows = tableRows(
    section(input.acceptanceSource, REQUIRED_HEADINGS[3], REQUIRED_HEADINGS[4]),
    3,
  );
  const ownedDocuments = ownershipRows.map((row) => unquote(row[0]!));
  exactUnique(ownedDocuments, "ownership-document-duplicate");
  for (const file of ownedDocuments) {
    if (!documents.has(file)) fail("ownership-unlisted-document");
  }
  if (
    ownedDocuments.length !== 13 ||
    ownedDocuments.slice().sort().join("\0") !== markdownFiles.join("\0")
  ) {
    fail("ownership-document-inventory-mismatch");
  }
  const ownership = new Map<string, Ownership>();
  for (const row of ownershipRows) {
    const file = unquote(row[0]!);
    const source = documents.get(file)!;
    ownership.set(file, {
      defaults: parseOwnershipRequirements(row[1]!, requirementSet, "ownership-default-malformed"),
      overrides: parseOwnership(row[2]!, requirementSet, source),
    });
  }
  let normativeClauseCount = 0;
  for (const [file, source] of documents) {
    const rule = ownership.get(file);
    if (rule === undefined) fail("ownership-document-inventory-mismatch");
    for (const clause of normativeClauses(source)) {
      normativeClauseCount += 1;
      if (clause.heading === null) fail("normative-clause-unmapped");
      const owners = rule.overrides.get(clause.heading) ?? rule.defaults;
      if (owners.length === 0) fail("normative-clause-unmapped");
    }
  }

  const traceRows = tableRows(section(input.acceptanceSource, REQUIRED_HEADINGS[4]), 4);
  const traceRequirements = traceRows.map((row) => unquote(row[0]!));
  exactUnique(traceRequirements, "traceability-requirement-duplicate");
  if (traceRequirements.length !== 29) fail("traceability-requirement-missing");
  const traceAcceptance = traceRows.map((row) => unquote(row[1]!));
  exactUnique(traceAcceptance, "traceability-acceptance-duplicate");
  if (
    traceRequirements.slice().sort().join("\0") !== requirements.slice().sort().join("\0") ||
    traceAcceptance.slice().sort().join("\0") !== acceptanceCriteria.slice().sort().join("\0")
  ) {
    fail("traceability-bijection-invalid");
  }
  for (const row of traceRows) {
    const requirement = unquote(row[0]!);
    const acceptanceId = unquote(row[1]!);
    const catalogIndex = requirements.indexOf(requirement);
    if (catalogIndex < 0 || catalogAcceptance[catalogIndex] !== acceptanceId) {
      fail("traceability-bijection-invalid");
    }
    const expanded = expandScenarioTargets(row[2]!, scenarioSet);
    if (expanded.length === 0) fail("traceability-target-missing");
  }

  return {
    requirements,
    acceptanceCriteria,
    scenarios,
    ownedDocuments,
    normativeClauseCount,
  };
}
