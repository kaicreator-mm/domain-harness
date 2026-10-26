# DomainHarness v0.10.2 · SDK Agent Skill 安装

[返回文档首页](index.md) · [English version](../en/skill.md)

## Skill 是什么？

`domain-harness-sdk` 是一套供 Codex、Claude Code 等编码 Agent 使用的说明，告诉它们**如何正确消费 SDK、写 Domain Package、选择测试、区分真实 SDK 缺陷与环境问题，并在得到用户授权后反馈 GitHub**。它不会自动安装 SDK、编译 App、采集遥测或上传业务数据。

| Agent | 发现路径 | 实际内容 |
| --- | --- | --- |
| Codex / 支持 Agent Skills 的工具 | `.agents/skills/domain-harness-sdk/SKILL.md` | 唯一规范的完整 Skill，含 `references/` |
| Claude Code | `.claude/skills/domain-harness-sdk/SKILL.md` | 本仓库的转发入口，加载同一规范 |

## 复制到外部消费者项目

在目标项目根目录执行，假设 DomainHarness 源码位于 `../domain-harness`：

```sh
mkdir -p .agents/skills .claude/skills
cp -R ../domain-harness/.agents/skills/domain-harness-sdk .agents/skills/
cp -R ../domain-harness/.agents/skills/domain-harness-sdk .claude/skills/
```

PowerShell：

```powershell
New-Item -ItemType Directory -Force .agents/skills, .claude/skills | Out-Null
Copy-Item -Recurse ../domain-harness/.agents/skills/domain-harness-sdk .agents/skills/
Copy-Item -Recurse ../domain-harness/.agents/skills/domain-harness-sdk .claude/skills/
```

**重点：** 外部消费者应复制**完整目录及 references**，不要只复制本仓库的 Claude 转发文件。已有同名 Skill 时先 Review 差异，不覆盖别人的配置。Skill 能否自动发现还受 Agent 版本与工作目录影响，不能仅凭目录存在宣称真实启动验证 PASS。

## 如何使用

在 Codex 里调用 `$domain-harness-sdk`，在 Claude Code 中根据其 Skill 发现方式调用 `/domain-harness-sdk`；或让 Agent 阅读 `SKILL.md`。例如：

> 使用 domain-harness-sdk，固定 v0.10.2 ABI，选择 K/S/B/C，完成一个 producer → sealed App → Tiny 实际旅程。优先最小验证，返回真实 EXIT。

入口：[Skill 原文](../../../.agents/skills/domain-harness-sdk/SKILL.md) · [旧安装资料](../../agents/V0102_SDK_SKILL_INSTALL.md)。Agent 应默认阅读 [英文版](../en/skill.md)。

---

**权威源：** Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；v0.10.2 的发布资格为 **CONDITIONAL**。文档更新不改变冻结版本或测试事实。
