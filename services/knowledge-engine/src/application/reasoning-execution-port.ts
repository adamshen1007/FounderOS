import type {
  ReasoningExecutionAttempt,
  ReasoningInvocationRequest,
  ReasoningProviderCapabilityDescriptor,
  ReasoningProviderCompatibilityResult,
} from "@founderos/knowledge-schema";

export type DeterministicFakeReasoningFixtureMode =
  | "cancellation-before-execution"
  | "cooperative-cancellation"
  | "contradictory-outcome"
  | "credential-bearing-outcome"
  | "deterministic-permanent-failure"
  | "deterministic-transient-failure"
  | "deadline-cancellation"
  | "malformed-failure-outcome"
  | "malformed-success-outcome"
  | "output-budget-overflow"
  | "physical-path-bearing-outcome"
  | "successful-empty-response"
  | "successful-structured-response"
  | "timeout"
  | "transient-failure-then-success";

export interface ReasoningCancellationSignal {
  readonly authorityReference: string;
  readonly requestedAt: string;
  readonly observedAt: string;
  readonly state:
    | "not-requested"
    | "requested-at-deadline"
    | "requested-before-execution"
    | "requested-cooperatively";
}

export interface ReasoningExecutionPortInput {
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  readonly compatibility: ReasoningProviderCompatibilityResult;
  readonly attempt: ReasoningExecutionAttempt;
  readonly completedAt: string;
  readonly evaluationTime: string;
  readonly cancellationSignal: ReasoningCancellationSignal;
  readonly fixtureMode: DeterministicFakeReasoningFixtureMode;
}

export interface ProviderNeutralReasoningExecutionPort {
  readonly providerCapability: ReasoningProviderCapabilityDescriptor;
  execute(input: ReasoningExecutionPortInput): Promise<unknown>;
}
