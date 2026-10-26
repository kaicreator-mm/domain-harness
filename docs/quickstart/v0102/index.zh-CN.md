# DomainHarness v0.10.2 快速上手 —— 外部干净消费者

> 语言：中文。英文对应文档：`index.md`。

读者：首次安装已发布版 DomainHarness v0.10.2 的消费方。本文只使用**已文档化的公开导出** —— 即下面的四个包根；深层 `src/`/`dist/` import 不是受支持的用法。

发布状态：v0.10.2 已合并进 `main` 并打 tag `refs/tags/v0.10.2`;其发布验证结论为 **CONDITIONAL(有条件合格)** —— 依赖它之前先读 `../../validation/v0.10.2/RELEASE_QUALIFICATION.md`。

## 1. 安装精确制品

没有 npm 发布；以 exact-SHA git 依赖 + `&path:` 子目录形式消费(pnpm 支持该形式 —— npm 不支持 git 子目录依赖)。使用真实 Node24(包声明 `engines.node >=24.0.0`;Node24 是唯一经过物理验证的通道)。

```sh
pin=cee14399d9d0af4e20e34b9111861b16a465b690   # refs/tags/v0.10.2 解析到该提交

pnpm add "github:kaicreator-mm/domain-harness#$pin&path:packages/contracts" \
          "github:kaicreator-mm/domain-harness#$pin&path:tooling/build" \
          "github:kaicreator-mm/domain-harness#$pin&path:packages/microkernel"
# 可选 Rich Host(真实 SQLite CAS / durable 端口):
pnpm add "github:kaicreator-mm/domain-harness#$pin&path:packages/host-node"
```

把你验证时所用的精确 SHA(以及四个制品的 tarball/lock 来源)记录进自己的集成证据。`better-sqlite3` 是 Host 包的可选 peer dependency,只有走真实 SQLite 路径才需要。

## 2. 认识两个公开接口面

```ts
// Producer 进程 —— 只用 BUILD。Tiny/Rich 运行时永不 import BUILD:
import { buildV10App, projectSelectedComponents } from '@kaicreator/domain-harness-build';
const prebuiltApp = buildV10App({
  // sealed K/S/B/C 模块字节/摘要、路由、hardBudget —— 见编写指南
}); // 产出受信任的不可变纯数据 App

// 运行时进程 —— 消费预构建 App:
import { load } from '@kaicreator/domain-harness-microkernel';
const runtime = await load(prebuiltApp, { store /* V10DocStore */ });
const receipt = await runtime.send(intent);
const snapshot = await runtime.query(selector);
const subscription = await runtime.subscribe(selector, event => observe(event)); // 异步
subscription.unsubscribe();
runtime.stop(); // 同步、幂等
```

- `./host-seam`(`@kaicreator/domain-harness-microkernel/host-seam`)是唯一额外的公开子路径 —— 面向 operator 进程的受信任 Host bootstrap API,**不是**安全能力。
- `buildOptions`、`store`、`queryAuthority`、`intent` 与 selector 都是**你的应用**显式提供的输入，绝不是 SDK 全局量。

## 3. 进程模型

1. **外部 producer**(离线)：安装选定的 BUILD + Contracts 与精确的 Domain Package payload;用 `buildV10App` 密封 App;把纯数据 App 序列化为已安装的 App 包。
2. **Tiny** 运行时：Contracts + Microkernel + 精确选定的 K/S/B/C payload;使用应用选定的 `V10DocStore`(内存或你自己的实现)。
3. **Rich** 运行时：额外加入 `@kaicreator/domain-harness-host-node`,获得真实 SQLite CAS/durable 端口。

运行时从不发现、编译或重新选择包。存在多个 Business 时，每个 selector 都必须识别并授权自己的目标。

## 4. 这些事会被(有意)拒绝

- 把调用方伪造的 principal/grant 当作运行时权威 —— 只有 Kernel Primary 决定准入/effect eligibility。
- 任何深层 `src/`/`dist/` import,或私有的遗留 `domain-harness{,-compiler,-node,-expo}` shim。
- 未选定的包/feature;通用 Business 事件 Hook;隐式的 helper→Tool 转换。
- 相同 `messageId` 携带冲突 intent/input 重发(类型化冲突，effect 绝不生效两次)。
- Node22 或其他未验证的 Node 大版本。

类型化拒绝字面量目录见 `docs/architecture/V010_TYPED_REFUSAL_LITERAL_CATALOG.json`;BUILD 侧错误族包括 `BUILD_INPUT_INVALID`、`BUILD_GRAPH_INVALID` 与 `V10_EXPORT_CONTRACT_REFUSED`。

## 5. 运行现成示例

- `examples/v0102-package-authoring/authoring-template-check.mjs` —— 最小编写模板(S 非 Tool Feature + 私有 B helper + 只读/外部 effect 的 C 模块)从公开 tarball 密封、打包、clean-install 并执行，含类型化负例。
- `examples/v0102-external-producer/producer.mjs` —— 物理执行过的外部 producer(只走公开根)。
- `examples/v010-clean-consumer/` —— Tiny/Rich clean-consumer fixture(其旧的面向 compiler 的安装命令已被本页取代)。

## 6. 接下来读什么

1. `../../sdk/V0102_PUBLIC_API.md` —— 精确的公开 API 与包/ABI 地图。
2. `../../guides/V0102_PACKAGE_AUTHORING.md` 与 `../../guides/SUPPORTED_EXTENSION_POINTS.md` —— 编写规则。
3. `../../migration/MIGRATING_V0101_TO_V0102.md` —— 从 v0.10.1 迁移。
4. `../../validation/v0.10.2/RELEASE_QUALIFICATION.md` —— 本发布「CONDITIONAL」结论的含义。
