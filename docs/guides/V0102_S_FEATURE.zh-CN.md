# v0.10.2 S Feature 指南 —— 语义，不自动成为 Tool

> 语言：中文。英文对应文档：`V0102_S_FEATURE.md`。

S Primary 拥有解释与路由选择；一个选定的可选 S Feature 提供一个已声明的有界语义函数。选定 `role:'standard-feature'`，带 `abiVersion:'dh.v10.standard-feature/1'`、`featureExport`、源码字节 + 摘要与 `provides`。BUILD 必须把它纳入封闭模块集；Tiny 可以完全省略它。

**纯非 Tool** 路径是 `projectSelectedComponents([{class:'semantic',kind:'rule',componentId:'quality.rule',modulePackageId:feature.packageId,entry:feature.featureExport}], [feature])`。它返回的恰好是原始选定的 S 模块与一个仅供参考的 binding。其 ESM 体内的私有函数不是 Tool，也不会注册单独的 Tool/Operation。受支持的语义 kind 是 `skill/rule/workflow/decision/context/validator/schema/diagnostics/knowledge/evidence`，**且仅当**它们绑定一个已选定 S Feature 的导出；没有可调用入口的 prompt/knowledge 资产保持为私有 Package 数据。

真实的源码与已安装 BUILD 参考用 `domain-packages/standard/features/semantic-decision/modules/sfeature-semantic-decision-v1.mjs`、`examples/v0102-external-producer/producer.mjs`，以及 `tooling/build/tests/component-view.test.ts`。S Feature 里没有隐式 `Tool` 包装、没有 Model/Agent 依赖，也没有权限能力。当 `entry:'privateRule'` 不等于选定的 `featureExport` 时，BUILD 会拒绝；集成 fixture 还必须证明一个**未选定** feature 的安装/导入足迹为零。

Node24 贡献者检查：`npm run build && node --import tsx --test tooling/build/tests/component-view.test.ts`。这条精确非 Tool 路径的物理公开 tarball 证明（经 `projectSelectedComponents` 选定、密封、打包、clean-install 并经 `invokeSelectedStandardFeature` 调用）是 `examples/v0102-package-authoring/authoring-template-check.mjs` 的 `feature.nonToolSemantic` 步骤；文档本身永远不是物理证据，Issue #1379 要求的独立 exact-HEAD 审查仍然是独立的门。
