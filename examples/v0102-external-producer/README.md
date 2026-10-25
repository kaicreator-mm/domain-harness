# v0.10.2 independent external producer fixture — T09 / T08b

This README belongs to T08b #1329 under adopted A9 exclusive documentation ownership. The **source and executable fixture** belong to T09 #1330 (separate worktree/PR, no README edits). It must prove a separate producer using only the four permitted selected package roots, the sealed K/S/B/C Domain Package bytes and an external clean install.

## Required physical journey (NOT_RUN here)

1. On Node24 pack the exact selected local workspace artifacts and independent Domain Package payloads (hash every archive). Do not fetch unpublished `0.10.2-rc.0` packages from the registry.
2. Install BUILD + Contracts **in the producer only** and run `buildV10App` to emit a sealed plain-data App.
3. Install the runtime closure **in a separate consumer**, without BUILD, old Compiler, private deep imports or unselected Domain Packages.
4. Exercise actual public Microkernel `load`, `send`, `query`, async `subscribe`, `unsubscribe`, `stop`; Rich additionally exercises selected real SQLite Host where required.
5. Assert physical `node_modules` and `package-lock.json` closure, ESM resolution, negative deep import, missing capability/denied Business/refusal and zero leaked raw receipts.

**Entrypoint/command:** T09 must define and commit its exact executable test entry under `tests/integration/v010-clean-consumers/` before this README can be accepted as executable documentation; do not invent a command path in anticipation. R01 must then execute the concrete command once at the final exact candidate SHA and record exit code, tarball hashes and output.

`DOC_COMMAND_EXECUTION=NOT_RUN`; `MAIN=HOLD`.
