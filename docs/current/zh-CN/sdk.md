# DomainHarness v0.10.2 · SDK API

[文档首页](index.md) · [English version](../en/sdk.md)

## 公开包（Node24）

| 用途 | npm package 名称 | 边界 |
| --- | --- | --- |
| 类型/错误/ABI | `@kaicreator/domain-harness-contracts` | 共享契约 |
| BUILD 生产者 | `@kaicreator/domain-harness-build` | `buildV10App`、`projectSelectedComponents`；**不进入 runtime** |
| Microkernel | `@kaicreator/domain-harness-microkernel` | `load`；`send/query/subscribe/stop` |
| 可选 Node Host | `@kaicreator/domain-harness-host-node` | CAS/SQLite、可选业务物理端口 |

## Runtime API（类型示意，不是独立可运行程序）

```ts
import { load, type DomainApp, type LoadAppOptions }
  from '@kaicreator/domain-harness-microkernel';
import type { V10BuiltApp, V10PublicIntent, V10ScopedSnapshotQuery }
  from '@kaicreator/domain-harness-contracts';

declare const app: V10BuiltApp;              // BUILD 产物
declare const options: LoadAppOptions;       // 应用 Host 提供
declare const intent: V10PublicIntent;       // 真实业务输入
declare const selector: V10ScopedSnapshotQuery; // 明确业务目标

const runtime: DomainApp = await load(app, options);
const receipt = await runtime.send(intent);
const answer = await runtime.query(selector);
const several = await runtime.query([selector]);
const sub = await runtime.subscribe(selector, e => {
  // e 只有 kind / occurrenceId / target / 可选 snapshot
});
sub.unsubscribe();
runtime.stop(); // 同步且幂等
```

`LoadAppOptions` 必须有 `store: V10DocStore`，可附带 `queryAuthority`、`deploymentIdentity` 等。Query/Subscribe 必须来自真正可信的 Host 调用者权限；用户传入字段不能伪造授权。错误类型含 `V10BuildError`、`V10ActivationError`、`V10ExternalEffectError`、`V10PortDeniedError`、`V10MultiBQueryError`。公开错误会去除敏感 Host 细节。

**限制：** `./host-seam` 为信任 Host 的公开 bootstrap 子路径，但它本身不是权限；旧 Compiler、私有 `src/dist` 深路径不是 SDK API；不代表 registry 已发布。真实示例位于 `examples/v0102-package-authoring/`。参照 [原始 API 文件](../../manual/V0102_API_CHEATSHEET.md) 与 [实际源码](https://github.com/kaicreator-mm/domain-harness/blob/v0.10.2/packages/microkernel/src/domain-app.ts)。

---

**版本：** 不可变 Tag `cee14399d9d0af4e20e34b9111861b16a465b690`；RQ 为 **CONDITIONAL**，保留 Full `EXIT1` 与 root `NOT_RUN`。本文档仅用于发布后说明，不改变 SDK ABI。
