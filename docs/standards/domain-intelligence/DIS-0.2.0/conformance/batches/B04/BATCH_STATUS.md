# B04 — C4 provenance / closure governance audit (CI_PENDING)

**Readback:** B03 archive SHA `59b61aa69b785b3fdb1709d3bd9ebd118a764588` passed Woodpecker #2285/1–3. B04 authored and independently source-committed three new C4 scopes; qualification on the cumulative exact source `d451eb36b8c4058d14c501c8965c300bee88acd9` / TREE `0a06f79233b3404a32871c0efb7973fae1c0b2e1` is **pending**. Do not mark this batch or its receipts VERIFIED unless the applicable native/compatibility/verify statuses actually succeed.

| Round | Original source SHA | Test Git Blob | Scope and CI initial observation |
| --- | --- | --- | --- |
| [R41](rounds/B04-01/ROUND.md) | `8a94a1aec41dc80dbb748d2883d2db8240771bf9` | `3bc3f9703f303c48ad9841edece0d0bb209eb9cb` | Historical B01–B03 exact source/CI receipt/test Blob integrity; [#2286/1](https://ci.kaicreator.com/repos/18/pipeline/2286/1) native SUCCESS, #2286/2 ERROR |
| [R42](rounds/B04-02/ROUND.md) | `9e6c05e4328614ea8a5e86a0ea201869eb4333a1` | `77e6b427fabd3fc8b07a70b5ce72117294e7b570` | All 21 matrix requirements and C1–C5 seven Core blockers, original Tally reviewer/locator Git Blobs; [#2287/1](https://ci.kaicreator.com/repos/18/pipeline/2287/1) Integration ERROR |
| [R43](rounds/B04-03/ROUND.md) | `d451eb36b8c4058d14c501c8965c300bee88acd9` | `fe73afab74dce2d82f24f64b09c22f9aafba341f` | Fail-closed false Release/Freeze and forged reviewer authorization; [#2288/1](https://ci.kaicreator.com/repos/18/pipeline/2288/1), [#2288/2](https://ci.kaicreator.com/repos/18/pipeline/2288/2), [#2288/3](https://ci.kaicreator.com/repos/18/pipeline/2288/3) all PENDING at this evidence snapshot |

**Actual technical finding:** Previous batch R35's original source test file was legitimately changed by later R38 Target ABI adoption. Its *historical exact-SHA receipt* remains a legitimate statement about the earlier source; its test Git Blob **does not equal** the current source file Git Blob. R41 audits and labels this `CHANGED_SINCE_PROOF` without falsely retroactively qualifying the changed file under the old SHA. This is a material reason to retain per-round immutable Git blobs and fresh full-suite CI.

**Actual normative finding:** C4 remains **PARTIAL** until C1–C3 satisfy all applicable MUSTs; exactly seven Core requirements remain PARTIAL. The original DKE/Tally reviewer and synthetic GH SourceLocator patch stay NOT_QUALIFIED; the related Tally [SEK-09 independent pilot](https://github.com/kaicreator-mm/tally/issues/351) concluded `REVIEW_COMPLETED / BLOCKED_NOT_QUALIFIED`, not original SAP acceptance. A negative independent review is not evidence of acceptance. Product/L1 must clarify actual supported OS Target variants and real Interaction transports.

**Governance:** C5 independent exact-SHA audit / Freeze is NOT_RUN. R43 is a read-only readiness check returning BLOCKED; neither human/LLM self-asserted authority nor a full technical native CI green result can mint a Release. No new Task DAG, merge, freeze, publication or unrelated Node-major semantic gate.

**Progress:** 9 Core VERIFIED / 7 Core PARTIAL = 56.25%; Optional 4 NOT_RUN, Governance 1 NOT_RUN. Previous batches B01–B03 9/9 scoped rounds were verified. B04 3 source commits are complete but currently **0/3 qualified** at this readback. The 11 new tests are authored, not yet accepted under exact full source.
