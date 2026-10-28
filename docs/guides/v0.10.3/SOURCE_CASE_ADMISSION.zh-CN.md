# v0.10.3 I01 · Source-only Case 安全准入 recipe（待验证）

[English](SOURCE_CASE_ADMISSION.en.md) · [反馈 Issue #1437](https://github.com/kaicreator-mm/domain-harness/issues/1437) · [发布资格 #1419](https://github.com/kaicreator-mm/domain-harness/issues/1419)

> **候选指南，不是已验证的修复。** 基准源码 `version/v0.10.3@a732ef492958bac47313735b40881e883143d58e`；相关 Kernel/Standard/Host 源文件 Blob 与 v0.10.2 完全相同。此前 ai-rexform PR #330 在 Windows Node24 通过真实公开 SDK 证明非法 alias 在 Effect handler 才拒绝、同一稳定 Case 的下一次合法输入遇到 Journal conflict。以下 recipe 尚缺新候选 SHA 的独立实测，**不得据此解锁 PR #330**。

## 结论与权威边界

1. 最小路径是 **可信 Host/应用入口完整验证后才调用公开 `DomainApp.send()`**：先由可信 C00 projector 得到 `SOURCE_ONLY` 报告，拒绝任何物理授权/正向验证声明；严格验证 Case ID、精确字段集、允许的 route/verdict、`NOT_RUN`、计数/文本上界、报告摘要和当前授权；将完整验证过的 data-only summary 以确定的字段顺序序列化；最后构造固定 `instanceKey/messageId` 并送入 K。
2. **只通过此受信入口暴露业务操作，不能向不可信调用者暴露原始 `send()`。** 每个坏 source DTO 都必须在第一次 `send` 之前被拒绝，`sendCallCount=0`。只在 B effect handler 或 C `readCase` 校验属于**过晚**，不能避免已预留的 Effect Journal。
3. 可在已选 Business 的 source transition 增加现有 K declarative Guard 作防御纵深。它能拒绝缺少 summary、legacy alias 或明确当前状态不一致，但**不能在字符串内做任意 JSON.parse/Schema 校验**；`rule.payloadExpression` 也不是通用 JS/JSON 解析回调。即使 Guard 在 Effect Journal 前拒绝，也**不代表**没有任何 K turn/disposition 记录，不可凭此保证相同 `messageId` 后续可提交不同内容。严格满足“bad → valid 同一身份不毒化”必须先由可信入口保证 bad **根本不调用 K**。
4. K 仍唯一拥有 State/Effect Permit/Journal/Replay/UNKNOWN；不能把业务授权从 payload、`QUERY_NOT_FOUND` 或模型建议中推断。稳定 CaseId 派生的 messageId 不能改成内容派生来绕过旧记录。
5. Host 公开 `PoisonRecoveryCoordinator` 只是已验证 FAILED effect、独立授权、CAS 一次性纠正凭证协调器；它**不清理**原 Effect Journal。公开 `load().send()` 及 `./host-seam` 并无可证明的 recovery-turn 提交接口。**已经存在的毒化实例**保持隔离/HOLD，走单独受权恢复设计与独立验证，绝不删 Journal、不重试不确定效应。

## 最小应用私有伪代码（不是公共 SDK 新 API）

```js
// trusted Host/application boundary; keep facade private and not user-addressable
async function submitTrustedSourceCase({ caseInput, projectCase, authorizeCurrent, facade }) {
  const report = projectCase(caseInput);            // trusted C00 projector
  const summary = validateAndCanonicalize(report);  // app-owned strict allowlist:
  // SOURCE_ONLY, claims.length === 0, every decision.validation === NOT_RUN,
  // exact CaseId, approved routes/fields, bounded data, digest and version.
  await authorizeCurrent(report.caseId, summary);   // trusted authorization/currentness
  const identity = stableCaseIdentity(report.caseId); // unchanged for replay/drift
  return facade.send({
    intentType: 'inspectSourceTabletCase',
    instanceKey: identity.instanceKey,
    messageId: identity.messageId,
    input: { caseId: report.caseId, caseSummaryJson: JSON.stringify(summary) }
  });
}
// Functions above are application-owned policy, not new public SDK exports.
// A mock-only facade is NOT proof of journal safety.
```

可选 K Guard 的声明形式（仅示意，必须用真实选定 K 验证）：

```js
{
  guardId: 'source-summary-no-legacy-alias',
  predicate: {
    op: 'all',
    predicates: [
      { op: 'exists', operand: { source: 'event', path: ['payload', 'caseSummaryJson'] } },
      { op: 'neq',
        left: { source: 'event', path: ['payload', 'caseSummaryJson'] },
        right: { source: 'event', path: ['payload', 'caseId'] } }
    ]
  }
}
// source-case transition declares guardId; legacy transition remains separate.
// Predicate combinators are 'all'/'any', NOT 'and'/'or'.
```

## Windows Node24 必须验证的负例

对同一精确 SDK SHA **真实封装/安装** Contracts、BUILD、Microkernel、Host（并选择真实 K/S/B/C 源码）构建新 sealed BUILD 与隔离 Consumer，分别用独立 CAS Store 测：

- **现象保留**：raw bad alias → Handler 拒绝 → Effect Journal 已记录 → 同一个稳定 Case valid canonical → conflict/UNKNOWN。保留实际原因与 `stateRevision`，不得清理旧 Store。
- **recipe 正例**：bad alias / 非法 JSON / 超界 / 伪造 NOT_RUN，经可信 gateway → **send=0、Effect Journal=0**；随后同一个稳定 Case 的合法 canonical → admitted，Effect output + scoped query 绑定；精确重放不会再次执行；同 messageId 不同 Case 版本拒绝，QUERY_NOT_FOUND 不作授权。
- **Guard 防御**：raw bad alias 被 K Guard 拒绝，**Effect Journal=0**；是否会占用同一 message turn/replay identity 必须实际观察；未经验证不得宣称后续 valid 可用。
- **恢复负例**：未授权、无/外域 FAILED effect 证明的 `PoisonRecoveryCoordinator` 操作不等于真实 K 恢复；原 Journal 不能删除、不可新建伪恢复消息。
- 记录 Windows Node24 版本、公开包 tarball SHA、SDK/consumer HEAD/tree、测试命令实际 EXIT、每条 stateRevision 和 Effect Journal 观察。不可联网请求 LLM、不可执行 ADB/真实设备写入、不可显示私人原始数据。

直到完整证据与独立审核通过：`SDK_GAP=CONFIRMED`（原始 public raw-send 无任意嵌套 JSON pre-Journal 钩子）；`MINIMAL_COMPATIBLE_OPTION=TRUSTED_GATEWAY_RECIPE`；`WINDOWS_V0103_EXIT=NOT_RUN`；`I01_RELEASE_READY=NO`。**不承诺无授权自修复，不扩大 Kernel/Host CAS 框架。**
