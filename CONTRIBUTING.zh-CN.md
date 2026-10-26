# DomainHarness 贡献与使用反馈（中文）

**正式使用手册：** [中文文档首页](docs/current/zh-CN/index.md)，Agent 使用 [English documentation](docs/current/en/index.md)。本文件是 [English contributing guide](CONTRIBUTING.md) 的中文对照，规范以仓库精确 SHA、ADS 固定版本和代码事实为准。

发现 SDK 问题时请先做**最小可复现、明确归因**：记录 SDK Tag/精确 SHA、公开 API、期望/实际、命令真实 EXIT 或 NOT_RUN、适用 Host/Tiny/Rich 和是否存在同类 GitHub Issue。遇到纯 OS/CI 测试资源问题不要误报 SDK 缺陷。

* 可复现 SDK Bug：用 [GitHub SDK Bug/使用反馈表单](https://github.com/kaicreator-mm/domain-harness/issues/new/choose) 提交。
* 集成困难、文档缺漏、成功实践、Feature 缺口：用 Feedback，说明实际收益、可复用模式及未来需求。
* 如果由 Agent 代用户发布，必须先**脱敏、出草稿、获得用户明确批准**；不能上传凭据、私有消费者源码、客户数据、生产日志、Hidden 测试。SDK 不内置自动上传。

贡献流程：读取 `AGENTS.md` 与 `.dev-standard/VERSION` → 明确 Product/L2 边界 → 一项 concern 一个 PR → 最小真实验证 → 独立审核 exact SHA → 写回 Issue 和最终结果。文档更新须成对更新 `docs/current/zh-CN/` 与 `docs/current/en/`，并执行 `node docs/current/validate.mjs` 检查路径和配对；独立审核两种语言的技术含义，不能修改冻结 Tag。

详见 [中文反馈说明](docs/current/zh-CN/feedback.md) 和 [Issue 治理流程](docs/feedback/ISSUE_TRIAGE_PROTOCOL.md)。
