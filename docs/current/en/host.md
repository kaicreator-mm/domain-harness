# DomainHarness v0.10.2 — Host and Tiny/Rich

[Documentation index](index.md) · [中文版本](../zh-CN/host.md)

## Host owns physical ports, not K policy

Host offers physical document access, atomic CAS, optional native SQLite and effect adapters. The selected **K Primary** independently owns admission, commit decisions, Journal, Replay, permits and UNKNOWN. `load(app,{store,...})` receives an actual application-supplied store, not an automatically installed global DB.

## Choose a profile

| Usage | Choice | Caveat |
| --- | --- | --- |
| Small single-process journey | **Tiny** | Example plain-file store is **single-process / single-writer**, not cross-process CAS |
| Concurrent writers + restart | **Rich** | Node Host `openSqliteCasStore`, real SQLite/WAL/transactions |
| Custom Host database | Implement a physical `V10DocStore` | Prove conditional CAS; do not move K policy into Host |
| Volatile development case | Optional in-memory Host | Not durable/restart-safe |

Node Host `better-sqlite3` is an **optional peer**, required for the selected SQLite adapter only. Node24 is the physically qualified line.

## Common mistakes
- Treat `./host-seam` as a security token: **wrong**, it is an exported trusted bootstrap API.
- Use the Tiny plain-file sample for concurrent processes: **unsupported**.
- Dispatch C external effects without K permit: **wrong**; permitless negatives require **zero provider dispatch**.
- Treat UNKNOWN as success or blindly retry a non-idempotent effect: **wrong**.

Technical references: [Host guide](../../guides/V0102_HOST_INTEGRATION.md), [Tiny/Rich](../../guides/V0102_TINY_RICH.md), [Host source](https://github.com/kaicreator-mm/domain-harness/blob/v0.10.2/packages/host-node/src/index.ts).

---

**Version:** immutable tagged runtime `cee14399d9d0af4e20e34b9111861b16a465b690`. RQ **CONDITIONAL** (Full `EXIT1`, root `NOT_RUN` retained). This is post-release explanatory documentation, not a changed ABI.
