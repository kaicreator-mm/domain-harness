# DomainHarness v0.10.2 · 快速开始

[文档首页](index.md) · [English version](../en/quickstart.md)

## 1. 适用环境
以已发布的 **Node24** Profile 为准，不要求 Ubuntu/Windows 或特定内存配置。Git Tag 并不等于 npm registry 已发布；在 tagged 源码中四个公开工作区的版本号仍是 `0.10.2-rc.0`。

## 2. 从源码检查最小示例

```sh
git clone https://github.com/kaicreator-mm/domain-harness.git
cd domain-harness
git checkout v0.10.2
node --version            # 应使用 Node 24
npm ci
npm run build
node examples/v0102-package-authoring/projection-smoke.mjs
```

此命令验证 BUILD Component 静态选型，不是完整业务运行。要查看真实、已封装制品与消费者闭环，可选：

```sh
node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts
```

这只是**供用户执行的命令**，不是本文档新执行的验收回执；执行后必须记录真实 EXIT。旧 `docs/guides/V0102_R01_DOC_COMMANDS.md` 的 `NOT_RUN` 属于编写当时历史状态。

## 3. 核心使用流程
1. 在**独立 BUILD 生产者**选择精确 K Primary、S Primary、一个或多个 B 以及需要的 C/S Feature，校验 Module bytes、ABI、导入闭包、Intent/Operation 路由。
2. `buildV10App` 生成封闭、可信的纯数据 App（不是运行时编译）。
3. 用户应用提供 `V10DocStore`、真实调用者的 `queryAuthority`、部署身份，运行时调用 `load(prebuiltApp, options)`。
4. 通过 `send`、`query`、异步 `subscribe` 和 `stop` 使用；K 掌管持久化决策/幂等/副作用许可。
5. 并发持久化使用显式选择的 Rich SQLite Store；Tiny 示例文件 Store 只适合单写者。

下一步：[SDK API](sdk.md) · [Package 编写](packages.md) · [Host](host.md)。不要复制 API 伪代码里的 `prebuiltApp` 等未定义变量来直接运行。

---

**版本：** 不可变 Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；RQ 为 **CONDITIONAL**，保留 Full `EXIT1` 与 root `NOT_RUN`。本文档仅用于发布后说明，不改变 SDK ABI。
