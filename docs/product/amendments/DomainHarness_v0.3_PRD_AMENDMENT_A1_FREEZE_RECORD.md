# DomainHarness v0.3 PRD Amendment A1 — Freeze Record

**Status:** `FROZEN`
**Frozen date:** 2026-09-20
**Authority branch:** `v0.3_prd_amendment_a1`
**Base PRD:** `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
**Base PRD blob:** `6a6fb59b156f576d48828019faf0e6039d08d5af`
**Base main:** `dc3ea6334d7153c799f0c569c8d3c641764094fc`

## Frozen Amendment Body

The authoritative Amendment A1 body is the exact Round 2 candidate reviewed by Claude:

`docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`

SHA-256:

`1aaea27bed59515a10d54101c917ed1db6fadc33434f5fdfefad4a9e9fe1be01`

Git blob:

`3e7e463aa8c1510ae2ff8ee7da1490fa234b07ac`

For convenience, the repository also exposes the exact same blob at:

`docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_FROZEN.md`

No editorial changes were made after the reviewed SHA. This preserves exact-SHA review identity.

## Independent Adversarial Review

Round 1:

```text
CHANGES_REQUIRED
P0 = 1
P1 = 6
```

Round 2:

```text
FREEZE_OK
P0 = 0
P1 = 0
```

Round 2 review evidence:

`docs/product/amendments/reviews/DomainHarness_v0.3_PRD_AMENDMENT_A1_ADVERSARIAL_REVIEW_R2.md`

## Non-blocking Review Notes

The remaining P2/P3 observations do not block this freeze. They are carried into the narrow v0.3 L2 Amendment, including:

- governance-critical classification default/authority;
- activation-contract reference precision;
- Governance Baseline package/pin/recovery binding;
- Frozen PRD §19 / §23 mapping completeness;
- promotion-authority wording consistency;
- exact fallback / conditional experimental wording.

## Scope Verdict

The independent reviewer concluded that A1 is a **v0.3 clarification amendment**, not a v0.4 scope expansion.

The next lifecycle step is a **narrow L2 Amendment**. Task DAG generation must consume the Frozen PRD + this Frozen A1 + the amended L2 authority.