# DomainHarness Documentation — current entry v0.10.2

**Recommended starting point:** [v0.10.2 documentation hub](v0.10.2/README.md). This folder contains years of historical Product/L2/Task/Validation assets. Most old documents intentionally retain their **as-of** language and must not be interpreted as the current API or current release state.

## Current v0.10.2 — pick a role

| Role / task | Direct links |
| --- | --- |
| Human user / 用户 | [中文用户手册](manual/V0102_USER_GUIDE.zh-CN.md) · [English guide](manual/V0102_USER_GUIDE.en.md) |
| Architecture | [Mermaid system diagrams](architecture/V0102_RUNTIME_DIAGRAMS.md) · [frozen L2](architecture/DomainHarness_v0.10.2_L2_FREEZE.md) |
| Developer | [API](manual/V0102_API_CHEATSHEET.md) · [Package authoring](guides/V0102_PACKAGE_AUTHORING.md) · [supported extensions](guides/SUPPORTED_EXTENSION_POINTS.md) |
| Runtime/Host | [Node Host integration](guides/V0102_HOST_INTEGRATION.md) · [Tiny/Rich](guides/V0102_TINY_RICH.md) |
| Agent | [Agent playbook](agents/V0102_PLAYBOOK.md) · [task templates](agents/V0102_TASK_TEMPLATES.md) |
| Agent SDK Skill | [Install and invoke](agents/V0102_SDK_SKILL_INSTALL.md) · [SKILL.md](../.agents/skills/domain-harness-sdk/SKILL.md) |
| SDK bugs & feedback | [Submitting Issues](feedback/SDK_USAGE_FEEDBACK.md) · [Triage and evolution](feedback/ISSUE_TRIAGE_PROTOCOL.md) |
| Support | [Troubleshooting](manual/V0102_TROUBLESHOOTING.md) · [Glossary](manual/V0102_GLOSSARY.md) |
| Migration | [v0.10.1→v0.10.2](migration/MIGRATING_V0101_TO_V0102.md) |
| Release/evidence | [Status and exact SHA](release/V0102_RELEASE_STATUS.md) · [R01 #1331](https://github.com/kaicreator-mm/domain-harness/issues/1331) |

## Authority and release provenance

Tagged source and its actual exported API + frozen Product/L2 + real tests and [R01 final closure](https://github.com/kaicreator-mm/domain-harness/issues/1331#issuecomment-6416079327) are authoritative. v0.10.2 **is tagged and merged to main**, **RQ CONDITIONAL** with narrowly accepted one-source Full exception. There is no claim of `npm test EXIT0`: recorded `EXIT1` and root `NOT_RUN` remain true. The tag does not imply public npm packages have been published; manifests still declare `0.10.2-rc.0`.

For new product or implementation tasks also read [cross-version principles](architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md) and repo [AGENTS.md](../AGENTS.md) with the pinned `.dev-standard` policy.

## Historical archives — do not delete

- `product/`: frozen PRDs and decisions by version.
- `architecture/`: L2 evidence, negative constraints, source ownership, legacy architecture.
- `implementation/` and `tasks/`: DAGs, task packs and historical implementation evidence.
- `sdk/`, `domain-data/`, `harness/`: current SDK v0.10.2 reference **and** older v0.1/v0.3 guides (historical).
- `validation/`, `release/`: actual exact-SHA receipts/qualification decisions; never silently relabel tests PASS.
- `experiments/`, `research/`, `roadmap/`: retained research inputs, not necessarily selected production features.

A historical document that says "candidate", "main HOLD" or "Node24 tests NOT_RUN" refers to its **original snapshot**, not the final tagged v0.10.2 state. Use this current index to avoid mixing baselines.

**Documentation maintenance:** docs-only PRs go against active main and preserve the immutable release tag. New Source/ABI features require a new authorized version and scoped Product/L2/DAG; README wording cannot change normative contracts.
