# DomainHarness v0.10.2 · Agent development and review

[Index](index.md) · [中文版](../zh-CN/agent.md)

## Required reading order for coding Agents

1. Start at this [English documentation index](index.md), then pin actual `v0.10.2` source SHA.
2. **In this repository:** read `AGENTS.md`, `.dev-standard/VERSION`, project overrides and frozen Product/L2. **In a consumer:** read the consumer Product/security rules, its own SHA and selected K/S/B/C identities.
3. Read [architecture](architecture.md) → [SDK](sdk.md) → [Package](packages.md) → [Host](host.md); choose the smallest related executable proof.
4. Prefer the [SDK Skill](skill.md) rather than rediscovering private Compiler paths in every session.

## Execution lanes

| Task | Ownership focus | Evidence |
| --- | --- | --- |
| New selected K/S/B/C module | ABI/selected bytes/Operation route | Component projection + typed negatives |
| Integrate consumer App | Separate BUILD producer/runtime closure | One actual Tiny/Rich Critical Journey |
| SDK defect | Source cause vs Host/consumer/OS classification | Smallest affected-risk regression |
| Docs update | Paired Chinese+English, links, provenance | Static links and scoped review; no general Full |
| Independent review | Exact SHA, changed files, P0/P1/P2, reused evidence | Read-only; distinct from merger |

Each handoff reports repository/version/Issue, **exact source SHA**, changed paths, actual commands with **literal EXIT**, `NOT_RUN`, residual P2 and next owner action. **PR PASS is not Release PASS.** Never invent independent reviewer identity or treat OS child-process exhaustion alone as a product bug.

## Consumer feedback
When users find a real SDK issue, search existing reports, classify, construct a **sanitized minimal** repro and prepare a draft using [Issue workflow](feedback.md). Explicit user consent is mandatory before public cross-project disclosure. Successful integration patterns may be summarized **once at a meaningful milestone**; do not install silent Microkernel telemetry.

For implementation details consult [Agent Skill](skill.md), [source Agent playbook](../../agents/V0102_PLAYBOOK.md) and [copyable task prompts](../../agents/V0102_TASK_TEMPLATES.md).

---

**Authority:** tagged source `cee14399d9d0af4e20e34b9111861b16a465b690`; v0.10.2 was qualified **CONDITIONALLY**. Post-release docs do not alter that SHA or authority.
