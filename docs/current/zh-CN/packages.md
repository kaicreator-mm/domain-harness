# DomainHarness v0.10.2 · Domain Package 开发

[文档首页](index.md) · [English version](../en/packages.md)

## 实际能扩展的能力

| Package | 允许的内容 | 不允许 |
| --- | --- | --- |
| **K Primary** | 唯一 Kernel：State、Admission、Journal、Effect Permit、UNKNOWN、Replay | 第二个 K、Host 自行决定状态 |
| **K Extension** | `kernel-advisory` 只读建议 Hook | 持久化/许可/Effect 越权 |
| **S Primary / S Feature** | 语义、Workflow、Rule、Context 等显式选定模块 | 将任意纯函数自动变成 Tool |
| **B Business** | Intent、业务流程与策略 | 伪造 K 许可和查询身份 |
| **C Capability** | 声明的 `operationId → handler` | 不声明的操作、混合外部 Effect 权限 |

## 推荐开发步骤

1. 明确用户意图与期望操作，判断属于 **S 纯语义**、B 包内 private helper、C 声明的外部 Tool，还是 K advisory；普通函数不因为可调用就应注册为 Tool。
2. 显式选定模块源码、`packageId`、`moduleSha256`、ABI 与合法路由；BUILD 校验全闭包。
3. 对 C Operation 分开只读模块（`externalEffect:false`）与副作用模块（`externalEffect:true`）：这个开关在 v0.10.2 **以模块为单位**，不能给单个 handler 随意改。
4. 使用 `projectSelectedComponents` 把声明映射到**已经选择**的模块，然后交给外部 `buildV10App`；runtime 不再做 BUILD。
5. 用正例＋typed 拒绝负例证明不存在未选模块、缺失 K Permit 零外部发送、错误路由不能装载等问题。

## 已有、可复用的真实代码

- `examples/v0102-package-authoring/projection-smoke.mjs`：轻量投影/拒绝。
- `examples/v0102-package-authoring/authoring-template-check.mjs`：真实 tarball、BUILD、装载、外部副作用许可/拒绝。
- `tests/integration/v010-clean-consumers/clean-consumers.test.ts`：实际 Tiny/Rich 集成。

```sh
node examples/v0102-package-authoring/projection-smoke.mjs
node --import tsx --test tooling/build/tests/component-view.test.ts
```

从 tagged 仓库根目录、Node24 和已构建依赖下执行；本文档不宣称新执行结果。深入参考 [旧版原始 authoring 技术资料](../../guides/V0102_PACKAGE_AUTHORING.md) 和 [扩展表](../../guides/SUPPORTED_EXTENSION_POINTS.md)。

---

**版本：** 不可变 Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；RQ 为 **CONDITIONAL**，保留 Full `EXIT1` 与 root `NOT_RUN`。本文档仅用于发布后说明，不改变 SDK ABI。
