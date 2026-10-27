# v0.10.3 — Kernel DocStore ↔ Node Host CAS 薄适配（R0，仅文档候选）

[English](HOST_CAS_ADAPTER_R0.en.md) · [反馈 #1394](https://github.com/kaicreator-mm/domain-harness/issues/1394) · [版本 Product Freeze](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.10.3/docs/product/v0.10.3/PRODUCT_FREEZE.md)

> **仅供下游试用的文档 R0**：不新增 SDK 导出、不修改 Kernel/Host 运行时、不声称已取得独立 Node24 clean-consumer 验证。v0.10.3 正式 L2 尚未冻结。只在实际 Host 存储支持条件化写入/删除时使用。

## 问题

v0.10.2 已有两种合理但不直接兼容的公开 CAS 数据面：

- Microkernel `load(app,{store})` 需要 Contracts 的 `V10DocStore`，`put/remove` 条件是 `{kind:'create'} | {kind:'cas',revision}`。
- `@kaicreator/domain-harness-host-node` 的 `CasDocumentStore`、`InMemoryCasStore`、`SqliteCasStore` 使用 `{mustBeAbsent:true} | {mustMatchRevision: number}`。
- 下游不能直接将 `new InMemoryCasStore()` 当作 `V10DocStore` 传入；真实 ai-rexform 案例因此触发 `HOST_PUT_CONDITION_REQUIRED`。这是**组合接口误用**，不是已证实的 Kernel CAS 语义错误。

## 可复用的最小适配

```ts
import type { V10DocStore, V10DocWriteCondition } from '@kaicreator/domain-harness-contracts';
import type { CasDocumentStore, CasPutConditions } from '@kaicreator/domain-harness-host-node';

function hostCondition(condition: V10DocWriteCondition): CasPutConditions {
  return condition.kind === 'create'
    ? { mustBeAbsent: true }
    : { mustMatchRevision: condition.revision };
}

export function asV10DocStore(host: CasDocumentStore): V10DocStore {
  return {
    get: (key) => host.get(key),
    put: (key, value, condition) => host.put(key, value, hostCondition(condition)),
    remove: (key, condition) => host.remove(key, hostCondition(condition)),
  };
}
```

用法：`const store = asV10DocStore(new InMemoryCasStore());`，再将 `store` 传入实际选定 Microkernel 的 `load(app,{store})`。此代码是普通下游 Host/B helper，不需要声明 Tool、C Package、S Feature，也不负责 K Admission/Journal/权限。数据库持久化场景使用真正的 Host SQLite CAS 实现，`InMemoryCasStore` 只用于测试或单进程样例。

## 必须保留的实际行为

1. **正常 create：** 空 key 写入产生 revision；重复 create 必须拒绝，不能转成无条件写入。
2. **revision CAS：** 仅 `{kind:'cas',revision:current}` 可成功；过期 revision 必须拒绝，不能自动覆盖、重试或掩盖 CAS 冲突。
3. **remove：** 只有 Host 真正支持条件化删除时才转发；不需要 `keys()` 的情况下不为异步 Host `list()` 伪造同步 `keys()`。
4. **反例：** 直接传 Host `CasDocumentStore` 的形状不匹配应保留真实错误；不要把 `HOST_PUT_CONDITION_REQUIRED` 伪造为 K 成功。不得将单进程 `InMemoryCasStore` 宣称为跨进程安全。
5. **测试证据：** 后续用 Node24 的公共 npm tarball/真实外部消费者对正确适配、重复 create、陈旧 CAS、可选 remove 和直接误接负例分别测试；未执行时记录 `NOT_RUN`，复用 ai-rexform 的已存在实测证据，不重复整版 Full/Hidden。

仅有这一个已经纠正的下游案例时，**无需**修改运行时代码或引入第三套公共 `Store`。若多个独立下游再次复现同一组合错误，再评估是否将此薄适配提升为官方小型 Host factory。

`DOC_PREVIEW=R0; L2_FREEZE=NO; SDK_RUNTIME_CHANGE=NO; PHYSICAL_CLEAN_CONSUMER=NOT_RUN`
