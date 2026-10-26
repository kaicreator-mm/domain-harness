# DomainHarness — English Agent/developer entry

**Canonical English technical documentation:** [docs/current/en/index.md](docs/current/en/index.md). **Chinese human/user documentation:** [docs/current/zh-CN/index.md](docs/current/zh-CN/index.md). These two directories contain equivalent **current v0.10.2** topics; prior version/candidate files are archived by navigation rather than silently modified.

DomainHarness is a minimal Domain Package runtime for trusted **externally built** K/S/B/C Domain Apps. The producer `@kaicreator/domain-harness-build` seals selected modules; the runtime `@kaicreator/domain-harness-microkernel.load(prebuiltApp, {store,...})` wires them and exposes `send/query/subscribe/stop`. K Primary owns State/Admission/Journal/Effect/UNKNOWN/Replay; optional Host implements physical CAS/SQLite and adapters.

| Agent task | English authoritative route |
| --- | --- |
| Initial source / runnable fixture | [Quick start](docs/current/en/quickstart.md) |
| Architecture diagrams / authority | [Architecture](docs/current/en/architecture.md) |
| Public root exports | [SDK API](docs/current/en/sdk.md) |
| Selected Domain Packages | [Authoring](docs/current/en/packages.md) |
| Host + Tiny/Rich | [Host](docs/current/en/host.md) |
| Reusable Agent instructions | [Skill](docs/current/en/skill.md) · [canonical SKILL.md](.agents/skills/domain-harness-sdk/SKILL.md) |
| Task planning / validation truth | [Agent workflow](docs/current/en/agent.md) |
| Consumer feedback/issues | [Feedback](docs/current/en/feedback.md) |
| Exact release caveats | [Release](docs/current/en/release.md) |

**Pin:** source [v0.10.2](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2) commit `cee14399d9d0af4e20e34b9111861b16a465b690` (Node24 qualified; package manifests `0.10.2-rc.0`, registry publication unproven). RQ **CONDITIONAL**: real last Full `EXIT1`, root `NOT_RUN` retained under one-source-approved exception. Follow tagged source and frozen authority before any explanatory prose; docs-only main changes do not move the Git Tag.

**Agent execution:** read [AGENTS.md](AGENTS.md) and pin the active standard in `.dev-standard/VERSION`. Work from this English tree; avoid historical v0.1/v0.3 API defaults. [Contribution guide](CONTRIBUTING.md).
