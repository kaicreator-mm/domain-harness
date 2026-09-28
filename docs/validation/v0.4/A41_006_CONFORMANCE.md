# A41-006 Validation Evidence — cumulative DAC v0.0.4 + v0.0.4.1 conformance closure

**Task Issue:** #360 (dispatch comment `5862014041`)
**Branch:** `task/v0.4-A41-006-cumulative-conformance` → PR base `v0.4`
**Exact base:** `v0.4@1dfe646e99a4f0d6688be0fc4982b7f7925488e2` / tree `e545d0582abac9dc337d0a55f20b8f3cb79dbf46`
**DAC v0.0.4.1 semantic freeze:** `75fee75b782ac229720dccd18d2a4ca54b285e51` / tree `c74cf5e3a0e6745da3eda6999836b61ee8103c60`
**Execution environment:** Windows Build Host (Local Agent, local-first loop per pinned `standards/CI_EXECUTION_STANDARD.md` §10a), Node.js ≥ 22.
**Mode:** conformance-only; production source untouched; `PRODUCT_DEFECTS = 0`.

## 1. Gate evidence (executed at the final HEAD)

| Gate | Command | Result |
|---|---|---|
| FOCUSED (package) | `node --import tsx --test "tests/dac-v0041-conformance/*.test.ts"` (from `packages/domain-harness`) | **139/139 pass, 0 fail**, exit 0 |
| FOCUSED (root anchor) | `node --import tsx --test tests/conformance/dac-v0041-conformance-closure.test.ts` | **3/3 pass, 0 fail**, exit 0 |
| FULL_REGRESSION | root `npm test` (workspaces + root corpus + `tsc -p tsconfig.test.json --noEmit`) | **PASS**, exit 0 — 1841/1841, 0 fail (1692 package suite + 3 compiler + 100 node-host + 37 root tsx + 9 root script; 1699 prior + 142 new) |
| BUILD | `npm run build` (incl. committed-dist byte-identity check) | PASS, exit 0; `dist/**` unchanged |
| TYPECHECK | `npm run typecheck` | PASS, exit 0 |
| LINT | `npm run lint` | PASS, exit 0 (0 errors, 0 warnings) |
| PACKAGE | `npm pack -w @kaicreator/domain-harness` | PASS, exit 0 |
| PROJECT_STANDARD / PROFILE | `.dev-standard/VERSION` + `PROJECT_OVERRIDES.md` diff vs base | untouched at `3.4.0@418d244f23a6bf724acf5d4c4eff4ea292f1c4db`; Execution Pack disabled |
| DAC-PIN | `DAC_V0041_BASELINE` in `src/dac-v0041/contracts.ts` | untouched at freeze `75fee75b…` / tree `c74cf5e3…` |
| DIFF_CHECK | `git diff --stat v0.4@1dfe646..HEAD` | exactly the 9 authorized files (6 package suites + 1 root anchor + L3 evidence + this file) |
| CLEAN_TREE | `git status --porcelain` (tracked) | clean; no source modifications after validation |

CI disposition: recorded in the #360 build-host result comment (Woodpecker
exact-head run when available; otherwise the authorized exact-SHA clean
local fallback above is the evidence — CI unavailability is never reported
as PASS).

## 2. Per-row conformance map (C78–C172, F-01..F-08)

Legend — disposition preserved verbatim from the reviewed #348 audit
(comment `5836333294`): `NO` = NOT_OWNED (proven as an external-authority
boundary: registry containment + fail-closed consumption + no issuance
surface), `CO` = CONFORMANCE_ONLY, `ID` = IMPLEMENTATION_DELTA (executed
against the A41-002..A41-005 successor surface). Every row is one `test()`
whose title starts with the row ID; suite files:

- `M1` = `tests/dac-v0041-conformance/dac-v0041-conformance-matrix-c078-c117.test.ts`
- `M2` = `tests/dac-v0041-conformance/dac-v0041-conformance-matrix-c118-c172.test.ts`
- `F`  = `tests/dac-v0041-conformance/dac-v0041-conformance-f01-f08.test.ts`
- `J`  = `tests/dac-v0041-conformance/dac-v0041-conformance-positive-journey.test.ts`
- `A`  = `tests/dac-v0041-conformance/dac-v0041-conformance-adversarial.test.ts`
- `N`  = `tests/dac-v0041-conformance/dac-v0041-conformance-not-owned.test.ts`
- `R`  = `tests/conformance/dac-v0041-conformance-closure.test.ts`

### C78–C117 (additive v0.0.4)

| Row | Disp | Anchor(s) | Verified result |
|---|---|---|---|
| C78 | NO | M1 | authored-candidate as promotion coverage → intake FAIL_CLOSED ROLE_MISMATCH |
| C79 | NO | M1 | simulation-result as promotion coverage → FAIL_CLOSED ROLE_MISMATCH |
| C80 | NO | M1 | non-selection ref in selection position → FAIL_CLOSED ROLE_MISMATCH |
| C81 | CO | M1 | mutable-alias identity refused at mint (MUTABLE_ALIAS_REJECTED) |
| C82 | CO | M1 | subject without required targets → association FAIL_CLOSED INVALID_FACTS |
| C83 | CO | M1 | explicit unsupported target → INCOMPATIBLE (target-support phase) |
| C84 | ID | M1 | kind absence → blocked/missing-capability, target not judged; advisory hint never occupies the binding target slot |
| C85 | ID | M1 | material staleness → STALE (exactness-currentness phase) |
| C86 | CO | M1 | request without exact DAC profile → REQUEST_SUBJECT_CLOSURE_MISMATCH |
| C87 | NO | M1 | capability evaluation polarity external; refusal = separate negative authority decision (MATERIAL_REFUSAL_PRESENT) |
| C88 | NO | M1 | manifest-issuance-request ↔ manifest alias → REQUEST_RESULT_ALIAS |
| C89 | ID | M1 | compat request ↔ validation view alias → REQUEST_RESULT_ALIAS / REQUEST_VIEW_ALIAS |
| C90 | ID | M1 | self-designation → chain FAIL_CLOSED SELF_DESIGNATION |
| C91 | ID | M1 | Composer-derived chain → FAIL_CLOSED COMPOSER_DESIGNATOR |
| C92 | ID | M1 | co-hosted issuer without SoD permission → binding FAIL_CLOSED SOD_PERMISSION_MISSING |
| C93 | ID | M1 | permission + disclosure → allowed (BINDING_VERIFIED) |
| C94 | ID | M1 | effective-from before evidenced issuance → BACKDATED_EFFECTIVE_FROM |
| C95 | ID | M1 | ordinary expiry prospective: current during window, STALE expired after |
| C96 | ID | M1 | authorized retroactive void → FAIL_CLOSED (CHAIN_VOIDED family) |
| C97 | NO | M1 | refusal omission → intake MATERIAL_REFUSAL_OMITTED; standing refusal blocks favorable close |
| C98 | ID | M1 | contradictory results → CONTRADICTORY_AUTHORITATIVE_RESULTS |
| C99 | ID | M1 | binding-time check as compatibility result → BINDING_CHECK_MISCLASSIFIED |
| C100 | ID | M1 | Composer-issued binding → UNAUTHORIZED_BINDING_ISSUER (chainCode COMPOSER_DESIGNATOR) |
| C101 | NO | M1 | AssemblyPlan as selection authority → FAIL_CLOSED ROLE_MISMATCH |
| C102 | ID | M1 | no owner anchor → ROOT_ANCHOR_UNESTABLISHED |
| C103 | NO | M1 | legacy Domain Data grandfathered → FAIL_CLOSED ROLE_MISMATCH |
| C104 | NO | M1 | business instance records as Domain Data → FAIL_CLOSED (ROLE_MISMATCH/INCOMPLETE_SELECTED_TUPLE) |
| C105 | ID | M1 | predecessor wrap → ADOPTION_REQUIRED; v0.0.4 baseline never satisfies the successor pin |
| C106 | ID | M1 | undesignated semantic issuer → NON_DESIGNATED_VALIDATOR |
| C107 | CO | M1 | COMPATIBLE_VERDICT/binding carry no-implication markers (selection/binding/activation) |
| C108 | ID | M1 | binding request ↔ binding result alias → REQUEST_RESULT_ALIAS |
| C109 | NO | M1 | designation request ↔ designation alias → REQUEST_RESULT_ALIAS |
| C110 | NO | M1 | conformance request ↔ verdict alias → REQUEST_RESULT_ALIAS |
| C111 | CO | M1, J, R | complete greenfield chain verifies with identity propagation |
| C112 | CO | M1, J | brownfield: ADOPTED_PROSPECTIVE then fresh successor intake INTAKE_VERIFIED |
| C113 | ID | M1 | non-designated issuer result → NON_DESIGNATED_VALIDATOR (association + precedence) |
| C114 | NO | M1 | authoring request ↔ authored-candidate alias → REQUEST_RESULT_ALIAS |
| C115 | NO | M1 | superseded plan → STALE for authoritative reuse |
| C116 | ID | M1 | revoked promotion carried forward → COVERAGE_INVALIDATED |
| C117 | NO | M1, A | alias refused → exact identity resolved and pinned (positive path) |

### C118–C172 (additive v0.0.4.1)

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
| C126 | ID | M2 | retroactive void cascade → FAIL_CLOSED (VOID_INVALIDATES_DESCENDANT family); pre-void issuance stays historical |
| C127 | ID | M2 | invalid end act → rejected (unauthorized-issuer), no effect on end(L) |
| C128 | ID | M2 | unevidenced issuance (chain + adoption) → ISSUANCE_EVIDENCE_UNESTABLISHED |
| C129 | ID | M2 | self-designation / repeated issuer / Composer designator → respective codes |
| C130 | ID | M2 | unestablished owner anchor → ROOT_ANCHOR_UNESTABLISHED |
| C131 | ID | M2 | owner-direct designation → CHAIN_CURRENT |
| C132 | ID | M2 | valid delegated promotion grant → CHAIN_CURRENT |
| C133 | NO | M2 | verdict independence external: registry vocabulary + anti-alias bar |
| C134 | NO | M2 | verdict minima external: verdict identity consumed identity-only |
| C135 | NO | M2 | verdict reuse after identity change → STALE |
| C136 | NO | M2 | verdict artifacts non-adoptable (NON_ADOPTABLE_CLASS) |
| C137 | NO | M2 | authoring result anti-alias (request/result/candidate) |
| C138 | NO | M2 | authored candidate without provenance → ROLE_MISMATCH |
| C139 | NO | M2 | non-produced outcomes imply no candidates (polarity table) |
| C140 | ID | M2 | selection without valid establishment → UNAUTHORIZED_ISSUER / ESTABLISHMENT_ORDER_VIOLATED |
| C141 | ID | M2 | establishment ↔ semantic identity alias → IDENTITY_ALIAS |
| C142 | ID | M2 | refusal reclassified → REFUSAL_RECLASSIFIED; seam conflation → REFUSAL_SEAM_CONFLATED |
| C143 | ID | M2 | omitted refusal → MATERIAL_REFUSAL_OMITTED + MATERIAL_REFUSAL_PRESENT |
| C144 | CO | M2 | two views, one authority, distinct request → VALID_TWO_VIEW |
| C145 | ID | M2 | pre-v0.0.4 artifact direct use → ADOPTION_REQUIRED |
| C146 | ID | M2 | valid adoption → ADOPTED_PROSPECTIVE from adoption point |
| C147 | ID | M2 | wrapper/wrong-role/non-adoptable → ADOPTION_ISSUER_MISMATCH family / NON_ADOPTABLE_CLASS |
| C148 | ID | M2 | producer self-approval → SELF_APPROVAL (incurable) |
| C149 | ID | M2 | co-hosting needs BOTH permission and disclosure |
| C150 | ID | M2 | missing kind precedes unsupported-target judgment |
| C151 | ID | M2 | stale + unsupported → STALE |
| C152 | ID | M2 | structural invalidity dominates staleness |
| C153 | ID | M2 | descriptor/kind/stale ladder deterministic |
| C154 | ID | M2 | non-designated issuer → NON_DESIGNATED_VALIDATOR (both rungs) |
| C155 | ID | M2 | promotion/selection/establishment/activation request-result anti-alias (4 chains) |
| C156 | ID | M2 | negative decision as favorable → FAVORABLE_CLAIM_UNBACKED |
| C157 | ID | M2 | revoked → FAIL_CLOSED; superseded → STALE; revoked selection → SELECTION_INVALIDATED |
| C158 | ID | M2 | accepted/pending never a decision (empty evidence → FAVORABLE_CLAIM_UNBACKED) |
| C159 | ID | M2 | depth-1 attenuation chain → CHAIN_CURRENT |
| C160 | ID | M2 | dropped root constraint → CONSTRAINT_NOT_INHERITED |
| C161 | ID | M2 | excluded profile → PROFILE_NOT_PERMITTED |
| C162 | ID | M2 | excluded SoD permission → SOD_PERMISSION_NOT_PERMITTED |
| C163 | ID | M2 | designation/attestation adoption → NON_ADOPTABLE_CLASS |
| C164 | ID | M2 | out-of-authority adoption → CONSTRAINT_NOT_COVERED / PROFILE_NOT_COVERED |
| C165 | ID | M2 | same-class adoption → ADOPTED_PROSPECTIVE |
| C166 | ID | M2 | unauthorized revocation → no effect (rejectedEndActs) |
| C167 | ID | M2 | non-holder relinquishment → no effect (issuer-not-holder) |
| C168 | ID | M2 | unowned envelope scope → ROOT_ANCHOR_UNESTABLISHED |
| C169 | ID | M2 | legit multi-role validator/binding issuer → BINDING_VERIFIED |
| C170 | ID | M2 | kind absence dominates reused staleness |
| C171 | ID | M2 | kind offered + pinned stale → STALE at Step 2 |
| C172 | ID | M2 | backdated revocation → no effect (backdated) |

### F-01..F-08 group mapping

| F | Classification | Owning executable surface | Group anchors |
|---|---|---|---|
| F-01 designation delegation/currentness | ID (verifier, never issuer) | `verifyDacV0041DesignationChain` (+ end acts, `classifyDacV0041HistoricAuthorityArtifactUse`) | M2 C118–C132/C159–C162/C166–C168/C172, F, J stage 0 |
| F-02 conformance independence | NOT_OWNED | registry vocabulary + fail-closed consumption only | M2 C133–C136, F, N |
| F-03 Domain authoring result role | NOT_OWNED | registry vocabulary + anti-alias + polarity | M2 C137–C139, F, N |
| F-04 application identity/refusal | ID (intake verifier) | `verifyDacV0041CompositionIntake`, `verifyDacV0041AuthorityRefusalEvidence` | M2 C140–C143, F, J stage 1 |
| F-05 compatibility two-view | CO | `verifyDacV0041CompatibilityViewAssociation` | M2 C144, F, J stage 2 |
| F-06 predecessor authority adoption | ID | `verifyDacV0041AuthorityAdoption` | M2 C145–C147/C163–C165, F, J stage 0 |
| F-07 decision/producer SoD | ID | binding/activation SoD rungs | M2 C148–C149/C169, F, A |
| F-08 capability/currentness/request precedence | ID | `classifyDacV0041CapabilityExchange`, `classifyDacV0041CompatibilityPrecedence`, `classifyDacV0041CurrentnessUse` | M2 C150–C158/C170–C171, F, A |

### Cross-cutting closures

| #360 dimension | Anchor(s) |
|---|---|
| connected positive boundary journey (designation/adoption → intake → compatibility → binding → activation → consequence) | J stages 0–5 (§11 implementation-specific shape; identity cross-checks; 3 coherent tamper probes) + R |
| adversarial closure families | A (16 tests) + matrix negatives |
| NOT_OWNED authority boundaries | N (8 tests) + NO rows above |
| historical v0.0.3 separately version-bound | F (DAC_V003_BASELINE ≠ successor pin; v0.0.3 baseline rejected as successor pin) |
| no fabricated intermediate v0.0.4 release | F (v0.0.4 = predecessor evidence-only identity) |

## 3. What was NOT proven

- No host-durability, Expo/Hermes, migration/compatibility, packaging-install, Critical Journey, Hidden Validation or release-level claim is made here: those remain version-closure concerns per the Validation Execution Profile (A41-006 is not Version Closure or Release Qualification).
- The successor verifiers are exercised as pure deterministic consumers over externally recovered facts; real persistence/publication of the underlying authority artifacts is external to this task.
- NOT_OWNED rows prove the boundary (containment, fail-closed consumption, no issuance surface), not the external authorities' own correctness — that belongs to their owning surfaces.
- `PR PASS != Release PASS`.
