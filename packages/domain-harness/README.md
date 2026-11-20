# @kaicreator/domain-harness

DomainHarness v0.11.0 Element-First public SDK — the ONE canonical public entry (L2 §8.3).

The package root `.` is the v0.11.0 canonical SDK: a pure composition of the real frozen contracts (`@kaicreator/domain-harness-contracts/v011`), the canonical BUILD (`buildV011App` from `@kaicreator/domain-harness-build`) and the Boot/KDP/DomainApp runtime (`boot` / `bootstrap` from `@kaicreator/domain-harness-microkernel`). It adds no second Runtime, Kernel, BUILD, App Init, Router, workflow or Function dispatcher.

```ts
import {
  buildV011App,   // canonical BUILD → the exact Lock
  boot,           // minimal Boot (pin/record/bytes verification ladder)
  contentDigestOf,
  type DomainAppDescriptor,
  type DomainAppLock,
  type FunctionOutcome,
} from '@kaicreator/domain-harness';
```

## Release facts / 发行事实

- Version 0.11.0 ships **only `dist/v011`**: the packed tarball contains the canonical v011 entry plus this README. The legacy v0.2–v0.10 executable App ABI is **not shipped** — old subpath entries (e.g. `./legacy`, `./v2`, `./v7`) stay in the exports map for workspace compatibility but resolve to files that are absent from the tarball (`ERR_MODULE_NOT_FOUND` fence).
- 本包 0.11.0 的发行物只包含 `dist/v011` 与本文档：legacy 可执行 App ABI 不进入 tarball。exports map 中的旧子路径（如 `./legacy`、`./v2`、`./v7`）仅为 workspace 兼容保留，在发行物中不可达（行为围栏）。
- **No 0.10.x compatibility** is provided or claimed; there is no parity verification with the old App ABI. / 不提供、也不宣称任何 0.10.x 兼容，不做旧 ABI parity 验证。
- Requires Node.js >= 24 (single verified target `node24-esm/1`). / 需要 Node.js >= 24（唯一已验证目标 `node24-esm/1`）。
- Runtime dependencies are exactly `@kaicreator/domain-harness-contracts`, `@kaicreator/domain-harness-build` and `@kaicreator/domain-harness-microkernel`, all at the same 0.11.0 version — zero third-party runtime dependencies (legacy third-party packages stay workspace devDependencies only).
- `@kaicreator/domain-harness-contracts` carries a scoped exception: its `.` remains the legacy **inert** type/constant face; `./v011` is the canonical 0.11 contracts entry.

## Legacy workspace surface / Workspace 内的 legacy 面

Inside this monorepo workspace the legacy v0.2–v0.10 surface remains available unchanged through the explicit `./legacy` subpath (the old root index re-exporting `public-v2`/`public-v3`/`public-v4`/`public-v7`). Legacy semantics are reference-only; no migration, parity or compatibility work is performed on it.
在 monorepo workspace 内，legacy v0.2–v0.10 面经显式 `./legacy` 子路径原样可用（旧根 index 继续 re-export `public-v2`/`v3`/`v4`/`v7`）。legacy 语义仅作参考，不做迁移、parity 或兼容工作。
