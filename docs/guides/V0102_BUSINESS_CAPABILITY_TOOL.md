# v0.10.2 Business, Capability and Tool Authoring

A Business module supplies declared Intent/workflow and calls only selected C Operations. It does not own a caller principal, CAS transition, K journal or Effect permission. A Capability module supplies named `handlers`, an explicit `capabilityId`, and **one module-wide** `externalEffect` classification. Ordinary JS helpers inside B/C may remain private; **do not register them as Tools** merely because they are callable.

```js
import { projectSelectedComponents } from '@kaicreator/domain-harness-build';

// Each entry must reference a separately selected module descriptor with
// source bytes/digest, role:'capability', capabilityId and handlers.
// No per-handler externalEffect override exists.
const declarations = [
  { class:'tool', kind:'package-operation', componentId:'inventory.read',
    modulePackageId:'capability.inventory', operationId:'inventory.get',
    handler:'getInventory', externalEffect:false },
  { class:'tool', kind:'package-operation', componentId:'jobs.submit',
    modulePackageId:'capability.jobs', operationId:'jobs.submit',
    handler:'submitJob', externalEffect:true },
];
const selected = projectSelectedComponents(declarations, [
  selectedReadOnlyCapability,
  selectedEffectfulCapability,
]);
// Feed the original selected module objects into the external buildV10App;
// include exactly one K Primary, one S Primary, >=1 B and admitted routes.
```

This is a **two-C module** template. The variables represent author-supplied selected source descriptors, **not** exports or automatic registrations. The executable projection-smoke in `examples/v0102-package-authoring/` demonstrates the exact S non-Tool + two C typed map; real BUILD sealing/physical effect execution is separately required. Existing Tiny B/C example is `examples/v010-clean-consumer/apps/tiny/app-definition.mjs` (one C has `reserve` and `preview` operations), and Rich has multiple physically separate C Modules in `examples/v010-clean-consumer/apps/rich/app-definition.mjs`.

**Governed external effect:** only a declared K permit allows the effect adapter to dispatch. A permitless request must return the selected typed refusal and produce zero external dispatch, and an external attempt with ambiguous settle reports UNKNOWN, never a fabricated success. `externalEffect:true` is a sealed C-module classification, not a way to mint permits. For P/N real receipts inspect T09 Rich `DENY_N1.permitlessAdapter` and UNKNOWN journeys; the new authoring template is not independently qualified merely because those examples previously passed.

Reject unselected C modules, bad operation/handler binding, duplicate Component IDs, inconsistent effect classification, unknown fields/accessors, and `remote-operation`/`system-operation` labels without a selected transport adapter. Use `V10_EXPORT_CONTRACT_REFUSED` / `BUILD_GRAPH_INVALID` negatives from existing A8b fixture. Keep Host resources/cleanup explicit; there is no universal Tool lifecycle/transport wrapper.
