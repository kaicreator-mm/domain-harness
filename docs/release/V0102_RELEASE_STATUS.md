# DomainHarness v0.10.2 — Release Status / 发布状态

**Final state: COMPLETE, RQ CONDITIONAL, immutable Git Tag created.** This document is a post-release **derived user-facing summary**. The authority is [R01 #1331 final closure](https://github.com/kaicreator-mm/domain-harness/issues/1331#issuecomment-6416079327) and the actual Git references. It does not amend the tagged product, frozen Product/L2 or old evidence.

| Field | Recorded value |
| --- | --- |
| Tag | [`v0.10.2`](https://github.com/kaicreator-mm/domain-harness/tree/v0.10.2), lightweight ref to commit `cee14399d9d0af4e20e34b9111861b16a465b690` |
| Frozen source tree | `9618e88b32f16a63164f65b8fbdf4457c96f5e76` |
| `main` integration | [PR #1387](https://github.com/kaicreator-mm/domain-harness/pull/1387) MERGED; merge commit `096995f47fbf67f4b5699cfdf1d4c18bbe815041`, same tree as tag |
| Task DAG / R01 | Original 20/20 CLOSED; R01 [#1331](https://github.com/kaicreator-mm/domain-harness/issues/1331) CLOSED |
| Product scope | Independent RQ qualified 8/8 P0 and 2/2 required P1; no confirmed product P0/P1 |
| Hidden | 7/7 **physically executed PASS**, at exact source SHA, owner-held private |
| Critical Journeys / Packaging | Accepted by independent source-delta evidence-reuse adjudication |
| Release qualification | **CONDITIONAL**, independently reviewed |
| Accepted exception | `EX-v0.10.2-R01-FULL-OS-01` — only this exact source SHA/tree; explicit Owner approval + independent R3 PASS |
| P2 | 8 retained/disclosed by R3 |
| Registry publication | **Not established**; four public workspace manifests remain `0.10.2-rc.0` |
| GitHub Release UI object | Optional, not created at final closure; Git Tag is real |

## Important truth: Full regression did not exit zero

On the exact source the actual overall `npm test` command exited **1**; its latest execution recorded 3,986 workspace tests, 3,979 PASS and 7 OS/runner-capacity failures, no skips. The chained `test:root` phase **was not executed** in that attempt. This is **not** Full PASS and the historical preceding commit's green root phase is **not** relabeled as a new-SHA run.

One-release Owner-authorized, third-independently-reviewed composite coverage accepted unchanged historical root/path proofs plus exact-current changed-risk Node24 15×4/4, Store 135/135 and in-memory 59/59, dual scoped CI, current-source Hidden 7/7 and independently admitted unchanged Critical Journeys/distribution. The outcome is a **conditional** release, with remaining P2 limitations on root current-run coverage and test-failure causal certainty. This exception is **non-precedential** for any later version; there is **no product requirement** for Ubuntu, Windows, a specific RAM size or OS remediation.

## Operational product boundaries

- Node24 is the **physically qualified runtime lane**. Manifests declare `engines.node >=24.0.0`; this is not evidence every newer major/platform has been tested.
- Four public roots: Contracts, BUILD (producer only), Microkernel (runtime), optional Node Host. Legacy Compiler/Core/Expo packages remain private. No automatic package registry publication is implied by a Tag.
- Tiny PlainFileDocStore fixture is **single-writer** only; Rich proves real SQLite multi-process CAS.
- `subscribe` returns a Promise, event payload is redacted; N3-LATE authority safety is evidenced by a separate true inter-await negative.
- K Primary alone owns state/admission/journal/effect/replay; `host-seam` is not a permission boundary.

## Future docs work versus version changes

After this immutable Tag, user/Agent handbook updates go through a **separate docs PR against current main**, leaving source SHA and frozen RQ unchanged. New runtime features require prospective Product/L2/Task DAG. See [docs home](../v0.10.2/README.md), [architecture](../architecture/V0102_RUNTIME_DIAGRAMS.md), [user manual](../manual/V0102_USER_GUIDE.zh-CN.md) and [Agent playbook](../agents/V0102_PLAYBOOK.md).
