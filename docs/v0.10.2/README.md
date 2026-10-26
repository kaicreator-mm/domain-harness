# DomainHarness v0.10.2 — documentation home / 文档总入口

**Released Git tag:** [v0.10.2](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2), source `cee14399d9d0af4e20e34b9111861b16a465b690`. This is a **CONDITIONAL** release, not an unconditional `npm test` PASS; see [release record](../release/V0102_RELEASE_STATUS.md). This documentation enhancement lives on a later docs-only branch/PR and **does not change the tag or implementation**.

## Choose a path / 按角色选择

| You are / 角色 | Start here / 文档 |
| --- | --- |
| User building or running a Domain App / 用户 | [中文使用手册](../manual/V0102_USER_GUIDE.zh-CN.md) · [English user guide](../manual/V0102_USER_GUIDE.en.md) |
| Architect / 架构师 | [Architecture + Mermaid diagrams](../architecture/V0102_RUNTIME_DIAGRAMS.md) |
| JS/TS SDK integrator / 开发者 | [Public API quick reference](../manual/V0102_API_CHEATSHEET.md) · [authoring guide](../guides/V0102_PACKAGE_AUTHORING.md) |
| Domain Package author | [Supported extension points](../guides/SUPPORTED_EXTENSION_POINTS.md) · [K](../guides/V0102_K_EXTENSION.md) · [S](../guides/V0102_S_FEATURE.md) · [Business/C](../guides/V0102_BUSINESS_CAPABILITY_TOOL.md) |
| Node Host integrator | [Host integration](../guides/V0102_HOST_INTEGRATION.md) · [Tiny/Rich](../guides/V0102_TINY_RICH.md) |
| Coding/review Agent | [Agent playbook](../agents/V0102_PLAYBOOK.md) · [Task prompt templates](../agents/V0102_TASK_TEMPLATES.md) · [AGENTS.md](../../AGENTS.md) |
| Agent adopting SDK in another project | [Install domain-harness-sdk Skill](../agents/V0102_SDK_SKILL_INSTALL.md) · [canonical SKILL.md](../../.agents/skills/domain-harness-sdk/SKILL.md) |
| SDK bug / feedback reporter | [Usage feedback and Issues](../feedback/SDK_USAGE_FEEDBACK.md) · [Issue triage](../feedback/ISSUE_TRIAGE_PROTOCOL.md) |
| Troubleshooting / 常见问题 | [Troubleshooting and FAQ](../manual/V0102_TROUBLESHOOTING.md) · [Glossary](../manual/V0102_GLOSSARY.md) |
| Migrating from v0.10.1 | [Migration guide](../migration/MIGRATING_V0101_TO_V0102.md) |
| Release auditor | [R01 final closure](https://github.com/kaicreator-mm/domain-harness/issues/1331) · [Product freeze](../product/DomainHarness_v0.10.2_PRODUCT_FREEZE.md) · [L2 freeze](../architecture/DomainHarness_v0.10.2_L2_FREEZE.md) |

## Version truths that must not be confused

- **Build-time producer:** `@kaicreator/domain-harness-build` creates a sealed, selected **plain-data App**; not part of a consumer's Tiny runtime closure.
- **Runtime:** `@kaicreator/domain-harness-microkernel` loads trusted prebuilt App data and provides `send/query/subscribe/stop`. K/S/B/C domain behavior is supplied by independently selected Domain Packages, not embedded business logic in Microkernel.
- **Host:** `@kaicreator/domain-harness-host-node` optionally supplies physical SQLite CAS/other Node ports; application supplies its store, authority and deployment identity.
- **Node:** version-qualified profile is Node24. No Windows/Ubuntu/128GB requirement, no registry publication implied. Public package manifests **still contain `0.10.2-rc.0`**; the Git tag alone does not publish npm artifacts or rewrite manifests.
- **Status:** 8 P0 + 2 required P1 domains qualified, Hidden 7/7 PASS, RQ CONDITIONAL via the exact-source one-release exception; literal Full `EXIT1` and `test:root NOT_RUN` retained. Do not reuse that exception for other SHAs.

## Documentation priority / 事实依据

Actual tagged code, exported `package.json` surfaces, frozen Product/L2 and test fixtures take priority over these explainers. Historical v0.1–v0.10.1 docs remain accessible as **historical**, not the recommended API. Copy a complete tested fixture rather than placeholders in API snippets.

**Maintaining these docs:** keep diagrams and links version-qualified, cite source files, do not edit the immutable v0.10.2 release tag, and submit docs-only changes for ordinary review.
