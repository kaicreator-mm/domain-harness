# @kaicreator/domain-harness

DomainHarness v0.11.x 是**嵌入 Domain App 的单一 SDK 产品**。Boot 位于 Package 外，KDP 是稳定 Kernel 部分；每个 App 从已有多文件 SDK/Business Domain Packages 中选定所需能力。不引入 Forge、Package Generator、独立的 BUILD 产品或第二 Runtime。

## 唯一安装入口与公共 API

Consumer **只安装一个公开产品 `@kaicreator/domain-harness`**。正常的 npm 传递依赖（Contracts、Microkernel）由 SDK 自动管理；无需也**不得要求 Consumer 显式安装 `@kaicreator/domain-harness-build`**。

- `@kaicreator/domain-harness/runtime`：运行中的 Domain App 使用；只导出 Contracts 与 Boot/KDP，不加载 Package 组合功能。依赖信任与已锁定资源由 Boot 执行。
- `@kaicreator/domain-harness/composition`：同一 SDK 内置能力，直接选择、验证、封存**现成的 Domain Packages**，提供 `buildApp`、构建错误和资源 digest。无需安装第二个 BUILD 包，不负责生成 Domain Package。
- `@kaicreator/domain-harness`：相同 SDK 的统一公共入口，可以访问运行和组合功能。

```js
import { boot } from '@kaicreator/domain-harness/runtime';
import { buildApp } from '@kaicreator/domain-harness/composition';

// 两项能力都来自同一个已安装的 @kaicreator/domain-harness。
```

组合的内部实现仍由 Monorepo `tooling/build/src` 持有，经 SDK 的构建步骤**直接打包进 `dist/composition.js`**，构成**单一对外交付产物**。内部 BUILD 仅为实现阶段，不是单独可安装的产品。构建工具 `esbuild` 仅属于仓库开发环境；`ajv`、`typescript` 等所需实现随组合模块封入 SDK 的发布制品，不要求 Consumer 再安装它们。导入 `/runtime` 不求值组合代码。

如果未来需要进一步优化 SDK tarball 的组合模块体积，可以在保持单 SDK 对外合同的前提下改进内部模块组织；**不能**重新建立外部 BUILD Peer、第二 Package Generator 或独立 Assembly Service。

## 验收范围

当前外部 clean-packed Consumer 在仓库未发布 registry 时，从单 SDK 产物及其 Contracts/Microkernel 内部依赖 tarball 安装，验证仅三个受控 tarball、无 `-build` 包/TypeScript/Ajv 外部安装、实际 `/runtime` 与 `/composition` 都可用、统一包根等价与原有 Boot/Function/Workflow 正反测试。正式发行后 Consumer 只需声明 `@kaicreator/domain-harness` 一项**直接依赖**，npm 负责它的普通传递依赖。

## 阅读入口

[源码逻辑与完整调用流程](../../docs/architecture/DOMAIN_HARNESS_V0110_CODE_AND_CALL_FLOW.md) · [Package/SDK 分层](../../docs/specs/DomainHarness_v0.11.x_DOMAIN_HARNESS_SDK_PACKAGE_FILES.md)
