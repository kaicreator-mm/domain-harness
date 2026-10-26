# DomainHarness v0.10.2 — Agent integration and maintenance playbook

This is a **version-scoped knowledge/working guide**, not authorization to edit a frozen release or claim a test as executed. Intended for Codex, Claude Code, ZCode, ChatGPT and other coding/review Agents.

## 1. Session bootstrap / 每次会话读取顺序

1. Pin immutable version: `v0.10.2@cee14399d9d0af4e20e34b9111861b16a465b690`; the documentation PR is later than this tag.
2. Read repo [AGENTS.md](../../AGENTS.md), `.dev-standard/VERSION` and `.dev-standard/PROJECT_OVERRIDES.md`; use the **pinned** ADS revision, not an unqualified floating latest.
3. Read [version documentation entry](../v0.10.2/README.md), [architecture diagrams](../architecture/V0102_RUNTIME_DIAGRAMS.md), [API quick reference](../manual/V0102_API_CHEATSHEET.md), [release conditions](../release/V0102_RELEASE_STATUS.md).
4. For Product/L2 changes, read [cross-version principles](../architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md) and frozen [Product](../product/DomainHarness_v0.10.2_PRODUCT_FREEZE.md)/[L2](../architecture/DomainHarness_v0.10.2_L2_FREEZE.md).
5. Identify task category first: **docs only**, external producer/Domain Package, public Facade, K authority, Host CAS, or Release validation. Choose the smallest existing proof for that category.

## 2. Task routing / Agent 任务路由

| Change concern | Canonical owners | Minimal reference/test |
| --- | --- | --- |
| Documentation, examples | `docs/`; `examples/v0102-package-authoring/` | link/source consistency, `projection-smoke.mjs` only if needed; do not rerun 4k tests |
| Selected Module BUILD or component projection | `tooling/build/` + `packages/contracts/` | `tooling/build/tests/component-view.test.ts`; `tests/compiler/v0102-tarball-inventory.test.ts` |
| Public Facade, query/subscribe/stop | `packages/microkernel/` | actual facade source + focused subscription/conformance tests; preserve typed error redaction |
| Node physical CAS/SQLite, durability | `packages/host-node/` and selected K | `tests/integration/v010-clean-consumers/clean-consumers.test.ts`; affected real CAS negatives only |
| Business/Capability Tool | `domain-packages/`, authoring fixtures | `examples/v0102-package-authoring/authoring-template-check.mjs` |
| Distribution closure | Four public `package.json` exports and packed artifact inventory | exact selected tarballs, no private deep import, Tiny no BUILD |
| Release decision | GitHub RQ Issue / pinned ADS standards | exact SHA/tree/actual EXIT and independent review; never conflate CI with Release PASS |

## 3. Non-negotiable assertions

- Never move Kernel Admission, State, Journal, Effect, Replay or UNKNOWN into Microkernel or into Business/Host.
- Never import BUILD from Microkernel or from a runtime-only Tiny App; the producer seals the selected App **before** `load`.
- Never turn an S semantic helper into a Tool automatically; Tool requires explicit declared cross-package Operation. Capability module's `externalEffect` classification is **module-wide** in v0.10.2.
- `./host-seam` is not a permission barrier. Query/subscribe authority comes from trusted Host binding + selected K, not user-supplied principal fields.
- Preserve idempotent replay, changed-input conflict, multi-B scope, genuine SQLite CAS, denied-effect zero dispatch and UNKNOWN semantics.
- Do not import private `@kaicreator/domain-harness-compiler`, legacy public core, internal `src/` or `dist/` as consumer APIs.
- Do not silently change the tagged `v0.10.2` ref. A docs-only update belongs on a new branch and PR; new runtime requirements belong to a new Product/L2/DAG version.

## 4. Execution evidence contract

Before changing code, state: **repository, task/issue, expected SHA, scope/writeset, dependencies, expected behavior, negative/failure conditions, minimal test, owner**. Identify which work is safely parallel by file writer ownership; don't transform the Task DAG into an unjustified serial chain.

After work, write: `tested_sha`, `tree`, real commands and literal exit codes, passing/failing assertion IDs, exact CI/check references, proof reuse basis, P0/P1/P2, changes made, unresolved `NOT_RUN`. **Do not write PASS for an unexecuted operation**, copy a past test to a new SHA without an explicit impact decision, or invent a separate human review when the reviewer was the same logical context.

**v0.10.2 special:** RQ was **CONDITIONAL** under single-source exception `EX-v0.10.2-R01-FULL-OS-01`. Full `npm test EXIT1`, `test:root NOT_RUN` remain original physical facts; the exception is not a pass receipt and **does not carry to the next version**. See [release record](../release/V0102_RELEASE_STATUS.md).

## 5. Handoff / What an Agent should deliver

1. Minimal scoped diff and source map (file paths, no unnecessary new framework).
2. Public API and capability/authority boundary explanation.
3. Tested positive/negative cases and actual result, otherwise `NOT_RUN` and reason.
4. Reviewer-ready short checklist with exact candidate SHA, known P2 and artifacts.
5. Next trigger only when a separate environment **actually is required by product acceptance**, never because an OS issue was mistaken for a DomainHarness feature.

If a downstream user is integrating the SDK, first activate or copy the [installable domain-harness-sdk Skill](V0102_SDK_SKILL_INSTALL.md). During real usage, record structured [feedback/bugs](../feedback/SDK_USAGE_FEEDBACK.md) after bounded product-vs-environment triage. Draft privacy-safe GitHub Issues and ask permission before publishing cross-project material; no automatic telemetry or duplicate issue storms.

Read [copyable task templates](V0102_TASK_TEMPLATES.md), [human handbook](../manual/V0102_USER_GUIDE.zh-CN.md) and [FAQ](../manual/V0102_TROUBLESHOOTING.md).
