# T-019 Task Pack — Expo Android/Hermes conformance + restart Critical Journeys

**Version:** v0.2  
**Wave:** Validation Parallel  
**Branch:** `v0.2_t019`  
**PR Base:** `v0.2`  
**Depends On:** T-016, T-017  
**Parallel:** YES  
**Risk:** H  
**L3:** REQUIRED  
**Status:** TODO

## Objective

Prove v0.2 portability on the frozen non-Node reference target: real React Native/Expo Android using Hermes + `expo-sqlite`, including restart persistence.

## Allowed Write Set

- `examples/expo-conformance/**`
- `tests/hosts/expo/**`
- `docs/validation/v0.2/expo/**`

## Deliverables / Acceptance

- Minimal Expo conformance app and host runner.
- Shared deterministic suite runs under real Hermes without Runtime Core Node built-ins.
- SQLite persistence survives app/device/emulator restart path used by validation.
- At least persistence and Script/integration binding mechanics are materially different from Node while observable product behavior remains contract-equivalent.

## Required Validation

G4/G30 and PRD AC-42; real Expo Android/Hermes evidence is required, Node mocks are insufficient.

## L3 Evidence Order

Tests → Contract / Interface → Core Implementation → Failure Handling → Reference.

## Conversation Kickoff Prompt

```text
执行 DomainHarness v0.2 T-019。T-016/T-017 已合并后创建 `v0.2_t019`。必须在真实 Expo Android/Hermes + expo-sqlite 环境运行 shared conformance/restart CJ；Node mock 不能替代 AC-42。若环境无法验证，提交实现/测试但把任务标 BLOCKED 并记录可复现环境 blocker，不得假报 PASS。
```
