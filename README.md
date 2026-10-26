# DomainHarness

> **用户文档默认语言：中文。** [中文文档首页](docs/current/zh-CN/index.md) · [English documentation for Agents](docs/current/en/index.md) · [English README](README.en.md)

DomainHarness 是一套面向 **Domain App / Domain Package** 的 JS/TS 运行 SDK。外部可信 BUILD 阶段封闭选定 K/S/B/C Domain Packages；运行时 Microkernel 装载预构建 App，提供 `send / query / subscribe / stop`；可选 Node Host 提供 CAS/SQLite 等物理能力。业务状态与外部 Effect 权威由 **K Primary** 拥有，而不是 Microkernel 或 Host。

## 用户从这里开始

| 想做什么 | 中文说明 |
| --- | --- |
| 了解能力、第一次运行 | [快速开始](docs/current/zh-CN/quickstart.md) |
| 看整体架构图 | [系统架构](docs/current/zh-CN/architecture.md) |
| 使用 SDK API | [SDK 接口](docs/current/zh-CN/sdk.md) |
| 创建 Domain Package | [Package 开发](docs/current/zh-CN/packages.md) |
| 选 Tiny / Rich、数据库 Host | [Host 与存储](docs/current/zh-CN/host.md) |
| 让 Codex / Claude Code 使用 SDK | [Agent Skill](docs/current/zh-CN/skill.md) |
| 发现 SDK 问题、提出需求 | [Bug / 使用反馈](docs/current/zh-CN/feedback.md) |
| 版本资格与约束 | [发布状态](docs/current/zh-CN/release.md) |

**全部中文主题与英文主题一一对应。** [查看完整中文目录](docs/current/zh-CN/index.md)。旧研发材料（Product/L2/Task DAG/原始验证）参见 [历史资料](docs/current/zh-CN/archive.md)，不作为用户日常手册。

## 版本与安装事实

**已完成版本：** [v0.10.2 Git Tag](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2)，源码 SHA `cee14399d9d0af4e20e34b9111861b16a465b690`。实体验收环境为 **Node24**。Git Tag **不代表四个公共 npm 包已在 registry 发布**；tagged 的公开 workspace manifest 版本仍为 `0.10.2-rc.0`。

**发布资格：** `RQ=CONDITIONAL`，已完成 20/20 Task；Hidden 7/7 PASS，但最后 Full `npm test EXIT1`、`test:root NOT_RUN` 的真实记录继续保留；经 Owner/第三独立审查批准的例外**仅对这个 SHA 有效**。不要求特定 OS 或 128GB 主机。本文档为 Tag 发布后的说明更新，不修改该 Tag。

**贡献与反馈：** [中文反馈流程](docs/current/zh-CN/feedback.md) · [中文贡献说明](CONTRIBUTING.zh-CN.md)。不要把私有消费项目数据/凭据自动上传到 GitHub。
