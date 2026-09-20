# T-010 Follow-up — Persisted Terminal Source Integrity

**Issue:** #228  
**Original implementation PR:** #255  
**Independent review finding:** P1 — persisted terminal sources were replayed without fail-closed integrity validation  
**Fix PR:** #266  
**Fix branch:** `v0.3_t010_terminal_source_integrity`  
**Refreshed exact base:** `v0.3@c3389d07ae318e6d9f8aa2facd9dfa4211006920`

## Scope

This follow-up is intentionally narrow. It does not reopen T-010 architecture or add host/runtime integration.

It adds runtime validation for persisted external-work records and terminal control sources before replay/duplicate handling. The validator checks:

- external-work record shape, target, correlation, timer, timestamps, revision and status;
- status ↔ terminal source kind consistency;
- terminal source target/correlation consistency;
- one-shot deadline timer/fire ordinal consistency;
- callback ordinal and payload canonical JSON validity;
- deterministic recomputation of `durableControlTurnId` from frozen L2 identity material;
- due-scan store result shape and every returned record before recovery.

Malformed persisted material fails closed as `STORE_CONTRACT_VIOLATION`.

## Repair closeout refresh

The original repair HEAD `f3da55622c618b4b7acf04e574da32ec8f392a01` was refreshed onto current `v0.3`. Intermediate refresh HEADs `a5791b25473418af177070af07209672ece95724` and `f877903927043108b311fe73bdd13b1670081172` became stale as sibling T-013 and T-009 merged and are historical only. The base advances did not touch the three-file T-010 repair write set.

The Build Host lint finding in `durable-control-coordinator.ts` was resolved by removing the unnecessary `JsonValue` assertion passed to `canonicalJsonStringify`; runtime behavior is unchanged because the canonicalizer accepts `unknown`.

## Focused tests

`packages/domain-harness/tests/runtime/durable-control-coordinator.test.ts` includes deterministic corruption fixtures for:

1. malformed persisted callback terminal-source identity before restart replay;
2. malformed persisted deadline terminal-source identity during due-deadline recovery.

Both must fail as `STORE_CONTRACT_VIOLATION` before any durable source is replayed.

## Deferred boundaries

Real Node/Expo persistence, process/device restart, SQLite adapters, and host parity remain T-022/T-023 concerns. This follow-up makes no host-durability claim.

## Closeout evidence rule

Old-head and intermediate-head validation are historical context only. Full repository gates, focused tests, package validation, Woodpecker status, and Independent Review must bind to the final refreshed exact PR HEAD before merge.
