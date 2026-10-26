---
name: domain-harness-sdk
description: Use when integrating, authoring, migrating, debugging or reviewing the DomainHarness v0.10.2 SDK, or drafting approved GitHub feedback after using it. Read the canonical cross-agent Skill before changing packages or publishing consumer data.
---

# DomainHarness SDK (Claude Code project entry)

The **canonical reusable skill** lives in [`../../../.agents/skills/domain-harness-sdk/SKILL.md`](../../../.agents/skills/domain-harness-sdk/SKILL.md). Read and follow it **fully** before taking action, including its `references/SDK_BOUNDARIES.md` and `references/FEEDBACK.md` where relevant.

This thin discovery shim exists because Claude Code locates repository skills in `.claude/skills/` while Codex recognizes `.agents/skills/`. It is **not** a second SDK implementation and adds no independent API authority. To install the skill into an external consumer project, copy the **entire canonical directory**, not only this shim, and place it in the target agent's recognized skills directory.

**No auto-reporting:** seek approval before publishing consumer logs, code or metadata. Do not modify the v0.10.2 tag. Use the released SDK source at `cee14399d9d0af4e20e34b9111861b16a465b690`.
