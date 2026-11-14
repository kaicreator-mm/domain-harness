# R30 C1 — Native Element version, source validation declaration, and bounded structural ABI

**DIS:** v0.2.0 Draft, [Product/L1 #1496](https://github.com/kaicreator-mm/domain-harness/issues/1496), [Demo Master #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), [PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497).

**Purpose:** close a concrete technical half of CORE-002: the original normative DIS 0.2.0 §3 says each Element **MUST have id, version and description**, while the native AOT compiler previously allowed every Element to omit a version. Source-first semantic evaluation from R29 is separate and remains unqualified. Do not conflate a versioned source declaration with domain truth.

## Exact old evidence

Prior R29 repaired native SHA `91e48b1b0d6a30173cc0b3cce001040878e381bb`, TREE `6e4a57a6c8be275337fc816c85cc41c4a634c632`, [Woodpecker #2266/1](https://ci.kaicreator.com/repos/18/pipeline/2266/1) Integration **SUCCESS**, [#2266/2](https://ci.kaicreator.com/repos/18/pipeline/2266/2) compatibility **SUCCESS**, [#2266/3](https://ci.kaicreator.com/repos/18/pipeline/2266/3) Verify **SUCCESS**. No old failed #2265/1 evidence is overwritten. The exact historical R29 receipt is [r29-native-source-first-ci.json](receipts/r29-native-source-first-ci.json) and is listed in the machine matrix. New R30 needs its **own new exact-SHA Integration**.

## R30 native C1 contract delta

1. The public DIS AOT `DisV020Element` now **requires a syntactically valid version** (`1.0.0`, semver-like positive major) on **every** Element including zero-Function global semantic Elements. Missing, unversioned, malformed, leading-zero, or zero-major Element declarations fail with `DIS_ELEMENT_VERSION_INVALID` before any KDP boot. Canonical native fixtures from original Tally/Runx/xDownload, DKE multi-variant selected Knowledge readers, and both actually selected Business Package readers are upgraded to explicitly `version:'1.0.0'`.
2. Optional `validation: {schema:'dis.v0.2.element-validation/1', sourceIds:[...], authority:'NONE'}` is a narrowly **source-pin-referenced structural verification declaration**. Each listed ID must exist in AOT source pins, belong to a repository selected for the Element's own Domain, and actually be consumed by one of that Element's LOCAL Functions. This is not a business Evidence/Oracle receipt and cannot self-assert independent status. Missing/duplicate/foreign/unbound/extra-field/fake authority manifests fail closed.
3. A public `compareDisV020ElementContracts(previous,next)` helper checks **bounded same-major structural ABI**: identical version cannot drift silently, changed owner/domain/kind/selected Package requires a new independent compatibility path, removed public Function or previously declared dependency is forbidden in the same major. Increased minor version with unchanged owners/exports is allowed. It does **not** prove behavioral equivalence, cross-version semantic validity, source freshness, or permission to activate a new compiled AOT.
4. Native tests exercise the **real nine selected heterogeneous Elements**, including a two-public-Function Interaction Element and original Tally rule; malformed versions, unknown/foreign/unconsumed provenance, forged semantic Oracle and incompatible public Function changes are denied. Same real BUILD selection, pinned source bytes, native KDP load and SDK invocation remain in the Integration suite.

## High-impact migration boundary

**This is a deliberate breaking change to the previously experimental DIS 0.2.0 Draft program shape.** Every native producer must now supply `version` for each Element. Existing serialized v0.2 experimental AOTs without Element version are **no longer admissible under the new Draft qualifier** and must be rebuilt with a new trusted AOT digest; an installer cannot simply alter the old artifact or reuse the old installed digest. This does **not** modify frozen DIS 0.1.0, existing canonical v0.10 core BUILD, install permission, Host or KDP Effect authority. If Product/L1 later requires a legacy read path it must be separately specified and verified; current Draft intentionally fails closed.

## Incomplete work — no premature CORE-002/C1 promotion

The R29 DKE source-first reviewer was still **one model and not an independent domain Oracle**. Tally's GH 16:24→23:03 locator gap is still a **candidate overlay only**, not approved source history. R30 only validates version/source-pin structural contracts and bounded same-major ABI; cohesive semantic Element owner decisions, complete function-level validation metadata, independently accepted SAP obligations and dynamic cooperation contracts remain unqualified. The baseline **CORE-002 and CORE-005 stay PARTIAL**, all Core **9 VERIFIED / 7 PARTIAL**, Optional **4 NOT_RUN**, Governance **1 NOT_RUN**.

**CI status:** R30 code and matrix tests are not qualified until **the exact new SHA** reports DIS Integration SUCCESS and its relevant other CI contexts are reviewed. No arbitrary Node major version conformance requirement. No merge, Freeze, release or implicit Source/SAP/Effect permission.
