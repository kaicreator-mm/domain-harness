# v0.8 T-F WEB-ORACLE-1 — FR02 / FR07 historical differential map

Status: **SELECTED_PATH_REBOUND / REAL_TESTS / PR_EVIDENCE_ONLY (not Release PASS)**

This artifact was first written as the WEB-ORACLE-1 source-prep output bound
to Issue #1005 task pack `#1005@6118653040` and Claim `#1005@6118726004`
(seven `test.todo` GAP sentinels, no execution). It is now rebound under the
#1003 dispatch `#1003@6151642076` (Builder Claim `#1003@6151850290`): each
former sentinel is a **real executable test on the current selected K/S/Host
physical path**.

It does **not** modify PR #1012, production Kernel / Standard SDK / Host
source, `dist/**`, `helpers.ts` or any existing test fixture. It creates no
Demo. Evidence below is PR-level evidence; `PR PASS != Release PASS`.

## 1. Exact subjects

### Historical accepted v0.7 oracle (unchanged pins)

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

### Original WEB-ORACLE-1 source-prep subject (historical record)

```text
v0.8 base = 557e8ba53f90309c9d370d32b77d2dff070b8a5b
S blob    = fa01e3cc70bc9a08bf14bd497dfb3fba79bd067f
K blob    = f74f77ba6fbd882f9e4fdf0a6d661ce3fd348555
oracle test initial commit = 419bf664bbf9065c103abf7b181277c06bd4aa5f
```

### Current selected v0.8 subject of this rebind

```text
v0.8 base = 022e2b4c699c2351ded77efca65a0c8b492d3aeb
  includes FR02 S  (PR #1019, payloadExpression)
           FR07-S1 (PR #1022, invokeStep)
           FR07-KH2 (PR #1025, merge b9d0a14: K continuation + H gateway.cancel)

S: packages/domain-harness-compiler/src/qualified-package/payload/standard-sdk-v1.mjs
   blob = 905d29183efb94bafd3bd2cb2d5a8dfbcf9e4b2a
K: packages/domain-harness-compiler/src/qualified-package/payload/kernel-mechanism-v1.mjs
   blob = efbd8e60044a06ba0158e05ccea2919582c728b3
```

The compiler oracle test (`WEB-ORACLE-1 META`) computes the Git blob SHA of
the loaded K/S files and asserts these exact values, so a later K/S byte
change (for example the #1005 D3 Kernel work) is **not silently inherited**:
whichever change lands second must re-review and rebind this pin.

## 2. Oracle rule

Historical expected behavior is the oracle. A changed public/API shape is not
itself a failure, because old-version API compatibility is out of scope, but
every adaptation is listed explicitly below. No test was weakened; where a
v0.7 observable has no exact counterpart the adaptation is named.

## 3. Test locations

| Level | File | What it proves |
|---|---|---|
| L1 K→S in-memory differential | `packages/domain-harness-compiler/tests/v08-tf-oracle-fr02-fr07.test.ts` | the exact selected K/S payload modules (blob-pinned) with an in-memory CAS Host port; FR07 uses the real S `createHostBoundModelResolver().invokeStep` |
| L2 selected physical path | `packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-physical.test.ts` | compiler BUILD (qualification → issuer approval → seal) → approved root → `bootstrapTrustedHost` (REAL SQLite file via `openSqliteCasStore`, delegating read-counter wrapper; physical scripted ModelPort) → Host kernel gateway `registerApp` → authenticated `gateway.send` / `gateway.cancel` → selected K → S |
| L3 stock-Node dist consumer | `packages/domain-harness/tests/v08-integration/v08-tf-fr02-fr07-selected-clean-process.test.ts` + `…-clean-process-child.mjs` | parent seals both closures; a child on plain `node` (no tsx) imports only `@kaicreator/domain-harness/v8/host` (built `dist`, workspace package link — not an `npm pack` tarball install) and runs FR02 + FR07 over a REAL SQLite file |
| Fixtures | `fixtures/tf-fr02-fr07-expression.mjs`, `fixtures/tf-fr02-fr07-harness.mjs` | test-only Business packages (no imports, data-only policy, one ledger effect each) |

`WEB-ORACLE-1 REBIND` (L1 file) fails if any of the seven IDs loses its L2
physical test or if a `test.todo` reappears in the oracle file.

## 4. FR02 — portable deterministic expression semantics

Selected path: Business Rule declaration `payloadExpression` → S
`interpret(rule)` → K central admission (Business schema → K guard →
transition → durable Effect Journal → ledger resource → state CAS).

| Case | Exact v0.7 oracle | Real test(s) | Result / adaptation |
|---|---|---|---|
| `V08-FR02-P-CONTROL-01` | deterministic replay, input 21 | L1 same name | retained control (unchanged) |
| `V08-FR02-N-CONTROL-01` | non-portable JSON rejected | L1 same name | retained control (unchanged) |
| `V08-FR02-DIFF-01` | — | L1 same name | retained unchanged; its assertion (Kind inventory is still `schema/rule/decision/workflow/operation`) remains true — FR02 is a Rule *field* (`payloadExpression`), not a sixth Kind. The title predates #1019 and is kept verbatim |
| `V08-FR02-P-F01` | `{"value": input.value * 2, "now": $now(), "millis": $millis()}` at `2026-09-17T02:00:00.123Z`, input value 21 ⇒ exactly `{value:42, now:"2026-09-17T02:00:00.123Z", millis:1789610400123}` | L2 `V08-FR02-P-F01: exact v0.7 {value:42,now,millis} admitted through sealed S payloadExpression + K guard on real SQLite; logical-time replay is byte-identical`; L1 `V08-FR02-P-F01: selected K admits …`; L3 FR02 leg | **PASS (local, see §7)**. The admitted receipt does not echo the event payload, so the exact result is observed by K: guard `guard:fr02-legacy-exact` (value 42 ∧ now ∧ millis) + Business schema (exact key set `{value,now,millis}` with types). Differential: input 22 ⇒ same guard denies, zero State/Journal/Effect. Replay: second instance, same input/logical time ⇒ byte-identical admission (instance key + per-instance governance pin digest stripped). L1 additionally captures the exact S result bytes ⇒ equal to `JSON.stringify(v0.7 expected)` on both replays. A sibling rule sealed at `2027-01-02T03:04:05.678Z` admits only through its own exact guard ⇒ `$now/$millis` come from the sealed declaration `logicalTime`, never the ambient Host clock. ModelPort calls = 0; resolver evidence `measured(0)` / `llmAvoided:true`. **Adaptation:** v0.7 evaluated an ad-hoc expression with an injected clock; v0.8 seals the expression and its `logicalTime` in the Business Rule declaration (#1019) |
| `V08-FR02-N-F02` | `$eval`, `$random`, clock arguments rejected by policy | L2 `V08-FR02-N-F02: $eval / $random / clock-argument policy denials fail closed typed through K; zero State/Journal/Effect`; L1 same ID; L3 `$eval` leg | **PASS (local)**. `$eval("1+1")`, `input.value + $eval`, `$random()`, `$now("[Y]")`, `$millis("ignored")` ⇒ typed `SDK_EXPRESSION_FORBIDDEN` with the v0.7 message class, surfaced through `gateway.send`; state stays `review`, Journal 0, ledger 0, ModelPort 0 |
| `V08-FR02-N-F03` | JSONata timeout ⇒ typed timeout; UTF-8 input/output byte limits | L2 `V08-FR02-N-F03: UTF-8 byte limits and the deterministic step budget (v0.7 timeoutMs adaptation) fail closed through K; exact limits admit`; L1 same ID | **PASS (local)**. Input `{"input":{"text":"缅甸"}}` = 23 code units / 27 bytes: `maxInputBytes 26` ⇒ `SDK_EXPRESSION_BOUNDS`, `27` admits. Output `{"t":"缅甸"}` = 10 / 14: `maxOutputBytes 13` ⇒ BOUNDS, `14` admits. Step budget: 1000-element structure with `timeoutMs 1` (512 steps) ⇒ `SDK_EXPRESSION_TIMEOUT` identically on two independent replays; `timeoutMs 2` admits. Negatives leave zero State/Journal/Effect. **Adaptation (accepted in #1019):** the v0.7 wall-clock `timeoutMs` is a deterministic fixed-rate step budget — same fail-closed denial class, zero ambient-time dependence |

Observation (not an adopted FR02 observable, no test claims it): the K dynamic
effect-input binding (`inputFrom`) authorizes only `payloadFromInput` keys
(`validatedAuthorizedKeys`), so an expression result cannot currently feed a
dynamic effect input; the fixtures therefore use static effect inputs. If the
Product wants expression results to drive effect inputs, that is a new K
owner decision, not part of this oracle.

**FR02 selected-path result:** P-F01 / N-F02 / N-F03 executed and passing
locally on the current selected K/S/Host path (see §7 and the Builder
terminal for exact-SHA evidence).

## 5. FR07 — bounded Harness model/query loop semantics

Selected path: Business `model-decision` rule with sealed data-only `harness`
policy → K bounded continuation (absolute `MAX_FR07_STEPS = 8`) → S
`invokeStep` (one physical ModelPort turn per step) → K capability
authorization + K-owned instance-context read → observation / K-attested
dependency → … → final allowlist → K central admission.

The test-only fixture `tf-fr02-fr07-harness.mjs` re-expresses the v0.7
scenario. **Adaptations:** capability ids use the K identifier grammar
(`lookup_catalog` → `catalog.lookup`, `flaky_read` → `catalog.flakyRead`,
`bad_read` → `catalog.badRead`, `charge_customer` → `customer.charge`);
queries are K-owned projections of the K-attested instance context, not
Business `execute()` callbacks (#1003@6122627750 §4 — copying them would be a
P1 L2 violation); the model request carries
`{request, step, maxSteps, capabilities, observations}` instead of the v0.7
`{domainFacts, compiledIntelligence, workflowContext, queries, …}`;
dependencies are K-attested `{capabilityId, source:'instance-context',
workflowInstanceId, stateRevision}` instead of v0.7 Host-supplied identities;
v0.7 `INVALID_STRUCTURED_RESULT` for disallowed finals is
`FINAL_*_NOT_ALLOWED` (covered by KH2 N7, not one of these seven sentinels).

| Case | Exact v0.7 oracle | Real test(s) | Result / adaptation |
|---|---|---|---|
| `V08-FR07-P-CONTROL-01` | bounded Harness returns structured decision/event | L1 same name | retained control (unchanged) |
| `V08-FR07-N-CONTROL-01` | model cannot smuggle authority | L1 same name | retained control (unchanged) |
| `V08-FR07-N-CONTROL-02` | — | L1 same name | retained extra control (unchanged) |
| `V08-FR07-P-F01` | query → allowed observation/dependency → second turn → `QUOTE` / `QUOTE_REQUESTED`; exactly two model requests; mutation not advertised | L2 `V08-FR07-P-F01: two physical model turns around a K-authorized read ⇒ QUOTE / QUOTE_REQUESTED admitted; ModelPort count == measured(2); caller counts ignored`; L1 same ID; L3 FR07 leg | **PASS (local)**. Physical ModelPort invocations = 2 = admitted `resolver.modelCallEvidence` `measured(2)`; caller-supplied `freshModelCallCount: 99` / fake `modelCallEvidence` ignored; advertised capabilities exclude `customer.charge`; turn #2 sees exactly the K observation `{available:true, sku:'P-1'}`; one K-attested dependency; exactly one K query read of the SQLite instance doc; state `quoted`, Journal 1, ledger 1; every turn carried the request-scoped signal |
| `V08-FR07-N-F02` | unknown query ⇒ `UNKNOWN_CAPABILITY` (executions 0); mutation ⇒ `MUTATION_CAPABILITY_FORBIDDEN` (hidden, mutations 0) | L2 `V08-FR07-N-F02: unknown capability ⇒ UNKNOWN_CAPABILITY and mutation capability ⇒ MUTATION_CAPABILITY_FORBIDDEN, both before any read; zero authority`; L1 same ID; L3 mutation leg | **PASS (local)**. Both terminate before any K read (only the lane-start read), no turn #2, zero State/Journal/Effect |
| `V08-FR07-N-F03` | `maxSteps` bounds the loop (1 request, 1 query execution); active model and active query cancellation ⇒ `CANCELLED`, abort observed | L2 `V08-FR07-N-F03: maxSteps exhaustion (incl. recovery turns) and authenticated cancellation during an active model turn / K read`; L1 same ID; L3 cancel leg | **PASS (local)**. `maxSteps 1`: one turn, its read executed once, `MAX_STEPS_EXHAUSTED`. `maxSteps 4` with ordinary-failure recovery turns: exactly 4 turns, `measured(4)`, `MAX_STEPS_EXHAUSTED` (no hidden retries). Cancel during an active model turn via authenticated `gateway.cancel` ⇒ physical port observed the abort, `CANCELLED`, `inFlightTurnDiscarded`; a forged credential is refused and a different principal gets `not-in-flight`. Cancel during the K read (SQLite read held at a barrier) ⇒ `CANCELLED`, `lateReadDiscarded`, model turn #2 = 0. All zero State/Journal/Effect. **Adaptation:** a v0.7 "active query leaf" was a Business callback receiving the signal; the v0.8 query is a K-owned read, so cancellation is proved by discarding the late read |
| `V08-FR07-N-F04` | ordinary query failure ⇒ structured observation, bounded recovery (2 requests); invalid query output ⇒ `QUERY_OUTPUT_INVALID` | L2 `V08-FR07-N-F04: ordinary query failure ⇒ structured observation + bounded recovery admits; invalid query output ⇒ QUERY_OUTPUT_INVALID`; L1 same ID | **PASS (local)**. `catalog.flakyRead` ⇒ observation `{ok:false, error:{code:'QUERY_SOURCE_MISSING'}}`, recovery turn admits with `measured(2)` and no dependency. `catalog.badRead` (sealed output type violated) and an unversioned SQLite read (tampered `stateRevision`, the v0.7 `{value: undefined}` analog) ⇒ `QUERY_OUTPUT_INVALID`, no turn #2, zero residue. **Adaptation:** v0.7 ordinary failure was a thrown callback with `error:'read unavailable'`; v0.8 reports a typed code |

The broader FR07 KH2 matrix (P1–P3, N1–N7, B2/B3 latch, final-ready race) is
owned and proven by the merged `fr07-kh2-continuation-physical.test.ts`; this
map only rebinds the seven WEB-ORACLE-1 sentinels.

**FR07 selected-path result:** P-F01 / N-F02 / N-F03 / N-F04 executed and
passing locally on the current selected K/S/Host path.

## 6. Source-gap disposition

No current-source gap was found for any adopted observable of the seven
sentinels: every one is satisfied by the merged selected K/S/H path without
production change. No test was weakened. (See the §4 observation for the
non-adopted dynamic effect-input limitation.)

```text
ORACLE_SOURCE_OWNER = WEB-ORACLE-1 / #1018 (test-only)
PRODUCTION_FIX_OWNER = none required for these seven rows
RELEASE_MANIFEST_OWNER = #1006
THIS_BRANCH_PRODUCTION_FIX = NONE
```

## 7. Honest execution status

```ini
TODO_GAP_SENTINELS=0 (was 7)
CURRENT_K_S_EXACT_BLOB_BINDING=905d291/efbd8e6 (v0.8@022e2b4)
L1_COMPILER_ORACLE=EXECUTED_LOCAL
L2_SELECTED_PHYSICAL_SQLITE=EXECUTED_LOCAL
L3_STOCK_NODE_DIST_CONSUMER=EXECUTED_LOCAL (workspace dist link; NPM_PACK_TARBALL=NOT_RUN)
EXACT_SHA_NODE24_NODE22_CI=SEE_BUILDER_TERMINAL_ON_#1003
FR02_SEVEN_ROW_SCOPE=SELECTED_PATH_PASS_PR_LEVEL
FR07_SEVEN_ROW_SCOPE=SELECTED_PATH_PASS_PR_LEVEL
INDEPENDENT_REVIEW=REQUESTED (not by the Builder)
MERGE=NO
RELEASE_PASS=NO
```
