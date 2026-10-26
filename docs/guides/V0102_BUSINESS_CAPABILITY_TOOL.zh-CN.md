# v0.10.2 Business、Capability 与 Tool 编写

> 语言：中文。英文对应文档：`V0102_BUSINESS_CAPABILITY_TOOL.md`。

Business 模块提供已声明的 Intent/workflow，并且只调用选定的 C Operation。它不拥有 caller principal、CAS 迁移、K journal 或 Effect 权限。Capability 模块提供具名的 `handlers`、显式的 `capabilityId`，以及**一个模块级** `externalEffect` 分类。B/C 内部的普通 JS helper 可以保持私有；**不要**仅仅因为它们可被调用就把它们注册成 Tool。

```js
import { projectSelectedComponents } from '@kaicreator/domain-harness-build';

// Each entry must reference a separately selected module descriptor with
// source bytes/digest, role:'capability', capabilityId and handlers.
// No per-handler externalEffect override exists.
const declarations = [
  { class:'tool', kind:'package-operation', componentId:'inventory.read',
    modulePackageId:'capability.inventory', operationId:'inventory.get',
    handler:'getInventory', externalEffect:false },
  { class:'tool', kind:'package-operation', componentId:'jobs.submit',
    modulePackageId:'capability.jobs', operationId:'jobs.submit',
    handler:'submitJob', externalEffect:true },
];
const selected = projectSelectedComponents(declarations, [
  selectedReadOnlyCapability,
  selectedEffectfulCapability,
]);
// Feed the original selected module objects into the external buildV10App;
// include exactly one K Primary, one S Primary, >=1 B and admitted routes.
```

这是一个**双 C 模块**模板。变量代表作者提供的选定源码描述符，**不是**导出，也不是自动注册。`examples/v0102-package-authoring/` 中可执行的 projection-smoke 演示了精确的 S 非 Tool + 双 C 类型映射；`authoring-template-check.mjs` 从公开 tarball 物理证明完整的受治理/无 permit 对（先一次铸造 permit + 真实 `jobs.submit` 派发，然后无 permit 的类型化拒绝、零 adapter 派发），外加一次真实的 BUILD 路由/handler 不匹配拒绝。既有的 Tiny B/C 示例是 `examples/v010-clean-consumer/apps/tiny/app-definition.mjs`（一个 C 带 `reserve` 与 `preview` operation）；Rich 在 `examples/v010-clean-consumer/apps/rich/app-definition.mjs` 里有多个物理分离的 C 模块。

**受治理的外部 effect：** 只有已声明的 K permit 才允许 effect adapter 派发。无 permit 的请求必须返回选定的类型化拒绝，且产生零外部派发；一次 settle 含糊的外部尝试报告 UNKNOWN，绝不伪造成功。`externalEffect:true` 是密封的 C 模块分类，不是铸造 permit 的途径。P/N 真实回执查看 T09 Rich 的 `DENY_N1.permitlessAdapter` 与 UNKNOWN 旅程；新的编写模板不会仅因那些示例曾经通过就算独立验证。

拒绝未选定的 C 模块、错误的 operation/handler 绑定、重复的 Component ID、不一致的 effect 分类、未知字段/访问器，以及没有选定 transport adapter 的 `remote-operation`/`system-operation` 标签。使用既有 A8b fixture 的 `V10_EXPORT_CONTRACT_REFUSED` / `BUILD_GRAPH_INVALID` 负例。保持 Host 资源/清理显式化；不存在通用的 Tool lifecycle/transport 包装。
