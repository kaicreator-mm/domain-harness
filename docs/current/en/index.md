# DomainHarness v0.10.2 — Documentation index

[Documentation index](index.md) · [中文版本](../zh-CN/index.md)

This is the **canonical English entry point for coding and review Agents** and English-speaking developers. Every topic has a corresponding Chinese user guide, linked from its header. Historical frozen records remain in place but are **not** the default instructions.

| Task | English entry |
| --- | --- |
| Establish a correct local example | [Quick start](quickstart.md) |
| Map BUILD, K/S/B/C, Host responsibilities | [Architecture diagrams](architecture.md) |
| Use public API / exported packages | [SDK API reference](sdk.md) |
| Author selected Domain Packages | [Package authoring](packages.md) |
| Configure CAS / SQLite / Tiny-Rich | [Host and runtime profiles](host.md) |
| Migrate older consumers | [Migration](migration.md) |
| Install/use the SDK Agent Skill | [Skill](skill.md) |
| Agent task/evidence discipline | [Agent workflow](agent.md) |
| Diagnose a failure | [Troubleshooting](troubleshooting.md) |
| Report a bug or adoption experience | [Feedback / GitHub Issues](feedback.md) |
| Look up terminology | [Glossary](glossary.md) |
| Check release facts | [Release status](release.md) |
| Audit Product/L2/Task/validation snapshots | [Historical evidence map](archive.md) |

**Authority order:** actual tagged source and package exports > frozen Product/L2 > real tests/Release Closure > these user/Agent guides > historical candidate prose.

**Root machine navigation:** `AGENTS.md` and `llms.txt` should take Agents here. **Consumer code:** never assume source paths exist inside the consuming project; pin and inspect the actual installed SDK artifacts. [Source](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2) · [Issues](https://github.com/kaicreator-mm/domain-harness/issues).

---

**Version:** immutable tagged runtime `cee14399d9d0af4e20e34b9111861b16a465b690`. RQ **CONDITIONAL** (Full `EXIT1`, root `NOT_RUN` retained). This is post-release explanatory documentation, not a changed ABI.
