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
**Status:** P1 REPAIR — EXACT-HEAD VALIDATION REQUIRED

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
16. typed `additionalProperties` combined with named properties fails closed because a TypeScript index signature would change the structural contract;
17. arbitrary JSON Schema `type: "integer"` is rejected instead of being silently widened to TypeScript `number`;
18. integer rejection is deterministic and applies through nested object properties, array items, type arrays and supported composition paths;
19. a generated contract never claims arbitrary integer semantics while admitting a fractional value such as `1.5`;
20. exact integer `const`/`enum` literal forms remain supported only when the emitted TypeScript literal/literal-union is itself exact;
21. representable JSON Schema `number` continues to emit ordinary TypeScript `number`;
22. representable string/boolean/null/exact-enum paths remain unchanged.

### 4.2 Type fixture

A compile-only fixture proves valid App command/outcome/view/watch/event values typecheck and representative invalid values fail via `@ts-expect-error`, including an attempted workflow-routing leak.

The fixture remains part of `tests/**/*.ts`; package test validation SHALL continue to run `tsc -p tsconfig.test.json --noEmit` so compile-negative assertions are not bypassed by focused runtime tests.

### 4.3 Validation commands

Focused/repository commands:

```text
npm run typecheck -w @kaicreator/domain-harness
npm test -w @kaicreator/domain-harness
```

The T-011 acceptance profile is compiler/golden/type validation. Real Node/Expo host integration remains T-022/T-023.

### 4.4 CI / repair evidence

Historical validation and review evidence is exact-HEAD scoped. A new source or Task Pack HEAD invalidates earlier CI, packaging and Independent Review PASS evidence for merge qualification.

The earlier exact-head Woodpecker pipeline `444/1`, packaging evidence #271, and Fresh Independent Review #272 all belong to `15ba0d0254b972111dab6257b40902772c073c32`. Review #272 found one blocking P1 in the old renderer: arbitrary JSON Schema `integer` was emitted as TypeScript `number`. That evidence remains historical and SHALL NOT be reused as current-head PASS evidence after this repair.

Merge-time CI truth MUST be read from `ci/woodpecker/pr/verify` on the exact current PR HEAD. No pending/error/failure state is represented as PASS. Packaging and Fresh Independent Review must also be repeated on that same exact candidate.

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

### 5.3 Exact schema projection and integer boundary

Generated TypeScript is an exact static projection of the supported source-schema subset. T-011 SHALL NOT silently widen a source constraint merely because TypeScript has a broader primitive type with a similar runtime representation.

In particular:

```text
JSON Schema type: "number"
→ TypeScript number

JSON Schema type: "integer"
→ unsupported for arbitrary values in the current public contract
→ deterministic generation rejection
```

The current frozen/public T-011 contract defines no branded integer type, runtime-refinement wrapper, or other enforceable TypeScript representation that excludes fractional numbers. Therefore mapping arbitrary JSON Schema `integer` to ordinary TypeScript `number` would be a false exactness claim and is forbidden.

An integer-valued `const` or finite `enum` MAY still project when the generator emits the exact TypeScript numeric literal or literal union and source-type compatibility has already been verified. This does not create a branded/general integer representation and does not authorize widening an arbitrary integer schema.

This rule applies recursively through named schemas, nested properties, arrays, type arrays and composition members. No alternate renderer path may bypass it.

## 6. Core Implementation

`generateTypedAppContracts(manifest, source)` plus the internal schema renderer are deterministic and host-neutral:

1. verify the recognized App-contract source format;
2. verify `source.packageId === manifest.packageId`;
3. validate unique App contract IDs;
4. resolve selectors against the target-compiled manifest;
5. collect only the named-schema closure reachable from selected App contracts;
6. build schema aliases only for that reachable closure;
7. validate the explicitly supported JSON Schema structural forms and compatible keyword combinations;
8. render only semantics that TypeScript can express exactly under the current generated public contract; arbitrary `integer` reaches deterministic `UNSUPPORTED_SCHEMA` rather than `number`;
9. require provably disjoint discriminators before mapping `oneOf` to a TypeScript union;
10. sort schema/public contract declarations by stable locale-independent identity order;
11. emit one static `.ts` artifact with no runtime source-discovery requirement.

The generator never reads `CompiledWorkflowDescriptor.definition`; engine-specific control definition material is not part of the generated App surface.

The renderer supports the portable structural subset required by T-011 (`$ref`, exactly representable primitive/object/array structural types, representable properties/required/additionalProperties, enum/const, and constrained composition forms). Unknown constraints such as `pattern`, numeric bounds, conditional schemas, ambiguous composition siblings, arbitrary integer domains without an exact public TypeScript representation, or other semantics that would be erased or widened by TypeScript projection fail closed.

## 7. Failure Handling

Generation uses `AppContractGenerationError` with explicit codes for:

- unsupported source format;
- exact package mismatch;
- duplicate public/reachable-schema identities;
- missing workflow/message/projection/schema/view references;
- invalid or malformed schema references;
- unsupported/unrepresented or ambiguous schema semantics, including arbitrary JSON Schema integer projection under the current unbranded TypeScript contract.

Generation failure aborts the build step; it does not fall back to `any`, `number` for arbitrary integer, source discovery, runtime compilation, unrelated internal schemas, or engine/internal types.

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
- runtime Domain source discovery/compilation;
- a general JSON Schema compiler redesign or new branded integer public type.

Final exact implementation/validation HEAD is recorded on the PR/Issue evidence after all task commits are complete.
