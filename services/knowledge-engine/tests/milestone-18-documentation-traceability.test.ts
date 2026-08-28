import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectTransitiveTypeScriptModuleClosure,
  findMilestone17CapabilityViolations,
} from "./support/milestone-17-module-closure.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const M18 = resolve(ROOT, "docs/milestones/milestone-18");
const DOCUMENTS = [
  "FounderOS_Milestone_18_Credential_Resolution_and_Rotation_Design_v1.0.md",
  "FounderOS_Milestone_18_Credential_Resolution_and_Rotation_Specification_v1.0.md",
  "FounderOS_Credential_Resolution_Request_and_Evidence_Contract_v1.0.md",
  "FounderOS_Credential_Rotation_and_Revocation_Contract_v1.0.md",
  "FounderOS_Milestone_18_Acceptance_Criteria_v1.0.md",
  "FounderOS_Milestone_18_Verification_Checklist_v1.0.md",
  "FounderOS_Milestone_18_Package_README_v1.0.md",
  "FounderOS_Milestone_18_Implementation_Plan_v1.0.md",
] as const;

const TRACEABILITY = [
  [
    "M18-AC-001",
    "packages/knowledge-schema/src/credential-resolution.ts",
    "CredentialResolutionRequestSchema",
  ],
  ["M18-AC-002", "packages/knowledge-schema/tests/credential-resolution.test.ts", "materialLength"],
  [
    "M18-AC-003",
    "services/knowledge-engine/src/domain/credential-resolution.ts",
    "verifyCredentialResolutionEvidence",
  ],
  [
    "M18-AC-004",
    "services/knowledge-engine/src/application/credential-resolution-orchestrator.ts",
    "captureExactOwnEnumerableDataDescriptors",
  ],
  [
    "M18-AC-005",
    "services/knowledge-engine/src/application/credential-resolution-orchestrator.ts",
    "verifyClaim",
  ],
  [
    "M18-AC-006",
    "services/knowledge-engine/src/application/credential-resolution-orchestrator.ts",
    "exactCoordinates",
  ],
  [
    "M18-AC-007",
    "services/knowledge-engine/tests/credential-resolution.test.ts",
    "expect(calls).toBe(0)",
  ],
  [
    "M18-AC-008",
    "services/knowledge-engine/src/application/credential-resolution-orchestrator.ts",
    "reservations",
  ],
  [
    "M18-AC-009",
    "infrastructure/credential-resolver/src/index.ts",
    "createSyntheticCredentialResolver",
  ],
  ["M18-AC-010", "infrastructure/credential-resolver/src/index.ts", "credential_version_stale"],
  [
    "M18-AC-011",
    "infrastructure/credential-resolver/tests/credential-resolver.test.ts",
    "rotates monotonically",
  ],
  [
    "M18-AC-012",
    "infrastructure/credential-resolver/tests/credential-resolver.test.ts",
    "revokes the active version monotonically",
  ],
  [
    "M18-AC-013",
    "services/knowledge-engine/tests/credential-resolution.test.ts",
    "expect(calls).toBe(1)",
  ],
  ["M18-AC-014", "infrastructure/credential-resolver/src/index.ts", "owned.fill(0)"],
  [
    "M18-AC-015",
    "infrastructure/credential-resolver/tests/credential-resolver.test.ts",
    "after materialization",
  ],
  ["M18-AC-016", "infrastructure/credential-resolver/src/index.ts", "Uint8Array.from"],
  [
    "M18-AC-017",
    "services/knowledge-engine/tests/milestone-18-documentation-traceability.test.ts",
    "PROHIBITED_CAPABILITIES",
  ],
  [
    "M18-AC-018",
    "services/knowledge-engine/tests/credential-resolution.test.ts",
    "before resolver access",
  ],
  ["M18-AC-019", "services/knowledge-engine/scripts/run-tests.mjs", "requireInventory"],
  [
    "M18-AC-020",
    "services/knowledge-engine/tests/milestone-18-documentation-traceability.test.ts",
    "TRACEABILITY",
  ],
] as const;

const PRODUCTION_MODULES = [
  "packages/knowledge-schema/src/credential-resolution.ts",
  "services/knowledge-engine/src/domain/credential-resolution.ts",
  "services/knowledge-engine/src/application/credential-resolution-orchestrator.ts",
  "infrastructure/credential-resolver/src/index.ts",
] as const;
const PROHIBITED_CAPABILITIES = [
  /from ["']node:(?:fs|process|child_process|worker_threads|vm|net|tls|dns|http|https|module)/u,
  /\bfetch\s*\(/u,
  /\bprocess\.env\b/u,
  /\bimport\s*\(/u,
  /\bXMLHttpRequest\b|\bWebSocket\b/u,
] as const;
const M18_DYNAMIC_ACCESS_FINGERPRINTS = new Map([
  [
    "services/knowledge-engine/src/domain/credential-resolution.ts",
    "13fa170b65ad676f24f9adb2827e20275af7a5d2cba14b02b68825b99b547b46",
  ],
  [
    "infrastructure/credential-resolver/src/index.ts",
    "429646aaebabb53153ffa038a8707ab99a63beec3fd3ee4b8bbfb15af8a36f4b",
  ],
  [
    "services/knowledge-engine/src/application/credential-resolution-orchestrator.ts",
    "da6b1e312398d82231637f3af145542d3a1bdd7452ecf485047faec29b29b19d",
  ],
]);
const M18_SAFE_REFLECTION_MEMBERS = new Map<string, ReadonlySet<string>>([
  ["services/knowledge-engine/src/domain/credential-resolution.ts", new Set(["Reflect.ownKeys"])],
  [
    "infrastructure/credential-resolver/src/index.ts",
    new Set([
      "Object.getOwnPropertyDescriptor",
      "Object.getPrototypeOf",
      "Object.prototype",
      "Reflect.ownKeys",
    ]),
  ],
  [
    "services/knowledge-engine/src/application/credential-resolution-orchestrator.ts",
    new Set(["Object.getOwnPropertyDescriptor"]),
  ],
]);

function read(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf8");
}

describe("Milestone 18 documentation and structural traceability", () => {
  it("contains the complete versioned document set and root index references", () => {
    const index = read("DOCUMENTATION_INDEX.md");
    for (const document of DOCUMENTS) {
      expect(readFileSync(resolve(M18, document), "utf8")).not.toHaveLength(0);
      expect(index).toContain(document);
    }
    expect(read("README.md")).toContain("Milestone 18");
    expect(read("CHANGELOG.md")).toContain("Milestone 18");
    expect(read("ARCHITECTURE_DECISIONS.md")).toContain("ADR-0022");
  });

  it("maps every acceptance criterion to a concrete implementation or proof anchor", () => {
    expect(TRACEABILITY.map(([id]) => id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `M18-AC-${String(index + 1).padStart(3, "0")}`),
    );
    for (const [, file, anchor] of TRACEABILITY) expect(read(file)).toContain(anchor);
  });

  it("keeps the complete transitive M18 production closure free of prohibited capabilities", () => {
    const closure = collectTransitiveTypeScriptModuleClosure(ROOT, PRODUCTION_MODULES);
    expect(closure.length).toBeGreaterThan(PRODUCTION_MODULES.length);
    expect(closure.map((entry) => entry.path)).toEqual(
      expect.arrayContaining([...PRODUCTION_MODULES]),
    );
    for (const { source } of closure) {
      for (const pattern of PROHIBITED_CAPABILITIES) expect(source).not.toMatch(pattern);
    }
    expect(
      findMilestone17CapabilityViolations(closure, {
        additionalDynamicAccessSourceFingerprints: M18_DYNAMIC_ACCESS_FINGERPRINTS,
        additionalSafeReflectionMembers: M18_SAFE_REFLECTION_MEMBERS,
      }),
    ).toEqual([]);
    expect(read("services/knowledge-engine/src/index.ts")).not.toContain(
      "@founderos/credential-resolver",
    );
  });

  it("proves the closure witness detects a prohibited transitive capability", () => {
    const closure = collectTransitiveTypeScriptModuleClosure(ROOT, PRODUCTION_MODULES);
    const mutated = [
      ...closure,
      { path: "mutation.ts", source: "fetch('mutation.invalid')", importSpecifiers: [] },
    ];
    expect(
      findMilestone17CapabilityViolations(mutated, {
        additionalDynamicAccessSourceFingerprints: M18_DYNAMIC_ACCESS_FINGERPRINTS,
        additionalSafeReflectionMembers: M18_SAFE_REFLECTION_MEMBERS,
      }),
    ).toContain("mutation.ts:network-global");
  });
});
