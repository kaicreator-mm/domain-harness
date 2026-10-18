# T00 REVIEW_CHECKLIST — independent exact-HEAD review (review:required, risk:high)

Reviewer binds to the PR HEAD SHA and this pack (`.agent/execution/v0.10-T00`,
base `1e6d4be`). ADS 4.13.1@f35fcdb review discipline applies.

## A. Authority and scope (fail the review on any miss)

- [ ] Exactly one concern: v0.10 BUILD composition + its trusted activation seam. No frozen Product/A01/L2/DAG/v0.9-release bytes modified.
- [ ] Write set exactly as EXECUTION_CONTRACT §2; in particular
      `payload/kernel-mechanism-v1.mjs` NOT touched (K01 #1167 single writer),
      `packages/domain-harness/src/host-v9/**` NOT touched,
      `packages/domain-harness-node/**` NOT touched,
      `tests/architecture-v010-k-extensions/**` NOT touched (E2 evidence frozen).
- [ ] No new runtime Package trust checking sneaks in: activation must not
      recompute digests, re-parse AST, re-resolve dependencies or verify
      approvals (A01-PC05). `P-ACT-NO-RESTATTESTATION` proves the consumer side.
- [ ] No second engine/runtime/loader, no dynamic install or discovery edge,
      no new universal Host abstraction (computed import()/require/eval edges
      refused at BUILD; activation imports only the sealed load order).
- [ ] No per-activation SDK AST/hash/currentness re-introduced under another
      name (e.g. "cheap recheck"). Static facts live in BUILD only.

## B. BUILD correctness

- [ ] Deterministic: same input → identical output (no clock/random/locale);
      `P-BUILD-DETERMINISM` asserts full plain-data equality.
- [ ] Closed roles: exactly one K Primary, one S Primary, >=1 Business;
      two primaries refuse typed (A01-PC08).
- [ ] Kernel-authority namespaces (`kernel:`, `cas:`, `admission:`,
      `journal:`, `effect:`) reservable ONLY by the K Primary; advisory hooks
      cannot squat them; business cannot declare capability handlers
      (`V10_AUTHORITY_FORGERY`).
- [ ] Dependency completeness + acyclicity + required-feature completeness are
      BUILD refusals (hidden mandatory advanced dependency cannot slip in).
- [ ] Per-role selected ABI table enforced; target profile is exactly the
      Node24 ESM profile (target mismatch refuses).
- [ ] Import closure: sealed per-module allowlist for `node:*`/bare
      npm/native specifiers; undeclared, computed dynamic, require, eval /
      Function constructors, file/`data:` edges and cross-packageId imports
      refuse. Ordinary imports allowed IFF sealed (A01 successor of v09
      zero-import; the v09 gate itself is NOT modified).
- [ ] Byte pinning sha256(source)==sealed sha; digest mismatch refuses.
- [ ] BUILD output is plain frozen data with NO approval/issuer field (BUILD
      mints no authority — v0.9 lineage discipline).
- [ ] BUILD performs zero module evaluation (sentinel row) and zero I/O.

## C. Activation correctness

- [ ] Only the sealed load order is imported, via private per-activation
      data: URLs; per-package import counters observable; Basic imports no
      advisory/advanced module; optional-absent falls back to Basic.
- [ ] Connect is structural (typeof export checks) — the A01 fail-fast class;
      no source inspection.
- [ ] Advisory init: bounded data-only context; protected K port names
      deny-and-record; init contract (plain record, exact fields, identity
      confirm); late failure → reverse disposal of ONLY initialized advisory
      modules; K documents untouched by teardown.
- [ ] Execute: one `createOccurrenceRuntime` per business package over the
      REAL selected kernel bytes; sealed-route Router selection must match a
      sealed route row; receipt passthrough with honest UNKNOWN on
      ADMISSION_EFFECT_AMBIGUOUS/JOURNAL_CONFLICT (no invented success).
- [ ] Dispose: facade closes first; advisory disposal in reverse init order.
- [ ] Advisory turn-time consultation semantics (budget advice/recovery)
      intentionally absent — flagged as K-side successor scope, not silently
      dropped (EXECUTION_CONTRACT §3).

## D. Evidence honesty

- [ ] TEST_MATRIX rows all present at the exact pushed HEAD with real
      commands + exit codes; nothing marked PASS that was NOT_RUN.
- [ ] K01/K02/T11/R01 scopes recorded NOT_RUN (no physical SQLite/packed
      consumer claims).
- [ ] dist committed and `check-committed-dist` passes; typecheck/lint green.
- [ ] Task Learning: NONE_MATERIAL or bounded exact-currentness references.
- [ ] PR targets `v0.10` only; no merge before accepted independent review.
