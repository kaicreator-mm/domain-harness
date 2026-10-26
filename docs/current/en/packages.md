# DomainHarness v0.10.2 — Domain Package authoring

[Documentation index](index.md) · [中文版本](../zh-CN/packages.md)

## Selected extension contracts

| Package role | Allowed ownership | Not allowed |
| --- | --- | --- |
| **K Primary** | The sole Kernel: State, Admission, Journal, Effect permits, UNKNOWN, Replay | Second K or Host state authority |
| **K Extension** | Read-only `kernel-advisory` hooks | Durable writes, permits or ungoverned effects |
| **S Primary / Feature** | Explicit semantic, Workflow, Rule, Context modules | Implicit conversion of every helper to a Tool |
| **B Business** | Intents, domain rules and workflows | Fabricated caller identity or K effect authority |
| **C Capability** | Declared `operationId → handler` mapping | Undeclared operations or per-handler effect overrides |

## Implementation workflow

1. Classify a requirement as a **pure S semantic feature**, B-private helper, declared C Tool, or K advisory extension. An ordinary function is **not automatically a Tool**.
2. Select exact module sources, `packageId`, `moduleSha256`, ABI and allowed routes. BUILD validates the closed graph.
3. Split read-only C (`externalEffect:false`) from effectful C (`externalEffect:true`): v0.10.2 classifies **the whole selected C module**, not each handler.
4. `projectSelectedComponents` maps declarations only onto *already selected* modules; external `buildV10App` seals them. Runtime does not perform BUILD.
5. Prove positive behavior and typed negatives: unselected imports absent, permitless effects dispatch zero external operations, invalid route/handler rejected.

## Real source examples

- `examples/v0102-package-authoring/projection-smoke.mjs`: lightweight projection/refusal.
- `examples/v0102-package-authoring/authoring-template-check.mjs`: physical tarballs, BUILD, installed runtime, effect permit/denial.
- `tests/integration/v010-clean-consumers/clean-consumers.test.ts`: real Tiny/Rich integrated journeys.

```sh
node examples/v0102-package-authoring/projection-smoke.mjs
node --import tsx --test tooling/build/tests/component-view.test.ts
```

Run from the tagged repository root with Node24 and built dependencies. These are commands, **not newly executed results**. Detailed original technical sources: [authoring](../../guides/V0102_PACKAGE_AUTHORING.md), [extension matrix](../../guides/SUPPORTED_EXTENSION_POINTS.md).

---

**Version:** immutable tagged runtime `cee14399d9d0af4e20e34b9111861b16a465b690`. RQ **CONDITIONAL** (Full `EXIT1`, root `NOT_RUN` retained). This is post-release explanatory documentation, not a changed ABI.
