# T00 Handoffs — records of known limits deliberately NOT repaired in T00

Each entry names the current shape, why it is not changed on this base, and
the successor that owns the repair. Nothing here is a defect of the T00
deliverable against its frozen contract; it is the honest seam where that
contract ends.

## H1 — K docs key namespace uses the BUILD subjectDigest as deployment identity

- Review origin: R1 review comment `6254726674` on PR #1184 (P2).
- Current shape: every K document key minted by the v0.10 activation is
  `v10/k/<subjectDigest>/<tenantId>/<key>`
  (`activation.ts`, `K_DOCS_PREFIX` + `#docsPrefix`, set once per facade from
  `app.subjectDigest` + `tenantId`). The BUILD subject digest — a content
  hash of one composition (roster, bindings, allowances, routes) — is doing
  the job of a deployment identifier.
- Why not changed in T00: the key shape is a cross-task physical contract.
  Product/L2 require a **stable `deployedAppId` + B-domain identity** instead
  of the per-composition digest, so that re-BUILDs of the same deployed App
  keep reading/writing the same K state. Renaming the prefix here would fork
  the physical key space that K01's kernel and K02's durable receipts are
  being built against, with zero consumer able to honor the new shape on
  this base.
- Owning successors: **K02** (deployed-App identity + physical docs layout),
  **T10** (deployment/activation identity binding), **T08** (B-domain
  identity). T00's only commitment is that the prefix is computed in exactly
  one place (`#docsPrefix`) and every key passes through the prefix-bounded
  docs port, so the successor repair is a one-place change.
- Constraint for successors: kernel payloads address documents by RELATIVE
  keys only (`instance:...`, `admission:fence:...`, `v08-kernel:...`); the
  physical namespace decision must keep staying OUT of kernel bytes.

## H2 — kernel-driven fence removal is a seam only on this base

- Review origin: R1 review comment `6254726674` (P1-2).
- Current shape: `V10DocStore` carries the optional physical
  `remove(key, condition)` and the K docs port exposes it (with the
  `mustMatchRevision` / `mustBeAbsent` condition mapping), but THIS worktree's
  kernel payload never calls it — the zero-ambiguity
  `releaseAdmissionFence → docs.remove` call arrives with K01 (#1183).
- Verification boundary: the seam is proven store-side
  (`tests/assembly/v010-build-activation.test.ts`,
  `P-ACT-DOCS-REMOVE-SEAM` / `N-ACT-DOCS-REMOVE-ABSENT`); the kernel-driven
  end-to-end fence release is K01's integration scope, re-checked at R01.
