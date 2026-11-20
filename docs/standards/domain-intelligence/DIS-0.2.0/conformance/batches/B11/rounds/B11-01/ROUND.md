# B11-01 / R57 — real CLI OS process → selected DIS Interaction

**CI_PENDING**, original source `a7c25ea73aa3f4eacf7006bba15cb5b2edf0e449`, TREE `f742970f3cd1917e576eb2bec990070b3a6b7361`, original test Git Blob `9f0b608d36dd065b761ac5f83533a3b4bc5c302f`; actual transport original source commit `aa1c4287d8d8b1e19110d4978bfb93079a3517bf` / Git Blob `ebc54ae8351007aba510708509e1a9c142343c9f`.

Existing B02 had only in-process CLI argv-shaping semantics; B06 qualified real loopback Form and Chat HTTP. This R57 adds a **real child Node process** executing `cli-transport.mjs` through the canonical selected `makeNativeFixture → loadDisV020Aot → xdownload.interaction.inspect / confirm` SDK path. No hand-authored alternate Kernel, no CLI-triggered KDP physical Effect. Exact original xDownload source is reused.

Positive cases: (1) confirmed real CLI child process yields `READY_FOR_KDP` but `PENDING_AUTHORIZATION` / Authority NONE / permittedEffect false, (2) unconfirmed remains `NEEDS_CONFIRMATION`, (3) three concurrent independent OS processes preserve source-proposal URL, declared bytes and request ID without cross-session leakage. Negative cases: forged `--effect`, `--execute`, duplicate ID, injected `--owner-approved`, invalid ID rejected before native SDK; credential-bearing URL is rejected by original selected xDownload Interaction after SDK dispatch, no hidden Effect.

Scope remains non-production demo; actual Target applicability, independent semantic owner and all required Interaction transport contracts are not proven. CORE-014 remains PARTIAL until Product/L1 decision. CI Pending; do not add R57 to global machine matrix or count as VERIFIED before full exact source statuses.

## R57 R0 → R1 same-Writer prequalification correction

Source-first code audit observed original selected Function's `REJECTED:'FAILED'` typed outcome map. R0 native CLI test Git Blob `9f0b608d36dd065b761ac5f83533a3b4bc5c302f` incorrectly expected disposition `REJECTED` for source business status `REJECTED`; R1 test source `475a0c2f12de164fd6149f812fee754d26f1aa6b` / Git Blob `c6d1149bea35324a6b6ef721bd445de948218153` now requires disposition `FAILED`, preserving rejection and no-Effect. Correction precedes qualification; do not assert an external R0 CI FAILURE without a terminal status. This batch remains CI_PENDING.

## R57 final exact-source qualification

R0 original test Blob `9f0b608d36dd065b761ac5f83533a3b4bc5c302f` #2322/1 native **FAILURE**, no verified failing test log. R1 original test Blob `c6d1149bea35324a6b6ef721bd445de948218153` correctly expects business REJECTED → typed FAILED, source `b5762ae29ac7234d45d8bc1cbf974faebad39e2e` TREE `24c6b44490b471d2c89066ea89662bf552603169` [#2323/1](https://ci.kaicreator.com/repos/18/pipeline/2323/1) native, [#2323/2](https://ci.kaicreator.com/repos/18/pipeline/2323/2) compatibility, [#2323/3](https://ci.kaicreator.com/repos/18/pipeline/2323/3) Verify **3/3 SUCCESS**. Scoped CLI transport verified; no complete Product/L1 CORE-014 acceptance or Effect permit.
