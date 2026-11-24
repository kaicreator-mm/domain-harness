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

## v0.11.2 T05：两个静态 Business 插件及双 Workflow

`intent/repair-quote.ts` 与 `intent/air-quality.ts` 是同一示例 App 中独立静态选定的业务 ESM 模块，使用不同领域的类型与只读知识；`repair-quote-revised.ts` 演示另选新知识修订。按原生 Package 插件规范，不要求每个局部插件独立发布 npm 包，没有生命周期需求也不生成空 Init。全部 SDK 调用只来自公开包根；不修改 SDK、旧 App 或 KDP。

- 维修规则为明确的合成示例（逻辑日、整数报价），按租户、业务、来源、修订、有效期查找，重叠冲突或不完整结果返回 UNKNOWN。旧 v1 与新 v2 通过各自固定的知识选择并存，嵌套对象和数组不可变，不运行时热更新。
- AQI 规则来源为 [AirNow AQI Basics](https://www.airnow.gov/aqi/aqi-basics/) 与 [AirNow National Maps](https://www.airnow.gov/national-maps/)（采集日期 2026-11-24）。六个整数分类区间为 0–50、51–100、101–150、151–200、201–300、301–500；本例仅接受 US EPA AQI 0–500，超过示例范围返回 UNKNOWN。输入观测是合成 fixture，不计算污染物浓度、不获取实时观测、不提供健康建议；规则来源与观测来源分别保留。
- 每个连续请求只建立一个 StandardWorkflowSession，Recognition 与 Handling 为两个静态子角色；通过 invokeOutcome 传播终态，完整识别后方可调用 Handling。精确正常额度 calls=2/steps=5/depth=1；额度不足时没有 Handling 入口调用。实例计数仅供示例见证，不是实际持久状态、权限或 Host Effect；T06 另行完成真实授权动作。
- `intent/verify.ts` 的八组验证由仓内 node:test 与仓外已安装 SDK Consumer 共用。Consumer 复制实际 TS 源码、严格编译成 ESM、运行相同验证，无新增直接 npm 依赖或私有 SDK 路径。T05 不冒称 T07 独立双领域生成/双平台完整 E2E。
