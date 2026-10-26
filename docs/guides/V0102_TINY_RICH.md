# DomainHarness v0.10.2 — Tiny / Rich and external producer

> **Post-release status (2026-10-26):** The frozen **v0.10.2** source is now **tagged and merged into main**, with R01 #1331 closed and RQ **CONDITIONAL**. See the [final release status](../release/V0102_RELEASE_STATUS.md). Any wording below such as **candidate**, **NOT_RUN at T08b/T09 authoring**, **main HOLD**, or **not qualified yet** is preserved as an **as-of historical authoring snapshot**, **not the current GitHub state**. Independently reviewed Product 8/8 P0 + 2/2 required P1, exact-SHA Hidden 7/7 PASS and admitted selected CJ/packaging evidence now exist; the actual Full command **EXIT1** and current-source `test:root NOT_RUN` remain disclosed under the exact-SHA-only Owner-approved exception. This note does not rewrite old test receipts or alter the immutable tagged product.

**T08b source guide, candidate not yet released.** Independent clean-install conformance is T09 #1330; one final execution of mandatory README/SDK/guides commands is R01 #1331.

## Three processes/closures, not one bundled application

1. **External producer** (BUILD-only): install the selected BUILD + Contracts tarballs and the exact Domain Package payloads; call `buildV10App` with sealed K/S/B/C modules. The output is a trusted immutable plain-data App. `projectSelectedComponents` is optional authoring metadata projection, not a second runtime.
2. **Tiny** (runtime-only closure): Contracts + Microkernel + exact selected Kernel Primary/Standard Primary/Business/Capability payloads. **No runtime BUILD, old Compiler, optional host SQLite, unselected S features, or deep file imports.** Use an application-selected DocStore; absence of a native SQLite adapter does not remove K's semantics.
3. **Rich** (explicit Host): adds `@kaicreator/domain-harness-host-node` for real SQLite CAS/durable controls, memory, Shadow/Meta/Evidence or CT-02 where actually selected. `better-sqlite3` is an **optional peer dependency at package installation** and required only for the concrete native SQLite path.

Both runtimes consume the same BUILD output format. They do not compile, discover or reselect packages. For Rich with several Businesses, every selector must identify and authorize its target; shared workflowId/instanceKey cannot imply global read authority.

## Contract checks required from T09

- Separate clean producer, Tiny and Rich **install roots**; install from exact local selected tarballs and required selected Domain Packages, not a registry that does not have `0.10.2-rc.0`. Save exact SHA, archive hashes and `package-lock.json` provenance.
- Inspect **both** installed `node_modules` and lock metadata, and inspect runtime ESM resolution. Confirm Tiny excludes BUILD, Compiler, Host-node/SQLite and unselected Domain Packages; Rich imports only admitted Host and selected dependencies.
- Execute actual Tiny send/query, identical message replay, changed-input conflict, governed async `subscribe`, `unsubscribe`, then `stop`. Event is a frozen `{ kind, occurrenceId, target, snapshot? }` and must have no K keys/receipt secrets. Verify post-await authority revocation and stop races.
- Exercise Rich SQLite file-backed CAS, concurrent writer conflicts, restart and UNKNOWN/effect reconciliation, denied Business, and explicit refusal when the driver is missing.
- Execute an external producer-generated App and show no direct runtime→BUILD/Compiler import. A private `src/` or `dist/` deep import **must fail**.
- Distinguish `NOT_RUN`, P0/P1 faults and real passes. No optional fixture may silently skip because the required packed consumer root was absent.

## Monorepo preflight (executable command inventory)

Run from the checked-out `v0.10.2` candidate at **Node24**:

```sh
node --version
npm ci
npm run build
npm run lint
npm run typecheck
node --import tsx --test tests/compiler/v0102-tarball-inventory.test.ts
```

Do **not** present `npm pack --dry-run` as an isolated consumer install. T09 owns the executable clean-packed consumer test and its new external producer fixture; R01 runs the final documentation command inventory and Full/Hidden/Critical once against a frozen candidate. Existing `examples/v010-clean-consumer/README.md` documents the legacy physical scenario but its old compiler-oriented install commands have been superseded.
