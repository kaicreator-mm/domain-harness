# v0.10.3 — Kernel V10DocStore ↔ Node Host CAS adapter (R0 docs-only candidate)

[中文](HOST_CAS_ADAPTER_R0.zh-CN.md) · [downstream feedback #1394](https://github.com/kaicreator-mm/domain-harness/issues/1394) · [Product Freeze](https://github.com/kaicreator-mm/domain-harness/blob/version/v0.10.3/docs/product/v0.10.3/PRODUCT_FREEZE.md)

> **Docs-only R0 consumer example**, not a new SDK export or independently qualified Node24 installed-consumer proof. L2 is not yet frozen. Use only with a physical Host store that actually implements conditional writes/removes.

## Boundary

- Microkernel `load(app,{store})` accepts the Contracts `V10DocStore`; its `put/remove` conditions are `{kind:'create'} | {kind:'cas',revision}`.
- The Node Host `CasDocumentStore` / `InMemoryCasStore` / `SqliteCasStore` uses `{mustBeAbsent:true} | {mustMatchRevision:number}`.
- Passing a raw Host `InMemoryCasStore` directly to `load(app,{store})` is **not** a type/behavior-compatible substitution. This caused ai-rexform's real `HOST_PUT_CONDITION_REQUIRED` result, rather than proving a bug in the Kernel CAS semantics.

## Minimal typed consumer adapter

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

Use `const store = asV10DocStore(new InMemoryCasStore());` and pass `store` to the selected Microkernel `load(app,{store})`. This remains an ordinary Host/Business helper, **not** a Tool, C Package, new S Feature or Kernel authority. Use a genuinely transactional SQLite CAS backend for durable concurrent writers; in-memory is a bounded test/single-process sample.

## Real acceptance and caveats

1. Empty-key create returns a revision; duplicate create **must fail**, never degrade into unconditional overwrite.
2. Exact current-revision CAS succeeds, stale revision fails without blind retry, overwrite or fake success.
3. Forward `remove` only if the Host physically guarantees a conditional remove. Do not silently impersonate a synchronous `keys()` with Host's asynchronous `list()`.
4. Preserve the direct-wiring negative and its `HOST_PUT_CONDITION_REQUIRED` rather than treating it as a successful K operation. An in-memory test store is not a multi-process production CAS claim.
5. A later Node24 packed external consumer should exercise normal path, duplicate create, stale CAS, optional remove and raw-miswire negative. If no new execution happened, mark `NOT_RUN`; reuse the existing ai-rexform receipt and do not require a v0.10.2 Full/Hidden rerun for this guide.

One corrected downstream mistake does **not** justify another Store abstraction or runtime ABI rewrite. Only if another independent consumer demonstrates repeated confusion should L2 consider a small publicly tested Host factory.

`DOC_PREVIEW=R0; L2_FREEZE=NO; SDK_RUNTIME_CHANGE=NO; PHYSICAL_CLEAN_CONSUMER=NOT_RUN`
