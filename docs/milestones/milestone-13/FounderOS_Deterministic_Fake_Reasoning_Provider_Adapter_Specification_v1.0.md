# FounderOS Deterministic Fake Reasoning Provider Adapter Specification v1.0

## Purpose

Define a deterministic adapter used to prove Reasoning Invocation, Result Evidence, retries, failures, timeouts, and cancellation without calling a real provider.

## Required Behavior

For identical:

- Verified Invocation Request
- Delivery Envelope
- Capability Descriptor
- Execution Policy
- Attempt number
- Explicit evaluation time
- Configured fixture mode

the fake provider must return byte-identical canonical output.

## Fixture Modes

The adapter should support deterministic modes such as:

- Successful structured response
- Successful empty response
- Output-budget overflow
- Deterministic transient failure
- Deterministic permanent failure
- Timeout
- Cancellation before execution
- Cooperative cancellation
- Malformed provider outcome for verifier testing

## Success Output

A success result may deterministically derive content from:

- Invocation Request fingerprint
- Context Package fingerprint
- Instruction fingerprints
- Fixture mode
- Attempt number

It must not invent hidden knowledge or access repository state.

## Failure Safety

The adapter must not read environment credentials, call a network, use random numbers, or depend on wall-clock time.

## Principle

The fake provider proves execution governance and evidence integrity without pretending to be an intelligent production model.
