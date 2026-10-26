# v0.10.2 Package 编写指南 —— 公开 producer 优先

> 语言：中文。英文对应文档：`V0102_PACKAGE_AUTHORING.md`。

**P1 release-candidate 源码草案；Issue #1379。尚未独立通过 Node24 验证。** Domain Package 携带的是独立选定的源码模块。不要照抄历史 Compiler 的内部结构，也不要为每个微小的私有函数单开一个 Package。

## 真实的公开接口面

```js
import { buildV10App, projectSelectedComponents } from '@kaicreator/domain-harness-build';
import { sha256Hex, V10_TARGET_PROFILE } from '@kaicreator/domain-harness-contracts';

// selectedModules: immutable, already chosen K Primary + S Primary + >=1 B,
// plus only actually required K/S/C extension modules.
// Each selected source has moduleSource and sha256Hex(moduleSource).
const projection = projectSelectedComponents(componentDeclarations, selectedModules);
const app = buildV10App({
  appId, audience, buildId,
  targetProfile: V10_TARGET_PROFILE,
  modules: [...coreKSBModules, ...projection.modules],
  routes: declaredIntentOperationRoutes,
  hardBudget: { maxStepsPerTurn: 8, maxWorkUnitsPerTurn: 64 },
});
// Serialize this sealed plain-data App to an installed App package.
// Runtime never imports BUILD or any Compiler package.
```

上述模板中的变量是**作者有意提供的输入**，不是隐藏的 SDK 全局量。该示例是一个编写形态，不是可独立执行的文件。要看*物理执行过*的 producer（只使用公开根），见 `examples/v0102-external-producer/producer.mjs`：它读取精确安装的 K/S/Feature Package payload 并密封 Tiny/Rich App。它自己的证据在 T09 #1330，不在本文档。

## 三条必备编写路径

1. **纯非 Tool 的 S Feature：** 选定一个带 `featureExport` 与 `moduleSha256` 的 `standard-feature` 模块；声明 `{class:'semantic',kind:'rule',componentId,modulePackageId,entry}`，其中 `entry === featureExport`。普通确定性 helper 保持私有。没有 Tool，没有 K permit，没有隐藏的 feature import。见 `tooling/build/tests/component-view.test.ts` 与 `domain-packages/standard/features/semantic-decision/`。
2. **私有 B/C helper：** 在已声明的 B 或 C 模块内部，经由被允许的*普通*本地代码 import 它。在没有具名跨模块边界的情况下，绝不要为这个 helper 添加 operation 或 Tool。Host/资源初始化与释放跟随所选运行时，而不是从 Tool 元数据推断；未选定的模块没有 init/execute 边。
3. **混合的独立 C 模块：** 用一个只读的 `externalEffect:false` C 模块承载 `inventory.get`，用*另一个* `externalEffect:true` C 模块承载 `jobs.submit`。通过 `projectSelectedComponents` 把每个声明的 `operationId` 绑定到它的 `handler`。BUILD 必须同时密封选定模块字节与精确路由；effect 一律走 K permit。把只读与带副作用的 handler 混进同一个模块，无法获得 per-handler 覆盖。

## 最小单命令源码探针（Node24，repo 工作树）

```sh
npm ci && npm run build
node examples/v0102-package-authoring/projection-smoke.mjs
node --import tsx --test tooling/build/tests/component-view.test.ts
```

**探针边界：** 它覆盖 semantic/advisory/Tool projection、两个不同的 C 模块与类型化*静态*负例。它本身不安装/执行第三方 Domain App，也不证明 effect/UNKNOWN。

## 物理公开 tarball 编写验收（Node24，单命令）

```sh
node examples/v0102-package-authoring/authoring-template-check.mjs --evidence <file.json>
```

`examples/v0102-package-authoring/authoring-app/` 是 #1305 的最小编写 App 源码（S 非 Tool Feature + 带私有 helper 的 B + 只读与外部 effect 的 C 模块），`authoring-producer.mjs` 在隔离的公开 tarball 根内、严格按本指南的路径 —— 先 `projectSelectedComponents` 再 `buildV10App` —— 密封它；随后这个 sealed App 被打包、clean-install，并以受治理的 permitted 派发、无 permit 的类型化拒绝（零 adapter 派发）以及六个类型化绑定/路由负例来执行。该检查把字面退出码与摘要记录进 evidence JSON。永远不要只靠 monorepo 源码 import 来支撑这个证明；既有的 T09 Tiny/Rich 套件（`tests/integration/v010-clean-consumers/clean-consumers.test.ts`）仍是独立的 producer/consumer 证据。

## 发布检查

`0.10.2-rc.0` 包是本地 tarball 候选，不假定已发布到 npm。核对精确的 `engines.node >=24.0.0`、选定的 `exports`、打包出的 JS/d.ts、没有深层 `dist/` import、没有遗留 Compiler 别名。记录字面 command/exit/Node/npm/源码 SHA 与产物 hash。使用[扩展点索引](SUPPORTED_EXTENSION_POINTS.zh-CN.md)与[迁移指南](../migration/MIGRATING_V0101_TO_V0102.zh-CN.md)。只有 `R01` 能决定 Release PASS；编写文档本身不能。
