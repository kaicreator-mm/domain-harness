# T-011 Task Pack — Generated typed App contracts

**Version:** v0.3  
**Wave:** Foundation / C1 parallel capability  
**Execution Issue:** #229  
**Branch:** `v0.3_t011`  
**PR Base:** `v0.3`  
**Exact Base:** `be65e41e652d70c17ca10af66bc5f25abed2658a`  
**Depends On:** T-001  
**Parallel:** YES  
**Risk:** M  
**L3:** REQUIRED  
**Status:** DONE

## 1. Frozen Inputs

- `docs/product/DomainHarness_v0.3_PRD_FROZEN.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_ROUND2_REVIEW_CANDIDATE.md`
- `docs/product/amendments/DomainHarness_v0.3_PRD_AMENDMENT_A1_FREEZE_RECORD.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_EVIDENCE_FROZEN.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1.md`
- `docs/architecture/DomainHarness_v0.3_L2_ARCHITECTURE_AMENDMENT_A1_FREEZE_RECORD.md`
- `docs/implementation/DomainHarness_v0.3_TASK_DAG.md`
- `.dev-standard/PROJECT_OVERRIDES.md`
- `.dev-standard/VERSION`
- GitHub Issue #229

The frozen authority requires generated App contracts while keeping XState/library identity and private persistence outside the public App API. This task does not reinterpret those decisions.

## 2. Objective

Provide one deterministic build-time generator that projects target-compiled Domain contracts into a static, portable TypeScript App surface for commands/outcomes, views, watches and Domain Events.

The generated artifact is an App-facing type contract, not a runtime, router, source compiler, UI workflow engine, or authority boundary.

## 3. Write Set

Expected T-011 writes are limited to:

- `packages/domain-harness/src/compiler/app-contracts.ts`;
- `packages/domain-harness/src/compiler/app-contract-schema.ts`;
- `packages/domain-harness/src/compiler/app-contract-schema-utils.ts`;
- `packages/domain-harness/src/compiler/app-contract-errors.ts`;
- `packages/domain-harness/tests/app-contracts/**`;
- `packages/domain-harness/tests/fixtures/app-contracts/**`;
- `packages/domain-harness/examples/generated-app-contracts/**`;
- this task pack.

T-011 deliberately does not edit central package/public barrels or Runtime assembly. Central exports/wiring remain T-021 scope.

## 4. Tests

### 4.1 Generation / golden

Focused generation coverage proves:

1. a representative exact compiled package produces a stable checked-in TypeScript golden;
2. compiled schema insertion order does not change generated output;
3. public command/view/watch/event declarations use locale-independent code-unit ordering;
4. command payloads come from compiled workflow message schemas;
5. outcomes and view inputs resolve exact compiled schema IDs;
6. view results come from compiled projection output schemas;
7. Domain Event payloads come from compiled workflow message schemas;
8. generated output contains no XState identity, actor reference, snapshot bytes, package pin, workflow/message/projection routing identity;
9. unreferenced internal schemas are excluded from the generated App schema closure, including internal schemas whose normalized TypeScript aliases collide;
10. source-format/package mismatch and missing compiled references fail closed;
11. unknown or unrepresented schema semantics fail closed rather than silently widening;
12. ambiguous supported-keyword combinations fail closed;
13. `oneOf` is emitted as a TypeScript union only when branches are provably disjoint through a shared required primitive-const discriminator;
14. compatible `type + enum/const` literal schemas remain supported while incompatible literals fail closed;
15. required object properties without explicit property schemas fail closed;
16. typed `additionalProperties` combined with named properties fails closed because a TypeScript index signature would change the structural contract.

### 4.2 Type fixture

A compile-only fixture proves valid App command/outcome/view/watch/event values typecheck and representative invalid values fail via `@ts-expect-error`, including an attempted workflow-routing leak.

### 4.3 Validation commands

Focused/repository commands:

```text
npm run typecheck -w @kaicreator/domain-harness
npm test -w @kaicreator/domain-harness
```

The implementation session also performed an isolated repository-equivalent strict TypeScript reconstruction plus generator/type smoke after the final schema exactness review. That focused self-check passed. It is implementation evidence only, not repository CI or release qualification.

The T-011 acceptance profile is compiler/golden/type validation. Real Node/Expo host integration remains T-022/T-023.

### 4.4 CI recovery evidence

An earlier operator-authorized waiver was used while Woodpecker was unavailable. That waiver is historical only.

After Woodpecker started accepting runs again, historical T-011 reruns included failures whose GitHub status exposed only `Pipeline failed`; adjacent PR #259 documented a local Woodpecker-agent clone/runtime prerequisite failure before meaningful repository commands. Those historical runs are retained as evidence but are not reused as the disposition of later T-011 heads.

Merge-time CI truth MUST be read from `ci/woodpecker/pr/verify` on the exact current PR HEAD. No pending/error/failure state is represented as PASS.

## 5. Contract / Interface

### 5.1 Build-time source

`CompiledAppContractSource` is a package-build selector bound to one exact `packageId` and one recognized source format. It references target-compiled contract identities only:

```text
command
  -> workflow message payload schema
  -> compiled outcome schema

view
  -> compiled input schema
  -> projection output schema

watch
  -> generated view input/output

domain event
  -> workflow message payload schema
```

The selector does not become App runtime state. Source-format or package mismatch fails closed so a generated module cannot combine an unsupported selector contract or two exact target packages.

### 5.2 Generated public shape

The generated module exposes business-oriented types only:

```text
AppCommand / AppCommandOutcome
AppViewRequest / AppViewResult
AppWatchRequest / AppWatchValue
AppDomainEvent
```

Only the named-schema closure reachable from those selected App contracts is emitted. Alias generation is scoped to that reachable closure, so unrelated/internal package schemas cannot leak into or accidentally block App generation merely because they exist in `manifest.schemas`.

The App contract intentionally omits:

- XState state IDs and actor references;
- serialized XState snapshots;
- workflow/message/projection routing identities;
- exact package execution pins;
- unselected/internal Domain schemas;
- RuntimeStore/persistence/journal representation;
- host resources or provider/model details.

Domain Workflow remains DomainHarness authority; App code consumes typed business contracts and may wrap them with UI-specific models without taking transition or persistence authority.

## 6. Core Implementation

`generateTypedAppContracts(manifest, source)` plus the internal schema renderer are deterministic and host-neutral:

1. verify the recognized App-contract source format;
2. verify `source.packageId === manifest.packageId`;
3. validate unique App contract IDs;
4. resolve selectors against the target-compiled manifest;
5. collect only the named-schema closure reachable from selected App contracts;
6. build schema aliases only for that reachable closure;
7. validate the explicitly supported JSON Schema structural forms and compatible keyword combinations;
8. require provably disjoint discriminators before mapping `oneOf` to a TypeScript union;
9. sort schema/public contract declarations by stable locale-independent identity order;
10. emit one static `.ts` artifact with no runtime source-discovery requirement.

The generator never reads `CompiledWorkflowDescriptor.definition`; engine-specific control definition material is not part of the generated App surface.

The renderer supports the portable structural subset required by T-011 (`$ref`, primitive/object/array structural types, representable properties/required/additionalProperties, enum/const, and constrained composition forms). Unknown constraints such as `pattern`, numeric bounds, conditional schemas, ambiguous composition siblings, or other semantics that would be erased by TypeScript projection fail closed.

## 7. Failure Handling

Generation uses `AppContractGenerationError` with explicit codes for:

- unsupported source format;
- exact package mismatch;
- duplicate public/reachable-schema identities;
- missing workflow/message/projection/schema/view references;
- invalid or malformed schema references;
- unsupported/unrepresented or ambiguous schema semantics.

Generation failure aborts the build step; it does not fall back to `any`, source discovery, runtime compilation, unrelated internal schemas, or engine/internal types.

## 8. Reference

Frozen v0.3 product authority retains a generated typed Domain interface and the `command / outcome / watchOutcome / view / watch` App interaction model. Frozen L2 assigns typed contract generation to the Package Compiler and states that generated types create no new runtime authority. L2 Amendment A1 classifies XState state IDs, actor refs and serialized snapshot bytes as implementation internals and requires generated/public contracts to use Domain Workflow / Domain Event terms.

T-011 implements only that projection boundary. T-009 remains owner of durable command-outcome runtime semantics; T-021 remains owner of central Runtime/public assembly; T-022/T-023 remain owners of real-host validation.

## 9. Scope Guard

T-011 SHALL NOT implement or modify:

- T-009 command outcome persistence/runtime semantics;
- T-019 workflow admission/effect wiring;
- T-021 central Runtime assembly or shared public exports;
- Node/Expo host adapters or real-host validation;
- XState engine identity as public App identity;
- RuntimeStore/journal/snapshot public representation;
- App UI state management or UI workflow orchestration;
- runtime Domain source discovery/compilation.

Final exact implementation/validation HEAD is recorded on the PR/Issue evidence after all task commits are complete.
