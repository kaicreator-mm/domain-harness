# DIS #1499 R95 — O1 source-pinned Knowledge and R83 Optional-state source-first review

OUTPUT_LABEL=`DIS_1499_R95_O1_R83_INDEPENDENT_REVIEW_REPAIR`

## Source-first acceptance basis

Read Product/L1 #1496, DIS v0.2.0 §8, `EVOLUTION_CONFORMANCE_R2.zh-CN.md` and `EVOLUTION_DESIGN_REPAIRS_R2.zh-CN.md` before implementation evidence.

- Harness is optional. LLM output is a bounded proposal, never business fact, Function binding, KDP permit or Effect.
- O1 must invoke the selected source-pinned Knowledge Function through AOT → SDK/KDP before any provider fallback; only a trusted Domain validator can establish semantic success.
- Disabled model, exhausted budget, concurrent overrun, exceptions, fake PASS/KDP/Effect claims, malformed provider output and unselected Function/provider must fail closed.
- R83 must preserve exact original R33/B22 source pins, current Matrix identity and state, no automatic Source Owner/SAP or Effect grant, and a strict UNKNOWN boundary.

## O1 findings

The native O1 test does invoke `xdownload.describePolicy` through `makeNativeFixture → compileDisV020Aot → loadDisV020Aot → app.invoke`. The original xDownload business source at commit `e904f08c478b15147b1c07fbe53c610d2d81851f` and the checked-in selected snapshot both read back as Git Blob `a7dba9a896de0b84fc6d54093563adca2ccbcdfc` (6,294 bytes). AOT compilation verifies the original `repository/commit/path/gitBlob` tuple and the source bytes; the SDK validates the selected local registry identity before invocation.

The mandatory Woodpecker integration command is `node --import tsx --test examples/dis-v020-native-sdk/o1-bounded-harness.test.mjs`. Four native tests cover native Knowledge before fixture fallback, disabled/zero-budget paths, unselected Provider/Function and invalid Effect entry, fake PASS/KDP/Effect claims, malformed output, provider error and concurrent `maxCalls=1`. Provider output is only `UNKNOWN`, `authority=NONE`, `qualified=false`, `effectDispatched=false`.

**No O1 promotion:** Provider is still `fixture-o1-provider`, not AOT-pinned or a real LLM. O1 stays PARTIAL.

### O1 P2 retained

The helper accepts an injected `app` and fails to require `observed.disposition === 'OBSERVED'`. A bounded Hosted-V8 counterexample supplied an app returning `kind=OBSERVATION, disposition=FAILED, authority=NONE, value.domainId=downloads`; helper re-labelled it `OBSERVED`. It remains `qualified=false`, `authority=NONE`, no Effect and the fixture helper is not production ABI. Keep as P2, not an SAP/Effect grant. Provider AOT selection, real LLM, timeout/multiround and actual provider execution remain outside this candidate.

## R83 P1 — profile identity was not bound to requirement ID

Original R83 `validateOriginalEvidence` pinned every requirement ID to an exact state and checked aggregate counts by `profile:state`, but omitted per-ID profile identity. A source-readback Hosted-V8 red probe swapped `profile` of `DIS020-CORE-002` and `DIS020-OPT-001`. Both are PARTIAL, so aggregate counters remained 13/3 + O1 PARTIAL / O2–4 NOT_RUN; standalone R83 accepted the misclassified Matrix and returned Core 13/3. The broader `validate.mjs` separately has `MATRIX_PROFILE_DRIFT`, but a standalone R83 invocation must enforce its own claimed exact source boundary.

### Same-PR repair

- `model-r83.mjs` now pins an exact `expectedProfile` for every requirement ID alongside the expected state: CORE→core, OPT→optional-profile, GOV→governance. Any state **or profile** drift is rejected.
- `test-r83.mjs` adds two source-grounded negatives: O1 PARTIAL→NOT_RUN demotion and a same-state CORE-002↔OPT-001 profile swap that preserves aggregate counters.
- `run-r83.mjs` updates the exact Git Blob pins for the changed model and tests; no original R33/B22 data, Reader, Matrix state or CI receipt was changed.

The expected R83 mutation suite is now 18 cases. Existing original source pins, 768 abstract states, 3 allowed source-tier reads + 768 unauthorized Reader rejections, SAP=0 and Effects=0 remain unchanged.

## CI chronology and forensic boundary

- #2448 at `d2e7e4f9807d3dab4acec5ed7b5e1843315577fd`: Integration FAILURE, Min-Node SUCCESS, Verify SUCCESS.
- #2449 at pre-repair HEAD `5d643fb046a243e44aff7c24c3425e4f51719bd0`: all three GitHub status contexts SUCCESS. These do not retroactively explain #2448 or qualify the new repair SHA.
- Raw #2448 first failing step/command/exit code were not retrievable from the connected GitHub/Web/browser tools. Do not infer a root cause from the later #2449 success or adjacent source changes. A locally authenticated Woodpecker API read is still required to close this forensic item.

## Gate conservation

Core 13/16 VERIFIED; CORE-002/005/016 PARTIAL. Optional O1 PARTIAL; O2–O4 NOT_RUN. Governance NOT_RUN. DKE R8 0/53, SAP=0, Effects=0. No GitHub Actions, auto-merge, Freeze or Release. The present reviewer can establish source-first order and exact source readback, but cannot attest this conversation is a wholly isolated authenticated Reviewer principal.
