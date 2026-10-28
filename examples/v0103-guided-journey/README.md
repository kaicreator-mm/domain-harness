# Offline Guided Journey / 离线渐进式步骤示例

This is private Business code for Issue #1414, using the unchanged frozen
`docs/product/v0.10.3/contracts/guided-journey-v1.schema.json`. It creates no new
SDK export, selected S Package, UI renderer, Provider or Effect dispatcher.

From the repository root after `npm ci` on Node 24:

```sh
node --import tsx examples/v0103-guided-journey/demo.ts
node --import tsx --test tests/assembly/v0103-guided-journey-offline.test.ts
```

`prepareApprovedAssets()` validates fixed versioned templates/catalog once when
the application prepares the journey and freezes the resulting data pin. At
runtime, `next()` derives one canonical StepSpec from trusted Host observations:
the same GMS goal chooses SUMMARY, REVIEW_EFFECT, ASK or INSPECT for four states.
Debloat preview requires a non-protected, reversible package. There is no live
device observation or execution in this sample.

StepOutcome is bound to the actually issued step, current CaseRef, permitted
event and eligible choices. Host receipt references alone cannot assert an
outcome: receipt event, step, prior/current case and evidence must agree. An
UNKNOWN effect remains in read-only reconciliation until a matching observation
receipt confirms the outcome; confirming a preview never supplies a K Permit.
Pause/resume/back re-evaluate state without repeating an operation. Static
LLMAdvisory is optional input data, validated by the sole frozen schema and the
Business candidate allowlist. It cannot add a template, change evidence or act.

The test proves offline data/Business behavior. It does not authenticate a Host,
qualify a real device, construct a packaged Domain App, prove durable recovery,
perform an effect, or establish v0.10.3 Release readiness. Those integration
obligations remain with the admitted integration/qualification tasks.

中文：这是应用私有 Business 示例，不是新增 SDK、表单引擎或模型服务。模板、选项、
双语文案和 Schema 摘要先校验并固定；运行时只根据受信 Host 的当前观察选择一步。
过期证据、伪造/重放回执、未批准选项和越权模型建议都会拒绝。UNKNOWN 不会变成成功，
用户确认也不是 K 的执行许可。示例没有真实设备、网络或操作端口；整版打包、真实
Host/设备及持久恢复验证属于后续集成任务。
