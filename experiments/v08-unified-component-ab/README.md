# #942 Unified Component A→B executable validation (research-only)

## Identity and provenance

- A is a **non-authoritative runtime-facing adapter** around unchanged v0.7 records, not a replacement for v0.7 production invocation. Tests import the **real** exact v0.7 `component.ts`, `tool-component.ts`, `component-digest.ts`, `definition-graph.ts`, `capability-provision.ts` through `tsx`. No source copy.
- Frozen v0.7 ref: `86110c616b8cb18c730553e4cdab7ef555214521`.
- Package-first runtime: actual independent #938/#940 `bootstrap.mjs` at `beea9cdd29c51a046b8612871aa53be54b966e7c`, read-only detached checkout.
- B is **new, separately versioned experimental** `ucb/1`, not a v0.7 historical digest migration or a production SDK.
- Fixed ADS: `kaicreator-mm/ai-development-standard@1edaee9291e25b6dd99303493bed75132cb54881`.

## One test command (after preparing the two pinned checkouts)

```bash
npm ci --ignore-scripts
V07_ROOT=/absolute/path/to/v07-exact REFERENCE_938_ROOT=/absolute/path/to/ref938/experiments/v08-package-first-bootstrap   node --import tsx --test experiments/v08-unified-component-ab/tests/*.test.mjs
```

The isolated GitHub Actions workflow `.github/workflows/spike-942-unified-ab.yml` itself fetches both exact refs and executes the command on Ubuntu/Node 22. The project-designated Windows/ECF Build Host is **not implied** by that result.

## Minimal candidate B Schema

```text
Component {
 schemaVersion: "ucb/1",
 componentId, packageId,
 kindRef: { kindId, version },     // open KindRef, never a Kernel enum
 semanticBody, requiredSemanticContracts: [],
 requiresCapabilities: [{ capabilityId, version, operations: [] }],
 providesCapabilities: [{ capabilityId, version, operations: [] }],
 relations: [{ relationKind, targetComponentId }],
 operations?: [{
   operationId, inputSchema, outputSchema, failures: [],
   effect: "none" | "idempotent" | "non-idempotent"
 }]
}
ImplementationBinding { componentId, kindRef, implementationId,
  implementationVersion, implementationDigest, handlers } // separate from Definition
SealedAssembly { definitionDigest, exact packages, bound implementation pins, digest }
```

Five standard candidate KindRefs are `std.schema@1.0.0`, `std.rule@1.0.0`,
`std.decision@1.0.0`, `std.workflow@1.0.0`, `std.operation@1.0.0`.
The Kernel has no switch over these names; selected implementation handlers belong to the SDK/Business fixture layer. Tool means *callable role*, not a separate B ontology. Pure Schema has no operation and cannot be invoked.

**Single graph:** `requiresCapabilities` and `providesCapabilities` on Component definitions derive executable edges; `relations` are the only author-ed semantic relationships. There is NO second editable Capability Graph. B's graph/assembly SHA-256 domain is distinct from unchanged v0.7 digests.

**Important boundary:** `effectAuthority.invoke` must be supplied by the host and is invoked for any operation classified non-`none`; no new authority, journal or state store is implemented here. The toy test port verifies referral only, **not** production Central Admission, durable effect outcomes, idempotency, replay or crash recovery. `WAIT` then a subsequent call demonstrates bounded routing; not a durable resume.

## Source-level A/B differences (candidate)

| Concern | A (v0.7) | B (experiment) |
|---|---|---|
| Envelope | frozen ComponentEnvelope + family semantic/tool | one Component ucb/1; optional operations |
| Tool operations | ToolOperationsDeclaration semanticBody | explicit optional Component operations |
| Semantic invocation | chosen Kind adapter required; no automatic Tool conversion | admitted Kind implementation with operations |
| Provider selection | real v0.7 Tool-only selector | one graph-derived generic providers; no family gate |
| Graph/digest | real v0.7 validators + digest + graph | new versioned graph and Assembly identity |
| Implementation identity | v0.7 separate Kind/Tool binding | separate minimal test-only binding record |
| Runtime authority | actual v0.7 T004/Central Admission NOT run in this spike | injected authority port only; NO production proof |
| New Kind | add exact Kind adapter, keep v0.7 tool family behavior | register separate implementation record, no Kernel edit |

B reduces one explicit `family` field and the Tool-versus-Semantic declaration special case, but **does not establish performance advantage**. New costs are successor version/digest/compatibility migration, input/output validation, trusted implementation binding, resource lifecycle, provider provenance and more rigorous authority/replay handoff. The B engine is deliberately smaller/less safe than production v0.7; comparing LOC alone would be misleading. Count source files and branches on the tested SHA rather than infer true total runtime complexity.

## What must not be inferred

This spike does **not** exercise the actual v0.7 sealed RuntimeAssembly, production Invocation T004, Central Admission, journal-first durable persistence, state/effect replay or ABI compatibility, or portable Expo/Windows host. Therefore full A/production parity and v0.7 identity compatibility may be only **PARTIAL** even if toy conformance tests pass. A validation PASS of v0.7 digest and Provider selection means only those subcontracts were really executed.

## Evidence / Gate

Test results, SHA/tree, run URL, individual U01–U07 dispositions and open failures are recorded in #942 after **real exact-SHA** execution. Unrun tests are never labeled PASS. Scope is this experiment directory plus its one isolated workflow. Do not merge to main, edit v0.7 or #940, or initiate formal v0.8 development.
