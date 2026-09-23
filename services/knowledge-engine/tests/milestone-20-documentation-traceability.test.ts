import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectTransitiveTypeScriptModuleClosure,
  findMilestone17CapabilityViolations,
} from "./support/milestone-17-module-closure.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const M20 = resolve(ROOT, "docs/milestones/milestone-20");
const DOCUMENTS = [
  "FounderOS_Milestone_20_End_to_End_Dry_Run_and_Fault_Injection_Design_v1.0.md",
  "FounderOS_Milestone_20_End_to_End_Dry_Run_and_Fault_Injection_Specification_v1.0.md",
  "FounderOS_Dry_Run_Execution_Report_Contract_v1.0.md",
  "FounderOS_Fault_Injection_and_Final_Control_Rehearsal_Contract_v1.0.md",
  "FounderOS_M20_Dry_Run_Contract_Catalog_v1.0.md",
  "FounderOS_Milestone_20_Acceptance_Criteria_v1.0.md",
  "FounderOS_Milestone_20_Acceptance_Traceability_v1.0.md",
  "FounderOS_Milestone_20_Verification_Checklist_v1.0.md",
  "FounderOS_Milestone_20_Implementation_Plan_v1.0.md",
  "FounderOS_Milestone_20_Package_README_v1.0.md",
] as const;

const TRACEABILITY = [
  [
    "M20-AC-001",
    "packages/knowledge-schema/tests/m20-dry-run.test.ts",
    "exports every required request",
  ],
  [
    "M20-AC-002",
    "services/knowledge-engine/src/application/m20-dry-run-conductor.ts",
    "createM20DryRunConductor",
  ],
  ["M20-AC-003", "tests/support/milestone-20/composition.ts", "createM20TestComposition"],
  [
    "M20-AC-004",
    "tests/milestone-20-composition.test.ts",
    "runs the concrete no-network success composition",
  ],
  [
    "M20-AC-005",
    "services/knowledge-engine/tests/m20-dry-run.test.ts",
    'status: "disabled-by-policy"',
  ],
  [
    "M20-AC-006",
    "tests/support/milestone-20/final-control-authority.ts",
    "createM20TestFinalControlAuthority",
  ],
  [
    "M20-AC-007",
    "services/knowledge-engine/tests/m20-dry-run.test.ts",
    "rejects a nested accessor",
  ],
  [
    "M20-AC-008",
    "services/knowledge-engine/tests/m20-dry-run.test.ts",
    "installs the owner before the first await",
  ],
  [
    "M20-AC-009",
    "services/knowledge-engine/tests/m20-dry-run.test.ts",
    "classifies report mutations",
  ],
  ["M20-AC-010", "packages/knowledge-schema/src/m20-dry-run.ts", "M20TerminalReasonCodeSchema"],
  ["M20-AC-011", "tests/support/milestone-20/catalog.ts", "M20_TEST_SCENARIO_CATALOG"],
  ["M20-AC-012", "tests/milestone-20-composition.test.ts", "precedence"],
  ["M20-AC-013", "tests/support/milestone-20/catalog.ts", "fixtureReference"],
  ["M20-AC-014", "tests/milestone-20-composition.test.ts", "byte-identical reports"],
  ["M20-AC-015", "services/knowledge-engine/src/domain/m20-dry-run.ts", "verifyM20DryRunReport"],
  ["M20-AC-016", "tests/milestone-20-composition.test.ts", "canonicalFileSnapshot"],
  [
    "M20-AC-017",
    "tests/milestone-20-composition.test.ts",
    "isolated M19 fixture-response regression matrix",
  ],
  [
    "M20-AC-018",
    "services/knowledge-engine/tests/milestone-20-documentation-traceability.test.ts",
    "ADVERSARIAL_CAPABILITY_PROBES",
  ],
  [
    "M20-AC-019",
    "tests/milestone-20-composition.test.ts",
    "wraps every available ambient network global",
  ],
  [
    "M20-AC-020",
    "docs/milestones/milestone-20/FounderOS_Milestone_20_Acceptance_Traceability_v1.0.md",
    "M20-AC-020",
  ],
] as const;

const PRODUCTION_MODULES = [
  "packages/knowledge-schema/src/m20-dry-run.ts",
  "services/knowledge-engine/src/domain/m20-dry-run.ts",
  "services/knowledge-engine/src/application/m20-dry-run-conductor.ts",
] as const;

const ADVERSARIAL_CAPABILITY_PROBES = [
  ["network.ts", "fetch('https://example.invalid')", "network-global"],
  ["aliased-network.ts", "const send = fetch; send('x')", "network-global"],
  ["computed-network.ts", 'globalThis["fetch"]("https://example.invalid")', "network-global"],
  ["web-transport.ts", "new WebTransport('https://example.invalid')", "network-global"],
  [
    "aliased-web-transport.ts",
    "const Transport = WebTransport; new Transport('x')",
    "network-global",
  ],
  ["computed-web-transport.ts", 'new globalThis["WebTransport"]("x")', "network-global"],
  ["destructured-network.ts", "const { fetch: send } = globalThis; send('x')", "network-global"],
  ["filesystem.ts", 'import { readFile } from "node:fs"', "non-allowlisted-import:node:fs"],
  ["environment.ts", "const value = process.env.M20_VALUE", "runtime-capability-global"],
  ["reflection.ts", "const getter = Reflect.get", "non-allowlisted-reflection"],
  ["loader.ts", "const loader = require", "alternative-module-loader"],
  ["dynamic-code.ts", 'const execute = Function("return 1")', "alternative-module-loader"],
  [
    "worker.ts",
    'import { Worker } from "node:worker_threads"',
    "non-allowlisted-import:node:worker_threads",
  ],
  ["credential.ts", 'import "@founderos/credential-resolver"', "prohibited-founderos-capability"],
  ["provider-sdk.ts", 'import OpenAI from "openai"', "non-allowlisted-import:openai"],
  ["agent.ts", 'import "@founderos/agent-runtime"', "prohibited-founderos-capability"],
  ["hermes.ts", 'import "@founderos/hermes-runtime"', "prohibited-founderos-capability"],
  ["mcp.ts", 'import "@founderos/mcp-gateway"', "prohibited-founderos-capability"],
] as const;

const REVIEWED_DYNAMIC_ACCESS_FINGERPRINTS = new Map([
  [
    "services/knowledge-engine/src/domain/m20-dry-run.ts",
    "954e9fd8ff52dabadd5e297689829ec299b581a1081b62c9755aa706fb64c92b",
  ],
  [
    "services/knowledge-engine/src/application/m20-dry-run-conductor.ts",
    "15dc4b16a41f7f29ab882b6774b6e7a62af790302eade9dbc4f35f6849a45f81",
  ],
  [
    "services/knowledge-engine/src/application/credential-resolution-orchestrator.ts",
    "da6b1e312398d82231637f3af145542d3a1bdd7452ecf485047faec29b29b19d",
  ],
  [
    "services/knowledge-engine/src/application/openai-responses-preparation-orchestrator.ts",
    "048adaefab8c7fc9c177ba4867bcc95eaa1acee4f04355f076c0cda764fb7722",
  ],
  [
    "services/knowledge-engine/src/domain/credential-resolution.ts",
    "13fa170b65ad676f24f9adb2827e20275af7a5d2cba14b02b68825b99b547b46",
  ],
  [
    "services/knowledge-engine/src/domain/openai-responses-adapter.ts",
    "708fcf43b5720e7d6185309c0e4461d02667b0be2bb08e021f1af1898d3e592e",
  ],
]);

const REVIEWED_SAFE_REFLECTION_MEMBERS = new Map<string, ReadonlySet<string>>([
  [
    "services/knowledge-engine/src/domain/m20-dry-run.ts",
    new Set([
      "Object.create",
      "Object.getOwnPropertyDescriptors",
      "Object.getPrototypeOf",
      "Object.prototype",
      "Reflect.ownKeys",
    ]),
  ],
  [
    "services/knowledge-engine/src/application/m20-dry-run-conductor.ts",
    new Set([
      "Object.create",
      "Object.getOwnPropertyDescriptor",
      "Object.getOwnPropertyDescriptors",
      "Object.getPrototypeOf",
      "Object.prototype",
      "Reflect.ownKeys",
    ]),
  ],
  [
    "services/knowledge-engine/src/application/credential-resolution-orchestrator.ts",
    new Set(["Object.getOwnPropertyDescriptor"]),
  ],
  [
    "services/knowledge-engine/src/application/openai-responses-preparation-orchestrator.ts",
    new Set(["Object.getOwnPropertyDescriptor"]),
  ],
  ["services/knowledge-engine/src/domain/credential-resolution.ts", new Set(["Reflect.ownKeys"])],
  [
    "services/knowledge-engine/src/domain/openai-responses-adapter.ts",
    new Set(["Reflect.ownKeys"]),
  ],
]);

const PUBLIC_OUTPUT_PROHIBITIONS = [
  /\bapiKey\b/u,
  /\bauthorizationHeader\b/u,
  /\bproviderResponseBody\b/u,
  /\bendpointUrl\b/u,
  /\/Users\//u,
  /(?:sk|rk|pk)_[A-Za-z0-9]{20,}/u,
] as const;

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("Milestone 20 documentation, security, and structural traceability", () => {
  it("contains the complete versioned document set and current-state references", () => {
    const index = read("DOCUMENTATION_INDEX.md");
    for (const document of DOCUMENTS) {
      expect(readFileSync(resolve(M20, document), "utf8")).not.toHaveLength(0);
      expect(index).toContain(document);
    }
    expect(read("README.md")).toContain("Milestone 20 implements");
    expect(read("CHANGELOG.md")).toContain("Implemented a local Milestone 20 candidate");
    expect(read("ARCHITECTURE_DECISIONS.md")).toMatch(/ADR-0024:[\s\S]*\*\*Status:\*\* Proposed/u);
    expect(read("packages/knowledge-schema/README.md")).toContain("Milestone 20 adds");
    expect(read("services/knowledge-engine/README.md")).toContain("Milestone 20 adds");
  });

  it("maps every acceptance criterion to a concrete implementation or proof anchor", () => {
    expect(TRACEABILITY.map(([id]) => id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `M20-AC-${String(index + 1).padStart(3, "0")}`),
    );
    for (const [, file, anchor] of TRACEABILITY) expect(read(file)).toContain(anchor);
  });

  it("keeps the complete transitive M20 production closure free of prohibited capabilities", () => {
    const closure = collectTransitiveTypeScriptModuleClosure(ROOT, PRODUCTION_MODULES);
    expect(closure.map(({ path }) => path)).toEqual(
      expect.arrayContaining([...PRODUCTION_MODULES]),
    );
    const violations = findMilestone17CapabilityViolations(closure, {
      additionalDynamicAccessSourceFingerprints: REVIEWED_DYNAMIC_ACCESS_FINGERPRINTS,
      additionalSafeReflectionMembers: REVIEWED_SAFE_REFLECTION_MEMBERS,
    }).filter((violation) => !violation.endsWith("non-allowlisted-import:node:util/types"));
    expect(violations).toEqual([]);
    const externalImports = new Set(
      closure
        .flatMap(({ importSpecifiers }) => importSpecifiers)
        .filter((specifier) => !specifier.startsWith(".") && !specifier.startsWith("@founderos/")),
    );
    expect([...externalImports].sort()).toEqual(["node:crypto", "node:util/types", "zod"]);
  });

  it.each(ADVERSARIAL_CAPABILITY_PROBES)(
    "detects the %s adversarial capability probe",
    (path, source, expected) => {
      const violations = findMilestone17CapabilityViolations([
        { path, source, importSpecifiers: [] },
      ]);
      expect(violations.some((violation) => violation.includes(expected))).toBe(true);
    },
  );

  it("binds the concrete ambient network witness to wrap-all and increment-before-reject proof", () => {
    const witness = read("tests/support/milestone-20/network-witness.ts");
    const compositionProof = read("tests/milestone-20-composition.test.ts");
    for (const globalName of [
      "fetch",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
      "WebTransport",
    ]) {
      expect(witness).toContain(`"${globalName}"`);
    }
    expect(witness.indexOf("attempts += 1")).toBeLessThan(
      witness.indexOf('throw new Error("M20_NETWORK_CAPABILITY_PROHIBITED")'),
    );
    expect(compositionProof).toContain("wraps every available ambient network global");
    expect(compositionProof).toContain("expect(trap.wrappedGlobals).toEqual(available)");
    expect(compositionProof).toContain("expect(trap.attemptedCalls()).toBe(0)");
  });

  it("keeps M20 production source and public-evidence tests free of sensitive output shapes", () => {
    const candidate = [
      ...PRODUCTION_MODULES,
      "packages/knowledge-schema/tests/m20-dry-run.test.ts",
      "services/knowledge-engine/tests/m20-dry-run.test.ts",
      "tests/milestone-20-composition.test.ts",
      "tests/support/milestone-20/catalog.ts",
      "tests/support/milestone-20/composition.ts",
      "tests/support/milestone-20/final-control-authority.ts",
      "tests/support/milestone-20/network-witness.ts",
    ]
      .map(read)
      .join("\n");
    for (const pattern of PUBLIC_OUTPUT_PROHIBITIONS) expect(candidate).not.toMatch(pattern);
    expect(candidate).not.toContain("production-ready");
    expect(candidate).not.toContain("live-execution-authorized");
  });
});
