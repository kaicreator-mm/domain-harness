# DIS v0.2.0 B08 — authentic DKE → DIS native consumer

B08-01 / R54: original DKE #209 R6 two-version Tally Git-produced knowledge receipt → selected, pinned DIS v0.2 Knowledge Function and real SDK/KDP consumer; typed UNKNOWN and non-authoritative Evidence, independent installer stale source rejection. Source `422e0e7c245bbb9d34916d471e243ac52a1ee3d5` / test Git Blob `f5d43f8c6080511241272124f2c8be2f7d8e2ab5`. **CI_PENDING**, not qualified; no matrix links, no Core promotion.

Previous B01–B07 **21/21 VERIFIED**, Core **9/16**, optional 4 NOT_RUN, governance 1 NOT_RUN. Keep current PR Draft, no Freeze/merge/release.
## B08-01 R54 R0 → R1 same-Writer fail-closed repair

R0 source `422e0e7c245bbb9d34916d471e243ac52a1ee3d5`, test Blob `f5d43f8c6080511241272124f2c8be2f7d8e2ab5`; Woodpecker #2307/1 native **FAILURE** (step logs not available via GitHub checks, so the exact failing test is not asserted). Builder independently found source-code contract bug: no-evidence UNKNOWN returned `evidenceRefs:[]`, which existing typed-outcome classifier rejects as `DIS_EVIDENCE_INVALID` when the ref field is present. This breaks legitimate old-version UNKNOWN.

Same Writer repair: Reader `269804b8a4be9d262deb61e1764d9030612dc01e` / Git Blob `ab0cb7d9fed146f419ef7555fcdc8a406f25db10` now omits evidenceRefs when absent; R1 native test `79e62556ed799a52dc8a8437cc17a4da3a96f97f` / Blob `503d34cc3d5049c036ba590e66b4092c52958c9e` makes the public output evidenceRefs optional, asserts zero fabricated refs, and leaves mandatory Source receipt/hard URI checks unchanged. Only exact new CI can qualify R54; #2307 original failure preserved.
