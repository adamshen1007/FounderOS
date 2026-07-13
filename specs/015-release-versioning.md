# Release and Versioning Specification

## Source Versions

Each book declares a version and status in `book.md` metadata. Draft content
may be built for review, but a public release requires human approval.

## Project Versions

Project changes are recorded in `CHANGELOG.md`. Milestone completion may be
tagged with a semantic project version after its exit criteria are satisfied.

## Build Artifacts

Generated artifacts use stable, human-readable filenames. M1 does not commit
artifacts to Git. CI stores them as workflow artifacts associated with the
source revision that produced them.

## Release Manifest

A future approved release may add a manifest beneath the book's `releases/`
directory containing:

- Book version
- Source commit
- Tool versions
- Artifact names
- Approval date and approver

M1 does not automate public release publication.

## Acceptance Criteria

- Every build is traceable to a Git revision.
- Book metadata contains a version and status.
- The change log records publishing-pipeline changes.
- Public release remains a human approval gate.
