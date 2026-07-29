import {
  KnowledgeContextAssemblyResultSchema,
  KnowledgeContextRequestSchema,
  RegistryIntegrityResultSchema,
  RegistryRecoveryResultSchema,
  type KnowledgeContextAssemblyResult,
  type KnowledgeRepository,
  type KnowledgeRepositorySnapshot,
} from "@founderos/knowledge-schema";

import type { GovernedDurableSnapshotRegistry } from "./manage-governed-durable-snapshot-registry.js";
import { assembleKnowledgeContextFromVerifiedInputs } from "../domain/knowledge-context.js";
import { deepFreeze } from "../domain/snapshot-lifecycle.js";

export interface AssembleGovernedKnowledgeContextInput {
  readonly request: unknown;
  readonly registry: GovernedDurableSnapshotRegistry;
  readonly repository: KnowledgeRepository;
  readonly repositorySnapshot: KnowledgeRepositorySnapshot;
}

export async function assembleGovernedKnowledgeContext(
  input: AssembleGovernedKnowledgeContextInput,
): Promise<KnowledgeContextAssemblyResult> {
  const request = KnowledgeContextRequestSchema.parse(input.request);
  const integrity = RegistryIntegrityResultSchema.parse(await input.registry.verifyIntegrity());
  if (integrity.status !== "valid") {
    return deepFreeze(
      KnowledgeContextAssemblyResultSchema.parse({
        schemaVersion: "1.0",
        status: "insufficient_context",
        requestId: request.requestId,
        issues: [
          {
            code: "registry_integrity_invalid",
            path: "registry.integrity",
            message: "Durable registry integrity verification failed",
          },
        ],
      }),
    );
  }
  const recovery = RegistryRecoveryResultSchema.parse(await input.registry.recover());
  if (recovery.status !== "recovered") {
    return deepFreeze(
      KnowledgeContextAssemblyResultSchema.parse({
        schemaVersion: "1.0",
        status: "insufficient_context",
        requestId: request.requestId,
        issues: [
          {
            code: "registry_recovery_failed",
            path: "registry.recovery",
            message: "Durable registry recovery failed",
          },
        ],
      }),
    );
  }
  const registration = await input.registry.getCurrentActiveSnapshot();
  if (registration === null) {
    return deepFreeze(
      KnowledgeContextAssemblyResultSchema.parse({
        schemaVersion: "1.0",
        status: "insufficient_context",
        requestId: request.requestId,
        issues: [
          {
            code: "active_snapshot_missing",
            path: "registry.activeSnapshotId",
            message: "No durably active snapshot exists",
          },
        ],
      }),
    );
  }
  const candidates = await input.repository.getCandidates();
  return assembleKnowledgeContextFromVerifiedInputs({
    request,
    candidateInputs: candidates,
    bindings: { registration, integrity, recovery, repositorySnapshot: input.repositorySnapshot },
  });
}
