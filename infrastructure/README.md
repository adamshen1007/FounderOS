# Infrastructure

Infrastructure-owned boundaries live here without reversing service or shared-package dependencies.

- `credential-resolver/` contains the Milestone 18 process-local deterministic synthetic resolver, rotation registry, permanent revocation state, and owned-buffer release mechanics. It reads no real credential and exposes no provider, endpoint, header, transport, or network capability.
