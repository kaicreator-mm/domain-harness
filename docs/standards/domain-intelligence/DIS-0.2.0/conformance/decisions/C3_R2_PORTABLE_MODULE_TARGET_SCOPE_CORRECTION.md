# C3 R2 — correcting overstrict Target evidence interpretation

**Authority**: [DIS master #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), [Product/L1 #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496), [Draft PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497). This revises the acceptance *interpretation* of [C3 R0](C3_TARGET_SCOPE_DECISION_R0.md), not Product normative source, original B03/B05 source or Core qualification. Source audit at original `domain-harness@ce11f17e65e25f58243b27b038934531cdcd9061` (the previous native C1 integration is failing #2407/1, unrelated C3 tests).

## Specific excessive requirement found

Some earlier commentary could be interpreted as requiring **different BUILD module bytes** or a distinct OS-specific source implementation for each Target, before `CORE-008` can pass. **That is not required by the Product text** and risks an endless fake multi-platform build loop.

Original normative [DIS R1 §5](https://github.com/kaicreator-mm/domain-harness/blob/ce11f17e65e25f58243b27b038934531cdcd9061/docs/standards/domain-intelligence/DIS-0.2.0/DIS-0.2.0.zh-CN.md) Git Blob `b927f6af79566f768ce02b7a17ff2c1e3417a689` says each **selected** runtime Target has its own Package/dependency closure and AOT fixes selected Function binding, digest and Target. Constraining [R3 §3](https://github.com/kaicreator-mm/domain-harness/blob/ce11f17e65e25f58243b27b038934531cdcd9061/docs/standards/domain-intelligence/DIS-0.2.0/FULL_SCOPE_REPAIRS_R3.zh-CN.md), Git Blob `2ca531cd8174d178c5808a86f0e511b6117782c6`, requires *for each applicable selected Target*: exact Function Implementation digest/version, per-Package Target and Manifest/Lock, KDP/SDK/Business dependency/Extension closure, immutable resources and source locks, actual installer Target and independent runtime Host/Effect governance. **It does not say code bytes must differ across targets**, and does not make Windows/Android mandatory for one Linux-bounded Demo unless Product/L1 declares those targets applicable. A portable module can lawfully have the same SHA for different Target-specific packages **if every target's manifest/lock, selection and native compatibility are truly verified**.

## R40 counterexample correctly scoped

The existing [B03/R40 test](https://github.com/kaicreator-mm/domain-harness/blob/ce11f17e65e25f58243b27b038934531cdcd9061/examples/dis-v020-native-sdk/b03-target-source-authority.test.mjs) Git Blob `e4e91b820bc4e551d3b40270102115524755f9bf` proves **self-labeling identical modules** is not a sufficient native/Target qualification *in isolation*. It **does not prove identical modules are forbidden** or that every Target needs unique source code. The original B05 actual Linux/x64 host check, B03 installer independent Target, and R38 source module/digest closure together are stronger than the isolated self-label counterexample. [#2404/1–3](https://ci.kaicreator.com/repos/18/pipeline/2404/1) are genuine three-context SUCCESS at `3bf6d05687faecd961a6fff43faeaa8955960c63` for that actual bounded worker. Raw `DIS_C3_SELECTED_HOST` logs were not collected in this Chat-mode audit; do not invent values.

## Revised minimal Product acceptance test — no fake native variants

If Product/L1 accepts **only `linux/x64/node` as the applicable bounded v0.2 Demo Target**, qualify this one Target *without* fabricating a second OS-specific implementation when all of the following are source+native-test evidenced:

1. The actual Linux/x64 **selected package closure** (KDP/SDK/Business Packages, manifest or equivalent immutable AOT Lock) names exact Functions/Implementations/dependency versions/resources and their source digests. A selected implementation can be portable and shared with other Targets.
2. The separately supplied installer identity exactly matches the AOT-selected Target and manifest/lock. Merely changing a label cannot self-authorize the artifact.
3. The real Linux/x64 process Host is required and checked before KDP use; nonmatching labels/CPU, missing/forged required pins, wrong selected module and unselected source are rejected by actual native negative tests.
4. The artifact's original selected Target and Function IDs are the actual consumed AOT→SDK→KDP bindings, not a simulated or skipped test.
5. Original exact-SHA CI for those source-selected tests is terminal, all required contexts green, and Product/L1 *explicitly records* the bounded applicable Target and decides if the existing native closure evidence suffices. No Domain SAP, physical Effect, cross-OS/production claim follows from this limited check.

If Product instead declares another platform applicable, that platform needs a **separate** target-specific selected closure and native execution evidence; it may legitimately reuse byte-identical portable components. If a truly Target-specific native driver/physical API is required, its implementation/binary must be in that target's exact closed source/manifest—do not demand one when the selected Demo has none.

**Current decision remains `CORE-008=PARTIAL`, Core 12/16, Product/L1 `REVIEW_PENDING`, DKE SAP 0, Effects 0, no Freeze/Release.** This document is a source-first correction to an unnecessary additional blocker, not retroactive Product approval.
