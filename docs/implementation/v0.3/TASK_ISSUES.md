# DomainHarness v0.3 — Task ↔ GitHub Issue Map

**Integration branch:** `v0.3`  
**Planning baseline:** `7fdcde2e853382b0ba0fd2baeb6f91af2fdbace6`  
**Formal DAG:** `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`

| Task | GitHub Issue | Branch | Depends On | Parallel | Environment |
|---|---:|---|---|---:|---|
| T-001 | #219 | `v0.3_t001` | — | NO | portable |
| T-002 | #220 | `v0.3_t002` | T-001 | YES | portable |
| T-003 | #221 | `v0.3_t003` | T-001 | YES | portable |
| T-004 | #222 | `v0.3_t004` | T-001 | YES | portable |
| T-005 | #223 | `v0.3_t005` | T-001 | YES | portable |
| T-006 | #224 | `v0.3_t006` | T-001 | YES | portable |
| T-007 | #225 | `v0.3_t007` | T-001 | YES | portable |
| T-008 | #226 | `v0.3_t008` | T-001 | YES | portable |
| T-009 | #227 | `v0.3_t009` | T-001 | YES | portable |
| T-010 | #228 | `v0.3_t010` | T-001 | YES | portable |
| T-011 | #229 | `v0.3_t011` | T-001 | YES | portable |
| T-012 | #230 | `v0.3_t012` | T-002,T-004 | YES | portable |
| T-013 | #231 | `v0.3_t013` | T-002 | YES | portable |
| T-014 | #232 | `v0.3_t014` | T-003,T-006 | YES | portable store-contract |
| T-015 | #233 | `v0.3_t015` | T-003,T-004,T-012 | YES | portable |
| T-016 | #234 | `v0.3_t016` | T-002,T-007 | YES | portable |
| T-017 | #235 | `v0.3_t017` | T-012,T-014,T-016 | NO | portable integration |
| T-018 | #236 | `v0.3_t018` | T-013,T-016,T-017 | NO | portable integration |
| T-019 | #237 | `v0.3_t019` | T-006,T-014,T-018 | NO | portable integration |
| T-020 | #238 | `v0.3_t020` | T-005,T-015,T-019 | YES | portable |
| T-021 | #239 | `v0.3_t021` | T-008,T-009,T-010,T-011,T-019,T-020 | NO | portable assembly |
| T-022 | #240 | `v0.3_t022` | T-021 | YES | **Node Build Host** |
| T-023 | #241 | `v0.3_t023` | T-021 | YES | **Expo Android/Hermes** |
| T-024 | #242 | `v0.3_t024` | T-022,T-023 | NO | cross-host validation |
| T-025 | #243 | `v0.3_t025` | T-021 | YES | docs/examples |
| T-026 | #244 | `v0.3_t026` | T-024,T-025 | NO | version closure |

## Immediate execution state

At this planning baseline, only **T-001 / #219** is dependency-ready.

After T-001 merges into `v0.3`, T-002 through T-011 become dependency-ready and may be dispatched concurrently from the same dependency-complete integration SHA.

## Local-environment concentration

Do not scatter real-host durability work into feature tasks.

- #240 owns the concentrated Node SQLite/process-kill/restart batch.
- #241 owns the concentrated Expo/Hermes/`expo-sqlite`/force-stop batch.
- #242 consumes both exact host results for parity/migration/retention closure.

Feature-task mocks/fake stores can prove deterministic contracts only; they do not establish real host durability.
