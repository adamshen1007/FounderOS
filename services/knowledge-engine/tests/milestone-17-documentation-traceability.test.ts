import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  MILESTONE_17_ACCEPTANCE_TRACEABILITY,
  type Milestone17AcceptanceTraceabilityRow,
} from "./support/milestone-17-traceability.js";

const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const milestoneDirectory = resolve(repositoryRoot, "docs/milestones/milestone-17");
const requiredDocuments = [
  "FounderOS_Milestone_17_Authorization_Decision_Authority_Design_v1.0.md",
  "FounderOS_Milestone_17_Implementation_Plan_v1.0.md",
  "FounderOS_Milestone_17_Authorization_Decision_Authority_Specification_v1.0.md",
  "FounderOS_Service_Identity_Evidence_Contract_v1.0.md",
  "FounderOS_Human_Approval_and_Authorization_Request_Contract_v1.0.md",
  "FounderOS_Authorization_Decision_Claim_Revocation_and_Verification_Contract_v1.0.md",
  "FounderOS_Milestone_17_Acceptance_Criteria_v1.0.md",
  "FounderOS_Milestone_17_Verification_Checklist_v1.0.md",
  "FounderOS_Milestone_17_Package_README_v1.0.md",
] as const;

function read(path: string): string {
  return readFileSync(resolve(repositoryRoot, path), "utf8");
}

function sourceModuleSpecifier(sourcePath: string, facadePath: string): string {
  const relativePath = relative(dirname(facadePath), sourcePath).replaceAll("\\", "/");
  const javascriptPath = relativePath.replace(/\.ts$/u, ".js");
  return javascriptPath.startsWith(".") ? javascriptPath : `./${javascriptPath}`;
}

function exportedDeclarationNames(source: string, path: string): ReadonlySet<string> {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  for (const statement of sourceFile.statements) {
    const exported =
      ts.canHaveModifiers(statement) &&
      ts
        .getModifiers(statement)
        ?.some((modifier: ts.Modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword);
    if (!exported) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
      }
    } else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isInterfaceDeclaration(statement) ||
        ts.isTypeAliasDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name !== undefined
    ) {
      names.add(statement.name.text);
    }
  }
  return names;
}

function facadeExportsSymbol(
  facadeSource: string,
  facadePath: string,
  sourcePath: string,
  symbol: string,
): boolean {
  const sourceFile = ts.createSourceFile(facadePath, facadeSource, ts.ScriptTarget.Latest, true);
  const expectedModule = sourceModuleSpecifier(sourcePath, facadePath);
  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const moduleSpecifier = statement.moduleSpecifier;
    if (moduleSpecifier === undefined || !ts.isStringLiteral(moduleSpecifier)) continue;
    if (moduleSpecifier.text !== expectedModule) continue;
    if (statement.exportClause === undefined) return true;
    if (
      ts.isNamedExports(statement.exportClause) &&
      statement.exportClause.elements.some((element) => element.name.text === symbol)
    ) {
      return true;
    }
  }
  return false;
}

function registeredTestCaseNames(source: string, path: string): ReadonlySet<string> {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  function isTestRegistrar(expression: ts.Expression): boolean {
    if (ts.isIdentifier(expression)) return expression.text === "it" || expression.text === "test";
    if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
      return false;
    }
    const owner = expression.expression.expression;
    return (
      ts.isIdentifier(owner) &&
      (owner.text === "it" || owner.text === "test") &&
      expression.expression.name.text === "each"
    );
  }
  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      isTestRegistrar(node.expression) &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      names.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

function structuralAnchorNames(source: string, path: string): ReadonlySet<string> {
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const names = new Set<string>();
  function addBindingName(name: ts.BindingName): void {
    if (ts.isIdentifier(name)) {
      names.add(name.text);
      return;
    }
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) addBindingName(element.name);
    }
  }
  function addPropertyName(name: ts.PropertyName | undefined): void {
    if (name !== undefined && (ts.isIdentifier(name) || ts.isStringLiteral(name))) {
      names.add(name.text);
    }
  }
  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node)) {
      addBindingName(node.name);
    } else if (
      ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      if (node.name !== undefined) names.add(node.name.text);
    } else if (
      ts.isMethodDeclaration(node) ||
      ts.isMethodSignature(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isPropertySignature(node)
    ) {
      addPropertyName(node.name);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return names;
}

describe("Milestone 17 documentation traceability", () => {
  it("keeps the complete versioned milestone document inventory", () => {
    for (const name of requiredDocuments) {
      const content = readFileSync(resolve(milestoneDirectory, name), "utf8");
      expect(content).toContain("Milestone 17");
      expect(content).toMatch(/v1\.0/iu);
    }
  });

  it("enforces an exact acceptance-to-contract-to-symbol-to-test mapping", () => {
    const acceptance = read(
      "docs/milestones/milestone-17/FounderOS_Milestone_17_Acceptance_Criteria_v1.0.md",
    );
    const verification = read(
      "docs/milestones/milestone-17/FounderOS_Milestone_17_Verification_Checklist_v1.0.md",
    );
    const acceptanceIds = [...acceptance.matchAll(/M17-AC-\d{3}/gu)].map((match) => match[0]);
    const verificationIds = [...verification.matchAll(/M17-AC-\d{3}/gu)].map((match) => match[0]);
    const mappedIds = MILESTONE_17_ACCEPTANCE_TRACEABILITY.map((row) => row.id);

    expect(mappedIds).toHaveLength(20);
    expect(new Set(mappedIds).size).toBe(mappedIds.length);
    expect([...mappedIds].sort()).toEqual([...new Set(acceptanceIds)].sort());
    expect([...mappedIds].sort()).toEqual([...new Set(verificationIds)].sort());

    const regressionRow = MILESTONE_17_ACCEPTANCE_TRACEABILITY.find(
      (row) => row.id === "M17-AC-019",
    );
    const rootGateEvidence = regressionRow?.verification?.find(
      (reference) => reference.path === "package.json",
    );
    expect(rootGateEvidence?.packageScripts).toEqual([
      "format:check",
      "lint",
      "build",
      "typecheck",
      "test",
      "verify:m15-predecessor-bound",
    ]);

    for (const row of MILESTONE_17_ACCEPTANCE_TRACEABILITY) {
      const normalizedRow: Milestone17AcceptanceTraceabilityRow = row;
      expect(row.contractPaths.length, row.id).toBeGreaterThan(0);
      expect(row.implementation.length, row.id).toBeGreaterThan(0);
      const publicSymbols = normalizedRow.publicSymbols ?? [];
      const tests = normalizedRow.tests ?? [];
      const verificationEvidence = normalizedRow.verification ?? [];
      expect(publicSymbols.length + verificationEvidence.length, row.id).toBeGreaterThan(0);
      expect(tests.length + verificationEvidence.length, row.id).toBeGreaterThan(0);
      for (const path of row.contractPaths) {
        expect(read(path).length, `${row.id}:${path}`).toBeGreaterThan(0);
      }
      for (const reference of row.implementation) {
        const source = read(reference.path);
        const anchors = structuralAnchorNames(source, reference.path);
        for (const anchor of reference.anchors) {
          expect(
            anchors.has(anchor),
            `${row.id}:${reference.path}:${anchor}:structural-anchor`,
          ).toBe(true);
        }
      }
      for (const reference of publicSymbols) {
        const source = read(reference.sourcePath);
        const facade = read(reference.facadePath);
        const declarations = exportedDeclarationNames(source, reference.sourcePath);
        for (const symbol of reference.symbols) {
          expect(
            declarations.has(symbol),
            `${row.id}:${reference.sourcePath}:${symbol}:declaration`,
          ).toBe(true);
          expect(
            facadeExportsSymbol(facade, reference.facadePath, reference.sourcePath, symbol),
            `${row.id}:${reference.facadePath}:${symbol}:facade`,
          ).toBe(true);
        }
      }
      for (const reference of tests) {
        const source = read(reference.path);
        const registeredCases = registeredTestCaseNames(source, reference.path);
        for (const testCase of reference.cases) {
          expect(
            registeredCases.has(testCase),
            `${row.id}:${reference.path}:${testCase}:exact-test-name`,
          ).toBe(true);
        }
      }
      for (const reference of verificationEvidence) {
        const source = read(reference.path);
        if (reference.anchors !== undefined) {
          const anchors = structuralAnchorNames(source, reference.path);
          for (const anchor of reference.anchors) {
            expect(
              anchors.has(anchor),
              `${row.id}:${reference.path}:${anchor}:verification-anchor`,
            ).toBe(true);
          }
        }
        if (reference.packageScripts !== undefined) {
          const packageJson = JSON.parse(source) as { scripts?: Record<string, unknown> };
          for (const script of reference.packageScripts) {
            expect(
              typeof packageJson.scripts?.[script] === "string" &&
                packageJson.scripts[script].length > 0,
              `${row.id}:${reference.path}:${script}:package-script`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("documents the exact package ownership and public implementation", () => {
    const specification = read(
      "docs/milestones/milestone-17/FounderOS_Milestone_17_Authorization_Decision_Authority_Specification_v1.0.md",
    );
    const schemaFacade = read("packages/knowledge-schema/src/index.ts");
    const engineFacade = read("services/knowledge-engine/src/index.ts");
    const engineAuthorizationDomain = read(
      "services/knowledge-engine/src/domain/execution-authorization.ts",
    );

    expect(specification).toContain("@founderos/knowledge-schema");
    expect(specification).toContain("@founderos/knowledge-engine");
    expect(schemaFacade).toContain('export * from "./authorization.js"');
    for (const exportedName of [
      "createInMemoryExecutionAuthorizationAuthority",
      "runDisabledExecutionAuthorizationHarness",
      "createExecutionAuthorizationDecision",
      "verifyExecutionAuthorizationClaim",
    ]) {
      expect(`${engineFacade}\n${engineAuthorizationDomain}`).toContain(exportedName);
      expect(specification).toContain(exportedName);
    }
  });

  it("updates repository navigation and records ADR-0021", () => {
    expect(read("README.md")).toContain("Milestone 17");
    expect(read("DOCUMENTATION_INDEX.md")).toContain(
      "Milestone 17 — Authorization Decision Authority Foundation",
    );
    expect(read("ARCHITECTURE_DECISIONS.md")).toContain(
      "ADR-0021: Use a process-local provider-neutral execution authorization authority",
    );
    expect(read("CHANGELOG.md")).toContain("Milestone 17");
  });

  it("states the non-production and no-execution boundary without placeholders", () => {
    const allDocumentation = requiredDocuments
      .map((name) => readFileSync(resolve(milestoneDirectory, name), "utf8"))
      .join("\n");
    expect(allDocumentation).toContain("process-local");
    expect(allDocumentation).toContain("non-production");
    expect(allDocumentation).toContain("No credential");
    expect(allDocumentation).not.toMatch(/TO[D]O|TB[D]|FIXM[E]|PLACEHOLD[E]R/iu);
    expect(allDocumentation).not.toMatch(/production[- ]ready|live[- ]ready/iu);
  });
});
