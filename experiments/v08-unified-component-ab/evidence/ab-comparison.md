# #942 A→B source-level experiment comparison

Scope: `spike/v08-unified-component-ab-942` only. The baseline is **not** a full production v0.7 build. Source owner refs:
- v0.7 `version/v0.7@86110c616b8cb18c730553e4cdab7ef555214521`
- `contracts/component.ts` / `tool-component.ts` / `component-digest.ts` / `definition-graph.ts` / `capability-provision.ts` / `runtime-assembly.ts` / `tool-implementation-binding.ts` / `effectful-invocation.ts` / `adapters/workflow-kind.ts`
- #938 reference `beea9cdd29c51a046b8612871aa53be54b966e7c`; current experimental A/B candidate changes only new experimental paths.

## Measured footprint on tested implementation SHA 34a36574d1cde7b9aad365a8878921325f3b9dcc

| File | LOC including blank/comments | Main responsibility |
|---|---:|---|
| `unified.mjs` | 192 | Candidate B validation, one derived graph, binding/sealed digest, scoped invoke |
| `fixtures.mjs` | 77 | Five Kind **test implementations**, distinct from B Definition |
| `legacy-a.mjs` | 32 | A uniform non-authoritative runtime-facing view |
| `tests/a-v07.test.mjs` | 80 | Real frozen v0.7 contract/digest/provider selection oracle |
| `tests/b.test.mjs` | 167 | B standards, provider/capability negative paths, #938 integration |
| **Total** | **548** | Includes all experiment tests, not comparable to full production v0.7 LOC |

## Interfaces, special cases, incremental cost

| Dimension | A (actual v0.7 baseline + adapter) | B (bounded candidate) | Measured conclusion |
|---|---|---|---|
| Portable definition envelope | 1 existing `ComponentEnvelope`, mandatory `family` + optional `nonMaterialExtensions` | 1 `ucb/1` component with optional `operations` | B collapses the executable family dimension, **but** creates a new successor format |
| Operation ABI | Frozen `ToolOperationsDeclaration` inside Tool semantic body; Workflow-specific Kind adapter can expose operations | Generic `operations` on any Component; input/output/failures/effect explicit | New ABI conversion + exact wire version still required |
| Binding | Existing `KindImplementationBindingInput`, Tool implementation binding and sealed Assembly owner | 1 test-only `ImplementationBinding`, separate from Definition; hash/pin but not production provenance mint | B does not replace T002/T003; genuine binding provenance still needs adaptation |
| Extra adapter/switch | A one 32-LOC test adapter with explicit family path, plus existing Workflow Kind adapter | B core has **no hard-coded Standard Kind names**; fixture handlers dispatch across six named component IDs in their own separate file | Kernel genericity shown; semantic-specific implementation code does not disappear |
| Capability Graph | Existing DefinitionGraph + Tool-family-only provider selector | One Component list + derived requires/provides map + DFS, no second editable graph | One-pass lookup and DFS in toy; not performance proof |
| Capability Binding | Real v0.7 Provider Selection + separate currentness/Tool Bind owners | One map with provider+operation closure, one immutable Assembly identity | Reduces test-only duplication; **not** production authority replacement |
| Add a Kind | Versioned v0.7 Kind adapter and independently selected implementation; Tool-callable semantics remain family-constrained | Additional exact KindRef+ImplementationBinding; custom.metric positive test without Kernel edit | Open-ended Kind works without editing B core |
| History | Existing v0.7 digest namespace, exact identity, Tool and graph semantics unchanged | New `ucb.definition.v1`/`ucb.assembly.v1` SHA-256 namespaces | **No digest mutation**, but no persisted-v0.7-replay migration proof |
| Effect authority | Real Central Admission/T004C on v0.7 production branch, **not exercised in this experiment** | Effectful Operations rejected unless host supplies authority port (one fake test port) | B needs a real T004/Central Admission adapter before production |
| Workflow | Legacy `kaicreator.workflow@1.0.0` plus real Kind validator/bridge owner, not changed | Experimental `std.workflow@1.0.0` with bounded 0/1/N routing, WAIT | Different semantic ABI; legacy Workflow must remain byte-identical |

## Actual constraints and problems (not hidden by B recommendation)

1. **Observed B defect fixed during real-host iteration:** After an accepted Rule semanticBody version changed, its handler still read a closure captured from the old fixture. New Assembly digest correctly changed, but runtime behavior failed to change. Real CI `30546b1` showed this failure. Fix at `34a3657`: Kind handler reads the **currently bound, admitted** component semantic body through `ctx.self()`; the regression checks old/new behavior and identity separately. This is required for correct semantic/implementation separation.
2. Tool-family-only v0.7 Provider selection is normative. A must not turn a Semantic Workflow into a Tool provider by reinterpretation. A uses the real Tool selector plus an explicit Kind adapter, not a new v0.7 provider authority.
3. B's source lines are **much smaller because production semantics are absent**: record-safety/torn snapshots, implementation mint attestation, host resources, full must-understand admission, single state authority, effect begin/complete journal, cancellation and recovery. A/B LOC is explanatory footprint only, not "B replaces v0.7 for less code".
4. B operates over the **actual #938 sealed Package context**, including 3/4 packages and approval/learning, but its B Component declarations are separate experimental fixtures rather than native #938 package manifest content. **Native ucb/1 manifest-format loader compatibility remains an OPEN GAP.**
5. The B validator checks a small `inputSchema.required` typed projection, not full JSON Schema/must-understand validation. It requires input/output/failure/effect fields but does not yet validate every failure code on the execution path.
6. The B `effectAuthority.invoke` is a caller-injected adapter contract, not evidence of trust, sealed occurrence, Central Admission, durable journal or idempotency.

## Minimum B changes justified (research candidate, not formal implementation)

- New successor-version `Component` envelope **only** (one shape + optional `operations`); preserve v0.7 `ComponentEnvelope` and exact digest domains verbatim.
- Thin adapter mapping frozen Semantic/Tool to a common runtime view, plus explicit Kind/Tool implementation binding onto the **existing** sealed Runtime Assembly identity/provenance semantics.
- Derive requires/provides edges from one Component Definition Graph; exact capability/provider/operation checks, no Registry or new Authority.
- Selected Kind handler reads admitted semanticBody from an Assembly-bound immutable view (explicitly evidenced by the original failed test).
- Effectful operations must reuse the existing authoritative T004/Central Admission path, not this demo's synthetic port.
- Explicit exact Package/target compiled format and importer + fresh Review must precede B public ABI or production compatibility claims.

Gate A may be **supported within the bounded experiment** while v0.7 production parity and native successor packaging remain NOT_TESTED/PARTIAL; only user separate authorization can initiate L1/L2 or merge.
