import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  collectTransitiveTypeScriptModuleClosure,
  findMilestone17CapabilityViolations,
} from "./support/milestone-17-module-closure.js";

const ROOT = resolve(import.meta.dirname, "../../..");
const M19 = resolve(ROOT, "docs/milestones/milestone-19");
const DOCUMENTS = [
  "FounderOS_Milestone_19_Disabled_OpenAI_Responses_Adapter_Design_v1.0.md",
  "FounderOS_Milestone_19_Disabled_OpenAI_Responses_Adapter_Specification_v1.0.md",
  "FounderOS_OpenAI_Responses_Request_Plan_and_Response_Mapping_Contract_v1.0.md",
  "FounderOS_Disabled_Provider_Adapter_and_No_Network_Contract_v1.0.md",
  "FounderOS_OpenAI_Model_Instruction_Cache_and_Failure_Authority_Contract_v1.0.md",
  "FounderOS_Milestone_19_Acceptance_Criteria_v1.0.md",
  "FounderOS_Milestone_19_Acceptance_Traceability_v1.0.md",
  "FounderOS_Milestone_19_Verification_Checklist_v1.0.md",
  "FounderOS_Milestone_19_Implementation_Plan_v1.0.md",
  "FounderOS_Milestone_19_Package_README_v1.0.md",
] as const;

const TRACEABILITY = [
  [
    "M19-AC-001",
    "packages/knowledge-schema/src/openai-responses-adapter.ts",
    "M19PreparationResultSchema",
  ],
  [
    "M19-AC-002",
    "services/knowledge-engine/src/application/openai-responses-preparation-orchestrator.ts",
    "OpenAIResponsesRequestMapperPort",
  ],
  ["M19-AC-003", "integrations/openai-responses/src/index.ts", "DisabledOpenAIResponsesAdapter"],
  ["M19-AC-004", "integrations/openai-responses/src/index.ts", "providerProjection"],
  [
    "M19-AC-005",
    "integrations/openai-responses/tests/openai-responses-adapter.test.ts",
    "accessor or symbol input",
  ],
  [
    "M19-AC-006",
    "services/knowledge-engine/src/application/openai-responses-preparation-orchestrator.ts",
    "verifyCredentialResolutionEvidence",
  ],
  [
    "M19-AC-007",
    "services/knowledge-engine/src/application/openai-responses-preparation-orchestrator.ts",
    "authorityCoordinatesMatch",
  ],
  [
    "M19-AC-008",
    "services/knowledge-engine/tests/openai-responses-preparation.test.ts",
    "before every protected boundary",
  ],
  [
    "M19-AC-009",
    "services/knowledge-engine/src/application/openai-responses-preparation-orchestrator.ts",
    "reservations",
  ],
  [
    "M19-AC-010",
    "services/knowledge-engine/src/domain/openai-responses-adapter.ts",
    "verifyM19CurrentControlSnapshot",
  ],
  [
    "M19-AC-011",
    "integrations/openai-responses/tests/openai-responses-adapter.test.ts",
    "Object.keys(adapter).sort()",
  ],
  [
    "M19-AC-012",
    "integrations/openai-responses/tests/openai-responses-adapter.test.ts",
    "UTF-8 output bytes independently",
  ],
  [
    "M19-AC-013",
    "integrations/openai-responses/tests/openai-responses-adapter.test.ts",
    "decision-memo shape",
  ],
  ["M19-AC-014", "integrations/openai-responses/src/index.ts", "fixtureCategory"],
  [
    "M19-AC-015",
    "packages/knowledge-schema/src/openai-responses-adapter.ts",
    "OpenAIResponsesMappingEvidenceSchema",
  ],
  [
    "M19-AC-016",
    "docs/milestones/milestone-19/FounderOS_Milestone_19_Acceptance_Traceability_v1.0.md",
    "Secret-free public surface",
  ],
  [
    "M19-AC-017",
    "services/knowledge-engine/tests/milestone-19-documentation-traceability.test.ts",
    "PRODUCTION_MODULES",
  ],
  [
    "M19-AC-018",
    "integrations/openai-responses/tests/openai-responses-adapter.test.ts",
    "ambient network call",
  ],
  ["M19-AC-019", "package.json", "verify:m15-predecessor"],
  [
    "M19-AC-020",
    "docs/milestones/milestone-19/FounderOS_Milestone_19_Acceptance_Traceability_v1.0.md",
    "M19-AC-020",
  ],
] as const;

const PRODUCTION_MODULES = [
  "packages/knowledge-schema/src/openai-responses-adapter.ts",
  "services/knowledge-engine/src/domain/openai-responses-adapter.ts",
  "services/knowledge-engine/src/application/m19-source-authorities.ts",
  "services/knowledge-engine/src/application/openai-responses-preparation-orchestrator.ts",
  "integrations/openai-responses/src/index.ts",
] as const;
const M19_REVIEWED_DYNAMIC_ACCESS_FINGERPRINTS = new Map([
  [
    "integrations/openai-responses/src/index.ts",
    "3374cf8c141d606b828a5c413d3a5f96dc3955648092e39ee57a8dea2045bcd1",
  ],
  [
    "infrastructure/credential-resolver/src/index.ts",
    "429646aaebabb53153ffa038a8707ab99a63beec3fd3ee4b8bbfb15af8a36f4b",
  ],
  [
    "services/knowledge-engine/src/application/credential-resolution-orchestrator.ts",
    "da6b1e312398d82231637f3af145542d3a1bdd7452ecf485047faec29b29b19d",
  ],
  [
    "services/knowledge-engine/src/domain/context-delivery.ts",
    "d9665b4771389a3a2bc51d1e9d5b8b389adcd80b5ef6d19cb004d271828c46f8",
  ],
  [
    "services/knowledge-engine/src/domain/credential-resolution.ts",
    "13fa170b65ad676f24f9adb2827e20275af7a5d2cba14b02b68825b99b547b46",
  ],
  [
    "services/knowledge-engine/src/domain/durable-context-delivery-ledger.ts",
    "d1657ac1230e7f3d9b15d14affa326d9bb6b29833a174dd51b1ca9f2d94673f9",
  ],
  [
    "services/knowledge-engine/src/domain/durable-readiness-ledger.ts",
    "64526cb9e309ab00e84ab21c778e3a18f2464c2af2496c2b58c5fb77f86ebbaf",
  ],
  [
    "services/knowledge-engine/src/domain/durable-registry.ts",
    "0e34fa6d8378cd83bdce7af66e4ff5af00df8f03ecf80083c44a0bd8cc0e7422",
  ],
  [
    "services/knowledge-engine/src/domain/knowledge-context.ts",
    "42f744bc994d7cd2a4e383a8b1a15fec3ccc4bc783ea82decebbcfb0b3bf4907",
  ],
  [
    "services/knowledge-engine/src/domain/openai-responses-adapter.ts",
    "708fcf43b5720e7d6185309c0e4461d02667b0be2bb08e021f1af1898d3e592e",
  ],
  [
    "services/knowledge-engine/src/domain/provider-readiness.ts",
    "a49b60cc18d55fbb623103bbccebdcdc72838c34c488744e9586843c1443d830",
  ],
  [
    "services/knowledge-engine/src/domain/reasoning.ts",
    "34ae3e299e7c70fa0aaccaa8ad52fd85491cd6298cc0e7532f404f6b1103e6dc",
  ],
]);

function read(path: string): string {
  return readFileSync(resolve(ROOT, path), "utf8");
}

describe("Milestone 19 documentation and structural traceability", () => {
  it("contains the complete versioned document set and root index references", () => {
    const index = read("DOCUMENTATION_INDEX.md");
    for (const document of DOCUMENTS) {
      expect(readFileSync(resolve(M19, document), "utf8")).not.toHaveLength(0);
      expect(index).toContain(document);
    }
    expect(read("README.md")).toContain("Milestone 19");
    expect(read("CHANGELOG.md")).toContain("Milestone 19");
    expect(read("ARCHITECTURE_DECISIONS.md")).toContain("ADR-0023");
  });

  it("maps every acceptance criterion to a concrete implementation or proof anchor", () => {
    expect(TRACEABILITY.map(([id]) => id)).toEqual(
      Array.from({ length: 20 }, (_, index) => `M19-AC-${String(index + 1).padStart(3, "0")}`),
    );
    for (const [, file, anchor] of TRACEABILITY) expect(read(file)).toContain(anchor);
  });

  it("keeps the complete transitive M19 production closure free of prohibited capabilities", () => {
    const closure = collectTransitiveTypeScriptModuleClosure(ROOT, PRODUCTION_MODULES);
    expect(closure.map(({ path }) => path)).toEqual(
      expect.arrayContaining([...PRODUCTION_MODULES]),
    );
    expect(
      findMilestone17CapabilityViolations(closure, {
        additionalDynamicAccessSourceFingerprints: M19_REVIEWED_DYNAMIC_ACCESS_FINGERPRINTS,
        additionalSafeReflectionMembers: new Map([
          [
            "services/knowledge-engine/src/domain/durable-registry.ts",
            new Set([
              "Object.create",
              "Object.defineProperty",
              "Object.entries",
              "Object.fromEntries",
              "Object.getOwnPropertyDescriptor",
              "Object.getPrototypeOf",
              "Object.hasOwn",
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
          [
            "services/knowledge-engine/src/domain/credential-resolution.ts",
            new Set(["Reflect.ownKeys"]),
          ],
          [
            "services/knowledge-engine/src/domain/openai-responses-adapter.ts",
            new Set(["Reflect.ownKeys"]),
          ],
        ]),
      }),
    ).toEqual([]);
    const integrationPackage = JSON.parse(read("integrations/openai-responses/package.json")) as {
      dependencies?: Record<string, string>;
    };
    expect(integrationPackage.dependencies).toEqual({
      "@founderos/knowledge-schema": "workspace:*",
    });
  });

  it("proves the closure witness detects an injected network capability", () => {
    const closure = collectTransitiveTypeScriptModuleClosure(ROOT, PRODUCTION_MODULES);
    expect(
      findMilestone17CapabilityViolations([
        ...closure,
        { path: "mutation.ts", source: "fetch('mutation.invalid')", importSpecifiers: [] },
      ]),
    ).toContain("mutation.ts:network-global");
    expect(
      findMilestone17CapabilityViolations([
        ...closure,
        {
          path: "computed-global-mutation.ts",
          source: 'const transport = globalThis["fetch"]',
          importSpecifiers: [],
        },
      ]),
    ).toContain("computed-global-mutation.ts:network-global");
    expect(
      findMilestone17CapabilityViolations([
        ...closure,
        {
          path: "indirect-loader-mutation.ts",
          source: 'const loader = candidate["constructor"]',
          importSpecifiers: [],
        },
      ]),
    ).toContain("indirect-loader-mutation.ts:alternative-module-loader");
  });
});
