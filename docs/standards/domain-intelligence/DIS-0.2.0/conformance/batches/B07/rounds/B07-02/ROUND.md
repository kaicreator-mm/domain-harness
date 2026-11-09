# B07-02 / R52 — exact Function-level Element dependencies (CI_PENDING)

**Original source commit** [`f2130918d9863aeabd36227886c05cc44c5670cd`](https://github.com/kaicreator-mm/domain-harness/commit/f2130918d9863aeabd36227886c05cc44c5670cd), TREE `09553d57f6c33ca1a64469da0e59812f321ebbc1`; test Git Blob `c579299182569a5641683ec93a624eaba703e94b`.

## Purpose / native provenance

The DIS §4 and Element/Function R1 contract require one dependency edge to target **multiple specific publicly callable Functions and contract versions**. Current v0.2 AOT used only a `dependsOn: string[]` Element graph. R52 adds optional `element.dependencies` (one entry per `dependsOn` edge), with `element` and `functions:[{id,contractVersion}]`. AOT compares the selected target Element's real public Function metadata and exact contract/receipt/handle version before digest/SDK installation. An unspecified Function cannot be inferred; missing or duplicate refs and version mismatch fail closed. Existing v0.2 programs without `dependencies` still load. No physical effects or runtime dynamic Function selection.

The native fixture uses the original xDownload selected Business `xdownload.acquire` consumer, whose full dependency edge references `xdownload.policy.describePolicy` actual Function ID `xdownload.describePolicy` plus both `xdownload.interaction.inspect` and `xdownload.interaction.confirm` original selected LOCAL implementations. A real SDK Chat flow must remain `OBSERVATION/NONE` and `PENDING_AUTHORIZATION`; this declaration cannot bypass actual KDP-admitted Effect. Legitimate cyclic semantic `cooperates` relations coexist with acyclic Element dependency DAG.

## Falsifiable cases

Positive: original selected Function/Version closure, real Interaction consume/no-effect, semantic cycle accepted. Negative: nonexistent target Function, version missing/stale, duplicate binding, omitted coarse edge, static DAG cycle, same-version silent drift and same-major dependency removal. Historical B01–B06 tests remain mandatory.

**State: CI_PENDING**. This source commit is not yet qualified by Woodpecker. New receipt is excluded from the machine matrix until exact CI. CORE-002/005 still PARTIAL because a static dependency does not replace independent semantic ownership and executable domain constraints.
