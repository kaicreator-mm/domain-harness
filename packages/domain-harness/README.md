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
- Requires Node.js >= 22.12 (canonical target `node22-esm/1`, also runnable on newer Node majors). / 需要 Node.js >= 22.12（标准目标 `node22-esm/1`，较新的 Node 大版本也可运行）。
- Runtime dependencies are exactly `@kaicreator/domain-harness-contracts`, `@kaicreator/domain-harness-build` and `@kaicreator/domain-harness-microkernel`, all at the same 0.11.0 version — zero third-party runtime dependencies (legacy third-party packages stay workspace devDependencies only).
- `@kaicreator/domain-harness-contracts` carries a scoped exception: its `.` remains the legacy **inert** type/constant face; `./v011` is the canonical 0.11 contracts entry.

## Diagnostics / 日志与故障定位

The core SDK returns typed `BootResult` / `FunctionOutcome` status and error codes rather than writing to `console` or a global logger. The Host owns its own structured event logging. **Never log `reason`, `failure.message`, `unknownReason.message`, or an exception object by default**: those are untrusted diagnostic strings, not redacted fields, and can contain business inputs, local paths or secrets. Use only a trusted, explicitly redacted/allowlisted diagnostic sink when raw details are genuinely needed.

核心 SDK 不依赖全局日志框架或自动打印业务数据。Host 应默认只记录可信的 `event/status/code` 和由 Host 自己生成的关联 ID。**`reason` 是不可信的诊断文本**，可能含有来自业务 App Init、插件或 cleanup 异常的原始错误消息。不可默认记录到生产日志；仅在授权的故障诊断通道中，经过显式字段白名单和敏感数据清理后使用。不要默认记录原始输入、规则、文件路径或凭据。

```js
const result = await boot(pin, context);
if (result.status !== 'BOOTED') {
  hostLogger.warn({
    event: 'domain-harness.boot',
    status: result.status,
    code: result.code,
    // No result.reason: untrusted exception messages can contain secrets.
  });
}
```

**Concrete negative case:** if a selected business App Init throws `new Error('token=example-secret')`, the KDP `result.reason` may include that literal string (including appended cleanup exceptions). The safe Host example above logs only the status/code, so the secret does not reach the default log. Do **not** treat a diagnostic reason as sanitized simply because the outer result is typed.

For an invoked Function, log `kind` and the selected `failure.code` or `unknownReason.code` on non-success; never treat UNKNOWN as FAILED or log the `value` or reason/message payloads by default. A Host-generated correlation ID is safe for tracing; `lockDigest` and `activationId` should be handled under the Host's explicit exposure policy. T05's external clean-install acceptance NDJSON is **test evidence**, not a production logging backend. A failed App Init runs reverse technical cleanup and can append cleanup errors verbatim to its untrusted startup `reason`.

## Legacy workspace surface / Workspace 内的 legacy 面

Inside this monorepo workspace the legacy v0.2–v0.10 surface remains available unchanged through the explicit `./legacy` subpath (the old root index re-exporting `public-v2`/`public-v3`/`public-v4`/`public-v7`). Legacy semantics are reference-only; no migration, parity or compatibility work is performed on it.
在 monorepo workspace 内，legacy v0.2–v0.10 面经显式 `./legacy` 子路径原样可用（旧根 index 继续 re-export `public-v2`/`v3`/`v4`/`v7`）。legacy 语义仅作参考，不做迁移、parity 或兼容工作。

The host/adapter workspaces are **LEGACY_INTERNAL_WORKSPACE_ONLY** for v0.11.0: `@kaicreator/domain-harness-node`, `@kaicreator/domain-harness-expo` and `@kaicreator/domain-harness-compiler` are private legacy consumers (0.2.x line, own versioning, not part of the frozen four-package 0.11.0 release graph). Their legacy imports of this package go through `./legacy` and keep running inside the workspace; they are not release consumers of the 0.11.0 SDK and no 0.11 feature is delivered through them.
宿主/适配器 workspace 在 v0.11.0 中属 **LEGACY_INTERNAL_WORKSPACE_ONLY（仅 workspace 内部 legacy）**：`@kaicreator/domain-harness-node`、`-expo`、`-compiler` 是私有 legacy 消费方（0.2.x 线、独立版本、不属于冻结的四包 0.11.0 发行图）。它们对本包的 legacy 导入走 `./legacy`，仅在 workspace 内可运行；不是 0.11.0 SDK 的发行消费方，也不经它们交付任何 0.11 功能。

Historical packed/isolated consumers of the old executable App ABI are **NOT_APPLICABLE for v0.11.0** because the release tarballs deliberately omit that ABI. Their historical fixtures remain unmodified evidence; they are not rewritten into apparent v0.11 compatibility passes. Workspace-only legacy tests continue to run, while static tarball inventory and the canonical v011 pack tests remain executable gates.
历史 packed/isolated 旧可执行 App ABI consumer 在 v0.11.0 中明确为 **NOT_APPLICABLE**：发行 tarball 有意排除该 ABI。历史 fixture 原样保留，不改写成看似通过 v0.11 兼容的测试；workspace-only legacy 测试继续执行，静态 tarball 清单与 canonical v011 pack 测试仍是真实门禁。

The root `dist` remains generated and untracked. `npm pack` runs `prepack`: a fresh root build followed by `assert-v011-pack-ready.mjs`; the ordinary workspace build executes the same assertion, and distribution tests inspect all four actual dry-run file lists. No generated root dist is committed.
根包 `dist` 仍为不入库的生成产物。`npm pack` 经 `prepack` 先重新构建再执行 `assert-v011-pack-ready.mjs`；普通 workspace build 也执行同一断言，distribution 测试检查四个实际 dry-run 文件清单。根包生成 dist 不提交。
