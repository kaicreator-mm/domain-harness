# DomainHarness v0.2 deterministic runtime conformance (G30)

This directory is the **single shared semantic suite** consumed by host-specific validation.
T-017 owns only this host-neutral contract, deterministic fixtures, semantic comparison and
suite self-test. T-018 and T-019 bind the same suite to Node and Expo/Hermes respectively.

## What G30 compares

The suite compares only PRD-observable behavior:

- durable message acceptance, concurrent duplicate ACK/dedup race and rejection classification;
- Workflow Instance lifecycle, state revision and semantic state/output;
- deterministic Domain Tool input/output/failure observations supplied by the test binding;
- Query and Projection values plus declared workflow-source state;
- processed/failed Domain Message disposition and failure classification;
- emitted Domain Message target/type/payload/correlation/causation semantics.

The host adapter must remove non-semantic implementation details before returning an
observation. In particular, package identities that legitimately differ by target, SQLite row
IDs, database handles, private engine snapshots, wall-clock timestamps and host diagnostics are
not part of G30 equality.

## Adapter contract

Implement `RuntimeConformanceHost` from `contracts.ts`. A session is created from the same
`PORTABLE_RUNTIME_FIXTURE`, then the suite drives public operations in a fixed order. `settle()`
is a deterministic causal drain barrier; it must not be implemented as an arbitrary timeout.
External nondeterminism must be replaced by the fixture-defined deterministic Tool/failure
bindings.

Host adapters must not branch on scenario identity or expected output. Node and Expo/Hermes
must execute the same fixture semantics and feed their public observations through this same
contract.

## T-017 self-test

`conformance.test.ts` proves that:

1. the reference harness satisfies the expected semantic trace;
2. different private storage/timestamp noise produces the same report;
3. an actual semantic change causes the suite to fail closed.

This self-test is G30 suite validation, not Node or Expo release qualification.
