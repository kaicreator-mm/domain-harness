# v0.10.2 independent external producer fixture — T09 / T08b

> **Post-release status (2026-10-26):** The frozen **v0.10.2** source is now **tagged and merged into main**, with R01 #1331 closed and RQ **CONDITIONAL**. See the [final release status](../../docs/release/V0102_RELEASE_STATUS.md). Any wording below such as **candidate**, **NOT_RUN at T08b/T09 authoring**, **main HOLD**, or **not qualified yet** is preserved as an **as-of historical authoring snapshot**, **not the current GitHub state**. Independently reviewed Product 8/8 P0 + 2/2 required P1, exact-SHA Hidden 7/7 PASS and admitted selected CJ/packaging evidence now exist; the actual Full command **EXIT1** and current-source `test:root NOT_RUN` remain disclosed under the exact-SHA-only Owner-approved exception. This note does not rewrite old test receipts or alter the immutable tagged product.

This README belongs to T08b #1329 under adopted A9 exclusive documentation ownership. The **source and executable fixture** belong to T09 #1330 (separate worktree/PR, no README edits). It must prove a separate producer using only the four permitted selected package roots, the sealed K/S/B/C Domain Package bytes and an external clean install.

## Required physical journey (NOT_RUN here)

1. On Node24 pack the exact selected local workspace artifacts and independent Domain Package payloads (hash every archive). Do not fetch unpublished `0.10.2-rc.0` packages from the registry.
2. Install BUILD + Contracts **in the producer only** and run `buildV10App` to emit a sealed plain-data App.
3. Install the runtime closure **in a separate consumer**, without BUILD, old Compiler, private deep imports or unselected Domain Packages.
4. Exercise actual public Microkernel `load`, `send`, `query`, async `subscribe`, `unsubscribe`, `stop`; Rich additionally exercises selected real SQLite Host where required.
5. Assert physical `node_modules` and `package-lock.json` closure, ESM resolution, negative deep import, missing capability/denied Business/refusal and zero leaked raw receipts.

**Entrypoint/command:** T09 must define and commit its exact executable test entry under `tests/integration/v010-clean-consumers/` before this README can be accepted as executable documentation; do not invent a command path in anticipation. R01 must then execute the concrete command once at the final exact candidate SHA and record exit code, tarball hashes and output.

`DOC_COMMAND_EXECUTION=NOT_RUN`; `MAIN=HOLD`.
