# DomainHarness 0.11.1 · R60 W04 SDK 入口性能及稳定合同的有限结论

**所属**：[Task #1656](https://github.com/kaicreator-mm/domain-harness/issues/1656) W04 / AC60-05；实施证据 [PR #1657](https://github.com/kaicreator-mm/domain-harness/pull/1657)；此文是设计决策和量化方法，**不是未经验证的 CI PASS 声明**。

## 权威入口与成本边界

- `@kaicreator/domain-harness/runtime` 仅加载 Contracts + Microkernel，供 Boot-only Domain App 使用；不应提前初始化或导入 Composition、TypeScript、Ajv。
- `@kaicreator/domain-harness/composition` 内含完整 Package 组合/静态验证，供作者期 `buildApp` 使用。消费者仍只直接安装一个 SDK，不能另外安装作者期 BUILD。
- 包根 `@kaicreator/domain-harness` 目前同时同步导出 `boot` 与 **同步** `buildApp/BuildRefusal`，故 Node ESM 静态 `export *` 会预先链接 Composition。这个公共合同已经被已受审 0.11.1 Consumer 使用；未经兼容性证据不能擅自改为异步 `import()`、再制造第二个 SDK 产品或引入延迟伪对象以声称“零成本”。
- 当前有限工程决策：**KEEP_AS_IS_ROOT_SYNC_API_AND_USE_RUNTIME_SUBPATH_FOR_BOOT_ONLY**。在一个 Node 22 进程中，Boot-only 通过正确的 `/runtime` 子路径完全避开 Composition 的导入；Root 需要同步 Composition 的成本是明确的、由使用入口决定的开销，不应转嫁给 Boot 运行时。若未来数据要求根入口本身动态化，必须建立新版本 API 变更及 class/identity/异常兼容证据，不能冒充本版无损优化。

## 真实量化收据

`npm run perf:profile` 复用当前真实 `npm pack --dry-run --json --ignore-scripts` SDK，分别对 `/runtime`、`/composition`、根入口做 **5 次独立 Node 进程冷导入**并取中位数；输出：

```text
_tmp/r60/sdk-entrypoints.json
  sdkPackBytes
  sdkUnpackedBytes
  samples.runtime.medianElapsedMs / medianRssBytes / exportCount
  samples.composition.medianElapsedMs / medianRssBytes / exportCount
  samples.root.medianElapsedMs / medianRssBytes / exportCount
  rootVsRuntime.medianElapsedDeltaMs / medianRssDeltaBytes
```

Woodpecker verify 在同一 Exact HEAD 执行后将完整 JSON 输出到 CI 日志，同时在工作目录落盘。**数值由实测产生，不在此处预填或虚构**。脚本不设任意延迟/RSS 阈值作为兼容 Gate。复审时应从对应同 SHA 原始 CI 输出核对具体值、判断 KEEP_AS_IS 与 Boot-only 分路径是否成立；不能将缺失的前代指标或未读 CI 输出写成真实量化比较。

## 可拒绝的回归边界

根 SDK `buildApp` 仍为同步函数；`/composition` 独立可用，`/runtime` 不出现 `buildApp/BuildRefusal`，SDK 全部公共类型由唯一事实源生成。实际 clean-packed 单 SDK Boot + Lock/Pin/Function/Workflow 检验必须保持通过。本决策不改变 BUILD、KDP 的任何动态权限。
