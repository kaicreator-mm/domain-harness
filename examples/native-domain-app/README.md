# v0.11.1 原生 Domain App 与仓外 SDK 消费者

`node examples/native-domain-app/main.mjs` 通过唯一公开的 `@kaicreator/domain-harness` SDK 入口静态导入两个 ESM Core Package：KDP Order=0（有 Init）与 Business Order=2（无占位 Init）。业务 Module Function 和 Class Element 均由原生 JS 调用，不涉及旧 FunctionRef/Target。

同一个 OrderService 内复用一个 JsonReader 读取两份 JSON、一个 YamlReader 读取两份 YAML。**四次解析都通过实际 `NativeWorkflowContext.invoke()` 计入同一根 calls/steps 额度**，与父 Guard、子 Workflow、异步 start/run/end Hook 共享根预算。

验收包括正例及两个关键负例：
- calls=8/steps=10：Guard + 4 Reader + 子业务 Hook 完整成功，count=4、total=10
- calls=3：第三次 Reader 必须在执行前拒绝，前两次 Reader 的执行记录保留，理由 `WORKFLOW_CALL_BUDGET`
- calls=6：四次 Reader 执行后，子叶子 Hook 的 3 次调用额度无法预留，任何 start/run/end 副作用都不得发生
- steps=5：第三次 Reader 必须在执行前以 `WORKFLOW_STEP_BUDGET` 拒绝

真实仓外安装由 `npm run test:consumer` 执行：使用 `npm pack` SDK tarball，在临时独立 npm 项目中**只直接声明 SDK 一个依赖**并 `npm ci`，运行上述 App、编译 SDK .d.ts 并拒绝私有子路径。CI #3149 是旧示例修复前的历史收据；后续新 HEAD CI 才覆盖这些真实根预算正反例。

生成期可选检查工具 `scripts/validate-native-generation.mjs` 只读取指定 Core 入口的源码 AST 和直接依赖，不执行业务，不将 Package/Element 正确性校验移入 SDK Runtime。
