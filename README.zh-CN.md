# DomainHarness

> 语言：中文。英文对应文档：`README.md`。

DomainHarness 是一个 **Domain Package(领域包)运行时 SDK**：极简的 Microkernel（微内核），领域行为由 Domain Package 自有。当前是 **v0.10.2 开发候选版**，**不是**已通过 Release Qualification 的发布，也不代表 `main` 已经包含它。

## v0.10.2 职责边界（ownership）

| 公开 npm workspace | 拥有 | 不拥有 |
| --- | --- | --- |
| `@kaicreator/domain-harness-contracts` | 共享 ABI、canonical hash 与类型化契约 | 业务准入或外部副作用 |
| `@kaicreator/domain-harness-build` | 离线 BUILD、静态 sealed K/S/B/C 选择、Component producer projection | Runtime/Host 执行 |
| `@kaicreator/domain-harness-microkernel` | `load(app, options)`、公开的 `send/query/subscribe/stop` 与受信任的 `./host-seam` | K state、journal、replay 或 effect policy |
| `@kaicreator/domain-harness-host-node` | 可选的 Node Host CAS/SQLite 与受治理的 adapters | BUILD 或 K 自有的 policy |

Kernel Primary、Standard Primary 及其扩展都是 **Domain Package**，而不属于 Microkernel 的实现代码。受信任的 producer 在加载之**前**就密封（seal）选定的 App；运行时从不发现包，也从不重新编译它们。

```text
External producer: selected Domain Packages -> BUILD -> sealed plain-data App
                                                      |
Runtime: optional Host ports -> Microkernel.load(App) -> public Facade
                                                      |
                         Kernel Primary owns state/admission/journal/effects
                         Standard Primary and Business Packages own domain logic
```

**v0.10.2 Node policy：** 包声明 `engines.node >=24.0.0`；Node24 是唯一经过物理验证（physically qualified）的通道。这些是 monorepo 的开发产物，默认不应当作已发布到 registry 的依赖。

## 公开 SDK 面（当前 v0.10.2 候选）

**仅限 producer 进程 —— Tiny/Rich 运行时从不 import BUILD：**

```ts
import { buildV10App } from '@kaicreator/domain-harness-build';
const prebuiltApp = buildV10App(buildOptions); // emit as trusted plain-data App
```

**另一个独立的运行时进程，消费预构建的 App：**

```ts
import { load } from '@kaicreator/domain-harness-microkernel';
const runtime = await load(prebuiltApp, { store, queryAuthority });
const receipt = await runtime.send(intent);
const answer = await runtime.query(selector);
const subscription = await runtime.subscribe(selector, event => observe(event));
subscription.unsubscribe();
runtime.stop();
```

上文中的 `buildOptions`、`store`、`queryAuthority`、`intent`、`selector`，以及 `prebuiltApp` 在 producer 与运行时之间的传递，都是显式提供的应用输入，而不是 SDK 提供的全局量。`subscribe` 是异步的，返回一个带 `unsubscribe()` 的对象；`stop()` 是同步且幂等的。绝不要把调用方伪造的 principal/grant 当作运行时权威。只有 Kernel Primary 决定准入（admission）与 effect eligibility。

只有这些包根是可分发的。旧的四个 `domain-harness{,-compiler,-node,-expo}` workspace 是私有的遗留测试 shim；已退役的 Compiler `/v10*` 公开导出已被移除。深层 `src/` 或 `dist/` import 不是 SDK 契约。

## 从这里开始

- [公开 API、包/ABI 与 Component 地图](docs/sdk/V0102_PUBLIC_API.zh-CN.md)（英文：[V0102_PUBLIC_API.md](docs/sdk/V0102_PUBLIC_API.md)）
- [Package 编写指南](docs/guides/V0102_PACKAGE_AUTHORING.zh-CN.md) 与 [受支持的扩展点](docs/guides/SUPPORTED_EXTENSION_POINTS.zh-CN.md)
- [Tiny/Rich 与外部 producer 指南](docs/guides/V0102_TINY_RICH.zh-CN.md)
- [v0.10.1 → v0.10.2 迁移](docs/migration/MIGRATING_V0101_TO_V0102.zh-CN.md)
- [版本候选命令/验收清单](docs/guides/V0102_R01_DOC_COMMANDS.zh-CN.md)
- [跨版本架构约束](docs/architecture/DOMAIN_APP_CROSS_VERSION_PRINCIPLES.md)（暂无中文版）
- [既有 clean-consumer fixture](examples/v010-clean-consumer/README.md)（T09 正在针对新的公开包图重新验证它）

**本地范围预检（preflight），在 monorepo 根、Node24 下执行：**

```sh
npm ci
npm run build
npm run lint
npm run typecheck
node --import tsx --test tests/compiler/v0102-tarball-inventory.test.ts
```

这些命令只是一份**执行配方**，并不证明它们都已在最终版本 SHA 上运行过。真实的 Tiny/Rich clean install、外部 producer、文档命令执行以及 full/hidden/critical 回归属于 T09/R01。`PR PASS != Release PASS`。在 Release Qualification 完成之前，不允许任何 `main` 集成或打 tag。
