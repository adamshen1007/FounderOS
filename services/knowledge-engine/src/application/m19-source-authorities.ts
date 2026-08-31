import {
  KnowledgeContextPackageSchema,
  type CommittedDeliveryTransactionRecord,
  type DurableReadinessEvaluationLedger,
  type FounderDecisionMemoInstructionProfile,
  type KnowledgeContextPackage,
  type M19PolicyAuthorityEvidence,
  type ProductionProviderAdapterDescriptor,
  type ReasoningInvocationRequest,
  type SecureTransportPolicy,
} from "@founderos/knowledge-schema";

import { serializeDurableCanonicalJsonValue } from "../domain/canonical-fingerprint.js";
import { verifyCommittedDeliveryTransaction } from "../domain/durable-context-delivery-ledger.js";
import { verifyCommittedReadinessTransaction } from "../domain/durable-readiness-ledger.js";
import {
  verifyKnowledgeContextPackage,
  type VerifyKnowledgeContextPackageInput,
} from "../domain/knowledge-context.js";
import {
  createFounderDecisionMemoInputProjection,
  createM19ReadinessAuthorityEvidence,
  verifyM19PolicyAuthorityEvidence,
  verifyFounderDecisionMemoInstructionProfile,
} from "../domain/openai-responses-adapter.js";
import {
  verifySecureTransportPolicy,
  type SecureTransportPolicyInput,
} from "../domain/provider-readiness.js";
import { verifyReasoningInvocationRequest } from "../domain/reasoning.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";
import {
  M19AuthorityResolutionError,
  type M19AuthorityRequest,
  type M19InputProjectionAuthorityPort,
  type M19ReadinessAuthorityPort,
} from "./openai-responses-preparation-orchestrator.js";

export interface DurableM19ReadinessAuthorityConfiguration {
  readonly schemaVersion: "1.0";
  readonly ledger: DurableReadinessEvaluationLedger;
  readonly transactionId: string;
  readonly adapterState: "dry-run-mapping";
  readonly environmentClass: "development" | "evaluation" | "production" | "staging" | "test";
  readonly operation: "founder-decision-memo";
  readonly transportPolicy: SecureTransportPolicy;
  readonly transportPolicyVerification: {
    readonly adapter: ProductionProviderAdapterDescriptor;
    readonly expectedPolicy: SecureTransportPolicyInput;
  };
  readonly policyAuthorityEvidence: M19PolicyAuthorityEvidence;
  readonly expiresAt: string;
  readonly issuerReference: string;
}

export function createDurableM19ReadinessAuthority(
  configuration: DurableM19ReadinessAuthorityConfiguration,
): M19ReadinessAuthorityPort {
  const { ledger, ...authorityConfiguration } = configuration;
  const captured = deepFreeze(structuredClone(authorityConfiguration));
  if (
    captured.schemaVersion !== "1.0" ||
    captured.adapterState !== "dry-run-mapping" ||
    captured.operation !== "founder-decision-memo" ||
    verifySecureTransportPolicy({
      policy: captured.transportPolicy,
      ...captured.transportPolicyVerification,
    }).status !== "valid" ||
    verifyM19PolicyAuthorityEvidence(captured.policyAuthorityEvidence).status !== "valid" ||
    captured.policyAuthorityEvidence.environmentClass !== captured.environmentClass ||
    captured.policyAuthorityEvidence.operation !== captured.operation ||
    !Number.isFinite(Date.parse(captured.expiresAt))
  ) {
    throw new TypeError("Durable M19 readiness authority configuration is invalid");
  }
  return Object.freeze({
    async resolve(input: M19AuthorityRequest) {
      const recovery = await ledger.recover();
      const integrity = await ledger.verifyIntegrity();
      const stored = await ledger.readOriginalReadinessEvaluation(captured.transactionId);
      if (integrity.status !== "valid" || recovery.status !== "recovered" || stored === null) {
        throw new TypeError("Durable M19 readiness authority is unavailable");
      }
      const transaction = verifyCommittedReadinessTransaction(stored);
      const decision = transaction.evaluationPackage.decision;
      const retained = transaction.evaluationPackage.retainedEvidence;
      const retainedPlan = retained.requestPlan;
      const authorization = input.decision.authorizationRequest;
      if (
        transaction.transactionId !== captured.transactionId ||
        decision.status !== "ready-for-dry-run" ||
        retainedPlan === null ||
        retained.compatibility === null ||
        retained.transportPlan === null ||
        retained.rateAndCapacity === null ||
        retained.costAndBudget === null ||
        retained.observability === null ||
        retained.observabilityRetention === null ||
        decision.requestPlanFingerprint !== retainedPlan.requestPlanFingerprint ||
        decision.capabilityResultFingerprint !== retained.compatibility.compatibilityFingerprint ||
        transaction.providerCapabilityFingerprint !==
          retained.compatibility.providerCapabilityFingerprint ||
        retainedPlan.providerCapabilityFingerprint !== transaction.providerCapabilityFingerprint ||
        decision.rateAndCapacityDecisionFingerprint !==
          retained.rateAndCapacity.decisionFingerprint ||
        decision.costAndBudgetDecisionFingerprint !== retained.costAndBudget.decisionFingerprint ||
        retained.costAndBudget.pricingReferenceId !==
          captured.policyAuthorityEvidence.pricingEvidenceId ||
        retained.costAndBudget.pricingReferenceFingerprint !==
          captured.policyAuthorityEvidence.pricingEvidenceFingerprint ||
        decision.observabilityReadinessFingerprint !==
          retained.observability.readiness.readinessFingerprint ||
        decision.observabilityRetentionFingerprint !==
          retained.observabilityRetention.retentionFingerprint ||
        decision.adapterId !== transaction.adapterId ||
        decision.adapterFingerprint !== transaction.adapterFingerprint ||
        retainedPlan.adapterId !== transaction.adapterId ||
        retainedPlan.adapterFingerprint !== transaction.adapterFingerprint ||
        transaction.adapterId !== authorization.adapterId ||
        transaction.adapterFingerprint !== authorization.adapterFingerprint ||
        transaction.providerFamilyReference !== authorization.providerFamilyReference ||
        transaction.providerFamilyReference !== "provider-family/openai" ||
        transaction.transportPolicyId !== captured.transportPolicy.transportPolicyId ||
        transaction.transportPolicyFingerprint !== captured.transportPolicy.policyFingerprint ||
        captured.transportPolicy.maximumResponseBytes !==
          retainedPlan.expectedResponseConstraints.maximumResponseBytes ||
        retainedPlan.deliveryTransactionId !== authorization.deliveryTransactionId ||
        retainedPlan.deliveryTransactionFingerprint !==
          authorization.deliveryTransactionFingerprint ||
        retainedPlan.invocationRequestId !== authorization.invocationRequestId ||
        retainedPlan.invocationRequestFingerprint !== authorization.invocationRequestFingerprint ||
        captured.environmentClass !== authorization.environmentClass ||
        captured.operation !== authorization.operation
      ) {
        throw new TypeError("Durable M15/M14 authority coordinates do not match");
      }
      return createM19ReadinessAuthorityEvidence({
        schemaVersion: "1.0",
        preparationId: input.preparationId,
        executionAttemptId: authorization.executionAttemptId,
        executionAttemptFingerprint: authorization.executionAttemptFingerprint,
        authorizationDecisionId: input.decision.authorizationDecisionId,
        authorizationDecisionFingerprint: input.decision.decisionFingerprint,
        authorizationClaimId: input.claim.authorizationClaimId,
        authorizationClaimFingerprint: input.claim.claimFingerprint,
        adapterId: transaction.adapterId,
        adapterFingerprint: transaction.adapterFingerprint,
        providerFamilyReference: "provider-family/openai",
        environmentClass: captured.environmentClass,
        operation: captured.operation,
        readinessTransactionId: transaction.transactionId,
        readinessTransactionFingerprint: transaction.transactionFingerprint,
        m14DecisionId: decision.readinessDecisionId,
        m14DecisionFingerprint: decision.decisionFingerprint,
        m14RequestPlanId: retainedPlan.requestPlanId,
        m14RequestPlanFingerprint: retainedPlan.requestPlanFingerprint,
        m14ProviderCapabilityFingerprint: transaction.providerCapabilityFingerprint,
        m14CompatibilityFingerprint: retained.compatibility!.compatibilityFingerprint,
        m14RateCapacityFingerprint: retained.rateAndCapacity!.decisionFingerprint,
        m14CostBudgetFingerprint: retained.costAndBudget!.decisionFingerprint,
        m14TransportPolicyFingerprint: transaction.transportPolicyFingerprint,
        privacyPolicyFingerprint: captured.policyAuthorityEvidence.privacyPolicyFingerprint,
        m14PricingEvidenceId: captured.policyAuthorityEvidence.pricingEvidenceId,
        m14PricingEvidenceFingerprint: captured.policyAuthorityEvidence.pricingEvidenceFingerprint,
        providerRetentionEvidenceId: captured.policyAuthorityEvidence.providerRetentionEvidenceId,
        providerRetentionEvidenceFingerprint:
          captured.policyAuthorityEvidence.providerRetentionEvidenceFingerprint,
        policyAuthorityEvidenceFingerprint: captured.policyAuthorityEvidence.evidenceFingerprint,
        pricingReviewedAt: captured.policyAuthorityEvidence.pricingReviewedAt,
        pricingExpiresAt: captured.policyAuthorityEvidence.pricingExpiresAt,
        privacyReviewedAt: captured.policyAuthorityEvidence.privacyReviewedAt,
        privacyExpiresAt: captured.policyAuthorityEvidence.privacyExpiresAt,
        providerRetentionReviewedAt: captured.policyAuthorityEvidence.providerRetentionReviewedAt,
        providerRetentionExpiresAt: captured.policyAuthorityEvidence.providerRetentionExpiresAt,
        accountRetentionEvidenceId: captured.policyAuthorityEvidence.accountRetentionEvidenceId,
        accountRetentionEvidenceFingerprint:
          captured.policyAuthorityEvidence.accountRetentionEvidenceFingerprint,
        accountRetentionReviewedAt: captured.policyAuthorityEvidence.accountRetentionReviewedAt,
        accountRetentionExpiresAt: captured.policyAuthorityEvidence.accountRetentionExpiresAt,
        operationFingerprint: captured.policyAuthorityEvidence.operationFingerprint,
        cachePolicyReviewedAt: captured.policyAuthorityEvidence.cachePolicyReviewedAt,
        cachePolicyExpiresAt: captured.policyAuthorityEvidence.cachePolicyExpiresAt,
        cacheEvidenceReference: captured.policyAuthorityEvidence.cacheEvidenceReference,
        m14DecisionStatus: "ready-for-dry-run",
        adapterState: "dry-run-mapping",
        maximumRequestBytes: captured.transportPolicy.maximumRequestBytes,
        maximumResponseBytes: retainedPlan.expectedResponseConstraints.maximumResponseBytes,
        maximumInputCharacters: retainedPlan.inputSizeEvidence.maximumInputCharacters,
        maximumOutputCharacters: retainedPlan.expectedResponseConstraints.maximumOutputCharacters,
        evaluatedAt: input.evaluatedAt,
        expiresAt: captured.expiresAt,
        issuerReference: captured.issuerReference,
      });
    },
  });
}

export interface FounderDecisionMemoProjectionSource {
  readonly schemaVersion: "1.0";
  readonly deliveryTransaction: CommittedDeliveryTransactionRecord;
  readonly invocationRequest: ReasoningInvocationRequest;
  readonly contextPackage: KnowledgeContextPackage;
  readonly contextVerification: Omit<VerifyKnowledgeContextPackageInput, "package">;
  readonly instructionProfile: FounderDecisionMemoInstructionProfile;
}

export function createSourceBoundFounderDecisionMemoInputProjectionAuthority(
  source: FounderDecisionMemoProjectionSource,
): M19InputProjectionAuthorityPort {
  const captured = deepFreeze(structuredClone(source));
  const deliveryTransaction = verifyCommittedDeliveryTransaction(captured.deliveryTransaction);
  const taskBlocks = captured.invocationRequest.reasoningInput.instructionBlocks.filter(
    (block) =>
      block.blockType === "task-instruction" && block.sourceClassification === "request-author",
  );
  const included = [...captured.contextPackage.included].sort(
    (left, right) => left.selectionPosition - right.selectionPosition,
  );
  if (
    captured.schemaVersion !== "1.0" ||
    verifyReasoningInvocationRequest(captured.invocationRequest).status !== "valid" ||
    !KnowledgeContextPackageSchema.safeParse(captured.contextPackage).success ||
    verifyKnowledgeContextPackage({
      package: captured.contextPackage,
      ...captured.contextVerification,
    }).status !== "valid" ||
    verifyFounderDecisionMemoInstructionProfile(captured.instructionProfile).status !== "valid" ||
    taskBlocks.length !== 1 ||
    included.some((entry, index) => entry.selectionPosition !== index + 1) ||
    deliveryTransaction.transactionId !== captured.invocationRequest.deliveryTransactionId ||
    captured.invocationRequest.contextPackageId !== captured.contextPackage.contextPackageId ||
    captured.invocationRequest.contextPackageFingerprint !==
      captured.contextPackage.contextFingerprint
  ) {
    throw new TypeError("Founder decision memo projection source is invalid");
  }
  const instructionArtifact = {
    schemaVersion: captured.instructionProfile.schemaVersion,
    profileId: captured.instructionProfile.profileId,
    serialization: captured.instructionProfile.serialization,
    instructionBlocks: captured.instructionProfile.instructionBlocks,
    sectionNames: captured.instructionProfile.sectionNames,
  };
  const projectionArtifact = {
    schemaVersion: "1.0" as const,
    question: taskBlocks[0]!.text,
    deliveryTransactionId: deliveryTransaction.transactionId,
    deliveryTransactionFingerprint: deliveryTransaction.transactionFingerprint,
    invocationRequestId: captured.invocationRequest.invocationRequestId,
    invocationRequestFingerprint: captured.invocationRequest.requestFingerprint,
    contextPackageId: captured.contextPackage.contextPackageId,
    contextPackageFingerprint: captured.contextPackage.contextFingerprint,
    contextEntries: included.map((entry) => ({
      objectId: entry.objectId,
      objectType: entry.objectType,
      canonicalContent: entry.canonicalContent,
      includedContentFingerprint: entry.includedContentFingerprint,
      evidenceReference: entry.logicalSourceIdentifier,
    })),
  };
  const instructions = serializeDurableCanonicalJsonValue(instructionArtifact);
  const projectedInput = serializeDurableCanonicalJsonValue(projectionArtifact);
  const projection = createFounderDecisionMemoInputProjection({
    ...projectionArtifact,
    instructionCharacterCount: [...instructions].length,
    instructionUtf8ByteCount: Buffer.byteLength(instructions, "utf8"),
    inputCharacterCount: [...projectedInput].length,
    inputUtf8ByteCount: Buffer.byteLength(projectedInput, "utf8"),
    authorizedInputUtf8ByteCount:
      Buffer.byteLength(instructions, "utf8") + Buffer.byteLength(projectedInput, "utf8"),
  });
  return Object.freeze({
    async resolve(input: M19AuthorityRequest) {
      const authorization = input.decision.authorizationRequest;
      if (
        authorization.deliveryTransactionId !== projection.deliveryTransactionId ||
        authorization.deliveryTransactionFingerprint !==
          projection.deliveryTransactionFingerprint ||
        authorization.invocationRequestId !== captured.invocationRequest.invocationRequestId ||
        authorization.invocationRequestFingerprint !==
          captured.invocationRequest.requestFingerprint ||
        authorization.contextPackageId !== captured.contextPackage.contextPackageId ||
        authorization.contextPackageFingerprint !== captured.contextPackage.contextFingerprint
      ) {
        throw new M19AuthorityResolutionError(
          "coordinate_mismatch",
          "Founder decision memo projection authority coordinates do not match",
        );
      }
      return deepFreeze(structuredClone(projection));
    },
  });
}
