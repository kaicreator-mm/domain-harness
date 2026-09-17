# T-018 Task Pack — Node host Critical Journeys + process-kill recovery

**Version:** v0.2  
**Wave:** Validation Parallel  
**Branch:** `v0.2_t018`  
**PR Base:** `v0.2`  
**Depends On:** T-016, T-017  
**Parallel:** YES  
**Risk:** M  
**L3:** NOT REQUIRED  
**Status:** TODO

## Objective

Run the shared deterministic conformance suite and Node-specific process-kill/restart Critical Journeys against the integrated v0.2 Runtime.

## Allowed Write Set

- `tests/hosts/node/**`
- `tests/critical-journeys/node/**`
- `docs/validation/v0.2/node/**`

## Deliverables / Acceptance

- Node conformance runner and exact-SHA evidence.
- Process-kill fixtures at durable ACK, Tool journal and recovery boundaries.
- Node passes the shared conformance suite and affected Node Critical Journeys without altering portable contracts.

## Required Validation

G3 and relevant Node-side G6–G20 gates, including restart/crash durability.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-018。仅在 T-016/T-017 已合并后，从 `v0.2` 创建 `v0.2_t018`。运行共享 conformance，并用真实 Node 进程 kill/restart 覆盖 ACK、effect journal、recovery 边界；只写 Node validation/test 目录，回报 exact SHA 和证据。
```
