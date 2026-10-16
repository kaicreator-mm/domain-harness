# v0.8 T-G #1006 — HF25 packed BUILD delivery boundary evidence

**2026-10-16. Scope: HF25 only — publish entry + packed-consumer verification.** This closes the distribution gap recorded in [the four-row exact join audit](tg1006-b1-b3-four-row-exact-join-audit.md): *"The generator `src/compiler/app-contracts.ts` is imported as private source in tests, not exported by public `@kaicreator/domain-harness-compiler` root … A committed generated fixture is not proof an npm-installed BUILD consumer can run the generator."* It builds on merged PR #1085 (typed generated-artifact consumer P/N) without touching its test or golden bytes.

## Ownership decision (from frozen sources, not test convenience)

- `DomainHarness_v0.8_RETAINED_FUNCTION_MANIFEST.json` HF25 row: `frozenOwner: "BUILD"`, `futureOwnerTask: "#1000"` (T-A qualified BUILD/producer).
- L2 Freeze fact 2/3: the Microkernel is the minimal trusted loader/binding/lifecycle; BUILD coordinates qualification/derivation. The audit's constraint: *"Do not import this generator into Microkernel runtime, require old v0.3 API parity, or add a new generator."*
- Frozen dependency rule "compiler -> core contracts" (issue #164): the generator consumes `CompiledPackageManifest` via the compiler package's re-export of the core v2 authority.

Therefore the existing pure generator moved **unchanged** (byte-identical bodies, import lines only) from `packages/domain-harness/src/compiler/` to `packages/domain-harness-compiler/src/app-contracts/`, and is exported **additively** from the `@kaicreator/domain-harness-compiler` root barrel (`COMPILER_PUBLIC_API_VERSION` stays `compiler-public-api.v1`; additive-only per the T008C policy). The kernel's legacy `/v3` barrel no longer re-exports compiler tooling (old-ABI parity explicitly out of scope), and the now-unemitted `dist/compiler/app-contract*` bytes were removed from the committed Microkernel dist so they stop shipping in its tarball. No generator logic was rewritten; the #1085 typed consumer test and its golden artifact are untouched.

## Proof reused and added

| Evidence | Where |
| --- | --- |
| Byte golden + determinism + fail-closed codes (moved with the generator) | `domain-harness-compiler/tests/app-contract-generation.test.ts`, `app-contract-integer-projection.test.ts` |
| Additive BUILD root inventory admission + frozen format constant | `domain-harness-compiler/tests/public-api-compatibility.test.ts` |
| **Packed consumer P**: clean consumer installs the staged core+compiler tarballs, runs `generateTypedAppContracts` on the exact #1085 order-app inputs, output is byte-identical to the single committed golden; generated artifact + typed public surface typecheck in the consumer (strict, `skipLibCheck: false`) | `domain-harness-compiler/tests/app-contract-packed-consumer.test.ts` |
| **Packed consumer N**: `SOURCE_FORMAT_MISMATCH` / `PACKAGE_MISMATCH` fail closed from the tarball; Microkernel `/v3` lane does **not** expose `generateTypedAppContracts`; compiler deep imports stay `ERR_PACKAGE_PATH_NOT_EXPORTED` | same file |
| Kernel v3 surface inventory expectation updated (generator names removed from the assembled lane) | `domain-harness/tests/v3-assembly/surface.test.ts` |

## Executed local verification (Windows, Node v24.21.0, real Host)

- `npm test -w @kaicreator/domain-harness-compiler` (NPM_REGISTRY=npmmirror): **394/394 pass, 0 skipped** — includes the packed-consumer journey above and the T008C e8a/e8b reference lanes.
- `npm test -w @kaicreator/domain-harness`: **3163/3163 pass** after the one pinned v3-surface expectation update; test tail `tsc -p tsconfig.test.json --noEmit` green.
- Kernel/compiler `typecheck` green; committed dist regenerated and verified by `scripts/check-committed-dist.mjs` expectations (root build guard).
- Pre-existing environmental note: on a fresh worktree without the node-package dist, the kernel test tail reports 4 `@kaicreator/domain-harness-node` resolution errors on the **unmodified baseline too**; building workspaces first resolves it. Unrelated to this change.

Remote full CI remains the authoritative gate for the PR (per T-G policy; no local Full/Hidden rerun claimed here). PR_PASS ≠ RELEASE_PASS.
