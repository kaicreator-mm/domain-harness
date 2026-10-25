# v0.10.2 clean-consumer integration fixture

This folder contains the historical T11 Tiny/Rich physical scenario: BUILD a sealed K/S/B/C App, pack, clean-install separate consumers, execute real SQLite/CAS/receipt/replay cases, and inspect the ESM resolution graph.

**Important version boundary:** The old T11 hand-run instructions used the now-private `@kaicreator/domain-harness-compiler` `/v10build` and old `@kaicreator/domain-harness` tarball graph. T07b #1328 retired those public exports in favor of four selected packages. **Do not copy the old install recipe into a v0.10.2 consumer.**

The fixture code has since begun migrating to `@kaicreator/domain-harness-contracts`, `@kaicreator/domain-harness-build`, `@kaicreator/domain-harness-microkernel/host-seam` and `@kaicreator/domain-harness-host-node`; T09 #1330 owns the final *real installed* conformance and can make required code-only corrections without changing this README. In particular the old Compiler/Runtime compatibility install closure is **not** by itself a valid Tiny release product.

## Version candidate execution entry

From the exact candidate repo root, on Node24 with installed dependencies:

```sh
npm ci
npm run build
node --import tsx --test tests/integration/v010-clean-consumers/clean-consumers.test.ts
```

This is a requested T09 executable test, **not** a claimed PASS at the final SHA. If this suite still assumes the retired Compiler public exports, it must fail and be repaired in T09; never bypass the assertion, silently skip a consumer, import a private `dist` path, or assume a registry has unpublished `0.10.2-rc.0` packages.

T09 must save actual packed artifact hashes, isolated `node_modules` and lockfile closure, Tiny send/query/replay/conflict and governed subscribe/stop, Rich file-backed SQLite/restart/UNKNOWN/effect negatives, two-B scoped refusal, and external producer evidence. T08b owns all example README files, including the separate external-producer README. R01 owns the **one-time** final docs-command replay and full/hidden/critical regression.

See [Tiny/Rich guide](../../docs/guides/V0102_TINY_RICH.md) and [R01 docs command inventory](../../docs/validation/v0.10.2/T08B_R01_DOC_COMMANDS.md). `main` stays HOLD.
