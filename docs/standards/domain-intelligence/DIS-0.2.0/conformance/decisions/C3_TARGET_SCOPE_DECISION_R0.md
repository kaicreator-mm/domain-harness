# C3 / DIS020-CORE-008 — Target 实际验收决策（仅来源审计提案）

对应 [Demo #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499)、[Product/L1 #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496) 与 [Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497)。机器来源索引：[C3_TARGET_SCOPE_DECISION_R0.json](C3_TARGET_SCOPE_DECISION_R0.json)，包含实际各文件 Git Blob 和之前经过验证的原生 CI。

## 实际情况，不是推测

历史 `#2403/1–3` 在 `4964edbc9e1c8a0152a90ee1c121b8620c961d3f` **3/3 SUCCESS**；B03/B05 原始 Target 测试此前在 `1a00ecad9dcb795eb6df55cd2f53bd6208e7b9de` 的 `#2293/1–3` **3/3 SUCCESS**。

- B03/R39：AOT 选中的 Package/模块摘要、独立提供的 installer Target 身份必须匹配，否则 KDP 不准入。
- B05/R44–R46：真实 Node `process.platform/process.arch` 匹配、完整第一方 Source Pin、所选 Tally/Runx/xDownload 到 KDP 的实际消费、无 SAP/Effect 冒充。
- **真实反例**：B03/R40 同时构造 Linux 与 Windows Target 声明，二者原始 BUILD 所选模块摘要集合**完全一致**；原始 `built` 没有 `platform`。不同 AOT digest + 不同 Target 标签**不等于**目标专属构建或实现。
- 新的 `3bf6d05687faecd961a6fff43faeaa8955960c63` B05 测试要求 Woodpecker CI 原生进程**实际 Linux/x64**，不能让关键正例被 skip 后仍“绿”；并输出 Source/Host/Package 摘要日志，仅能算 `STRUCTURAL_ONLY`。该新源码独立 CI `#2404` **在本决策包建立时尚未全部结束**，不得继承旧成功状态。

R3 §3 要求每个 Package 有实际选定 Target、Implementation 与依赖闭包，不能只凭标签。这个差距已在原始 Matrix 中保持 `DIS020-CORE-008=PARTIAL`。

## 给 Product/L1 的最小业务决策

**推荐：** 确认 DIS v0.2.0 本轮**有界 Demo**只把 `linux/x64/node` 作为*适用的实际 Target*。不对 Windows、Android、Linux/arm64 或物理 Effect 作虚构覆盖；这并不禁止后续单独为其它目标构建 Package。若 Product 目标要求其它平台，请在 #1496 指明最小适用集，不要让 Builder 擅自扩大/收缩要求。

**不能仅凭这个范围决定就把 CORE-008 改成 VERIFIED。** 决策后还须真正构造目标专属的 Package / BUILD-selected 实现或目标依赖闭包（最小可行即可，不需要通用 Host 抽象）；在 Linux/x64 实际进程完成“选定来源→构建→独立安装目标→KDP”正例，验证改 Target 标签、Source digest、选定模块、实际 Host 各种负例，并取得相同源码的三项 CI 收据。

目前 `PRODUCT_L1_DECISION=PENDING`，新 `#2404` 原生收据尚不能在这里宣称成功，`CORE-008=PARTIAL`，Core **12/16**。DKE 的独立 Source-First Critic / Owner SAP、CORE-002/005、CORE-016、GOV-001 都属于**单独门禁**。本文件无自动 SAP、Effect、Freeze、Merge 或 Release 授权。


## 随后独立 CI 结果（R1，新证据，不覆盖 R0）

在上述 R0 建立之后，源 HEAD `3bf6d05687faecd961a6fff43faeaa8955960c63` 的原始 Woodpecker [#2404/1](https://ci.kaicreator.com/repos/18/pipeline/2404/1) Native、[#2404/2](https://ci.kaicreator.com/repos/18/pipeline/2404/2) Min Node、[#2404/3](https://ci.kaicreator.com/repos/18/pipeline/2404/3) Generic 均返回 **SUCCESS**。已重新读取必跑工作流 Git Blob `62faed461b0a0a099101b5a33cca4c46e0aa5a87`，确认 `b05-host-target.test.mjs` 在原生命令中不可省略；原始新测试 Git Blob `8f099b6158ad5a71b5bc0f0375046e7280723588`，CI 环境下会断言真实 Linux/x64/Node 并输出结构性 Host/模块摘要。

单独固化 [R1 原始 CI 资格收据](C3_TARGET_HOST_EXACT_CI_R1.json)，保留 R0 构建时的 PENDING 历史。本对话未直接读取 Woodpecker `DIS_C3_SELECTED_HOST` 原始步骤 stdout，**不伪造具体摘要值**。此成功证明 *实际选定 Host 原生门禁*，**仍然不能**解决 B03/R40“相同模块换不同标签”的真实 Target 专属构建缺口。因此 CORE-008 继续 `PARTIAL`，需要正式 Product/L1 决策及实际构建选择后才可申请升级。
