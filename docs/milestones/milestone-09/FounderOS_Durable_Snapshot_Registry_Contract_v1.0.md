# FounderOS Durable Snapshot Registry Contract v1.0

## Purpose

Define the storage-independent contract for registering and reading governed KnowledgeOS snapshot state.

## Registry Responsibilities

The registry must support:

- Registering immutable snapshot records
- Reading a snapshot by identity
- Listing registered snapshots deterministically
- Reading lifecycle history
- Reading approval and rejection records
- Reading activation history
- Resolving the current active snapshot
- Verifying complete registry integrity
- Recovering state after restart

## Snapshot Registration Record

A durable snapshot registration should include:

- Record schema version
- Snapshot ID
- Snapshot contract version
- Corpus version
- Content fingerprint
- Strict canonical manifest evidence, including its logical manifest reference
- Manifest fingerprint recomputed as SHA-256 over the canonical manifest-evidence value
- Object count
- Provenance summary
- Creation timestamp
- Registration actor
- Registration reason
- Canonical record fingerprint

The durable manifest evidence preserves valid Milestone 04 manifest entry fields while narrowing
every recursively stored value to canonical JSON: null, booleans, strings, finite numbers, arrays,
and plain acyclic objects with string keys. Dates, big integers, non-finite numbers, class instances,
undefined, functions, symbols, cycles, sparse arrays, and other host values are invalid. An empty
durable manifest is valid for an empty snapshot; the general Milestone 04 migration-manifest
contract remains unchanged.

This strict value domain and serializer are dedicated to the durable manifest commitment. The
existing Milestone 07 and 08 canonical fingerprint serializer remains byte-compatible, including
omission of explicit `undefined` object properties and its historical array behavior. Registration
first requires the raw record to contain only canonical plain data containers with a valid own
enumerable data-property discriminator, then validates the original raw manifest evidence before
defensive cloning. It hashes the exact raw record before schema parsing and requires the parsed
record to be canonically equivalent to that raw representation. Transaction envelopes apply the
same rule and verify their original raw record entries before cloning. Builders strictly parse and
normalize before constructing fingerprints, so persisted output is explicit and canonical. A
discriminator accessor cannot bypass evidence validation, and missing default fields, trimmed
strings, unsupported prototypes, or accessors cannot be normalized or flattened into apparently
valid signed evidence. Raw primitive leaves are limited to null, strings, booleans, and finite
numbers; bigint, functions, symbols, undefined, and non-finite numbers fail with stable integrity
errors before hashing rather than leaking serializer exceptions. Before record construction, a
descriptor-safe builder projection may omit explicit `undefined` object properties only after the
strict record schema accepts them as valid optional Milestone 07 or 08 evidence. That projection
never permits undefined or sparse array positions and is never applied to persisted raw records.

Its `corpusId` must match the snapshot corpus and its evidence reference must match the snapshot and
provenance manifest reference. The canonical eligible manifest subset contains exactly entries whose
migration status is `ready` or `migrated` and whose review status is `approved`. After sorting by
object ID, this subset must match the snapshot descriptors one-to-one for object ID, object type,
source path, and source hash. Missing, extra, or mismatched entries are rejected even if an attacker
recomputes the manifest, record, and envelope fingerprints. The engine recomputes the manifest
commitment before record construction and again during replay. A caller-supplied digest is never
accepted as proof by itself. This additional registration evidence does not change the Milestone 07
snapshot-v1 shape, content fingerprint, or snapshot identity.

## Contract Expectations

The registry must:

- Reject duplicate snapshot IDs with different payloads
- Treat byte-equivalent repeat registration as idempotent
- Preserve original snapshot evidence
- Return defensive copies or immutable values
- Produce deterministic list ordering

The shared `DurableSnapshotRegistry` interface exposes safe activation and read, recovery,
integrity, and derived-index operations. It does not expose append methods that accept prebuilt
registration, lifecycle, decision, change-set, or activation records. Governed mutation inputs and
state-specific orchestration remain engine-owned, behind an internal adapter-neutral storage/writer
port.
- Never silently repair corrupted records

## Storage Independence

The shared contract must not expose:

- SQL concepts
- Filesystem paths
- Vendor-specific transaction types
- Vector or retrieval concepts

## Principle

The registry stores governed knowledge state; it does not perform knowledge retrieval or AI reasoning.
