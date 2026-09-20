# T-008 Task Pack — Host/local Domain Tool Binding

**Version:** v0.3  
**Wave:** A / portable contracts & capabilities  
**Execution Issue:** #226  
**Branch:** `v0.3_t008`  
**PR Base:** `v0.3`  
**Exact Base:** `be65e41e652d70c17ca10af66bc5f25abed2658a`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** M  
**L3:** REQUIRED  
**Validation Profile:** portable adapter/compiler fixtures only

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`
- `.dev-standard/PROJECT_OVERRIDES.md`
- GitHub Issue #226

The dependency-complete integration base is exactly `v0.3@be65e41e652d70c17ca10af66bc5f25abed2658a` (T-001 merged).

## 2. Objective

Provide one generic portable binding seam for Domain Tools whose implementation is supplied by the target project/host without loopback HTTP and without embedding project resources, credentials, native handles, Node/Expo concepts, or runtime internals into the portable Domain Package.

The target compiler remains the authority that maps a package-declared capability to an opaque `bindingId` and immutable binding digest. Runtime host code supplies a matching adapter for that exact binding artifact.

## 3. Tests

Focused fixtures are written before/alongside the contract and core:

- `packages/domain-harness/tests/host-local-tool-binding.test.ts`
  - successful exact binding through an allowlisted capability;
  - missing capability fails closed;
  - missing binding fails closed;
  - binding capability not declared by the Tool fails closed;
  - target binding digest mismatch fails closed;
  - package input/output JSON Schemas remain authoritative;
  - mutation-capable Tool cannot enter host code without valid durable-effect context;
  - non-host-local execution kind is rejected.
- `packages/domain-harness-compiler/tests/host-local-tool-binding.test.ts`
  - target compilation preserves selected project-local capability as exact `bindingId` + digest;
  - multiple declared capabilities do not blur the selected executable binding;
  - selected binding capability must be declared in the Tool allowlist.

No fixture claims real Node/native/Expo durability or platform parity.

## 4. Contract / Interface

Binding kind:

```text
host-local-domain-tool@1
```

Portable runtime input remains the existing `CompiledToolDescriptor`:

```text
package-defined Tool schema/effect semantics
+ requiredCapabilities allowlist
+ target-compiled execution.bindingId
+ target-compiled execution.digest
```

Host-side contract:

```text
bindingId
→ HostLocalDomainToolBinding {
     capability,
     digest,
     execute({ toolId, bindingId, input, EffectExecutionContext })
   }
```

The adapter may close over target-project/native resources. Those resources are never passed as package config and the callback receives no RuntimeStore, actor system, registry, package registry, credentials collection, or arbitrary Runtime internals.

## 5. Core Implementation

`createHostLocalDomainToolExecutor()` implements the existing portable `ToolExecutorPort` seam. Resolution is deterministic and fail-closed:

```text
compiled kind is host-local-domain-tool@1
→ every Tool requiredCapability is available on the activated host
→ exact target bindingId exists
→ binding capability is included in Tool requiredCapabilities
→ runtime binding digest == target-compiled binding digest
→ mutation-capable call has durable EffectExecutionContext
→ validate package input schema
→ invoke one host-local adapter
→ validate package output schema
```

The core does not compile TypeScript or load source code at runtime. Executable implementation identity was already selected/content-bound by target compilation.

## 6. Failure Handling

Explicit binding failures:

- `HOST_LOCAL_BINDING_KIND_INVALID`
- `HOST_LOCAL_CAPABILITY_MISSING`
- `HOST_LOCAL_BINDING_MISSING`
- `HOST_LOCAL_BINDING_NOT_ALLOWED`
- `HOST_LOCAL_BINDING_DIGEST_MISSING`
- `HOST_LOCAL_BINDING_DIGEST_MISMATCH`
- `HOST_LOCAL_EFFECT_AUTHORITY_REQUIRED`

Input/output schema failures continue through the existing `SchemaValidator` failure taxonomy.

There is no fallback from missing/mismatched local capability to arbitrary host code, runtime compilation, network loopback, another bindingId, or a compatible-looking implementation.

## 7. Authority Boundary

The host-local adapter is intentionally only an implementation edge behind `ToolExecutorPort`.

For `effect != none`, execution requires a valid `EffectExecutionContext` carrying stable effect/source/idempotency/attempt identity. The adapter does not own journaling, retry, recovery or the decision that a mutation may execute. Those remain parent DomainHarness durable-effect authority.

A host-local implementation cannot mutate Workflow/XState state directly through this contract because no state-machine/runtime handle is exposed.

## 8. Portable Core Boundary

This task adds no Node built-in dependency and no Expo/native import to `packages/domain-harness` portable core. Project-specific names appear only in tests as fixtures; production contracts use opaque capability IDs and binding IDs.

Runtime resources/native handles are supplied by host adapter construction/closure, not embedded in portable package semantic content.

## 9. Deferred Scope

T-008 does **not** implement or claim:

- real Node/native binding validation — T-022;
- real Expo/Hermes/native binding validation — T-023;
- central v0.3 Runtime assembly/public export wiring — T-021;
- provider/model routing;
- a new Tool runtime;
- runtime TypeScript compilation;
- loopback HTTP as a requirement;
- host durability from mocks.

## 10. Focused Validation Commands

When executable CI is available:

```text
npm run typecheck -w @kaicreator/domain-harness
node --import tsx --test packages/domain-harness/tests/host-local-tool-binding.test.ts
npm run typecheck -w @kaicreator/domain-harness-compiler
node --import tsx --test packages/domain-harness-compiler/tests/host-local-tool-binding.test.ts
```

Repository CI/PR checks remain authoritative for the exact task HEAD. T-022/T-023 own real-host truth.
