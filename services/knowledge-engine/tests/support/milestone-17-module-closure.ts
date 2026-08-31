import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, isAbsolute, join, relative, resolve } from "node:path";

import ts from "typescript";

export interface TypeScriptModuleClosureEntry {
  readonly path: string;
  readonly source: string;
  readonly importSpecifiers: readonly string[];
}

const WORKSPACE_ENTRYPOINTS = new Map([
  ["@founderos/knowledge-engine", "services/knowledge-engine/src/index.ts"],
  ["@founderos/knowledge-schema", "packages/knowledge-schema/src/index.ts"],
]);
const PROHIBITED_FOUNDEROS_CAPABILITY =
  /(?:^|\/)(?:agent(?:-runtime)?|hermes(?:-runtime)?|mcp(?:-gateway)?|credential-(?:broker|resolver)|(?:openai|provider)-(?:adapter|client|sdk|transport))(?:[/.]|$)/iu;
const EXPLICITLY_SAFE_EXTERNAL_IMPORTS = new Set(["node:crypto", "zod"]);
const EXPLICITLY_SAFE_DYNAMIC_ACCESS_SOURCE_FINGERPRINTS = new Map([
  [
    "packages/knowledge-schema/src/authorization.ts",
    "0526486930aeb8a74e0767afa0a857e64dd664d07b462edbb52ec158a32c54b7",
  ],
  [
    "packages/knowledge-schema/src/canonical-json.ts",
    "025f6b5ed9c82e2a858bc21cf1a1cc24765ee6c27b32ba54e3ba76edb768013c",
  ],
  [
    "packages/knowledge-schema/src/context.ts",
    "f4e4d9e0a79ea05a571a6957aa72dacbb6a09706edbea64a5bc886accc100f60",
  ],
  [
    "packages/knowledge-schema/src/corpus.ts",
    "dd1a2c92339dd3200b94ad569ac05653211fd266022b2af64cfce7d1c084665e",
  ],
  [
    "packages/knowledge-schema/src/delivery.ts",
    "79a9ae4cbe5afd2c607761c780637149276e67beed45f93ebace590f5529979b",
  ],
  [
    "packages/knowledge-schema/src/durable-delivery-ledger.ts",
    "df6f519aaaaf7b9fb5b144151a2263ec37aa3f7cae182d7e214cb91a28f12730",
  ],
  [
    "packages/knowledge-schema/src/durable-readiness-ledger.ts",
    "471efc397f3a27635bed22a2980673e8a5ac9cada2c1b794aebd02876ad7c8e7",
  ],
  [
    "packages/knowledge-schema/src/durable-reasoning-ledger.ts",
    "ca71beb4a699a72a63397f9a0a865f6c2508a9e074e2016fc6d8cb162c58a135",
  ],
  [
    "packages/knowledge-schema/src/durable-registry.ts",
    "87ce0552433d5d07c15ccf2ec3e68ab6a58fb23306af303659b58fa07d630c67",
  ],
  [
    "packages/knowledge-schema/src/objects.ts",
    "3c1287ef8c321211ae1ce0d49bf13a3291d0bd8bb47a16c91b439f435e82fdc8",
  ],
  [
    "packages/knowledge-schema/src/provider-readiness.ts",
    "df93dc9dea4fc24af8a1f6d72e3ab367c9c8705551e0bf5e42126d7dc11c0736",
  ],
  [
    "packages/knowledge-schema/src/query-result.ts",
    "43f3f6a985b3884cb36101a13b69dd2bf0cf8a5bae2ddb8b62cc41e057b5bae8",
  ],
  [
    "packages/knowledge-schema/src/reasoning.ts",
    "53580bafad9f8b9d8b3cde63e2e2f2a9146624f32dff99172bf454139aeb4bdf",
  ],
  [
    "packages/knowledge-schema/src/snapshot-lifecycle.ts",
    "30d66402d29cdc3de805edc85ee1765a635e88d81e3184e508d01f597e4d3469",
  ],
  [
    "services/knowledge-engine/src/application/disabled-execution-authorization-harness.ts",
    "7c2eebc215e6ab93f77f0be83730b4dad90fa6b8daac9a55c955e94eb2d2b50e",
  ],
  [
    "services/knowledge-engine/src/application/in-memory-execution-authorization-authority.ts",
    "8187c8317d9dde2fd4c46b181bf230aef192512dc81420849adda298aec9ac3f",
  ],
  [
    "services/knowledge-engine/src/application/production-provider-readiness-input-safety.ts",
    "97bd5972df8ea6b9319e235fca52ebbade832cbfa29fe85e7a775674a8b4b47c",
  ],
  [
    "services/knowledge-engine/src/domain/execution-authorization.ts",
    "b33fcafe05e72505c5c7573cf0a85be08ce8c191fcc0d1d3a8b5c2ba120a091b",
  ],
]);
const NETWORK_GLOBAL_IDENTIFIERS = new Set([
  "EventSource",
  "WebSocket",
  "XMLHttpRequest",
  "fetch",
  "navigator",
]);
const RUNTIME_GLOBAL_IDENTIFIERS = new Set(["Bun", "Deno", "global", "globalThis", "process"]);
const ALTERNATIVE_MODULE_LOADER_MEMBERS = new Set([
  "Function",
  "constructor",
  "createRequire",
  "eval",
  "require",
]);
const EXPLICITLY_SAFE_REFLECTION_MEMBERS = new Map<string, ReadonlySet<string>>([
  [
    "packages/knowledge-schema/src/canonical-json.ts",
    new Set([
      "Array.prototype",
      "Object.getOwnPropertyDescriptor",
      "Object.getPrototypeOf",
      "Object.prototype",
      "Reflect.ownKeys",
    ]),
  ],
  [
    "packages/knowledge-schema/src/durable-readiness-ledger.ts",
    new Set(["Object.getOwnPropertyDescriptors", "Reflect.ownKeys"]),
  ],
  [
    "services/knowledge-engine/src/application/production-provider-readiness-input-safety.ts",
    new Set([
      "Object.getOwnPropertyDescriptors",
      "Object.getPrototypeOf",
      "Object.prototype",
      "Reflect.ownKeys",
    ]),
  ],
  ["services/knowledge-engine/src/domain/execution-authorization.ts", new Set(["Reflect.ownKeys"])],
]);
const REFLECTION_MEMBERS_REQUIRING_ALLOWLIST = new Set([
  "Object.create",
  "Object.getOwnPropertyDescriptor",
  "Object.getOwnPropertyDescriptors",
  "Object.getOwnPropertyNames",
  "Object.getOwnPropertySymbols",
  "Object.getPrototypeOf",
  "Object.setPrototypeOf",
  "Reflect.apply",
  "Reflect.construct",
  "Reflect.get",
  "Reflect.getPrototypeOf",
  "Reflect.ownKeys",
  "Reflect.setPrototypeOf",
]);

function repositoryPath(repositoryRoot: string, absolutePath: string): string {
  const path = relative(repositoryRoot, absolutePath).replaceAll("\\", "/");
  if (path === "" || path === ".." || path.startsWith("../") || isAbsolute(path)) {
    throw new Error(`Module closure escaped the repository: ${absolutePath}`);
  }
  return path;
}

function importSpecifiers(source: string): readonly string[] {
  const specifiers = new Set<string>();
  const sourceFile = ts.createSourceFile(
    "module.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression !== undefined &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      specifiers.add(node.moduleReference.expression.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteral(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return [...specifiers].sort();
}

function existingFile(candidates: readonly string[]): string {
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`Cannot resolve local TypeScript import: ${candidates.join(", ")}`);
}

function resolveLocalModule(
  repositoryRoot: string,
  importerPath: string,
  specifier: string,
): string | null {
  const workspaceEntrypoint = WORKSPACE_ENTRYPOINTS.get(specifier);
  if (workspaceEntrypoint !== undefined) return resolve(repositoryRoot, workspaceEntrypoint);
  if (specifier.startsWith("@founderos/")) {
    throw new Error(`Unresolved FounderOS workspace import: ${specifier}`);
  }
  if (!specifier.startsWith(".")) return null;

  const unresolved = resolve(dirname(importerPath), specifier);
  const extension = extname(unresolved);
  const sourceExtension = extension === ".js" ? ".ts" : extension === ".mjs" ? ".mts" : null;
  const candidates = [
    unresolved,
    ...(sourceExtension === null
      ? [`${unresolved}.ts`, join(unresolved, "index.ts")]
      : [`${unresolved.slice(0, -extension.length)}${sourceExtension}`]),
  ];
  const resolved = existingFile(candidates);
  repositoryPath(repositoryRoot, resolved);
  return resolved;
}

export function collectTransitiveTypeScriptModuleClosure(
  rawRepositoryRoot: string,
  entryPaths: readonly string[],
): readonly TypeScriptModuleClosureEntry[] {
  const repositoryRoot = resolve(rawRepositoryRoot);
  const pending = entryPaths.map((path) => resolve(repositoryRoot, path)).sort();
  const visited = new Set<string>();
  const entries: TypeScriptModuleClosureEntry[] = [];

  while (pending.length > 0) {
    const absolutePath = pending.shift();
    if (absolutePath === undefined || visited.has(absolutePath)) continue;
    const path = repositoryPath(repositoryRoot, absolutePath);
    const source = readFileSync(absolutePath, "utf8");
    const specifiers = importSpecifiers(source);
    visited.add(absolutePath);
    entries.push({ path, source, importSpecifiers: specifiers });
    for (const specifier of specifiers) {
      const dependency = resolveLocalModule(repositoryRoot, absolutePath, specifier);
      if (dependency !== null && !visited.has(dependency) && !pending.includes(dependency)) {
        pending.push(dependency);
        pending.sort();
      }
    }
  }

  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

export function findMilestone17CapabilityViolations(
  entries: readonly TypeScriptModuleClosureEntry[],
  options: {
    readonly additionalDynamicAccessSourceFingerprints?: ReadonlyMap<string, string>;
    readonly additionalSafeReflectionMembers?: ReadonlyMap<string, ReadonlySet<string>>;
    readonly requireCompleteDynamicAccessAllowlist?: boolean;
  } = {},
): readonly string[] {
  const violations = new Set<string>();
  const observedDynamicAccessAllowlistPaths = new Set<string>();
  for (const entry of entries) {
    const expectedDynamicAccessSourceFingerprint =
      options.additionalDynamicAccessSourceFingerprints?.get(entry.path) ??
      EXPLICITLY_SAFE_DYNAMIC_ACCESS_SOURCE_FINGERPRINTS.get(entry.path);
    const actualSourceFingerprint = createHash("sha256").update(entry.source).digest("hex");
    const dynamicAccessSourceIsAllowlisted =
      expectedDynamicAccessSourceFingerprint !== undefined &&
      expectedDynamicAccessSourceFingerprint === actualSourceFingerprint;
    if (expectedDynamicAccessSourceFingerprint !== undefined) {
      observedDynamicAccessAllowlistPaths.add(entry.path);
      if (!dynamicAccessSourceIsAllowlisted) {
        violations.add(`${entry.path}:dynamic-access-source-fingerprint-mismatch`);
      }
    }
    const observedSpecifiers = new Set([
      ...entry.importSpecifiers,
      ...importSpecifiers(entry.source),
    ]);
    for (const specifier of observedSpecifiers) {
      if (PROHIBITED_FOUNDEROS_CAPABILITY.test(specifier)) {
        violations.add(`${entry.path}:prohibited-founderos-capability:${specifier}`);
      }
      if (
        !specifier.startsWith(".") &&
        !specifier.startsWith("@founderos/") &&
        !EXPLICITLY_SAFE_EXTERNAL_IMPORTS.has(specifier)
      ) {
        violations.add(`${entry.path}:non-allowlisted-import:${specifier}`);
      }
    }
    const sourceFile = ts.createSourceFile(
      entry.path,
      entry.source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    function explicitPropertyName(node: ts.Expression): string | null {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
      if (ts.isParenthesizedExpression(node)) return explicitPropertyName(node.expression);
      return null;
    }
    const reflectionRootBindings = new Map<string, "Object" | "Reflect">();
    function reflectionRootName(node: ts.Expression): "Object" | "Reflect" | null {
      if (
        ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) ||
        ts.isNonNullExpression(node)
      ) {
        return reflectionRootName(node.expression);
      }
      if (!ts.isIdentifier(node)) return null;
      if (node.text === "Object" || node.text === "Reflect") return node.text;
      return reflectionRootBindings.get(node.text) ?? null;
    }
    function collectReflectionRootBindings(node: ts.Node): void {
      if (ts.isVariableDeclaration(node) && node.initializer !== undefined) {
        const root = reflectionRootName(node.initializer);
        if (root !== null && ts.isIdentifier(node.name)) {
          reflectionRootBindings.set(node.name.text, root);
        }
      }
      ts.forEachChild(node, collectReflectionRootBindings);
    }
    collectReflectionRootBindings(sourceFile);
    const reflectiveValueBindings = new Set<string>();
    const callableFactoryBindings = new Set<string>();
    const callableIdentityBindings = new Set<string>();
    const callableObjectMemberBindings = new Map<string, ReadonlySet<string>>();
    const callableArrayElementBindings = new Map<string, ReadonlySet<number>>();
    const callableParameterBindings = new Map<string, readonly string[]>();
    function directCallableValue(node: ts.Expression): boolean {
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isClassExpression(node)) {
        return true;
      }
      if (
        ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) ||
        ts.isNonNullExpression(node)
      ) {
        return directCallableValue(node.expression);
      }
      if (ts.isConditionalExpression(node)) {
        return directCallableValue(node.whenTrue) || directCallableValue(node.whenFalse);
      }
      return false;
    }
    function functionReturnsCallable(node: ts.FunctionLikeDeclaration): boolean {
      if (node.body === undefined) return false;
      if (!ts.isBlock(node.body)) return directCallableValue(node.body);
      return node.body.statements.some(
        (statement) =>
          ts.isReturnStatement(statement) &&
          statement.expression !== undefined &&
          directCallableValue(statement.expression),
      );
    }
    function functionReturnsItsParameter(node: ts.FunctionLikeDeclaration): boolean {
      if (node.parameters.length !== 1 || !ts.isIdentifier(node.parameters[0]!.name)) return false;
      const parameterName = node.parameters[0]!.name.text;
      if (node.body === undefined) return false;
      if (!ts.isBlock(node.body)) {
        return ts.isIdentifier(node.body) && node.body.text === parameterName;
      }
      return node.body.statements.some(
        (statement) =>
          ts.isReturnStatement(statement) &&
          statement.expression !== undefined &&
          ts.isIdentifier(statement.expression) &&
          statement.expression.text === parameterName,
      );
    }
    function collectCallableFactories(node: ts.Node): void {
      if (ts.isFunctionDeclaration(node) && node.name !== undefined) {
        reflectiveValueBindings.add(node.name.text);
        if (functionReturnsCallable(node)) callableFactoryBindings.add(node.name.text);
        if (functionReturnsItsParameter(node)) callableIdentityBindings.add(node.name.text);
        callableParameterBindings.set(
          node.name.text,
          node.parameters.map((parameter) =>
            ts.isIdentifier(parameter.name) ? parameter.name.text : "",
          ),
        );
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
      ) {
        if (functionReturnsCallable(node.initializer)) {
          callableFactoryBindings.add(node.name.text);
        }
        if (functionReturnsItsParameter(node.initializer)) {
          callableIdentityBindings.add(node.name.text);
        }
        callableParameterBindings.set(
          node.name.text,
          node.initializer.parameters.map((parameter) =>
            ts.isIdentifier(parameter.name) ? parameter.name.text : "",
          ),
        );
      }
      ts.forEachChild(node, collectCallableFactories);
    }
    collectCallableFactories(sourceFile);
    function callableOrReflectiveValue(node: ts.Expression): boolean {
      if (directCallableValue(node)) return true;
      if (
        ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) ||
        ts.isNonNullExpression(node)
      ) {
        return callableOrReflectiveValue(node.expression);
      }
      if (ts.isIdentifier(node)) return reflectiveValueBindings.has(node.text);
      if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        callableObjectMemberBindings.get(node.expression.text)?.has(node.name.text) === true
      ) {
        return true;
      }
      if (
        ts.isElementAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.argumentExpression !== undefined
      ) {
        const propertyName = explicitPropertyName(node.argumentExpression);
        if (
          propertyName !== null &&
          callableObjectMemberBindings.get(node.expression.text)?.has(propertyName) === true
        ) {
          return true;
        }
        const callableIndexes = callableArrayElementBindings.get(node.expression.text);
        if (callableIndexes !== undefined) {
          if (ts.isNumericLiteral(node.argumentExpression)) {
            return callableIndexes.has(Number(node.argumentExpression.text));
          }
          return callableIndexes.size > 0;
        }
      }
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (callableFactoryBindings.has(node.expression.text) ||
          (callableIdentityBindings.has(node.expression.text) &&
            node.arguments.some(callableOrReflectiveValue)))
      ) {
        return true;
      }
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === "bind" &&
        callableOrReflectiveValue(node.expression.expression)
      ) {
        return true;
      }
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        return (
          node.expression.name.text === "getPrototypeOf" ||
          node.expression.name.text === "getOwnPropertyDescriptor" ||
          (ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === "Reflect")
        );
      }
      return false;
    }
    function staticPropertyName(node: ts.PropertyName): string | null {
      if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) {
        return node.text;
      }
      if (ts.isComputedPropertyName(node)) return explicitPropertyName(node.expression);
      return null;
    }
    function collectCallableObjectMemberBindings(node: ts.Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isObjectLiteralExpression(node.initializer)
      ) {
        const members = new Set<string>();
        for (const property of node.initializer.properties) {
          if (ts.isMethodDeclaration(property) && property.name !== undefined) {
            const propertyName = staticPropertyName(property.name);
            if (propertyName !== null) members.add(propertyName);
          } else if (
            ts.isPropertyAssignment(property) &&
            callableOrReflectiveValue(property.initializer)
          ) {
            const propertyName = staticPropertyName(property.name);
            if (propertyName !== null) members.add(propertyName);
          } else if (
            ts.isShorthandPropertyAssignment(property) &&
            reflectiveValueBindings.has(property.name.text)
          ) {
            members.add(property.name.text);
          }
        }
        if (members.size > 0) callableObjectMemberBindings.set(node.name.text, members);
      }
      ts.forEachChild(node, collectCallableObjectMemberBindings);
    }
    collectCallableObjectMemberBindings(sourceFile);
    function collectCallableArrayElementBindings(node: ts.Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        ts.isArrayLiteralExpression(node.initializer)
      ) {
        const indexes = new Set<number>();
        node.initializer.elements.forEach((value, index) => {
          if (!ts.isOmittedExpression(value) && callableOrReflectiveValue(value)) {
            indexes.add(index);
          }
        });
        if (indexes.size > 0) callableArrayElementBindings.set(node.name.text, indexes);
      }
      ts.forEachChild(node, collectCallableArrayElementBindings);
    }
    collectCallableArrayElementBindings(sourceFile);
    function inlineFunctionExpression(
      node: ts.Expression,
    ): ts.ArrowFunction | ts.FunctionExpression | null {
      if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return node;
      if (
        ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isTypeAssertionExpression(node) ||
        ts.isNonNullExpression(node)
      ) {
        return inlineFunctionExpression(node.expression);
      }
      return null;
    }
    function collectReflectiveValueBindings(node: ts.Node): void {
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer !== undefined &&
        callableOrReflectiveValue(node.initializer)
      ) {
        reflectiveValueBindings.add(node.name.text);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        ts.isIdentifier(node.left) &&
        callableOrReflectiveValue(node.right)
      ) {
        reflectiveValueBindings.add(node.left.text);
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isArrayBindingPattern(node.name) &&
        node.initializer !== undefined &&
        ts.isArrayLiteralExpression(node.initializer)
      ) {
        const bindings = node.name.elements;
        const values = node.initializer.elements;
        bindings.forEach((binding, index) => {
          const value = values[index];
          if (
            value !== undefined &&
            !ts.isOmittedExpression(value) &&
            ts.isBindingElement(binding) &&
            ts.isIdentifier(binding.name) &&
            callableOrReflectiveValue(value)
          ) {
            reflectiveValueBindings.add(binding.name.text);
          }
        });
      }
      if (ts.isCallExpression(node)) {
        if (ts.isIdentifier(node.expression)) {
          const parameterNames = callableParameterBindings.get(node.expression.text) ?? [];
          parameterNames.forEach((parameterName, index) => {
            const argument = node.arguments[index];
            if (
              parameterName !== "" &&
              argument !== undefined &&
              callableOrReflectiveValue(argument)
            ) {
              reflectiveValueBindings.add(parameterName);
            }
          });
        }
        const inlineFunction = inlineFunctionExpression(node.expression);
        inlineFunction?.parameters.forEach((parameter, index) => {
          const argument = node.arguments[index];
          if (
            argument !== undefined &&
            ts.isIdentifier(parameter.name) &&
            callableOrReflectiveValue(argument)
          ) {
            reflectiveValueBindings.add(parameter.name.text);
          }
        });
      }
      ts.forEachChild(node, collectReflectiveValueBindings);
    }
    collectReflectiveValueBindings(sourceFile);
    const safeReflectionMembers =
      options.additionalSafeReflectionMembers?.get(entry.path) ??
      EXPLICITLY_SAFE_REFLECTION_MEMBERS.get(entry.path) ??
      new Set();
    function bindingElementPropertyName(element: ts.BindingElement): string | null {
      if (element.dotDotDotToken !== undefined) return null;
      if (element.propertyName === undefined) {
        return ts.isIdentifier(element.name) ? element.name.text : null;
      }
      if (ts.isIdentifier(element.propertyName) || ts.isStringLiteral(element.propertyName)) {
        return element.propertyName.text;
      }
      if (ts.isComputedPropertyName(element.propertyName)) {
        return explicitPropertyName(element.propertyName.expression);
      }
      return null;
    }
    function inspect(node: ts.Node): void {
      if (
        !dynamicAccessSourceIsAllowlisted &&
        (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
        node.text === "constructor"
      ) {
        violations.add(`${entry.path}:alternative-module-loader`);
      }
      if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        violations.add(`${entry.path}:dynamic-module-loader`);
      }
      if (
        !dynamicAccessSourceIsAllowlisted &&
        ((ts.isIdentifier(node) &&
          (node.text === "createRequire" ||
            node.text === "require" ||
            node.text === "eval" ||
            node.text === "Function")) ||
          (ts.isPropertyAccessExpression(node) &&
            ALTERNATIVE_MODULE_LOADER_MEMBERS.has(node.name.text)) ||
          (ts.isElementAccessExpression(node) &&
            node.argumentExpression !== undefined &&
            explicitPropertyName(node.argumentExpression) !== null &&
            ALTERNATIVE_MODULE_LOADER_MEMBERS.has(
              explicitPropertyName(node.argumentExpression)!,
            )) ||
          (ts.isElementAccessExpression(node) &&
            node.argumentExpression !== undefined &&
            callableOrReflectiveValue(node.expression) &&
            !ts.isNumericLiteral(node.argumentExpression) &&
            explicitPropertyName(node.argumentExpression) === null))
      ) {
        violations.add(`${entry.path}:alternative-module-loader`);
      }
      if (
        ts.isPropertyAccessExpression(node) &&
        reflectionRootName(node.expression) !== null &&
        REFLECTION_MEMBERS_REQUIRING_ALLOWLIST.has(
          `${reflectionRootName(node.expression)}.${node.name.text}`,
        ) &&
        !safeReflectionMembers.has(`${reflectionRootName(node.expression)}.${node.name.text}`)
      ) {
        violations.add(`${entry.path}:non-allowlisted-reflection`);
      }
      if (ts.isElementAccessExpression(node) && reflectionRootName(node.expression) !== null) {
        violations.add(`${entry.path}:non-allowlisted-reflection`);
      }
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer !== undefined
      ) {
        const root = reflectionRootName(node.initializer);
        if (root !== null) {
          for (const element of node.name.elements) {
            const propertyName = bindingElementPropertyName(element);
            if (
              propertyName === null ||
              (REFLECTION_MEMBERS_REQUIRING_ALLOWLIST.has(`${root}.${propertyName}`) &&
                !safeReflectionMembers.has(`${root}.${propertyName}`))
            ) {
              violations.add(`${entry.path}:non-allowlisted-reflection`);
            }
          }
        }
      }
      if (
        !dynamicAccessSourceIsAllowlisted &&
        ts.isBindingElement(node) &&
        bindingElementPropertyName(node) !== null &&
        ALTERNATIVE_MODULE_LOADER_MEMBERS.has(bindingElementPropertyName(node)!)
      ) {
        violations.add(`${entry.path}:alternative-module-loader`);
      }
      if (
        !dynamicAccessSourceIsAllowlisted &&
        ts.isPropertyAssignment(node) &&
        staticPropertyName(node.name) !== null &&
        ALTERNATIVE_MODULE_LOADER_MEMBERS.has(staticPropertyName(node.name)!)
      ) {
        violations.add(`${entry.path}:alternative-module-loader`);
      }
      if (
        ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
        reflectionRootName(node.right) !== null
      ) {
        violations.add(`${entry.path}:non-allowlisted-reflection`);
      }
      if (ts.isIdentifier(node)) {
        const isNonReferencePropertyName =
          (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
          ((ts.isPropertyAssignment(node.parent) ||
            ts.isPropertyDeclaration(node.parent) ||
            ts.isPropertySignature(node.parent) ||
            ts.isMethodDeclaration(node.parent) ||
            ts.isMethodSignature(node.parent) ||
            ts.isGetAccessorDeclaration(node.parent) ||
            ts.isSetAccessorDeclaration(node.parent)) &&
            node.parent.name === node);
        if (
          (node.text === "Object" || node.text === "Reflect") &&
          !(ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node)
        ) {
          violations.add(`${entry.path}:non-allowlisted-reflection-root-alias`);
        }
        if (!isNonReferencePropertyName && NETWORK_GLOBAL_IDENTIFIERS.has(node.text)) {
          violations.add(`${entry.path}:network-global`);
        }
        if (!isNonReferencePropertyName && RUNTIME_GLOBAL_IDENTIFIERS.has(node.text)) {
          violations.add(`${entry.path}:runtime-capability-global`);
        }
      }
      if (ts.isElementAccessExpression(node) && node.argumentExpression !== undefined) {
        const propertyName = explicitPropertyName(node.argumentExpression);
        if (
          !ts.isNumericLiteral(node.argumentExpression) &&
          propertyName === null &&
          !dynamicAccessSourceIsAllowlisted
        ) {
          violations.add(
            `${entry.path}:non-allowlisted-dynamic-element-access:${node.getText(sourceFile)}`,
          );
        }
        if (propertyName === "fetch" || propertyName === "WebSocket") {
          violations.add(`${entry.path}:network-global`);
        }
        if (propertyName === "process") {
          violations.add(`${entry.path}:runtime-capability-global`);
        }
      }
      if (
        ts.isComputedPropertyName(node) &&
        explicitPropertyName(node.expression) === null &&
        !dynamicAccessSourceIsAllowlisted
      ) {
        violations.add(
          `${entry.path}:non-allowlisted-dynamic-property-name:${node.getText(sourceFile)}`,
        );
      }
      ts.forEachChild(node, inspect);
    }
    inspect(sourceFile);
  }
  if (options.requireCompleteDynamicAccessAllowlist === true) {
    for (const path of EXPLICITLY_SAFE_DYNAMIC_ACCESS_SOURCE_FINGERPRINTS.keys()) {
      if (!observedDynamicAccessAllowlistPaths.has(path)) {
        violations.add(`${path}:stale-dynamic-access-source-allowlist`);
      }
    }
  }
  return [...violations].sort();
}
