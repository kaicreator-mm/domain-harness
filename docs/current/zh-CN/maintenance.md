# DomainHarness · 双语文档维护规范

[中文首页](index.md) · [English version](../en/maintenance.md)

## 1. 现行文档的唯一目录

* **面向用户：** `docs/current/zh-CN/<topic>.md`。仓库 `README.md` 默认给中文用户。
* **面向 Agent / 代码开发：** `docs/current/en/<topic>.md`。机器入口 `AGENTS.md`、`llms.txt` 和 canonical `SKILL.md` 为英文，并从英文目录开始。
* **必须双语：** 每个现行主题在两个目录使用**相同文件名**，章节覆盖相同的 SDK 能力、版本限制、命令和失败语义，两个版本页顶都有对方的切换链接。
* API 标识符、Git SHA、实际 EXIT、TypeScript 代码、导入路径等**保持原样**；只翻译说明、提示、示意图标签。不能用空页面或“请阅读英文版”冒充中文手册。

## 2. 历史原始证据不翻译、不迁移

`docs/product/`、`docs/architecture/`、`docs/validation/`、`docs/implementation/` 以及较早的 `docs/guides/`、`docs/sdk/` 仍保留原路径、原文件和历史状态。避免修改冻结证据、破坏 GitHub Issue 精确 Blob 引用。任何新用户说明只在 `docs/current/` 更新中英成对文件。

## 3. 一个文档 PR 应如何审核？

1. 同时修改 `zh-CN/<topic>.md` 和 `en/<topic>.md`，如新增主题还需更新两个 `index.md`。
2. 在 Node24 仓库根目录运行：

```sh
node docs/current/validate.mjs
```

3. 校验通过后仍要做**人工双语语义审查**：确认两个语言的接口、风险、运行命令、安装限制和发布事实等价。自动脚本不理解技术含义。
4. PR 只影响文档则只做链接/格式/源码一致性验证，不重复 Full/Hidden；保存准确的 NOT_RUN 和审查回执。

用户发现中英含义不一致、断链、代码示例不正确，可以按 [反馈流程](feedback.md) 先去重、脱敏再提交文档 Issue。Agent 创建公开 Issue 需要用户授权。

**当前发布：** v0.10.2，RQ CONDITIONAL，真实 Full EXIT1、root NOT_RUN 保持不变。
