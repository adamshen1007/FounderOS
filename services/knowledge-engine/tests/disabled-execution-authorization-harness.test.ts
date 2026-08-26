import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runDisabledExecutionAuthorizationHarness } from "../src/index.js";
import {
  AUTHORIZATION_EVALUATED_AT,
  authorizationAuthorityConfiguration,
  createAuthorizationFixture,
} from "./fixtures/execution-authorization.js";
import {
  collectTransitiveTypeScriptModuleClosure,
  findMilestone17CapabilityViolations,
  type TypeScriptModuleClosureEntry,
} from "./support/milestone-17-module-closure.js";

function harnessInput(approvalOutcome: "allowed" | "denied" | "review-required" = "allowed") {
  const fixture = createAuthorizationFixture({ approvalOutcome });
  return {
    schemaVersion: "1.0" as const,
    mode: "disabled-evaluation" as const,
    authorityConfiguration: authorizationAuthorityConfiguration(),
    authorizationDecisionId: "authorization-decision-harness-one",
    authorizationClaimId: "authorization-claim-harness-one",
    authorizationRequest: fixture.request,
    serviceIdentityEvidence: fixture.identity,
    humanApprovalEvidence: fixture.approval,
    evaluatedAt: AUTHORIZATION_EVALUATED_AT,
    expiresAt: "2026-08-23T01:15:00.000Z",
    claimedAt: "2026-08-23T01:01:00.000Z",
    verifiedAt: "2026-08-23T01:02:00.000Z",
    revocationVersion: 1,
    revokedAt: "2026-08-23T01:03:00.000Z",
    laterRevocationVersion: 2,
    laterRevokedAt: "2026-08-23T01:04:00.000Z",
    postRevocationVerifiedAt: "2026-08-23T01:05:00.000Z",
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Milestone 17 disabled execution authorization harness", () => {
  it("deterministically verifies the non-production authorization foundation", () => {
    const first = runDisabledExecutionAuthorizationHarness(harnessInput());
    const second = runDisabledExecutionAuthorizationHarness(harnessInput());

    expect(first).toEqual(second);
    expect(first.status).toBe("authorization-foundation-verified");
    expect(first.mode).toBe("disabled-evaluation");
    expect(first.liveExecutionReady).toBe(false);
    expect(first).toMatchObject({
      revocationVersion: 2,
      claimPreservedAfterRevocation: true,
    });
    expect(Object.isFrozen(first)).toBe(true);
  });

  it("fails closed when the deterministic revocation sequence is invalid", () => {
    expect(
      runDisabledExecutionAuthorizationHarness({
        ...harnessInput(),
        revokedAt: "2026-08-23T00:59:00.000Z",
      }).status,
    ).toBe("authorization-foundation-rejected");
    expect(
      runDisabledExecutionAuthorizationHarness({
        ...harnessInput(),
        revocationVersion: 0,
      }).status,
    ).toBe("authorization-foundation-rejected");
    expect(
      runDisabledExecutionAuthorizationHarness({
        ...harnessInput(),
        laterRevocationVersion: 3,
      }).status,
    ).toBe("authorization-foundation-rejected");
  });

  it("reports denied and review-required outcomes without claiming", () => {
    expect(runDisabledExecutionAuthorizationHarness(harnessInput("denied")).status).toBe(
      "authorization-foundation-rejected",
    );
    expect(runDisabledExecutionAuthorizationHarness(harnessInput("review-required")).status).toBe(
      "authorization-foundation-review-required",
    );
  });

  it("rejects unknown capabilities and accessors before reading them", () => {
    expect(
      runDisabledExecutionAuthorizationHarness({
        ...harnessInput(),
        callback: () => undefined,
      } as never).status,
    ).toBe("authorization-foundation-rejected");

    let getterRead = false;
    const accessor = { ...harnessInput() };
    Object.defineProperty(accessor, "mode", {
      enumerable: true,
      get() {
        getterRead = true;
        return "disabled-evaluation";
      },
    });
    expect(runDisabledExecutionAuthorizationHarness(accessor).status).toBe(
      "authorization-foundation-rejected",
    );
    expect(getterRead).toBe(false);
  });

  it("never invokes fetch or reports live readiness", () => {
    const fetchSpy = vi.fn(() => {
      throw new Error("network must remain unreachable");
    });
    vi.stubGlobal("fetch", fetchSpy);

    const result = runDisabledExecutionAuthorizationHarness(harnessInput());

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.liveExecutionReady).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/credential|header|endpoint|provider.body/iu);
  });

  it("keeps the authorization implementation import closure free of execution capabilities", () => {
    const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
    const closure = collectTransitiveTypeScriptModuleClosure(repositoryRoot, [
      "services/knowledge-engine/src/application/disabled-execution-authorization-harness.ts",
      "services/knowledge-engine/src/application/in-memory-execution-authorization-authority.ts",
      "services/knowledge-engine/src/domain/execution-authorization.ts",
    ]);

    expect(closure.length).toBeGreaterThan(3);
    expect(closure.map((module) => module.path)).toEqual(
      expect.arrayContaining([
        "services/knowledge-engine/src/domain/canonical-fingerprint.ts",
        "packages/knowledge-schema/src/authorization.ts",
        "packages/knowledge-schema/src/canonical-json.ts",
      ]),
    );
    expect(
      findMilestone17CapabilityViolations(closure, {
        requireCompleteDynamicAccessAllowlist: true,
      }),
    ).toEqual([]);
  });

  it("invalidates the dynamic-access allowlist when an approved source changes", () => {
    const repositoryRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
    const closure = collectTransitiveTypeScriptModuleClosure(repositoryRoot, [
      "services/knowledge-engine/src/application/disabled-execution-authorization-harness.ts",
      "services/knowledge-engine/src/application/in-memory-execution-authorization-authority.ts",
      "services/knowledge-engine/src/domain/execution-authorization.ts",
    ]);
    const targetPath = "packages/knowledge-schema/src/authorization.ts";
    const mutatedClosure = closure.map((entry) =>
      entry.path === targetPath ? { ...entry, source: `${entry.source}\n` } : entry,
    );

    expect(
      findMilestone17CapabilityViolations(mutatedClosure, {
        requireCompleteDynamicAccessAllowlist: true,
      }),
    ).toContain(`${targetPath}:dynamic-access-source-fingerprint-mismatch`);
  });

  it.each([
    ["Node filesystem subpath", ["node:fs/promises"], 'import "node:fs/promises";'],
    ["Node DNS subpath", ["node:dns/promises"], 'import "node:dns/promises";'],
    [
      "createRequire acquisition",
      ["node:module"],
      'import { createRequire } from "node:module"; createRequire(import.meta.url);',
    ],
    [
      "aliased createRequire acquisition",
      [],
      'import { createRequire as makeRequire } from "node:module"; const load = makeRequire(import.meta.url); load("node:fs");',
    ],
    ["CommonJS require acquisition", [], 'require("node:fs");'],
    [
      "indirect CommonJS require acquisition",
      [],
      'const load = globalThis["require"]; load("node:fs");',
    ],
    [
      "dynamic Function loader acquisition",
      [],
      'const load = Function("return require")(); load("node:fs");',
    ],
    ["Node HTTP/2 capability", [], 'import "node:http2";'],
    ["Node SQLite filesystem capability", [], 'import "node:sqlite";'],
    [
      "variable dynamic import acquisition",
      [],
      'const moduleName = "node:fs"; void import(moduleName);',
    ],
    ["process alias acquisition", [], "const runtime = process; void runtime.env;"],
    ["bracketed fetch acquisition", [], 'void globalThis["fetch"]("https://invalid");'],
    [
      "reflective Function constructor acquisition",
      [],
      "const load = (() => {}).constructor(\"return import('node:fs')\"); void load();",
    ],
    [
      "Reflect.get Function constructor acquisition",
      [],
      'const load = Reflect.get(() => {}, "constructor")("return process"); void load();',
    ],
    [
      "computed Function constructor acquisition",
      [],
      'const constructorKey = "con" + "structor"; const load = (() => {})[constructorKey]("return fetch"); void load();',
    ],
    [
      "prototype Function constructor acquisition",
      [],
      'const load = Object.getPrototypeOf(async function () {}).constructor("return fetch"); void load();',
    ],
    [
      "template-expression Reflect.get constructor acquisition",
      [],
      'const suffix = "structor"; const load = Reflect.get(() => {}, `con${suffix}`)("return process"); void load();',
    ],
    [
      "concat-built Reflect.get constructor acquisition",
      [],
      'const load = Reflect.get(() => {}, "con".concat("structor"))("return process"); void load();',
    ],
    [
      "join-built computed constructor acquisition",
      [],
      'const key = ["con", "structor"].join(""); const load = (() => {})[key]("return fetch"); void load();',
    ],
    [
      "destructured computed constructor acquisition",
      [],
      'const target = () => {}; const keys = { loader: "constructor" }; const { loader: key } = keys; const load = target[key]("return fetch"); void load();',
    ],
    [
      "aliased Reflect constructor acquisition",
      [],
      'const reflection = Reflect; const suffix = "structor"; const load = reflection.get(() => {}, `con${suffix}`)("return process"); void load();',
    ],
    [
      "destructured Reflect.get constructor acquisition",
      [],
      'const { get } = Reflect; const key = ["con", "structor"].join(""); const load = get(() => {}, key)("return process"); void load();',
    ],
    [
      "renamed destructured Reflect.get constructor acquisition",
      [],
      'const { get: acquire } = Reflect; const key = ["con", "structor"].join(""); const load = acquire(() => {}, key)("return process"); void load();',
    ],
    [
      "aliased-root destructured Reflect.get constructor acquisition",
      [],
      'const reflection = Reflect; const { get } = reflection; const key = ["con", "structor"].join(""); const load = get(() => {}, key)("return process"); void load();',
    ],
    [
      "destructured Object.getPrototypeOf constructor acquisition",
      [],
      'const { getPrototypeOf } = Object; const proto = getPrototypeOf(() => {}); const key = ["con", "structor"].join(""); const load = proto[key]("return 1"); void load();',
    ],
    [
      "assigned destructured Reflect.get constructor acquisition",
      [],
      'let get: typeof Reflect.get; ({ get } = Reflect); const key = ["con", "structor"].join(""); const load = get(() => {}, key)("return process"); void load();',
    ],
    [
      "assigned callable constructor acquisition",
      [],
      'let callable; callable = () => undefined; const DynamicCode = callable["con" + "structor"]; DynamicCode("return 1")();',
    ],
    [
      "call-returned callable constructor acquisition",
      [],
      'function callableFactory() { return () => undefined; } const callable = callableFactory(); const DynamicCode = callable["con" + "structor"]; DynamicCode("return 1")();',
    ],
    [
      "array-destructured Reflect constructor acquisition",
      [],
      'const [reflection] = [Reflect]; const prototype = reflection["get" + "PrototypeOf"](() => undefined); prototype["con" + "structor"]("return 1")();',
    ],
    [
      "parameter-aliased Reflect constructor acquisition",
      [],
      '((reflection) => { const prototype = reflection["get" + "PrototypeOf"](() => undefined); prototype["con" + "structor"]("return 1")(); })(Reflect);',
    ],
    [
      "declared callable constructor acquisition",
      [],
      'function callable() {} const key = ["con", "structor"].join(""); const DynamicCode = callable[key]; DynamicCode("return process")();',
    ],
    [
      "object-carried callable constructor acquisition",
      [],
      'const box = { callable: () => undefined }; const key = ["con", "structor"].join(""); const DynamicCode = box.callable[key]; DynamicCode("return process")();',
    ],
    [
      "identity-call callable constructor acquisition",
      [],
      'const identity = (value) => value; const callable = identity(() => undefined); const key = ["con", "structor"].join(""); const DynamicCode = callable[key]; DynamicCode("return process")();',
    ],
    [
      "bound callable constructor acquisition",
      [],
      'const callable = (() => undefined).bind(null); const key = ["con", "structor"].join(""); const DynamicCode = callable[key]; DynamicCode("return process")();',
    ],
    [
      "array-carried callable constructor acquisition",
      [],
      'const [callable] = [() => undefined]; const key = ["con", "structor"].join(""); const DynamicCode = callable[key]; DynamicCode("return process")();',
    ],
    [
      "parameter-carried callable constructor acquisition",
      [],
      '((callable) => { const key = ["con", "structor"].join(""); const DynamicCode = callable[key]; DynamicCode("return process")(); })(() => undefined);',
    ],
    [
      "indexed-array callable constructor acquisition",
      [],
      'const values = [() => undefined]; const callable = values[0]; const key = "con" + "structor"; const DynamicCode = callable[key]; DynamicCode("return process")();',
    ],
    [
      "named-parameter callable constructor acquisition",
      [],
      'function execute(callable: () => void) { const key = "con" + "structor"; const DynamicCode = callable[key]; DynamicCode("return process")(); } execute(() => undefined);',
    ],
    [
      "named-identity callable constructor acquisition",
      [],
      'function identity<T>(value: T): T { return value; } const callable = identity(() => undefined); const key = "con" + "structor"; const DynamicCode = callable[key]; DynamicCode("return process")();',
    ],
    [
      "conditional callable constructor acquisition",
      [],
      'const callable = Date.now() > 0 ? () => undefined : () => undefined; const key = "con" + "structor"; const DynamicCode = callable[key]; DynamicCode("return process")();',
    ],
    [
      "built-in callable constructor acquisition",
      [],
      'const key = "con" + "structor"; Date[key]("return process")();',
    ],
    [
      "inline-object method constructor acquisition",
      [],
      'const key = "con" + "structor"; const callable = ({ callable() {} }).callable; callable[key]("return process")();',
    ],
    [
      "class callable constructor acquisition",
      [],
      'class Callable {} const key = "con" + "structor"; Callable[key]("return process")();',
    ],
    [
      "method-factory callable constructor acquisition",
      [],
      'function factory() { return ({ callable() {} }).callable; } const key = "con" + "structor"; const callable = factory(); callable[key]("return process")();',
    ],
    [
      "unreviewed dynamic member access",
      [],
      'const object = { safe: 1 }; const key = "safe"; void object[key];',
    ],
    [
      "computed object destructuring",
      [],
      'const object = { safe: 1 }; const key = "safe"; const { [key]: value } = object; void value;',
    ],
    [
      "computed callable constructor destructuring",
      [],
      'const callable = () => undefined; const key = "con" + "structor"; const { [key]: DynamicCode } = callable; DynamicCode("return process")();',
    ],
    [
      "computed callable constructor assignment destructuring",
      [],
      'const callable = () => undefined; const key = "con" + "structor"; let DynamicCode; ({ [key]: DynamicCode } = callable); DynamicCode("return process")();',
    ],
    [
      "computed class constructor destructuring",
      [],
      'class Callable {} const key = "con" + "structor"; const { [key]: DynamicCode } = Callable; DynamicCode("return process")();',
    ],
    [
      "static bracketed CommonJS loader",
      [],
      'const moduleLoader = {} as Record<string, (name: string) => unknown>; void moduleLoader["require"]("node:fs");',
    ],
    [
      "static callable constructor binding destructuring",
      [],
      'const { constructor: DynamicCode } = () => undefined; DynamicCode("return process")();',
    ],
    [
      "static callable constructor assignment destructuring",
      [],
      'let DynamicCode; ({ constructor: DynamicCode } = () => undefined); DynamicCode("return process")();',
    ],
  ] as const)("detects the %s capability-closure bypass", (_name, importSpecifiers, source) => {
    const synthetic: TypeScriptModuleClosureEntry = {
      path: "synthetic.ts",
      importSpecifiers,
      source,
    };
    expect(findMilestone17CapabilityViolations([synthetic])).not.toEqual([]);
  });
});
