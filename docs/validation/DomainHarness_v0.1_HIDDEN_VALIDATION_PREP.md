# DomainHarness v0.1 — Hidden Validation Preparation

**Status:** PREPARED, NOT EXECUTED

Hidden Validation is a held-out release gate. Its concrete cases must not be read, copied into visible tests or used to tune implementation before the visible candidate SHA is frozen.

## Entry conditions

1. T-017 is merged to `v0.1`.
2. A single exact candidate SHA is recorded.
3. Clean install/typecheck/test/build and visible Critical Journeys have executed on that SHA.
4. Tally and City Atlas cross-repo runners have executed against the same DomainHarness candidate.
5. Any visible failure is fixed through a new focused branch/PR and a new candidate SHA is frozen before Hidden Validation starts.

If an entry condition is unavailable because of environment, report `ENV-BLOCKED` or `NOT_RUN`; do not inspect held-out cases to make progress.

## Held-out coverage categories

The hidden suite should sample independent cases from these categories without publishing the cases before execution:

- Harness loader/static-validation failures, reference/cycle/fallback/schema boundaries and definition-hash stability;
- public API/export containment and clean-consumer packaging;
- every Step kind and Tool effect class across fresh execution and replay;
- crash boundaries around `started`, terminal journal commit and lagging control-state reconciliation;
- non-idempotent interrupted Tool behavior (must not auto-replay);
- deterministic expression logical time and forbidden JSONata functions;
- Worker timeout/cancel/resource/path/JSON-boundary failures for Script and Expression execution;
- waiting event declaration/schema rejection with zero mutation;
- concurrent sends and cancel-vs-late-result terminal fencing;
- Child Workflow scope isolation, repeated parent visits, nested recovery, depth/cycle defenses and deterministic `workflowInstanceId`;
- definition/engine mismatch rejection for active continuation while terminal history remains readable;
- `maxSteps` accounting including accepted waiting-event visits;
- domain-boundary tests proving Tally and City Atlas semantics remain outside Runtime;
- negative tests for v0.1 exclusions: no public XState surface, no DAG/Parallel/distributed/storage-provider contract accidentally exposed.

## Execution protocol

For each held-out case record:

```text
candidate SHA
case identifier (opaque)
command / harness invocation
PASS | FAIL | NOT_RUN | ENV-BLOCKED
minimal failure evidence
```

Do not record hidden case source or full held-out fixture in public closeout documentation.

A failure requires a focused GitHub Issue and a new task/fix branch. After any code change, re-run the visible affected surface first, freeze a new candidate SHA, then restart the relevant Hidden Validation gate.

## Exit condition

Hidden Validation is PASS only when every mandatory held-out case has actually executed successfully on the same release candidate (or on an explicitly documented replacement candidate after a complete required rerun). `PR PASS` and prior-task Build Host PASS are not substitutes for this release gate.
