# v0.10 Source Layering — selected old ABIs versus implementation ownership

Status: **proposed #1233 architecture disposition** (requires independent review).
Scope: current v0.10 source hygiene only, without changing frozen v0.9 bytes,
public subpath exports, selected Kernel/Standard ABI or installed consumers.

## Decision

The v0.10 **BUILD format** is distinct from its selected **runtime payload
ABI** and the source directory containing the implementation. Source paths
bearing older version numbers are not automatically deprecated or incorrect.

| Source location | Current responsibility | v0.10 disposition |
|---|---|---|
| `v10build/digest.ts` | BUILD profile and exactly selected role ABI rows | Remains v0.10; Kernel/Router ingress literals were centralized by #1245 |
| `v09build/parser.ts` / `generated/acorn.mjs` | Vendored byte-pinned parser shared by frozen v0.9 and v0.10 BUILD analysis | **Retain** existing source and SHA pin, do not duplicate or rename silently |
| `v09/workflow-router.mjs` | Selected Standard Router implementation embedded by BUILD | **Retain** selected source/ABI and literal-router contract |
| `host-v8/` and `@kaicreator/domain-harness/v8/host` | Published Host compatibility surface, also carrying additive v0.10 Host capabilities | Keep existing public export; a private implementation move would require an exact API and packaged consumer inventory |
| `payload/kernel-mechanism-v1.mjs` | Sealed self-contained selected Kernel implementation | No runtime splitting, imports, ABI rewrite or byte substitution |

**Rationale:** `V09_BUILD_PARSER_PIN` is a byte integrity commitment, and
`V10_SELECTED_ROLE_ABI` deliberately lists v08 Kernel/Standard/Business/
Capability contracts. Renaming those strings or moving modules solely to
match a v0.10 folder label would turn naming cleanup into an ABI or import-
graph change. Those are not functionally required to fix #1233.

The remaining issue in #1233 was conflating version provenance with
architecture ownership. The *actual* facade wire literals were centralized
in the selected ABI owner by merged #1245 (no behavioral change). Keep
module provenance visible, rather than declaring a migration without
verification. Refactor genuinely shared private components only when their
ownership and independent package use are demonstrated.

## Future extraction gate (not required for v0.10 closure)

Any successor moving the parser or Host implementation must first show:

1. Exact predecessor/new file and public export inventory, including
   `./v10build`, `/v8/host` and root/qualified compiler barrels.
2. Byte pin preservation for vendored acorn and frozen v0.9 BUILD;
   deterministic v0.10 digest/load-order evidence.
3. Contract-literal identity for `v08/tc-intent`, Router input/output,
   selected ABI strings and K02 stable namespace.
4. Real Node24 Tiny/Rich packed-consumer and SQLite T00/T08/T10/C01
   regressions plus independent exact-HEAD review.

Until such a migration is separately proposed and qualified, no "50+
cross-version references" metric is a correctness or maintainability
failure by itself.

**Approval needed:** this architecture disposition closes the remaining
naming concern for #1233 *without* moving frozen compatibility surfaces.
If a reviewer identifies a genuinely generic private implementation with
measurable duplication, file a narrow successor issue for that specific
component instead of declaring a wholesale rename mandatory.
