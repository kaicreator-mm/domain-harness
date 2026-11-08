# DIS v0.2.0 — R11 Function I/O、typed outcomes、Evidence、兼容性（Demo candidate）

**权威：** Product/L1 [#1496](https://github.com/kaicreator-mm/domain-harness/issues/1496)；版本索引 [#1499](https://github.com/kaicreator-mm/domain-harness/issues/1499)；实施 [PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497)。

本轮沿用 R9/R10 已选定的真实 Tally 和 xDownload 源码、canonical BUILD / KDP / SDK / Source Pin；**原始领域源码不变**。在已锁定 AOT Function 定义上增量附加 `dis.v0.2.function-contract/1`，不发明万能执行引擎。旧版无 Contract 的 Function 不受新规则破坏，但不能按 CORE-003 计作完全合格。

## 设计及执行约束

- **I/O Schema：** 首版 bounded `record` 与必需字段类型（string / boolean / number / record / array）；在 LOCAL Function 执行前校验输入、在 typed outcome 分类前校验输出；失败拒绝。未覆盖 JSON Schema 全量功能，不接受远程任意 Ref。
- **Typed outcomes：** `status/state` 必须属于 AOT 显式映射，分为 `OBSERVED`、`UNKNOWN`、`FAILED`、`NEEDS_INPUT`、`NEEDS_CONFIRMATION`、`PENDING_AUTHORIZATION`、`SUCCEEDED`。Tally `UNQUALIFIED_INPUT → UNKNOWN`；xDownload `READY_FOR_KDP → PENDING_AUTHORIZATION`。分类不改变 `OBSERVATION/NONE` 权威。
- **Evidence：** 将受 AOT 锁定的 Git source pin 摘要作为**实现来源证据**，把 `declaredRefs` 明确标为 `attested=false`，不从来源 SHA 或 Function 自报的 `evidenceRefs` 推断当前业务事实、Claim、Review 或执行许可；声明 `SUCCEEDED` 时必须有 evidence-ref 义务，空缺拒绝。Reference 的独立验证是另一个门禁。
- **兼容性：** Function 契约 semver 与 R11 reader 区间 `[0.2.0,0.3.0)`、major 一致性都由 AOT BUILD 和 SDK 资格检查；调用方可声明 `expectedContractVersion`，拒绝版本不匹配。不虚构跨版本结构兼容自动推断。
- **Effect 不变量：** 不改变任何既有 KDP Intent、Host 侧 Effect/Journal、独立证据或授权边界，也不要求自建可信原生代码额外 OS 沙箱。

## 真实验收与仍未解决的部分

直接在 `examples/dis-v020-native-sdk/native-consumer.test.mjs` 增加 8 个原生正反例：实际 Tally UNKNOWN + 来源证据；实际 xDownload 澄清→待 KDP；非法输入、伪输出类型、未知结果状态、缺证据伪 SUCCESS、版本不兼容/弱 Evidence、陈旧消费者版本。继续复用原有跨项目/KDP/C01 和物理 SQLite 回归。

**状态：** R11 Candidate / `DIS020-CORE-003=PARTIAL` / 尚无本轮 Exact-SHA CI Success。余项：所有 Public Function 的 Schema 与 version、KDP_INTENT typed receipt、独立业务 Evidence 校验、完整 schema/兼容性差异测试、真实多应用消费；后续新 SHA 验证通过方可加入 receipt。未经独立审核与 L2 决策不得 merge / Freeze / release。
