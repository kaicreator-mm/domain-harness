# DomainHarness v0.10.2 · SDK Agent Skill installation

[Index](index.md) · [中文版](../zh-CN/skill.md)

## What the Skill is

`domain-harness-sdk` is an **Agent Skills-compatible workflow**, guiding Codex, Claude Code and other coding agents through SDK consumption, selected Domain Package authoring, narrow test planning and consent-based GitHub feedback. It **does not** install the SDK, execute BUILD automatically, collect telemetry or upload business logs.

| Agent | Discovery location | Role |
| --- | --- | --- |
| Codex / Agent Skills-aware tools | `.agents/skills/domain-harness-sdk/SKILL.md` | Canonical skill with complete `references/` |
| Claude Code | `.claude/skills/domain-harness-sdk/SKILL.md` | Repo-local shim directing to canonical skill |

## Copy the complete Skill to a consumer repo

From the consumer root, assuming local source at `../domain-harness`:

```sh
mkdir -p .agents/skills .claude/skills
cp -R ../domain-harness/.agents/skills/domain-harness-sdk .agents/skills/
cp -R ../domain-harness/.agents/skills/domain-harness-sdk .claude/skills/
```

PowerShell:

```powershell
New-Item -ItemType Directory -Force .agents/skills, .claude/skills | Out-Null
Copy-Item -Recurse ../domain-harness/.agents/skills/domain-harness-sdk .agents/skills/
Copy-Item -Recurse ../domain-harness/.agents/skills/domain-harness-sdk .claude/skills/
```

**Copy the entire canonical directory** including both reference files; don't copy only the repo's Claude shim to another project. Review rather than silently overwrite an existing same-name Skill. Actual discovery varies with Agent edition/workspace; file presence is **not** proof that a Codex/Claude process activated it.

## Invoke it

Codex: `$domain-harness-sdk`, Claude Code: `/domain-harness-sdk` where supported, or explicitly read the Skill. Example request:

> Use domain-harness-sdk. Pin v0.10.2 public ABI and selected K/S/B/C packages, implement one producer → sealed App → Tiny journey, run only scoped proof, and report actual EXIT.

Start at [canonical SKILL.md](../../../.agents/skills/domain-harness-sdk/SKILL.md) or the [original installation reference](../../agents/V0102_SDK_SKILL_INSTALL.md).

---

**Authority:** tagged source `cee14399d9d0af4e20e34b9111861b16a465b690`; v0.10.2 was qualified **CONDITIONALLY**. Post-release docs do not alter that SHA or authority.
