# FounderOS Credential Rotation and Revocation Contract v1.0

## Rotation

The initial synthetic reference has positive sequence `1`. A `CredentialRotationRecord` binds its
ID, Credential Reference ID and fingerprint, prior and next versions, exact next sequence,
effective time, rotation authority and evidence references, environment, provider, Adapter, and a
domain-separated fingerprint.

A transition must name the current active version and the next sequence. Equal, stale, skipped,
reused, conflicting, foreign-authority, or time-regressing input rejects without consuming a
sequence or changing active state. Prior versions remain permanently unavailable.

## Revocation

`CredentialRevocationRecord` binds its ID, exact reference and rotation version, positive monotonic
revocation version, revocation time, authority reference, bounded reason code, and fingerprint.
Revocation is permanent and does not delete history or reactivate an older version.

## Resolver Result

The synchronous resolver port returns a strict secret-free union. Success confirms exact active
version materialization and `released`; failure uses closed state or integrity reasons. The facade
does not expose material, a lease, callbacks, store handles, or release controls.
