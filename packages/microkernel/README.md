# @kaicreator/domain-harness-microkernel

The DomainHarness v0.10.2 public runtime SDK (Microkernel). It loads ONE
already-trusted prebuilt Domain App (`V10BuiltApp` plain data produced by
the canonical BUILD package `@kaicreator/domain-harness-build`) and exposes
one frozen facade:

```js
import { load } from '@kaicreator/domain-harness-microkernel';

const app = await load(builtApp, { store, tenantId, deploymentIdentity, queryAuthority });
const receipt = await app.send({ intentType, instanceKey, messageId, input });
const answer = await app.query({ workflowId, instanceKey });
app.stop();
```

## Public surface (frozen, L2 §3)

- `load(app, options)` → `Promise<DomainApp>`; `options` is
  `{ store, tenantId?, deploymentIdentity?, queryAuthority?, deploymentRoot?, now? }`
  — there is deliberately **no `counters`** option.
- `DomainApp` own keys are exactly `[send, query, subscribe, stop]`, frozen.
  - `send(intent)` returns the K original receipt.
  - `query(selector)` / `query(selectors[])` — the authorized explicit
    scoped snapshot query (single, or correlated multi-target).
  - `subscribe(selector, listener)` — the frozen event projection SHAPE only
    at this pin (same typed preconditions as `query`); real asynchronous
    delivery belongs to v0.10.2 T06 and is not claimed here.
  - `stop()` — idempotent explicit teardown.
- Typed errors share the Contracts class identity: `V10Error`,
  `V10BuildError`, `V10ActivationError`, `V10ExternalEffectError`,
  `V10PortDeniedError`, `V10MultiBQueryError`. A public error carries
  `name`, its stable wire `code` and a safe `message`; K document keys, K
  key grammar and absolute Host paths never cross the entry.

## `./host-seam` (trusted Host bootstrap only)

An API-hygiene boundary, not a protection mechanism: any installed consumer
can import it, and authority never rests on it. Exact allowlist:
`activateV10App` (returning the narrowed `HostActivation`
`{ facade, dispose, [Symbol.dispose] }` — no live counters object, no
`counters` option), `isV10AppFacade` (true WeakSet brand),
`readSelectedShadowBinding` (the original activation-origin getter),
`v10SelectedKernelIdentity` (the loaded kernel's own derivations and its
T01k doc-key/K02-prefix/effect-authority-view protocol),
`v10DeploymentDocsPrefix`, and the types `V10AppFacade`, `HostActivation`,
`HostActivateOptions`, `V10SelectedKernelIdentity`.

## What this package deliberately does NOT do

- It never imports BUILD (`@kaicreator/domain-harness-build`), not even
  type-only; App records arrive as plain data.
- It implements no K State, Admission, Journal or Effect: the effect gate
  consumes the K-owned read-only authority view
  (`readEffectAuthorityView`) from the loaded selected kernel.
- It touches no Host SQLite: the physical store is caller wiring.
