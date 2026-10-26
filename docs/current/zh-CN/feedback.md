# DomainHarness v0.10.2 · SDK Issue 与使用反馈

[返回文档首页](index.md) · [English version](../en/feedback.md)

## 什么时候向 DomainHarness 提 Issue？

SDK 使用过程中，应欢迎**真实缺陷和真实使用体验**：既包括负面问题，也包括提高效率的可复用实践。无需自动遥测或上传原始业务数据。

| 情况 | 建议 |
| --- | --- |
| `load`、BUILD、K/Host CAS 等可复现错误 | [SDK Bug 表单](https://github.com/kaicreator-mm/domain-harness/issues/new/choose) |
| API 难理解、安装复杂、文档缺漏 | 选择 SDK Usage Feedback 的使用困难/文档分类 |
| 缺少 Feature/Operation/Host 能力 | 选择新需求，进入**下一版本** Product/L2/DAG |
| Tiny/Rich/外部 Producer 的成功经验 | 一次使用反馈，附上脱敏的正例、收益与验证 |
| OS 内存、页面文件、Runner 进程资源故障且没有 SDK 证据 | 归消费者/CI 环境，不误报产品 Bug |

## 一个有效报告应包含
- 固定 SDK Tag 和 **精确 SHA**；当前示例为 `v0.10.2@cee14399...`。
- 受影响公开 API、K/S/B/C 选型、Producer/Host 模式和 Node 版本。
- 预期行为、实际行为、最小**可公开**复现、真实命令退出码或 `NOT_RUN`。
- 问题影响范围与是否已经搜索过重复 Issue；如是成功实践，列出值得复用的模式和可公开结果。

## Agent 上报权限
1. 先搜索仓库已有开放和关闭的 Issue。
2. 把私有消费者代码、凭证、生产日志、客户数据、K Permit、Hidden 数据全部删掉或替换成模拟值。
3. **先展示 Issue 草稿，再获得用户明确批准**；不得在后台自动上传，也不得将授权推定为“用户使用了 SDK”。
4. GitHub 返回 Issue URL/Number 后才能说“已经提交”；没有权限或用户未批准则只保留草稿。

反馈进入：**收集 → 分类 → 复现 → 优先级 → 文档修复/未来 Product-L2-DAG → 代码独立审核 → 回写 Issue**。完整规范：[反馈流程原始资料](../../feedback/SDK_USAGE_FEEDBACK.md) 和 [治理契约](../../feedback/ISSUE_TRIAGE_PROTOCOL.md)。

---

**权威源：** Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；v0.10.2 的发布资格为 **CONDITIONAL**。文档更新不改变冻结版本或测试事实。
