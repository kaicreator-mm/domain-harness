# v0.8 T-F WEB-ORACLE-1 — FR02 / FR07 historical differential map

Status: **SOURCE_PREPARED / LOCAL_NATIVE_TESTS_NOT_RUN / NOT_A_FUNCTIONAL_PASS**

This artifact is the WEB-ORACLE-1 output bound to Issue #1005 task pack
`#1005@6118653040` and Claim `#1005@6118726004`.

It does **not** modify PR #1012, PR #1016, the two real D2/D3 Business packages,
or production Kernel / Standard SDK source. It creates no Demo.

## 1. Exact subjects

### Historical accepted v0.7 oracle

```text
version/v0.7 = 86110c616b8cb18c730553e4cdab7ef555214521

FR02 source:
packages/domain-harness/src/expression/expression-runtime.ts
blob = c37cf23d4987088df8218a124d5a29efdd758e7c

FR02 tests:
packages/domain-harness/tests/expression/portable-expression.test.ts
blob = c9cf11e3114ccf5f1174cf77d174032de15cf6c7

FR07 source:
packages/domain-harness/src/harness/harness-machine.ts
blob = f2fe5d49138be550555e6b88863961778cb2ce0f

FR07 tests:
packages/domain-harness/tests/harness/business-harness-machine.test.ts
blob = 0c5622b5206ec15622f3ad706c67a4545f6e418b
```

### Physically selected v0.8 K/S used by this source-prep branch

```text
v0.8 base = 557e8ba53f90309c9d370d32b77d2dff070b8a5b

S:
packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs
blob = fa01e3cc70bc9a08bf14bd497dfb3fba79bd067f

K:
packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs
blob = f74f77ba6fbd882f9e4fdf0a6d661ce3fd348555

Oracle test:
packages/domain-harness-compiler/tests/v08-tf-oracle-fr02-fr07.test.ts
initial source commit = 419bf664bbf9065c103abf7b181277c06bd4aa5f
initial blob = bbdf0de28b4aaed4a4522c4f3442a583275180eb
```

The test computes Git blob SHA for the loaded K/S files before running semantic
controls. A later #1013 K-byte change is therefore **not silently inherited**.
Final runnable closure must rebind/review the exact post-#1013 subject.

## 2. Oracle rule

Historical expected behavior is the oracle. A changed public/API shape is not
itself a failure, because old-version API compatibility is out of scope.
However, a new v0.8 mechanism must still demonstrate equivalent **useful
behavior** before FR02/FR07 can be marked delivered.

A passing local control case below means only that the named narrow semantic
slice is present. It does not convert a GAP row into FR02/FR07 PASS.

## 3. FR02 — portable deterministic expression / script semantics

| Case | Exact v0.7 oracle | Current selected v0.8 K/S differential | Disposition |
|---|---|---|---|
| `V08-FR02-P-CONTROL-01` | deterministic replay using input value `21` | K has a bounded deterministic prepared predicate evaluator and repeats the same boolean result | CONTROL_ONLY; NOT full FR02 |
| `V08-FR02-P-F01` | expression `{"value": input.value * 2, "now": $now(), "millis": $millis()}` at `2026-09-17T02:00:00.123Z` yields exactly `{value:42, now:"2026-09-17T02:00:00.123Z", millis:1789610400123}` | S exposes only `schema/rule/decision/workflow/operation`; K predicate returns boolean and does not produce the historical script result | **GAP / TODO / NOT_RUN** |
| `V08-FR02-N-CONTROL-01` | non-portable JSON input/output is rejected | selected S rejects NaN, cycles and accessor-bearing input before interpretation | PARTIAL_CONTROL; output-side historical expression case still unproved |
| `V08-FR02-N-F02` | `$eval`, `$random`, and clock arguments are rejected by expression policy | no free-form expression execution surface exists in selected K/S | API_SHAPE_CHANGED; exact negative is NOT_EQUIVALENT, not a PASS |
| `V08-FR02-N-F03` | JSONata timeout maps to typed timeout; UTF-8 input/output byte limits are enforced | selected K/S has no equivalent expression timeout/byte-limit execution path | **GAP / TODO / NOT_RUN** |

**FR02 source-level result:** `GAP`.

The current K predicate engine is useful retained deterministic semantics, and
the selected S has strong JSON/data fail-closed behavior, but those do not
replace the historically delivered portable expression/script result,
logical-clock semantics, timeout and byte-limit behavior.

## 4. FR07 — bounded Harness model/query loop semantics

| Case | Exact v0.7 oracle | Current selected v0.8 K/S differential | Disposition |
|---|---|---|---|
| `V08-FR07-P-CONTROL-01` | bounded Harness ultimately returns structured decision/event | physical K→S can execute one admitted occurrence, invokes selected S exactly once, and commits only the Business-owned target state | CONTROL_ONLY; not the historical Harness loop |
| `V08-FR07-P-F01` | model query → allowed query observation/dependency → second model turn → `QUOTE` / `QUOTE_REQUESTED`; exactly two model requests | selected K occurrence path has no equivalent model→query→model loop or query-observation dependency surface | **GAP / TODO / NOT_RUN** |
| `V08-FR07-N-CONTROL-01` | model cannot smuggle transition/mutation/promotion/activation/governance authority | physical K/S control submits those authority-shaped fields as caller input; only the declared `value` projection reaches the event and Business-owned target remains authoritative | PARTIAL_CONTROL |
| `V08-FR07-N-CONTROL-02` | Harness query execution is bounded by an allowlist | current K Business role gate denies unauthorized caller before S interpretation | EXTRA v0.8 safety control; not an FR07 query substitute |
| `V08-FR07-N-F02` | unknown query => `UNKNOWN_CAPABILITY`; mutation query => `MUTATION_CAPABILITY_FORBIDDEN`, zero executor mutation | no current selected K/S Harness query-capability surface to exercise equivalent denials | **GAP / TODO / NOT_RUN** |
| `V08-FR07-N-F03` | `maxSteps` bounds model/query loop; active model/query cancellation => `CANCELLED` | no equivalent multi-turn Harness loop on selected K/S | **GAP / TODO / NOT_RUN** |
| `V08-FR07-N-F04` | ordinary query failure becomes structured observation and may recover; invalid query output => `QUERY_OUTPUT_INVALID` | no equivalent current query loop/output contract | **GAP / TODO / NOT_RUN** |

**FR07 source-level result:** `GAP`.

The current selected K proves a bounded authoritative occurrence and prevents
caller payload from choosing state. That is not evidence for the previously
delivered bounded model/query Harness semantics.

## 5. Narrow owner disposition

The frozen historical owner map remains:

```text
FR02:
  S Rule/Operation + H sandbox/worker + K admission

FR07:
  S Decision/Workflow + K bounded occurrence + H ModelPort
```

Post-merge T-D disposition `#1003@6113070243` assigns current-version
FR02/FR07 **runtime proof** to `#1005 + #1006`; it does not authorize this
Web Oracle branch to invent missing production semantics.

Therefore:

```text
ORACLE_SOURCE_OWNER = WEB-ORACLE-1 / #1005
PRODUCTION_FIX_OWNER = existing frozen S/K/H owners through a bounded owner task
REAL_D2_D3_PROOF_OWNER = #1005 after #1013 closure
RELEASE_MANIFEST_OWNER = #1006
THIS_BRANCH_PRODUCTION_FIX = NONE
```

If the Product intentionally drops FR02 expression execution or FR07
model/query Harness behavior, the owner must record an explicit approved scope
disposition. Absence is not silently treated as retention.

## 6. Honest execution status

```ini
WEB_SOURCE_PREP=COMPLETE
TEST_SOURCE=WRITTEN
CURRENT_K_S_EXACT_BLOB_BINDING=WRITTEN
LOCAL_NODE22=NOT_RUN
LOCAL_NODE24=NOT_RUN
LINUX=NOT_RUN
SQLITE=NOT_REQUIRED_BY_THIS_SOURCE_PREP_AND_NOT_RUN
FR02=GAP
FR07=GAP
CONTROL_CASES=SOURCE_WRITTEN_NOT_RUN
TODO_GAP_SENTINELS=7
INDEPENDENT_REVIEW=NOT_RUN
MERGE=NO
RELEASE=NO
```

No test PASS is claimed by this document.
