# DomainHarness v0.11.0 · B0 Element-First Foundation 规范增量

> **【R34 明确完整产品语义】** 0.11.x 唯一目标是 Domain（有界语义/知识/规则）+ Harness（受控执行和经验闭环）+ SDK（可嵌入的 Boot/Domain Package 组合和公共 API）形成完整 **DomainHarness SDK**。可在 DH 仓库暂留仅自用基础 Package 的 Seed Builder，不将全业务生产纳入 SDK。见 [R34 三名称与自举](DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_AND_BOOTSTRAP_SEED.md)。


> **【R33 产品边界修正】** 本 B0 验收中出现的 `BUILD` 仍是当时构建工具/校验/封存的实际实现与测试，不应解释为 DomainHarness 永久承担所有 Domain Package 的生产工作。当前 Owner 定义为 **DomainHarness = Boot + Domain Packages 的领域 Harness SDK，DomainForge = 由该 SDK 构建并负责生产 Domain Packages 的 Domain App**。基础 SDK 的 Assembly/Pin/安全验证继续有效；自举是 0.11.x 最终必须证明的目标但当前 NOT_IMPLEMENTED。见 [R33 规范](DomainHarness_v0.11.x_SDK_FORGE_ECOSYSTEM_BOOTSTRAP.md)。


**归属与优先级**：由 [Issue #1624](https://github.com/kaicreator-mm/domain-harness/issues/1624) 的 B0-01–B0-08 / AC-B01–AC-B07 约束此增量。0.11.x 是单一重构，不兼容旧 v0.10.x；本文在与历史 L2/PRD 候选发生冲突时优先。**本文记录目标和实现合同，不自证已验收。**

## 合同

- 唯一公共逻辑身份为 `ElementRef(namespace,id,version,digest)` 和 `FunctionRef(element,functionId,contractVersion)`。`ElementRef` 不是可执行代码地址；`ImplementationLocator(module:ResourceRef,exportName)` 只用于由 BUILD 选定的 Target。
- 每个可运行 Package 的 `init: ElementRef` 为必需，`exit?: ElementRef` 可选，`recordInitFrom` 可选。选定的生命周期 Element 必须由当前 Package 拥有、digest/version 精确一致，拥有恰好一个 `init` 或 `exit` Function 合同，且 BUILD 为当前 Target 精确选择一个实际具名导出。普通 Element 可以拥有 0–N Functions。
- Hook Provider `contributesTo[].function: FunctionRef` 必须对应已选公开 Element/Function 以及被 BUILD 验证的直接 Extension 和 Hook 接口。`HookBinding.providers` 只使用 FunctionRef，物理 Target 另行封存。
- Manifest 不再自由授予 `initResources`；已选 Init Function 的 `resources` 经 Owner/直接 Extension 校验并编入 Lock，InitContext 只取得此闭包的只读句柄，不拥有全局资源访问。
- 0.11.0 App 业务启动能力：`Package.Init → BUILD 已选 Element.Function`。READY 之前执行 `ReadonlyFunctionHandle.invoke(input)`；只允许无外部 Effect 的已选实现，输入/输出由既有 Schema 校验，`SUCCEEDED/UNKNOWN/FAILED` 结果与 `AppInitResult` 的 `READY/DEGRADED/BLOCKED/FAILED` 严格分离。
- `DomainAppDescriptor.ingress`、`DomainAppLock.ingress`、`DomainApp.invoke`、`suppressedIngress`、二次 `businessAppInit`、`technicalInit` 等历史入口不是本版公共规范；不能加适配器或第二 Runtime 维持它们。
- Boot 受信 `bootstrap` 保持独立技术 Pin，不能伪装为业务 Element。`Core.Order` 全局唯一且 0 是 KDP，Package 仅调用合法直接 Extension，InitFrom 不去重，Exit 按实际进入记录逆序执行（缺省无动作）。
- BUILD 包括生成和组合成可安装的唯一确定性 Package。运行时只能执行已封存的唯一 Target；对未处理业务致命异常仅 KDP 打最小脱敏日志并执行必要 Exit。

## 正式验收

| 编号 | 必须提供的实证 |
|---|---|
| AC-B01 | Init Element 本 Package 拥有且唯一选定 Function+Target，裸 ESM 冒充拒绝 |
| AC-B02 | 可选 Exit/InitFrom、重复 Init 和逆序 Exit 互不混淆 |
| AC-B03 | READY 前真实执行已选 Function；交换规则 Content 实际改变返回 |
| AC-B04 | 错误 Owner/version/digest、缺失 Function/Target、非法 Hook/Extension/资源/动态调用 BUILD 拒绝 |
| AC-B05 | 真实 Boot/KDP/SDK 无旧直达 ingress，状态与 Outcome 分离，致命异常安全退出 |
| AC-B06 | 重复 BUILD 的 Lock 和安装包字节一致；Node ≥22.12 clean-packed Consumer 通过，Core/Boot Pin 不回归 |
| AC-B07 | 同 SHA Typecheck/Lint/相关 Tests/真实 Demo + 另一对话独立 Reviewer，必要修复增量复审 |

本增量不新增 0.11.1 Workflow/XState/Actor、start/end 业务 Hook、Switch、JSON/YAML Reader 或 Task Budget。当前源码路径参见 [代码与调用链](../architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md)。
