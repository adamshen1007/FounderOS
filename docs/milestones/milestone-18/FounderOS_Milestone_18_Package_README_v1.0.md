# FounderOS Milestone 18 Package README v1.0

Milestone 18 adds a process-local synthetic credential-resolution and rotation foundation with no
transport.

## Documents

- Architecture design
- Core specification
- Credential Resolution Request and Evidence contract
- Credential Rotation and Revocation contract
- Acceptance criteria
- Verification checklist
- TDD implementation plan

## Ownership

- `@founderos/knowledge-schema`: secret-free contracts.
- `@founderos/knowledge-engine`: registered M17 verification and orchestration.
- `@founderos/credential-resolver`: synthetic material, rotation, revocation, and release mechanics.

## Boundary

The milestone cannot read a real secret or construct a provider request. It adds no environment,
filesystem, Keychain, vault, SDK, endpoint, header, DNS, TLS, socket, HTTP, deployment, or live
execution capability.
