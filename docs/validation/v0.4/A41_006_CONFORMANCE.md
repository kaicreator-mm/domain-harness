# A41-006 / A41-006R1 Validation Evidence — cumulative DAC v0.0.4 + v0.0.4.1 conformance closure

**Original Task:** #360  
**Repair Task:** #399 / comment `5862956590`  
**PR:** #395, branch `task/v0.4-A41-006-cumulative-conformance` → base `v0.4`  
**Exact base:** `v0.4@1dfe646e99a4f0d6688be0fc4982b7f7925488e2` / tree `e545d0582abac9dc337d0a55f20b8f3cb79dbf46`  
**Failed reviewed HEAD:** `bafcf19970eb8f63cf9fd58137e42cd52eb816c1` / tree `386fb056c304a4e579e1b8e397d77b434e7af29c`  
**DAC v0.0.4.1 semantic freeze:** `75fee75b782ac229720dccd18d2a4ca54b285e51` / tree `c74cf5e3a0e6745da3eda6999836b61ee8103c60`  
**Mode:** conformance-only; production source untouched; `PRODUCT_DEFECTS = 0`.

## 1. R1 validation posture

Fresh Independent Review #396 comment `5862804618` found two conformance-evidence defects on `bafcf199...`: C102/C116 ownership classification drift and a disconnected brownfield adoption leg. A41-006R1 repairs those artifacts on the same PR.

Executable evidence from `bafcf199...` is **historical only** and does not transfer to the repaired exact HEAD. This Web/static repair phase does not claim new-head focused/full/build/typecheck/lint/package PASS.

| Gate | Required command / evidence | R1 status before local batch |
|---|---|---|
| FOCUSED (package) | `node --import tsx --test "tests/dac-v0041-conformance/*.test.ts"` from `packages/domain-harness` | **DEFERRED** |
| FOCUSED (root) | `node --import tsx --test tests/conformance/dac-v0041-conformance-closure.test.ts` | **DEFERRED** |
| FULL_REGRESSION | root `npm test` | **DEFERRED** |
| BUILD | `npm run build` | **DEFERRED** |
| TYPECHECK | `npm run typecheck` | **DEFERRED** |
| LINT | `npm run lint` | **DEFERRED** |
| PACKAGE | `npm pack -w @kaicreator/domain-harness` | **DEFERRED** |
| DIFF/CLEAN | `git diff --check`; `git status --porcelain`; exact base→HEAD write-set | executable local checks **DEFERRED**; GitHub write-set inspected separately |
| CI | exact-head CI/status | **DEFERRED unless an exact-head run later reports success** |

Deferred execution is tracked by #400 / DLB-001. The governing handoff is:

```text
LOCAL_VALIDATION = DEFERRED
NEXT = LOCAL_BATCH
```

Static source accounting after R1 authoring is **141 package `test()` definitions + 3 root tests = 144**. This is not a PASS count.

## 2. Per-row conformance map (C78–C172, F-01..F-08)

Legend — dispositions remain the reviewed #348 audit values (comment `5836333294`): `NO` = NOT_OWNED, `CO` = CONFORMANCE_ONLY, `ID` = IMPLEMENTATION_DELTA. R1 restores the two drifted rows, so C78–C117 aggregate remains exactly `NO=16 / CO=7 / ID=17`.

Suite aliases:

- `M1` = `tests/dac-v0041-conformance/dac-v0041-conformance-matrix-c078-c117.test.ts`
- `M2` = `tests/dac-v0041-conformance/dac-v0041-conformance-matrix-c118-c172.test.ts`
- `F`  = `tests/dac-v0041-conformance/dac-v0041-conformance-f01-f08.test.ts`
- `J`  = `tests/dac-v0041-conformance/dac-v0041-conformance-positive-journey.test.ts`
- `H`  = `tests/dac-v0041-conformance/brownfield-connected-journey.ts` (test-only helper)
- `A`  = `tests/dac-v0041-conformance/dac-v0041-conformance-adversarial.test.ts`
- `N`  = `tests/dac-v0041-conformance/dac-v0041-conformance-not-owned.test.ts`
- `R`  = `tests/conformance/dac-v0041-conformance-closure.test.ts`

### C78–C117 (additive v0.0.4)

| Row | Disp | Anchor(s) | Verified intent / expected executable result |
|---|---|---|---|
| C78 | NO | M1 | authored-candidate as promotion coverage → intake FAIL_CLOSED ROLE_MISMATCH |
| C79 | NO | M1 | simulation-result as promotion coverage → FAIL_CLOSED ROLE_MISMATCH |
| C80 | NO | M1 | non-selection ref in selection position → FAIL_CLOSED ROLE_MISMATCH |
| C81 | CO | M1 | mutable-alias identity refused at mint (MUTABLE_ALIAS_REJECTED) |
| C82 | CO | M1 | subject without required targets → association FAIL_CLOSED INVALID_FACTS |
| C83 | CO | M1 | explicit unsupported target → INCOMPATIBLE (target-support phase) |
| C84 | ID | M1 | kind absence → blocked/missing-capability, target not judged; advisory hint never occupies binding target |
| C85 | ID | M1 | material staleness → STALE (exactness-currentness phase) |
| C86 | CO | M1 | request without exact DAC profile → REQUEST_SUBJECT_CLOSURE_MISMATCH |
| C87 | NO | M1 | capability evaluation polarity external; refusal remains separate negative authority decision |
| C88 | NO | M1 | manifest-issuance-request ↔ manifest alias → REQUEST_RESULT_ALIAS |
| C89 | ID | M1 | compat request ↔ validation view alias → REQUEST_RESULT_ALIAS / REQUEST_VIEW_ALIAS |
| C90 | ID | M1 | self-designation → chain FAIL_CLOSED SELF_DESIGNATION |
| C91 | ID | M1 | Composer-derived chain → FAIL_CLOSED COMPOSER_DESIGNATOR |
| C92 | ID | M1 | co-hosted issuer without SoD permission → binding FAIL_CLOSED SOD_PERMISSION_MISSING |
| C93 | ID | M1 | permission + disclosure → BINDING_VERIFIED |
| C94 | ID | M1 | effective-from before evidenced issuance → BACKDATED_EFFECTIVE_FROM |
| C95 | ID | M1 | ordinary expiry prospective: current during window, STALE after expiry |
| C96 | ID | M1 | authorized retroactive void → FAIL_CLOSED (CHAIN_VOIDED family) |
| C97 | NO | M1 | refusal omission → MATERIAL_REFUSAL_OMITTED; standing refusal blocks favorable close |
| C98 | ID | M1 | contradictory results → CONTRADICTORY_AUTHORITATIVE_RESULTS |
| C99 | ID | M1 | binding-time check as compatibility result → BINDING_CHECK_MISCLASSIFIED |
| C100 | ID | M1 | Composer-issued binding → UNAUTHORIZED_BINDING_ISSUER / COMPOSER_DESIGNATOR |
| C101 | NO | M1 | AssemblyPlan as selection authority → FAIL_CLOSED ROLE_MISMATCH |
| **C102** | **NO** | M1 | **NOT_OWNED consumer boundary:** inferred brownfield promotion authority without owner scope anchor → ROOT_ANCHOR_UNESTABLISHED |
| C103 | NO | M1 | legacy Domain Data grandfathered as promoted coverage → FAIL_CLOSED ROLE_MISMATCH |
| C104 | NO | M1 | business instance records as Domain Data → FAIL_CLOSED (ROLE_MISMATCH / INCOMPLETE_SELECTED_TUPLE) |
| C105 | ID | M1 | predecessor wrap → ADOPTION_REQUIRED; v0.0.4 baseline never satisfies successor pin |
| C106 | ID | M1 | undesignated semantic issuer → NON_DESIGNATED_VALIDATOR |
| C107 | CO | M1 | COMPATIBLE_VERDICT/binding carry no-implication markers |
| C108 | ID | M1 | binding request ↔ binding result alias → REQUEST_RESULT_ALIAS |
| C109 | NO | M1 | designation request ↔ designation alias → REQUEST_RESULT_ALIAS |
| C110 | NO | M1 | conformance request ↔ verdict alias → REQUEST_RESULT_ALIAS |
| C111 | CO | M1 | greenfield chain verifies with identity propagation |
| **C112** | **CO** | **M1, H, J, R** | **connected brownfield chain:** historic use ADOPTION_REQUIRED → ADOPTED_PROSPECTIVE → exact successor promotion ref for same identity/scope → that exact ref is intake coverage → compatibility → binding → activation → consequence |
| C113 | ID | M1 | non-designated issuer result → NON_DESIGNATED_VALIDATOR |
| C114 | NO | M1 | authoring request ↔ authored-candidate alias → REQUEST_RESULT_ALIAS |
| C115 | NO | M1 | superseded plan → STALE for authoritative reuse |
| **C116** | **NO** | M1 | **NOT_OWNED consumer boundary:** revoked external PromotionDecisionRef carried into intake → COVERAGE_INVALIDATED |
| C117 | NO | M1, A | alias refused → exact identity resolves and stays pinned |

### C118–C172 (additive v0.0.4.1)

R1 does not reclassify or otherwise modify these reviewed rows.

| Row | Disp | Anchor(s) | Verified result |
|---|---|---|---|
| C118 | ID | M2 | promotion-role parent → PARENT_ROLE_NOT_DESIGNATION_ISSUANCE |
| C119 | ID | M2 | out-of-envelope role → ROLE_NOT_ENVELOPED |
| C120 | ID | M2 | out-of-envelope scope → SCOPE_NOT_ENVELOPED |
| C121 | ID | M2 | weakened constraints / foreign profile → CONSTRAINT_NOT_INHERITED / PROFILE_NOT_PERMITTED |
| C122 | ID | M2 | widened window / pre-evidence effect → WINDOW_NOT_ATTENUATED / BACKDATED_EFFECTIVE_FROM |
| C123 | ID | M2 | excluded SoD permission → SOD_PERMISSION_NOT_PERMITTED |
| C124 | ID | M2 | depth-exhausted re-delegation → REDELEGATION_NOT_PERMITTED |
| C125 | ID | M2 | ancestor expired at issuance → ANCESTOR_NOT_CURRENT_AT_ISSUANCE |
| C126 | ID | M2 | retroactive void cascade → FAIL_CLOSED (VOID_INVALIDATES_DESCENDANT family) |
| C127 | ID | M2 | invalid end act → rejected, no effect on end(L) |
| C128 | ID | M2 | unevidenced issuance (chain + adoption) → ISSUANCE_EVIDENCE_UNESTABLISHED |
| C129 | ID | M2 | self-designation / repeated issuer / Composer designator → respective codes |
| C130 | ID | M2 | unestablished owner anchor → ROOT_ANCHOR_UNESTABLISHED |
| C131 | ID | M2 | owner-direct designation → CHAIN_CURRENT |
| C132 | ID | M2 | valid delegated promotion grant → CHAIN_CURRENT |
| C133 | NO | M2 | verdict independence external: registry vocabulary + anti-alias bar |
| C134 | NO | M2 | verdict minima external: verdict identity consumed identity-only |
| C135 | NO | M2 | verdict reuse after identity change → STALE |
| C136 | NO | M2 | verdict artifacts non-adoptable → NON_ADOPTABLE_CLASS |
| C137 | NO | M2 | authoring result anti-alias |
| C138 | NO | M2 | authored candidate without provenance → ROLE_MISMATCH |
| C139 | NO | M2 | non-produced outcomes imply no candidates |
| C140 | ID | M2 | selection without valid establishment → UNAUTHORIZED_ISSUER / ESTABLISHMENT_ORDER_VIOLATED |
| C141 | ID | M2 | establishment ↔ semantic identity alias → IDENTITY_ALIAS |
| C142 | ID | M2 | refusal reclassified / seam conflated → REFUSAL_RECLASSIFIED / REFUSAL_SEAM_CONFLATED |
| C143 | ID | M2 | omitted refusal → MATERIAL_REFUSAL_OMITTED + MATERIAL_REFUSAL_PRESENT |
| C144 | CO | M2 | two views, one authority, distinct request → VALID_TWO_VIEW |
| C145 | ID | M2 | pre-v0.0.4 artifact direct use → ADOPTION_REQUIRED |
| C146 | ID | M2 | valid adoption → ADOPTED_PROSPECTIVE from adoption point |
| C147 | ID | M2 | wrapper/wrong-role/non-adoptable → adoption failure family |
| C148 | ID | M2 | producer self-approval → SELF_APPROVAL |
| C149 | ID | M2 | co-hosting needs BOTH permission and disclosure |
| C150 | ID | M2 | missing kind precedes unsupported-target judgment |
| C151 | ID | M2 | stale + unsupported → STALE |
| C152 | ID | M2 | structural invalidity dominates staleness |
| C153 | ID | M2 | descriptor/kind/stale ladder deterministic |
| C154 | ID | M2 | non-designated issuer → NON_DESIGNATED_VALIDATOR |
| C155 | ID | M2 | promotion/selection/establishment/activation request-result anti-alias |
| C156 | ID | M2 | negative decision as favorable → FAVORABLE_CLAIM_UNBACKED |
| C157 | ID | M2 | revoked → FAIL_CLOSED; superseded → STALE; revoked selection → SELECTION_INVALIDATED |
| C158 | ID | M2 | accepted/pending never a decision |
| C159 | ID | M2 | depth-1 attenuation chain → CHAIN_CURRENT |
| C160 | ID | M2 | dropped root constraint → CONSTRAINT_NOT_INHERITED |
| C161 | ID | M2 | excluded profile → PROFILE_NOT_PERMITTED |
| C162 | ID | M2 | excluded SoD permission → SOD_PERMISSION_NOT_PERMITTED |
| C163 | ID | M2 | designation/attestation adoption → NON_ADOPTABLE_CLASS |
| C164 | ID | M2 | out-of-authority adoption → CONSTRAINT_NOT_COVERED / PROFILE_NOT_COVERED |
| C165 | ID | M2 | same-class adoption → ADOPTED_PROSPECTIVE |
| C166 | ID | M2 | unauthorized revocation → no effect |
| C167 | ID | M2 | non-holder relinquishment → no effect |
| C168 | ID | M2 | unowned envelope scope → ROOT_ANCHOR_UNESTABLISHED |
| C169 | ID | M2 | legit multi-role validator/binding issuer → BINDING_VERIFIED |
| C170 | ID | M2 | kind absence dominates reused staleness |
| C171 | ID | M2 | kind offered + pinned stale → STALE |
| C172 | ID | M2 | backdated revocation → no effect |

### F-01..F-08 group mapping

| F | Classification | Owning executable surface | Group anchors |
|---|---|---|---|
| F-01 designation delegation/currentness | ID (verifier, never issuer) | `verifyDacV0041DesignationChain` | M2, F, H/J |
| F-02 conformance independence | NOT_OWNED | registry vocabulary + fail-closed consumption only | M2, F, N |
| F-03 Domain authoring result role | NOT_OWNED | registry vocabulary + anti-alias + polarity | M2, F, N |
| F-04 application identity/refusal | ID (intake verifier) | `verifyDacV0041CompositionIntake`, refusal verifier | M2, F, H/J |
| F-05 compatibility two-view | CO | compatibility association verifier | M2, F, H/J |
| F-06 predecessor authority adoption | ID | authority adoption verifier | M2, F, H/J |
| F-07 decision/producer SoD | ID | binding/activation SoD rungs | M2, F, A |
| F-08 capability/currentness/request precedence | ID | capability/currentness/precedence classifiers | M2, F, A |

## 3. R1 connected-boundary proof shape

`H` is the shared test-only orchestrator consumed by `J`, C112 in `M1`, and the root `R` suite. The positive path binds one exact historic promotion subject into one successor-native external promotion ref and then uses that exact ref in the first selected-domain-data coverage row of **one** canonical implementation-specific Runtime `bindingInput`.

Expected positive stage order:

```text
historic-use
  ADOPTION_REQUIRED
adoption
  ADOPTED_PROSPECTIVE
transition
  same class + primary identity + scope
  successorAuthorityPoint >= adoption issuance/effective point
intake
  INTAKE_VERIFIED and promotionCoverageRef === successorPromotion
compatibility
  VALID_TWO_VIEW + COMPATIBLE_VERDICT
binding
  BINDING_VERIFIED
activation
  ACTIVATION_VERIFIED
consequence
  RUNTIME_STATE_NOT_SOR_TRUTH + EXTERNAL_SOR_EVIDENCE_ONLY
```

Expected transition/adoption negatives use the same helper and must stop before downstream success:

- subject mismatch → `stage=transition / ADOPTION_SUCCESSOR_CONTINUITY_MISMATCH`;
- scope mismatch → same;
- successor authority point before adoption → same;
- wrong adoption issuer → `stage=adoption / ADOPTION_ISSUER_MISMATCH`;
- backdated adoption → `stage=adoption / BACKDATED_ADOPTION`.

Existing later-stage probes are preserved on the connected `bindingInput`: revoked promotion coverage → intake/binding fail closed; incompatible compatibility verdict → binding fails; revoked binding reuse → activation fails.

## 4. Cumulative write-set and authority boundary

The cumulative PR write set after R1 is expected to be **10 paths**: the original 9 conformance/docs paths plus `brownfield-connected-journey.ts`. R1 itself edits/adds only six allowed paths. No `src/**`, `.dev-standard/**`, configuration, package metadata or `dist/**` path is part of the authorized repair.

`C102` and `C116` remain external-authority/NOT_OWNED rows. The Harness checks only that consumed evidence satisfies required authority/currentness conditions; it does not issue the owner anchor or promotion authority.

## 5. What is not yet proven on the repaired exact HEAD

- No new-head focused/full regression/build/typecheck/lint/package command has been claimed by this Web/static repair phase.
- No exact-head CI success is claimed unless an actual run later appears for the repaired SHA.
- No Hidden Validation, Critical Journey, packaging-installability or Release Qualification has been started.
- No Version Closure authority is created by this repair.
- `PR PASS != Release PASS`.

After the local batch supplies exact-SHA executable evidence, #399 requires a NEW Fresh Independent ChatGPT Web review. The PR must remain unmerged until that review passes.
