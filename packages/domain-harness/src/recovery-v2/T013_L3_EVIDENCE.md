# T-013 L3 Implementation Evidence

Task: DomainHarness v0.2 T-013 — poison-message recovery + terminal disposition closure.

Baseline: `4a53f8907ba70d7e18d7e35db85fcfbdec271821`.

## 1. Tests

Primary executable evidence is `tests/recovery-v2/poison-message-recovery.test.ts`.

G17 coverage:

- a failed accepted message is persisted as `failed` and the instance becomes `recovery_required`;
- a later already-accepted message remains durable and cannot become processable while recovery is unresolved;
- T-011 `DomainMessageAcceptance` rejects a new state-changing message before its durable ACK boundary;
- an ordinary poison retry requires explicit domain-policy authorization and restores the poison message ahead of later messages;
- an ambiguous non-idempotent Tool result cannot use ordinary retry authorization; retry is only exposed after an explicit matching ambiguity-resolution decision.

G18 coverage:

- normal terminalization marks all accepted-but-unprocessed messages `abandoned`;
- recovery terminalization requires explicit domain authorization and marks both the failed poison message and following pending messages `abandoned`;
- terminal dispositions remain queryable through `getMessageDisposition`.

The test fake implements only the semantic RuntimeStore surface needed by T-013. It is not a host adapter or copied sibling implementation.

## 2. Contract / Interface

T-013 consumes frozen contracts rather than redefining them:

- `RuntimeStore.failMessageProcessing` is the atomic processing-failure + `recovery_required` durability boundary;
- `RuntimeStore.resetRecovery` is the explicit retry/reset transition;
- `RuntimeStore.terminalizeInstance` is the atomic terminalization + pending-message abandonment boundary;
- `RuntimeStore.getMessageDisposition` provides recovery inspection and terminal-disposition observability;
- `RuntimeStore.getNextAcceptedMessage` supplies the next durable mailbox item;
- T-009 `RecoveryRequiredToolEffectResult` carries the ambiguous non-idempotent effect identity into recovery;
- T-011 `DomainMessageAcceptance` remains the owner of pre-ACK target acceptance checks.

No public v0.2 barrel/runtime wiring is changed; T-016 owns that integration.

## 3. Core Implementation

`PoisonMessageRecoveryCoordinator` is intentionally narrow policy/orchestration over the frozen semantic store operations. It provides:

- `inspect`;
- `nextProcessableMessage`, which returns no work for `recovery_required` or terminal targets;
- `recordProcessingFailure`;
- `recordToolRecoveryRequired`;
- explicit `retry`;
- normal or recovery-mode `terminalize`.

The coordinator does not create another per-instance scheduler. T-016 must invoke state-changing recovery operations from the same T-010 serialized execution boundary as normal message processing. This avoids parallel sibling implementations and avoids nested/double-lane deadlock risk.

## 4. Failure Handling

The implementation fails closed on:

- missing target or message;
- target/message identity mismatch returned by the store;
- target sequence mismatch;
- attempting to fail a terminal or already-resolved message;
- attempting normal terminalization while recovery is unresolved;
- attempting recovery terminalization outside `recovery_required`;
- empty recovery authorization reasons;
- store operations that do not produce the frozen postcondition.

Ambiguous non-idempotent Tool effects are recorded with code `ambiguous_non_idempotent_effect` and effect identity. Ordinary domain retry permission is insufficient for that failure. A retry requires an explicit `ambiguous-non-idempotent-resolved` authorization with the matching `effectId`, so T-013 never converts ambiguity into an automatic retry.

## 5. Reference

Repository-local references at the fixed baseline:

- T-009 durable Tool runner: `src/execution/tool-runner/durable-tool-runner.ts` — source of `recovery_required` for ambiguous non-idempotent effects;
- T-010 instance engine / serialized lane: `src/engine/workflow-instance-engine.ts` and `src/engine/per-instance-serialized-lane.ts` — owner of same-instance serialization;
- T-011 message acceptance: `src/messaging/acceptance/domain-message-acceptance.ts` — owner of pre-ACK rejection for non-accepting lifecycle;
- frozen v0.2 RuntimeStore/message/workflow contracts under `src/v2/contracts/**`.

Do:

- delegate durable transitions to RuntimeStore semantic operations;
- preserve one per-instance serialization authority;
- require explicit recovery authorization;
- keep terminal abandonment queryable.

Do not:

- copy RuntimeStore, mailbox, effect journal, or instance engine implementations;
- silently skip a failed accepted message;
- blindly retry an ambiguous non-idempotent effect;
- add T-016 central exports/runtime assembly in T-013.

Reuse risk: low. T-013 references repository-local interfaces and behavior only; no external code or license-dependent implementation is copied.
