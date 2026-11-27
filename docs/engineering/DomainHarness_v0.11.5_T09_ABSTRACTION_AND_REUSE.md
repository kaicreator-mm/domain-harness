# T09 — Workflow-first abstraction and reuse assessment

Writer assessment against L2 R16 §6.2 and DAG #1771; independent gate pending.
Accepted runtime baseline: 0077fb5a19d81926b9e5051e51b4859270f4ed46
(tree 97a2f4a2af59dd521c462674fff965dac2355356). No runtime or lock change in T09.
B1/B2/B3 acceptance receipts are in the version DAG; R66 accepted B3 at R65
head 0f71d8a34ce057ffc87967eb58f8eebec0a9e498.

## Ownership and disposition

| Decision | Boundary | Rationale |
|---|---|---|
| KEEP | Existing Kernel lifecycle, Standard knowledge/evidence/query/interaction/decision interfaces | Preserve direct dependency and native typed contracts; no generated code authority in SDK. |
| REFINE | StandardWorkflowSession / NativeWorkflowContext; managed node; XState and Interaction runIn | One root owns bounds, currentness, scope closure, actual execution and publication; borrowed context cannot reset budgets. |
| COMPOSE | Typed slots, Function binding, Region binding, ModelElement | Same native node/validation contract across fixed, dynamic and selected tool; dynamic local planner changes bounded region, not root authority. Model consumes projected context and selected Function; does not bypass native validators. |
| SPLIT | Existing private resource control, slot leases, managed runtime, region proposal/contract, model wire/JSON | Separate invariant owners; no new public abstraction for internal bookkeeping or provider-specific transport. |
| REMOVE | Obsolete 27/61 install checker expectation and stale current-stage descriptions | Replace with independent expected 32/93 and version-scoped documentation; no removal of accepted runtime APIs. |

Business retains source authority, domain rules, professional calculations, feasibility
and publication policy. SDK does not generate domain knowledge or decide professional
correctness. Provider billing is out of scope; usage is evidence, not a billing engine.
No experience persistence or hidden oracle implementation added.

## Two distinct actual domain uses (O11a candidate)

Test files below are relative to packages/domain-harness/tests/fixtures/v0115-fixed-domains.
D-A and D-B exercise separate data, rules and professional functions; controlled
authority fixture is not an external market feed. D-B uses actual SciPy MILP.
B3 R64/R66 review receipts bind prior evidence; T09 adds D-A delegated region.
Rows are witness locators, not independent acceptance claims.

| Standard family | D-A actual use | D-B actual use |
|---|---|---|
| Session/Context | witness.test.ts fixed procurement native/actor | witness.test.ts fixed repair native/actor; region-witness.test.ts R65 nested |
| Managed node | witness.test.ts compatibility/pack optimize/verify | witness.test.ts resource-read/MILP/verify |
| Work reservation | witness.test.ts scope.work(252) procurement | witness.test.ts scope.work(64) repair |
| XState.runIn | witness.test.ts D-A xstate fixed | witness.test.ts D-B xstate fixed |
| Typed slots and Function/Region binding | witness.test.ts T05 native demand; region-witness.test.ts D-A delegated procurement subregion and R65 solver | witness.test.ts T05 deadline; region-witness.test.ts R65 child/grandchild |
| Region/rebind/revalidation | region-witness.test.ts D-A feedback; R65 equivalent skip/rebind | region-witness.test.ts D-B template replacement and deadline feedback |
| Interaction.runIn | witness.test.ts D-A same-root lead feedback | witness.test.ts D-B same-root deadline feedback |
| Terminal read/observation | witness.test.ts actual quote readback and root policy | witness.test.ts actual resources and solver post/root policy |
| Observation/evidence/model decision | witness.test.ts actualTrace; no-model network denial; model-witness.test.ts D-A candidate | witness.test.ts actualTrace; no-model network denial; model-witness.test.ts D-B candidate |
| ModelElement | model-witness.test.ts D-A tool loop; B3 R65 actual provider missing alternative | model-witness.test.ts D-B semantic constraint actual solver; B3 live provider evidence |

D-C actual Host/SQLite authorization/effect remains supplemental, not a substitute
for the A/B two-use denominator. Scripted peers prove deterministic protocol behavior
only; live request evidence is separately labeled in B3 receipts.

## O11b artifact boundary

Canonical spec, root/SDK README, source TSDoc, projected Skill and capability
catalog are checked against accepted public API. Exact independent names in
verify-s05-installed-standard.mjs are not derived from observed exports. Managed
region example executes native bigint and includes strict type-negative declarations.
Actual external consumer verifier uses npm ci --ignore-scripts and checks only root
exports, real SQLite and historical domain paths. Cross-platform witness uses one
archive with explicit SHA256 and pack integrity; no old .3 archive promotion.
Final source tree, archive digest and per-platform receipts belong in #1778 and PR,
not this pre-build assessment. T10 and T11 remain gated.
