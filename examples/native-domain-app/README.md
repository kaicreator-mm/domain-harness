# v0.11.1 原生 Domain App 最小纵向验收

`node examples/native-domain-app/main.mjs`：仅通过 `@kaicreator/domain-harness` 公开 API，静态导入两个 ESM Package，KDP Order=0、业务 Order=2、可选 Init/Exit；业务 Class 在同一实例下复用两个 JSON 和两个 YAML 输入；Package 级 `sumAmounts()` 作为原生模块 Function 直接调用。此示例 Package 的 **直接声明依赖只有 SDK**。

目前此 Demo 运行于 monorepo 的已安装 workspace，**不等价于最终独立 Registry 消费者验收**。旧 microkernel/contracts 等仍在内部 SDK 依赖中；K3 需删除旧运行时并重新检验单一 SDK 外部安装、完整 Reader/Workflow/Hook/预算和错误边界。
