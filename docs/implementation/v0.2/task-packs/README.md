# DomainHarness v0.2 — Parallel Task Packs

This directory is the execution handoff for separate ChatGPT/Codex/local-agent conversations.

## Use

1. Start with **T-001 only**.
2. Merge T-001 to `v0.2` after review/validation.
3. Launch the dependency-complete tasks marked parallel in separate conversations.
4. Every task uses its fixed branch `v0.2_tNNN` and targets `v0.2`.
5. Do not let a conversation silently expand into another task's write set.
6. After T-016, launch the validation/migration/docs wave in parallel.
7. T-024 is the single visible closure/release-qualification handoff task.

Machine-readable metadata: [`TASK_PACKS.json`](./TASK_PACKS.json).

## Recommended launch sequence

### Phase A — Serial foundation

- T-001 `v0.2_t001` — contract/workspace foundation.

### Phase B — High parallelism after T-001

The following can be dispatched to separate conversations from the same dependency-complete `v0.2` SHA:

- [T-002 — build-time compiler + Target Compiled Package generation](./T002_build-time_compiler_plus_target_compiled_package_generation.md) → `v0.2_t002`
- [T-003 — Node SQLite RuntimeStore adapter](./T003_node_sqlite_runtimestore_adapter.md) → `v0.2_t003`
- [T-004 — Expo SQLite RuntimeStore adapter](./T004_expo_sqlite_runtimestore_adapter.md) → `v0.2_t004`
- [T-005 — compiled package validation + registry + pin retention](./T005_compiled_package_validation_plus_registry_plus_pin_retention.md) → `v0.2_t005`
- [T-006 — portable Expression Tool + deterministic expression runtime](./T006_portable_expression_tool_plus_deterministic_expression_runtime.md) → `v0.2_t006`
- [T-007 — target-compiled Script Tool bindings for Node + Expo](./T007_target-compiled_script_tool_bindings_for_node_plus_expo.md) → `v0.2_t007`
- [T-008 — Remote Tool HTTP/JSON binding](./T008_remote_tool_http_json_binding.md) → `v0.2_t008`
- [T-009 — durable effect journal + Tool recovery semantics](./T009_durable_effect_journal_plus_tool_recovery_semantics.md) → `v0.2_t009`
- [T-010 — persistent Workflow Instance engine + per-instance serialized lane](./T010_persistent_workflow_instance_engine_plus_per-instance_serialized_lane.md) → `v0.2_t010`
- [T-011 — durable mailbox acceptance + ACK/dedup/ordering](./T011_durable_mailbox_acceptance_plus_ack_dedup_ordering.md) → `v0.2_t011`
- [T-014 — Query + multi-workflow Projection + authoritative snapshot boundary](./T014_query_plus_multi-workflow_projection_plus_authoritative_snapshot_boundary.md) → `v0.2_t014`
- [T-015 — Subscription + coalescing + business invalidation](./T015_subscription_plus_coalescing_plus_business_invalidation.md) → `v0.2_t015`

### Phase C — Focused integration

- T-012 starts after T-011.
- T-013 starts after T-009 + T-010 + T-011.
- T-016 starts only after all its declared core dependencies are merged; it owns central runtime/public assembly.

### Phase D — Parallel validation after T-016

- [T-017 — shared deterministic runtime conformance suite](./T017_shared_deterministic_runtime_conformance_suite.md) → `v0.2_t017`
- [T-020 — v0.1 expr → Expression Domain Tool migration equivalence](./T020_v01_expr_to_expression_domain_tool_migration_equivalence.md) → `v0.2_t020`
- [T-021 — v0.1 script → Script Domain Tool migration equivalence](./T021_v01_script_to_script_domain_tool_migration_equivalence.md) → `v0.2_t021`
- [T-022 — package upgrade + pin retention + cross-version compatibility validation](./T022_package_upgrade_plus_pin_retention_plus_cross-version_compatibility_validation.md) → `v0.2_t022`
- [T-023 — SDK docs + v0.1→v0.2 migration + host integration guides](./T023_sdk_docs_plus_v01tov02_migration_plus_host_integration_guides.md) → `v0.2_t023`

T-018 and T-019 begin after T-017 provides the shared conformance suite. They can then run in parallel: Node vs Expo/Hermes.

### Phase E — Closure

- T-024 only after T-018..T-023 dependencies are complete.

## Conflict-minimization rule

T-002..T-015 deliberately own mostly separate module directories. Central `src/index.ts`, package export maps, and cross-module assembly are reserved for T-016. This is the main mechanism that allows many conversations to proceed concurrently without creating a large stacked-PR chain.

## Source of truth

The repository and `v0.2` branch are the durable coordination source. Chat text is not a substitute for merged dependency state or exact-SHA validation evidence.
