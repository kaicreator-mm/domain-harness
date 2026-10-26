# v0.10.2 受支持的 Domain Package 扩展点

> 语言：中文。英文对应文档：`SUPPORTED_EXTENSION_POINTS.md`。

**候选编写契约；Issue #1379。** 本索引描述实际发布的 BUILD adapter 与选定的 v0.10.2 ABI。它不引入运行时 dispatcher，也不认证任何未运行的示例。

| 类别 | BUILD 选择 / 入口 | 拥有 | 明确不支持 |
| --- | --- | --- | --- |
| K Primary | 选定一个 `kernel-primary`，`v08-kernel-abi/1` | Admission、State/CAS 决策、Journal、Effect、UNKNOWN、Replay | 第二个 K Primary；Hook 里的 K 权威 |
| K advisory 扩展 | 选定 `kernel-extension`；`providerId` + `hookExport`，`dh.v10.kernel-extension/1`；Component `hook/kernel-advisory` | 只读的 advice/观察 | 铸造 permit、commit/replay，通用的 lifecycle/event/observer Hook |
| S Primary | 选定一个 `standard-primary`，`v08-standard-sdk-abi/1` | 语义解释/路由 | Effect 权限权威 |
| S Feature | 选定 `standard-feature`，`featureExport`，`dh.v10.standard-feature/1`；Component `semantic` kind：skill/rule/workflow/decision/context/validator/schema/diagnostics/knowledge/evidence | 一个显式选定的有界语义服务；可以使用私有纯 helper | 把每个 helper/函数或数据资产都变成 Tool；调用未选定的 feature |
| Business | 选定 `business`，`v08-business-abi/1`；声明 `intent:...` | 领域工作流、范围内的 policy 与 Intent | 调用方 grant、K Journal，绕过 effect permit |
| C Tool / Capability | 选定 `capability`，`v08-capability-abi/1`；`capabilityId`，`handlers[{operationId,handler}]`，模块级 `externalEffect`；Component `tool/package-operation` | 已声明的调用边界；外部 Effect 需要 K permit | 私有 helper 自动注册、per-handler Effect 覆盖、推断出的 remote/system transport |
| Node Host | `@kaicreator/domain-harness-host-node` 根或受信任的 `microkernel/host-seam` | 物理 CAS/SQLite、durable 端口、lifecycle 资源 | K 自有的 policy 或 BUILD 期选择 |

**执行模型：** 静态的外部 `buildV10App` 只密封选定的 K/S/B/C 模块字节/摘要/ABI/import 边。运行时通过 `@kaicreator/domain-harness-microkernel` 的 `load(app,{store,...})` 消费得到的受信任纯数据 App。`projectSelectedComponents` 只 projection 已选定的 S/K/C 模块；它的 `bindings` 仅供参考。其他扩展类别必须以类型化错误拒绝。尽管声明 `engines.node >=24.0.0`，只有 Node24 拥有真正的 v0.10.2 物理验证。

**注册 / 失败：** BUILD 拒绝未知模块/包 ID、错误的选定 `featureExport`、错误的 `hookExport`、缺失的 C handler 映射、重复的 Component 身份、未声明的 effect/import 权威、无效的 role 基数，以及 import 闭包违规。Event/Business lifecycle Hook 与 remote/system Tool 摆放没有自动 adapter。使用 `tooling/build/tests/component-view.test.ts` 的 `BUILD_INPUT_INVALID`、`BUILD_GRAPH_INVALID`、`V10_EXPORT_CONTRACT_REFUSED` 负例；不要吞掉类型化失败，也不要把“不支持”重新解释成警告。

**依赖 / 初始化：** 私有纯 helper 是选定模块里的普通 JS；其执行不是另一个被选定的 Tool。选定的 BUILD 检查已声明的依赖/import 边；Host 拥有物理 adapter 生命周期，Microkernel 的 load/stop 治理绑定/释放，K 拥有 effect 批准。本文不断言任何独立的通用 `onInit/onDispose` Component ABI。不要 import `src/` 或 `dist/` 深层路径。

编写旅程：[Package](V0102_PACKAGE_AUTHORING.zh-CN.md)、[K 扩展](V0102_K_EXTENSION.zh-CN.md)、[S Feature](V0102_S_FEATURE.zh-CN.md)、[Business 与 C Tool](V0102_BUSINESS_CAPABILITY_TOOL.zh-CN.md)、[Node Host](V0102_HOST_INTEGRATION.zh-CN.md)。已检查的既有 projection fixture 是 `tooling/build/tests/component-view.test.ts`；真实已安装 App fixture 是 `tests/integration/v010-clean-consumers/clean-consumers.test.ts`（T09，单独建立）；针对本表 S/B/C 行的最小独立编写模板物理检查是 `examples/v0102-package-authoring/authoring-template-check.mjs`。它们都不能替代 Issue #1379 要求的、发布前独立的 exact-HEAD 审查。
