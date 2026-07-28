import type { KnowledgeSnapshotComparisonEvidence } from "@founderos/knowledge-schema";

import {
  createCanonicalSha256Fingerprint,
  createKnowledgeObjectContentFingerprint,
} from "./canonical-fingerprint.js";

export function findKnowledgeSnapshotComparisonEvidenceIntegrityIssue(
  evidence: KnowledgeSnapshotComparisonEvidence,
): string | null {
  for (const objectEvidence of evidence.objects) {
    const canonicalObject = objectEvidence.object;
    if (canonicalObject.metadata.id !== objectEvidence.objectId) {
      return `Canonical object payload identity does not match evidence for ${objectEvidence.objectId}`;
    }
    if (canonicalObject.metadata.objectType !== objectEvidence.objectType) {
      return `Canonical object payload type does not match evidence for ${objectEvidence.objectId}`;
    }
    if (
      createCanonicalSha256Fingerprint(canonicalObject.metadata) !==
      objectEvidence.metadataFingerprint
    ) {
      return `Metadata fingerprint does not match canonical object payload for ${objectEvidence.objectId}`;
    }
    if (createCanonicalSha256Fingerprint(canonicalObject) !== objectEvidence.objectFingerprint) {
      return `Object fingerprint does not match canonical object payload for ${objectEvidence.objectId}`;
    }
    if (
      createKnowledgeObjectContentFingerprint(canonicalObject) !== objectEvidence.contentFingerprint
    ) {
      return `Content fingerprint does not match canonical object payload for ${objectEvidence.objectId}`;
    }
  }

  return null;
}
