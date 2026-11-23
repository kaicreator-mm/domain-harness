# @kaicreator/domain-harness

基于 TypeScript/Node 标准模块、Class、函数与 npm 依赖的嵌入式 Domain SDK。

```ts
import { KernelLifecycle, JsonReader, StandardWorkflowSession } from '@kaicreator/domain-harness';
```

Package 由普通 ESM 文件组成。Class Element 作为复用能力；业务 Function 可以直接是模块 export。可选的 Core.Init 由 KDP Order=0 开始按代码 Metadata Order 启动，退出逆序清理；SDK 只负责业务未捕获异常的最终日志/Exit 兜底，不做 Package/Element 运行时静态正确性验证。

Standard Elements 包括 Reader、XStateWorkflowElement 以及原生预算/Hook/Switch 组合；它们建立在 Node/npm 基础设施之上，不逐层包裹所有 Node API。

正式单 SDK 直接安装与消费者验收由 `scripts/verify-native-sdk-clean-install.mjs` 执行。生成期 Core.Order/依赖检查由作者按需调用 `scripts/validate-native-generation.mjs`，不是运行时插件 Loader。
