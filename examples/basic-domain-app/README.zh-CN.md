# DomainHarness v0.11.0 Basic App — 全新外部安装验收示例

本示例面向 Package/Element 作者，真实执行 v0.11.0 Element-First SDK；不包含第二套 Runtime、Kernel、BUILD、Router、App Init 或 Effect 引擎。

## Consumer 编写的领域结构

- 一个零 Function 知识 Element、一个双 Function 规则 Element 和一个双 Function 业务 App Element，覆盖多种 contentKind 与合法 semanticRelations 环。
- 一个 Package 持有多个 Element；另一个 Package 显式 import，并通过安装后的 ESM export 真正调用前一个 Package 的公共 Function。
- Kernel/SDK/Business 各恰好一个 Primary，每层各一个 Extension，以及一个被封装的 Hook contribution。
- 由 selected 结构化规则驱动直达 Function 的 POS/NEG/UNKNOWN。保持实现代码不变而交换规则字节，会同时改变 exact Lock 和实际行为。

Consumer 只使用 canonical 公共 SDK：

```js
import {
  buildApp,
  boot,
  canonicalJson,
  contentDigestOf,
} from '@kaicreator/domain-harness';
```

四个真实 npm tarball 提供 SDK、contracts、BUILD 与 KDP；业务 Domain Package 由 consumer 本地 authored 并复制到外部 installRoot。选定实现、受信安装记录、Boot/KDP 校验阶梯、Package 自有 Element.Init、READY 前已选 Function 真实调用、inspect 与逆序 Exit 均在该仓库外新目录中执行。旧可执行 App API 不属于本示例。

## 执行完整验收路径

在 Node.js 22.12+ 检出中运行：

```bash
node examples/basic-domain-app/verify-clean-install.mjs
```

驱动会：

1. 构建当前精确源码，分别打包公共 SDK、Contracts、BUILD、Microkernel；
2. 读取真实 tarball 字节，检查版本、依赖与 canonical 文件围栏；
3. 在仓库外新建空目录并安装四个 tarball 的绝对路径；
4. 检查安装 realpath，拒绝 workspace、symlink 或源码路径逃逸；
5. 在外目录运行 `consumer.mjs`；
6. 在外部证据目录增量写入 `driver-events.ndjson`、`consumer-events.ndjson` 与最终结果 JSON。

通过 `DH_T05_NPM_REGISTRY` 选择第三方传递依赖的 registry/缓存，通过 `DH_T05_EVIDENCE` 指定证据目录。全程不执行 `npm publish`。

AC01–AC10 结果区分本路径实际执行的断言与复用的上游 contracts/BUILD/runtime 焦点证据。本结果属于候选验证，不代表 npm 正式发布，也不声明与旧可执行 App ABI 兼容。
