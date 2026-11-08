# DIS v0.2.0 R7 — kaicreator-mm three-project real-source consumer Demo

**Scope: DIS Product/L1 source-locked cross-repo feasibility demo.** Authority: domain-harness #1496, Draft PR #1497. This is NOT an assertion that these products have adopted a published DIS 0.2.0 SDK ABI or that native service/OS end-to-end side effects were run.

## Selected real repositories at exact source commits

| Project | Exact inspected main commit | Source under repo | DIS interpretation |
| --- | --- | --- | --- |
| [Tally](https://github.com/kaicreator-mm/tally/commit/e988321439f65b55936a691c02250b6d62a29409) | `e988321439f65b55936a691c02250b6d62a29409` | `packages/tally-engineering-business/src/index.mjs`, `src/release-readiness.mjs` | Task evidence / release-readiness public Function + KDP-owned authority boundary |
| [Runx](https://github.com/kaicreator-mm/runx/commit/b9e0c953d9bfd5834315012426fd8e10c21bdd7c) | `b9e0c953d9bfd5834315012426fd8e10c21bdd7c` | `packages/control-plane/src/environment-agent-presence.ts` | Stateful Domain Element (not one Function per Element), observed incarnation / no false current lease |
| [xDownload](https://github.com/kaicreator-mm/xDownload/commit/e904f08c478b15147b1c07fbe53c610d2d81851f) | `e904f08c478b15147b1c07fbe53c610d2d81851f` | `packages/download-domain-app/src/business/business-download.mjs`, `business/capability-acquisition-stub.mjs` | Business Function + declared K→C non-idempotent external Effect, no direct runtime authority |

All five source files are **byte-for-byte Git Blob identical** to the original project's selected commit, not paraphrased mock implementations. The readonly source snapshots are located at `examples/dis-v020-cross-project/snapshots/`; `manifest.json` retains exact originating repo, commit and path and SHA-1 Git Blob identities. Qualification verifies Git's actual `blob {byteLength}\0{bytes}` hash on every run. No external repo clone/network needed on CI; this is a *fixed-commit cross-project contract sample*, not current HEAD monitoring.

## What is actually executed

`consumer.mjs` validates source pins, resolves Elements, static dependencies, binding to *actual exported source Functions*, implementation kind and Effect class, and exposes only qualified selected public Functions. The test imports/executes:
- **Tally v2**: real `getPolicy()`, `assessTaskEvidence()`, `projectReleaseReadiness()`. Invalid/mismatched evidence is rejected; apparently complete Release evidence still cannot grant merge/publish or native Task Claim authority.
- **Runx v0.6**: real TypeScript class `EnvironmentAgentPresence` instantiated through the selected Function slot. Spoofed agent token is ignored; incarnation replacement/tie-break deterministic; latest observation is NOT equivalent to current authenticated lease or execution permit.
- **xDownload v0.2**: real `getPolicy()` with 1 MiB declared-bytes guard, external `await:terminal` KDP Effect binding and real stub `OPERATIONS`; without trusted Host bridge `acquire` fails, while DIS direct invocation of `non-idempotent` Effect is **always refused** with typed `DIS_EXTERNAL_EFFECT_KDP_REQUIRED`.

The real source-based tests DO NOT claim a KDP dispatch for all three products. The real KDP/SQLite/physical-Effect integration is separately established in the prior R6.1 example. This R7 specifically checks **domain semantic heterogeneity**, stable Function contracts, versioned selected implementations, UNKNOWN/advisory vs Authority, and effect-admission safety across existing project code.

## How to reproduce

```sh
node --import tsx --test examples/dis-v020-cross-project/consumer.test.mjs
```

No fixed Node major required in this dedicated DIS validation lane. Five snapshots are pinned and cannot be silently replaced by modifying `manifest.json`; `consumer.mjs` has independent allowlisted origin Git Blob anchors. The resulting record is a deterministic self-test of source logic and DIS adapter, **not** a signed cross-repository supply-chain approval.

## Positive/negative quality gates

23 independently named tests cover exact source readback, 3 Domain / 5 Element / 6 Function projection, forged source, unselected public Function, cross-project module substitution, DAG cycle, wrong Effect class, duplicate/immutable contract, real Task/Release outcomes, stateful observation limits, actual download KDP declaration and raw-effect refusal.

**Current rule:** report R7 tests PASS only after exact matching domain-harness Git HEAD Woodpecker `dis-v020-integration` success. Do not attribute any previous R6.1 CI receipt to this change. The three original source repos themselves are unmodified.

**Potential DIS standard refinement:** an Element may represent an immutable pure Function family (Tally), stateful but non-authoritative observer (Runx), or a declared external-effect pipeline (xDownload). The Function contract must explicitly differentiate **OBSERVED**, **AUTHORIZED** and **EXECUTED**; never infer execution permission from a source-matched Function or from a fresh-looking untrusted observation. Formalization belongs to Product/L1→L2, not instant SDK ABI mutation.

## R7.1 源码来源反事实审查与修复

对抗审核发现只校验 Git Blob 不足以固定 **仓库/提交/原始路径**：相同字节可以被 Manifest 错报为另一项目的实现。现将 `source pin` 扩展为代码内的不可由 Manifest 自颁的四元组 `(repo, commit, originalPath, gitBlob)`，对 Project Identity 和每份 Source 单独比对后再使用 Node 实际 import。新增三项反例：伪造仓库、伪造 commit、伪造原文件路径必须拒绝。R7 的实名源码 Demo 由原 23 项增至 **26 项**。它固定的是当前选定 Git 提交，**不自动声称是未来某天三个项目的最新 HEAD**。
