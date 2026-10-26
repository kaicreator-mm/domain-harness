# DomainHarness v0.10.2 — Migration

[Documentation index](index.md) · [中文版本](../zh-CN/migration.md)

## Minimal migration checklist

| Legacy path | v0.10.2 destination |
| --- | --- |
| Private Compiler `/v10build` or deep `src/dist` imports | External `@kaicreator/domain-harness-build` |
| Compiler-owned common types | `@kaicreator/domain-harness-contracts` |
| Legacy runtime/Core loader | `@kaicreator/domain-harness-microkernel.load(prebuiltApp, options)` |
| Implicit local database/native store | Explicit Host ports; Rich SQLite only when real multiprocess CAS needed |
| Unscoped event/receipt observation | Authorized async `subscribe(selector,listener)` with redacted events |

Pin both the downstream application and SDK exact SHA. Record selected K/S/B/C Package identities and one existing Critical Journey. Migrate in order: **producer BUILD → sealed App → installed runtime → business journey → typed negative proofs**. A TypeScript compile pass alone does not validate the packed runtime closure. Do not introduce a pre-1.0 compatibility layer for retired private APIs without a separate product reason.

After migration verify idempotent Replay, changed-input message conflict, Business query target authorization, effect permit/UNKNOWN and stop lifecycle. The [old migration record](../../migration/MIGRATING_V0101_TO_V0102.md) contains candidate-era `NOT_RUN` facts from its authoring date; it is not the current RQ verdict.

---

**Version:** immutable tagged runtime `cee14399d9d0af4e20e34b9111861b16a465b690`. RQ **CONDITIONAL** (Full `EXIT1`, root `NOT_RUN` retained). This is post-release explanatory documentation, not a changed ABI.
