export interface M15ScenarioDefinition {
  readonly scenarioId: string;
  readonly title: string;
  readonly requirements: readonly string[];
  readonly executableTestName: string;
}

export interface M15ScenarioExecutionEvidence {
  readonly scenarioId: string;
  readonly scenarioHelper: string;
  readonly observedProductionBoundaries: Readonly<Record<string, number>>;
  readonly assertionCount: number;
}

export interface M15ScenarioAssertionContract {
  readonly exactAssertionCount: number;
  readonly categories: readonly string[];
  readonly summary: string;
}

export interface M15ScenarioSemanticCoverageRow {
  readonly scenarioId: string;
  readonly catalogTitle: string;
  readonly requirementIds: readonly string[];
  readonly exactSetupMutation: string;
  readonly actualObservedProductionBoundary: string;
  readonly exactExpectedResult: string;
  readonly stateAssertions: string;
  readonly callCountAssertions: string;
  readonly restartProcessFilesystemEvidence: string;
  readonly scenarioHelper: string;
}

export interface M15ScenarioBehavior {
  readonly scenarioId: string;
  readonly coverageKind: "behavioral";
  readonly expectedProductionBoundary: string;
  readonly scenarioHelper: string;
  readonly assertionContract: M15ScenarioAssertionContract;
  readonly semanticCoverage: M15ScenarioSemanticCoverageRow;
  readonly execute: () => Promise<M15ScenarioExecutionEvidence>;
}

export interface M15RuntimeScenario extends M15ScenarioDefinition, M15ScenarioBehavior {
  readonly requirementIds: readonly string[];
}

const EXPECTED_SCENARIOS = 72;
export const M15_GENERIC_FALLBACK_SENTINEL = "generic-fallback";
const issuedEvidence = new WeakSet<object>();

function expectedScenarioIds(): readonly string[] {
  return Array.from(
    { length: EXPECTED_SCENARIOS },
    (_, index) => `M15-SC-${String(index + 1).padStart(3, "0")}`,
  );
}

function assertExactScenarioIds(ids: readonly string[], kind: string): void {
  const expected = expectedScenarioIds();
  if (ids.length !== EXPECTED_SCENARIOS) throw new Error(`${kind}-count-invalid`);
  if (new Set(ids).size !== ids.length) throw new Error(`${kind}-duplicate`);
  if (ids.join("\0") !== expected.join("\0")) throw new Error(`${kind}-gap`);
}

function assertBehaviorMetadata(behavior: M15ScenarioBehavior): void {
  if (behavior.coverageKind !== "behavioral") throw new Error("scenario-coverage-kind-invalid");
  if (behavior.expectedProductionBoundary.trim().length === 0) {
    throw new Error("scenario-implementation-boundary-missing");
  }
  if (behavior.scenarioHelper.trim().length === 0) throw new Error("scenario-helper-missing");
  if (behavior.scenarioHelper === M15_GENERIC_FALLBACK_SENTINEL) {
    throw new Error("scenario-generic-fallback-forbidden");
  }
  if (
    !Number.isSafeInteger(behavior.assertionContract.exactAssertionCount) ||
    behavior.assertionContract.exactAssertionCount < 1 ||
    behavior.assertionContract.categories.length === 0 ||
    new Set(behavior.assertionContract.categories).size !==
      behavior.assertionContract.categories.length ||
    behavior.assertionContract.categories.some((category) => category.trim().length === 0) ||
    behavior.assertionContract.summary.trim().length === 0
  ) {
    throw new Error(`scenario-assertion-summary-missing:${behavior.scenarioId}`);
  }
  if (typeof behavior.execute !== "function") throw new Error("scenario-helper-missing");
}

export function issueM15ScenarioExecutionEvidence(input: M15ScenarioExecutionEvidence) {
  const evidence = Object.freeze({
    ...input,
    observedProductionBoundaries: Object.freeze({ ...input.observedProductionBoundaries }),
  });
  issuedEvidence.add(evidence);
  return evidence;
}

export function createM15RuntimeScenarioRegistry(
  definitions: readonly M15ScenarioDefinition[],
  behaviors: readonly M15ScenarioBehavior[],
): readonly M15RuntimeScenario[] {
  const definitionIds = definitions.map((definition) => definition.scenarioId);
  const behaviorIds = behaviors.map((behavior) => behavior.scenarioId);
  assertExactScenarioIds(definitionIds, "scenario-registry");
  assertExactScenarioIds(behaviorIds, "scenario-behavior-registry");
  const behaviorById = new Map(behaviors.map((behavior) => [behavior.scenarioId, behavior]));
  return Object.freeze(
    definitions.map((definition) => {
      const behavior = behaviorById.get(definition.scenarioId);
      if (behavior === undefined) throw new Error("scenario-helper-missing");
      assertBehaviorMetadata(behavior);
      return Object.freeze({
        ...definition,
        ...behavior,
        requirementIds: definition.requirements,
      });
    }),
  );
}

export function verifyM15ScenarioExecution(
  scenario: M15RuntimeScenario,
  evidence: M15ScenarioExecutionEvidence | undefined,
): void {
  if (
    evidence === undefined ||
    !issuedEvidence.has(evidence) ||
    evidence.scenarioId !== scenario.scenarioId ||
    evidence.scenarioHelper !== scenario.scenarioHelper
  ) {
    throw new Error("scenario-execution-mapping-invalid");
  }
  if ((evidence.observedProductionBoundaries[scenario.expectedProductionBoundary] ?? 0) < 1) {
    throw new Error("scenario-production-behavior-not-invoked");
  }
  if (evidence.assertionCount !== scenario.assertionContract.exactAssertionCount) {
    throw new Error("scenario-assertion-contract-unsatisfied");
  }
}
