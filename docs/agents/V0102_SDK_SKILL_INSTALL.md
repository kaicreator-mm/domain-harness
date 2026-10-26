# Install the DomainHarness SDK Agent Skill / 安装与使用

**Canonical portable Skill:** [`.agents/skills/domain-harness-sdk/SKILL.md`](../../.agents/skills/domain-harness-sdk/SKILL.md) following the open Agent Skills format. **Claude Code discovery shim:** [`.claude/skills/domain-harness-sdk/SKILL.md`](../../.claude/skills/domain-harness-sdk/SKILL.md). Skill metadata includes required `name` and `description`; detailed source/feedback references are loaded when needed. Runtime remains the immutable [v0.10.2](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2) source.

## Using within this repository

- **Codex / supported VS Code agents:** discover the skill at `.agents/skills/domain-harness-sdk/`, then select `domain-harness-sdk` in the agent's Skill picker or invoke it explicitly (for example `$domain-harness-sdk` in Codex).
- **Claude Code:** discover the shim at `.claude/skills/domain-harness-sdk/` (or invoke `/domain-harness-sdk`); it reads the canonical skill. For a disconnected local runner, ensure both directories are checked out.
- Other agents: if Skill discovery isn't available, include the canonical `SKILL.md` file as context and read its references. Do not assume every agent auto-discovers the same paths.

## Copy into a *different* application repository

This repository-level Skill is **not automatically installed in an external project** just because that project depends on the SDK. Copy the **canonical skill directory and references** to the consumer repo; keep the SDK implementation pinned independently.

From the consumer checkout, assuming a local copy of the DomainHarness repository in `../domain-harness`:

~~~sh
# Bash / Linux / macOS / Git Bash — Codex-compatible
mkdir -p .agents/skills
cp -R ../domain-harness/.agents/skills/domain-harness-sdk .agents/skills/
# Claude Code users: copy the full canonical directory to its discovery path
mkdir -p .claude/skills
cp -R ../domain-harness/.agents/skills/domain-harness-sdk .claude/skills/
~~~

PowerShell:

~~~powershell
New-Item -ItemType Directory -Force .agents/skills | Out-Null
Copy-Item -Recurse ../domain-harness/.agents/skills/domain-harness-sdk .agents/skills/
New-Item -ItemType Directory -Force .claude/skills | Out-Null
Copy-Item -Recurse ../domain-harness/.agents/skills/domain-harness-sdk .claude/skills/
~~~

If a project already has an installed Skill with the same name, **compare/review changes rather than overwriting silently**. The consumer should pin the DomainHarness SDK exact SHA and review a Skill change separately from runtime upgrades.

## Example prompts

~~~text
Use domain-harness-sdk. Read the v0.10.2 exact-source SDK boundary.
Map my selected K/S/B/C packages and implement one complete producer →
sealed App → Microkernel Tiny journey. Run only scoped tests, with literal EXIT.
~~~

~~~text
Use domain-harness-sdk to inspect this integration failure. Classify SDK
product vs Host/configuration vs OS test-runner. Search for duplicates,
draft a privacy-safe GitHub Issue and ASK before publishing it.
~~~

~~~text
Use domain-harness-sdk to summarize this successful SDK integration:
which public APIs worked, friction, test evidence and useful improvements.
Prepare one approved SDK Usage Feedback Issue; no silent telemetry.
~~~

## Boundaries

Do not infer that Skill installation installs npm packages. Tag `v0.10.2` is **RQ CONDITIONAL** with a non-precedential exact-source exception; the actual Full `EXIT1` and `test:root NOT_RUN` remain historical facts. SDK package manifests are still `0.10.2-rc.0`, with no registry publication assertion. Feedback is **manual/consent-based GitHub Issues**, never a compulsory SDK upload.

For the human process see [SDK usage feedback](../feedback/SDK_USAGE_FEEDBACK.md), [current docs](../v0.10.2/README.md) and [Agent playbook](V0102_PLAYBOOK.md).
