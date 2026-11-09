# B11-01 / R57 — real CLI OS process → selected DIS Interaction

**CI_PENDING**, original source `a7c25ea73aa3f4eacf7006bba15cb5b2edf0e449`, TREE `f742970f3cd1917e576eb2bec990070b3a6b7361`, original test Git Blob `9f0b608d36dd065b761ac5f83533a3b4bc5c302f`; actual transport original source commit `aa1c4287d8d8b1e19110d4978bfb93079a3517bf` / Git Blob `ebc54ae8351007aba510708509e1a9c142343c9f`.

Existing B02 had only in-process CLI argv-shaping semantics; B06 qualified real loopback Form and Chat HTTP. This R57 adds a **real child Node process** executing `cli-transport.mjs` through the canonical selected `makeNativeFixture → loadDisV020Aot → xdownload.interaction.inspect / confirm` SDK path. No hand-authored alternate Kernel, no CLI-triggered KDP physical Effect. Exact original xDownload source is reused.

Positive cases: (1) confirmed real CLI child process yields `READY_FOR_KDP` but `PENDING_AUTHORIZATION` / Authority NONE / permittedEffect false, (2) unconfirmed remains `NEEDS_CONFIRMATION`, (3) three concurrent independent OS processes preserve source-proposal URL, declared bytes and request ID without cross-session leakage. Negative cases: forged `--effect`, `--execute`, duplicate ID, injected `--owner-approved`, invalid ID rejected before native SDK; credential-bearing URL is rejected by original selected xDownload Interaction after SDK dispatch, no hidden Effect.

Scope remains non-production demo; actual Target applicability, independent semantic owner and all required Interaction transport contracts are not proven. CORE-014 remains PARTIAL until Product/L1 decision. CI Pending; do not add R57 to global machine matrix or count as VERIFIED before full exact source statuses.
