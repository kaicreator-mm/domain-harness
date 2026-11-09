# DIS v0.2.0 B08 — authentic DKE → DIS native consumer

B08-01 / R54: original DKE #209 R6 two-version Tally Git-produced knowledge receipt → selected, pinned DIS v0.2 Knowledge Function and real SDK/KDP consumer; typed UNKNOWN and non-authoritative Evidence, independent installer stale source rejection. Source `422e0e7c245bbb9d34916d471e243ac52a1ee3d5` / test Git Blob `f5d43f8c6080511241272124f2c8be2f7d8e2ab5`. **CI_PENDING**, not qualified; no matrix links, no Core promotion.

Previous B01–B07 **21/21 VERIFIED**, Core **9/16**, optional 4 NOT_RUN, governance 1 NOT_RUN. Keep current PR Draft, no Freeze/merge/release.
## B08-01 R54 R0 → R1 same-Writer fail-closed repair

R0 source `422e0e7c245bbb9d34916d471e243ac52a1ee3d5`, test Blob `f5d43f8c6080511241272124f2c8be2f7d8e2ab5`; Woodpecker #2307/1 native **FAILURE** (step logs not available via GitHub checks, so the exact failing test is not asserted). Builder independently found source-code contract bug: no-evidence UNKNOWN returned `evidenceRefs:[]`, which existing typed-outcome classifier rejects as `DIS_EVIDENCE_INVALID` when the ref field is present. This breaks legitimate old-version UNKNOWN.

Same Writer repair: Reader `269804b8a4be9d262deb61e1764d9030612dc01e` / Git Blob `ab0cb7d9fed146f419ef7555fcdc8a406f25db10` now omits evidenceRefs when absent; R1 native test `79e62556ed799a52dc8a8437cc17a4da3a96f97f` / Blob `503d34cc3d5049c036ba590e66b4092c52958c9e` makes the public output evidenceRefs optional, asserts zero fabricated refs, and leaves mandatory Source receipt/hard URI checks unchanged. Only exact new CI can qualify R54; #2307 original failure preserved.

## B08-01 R54 R1 → R2 actual cross-project source DATA gate repair

R1 branch candidate `c798f433ef9cffeb808b2c91b6c2923f5a406524` / Woodpecker #2308/1 native **FAILURE**. Source review found another real ABI defect: native `qualifyDisV020Artifact` disallows all `docs/` origins, while actual DKE #209 producer JSON comes from `docs/standards/dke/...`. The original Git path cannot be rewritten into a fake `examples/` path.

R2 targeted Contract source `8c8b29713c3f7aed70d448e707ab65d9234582fa` / Git Blob `fa2fb30875653eaa1eeb32ffbbc97fbb01210c34` accepts only `docs/standards/dke/.../*.json` as selected source DATA, **not** executable LOCAL implementations. R2 native test `d20622f226e40ffe75981d3df75ad7ff941a215f` / Blob `80ecb069278d4112cf38098bfbcb5f5d1465e498` exercises valid DKE Git-origin pin and rejects JSON-as-code, `..` path traversal and `.js` origin. All R0/R1 commits, test Blobs and FAILED CI histories retained. **CI_PENDING** for new cumulative source; no self-qualified R54 or Core state promotion.
