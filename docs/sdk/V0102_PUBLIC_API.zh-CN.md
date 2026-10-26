# DomainHarness v0.10.2 — 精选公开 API 与 Package/ABI 地图

> 语言：中文。英文对应文档：`V0102_PUBLIC_API.md`。

**T08b #1329 文档候选。** 来源基准：`v0.10.2@51dadcbbd31baf612507703ad389a255a8704462`，位于 T07b #1328 R2 PASS/merge 之后。本文不是 Release Qualification 回执；在撰写时，T09 外部安装与 R01 文档命令执行状态为 `NOT_RUN`。

## 安装后/公开的包导出

已发布的 `package.json` exports map 暴露：

| 包 | 根导出 | 附加公开子路径 |
| --- | --- | --- |
| `@kaicreator/domain-harness-contracts` | ABI/摘要（digest）/错误/身份工具与 `V10BuiltApp` / selector 类型 | 无 |
| `@kaicreator/domain-harness-build` | `buildV10App`、`projectSelectedComponents` 与 producer 类型 | 无 |
| `@kaicreator/domain-harness-microkernel` | `load`、`DomainApp`、公开错误/类型 | `./host-seam`（仅限受信任的 Host bootstrap API） |
| `@kaicreator/domain-harness-host-node` | `openSqliteCasStore`、`InMemoryCasStore`，以及 durable/memory/deployment/observer 工具 | 无 |

Node 引擎范围 `>=24.0.0`，真正的验证只在 Node24。四个选定包在发布前均为 `0.10.2-rc.0`。真实的 `npm pack` 文件清单与 `./host-seam` 入口/d.ts 已在 T07b 验证过；但这**不能**证明一次新的外部 Tiny/Rich 运行时安装。

`@kaicreator/domain-harness-compiler` 与其他旧 workspace 都是**私有**的。它们的遗留 `./v10build`、`./v10shadow`、`./v10meta`、payload 别名与私有 `dist` 路径都不是公开的。不要给新的 producer 添加遗留 Compiler 依赖。1.0 之前不承诺任何跨版本兼容。

## 实际的运行时签名

```ts
import {
  load,
  type DomainApp,
  type LoadAppOptions,
  type V10ScopedSubscriptionEvent,
  type V10Subscription,
} from '@kaicreator/domain-harness-microkernel';
import type { V10BuiltApp } from '@kaicreator/domain-harness-contracts';

const runtime: DomainApp = await load(prebuiltApp as V10BuiltApp, options as LoadAppOptions);
const receipt = await runtime.send(intent);
const snapshot = await runtime.query(selector);
const snapshots = await runtime.query([selectorA, selectorB]);
const observer: V10Subscription = await runtime.subscribe(selector, (event: V10ScopedSubscriptionEvent) => {
  // Only { kind, occurrenceId, target, snapshot? }; no raw receipts or K keys.
});
observer.unsubscribe();
runtime.stop();
```

`prebuiltApp`、`options`、`intent` 与 selector 都是示意性的**应用提供**值，不是可独立执行的示例。`LoadAppOptions` 要求 `store: V10DocStore`，并可选持有受信任的 `queryAuthority`、`deploymentIdentity`、`tenantId`、`deploymentRoot` 或 `now`。facade 的自有键恰好是 `send`、`query`、`subscribe`、`stop`。`stop` 是幂等的。Query/subscription 的权威必须来自真实的 Host 选定 caller/target 证据；调用方无法伪造 principal。

Host bootstrap 可以为这个显式有界的集成，从 `@kaicreator/domain-harness-microkernel/host-seam` 导入 `activateV10App` 与只读身份 helper。**该子路径是 API 卫生安排，不是安全能力。** K 的持久文档与 permit 仍然是权威。

## BUILD 与 Component producer projection

```ts
import { buildV10App, projectSelectedComponents } from '@kaicreator/domain-harness-build';

const projection = projectSelectedComponents(componentDeclarations, alreadySelectedModules);
const prebuiltApp = buildV10App({
  ...buildOptions,
  modules: [...coreSelectedModules, ...projection.modules],
});
```

上文的输入必须是已密封、本地选定且经过校验的；`projection` 不会发明新的模块字节，也不会授权未选定的 feature。受支持的编写入口是：选定的 Standard 语义 feature、Kernel advisory hook 与 Capability `package-operation` Tool。通用 Business 事件 Hook、隐式的 helper→Tool 转换、由元数据推断的 remote/system transport、同一模块内混合的 effect 权限，以及未选定的导出，都是**不支持 / 类型化拒绝（typed refusal）**。不存在新的运行时 Component dispatcher。

K Primary 独占 State、Admission、Journal、Effect、UNKNOWN 与 Replay。S Primary 拥有解释/派发；B/C 是 Domain Package。Host 拥有实际的持久化/CAS 操作，但不拥有提交业务状态的决定权。Microkernel 与 Host 都不 import BUILD，连 type-only import 也不行。

## 类型/物理证据边界

类型 import 必须从公开根与唯一的公开 `./host-seam` 导出解析。编译期接受一个符号，不等于 tarball 或执行行为的证明。最终版本必须运行精确的 Node24 clean-installed producer/Tiny/Rich 旅程以及一次 deep-import 拒绝；见 `docs/guides/V0102_R01_DOC_COMMANDS.md`。

**本文不做出任何如下声明：允许 source/深层分发 import、已发布 registry 安装、支持 Node22、R01 PASS，或 `main` 已发布。**
