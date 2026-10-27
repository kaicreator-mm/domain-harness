# DomainHarness 文档中心 / Documentation hub

> **中文用户请阅读 [最新中文文档](current/zh-CN/index.md)；Coding Agent 请阅读 [English current docs](current/en/index.md)。**
>
> **For current SDK integration, use the maintained language-specific guides below, not an old candidate or release evidence file.**

| 文档类型 / Source type | 中文入口 | English entry | 性质 / Purpose |
| --- | --- | --- | --- |
| **当前使用说明 / Current guides** | [中文用户手册](current/zh-CN/index.md) | [English Agent docs](current/en/index.md) | 15 个主题中英一一对应；current supported behavior |
| **生效的约束 / Governing references** | [冻结规范与证据](reference/index.zh-CN.md) | [Governing references](reference/index.en.md) | Version-pinned source, freezes, authoritative decisions |
| **旧版记录 / Historical records** | [历史归档导航](archive/index.zh-CN.md) | [Historical archive map](archive/index.en.md) | Provenance-only, not today's usage instructions |

## 目录规则 / Directory rules

- **Current:** `docs/current/{zh-CN,en}/` is the **only maintained user/Agent handbook**. Every active topic is bilingual, with the same basename and reciprocal links. `README.md` defaults to Chinese, `AGENTS.md` / `llms.txt` / canonical `SKILL.md` to English.
- **Reference:** `docs/reference/` indexes version-pinned Product/L2/architecture authority. **Some older, frozen documents remain binding**; “historical file” does not automatically mean “invalid contract.”
- **Archive:** `docs/archive/` indexes obsolete candidate drafts, research, older version docs and as-of test evidence. **This is an index, not a mass move:** source files remain at their original paths so issue links, SHA-pinned reviews and internal references keep working.
- Existing `docs/product/`, `docs/architecture/`, `docs/implementation/`, `docs/validation/`, etc. are **source/evidence storage**, not a competing current handbook. Future public-facing guidance belongs in `docs/current/` only.

**Release facts / 发布事实:** v0.10.2 tag `cee14399d9d0af4e20e34b9111861b16a465b690` is unchanged; RQ remains **CONDITIONAL** with historical Full `EXIT1` and root `NOT_RUN`. Organizing navigation does not rewrite those results or qualify a new release.
