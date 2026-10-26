# DomainHarness v0.10.2 · Agent 开发与审核指南

[返回文档首页](index.md) · [English version](../en/agent.md)

## Agent 的阅读顺序

1. 先阅读 [英文版文档首页](../en/index.md) 和实际 SDK Git Tag `v0.10.2`。
2. 如果在**本仓库**开发，还要阅读 `AGENTS.md`、`.dev-standard/VERSION`、项目 overrides 和冻结 Product/L2；如果在**业务消费者项目**，先看该项目 Product/权限边界和自己的 Commit。
3. 再阅读 [架构](architecture.md) → [SDK](sdk.md) → [Package](packages.md) → [Host](host.md)，最后根据任务选择最小测试。
4. 建议使用 [SDK Skill](skill.md)，不要每次重新探索所有私有目录和历史 Compiler API。

## 任务执行规范

| 任务类型 | 工作重点 | 验证 |
| --- | --- | --- |
| 新 K/S/B/C Package | 已选 Module、ABI、Operation 路由 | Component projection 和 Typed Negative |
| 集成外部 Domain App | BUILD Producer 与 Consumer 分离 | 一个 Tiny/Rich Critical Journey |
| 修复 SDK Bug | 排查源码、明确 Product/Host/OS 归因 | 与风险对应的最小回归 |
| 改文档 | 两种语言同步、双向链接、历史归档 | 静态链接与内容审核，不重跑整个 Full |
| 独立 Review | exact SHA、变更范围、证据、P0/P1/P2 | 只读，不代替合并 Controller |

每次结束给出：仓库/版本/Issue、精确 SHA、涉及文件、实际命令+EXIT、`NOT_RUN`、残余 P2 和后续动作。**PR PASS ≠ Release PASS**。不得编造独立审核或把 OS 子进程失败当 SDK 缺陷。

## 反馈闭环
如果消费者使用 SDK 时发现问题，先去重、最小脱敏复现，提 [Issue 草稿](feedback.md)；公开发布必须征得用户同意。成功实践也可在里程碑时提交一次结构化反馈，但不能在 Microkernel 里增加隐形遥测。

[英文 Agent 规范](../en/agent.md) 为 Agent 默认工作版本；本页供中文使用者监督理解。

---

**权威源：** Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；v0.10.2 的发布资格为 **CONDITIONAL**。文档更新不改变冻结版本或测试事实。
