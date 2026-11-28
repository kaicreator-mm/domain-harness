# Fixed D-A / D-B qualification witness

Frozen public data: R23 public HEAD `cc1c53f6dcef436555eb9757990c9c029d824359`, domains.json SHA256 `1d79d98fe8f6f90a95413c2eb0e2edab63be557ea459c13d375dec8f985aaacf`. The byte-identical public fixture is read and checked at execution. No evaluator-only material.

From monorepo root, after build:

```sh
DH_WITNESS_PYTHON=/absolute/path/to/python node --import tsx --test packages/domain-harness/tests/fixtures/v0115-fixed-domains/witness.test.ts
```

Python requires SciPy 1.17.0, as selected in G01-S; the ordinary SDK unit test suite does not require Python. The adapter uses actual MILP and waits for child-process close. The two domain definitions instantiate an actual fixed XState machine and also execute via native TS control flow; neither performs purchases or dispatches. The public objective predicates and business constraints are checked separately from returned solver status. This is a source-tree scoped witness, not installed SDK qualification, independent holdout acceptance, or a full O01–O12 pass. Further model-decision, dynamic, Interaction, Host and cumulative accounting cases remain in their assigned DAG tasks.

### D-C managed Host witness

`host-witness.test.ts` reuses the actual independent loopback Host and SQLite authority, plus the domain-owned managed reservation example. Run with the existing compiled SDK on Node >=22.12.0. The controlled synthetic resources start at stock5/version0 for the new managed cases. The proxy holds or drops ACKs at the actual HTTP boundary; independent SQL readback verifies stock/version/effect counts and command receipts. The managed root owns actual invocation and terminal readback; late stale results never substitute for accepted business results. The conflicting-UNKNOWN guard is deliberately domain-specific and instance-scoped (bounded unresolved resources), not a new SDK service or durable cross-process lock; separate Host processes enforce actual CAS. No live production inventory or complete hidden product oracle is claimed.

### Explicit live DeepSeek witness

The opt-in live suite is `live-model-witness.test.ts`. Supply the test credential through the execution environment `DH_DEEPSEEK_API_KEY` (never store or print its value). Run the compiled SDK with Node >=22.12.0 and the existing isolated SciPy runtime: `node --unhandled-rejections=strict --import tsx --test packages/domain-harness/tests/fixtures/v0115-fixed-domains/live-model-witness.test.ts`. Only frozen synthetic public domain inputs and scoped proposal metadata are sent to the declared provider endpoints. DeepSeek Flash uses explicit disabled thinking, OpenAI max_tokens, Anthropic version 2023-06-01, tools enabled but no strict provider JSON schema; trusted local validation is mandatory. Each case admits bounded model calls, zero automatic retries, explicit current business validation and actual domain effects. The suite records actual accepted/rejected outcomes, no private thought or credential, and no scripted fallback. A run can fail on invalid real model output; success on one finite run does not guarantee future generations. The complete product oracle and installed-SDK witnesses remain separate gates.

The live hybrid procurement region now executes 15 actual accepted nodes: one authoritative offer query, twelve mandatory offer-field group audits (four actual offers × identity/compatibility, packing, delivery/cost), fresh exact-cost analysis, and final independent verification. Feedback changes lead5→2 while source audit obligations remain current; the real model edits only the pending analysis. The regional binding cap is explicitly 64 for the 40 actual references (the original cap32 correctly rejected the larger layout). Separate actual native D-B deadline8→7 feedback retains the job source and executes SciPy and verification twice. These are finite public witnesses, not performance or provider reliability guarantees.

### R65 public domain witness delta (R64 P1-01, P1-02, P2-01)

`region-witness.test.ts` now checks two additional finite actual compositions:

| Predicate / actual Standard use | Witness |
| --- | --- |
| D-A DY01/DY03/DY04, O03/O04/O05 | Initial A/B/C omits D; actual inserted lookup obtains D from the bounded controlled authority; complete scoped current quote, compatible exact quantity and MOQ validation; equivalent duplicate skip and explicit typed rebind to the new accepted result; independent optimum cost64/lead3. Missing D, invalid MOQ, expired/wrong/missing equivalent proof and required-anchor skip reject before solve/publication. |
| F-W02 / O08, D-A W04 | Exactly the same native solver node (knowledge, before/run/after) executes in the dynamic region, direct fixed call, and selected Tool; actual observed quote and actual tool result travel through ModelElement to a scripted HTTP peer. Prior real dual-protocol R62/R63 W04 evidence is retained; the combined new route also has an explicit opt-in live mode. |
| D-B W03/W06, DY05/O04/O08, F-W03 | Native parent observes actual jobs and constraints, inserts repair child; child observes local source and resource conflict, inserts grandchild; grandchild inserts actual SciPy solve, typed output, independent objective (7,16). Internal workload audit variant keeps parent I/O and objective; depth denial prevents grandchild factory and solve. No model. |
| O10/F-W06 | Public occurrence and attempt correlation to definitive local disposition; skip records have no attempt, entered=false, no actual call/output, candidateSeq links to region edit. Required evidence refusal, stale candidate, invalid atomic batch, one-short event admission tested in core workflow-region suite. |

To run the new combined actual live route explicitly (no automated retry, no scripted fallback), provide the existing named credential in the environment and run:
```sh
DH_R65_LIVE=1 node --unhandled-rejections=strict --import tsx --test --test-name-pattern='R65 D-A missing alternative' packages/domain-harness/tests/fixtures/v0115-fixed-domains/region-witness.test.ts
```
Without DH_R65_LIVE=1 the ordinary suite uses the scripted loopback peer only. A finite live run is not a provider reliability claim. D-C actual Host/SQLite, original fixed and XState, Interaction, model and domain evidence remain unchanged; T09 packed Linux/Windows, T10 separate consumer maintenance and T11 complete product oracles remain distinct. These are scoped public witnesses, not hidden-oracle passes.

T09 reuse delta: the D-A delegated procurement subregion executes a second distinct
business use of typed region binding (cost 64, lead 3), complementing the existing
D-B nested scheduling witness. This is additional public evidence, not a change to
the frozen oracle or the accepted runtime.

### Horizon bound remediation (#1788)

`repair-solver.py` used the frozen D-B instance horizon 8 as its input ceiling and
rejected every wider finite demand as `invalid scheduling demand`, which the
workflow surfaced as `FAILED/SOLVER_FAILED`. The guard is now an explicit finite
search bound: integer `0 <= deadline <= horizon <= 12`. The ceiling matches the
prior SciPy witness that the frozen L1/L2 name as the professional solver
(`examples/qualification/workshop`, at most 12 discrete periods); the public
feedback field (deadline at most 10) and the stranger-consumer calendar (horizon 9)
also lie inside it. The lexicographic weight 100 still dominates the largest
completion sum `3*12=36`, and exhaustive independent enumeration stays tractable
(`13^6`). Non-integer, negative, over-limit, deadline-beyond-horizon and wrong
job-count requests still exit non-zero; a valid but infeasible instance remains a
successful exit reported as `INFEASIBLE`.

`solveRepair` keeps the frozen horizon as the lower bound of the search window and
widens it to the requested deadline; requests at or below 8 are byte-identical to
before. The solver process stays the single fail-closed owner. Frozen fixtures,
expected results and the existing witnesses are unchanged.

`horizon-regression.test.ts` is an independent public synthetic regression; it
uses no evaluator material. Its own exhaustive enumerator first reproduces the
frozen enumeration, then supplies the expected objectives above the former
ceiling. It runs the actual SciPy process through native and XState workflows, a
same-root deadline revision and a generated child/grandchild region, validates
every schedule with `scheduleMetrics`, and checks the over-limit and invalid
boundaries plus the no-model/no-network/no-credential guard. Run it from the
monorepo root after build:

```sh
DH_WITNESS_PYTHON=/absolute/path/to/python node --import tsx --test packages/domain-harness/tests/fixtures/v0115-fixed-domains/horizon-regression.test.ts
```
