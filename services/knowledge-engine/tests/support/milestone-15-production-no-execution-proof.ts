import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { builtinModules, createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

export type M15NoExecutionCapability = "network" | "credential";

export interface M15ProductionNoExecutionProof {
  readonly productionResult: string;
  readonly closure: {
    readonly entrypointRelativePaths: readonly string[];
    readonly moduleRelativePaths: readonly string[];
    readonly edgeCount: number;
    readonly fingerprint: string;
    readonly allowedCapabilityInventory: readonly string[];
  };
  readonly forbiddenFindings: readonly string[];
  readonly runtime: RuntimeCounts;
  readonly mutation: {
    readonly staticFindingKinds: readonly string[];
    readonly runtimeErrorCode: string;
    readonly runtimeCallCount: number;
  };
}

interface RuntimeCounts {
  readonly networkCallCount: number;
  readonly providerCallCount: number;
  readonly environmentSecretReadCount: number;
  readonly credentialResolutionCount: number;
  readonly authorizationHeaderConstructionCount: number;
}

interface MutableRuntimeCounts {
  networkCallCount: number;
  providerCallCount: number;
  environmentSecretReadCount: number;
  credentialResolutionCount: number;
  authorizationHeaderConstructionCount: number;
}

interface RuntimeGuardInstrumentation {
  readonly credentialBoundary: <T extends object>(target: T) => T;
  readonly headerBoundary: <T extends object>(target: T) => T;
}

class M15RuntimeGuardFailure extends Error {
  readonly counts: RuntimeCounts;

  constructor(message: string, counts: RuntimeCounts) {
    super(message);
    this.name = "M15RuntimeGuardFailure";
    this.counts = { ...counts };
  }
}

interface StaticFinding {
  readonly kind: string;
  readonly location: string;
  readonly detail: string;
}

interface ClosureInspection {
  readonly entrypointRelativePaths: readonly string[];
  readonly moduleRelativePaths: readonly string[];
  readonly edgeInventory: readonly string[];
  readonly allowedCapabilityInventory: readonly string[];
  readonly findings: readonly StaticFinding[];
  readonly fingerprint: string;
}

interface RuntimeModuleEdge {
  readonly node: ts.Node;
  readonly specifier: string | null;
  readonly form: string;
  readonly resolutionMode: "import" | "require";
}

interface WorkspacePackage {
  readonly directory: string;
  readonly name: string;
  readonly sourceEntrypoints: ReadonlyMap<string, string>;
}

type JsonValue =
  null | boolean | number | string | JsonValue[] | { readonly [key: string]: JsonValue };

interface PackageManifest {
  readonly name?: string;
  readonly main?: string;
  readonly exports?: JsonValue;
}

const WORKSPACE_PACKAGE_DIRECTORIES = [
  "packages/knowledge-schema",
  "services/knowledge-engine",
] as const;
const DEDICATED_PACKAGE_NAME = "@founderos/knowledge-engine";
const DEDICATED_EXPORT_KEY = "./readiness-ledger";
const NETWORK_MODULES = new Set([
  "dgram",
  "dns",
  "dns/promises",
  "http",
  "http2",
  "https",
  "net",
  "tls",
  "undici",
]);
const NETWORK_GLOBALS = new Set(["EventSource", "WebSocket", "fetch"]);
const UNAPPROVED_CRYPTO_CALLS = new Set([
  "generateKey",
  "generateKeyPair",
  "getRandomValues",
  "randomBytes",
  "randomFill",
  "randomFillSync",
  "randomInt",
  "randomUUID",
]);
const CREDENTIAL_CALLEES = new Set([
  "CredentialCache",
  "CredentialLease",
  "SecretClient",
  "SecretsManagerClient",
  "buildAuthorizationHeader",
  "createAuthorizationHeader",
  "getCredential",
  "getProviderCredential",
  "getSecret",
  "loadCredential",
  "loadSecret",
  "resolveCredential",
  "resolveProviderCredential",
  "resolveSecret",
]);
const PROVIDER_PACKAGE_NAMES = new Set([
  "@anthropic-ai/sdk",
  "@azure/identity",
  "@google-cloud/secret-manager",
  "@google/generative-ai",
  "@mistralai/mistralai",
  "cohere-ai",
  "openai",
]);
const BUILTIN_MODULES = new Set(
  builtinModules.flatMap((moduleName) => [moduleName, moduleName.replace(/^node:/u, "")]),
);
const CODE_EXTENSIONS = [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"] as const;
const requireFromHere = createRequire(import.meta.url);
const packageManifestCache = new Map<string, PackageManifest>();

function compareCanonicalStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function slashPath(path: string): string {
  return path.split(sep).join("/");
}

function relativePath(root: string, path: string): string {
  const candidate = slashPath(relative(root, path));
  return candidate === "" ? "." : candidate;
}

function literalText(node: ts.Expression | undefined): string | null {
  return node !== undefined && ts.isStringLiteralLike(node) ? node.text : null;
}

function propertyAccessName(node: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) return literalText(node.argumentExpression);
  return null;
}

function propertyAccessReceiver(node: ts.Expression): ts.Expression | null {
  return ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)
    ? node.expression
    : null;
}

function propertyNameText(name: ts.PropertyName | undefined): string | null {
  if (name === undefined) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  if (ts.isComputedPropertyName(name)) return literalText(name.expression);
  return null;
}

function hasRuntimeImport(node: ts.ImportDeclaration): boolean {
  const clause = node.importClause;
  if (clause === undefined) return true;
  if (clause.isTypeOnly) return false;
  if (clause.name !== undefined || clause.namedBindings === undefined) return true;
  return (
    ts.isNamespaceImport(clause.namedBindings) ||
    clause.namedBindings.elements.some((element) => !element.isTypeOnly)
  );
}

function hasRuntimeExport(node: ts.ExportDeclaration): boolean {
  if (node.isTypeOnly || node.moduleSpecifier === undefined) return false;
  if (node.exportClause === undefined || ts.isNamespaceExport(node.exportClause)) return true;
  return node.exportClause.elements.some((element) => !element.isTypeOnly);
}

function importBindings(node: ts.ImportDeclaration): readonly string[] {
  const clause = node.importClause;
  if (clause === undefined) return [];
  const names: string[] = [];
  if (clause.name !== undefined) names.push("default");
  if (clause.namedBindings !== undefined) {
    if (ts.isNamespaceImport(clause.namedBindings)) names.push("*");
    else {
      for (const element of clause.namedBindings.elements) {
        if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text);
      }
    }
  }
  return names.sort(compareCanonicalStrings);
}

function sourceLocation(repositoryRoot: string, sourceFile: ts.SourceFile, node: ts.Node): string {
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return `${relativePath(repositoryRoot, sourceFile.fileName)}:${position.line + 1}:${position.character + 1}`;
}

function collectNodes(sourceFile: ts.SourceFile): readonly ts.Node[] {
  const nodes: ts.Node[] = [];
  const visit = (node: ts.Node): void => {
    nodes.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return nodes;
}

function bindingNameForProperty(element: ts.BindingElement): string | null {
  return ts.isIdentifier(element.name) ? element.name.text : null;
}

function importedNameForBinding(element: ts.BindingElement): string | null {
  return propertyNameText(element.propertyName) ?? bindingNameForProperty(element);
}

function runtimeModuleSpecifiers(sourceFile: ts.SourceFile): readonly RuntimeModuleEdge[] {
  const nodes = collectNodes(sourceFile);
  const requireAliases = new Set(["require"]);
  const moduleNamespaces = new Set(["module"]);
  const createRequireAliases = new Set<string>();

  for (const node of nodes) {
    if (!ts.isImportDeclaration(node) || !hasRuntimeImport(node)) continue;
    const specifier = literalText(node.moduleSpecifier);
    if (specifier !== "node:module" && specifier !== "module") continue;
    const defaultBinding = node.importClause?.name;
    if (defaultBinding !== undefined) moduleNamespaces.add(defaultBinding.text);
    const bindings = node.importClause?.namedBindings;
    if (bindings !== undefined && ts.isNamespaceImport(bindings)) {
      moduleNamespaces.add(bindings.name.text);
    } else if (bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if ((element.propertyName ?? element.name).text === "createRequire") {
          createRequireAliases.add(element.name.text);
        }
      }
    }
  }

  const isModuleProperty = (expression: ts.Expression, property: string): boolean => {
    const receiver = propertyAccessReceiver(expression);
    return (
      receiver !== null &&
      ts.isIdentifier(receiver) &&
      moduleNamespaces.has(receiver.text) &&
      propertyAccessName(expression) === property
    );
  };
  const isCreateRequireCallee = (expression: ts.Expression): boolean =>
    (ts.isIdentifier(expression) && createRequireAliases.has(expression.text)) ||
    isModuleProperty(expression, "createRequire");
  const isRequireCall = (expression: ts.Expression): boolean =>
    ts.isIdentifier(expression) && requireAliases.has(expression.text);
  const isNodeModuleRequire = (expression: ts.Expression): boolean => {
    if (!isRequireCall(expression)) return false;
    const call = expression.parent;
    return (
      ts.isCallExpression(call) &&
      literalText(call.arguments[0])?.replace(/^node:/u, "") === "module"
    );
  };

  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (!ts.isVariableDeclaration(node) || node.initializer === undefined) continue;
      const initializer = node.initializer;
      if (ts.isIdentifier(node.name)) {
        const localName = node.name.text;
        if (ts.isIdentifier(initializer) && requireAliases.has(initializer.text)) {
          if (!requireAliases.has(localName)) {
            requireAliases.add(localName);
            changed = true;
          }
        } else if (isModuleProperty(initializer, "require")) {
          if (!requireAliases.has(localName)) {
            requireAliases.add(localName);
            changed = true;
          }
        } else if (isModuleProperty(initializer, "createRequire")) {
          if (!createRequireAliases.has(localName)) {
            createRequireAliases.add(localName);
            changed = true;
          }
        } else if (ts.isIdentifier(initializer) && createRequireAliases.has(initializer.text)) {
          if (!createRequireAliases.has(localName)) {
            createRequireAliases.add(localName);
            changed = true;
          }
        } else if (
          ts.isCallExpression(initializer) &&
          isCreateRequireCallee(initializer.expression)
        ) {
          if (!requireAliases.has(localName)) {
            requireAliases.add(localName);
            changed = true;
          }
        } else if (
          ts.isCallExpression(initializer) &&
          isNodeModuleRequire(initializer.expression)
        ) {
          if (!moduleNamespaces.has(localName)) {
            moduleNamespaces.add(localName);
            changed = true;
          }
        }
      } else if (ts.isObjectBindingPattern(node.name)) {
        const initializerIsModule =
          (ts.isIdentifier(initializer) && moduleNamespaces.has(initializer.text)) ||
          (ts.isCallExpression(initializer) && isNodeModuleRequire(initializer.expression));
        if (!initializerIsModule) continue;
        for (const element of node.name.elements) {
          const localName = bindingNameForProperty(element);
          const importedName = importedNameForBinding(element);
          if (localName === null) continue;
          if (importedName === "createRequire" && !createRequireAliases.has(localName)) {
            createRequireAliases.add(localName);
            changed = true;
          }
          if (importedName === "require" && !requireAliases.has(localName)) {
            requireAliases.add(localName);
            changed = true;
          }
        }
      }
    }
  }

  const result: RuntimeModuleEdge[] = [];
  for (const node of nodes) {
    if (ts.isImportDeclaration(node) && hasRuntimeImport(node)) {
      result.push({
        node,
        specifier: literalText(node.moduleSpecifier),
        form: "import",
        resolutionMode: "import",
      });
      continue;
    }
    if (ts.isExportDeclaration(node) && hasRuntimeExport(node)) {
      result.push({
        node,
        specifier: literalText(node.moduleSpecifier),
        form: "re-export",
        resolutionMode: "import",
      });
      continue;
    }
    if (ts.isImportEqualsDeclaration(node) && !node.isTypeOnly) {
      const reference = node.moduleReference;
      result.push({
        node,
        specifier:
          ts.isExternalModuleReference(reference) && reference.expression !== undefined
            ? literalText(reference.expression)
            : null,
        form: "import-equals",
        resolutionMode: "require",
      });
      continue;
    }
    if (!ts.isCallExpression(node)) continue;
    if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      result.push({
        node,
        specifier: literalText(node.arguments[0]),
        form: "dynamic-import",
        resolutionMode: "import",
      });
      continue;
    }
    if (isCreateRequireCallee(node.expression)) continue;
    if (ts.isCallExpression(node.expression) && isCreateRequireCallee(node.expression.expression)) {
      result.push({
        node,
        specifier: literalText(node.arguments[0]),
        form: "create-require-inline",
        resolutionMode: "require",
      });
      continue;
    }
    if (isRequireCall(node.expression)) {
      result.push({
        node,
        specifier: literalText(node.arguments[0]),
        form:
          ts.isIdentifier(node.expression) && node.expression.text === "require"
            ? "require"
            : "require-alias",
        resolutionMode: "require",
      });
      continue;
    }
    const receiver = propertyAccessReceiver(node.expression);
    const property = propertyAccessName(node.expression);
    if (
      receiver !== null &&
      ts.isIdentifier(receiver) &&
      moduleNamespaces.has(receiver.text) &&
      property === "require"
    ) {
      result.push({
        node,
        specifier: literalText(node.arguments[0]),
        form: "module-require",
        resolutionMode: "require",
      });
      continue;
    }
    if (
      receiver !== null &&
      ts.isIdentifier(receiver) &&
      requireAliases.has(receiver.text) &&
      property === "resolve"
    ) {
      result.push({
        node,
        specifier: literalText(node.arguments[0]),
        form: "require-resolve",
        resolutionMode: "require",
      });
    }
  }
  return result;
}

function isEnvironmentObject(node: ts.Expression): boolean {
  const property = propertyAccessName(node);
  const receiver = propertyAccessReceiver(node);
  if (property !== "env" || receiver === null) return false;
  if (ts.isIdentifier(receiver)) {
    return receiver.text === "process" || receiver.text === "Bun" || receiver.text === "Deno";
  }
  return ts.isMetaProperty(receiver) && receiver.keywordToken === ts.SyntaxKind.ImportKeyword;
}

function isSecretEnvironmentName(name: string): boolean {
  return /(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|PRIVATE[_-]?KEY|ACCESS[_-]?KEY)/iu.test(
    name,
  );
}

function environmentSecretAccess(node: ts.Node): string | null {
  if (
    (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
    isEnvironmentObject(node.expression)
  ) {
    const name = propertyAccessName(node);
    return name !== null && isSecretEnvironmentName(name) ? name : null;
  }
  if (!ts.isPropertyAccessExpression(node) && !ts.isElementAccessExpression(node)) return null;
  if (!isEnvironmentObject(node)) return null;
  const parent = node.parent;
  if (
    (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) &&
    parent.expression === node
  ) {
    return null;
  }
  return "*";
}

function isHeaderContainer(objectLiteral: ts.ObjectLiteralExpression): boolean {
  const parent = objectLiteral.parent;
  if (ts.isPropertyAssignment(parent)) {
    return /^(?:headers|httpHeaders|requestHeaders)$/iu.test(propertyNameText(parent.name) ?? "");
  }
  if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
    return /^(?:headers|httpHeaders|requestHeaders)$/iu.test(parent.name.text);
  }
  return false;
}

function objectLiteralHasAuthorizationHeader(objectLiteral: ts.ObjectLiteralExpression): boolean {
  return objectLiteral.properties.some(
    (property) =>
      (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) &&
      /^authorization$/iu.test(propertyNameText(property.name) ?? ""),
  );
}

function isContextualHeaderReceiver(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return /^(?:headers|httpHeaders|requestHeaders)$/iu.test(expression.text);
  }
  return /^headers$/iu.test(propertyAccessName(expression) ?? "");
}

function isContextualCredentialReceiver(expression: ts.Expression): boolean {
  if (ts.isIdentifier(expression)) {
    return /(?:credential|secret)(?:Client|Resolver|Cache|Lease)?$/iu.test(expression.text);
  }
  return /(?:credential|secret)(?:Client|Resolver|Cache|Lease)?$/iu.test(
    propertyAccessName(expression) ?? "",
  );
}

function isAuthorizationHeaderConstruction(node: ts.Node): boolean {
  if (ts.isPropertyAssignment(node)) {
    return (
      /^authorization$/iu.test(propertyNameText(node.name) ?? "") &&
      ts.isObjectLiteralExpression(node.parent) &&
      isHeaderContainer(node.parent)
    );
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
    const property = propertyAccessName(node.left);
    const receiver = propertyAccessReceiver(node.left);
    if (
      property !== null &&
      /^headers$/iu.test(property) &&
      ts.isObjectLiteralExpression(node.right) &&
      objectLiteralHasAuthorizationHeader(node.right)
    ) {
      return true;
    }
    return (
      property !== null &&
      /^authorization$/iu.test(property) &&
      receiver !== null &&
      ts.isIdentifier(receiver) &&
      /^(?:headers|httpHeaders|requestHeaders)$/iu.test(receiver.text)
    );
  }
  if (ts.isCallExpression(node)) {
    const property = propertyAccessName(node.expression);
    const receiver = propertyAccessReceiver(node.expression);
    if (
      ts.isIdentifier(node.expression) &&
      node.expression.text === "Headers" &&
      node.arguments[0] !== undefined &&
      ts.isObjectLiteralExpression(node.arguments[0]) &&
      objectLiteralHasAuthorizationHeader(node.arguments[0])
    ) {
      return true;
    }
    return (
      (property === "set" || property === "append") &&
      receiver !== null &&
      isContextualHeaderReceiver(receiver) &&
      /^authorization$/iu.test(literalText(node.arguments[0]) ?? "")
    );
  }
  if (
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "Headers" &&
    node.arguments?.[0] !== undefined &&
    ts.isObjectLiteralExpression(node.arguments[0])
  ) {
    return objectLiteralHasAuthorizationHeader(node.arguments[0]);
  }
  return false;
}

function inspectSourceCapabilities(
  repositoryRoot: string,
  sourceFile: ts.SourceFile,
): readonly StaticFinding[] {
  const findings: StaticFinding[] = [];
  const record = (kind: string, node: ts.Node, detail: string): void => {
    findings.push({ kind, location: sourceLocation(repositoryRoot, sourceFile, node), detail });
  };
  for (const node of collectNodes(sourceFile)) {
    const environmentName = environmentSecretAccess(node);
    if (environmentName !== null) record("environment-secret-read", node, environmentName);
    if (isAuthorizationHeaderConstruction(node)) {
      record("authorization-header-construction", node, node.getText(sourceFile));
    }
    if (!ts.isCallExpression(node) && !ts.isNewExpression(node)) continue;
    const expression = node.expression;
    if (ts.isIdentifier(expression)) {
      if (NETWORK_GLOBALS.has(expression.text)) {
        record(`network-global-${expression.text.toLowerCase()}`, node, expression.text);
      }
      if (CREDENTIAL_CALLEES.has(expression.text)) {
        record("credential-resolution", node, expression.text);
      }
      if (expression.text === "eval" || expression.text === "Function") {
        record("unbounded-runtime-code-loading", node, expression.text);
      }
      if (UNAPPROVED_CRYPTO_CALLS.has(expression.text)) {
        record("unapproved-crypto-capability", node, expression.text);
      }
      continue;
    }
    const property = propertyAccessName(expression);
    const receiver = propertyAccessReceiver(expression);
    if (property !== null && CREDENTIAL_CALLEES.has(property)) {
      record("credential-resolution", node, property);
    }
    if (
      property !== null &&
      receiver !== null &&
      isContextualCredentialReceiver(receiver) &&
      /^(?:acquire|get|lease|load|read|resolve)$/iu.test(property)
    ) {
      record("credential-resolution", node, `${receiver.getText(sourceFile)}.${property}`);
    }
    if (property !== null && UNAPPROVED_CRYPTO_CALLS.has(property)) {
      record("unapproved-crypto-capability", node, property);
    }
    if (
      property !== null &&
      NETWORK_GLOBALS.has(property) &&
      receiver !== null &&
      ts.isIdentifier(receiver) &&
      (receiver.text === "globalThis" || receiver.text === "self" || receiver.text === "window")
    ) {
      record(`network-qualified-${property.toLowerCase()}`, node, `${receiver.text}.${property}`);
    }
  }
  return findings;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function readPackageManifest(packageDirectory: string): Promise<PackageManifest> {
  const cached = packageManifestCache.get(packageDirectory);
  if (cached !== undefined) return cached;
  const manifest = await readJson<PackageManifest>(join(packageDirectory, "package.json"));
  packageManifestCache.set(packageDirectory, manifest);
  return manifest;
}

function selectConditionalExport(value: JsonValue, conditions: readonly string[]): string | null {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const candidate of value) {
      const selected = selectConditionalExport(candidate, conditions);
      if (selected !== null) return selected;
    }
    return null;
  }
  if (value === null || typeof value !== "object") return null;
  const activeConditions = new Set(conditions);
  for (const [condition, candidate] of Object.entries(value)) {
    if (activeConditions.has(condition)) {
      const selected = selectConditionalExport(candidate, conditions);
      if (selected !== null) return selected;
    }
  }
  return null;
}

function selectPackageExport(
  exportsField: JsonValue,
  exportKey: string,
  conditions: readonly string[],
): string | null {
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    return exportKey === "." ? selectConditionalExport(exportsField, conditions) : null;
  }
  if (exportsField === null || typeof exportsField !== "object") return null;
  const keys = Object.keys(exportsField);
  if (!keys.some((key) => key.startsWith("."))) {
    return exportKey === "." ? selectConditionalExport(exportsField, conditions) : null;
  }
  const exact = exportsField[exportKey];
  if (exact !== undefined) return selectConditionalExport(exact, conditions);
  for (const key of keys.sort((left, right) => right.length - left.length)) {
    const star = key.indexOf("*");
    if (star === -1) continue;
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (!exportKey.startsWith(prefix) || !exportKey.endsWith(suffix)) continue;
    const replacement = exportKey.slice(prefix.length, exportKey.length - suffix.length);
    const target = selectConditionalExport(exportsField[key]!, conditions);
    if (target !== null) return target.replaceAll("*", replacement);
  }
  return null;
}

function mapBuildOutputToSource(input: {
  readonly packageDirectory: string;
  readonly outputTarget: string;
  readonly outDirectory: string;
  readonly rootDirectory: string;
}): string {
  const outputPath = resolve(input.packageDirectory, input.outputTarget);
  const relativeOutput = relative(resolve(input.packageDirectory, input.outDirectory), outputPath);
  if (relativeOutput.startsWith(`..${sep}`) || isAbsolute(relativeOutput)) {
    throw new Error(`published-entrypoint-outside-build-output:${input.outputTarget}`);
  }
  return resolve(
    input.packageDirectory,
    input.rootDirectory,
    relativeOutput.replace(/\.(?:mjs|cjs|js)$/u, ".ts"),
  );
}

async function readWorkspacePackages(repositoryRoot: string): Promise<readonly WorkspacePackage[]> {
  const packages: WorkspacePackage[] = [];
  for (const directory of WORKSPACE_PACKAGE_DIRECTORIES) {
    const packageDirectory = join(repositoryRoot, directory);
    const manifest = await readPackageManifest(packageDirectory);
    const build = await readJson<{
      readonly compilerOptions?: { readonly outDir?: unknown; readonly rootDir?: unknown };
    }>(join(packageDirectory, "tsconfig.build.json"));
    const outDirectory = build.compilerOptions?.outDir;
    const rootDirectory = build.compilerOptions?.rootDir;
    if (
      typeof manifest.name !== "string" ||
      typeof outDirectory !== "string" ||
      typeof rootDirectory !== "string" ||
      manifest.exports === undefined
    ) {
      throw new Error(`published-entrypoint-metadata-invalid:${directory}`);
    }
    const sourceEntrypoints = new Map<string, string>();
    const exportsField = manifest.exports;
    const exportKeys =
      exportsField !== null && typeof exportsField === "object" && !Array.isArray(exportsField)
        ? Object.keys(exportsField).filter((key) => key.startsWith("."))
        : ["."];
    for (const exportKey of exportKeys) {
      const outputTarget = selectPackageExport(exportsField, exportKey, [
        "node",
        "import",
        "default",
      ]);
      if (outputTarget === null) continue;
      const sourceEntrypoint = mapBuildOutputToSource({
        packageDirectory,
        outputTarget,
        outDirectory,
        rootDirectory,
      });
      if (!ts.sys.fileExists(sourceEntrypoint)) {
        throw new Error(
          `published-source-entrypoint-missing:${relativePath(repositoryRoot, sourceEntrypoint)}`,
        );
      }
      const specifier =
        exportKey === "." ? manifest.name : `${manifest.name}/${exportKey.replace(/^\.\//u, "")}`;
      sourceEntrypoints.set(specifier, sourceEntrypoint);
    }
    packages.push({ directory: packageDirectory, name: manifest.name, sourceEntrypoints });
  }
  return packages;
}

function packageNameAndExportKey(specifier: string): {
  readonly packageName: string;
  readonly exportKey: string;
} {
  const parts = specifier.split("/");
  const packageName = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]!;
  const subpath = parts.slice(specifier.startsWith("@") ? 2 : 1).join("/");
  return { packageName, exportKey: subpath === "" ? "." : `./${subpath}` };
}

async function findOwningPackageDirectory(path: string): Promise<string | null> {
  let current = dirname(path);
  while (true) {
    if (ts.sys.fileExists(join(current, "package.json"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

async function findInstalledPackageDirectory(
  containingFile: string,
  packageName: string,
): Promise<string | null> {
  const owner = await findOwningPackageDirectory(containingFile);
  if (owner !== null) {
    const ownerManifest = await readPackageManifest(owner);
    if (ownerManifest.name === packageName) return owner;
  }
  const segments = packageName.split("/");
  let current = dirname(containingFile);
  while (true) {
    const candidate = join(current, "node_modules", ...segments);
    if (ts.sys.fileExists(join(candidate, "package.json"))) return candidate;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveRuntimeFile(candidate: string, allowTypeScript: boolean): string | null {
  const extensions = allowTypeScript ? CODE_EXTENSIONS : CODE_EXTENSIONS.slice(3);
  if (ts.sys.fileExists(candidate)) return candidate;
  if (extname(candidate) === "") {
    for (const extension of extensions) {
      const file = `${candidate}${extension}`;
      if (ts.sys.fileExists(file)) return file;
    }
  }
  if (ts.sys.directoryExists(candidate)) {
    for (const extension of extensions) {
      const file = join(candidate, `index${extension}`);
      if (ts.sys.fileExists(file)) return file;
    }
  }
  return null;
}

function resolveRelativeModule(specifier: string, containingFile: string): string | null {
  const direct = resolveRuntimeFile(resolve(dirname(containingFile), specifier), true);
  if (direct !== null) return direct;
  const resolved = ts.resolveModuleName(
    specifier,
    containingFile,
    {
      allowJs: true,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      target: ts.ScriptTarget.ES2022,
    },
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  return resolved !== undefined && !resolved.endsWith(".d.ts") ? resolved : null;
}

async function resolveInstalledPackageModule(input: {
  readonly containingFile: string;
  readonly specifier: string;
  readonly resolutionMode: "import" | "require";
}): Promise<string | null> {
  const { packageName, exportKey } = packageNameAndExportKey(input.specifier);
  const packageDirectory = await findInstalledPackageDirectory(input.containingFile, packageName);
  if (packageDirectory === null) return null;
  const manifest = await readPackageManifest(packageDirectory);
  const conditions =
    input.resolutionMode === "import"
      ? (["node", "import", "default"] as const)
      : (["node", "require", "default"] as const);
  const target =
    manifest.exports === undefined
      ? exportKey === "."
        ? (manifest.main ?? "./index.js")
        : exportKey
      : selectPackageExport(manifest.exports, exportKey, conditions);
  if (target === null || !target.startsWith("./")) return null;
  const absoluteTarget = resolve(packageDirectory, target);
  const relativeTarget = relative(packageDirectory, absoluteTarget);
  if (relativeTarget.startsWith(`..${sep}`) || isAbsolute(relativeTarget)) return null;
  return resolveRuntimeFile(absoluteTarget, false);
}

function runtimeEdgeBindings(
  sourceFile: ts.SourceFile,
  edge: RuntimeModuleEdge,
): readonly string[] {
  if (ts.isImportDeclaration(edge.node)) return importBindings(edge.node);
  if (!ts.isCallExpression(edge.node)) return [];
  const parent = edge.node.parent;
  if (!ts.isVariableDeclaration(parent)) return [];
  if (ts.isIdentifier(parent.name)) return ["*"];
  if (!ts.isObjectBindingPattern(parent.name)) return [];
  return parent.name.elements
    .map(importedNameForBinding)
    .filter((name): name is string => name !== null)
    .sort(compareCanonicalStrings);
}

function isProviderPackage(packageName: string): boolean {
  return PROVIDER_PACKAGE_NAMES.has(packageName) || packageName.startsWith("@aws-sdk/");
}

async function inspectClosure(input: {
  readonly repositoryRoot: string;
  readonly explicitEntrypoints?: readonly string[];
}): Promise<ClosureInspection> {
  const workspacePackages = await readWorkspacePackages(input.repositoryRoot);
  const workspaceEntrypoints = new Map<string, string>();
  for (const workspacePackage of workspacePackages) {
    for (const [specifier, entrypoint] of workspacePackage.sourceEntrypoints) {
      workspaceEntrypoints.set(specifier, entrypoint);
    }
  }
  const dedicatedEntrypoint = workspaceEntrypoints.get(
    `${DEDICATED_PACKAGE_NAME}/${DEDICATED_EXPORT_KEY.replace(/^\.\//u, "")}`,
  );
  if (dedicatedEntrypoint === undefined) {
    throw new Error("published-readiness-ledger-entrypoint-missing");
  }
  const entrypoints =
    input.explicitEntrypoints === undefined
      ? [dedicatedEntrypoint]
      : [...input.explicitEntrypoints];
  const pending = [...entrypoints];
  const visited = new Set<string>();
  const edges: string[] = [];
  const findings: StaticFinding[] = [];
  const allowedCapabilities: string[] = [];

  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    const sourceText = await readFile(current, "utf8");
    const sourceFile = ts.createSourceFile(
      current,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      current.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS,
    );
    findings.push(...inspectSourceCapabilities(input.repositoryRoot, sourceFile));

    for (const edge of runtimeModuleSpecifiers(sourceFile)) {
      const from = relativePath(input.repositoryRoot, current);
      if (edge.specifier === null) {
        findings.push({
          kind: `non-literal-${edge.form}`,
          location: sourceLocation(input.repositoryRoot, sourceFile, edge.node),
          detail: edge.node.getText(sourceFile),
        });
        continue;
      }
      const normalized = edge.specifier.replace(/^node:/u, "");
      if (BUILTIN_MODULES.has(normalized)) {
        edges.push(`${from}\t${edge.form}\t${edge.specifier}\tbuiltin`);
        if (NETWORK_MODULES.has(normalized)) {
          findings.push({
            kind: "network-module-import",
            location: sourceLocation(input.repositoryRoot, sourceFile, edge.node),
            detail: `${edge.form}:${edge.specifier}`,
          });
        }
        const bindings = runtimeEdgeBindings(sourceFile, edge);
        if (normalized === "fs" || normalized === "fs/promises" || normalized === "path") {
          allowedCapabilities.push(
            `local-file-${normalized.replace("/", "-")}|${sourceLocation(input.repositoryRoot, sourceFile, edge.node)}|${edge.specifier}|${bindings.join(",")}`,
          );
        }
        if (normalized === "crypto") {
          if (bindings.length > 0 && bindings.every((binding) => binding === "createHash")) {
            allowedCapabilities.push(
              `cryptographic-hashing|${sourceLocation(input.repositoryRoot, sourceFile, edge.node)}|${edge.specifier}|${bindings.join(",")}`,
            );
          } else {
            findings.push({
              kind: "unapproved-crypto-capability",
              location: sourceLocation(input.repositoryRoot, sourceFile, edge.node),
              detail: bindings.length === 0 ? "unbounded" : bindings.join(","),
            });
          }
        }
        continue;
      }

      const workspaceEntrypoint = workspaceEntrypoints.get(edge.specifier);
      if (workspaceEntrypoint !== undefined) {
        edges.push(
          `${from}\t${edge.form}\t${edge.specifier}\t${relativePath(input.repositoryRoot, workspaceEntrypoint)}`,
        );
        pending.push(workspaceEntrypoint);
        continue;
      }

      let resolvedModule: string | null;
      if (edge.specifier.startsWith(".") || edge.specifier.startsWith("/")) {
        resolvedModule = resolveRelativeModule(edge.specifier, current);
      } else {
        const { packageName } = packageNameAndExportKey(edge.specifier);
        if (isProviderPackage(packageName)) {
          findings.push({
            kind: "provider-sdk-package",
            location: sourceLocation(input.repositoryRoot, sourceFile, edge.node),
            detail: edge.specifier,
          });
        }
        resolvedModule = await resolveInstalledPackageModule({
          containingFile: current,
          specifier: edge.specifier,
          resolutionMode: edge.resolutionMode,
        });
      }
      if (resolvedModule === null) {
        findings.push({
          kind: "unresolved-runtime-module",
          location: sourceLocation(input.repositoryRoot, sourceFile, edge.node),
          detail: `${edge.form}:${edge.specifier}`,
        });
        continue;
      }
      const target = relativePath(input.repositoryRoot, resolvedModule);
      edges.push(`${from}\t${edge.form}\t${edge.specifier}\t${target}`);
      if (CODE_EXTENSIONS.includes(extname(resolvedModule) as (typeof CODE_EXTENSIONS)[number])) {
        pending.push(resolvedModule);
      }
    }
  }

  const entrypointRelativePaths = entrypoints
    .map((path) => relativePath(input.repositoryRoot, path))
    .sort(compareCanonicalStrings);
  const moduleRelativePaths = [...visited]
    .map((path) => relativePath(input.repositoryRoot, path))
    .sort(compareCanonicalStrings);
  const edgeInventory = edges.sort(compareCanonicalStrings);
  const allowedCapabilityInventory = [...new Set(allowedCapabilities)].sort(
    compareCanonicalStrings,
  );
  const sortedFindings = findings.sort((left, right) =>
    compareCanonicalStrings(
      `${left.kind}|${left.location}|${left.detail}`,
      `${right.kind}|${right.location}|${right.detail}`,
    ),
  );
  const fingerprint = createHash("sha256")
    .update(
      [
        ...entrypointRelativePaths.map((path) => `entrypoint\t${path}`),
        ...moduleRelativePaths.map((path) => `module\t${path}`),
        ...edgeInventory.map((edge) => `edge\t${edge}`),
        ...allowedCapabilityInventory.map((capability) => `allowed\t${capability}`),
      ].join("\n") + "\n",
    )
    .digest("hex");
  return {
    entrypointRelativePaths,
    moduleRelativePaths,
    edgeInventory,
    allowedCapabilityInventory,
    findings: sortedFindings,
    fingerprint,
  };
}

function emptyRuntimeCounts(): MutableRuntimeCounts {
  return {
    networkCallCount: 0,
    providerCallCount: 0,
    environmentSecretReadCount: 0,
    credentialResolutionCount: 0,
    authorizationHeaderConstructionCount: 0,
  };
}

function hasAuthorizationHeaderValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) {
    return value.some(
      (entry) =>
        Array.isArray(entry) && typeof entry[0] === "string" && /^authorization$/iu.test(entry[0]),
    );
  }
  if (typeof value !== "object") return false;
  if (value instanceof Headers) return value.has("authorization");
  return Object.keys(value).some((key) => /^authorization$/iu.test(key));
}

function createRuntimeGuardInstrumentation(
  counts: MutableRuntimeCounts,
): RuntimeGuardInstrumentation {
  return {
    credentialBoundary<T extends object>(target: T): T {
      return new Proxy(target, {
        get(candidate, property, receiver) {
          const value = Reflect.get(candidate, property, receiver);
          if (typeof value !== "function") return value;
          return () => {
            counts.credentialResolutionCount += 1;
            throw new Error("m15-credential-runtime-call:credential-resolution");
          };
        },
      });
    },
    headerBoundary<T extends object>(target: T): T {
      return new Proxy(target, {
        get(candidate, property, receiver) {
          const value = Reflect.get(candidate, property, receiver);
          if (
            typeof value === "function" &&
            typeof property === "string" &&
            /^(?:append|set)$/iu.test(property)
          ) {
            return (name: unknown, ..._arguments: readonly unknown[]) => {
              if (typeof name === "string" && /^authorization$/iu.test(name)) {
                counts.authorizationHeaderConstructionCount += 1;
                throw new Error("m15-credential-runtime-call:authorization-header-construction");
              }
              return Reflect.apply(value, candidate, [name, ..._arguments]);
            };
          }
          return typeof value === "function" ? value.bind(candidate) : value;
        },
        set(candidate, property, value, receiver) {
          if (
            typeof property === "string" &&
            /^headers$/iu.test(property) &&
            hasAuthorizationHeaderValue(value)
          ) {
            counts.authorizationHeaderConstructionCount += 1;
            throw new Error("m15-credential-runtime-call:authorization-header-construction");
          }
          return Reflect.set(candidate, property, value, receiver);
        },
      });
    },
  };
}

function inspectRuntimeCredentialResult(
  value: unknown,
  counts: MutableRuntimeCounts,
  seen = new Set<object>(),
): void {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (value instanceof Headers) {
    if (value.has("authorization")) {
      counts.authorizationHeaderConstructionCount += 1;
      throw new Error("m15-credential-runtime-call:authorization-header-construction");
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (
      /^(?:headers|httpHeaders|requestHeaders)$/iu.test(key) &&
      child !== null &&
      typeof child === "object"
    ) {
      if (Object.keys(child).some((header) => /^authorization$/iu.test(header))) {
        counts.authorizationHeaderConstructionCount += 1;
        throw new Error("m15-credential-runtime-call:authorization-header-construction");
      }
    }
    inspectRuntimeCredentialResult(child, counts, seen);
  }
}

async function runWithRuntimeGuards<T>(
  operation: (instrumentation: RuntimeGuardInstrumentation) => Promise<T>,
): Promise<{
  readonly result: T;
  readonly counts: RuntimeCounts;
}> {
  const counts = emptyRuntimeCounts();
  const restorations: (() => void)[] = [];
  const originalEnvironment = process.env;
  process.env = new Proxy(originalEnvironment, {
    get(target, property, receiver) {
      if (typeof property === "string" && isSecretEnvironmentName(property)) {
        counts.environmentSecretReadCount += 1;
        counts.credentialResolutionCount += 1;
        throw new Error("m15-credential-runtime-call:environment-secret-read");
      }
      return Reflect.get(target, property, receiver);
    },
    has(target, property) {
      if (typeof property === "string" && isSecretEnvironmentName(property)) {
        counts.environmentSecretReadCount += 1;
        counts.credentialResolutionCount += 1;
        throw new Error("m15-credential-runtime-call:environment-secret-read");
      }
      return Reflect.has(target, property);
    },
    ownKeys() {
      counts.environmentSecretReadCount += 1;
      counts.credentialResolutionCount += 1;
      throw new Error("m15-credential-runtime-call:environment-secret-read");
    },
  });
  restorations.push(() => {
    process.env = originalEnvironment;
  });
  const instrumentation = createRuntimeGuardInstrumentation(counts);

  const patch = (
    target: Record<PropertyKey, unknown>,
    property: PropertyKey,
    label: string,
  ): void => {
    const original = target[property];
    if (typeof original !== "function") return;
    target[property] = () => {
      counts.networkCallCount += 1;
      counts.providerCallCount += 1;
      throw new Error(`m15-network-runtime-call:${label}`);
    };
    restorations.push(() => {
      target[property] = original;
    });
  };

  patch(globalThis as unknown as Record<PropertyKey, unknown>, "fetch", "fetch");
  patch(globalThis as unknown as Record<PropertyKey, unknown>, "WebSocket", "WebSocket");
  patch(globalThis as unknown as Record<PropertyKey, unknown>, "EventSource", "EventSource");
  const globalRecord = globalThis as unknown as Record<PropertyKey, unknown>;
  const originalHeaders = globalRecord.Headers;
  if (typeof originalHeaders === "function") {
    globalRecord.Headers = new Proxy(originalHeaders, {
      apply(target, thisArgument, argumentsList) {
        if (hasAuthorizationHeaderValue(argumentsList[0])) {
          counts.authorizationHeaderConstructionCount += 1;
          throw new Error("m15-credential-runtime-call:authorization-header-construction");
        }
        return Reflect.apply(target, thisArgument, argumentsList);
      },
      construct(target, argumentsList, newTarget) {
        if (hasAuthorizationHeaderValue(argumentsList[0])) {
          counts.authorizationHeaderConstructionCount += 1;
          throw new Error("m15-credential-runtime-call:authorization-header-construction");
        }
        return Reflect.construct(target, argumentsList, newTarget);
      },
    });
    restorations.push(() => {
      globalRecord.Headers = originalHeaders;
    });
  }
  for (const [moduleName, properties] of [
    ["node:http", ["get", "request"]],
    ["node:https", ["get", "request"]],
    ["node:net", ["connect", "createConnection"]],
    ["node:tls", ["connect"]],
    ["node:dns", ["lookup", "resolve", "resolve4", "resolve6", "resolveAny"]],
    ["node:dgram", ["createSocket"]],
    ["node:http2", ["connect"]],
  ] as const) {
    const runtimeModule = requireFromHere(moduleName) as Record<PropertyKey, unknown>;
    for (const property of properties) patch(runtimeModule, property, `${moduleName}:${property}`);
  }
  syncBuiltinESMExports();

  try {
    const result = await operation(instrumentation);
    inspectRuntimeCredentialResult(result, counts);
    return { result, counts };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("m15-") &&
      error.message.includes("-runtime-call:")
    ) {
      throw new M15RuntimeGuardFailure(error.message, counts);
    }
    throw error;
  } finally {
    for (const restore of restorations.reverse()) restore();
    syncBuiltinESMExports();
  }
}

async function captureGuardFailure(
  operation: (instrumentation: RuntimeGuardInstrumentation) => Promise<unknown>,
): Promise<M15RuntimeGuardFailure> {
  try {
    await runWithRuntimeGuards(operation);
  } catch (error) {
    if (error instanceof M15RuntimeGuardFailure) return error;
    throw error;
  }
  throw new Error("mutation-runtime-guard-did-not-fail");
}

async function exerciseNetworkMutation(input: {
  readonly repositoryRoot: string;
  readonly fixtureRoot: string;
}): Promise<M15ProductionNoExecutionProof["mutation"]> {
  const entrypointPath = join(input.fixtureRoot, "entrypoint.cjs");
  const namespaceEntrypointPath = join(input.fixtureRoot, "namespace-entrypoint.mjs");
  const aliasEntrypointPath = join(input.fixtureRoot, "alias-entrypoint.mjs");
  const inlineEntrypointPath = join(input.fixtureRoot, "inline-entrypoint.mjs");
  const defaultEntrypointPath = join(input.fixtureRoot, "default-entrypoint.mjs");
  await writeFile(
    entrypointPath,
    [
      "const load = require;",
      'load("./alias-leaf.cjs");',
      'module.require("./module-leaf.cjs");',
      'const moduleApi = require("node:module");',
      "const makeRequire = moduleApi.createRequire;",
      "const localLoad = makeRequire(__filename);",
      'localLoad("./create-require-leaf.cjs");',
      'require("./bare-leaf.cjs");',
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(join(input.fixtureRoot, "alias-leaf.cjs"), 'require("node:http");\n', "utf8");
  await writeFile(
    join(input.fixtureRoot, "module-leaf.cjs"),
    'exports.exercise = () => globalThis.fetch("https://mutation.invalid");\n',
    "utf8",
  );
  await writeFile(
    join(input.fixtureRoot, "create-require-leaf.cjs"),
    'exports.exercise = () => new WebSocket("wss://mutation.invalid");\n',
    "utf8",
  );
  await writeFile(
    join(input.fixtureRoot, "bare-leaf.cjs"),
    'exports.exercise = () => fetch("https://mutation.invalid");\n',
    "utf8",
  );
  await writeFile(
    namespaceEntrypointPath,
    [
      'import * as moduleApi from "node:module";',
      "const load = moduleApi.createRequire(import.meta.url);",
      'load("./namespace-leaf.cjs");',
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(input.fixtureRoot, "namespace-leaf.cjs"),
    'exports.exercise = () => new EventSource("https://mutation.invalid");\n',
    "utf8",
  );
  await writeFile(
    aliasEntrypointPath,
    [
      'import { createRequire as makeLoader } from "node:module";',
      "const copiedLoader = makeLoader;",
      "const load = copiedLoader(import.meta.url);",
      'load("./alias-create-require-leaf.cjs");',
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(input.fixtureRoot, "alias-create-require-leaf.cjs"),
    'exports.exercise = () => new globalThis.WebSocket("wss://mutation.invalid");\n',
    "utf8",
  );
  await writeFile(
    inlineEntrypointPath,
    [
      'import * as moduleApi from "node:module";',
      'moduleApi.createRequire(import.meta.url)("./crypto-leaf.cjs");',
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(input.fixtureRoot, "crypto-leaf.cjs"),
    "exports.exercise = () => globalThis.crypto.randomUUID();\n",
    "utf8",
  );
  await writeFile(
    defaultEntrypointPath,
    [
      'import moduleApi from "node:module";',
      "const load = moduleApi.createRequire(import.meta.url);",
      'load("./default-leaf.cjs");',
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(input.fixtureRoot, "default-leaf.cjs"),
    'exports.exercise = () => new globalThis.EventSource("https://mutation.invalid");\n',
    "utf8",
  );
  const inspection = await inspectClosure({
    repositoryRoot: input.repositoryRoot,
    explicitEntrypoints: [
      entrypointPath,
      namespaceEntrypointPath,
      aliasEntrypointPath,
      inlineEntrypointPath,
      defaultEntrypointPath,
    ],
  });
  const runtimePath = join(input.fixtureRoot, "runtime.mjs");
  await writeFile(
    runtimePath,
    'export function executeMutation() { return fetch("https://mutation.invalid"); }\n',
    "utf8",
  );
  const runtimeModule = (await import(
    `${pathToFileURL(runtimePath).href}?proof=${Date.now()}`
  )) as {
    readonly executeMutation: () => unknown;
  };
  const failure = await captureGuardFailure(async () => runtimeModule.executeMutation());
  return {
    staticFindingKinds: [...new Set(inspection.findings.map((finding) => finding.kind))].sort(
      compareCanonicalStrings,
    ),
    runtimeErrorCode: failure.message,
    runtimeCallCount: failure.counts.networkCallCount,
  };
}

async function exerciseCredentialMutation(input: {
  readonly repositoryRoot: string;
  readonly fixtureRoot: string;
}): Promise<M15ProductionNoExecutionProof["mutation"]> {
  const entrypointPath = join(input.fixtureRoot, "entrypoint.mjs");
  await writeFile(
    entrypointPath,
    [
      'export { readEnvironment } from "./environment.mjs";',
      'export { consumeClient, consumeResolver, consumeCache, consumeLease } from "./resolver.mjs";',
      'export { assignRequestHeader, constructHeaders, appendHeader, setHeader } from "./header.mjs";',
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(input.fixtureRoot, "environment.mjs"),
    "export function readEnvironment() { return process.env.FOUNDEROS_M15_MUTATION_SECRET; }\n",
    "utf8",
  );
  await writeFile(
    join(input.fixtureRoot, "resolver.mjs"),
    [
      'export function consumeClient(client) { client.getSecret(); return "ok"; }',
      'export function consumeResolver(credentialResolver) { credentialResolver.resolve(); return "ok"; }',
      'export function consumeCache(credentialCache) { credentialCache.get("credential"); return "ok"; }',
      'export function consumeLease(credentialLease) { credentialLease.read(); return "ok"; }',
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    join(input.fixtureRoot, "header.mjs"),
    [
      'export function assignRequestHeader(request) { request.headers = { Authorization: "Bearer credential" }; return "ok"; }',
      'export function constructHeaders() { new Headers({ authorization: "Bearer credential" }); return "ok"; }',
      'export function appendHeader(headers) { headers.append("AUTHORIZATION", "Bearer credential"); return "ok"; }',
      'export function setHeader(headers) { headers.set("authorization", "Bearer credential"); return "ok"; }',
      "",
    ].join("\n"),
    "utf8",
  );
  const inspection = await inspectClosure({
    repositoryRoot: input.repositoryRoot,
    explicitEntrypoints: [entrypointPath],
  });
  const module = (await import(`${pathToFileURL(entrypointPath).href}?proof=${Date.now()}`)) as {
    readonly readEnvironment: () => unknown;
    readonly consumeClient: (client: { readonly getSecret: () => string }) => unknown;
    readonly consumeResolver: (resolver: { readonly resolve: () => string }) => unknown;
    readonly consumeCache: (cache: { readonly get: (key: string) => string }) => unknown;
    readonly consumeLease: (lease: { readonly read: () => string }) => unknown;
    readonly assignRequestHeader: (request: { headers?: Record<string, string> }) => unknown;
    readonly constructHeaders: () => unknown;
    readonly appendHeader: (headers: {
      readonly append: (name: string, value: string) => void;
    }) => unknown;
    readonly setHeader: (headers: {
      readonly set: (name: string, value: string) => void;
    }) => unknown;
  };
  const failures: M15RuntimeGuardFailure[] = [];
  failures.push(await captureGuardFailure(async () => module.readEnvironment()));
  failures.push(
    await captureGuardFailure(async ({ credentialBoundary }) =>
      module.consumeClient(
        credentialBoundary({ getSecret: () => "credential-value-not-magic-sentinel" }),
      ),
    ),
  );
  failures.push(
    await captureGuardFailure(async ({ credentialBoundary }) =>
      module.consumeResolver(credentialBoundary({ resolve: () => "non-sentinel" })),
    ),
  );
  failures.push(
    await captureGuardFailure(async ({ credentialBoundary }) =>
      module.consumeCache(credentialBoundary({ get: () => "non-sentinel" })),
    ),
  );
  failures.push(
    await captureGuardFailure(async ({ credentialBoundary }) =>
      module.consumeLease(credentialBoundary({ read: () => "non-sentinel" })),
    ),
  );
  failures.push(
    await captureGuardFailure(async ({ headerBoundary }) =>
      module.assignRequestHeader(headerBoundary({})),
    ),
  );
  failures.push(await captureGuardFailure(async () => module.constructHeaders()));
  failures.push(
    await captureGuardFailure(async ({ headerBoundary }) =>
      module.appendHeader(headerBoundary({ append: () => undefined })),
    ),
  );
  failures.push(
    await captureGuardFailure(async ({ headerBoundary }) =>
      module.setHeader(headerBoundary({ set: () => undefined })),
    ),
  );
  return {
    staticFindingKinds: [...new Set(inspection.findings.map((finding) => finding.kind))].sort(
      compareCanonicalStrings,
    ),
    runtimeErrorCode: [...new Set(failures.map((failure) => failure.message))]
      .sort(compareCanonicalStrings)
      .join("|"),
    runtimeCallCount: failures.length,
  };
}

async function exerciseMutation(input: {
  readonly capability: M15NoExecutionCapability;
  readonly repositoryRoot: string;
}): Promise<M15ProductionNoExecutionProof["mutation"]> {
  const fixtureRoot = await mkdtemp(join(tmpdir(), "founderos-m15-no-execution-mutation-"));
  try {
    return input.capability === "network"
      ? await exerciseNetworkMutation({ repositoryRoot: input.repositoryRoot, fixtureRoot })
      : await exerciseCredentialMutation({ repositoryRoot: input.repositoryRoot, fixtureRoot });
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }
}

function formatFinding(finding: StaticFinding): string {
  return `${finding.kind}|${finding.location}|${finding.detail}`;
}

export async function proveM15ProductionNoExecution(input: {
  readonly capability: M15NoExecutionCapability;
  readonly repositoryRoot: string;
  readonly executeProductionScenario: () => Promise<string>;
}): Promise<M15ProductionNoExecutionProof> {
  const closure = await inspectClosure({ repositoryRoot: input.repositoryRoot });
  const capabilityPrefixes =
    input.capability === "network"
      ? ["network-", "provider-sdk-"]
      : ["authorization-header-", "credential-", "environment-secret-", "provider-sdk-"];
  const forbiddenFindings = closure.findings
    .filter(
      (finding) =>
        capabilityPrefixes.some((prefix) => finding.kind.startsWith(prefix)) ||
        finding.kind.startsWith("non-literal-") ||
        finding.kind === "unresolved-runtime-module" ||
        finding.kind === "unapproved-crypto-capability" ||
        finding.kind === "unbounded-runtime-code-loading",
    )
    .map(formatFinding);
  const runtime = await runWithRuntimeGuards(input.executeProductionScenario);
  const mutation = await exerciseMutation({
    capability: input.capability,
    repositoryRoot: input.repositoryRoot,
  });
  return {
    productionResult: runtime.result,
    closure: {
      entrypointRelativePaths: closure.entrypointRelativePaths,
      moduleRelativePaths: closure.moduleRelativePaths,
      edgeCount: closure.edgeInventory.length,
      fingerprint: closure.fingerprint,
      allowedCapabilityInventory: closure.allowedCapabilityInventory,
    },
    forbiddenFindings,
    runtime: runtime.counts,
    mutation,
  };
}
