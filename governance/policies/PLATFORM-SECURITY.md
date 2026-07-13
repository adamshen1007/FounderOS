# Local Platform Security Policy

## Boundary

M5A is a single-user local tool. It is not approved for LAN, internet, shared-
host, or multi-tenant deployment.

## Controls

- Bind only to IPv4 or IPv6 loopback.
- Keep project roots inside the repository and reject symbolic links.
- Deny secret-shaped paths and never expose environment values through the API.
- Require same-origin JSON requests, CSRF tokens, and explicit confirmation for
  workflow jobs.
- Execute only fixed argument arrays with `shell: false`.
- Limit execution to one job and retain bounded, redacted logs.
- Recover interrupted jobs as failed rather than silently retrying them.
- Exclude Git, approval, push, publish, and arbitrary commands from the job
  allowlist.

## Retention

Local job records under `.founderos/platform/jobs/` are ignored by Git. Delete
terminal records after 30 days unless an incident or active audit requires them.
Committed examples must be sanitized and must not originate from private logs.

Remote access, user accounts, and collaboration require a new threat model and
RFC before implementation.
