# T-017 Task Pack — shared deterministic runtime conformance suite

**Version:** v0.2  
**Wave:** Validation Parallel  
**Branch:** `v0.2_t017`  
**PR Base:** `v0.2`  
**Depends On:** T-016  
**Parallel:** YES  
**Risk:** M  
**L3:** NOT REQUIRED  
**Status:** TODO

## Objective

Create one deterministic product-semantic conformance suite that can run against Node and Expo hosts and compare only PRD-defined observable behavior.

## Allowed Write Set

- `tests/conformance/**`

## Deliverables / Acceptance

- Host harness contract and deterministic fixtures covering message acceptance/rejection, instance state, deterministic Tool outputs, Query/Projection, terminal/failure classification and emitted Domain Messages.
- Suite excludes non-semantic row IDs, opaque internal IDs, wall-clock timestamps, storage layout and private engine state.
- External nondeterminism is stubbed/fixture-controlled.

## Required Validation

G30 suite self-test on the first available host; T-018/T-019 execute it on Node and Expo/Hermes respectively.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-017。T-016 合并后从最新 `v0.2` 创建 `v0.2_t017`。只建立 host-neutral deterministic conformance suite，不编码 Node/Expo 特例，不比较非语义内部细节。完成 G30 suite self-test 后 PR 到 `v0.2`。
```
