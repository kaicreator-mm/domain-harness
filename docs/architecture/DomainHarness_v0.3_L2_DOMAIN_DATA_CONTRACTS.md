# DomainHarness v0.3 L2 Architecture Evidence — Domain Data Contracts, Identity and Invalidation

Issue: #205  
Work branch: `v0.3_l2_205_domain_data_contracts`  
Frozen baseline: `a84fed0bfecc4c534a330844e6b6a4a76e3c67c2`  
Status: architecture evidence / production contract proposal; does not reopen the frozen PRD or Architecture Baseline.

## 1. Authority and evidence consumed

This note is subordinate to:

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`;
- `docs/architecture/DomainHarness_v0.3_ARCHITECTURE_BASELINE_FROZEN.md`;
- #194 final research evidence, exact HEAD `0ace38118f000c71641c3e1bf8a94276ef4cec60`;
- #196 final research evidence, exact HEAD `7c6c7a63b643fbaa5051db8e403dd15f7721dce8`;
- #197 final integration evidence, exact HEAD `0fb1a17a3f5a7d1e3b77de10bca76e613e1e7e2d`;
- pinned `kaicreator-mm/ai-development-standard@0446f04583f6cf464c835f26e2f657c8b703cb4e` plus this repository's `.dev-standard/PROJECT_OVERRIDES.md`.

The frozen model is:

```text
Domain Data = Domain Facts + Compiled Domain Intelligence
```

This note resolves the ownership, identity, versioning, projection, invalidation, activation and pinning details required by #205. It deliberately does **not** design a knowledge platform, RAG system, vector retrieval system, memory platform, semantic-cache store, or subworkflow registry implementation.

## 2. Decision summary

v0.3 uses **three distinct identity layers** that must not be collapsed:

1. **logical identity** — stable domain name such as `rule:quote.eligibility` or `tool:catalog.lookup`;
2. **semantic content identity** — SHA-256 over canonical behaviorally relevant content (`contentDigest`);
3. **target package identity / execution pin** — existing v0.2 `packageId`, calculated from the full target-compiled package manifest and used for activation, recovery and retained-instance pinning.

A human/package `version` is lifecycle metadata and selection evidence. It is not a substitute for a digest. A version label may change while semantic content remains identical; conversely, changing semantic content without a new digest is invalid.

This separation is necessary because the exact semantic cache in #203 must invalidate only for dependencies that can change a decision, while package activation/recovery must still retain the exact target package that an execution was pinned to.

## 3. Ownership contract

| Data / artifact | Authority / owner | Compiler role | Runtime role |
| --- | --- | --- | --- |
| Domain Facts | domain application / authoritative business source | may compile selectors/projection declarations, never become fact authority | reads supplied/current facts through declared inputs/projections; does not claim ownership |
| Compiled Domain Intelligence source | domain project | validates and compiles | no authoring authority |
| Compiled Domain Intelligence package | domain project, produced by DomainHarness compiler | emits immutable target package and digests | immutable consumer; validates, activates and pins exact package |
| Rule / knowledge / skill / tool / output / workflow artifact | domain project | canonicalizes semantic material and emits artifact identity | resolves by identity; never silently substitutes another digest |
| Promoted subworkflow artifact | domain project after deterministic validation + explicit promotion | compiles validated promoted artifact into package/registry representation | selects only explicitly available compatible artifact; no auto-promotion |
| Runtime Resources / credentials | host/operator | references only | resolves at runtime; values are outside Domain Data identity unless an explicit semantic revision is declared |

Consequences:

- Domain Facts remain mutable outside the compiled package. A snapshot of facts may be an input to a decision, but the package never becomes the source of truth for those facts.
- Compiled Domain Intelligence is immutable once identified by digest. Updating intelligence creates a new content identity.
- Harness/model output is not Compiled Domain Intelligence merely because it exists. A proposed subworkflow enters Compiled Domain Intelligence only after deterministic validation and explicit promotion/selection.

## 4. Production descriptor proposal

The executable contract proposal is in:

- `packages/domain-harness/tests/architecture-v03/domain-data-contracts.proposal.ts`
- `packages/domain-harness/tests/architecture-v03/domain-data-contracts.test.ts`

The minimum package identity proposed for production is conceptually:

```ts
interface DomainIntelligencePackageIdentity {
  domainId: string;
  version: string;               // lifecycle / human selection label
  packageId: string;             // exact target-compiled package pin, existing v0.2 mechanic
  contentDigest: string;         // canonical Compiled Domain Intelligence semantic content
  formatVersion: string;
  runtimeContractMajor: number;
  executionEngineMajor: number;
  requiredCapabilities: readonly string[];
}
```

The minimum artifact identity is:

```ts
interface CompiledArtifactIdentity {
  kind: 'rule' | 'knowledge' | 'skill' | 'tool' | 'output-schema' |
        'workflow' | 'promoted-subworkflow' | 'harness-config';
  artifactId: string;            // stable logical identity
  version?: string;              // optional lifecycle label
  contentDigest: string;         // canonical semantic identity
}
```

`packageId` is intentionally retained rather than redefined. At the frozen baseline the compiler already hashes canonical manifest identity material to produce `packageId`, and activation already validates and retains exact package pins. v0.3 extends that mechanism with a semantic content/artifact layer; it does not replace the v0.2 package registry contract.

## 5. Canonicalization and digest rules

Canonical digest material MUST:

- be JSON-representable;
- sort object keys deterministically;
- normalize collections whose registration/order is not semantic before hashing;
- reject `undefined`, non-finite numbers and non-contract values;
- hash **content**, not source path or installation location;
- exclude the digest field from its own digest material;
- exclude audit/provenance fields unless they actually change behavior;
- include references by `(kind, artifactId, contentDigest)`, never by mutable object address or actor reference.

Production should reuse one compiler-owned canonicalization primitive. The architecture test proposal uses `node:crypto` only because it is executable evidence; portable Runtime Core only needs to carry/compare opaque digests and must not acquire a mandatory Node dependency.

### 5.1 Package `contentDigest`

The package semantic `contentDigest` covers the canonical table of Compiled Domain Intelligence artifacts and semantic-context projection descriptors. It excludes:

- human package version label;
- source/repository paths;
- registration/serialization order;
- build timestamp;
- promotion timestamp/operator/evidence reference;
- deployment/install location;
- credential values and runtime resource values.

Any change to included compiled intelligence produces a new package `contentDigest`. This digest is useful for audit/equivalence, but **#203 MUST NOT place the whole package `contentDigest` into every semantic-cache key**. Doing so would make an unrelated package artifact invalidate unrelated decisions.

### 5.2 Existing `packageId`

Existing v0.2 `packageId` remains the exact target-compiled package identity. It may change for target/package material that is not relevant to a particular semantic decision. That is acceptable: execution pinning and semantic result equivalence are different concerns.

## 6. Artifact identity and invalidation matrix

| Kind | Behaviorally relevant digest material | Explicitly non-semantic examples |
| --- | --- | --- |
| Rule | canonical rule AST/IR, parameters/thresholds, declared fact fields, referenced artifact digests | file path, author, comments, registration order |
| Knowledge | the selected compiled knowledge slice/value used by the decision, interpretation/schema contract, referenced artifact digests | source file path, ingestion timestamp, provenance display text that does not affect interpretation |
| Skill | executable semantic instructions/IR, input/output contracts, resource **content** digests, allowed tool identities/policies | resource path, UI label, authoring location |
| Tool | logical tool id, input/output contract, effect semantics, capability surface, model-facing semantic description/policy, explicit semantic revision | endpoint/credential value, host binding object identity, registration order |
| Output schema | canonical schema and finite Domain Event/decision contract | source filename, formatting |
| Workflow | compiled behavior graph/IR and behavior-relevant referenced artifact identities | source path, registration order, descriptive metadata |
| Promoted subworkflow | validated constrained IR, graph, applicability, input/output contracts, allowed events/tools, referenced artifact digests, execution bounds | candidate source path, `selectedBy`, evidence ref, promotion timestamp, registration order |
| Harness config | only configuration that can affect structured decision computation | telemetry/logging/UI configuration |

For tools whose result may change independently of the package (for example, live external data), the tool contract MUST either:

- provide an explicit semantic revision/time boundary that participates in identity; or
- mark the invocation non-cacheable/time-sensitive under #203.

Credentials, endpoints and Runtime Resources are not made Domain Data merely to solve cache freshness.

## 7. Semantic context projection

A semantic-cache identity MUST NOT hash an entire workflow/business context object by default.

Each decision/resolver declares a deterministic `SemanticContextProjectionDescriptor` with:

- stable `projectionId`;
- source class: `input`, `domain-facts`, or `workflow-context`;
- deterministic declared selectors or equivalent compiler-generated projection IR;
- `descriptorDigest` covering the projection definition.

At invocation time the resolved projection produces a `valueDigest` over only the selected values.

```text
full current context
    -> declared semantic projection
    -> selected semantic values
    -> canonical valueDigest
```

The semantic identity uses both `descriptorDigest` and `valueDigest`. Therefore:

- changing a selected fact changes identity;
- changing the projection definition changes identity;
- changing unrelated UI/telemetry/context fields does not change identity;
- missing declared selected data fails closed; it must not silently substitute `null` or broaden to the whole context.

Projection evaluation remains deterministic, declared-input-only and side-effect-free. It must not perform tool calls, retrieval, provider calls or other external I/O.

## 8. Exact semantic dependency identity consumed by #203

#203 should construct its exact semantic invocation identity from a **dependency set**, not from the package as an undifferentiated blob:

```text
namespace
+ domainId
+ decisionId
+ canonical selected input digest
+ selected semantic-context projection descriptor/value digests
+ only behaviorally relevant artifact identities
= exact semantic invocation digest
```

Execution-only identifiers remain excluded unless a future contract proves they affect semantics:

- workflow instance id;
- source message id;
- effect id;
- actor id;
- source/resource path;
- registration order;
- unrelated UI/telemetry context.

Whole-package `packageId`, package `version`, and package `contentDigest` are **not automatic semantic invalidators**. The execution still carries its exact package pin, but semantic equivalence is determined by the selected dependencies. If a resolver truly has package-global behavior, it may explicitly declare a package-global artifact/digest as a dependency; that is an exception by contract, not a default shortcut.

This is the production refinement of #194: research proved content-addressed exact reuse; #205 narrows the production invalidation surface so unrelated compiled intelligence does not cause meaningless misses.

### Example

Package `3.0.1` adds an unrelated `shipping.tax-rule` but the `quote.resolve` decision still depends on the identical `quote.eligibility`, `quote.policy-slice`, `quote.prepare`, `catalog.lookup`, `quote.decision`, Harness config and selected `customerTier/orderTotal` projection.

- package `packageId`: may change;
- package `version`: changes;
- package `contentDigest`: changes because compiled intelligence changed;
- `quote.resolve` semantic invocation digest: **does not change**;
- an invocation depending on `shipping.tax-rule`: **does change**.

## 9. Promoted subworkflow identity consumed by #204

A promoted reusable subworkflow has two independent classes of data:

### 9.1 Semantic artifact material

Included in `contentDigest`:

- stable promoted artifact id;
- input/output contract;
- validated step/edge graph;
- applicability/preconditions;
- allowed tool semantic identities;
- referenced rule/knowledge/skill/output identities;
- finite allowed Domain Events/outcomes;
- execution bounds;
- any explicit reasoned-step semantic contract.

### 9.2 Promotion/audit metadata

Excluded from semantic `contentDigest`, but retained for audit/lifecycle:

- candidate id/source path;
- proposal timestamp;
- validator run/evidence reference;
- promoter/selector identity;
- promotion timestamp;
- explanatory note.

Changing audit metadata does not change solving behavior. Changing applicability, graph, tool contract, referenced rule, event set or bounds does.

A raw `WorkflowCandidate` and a `ValidatedCandidate` are **not executable promoted identities**. #204 must require explicit promotion before registry availability/compilation. The artifact may have a human `version`, but resolver selection and stale detection must bind to `contentDigest`.

## 10. Package activation, pinning and compatibility

v0.3 extends existing v0.2 activation semantics:

1. compiler emits immutable target package with exact `packageId` plus v0.3 compiled-intelligence descriptors/digests;
2. activation validates manifest shape, package identity and semantic digest integrity;
3. activation checks `formatVersion`, `runtimeContractMajor`, `executionEngineMajor`, target/host requirements and required capabilities;
4. incompatibility or digest mismatch fails closed;
5. activation atomically selects a package for **new** workflow instances;
6. existing/retained workflow instances keep their exact `packageId` pin;
7. every retained pin must remain resolvable; a missing pinned package aborts activation/recovery rather than falling back to the current default;
8. compatibility never authorizes semantic substitution of another package/artifact digest.

A runtime may have multiple package versions/materializations available simultaneously because retained instances can require old exact pins while new instances use a newly active package.

### 10.1 Package version versus compatibility

`version` is not the compatibility algorithm. Compatibility is explicit contract data (`formatVersion`, contract/engine majors, required capabilities and any reviewed extension). A semver-looking string cannot override an incompatible runtime contract.

## 11. Direct consumption contract for #203

#203 can consume this evidence without inventing new digest ownership:

- use `CompiledArtifactIdentity` as the common dependency vocabulary;
- use declared/resolved `SemanticContextProjectionDescriptor` identities;
- build `ResolvedSemanticInvocation` from the selected dependency set;
- key the exact semantic cache by namespace/domain/decision/input/projection/artifact identities;
- do not key every invocation by whole package version/packageId/contentDigest;
- retain the exact execution package pin separately for audit/recovery;
- treat live/time-sensitive tool semantics through explicit semantic revision or bypass;
- continue to revalidate cached structured outputs against current schema/guard authority as frozen by the Architecture Baseline.

Storage, transaction, TTL/eviction and cache-store topology remain #203 scope.

## 12. Direct consumption contract for #204

#204 can consume this evidence without inventing an independent artifact identity:

- candidate/validated/promoted stages all carry a stable logical artifact id;
- only explicit promoted artifacts become selectable executable solving patterns;
- promoted semantic identity uses the same `CompiledArtifactIdentity` vocabulary;
- `contentDigest` is over constrained validated behavior material, not promotion metadata;
- applicability/tool/event/bounds/reference changes invalidate the artifact digest;
- source relocation, registration ordering and audit-only edits do not;
- package activation/retained-pin rules remain authoritative; registry selection cannot silently substitute a different digest;
- mutation remains behind durable effect authority and is not made part of promoted-workflow execution authority by this contract.

Compiler/registry data structures, revocation UX and selection policy remain #204 scope.

## 13. Executable evidence

Focused architecture tests cover:

1. artifact digest stability across object order and human version-label changes;
2. behavior change changes artifact digest;
3. semantic-context projection ignores unrelated UI/telemetry fields;
4. selected fact change invalidates semantic identity;
5. rule/knowledge/skill/tool/output/Harness dependency changes invalidate the exact semantic identity independently;
6. unrelated workflow artifact omission does not invalidate an independent semantic result;
7. package content digest is registration-order/version-label stable and behavior-sensitive;
8. promoted subworkflow identity is stable across promotion/source metadata and changes on applicability/behavior;
9. activation compatibility accepts a matching contract and fails closed for missing capability/runtime-major mismatch;
10. exact package pin remains separate from compatibility/equivalence.

Repository-focused command once dependencies are present:

```bash
node --import tsx --test \
  packages/domain-harness/tests/architecture-v03/domain-data-contracts.test.ts
```

A dependency-free Node 22 execution of the same test logic was run while authoring this evidence using native TypeScript stripping; six tests passed. The local runner required only an import-suffix adaptation because the repository convention intentionally imports `.js` and relies on `tsx` to resolve the TypeScript source. Repository CI is explicitly waived for #205 by operator instruction and is not reported as PASS.

## 14. Non-goals / boundaries

This evidence does not introduce:

- a knowledge service/database/platform;
- RAG, embeddings, vector retrieval or fuzzy semantic result reuse;
- conversation/user memory;
- provider/model routing;
- a second Harness Runtime;
- mutable self-modifying intelligence;
- autonomous workflow promotion;
- cache storage or execution-journal replacement;
- credential/resource values in Domain Data.

## 15. Architecture conclusion

The frozen model is operationally precise when Domain Facts and Compiled Domain Intelligence keep separate authority, package pinning is separated from semantic equivalence, and semantic reuse is built from declared dependency projections rather than entire context/package identities.

The resulting invariant is:

```text
exact execution/recovery identity = exact packageId pin + execution identity

exact semantic computation identity =
  selected input
  + selected semantic context
  + only behaviorally relevant compiled artifact content digests
  + namespace/domain/decision identity
```

That invariant gives #203 fine-grained exact-cache invalidation and gives #204 stable promoted-artifact identity while preserving v0.2 package activation/recovery mechanics and all frozen v0.3 authority boundaries.
