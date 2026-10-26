# v0.10.2 authoring template candidate (Issue #1379 / #1305)

Run only with Node24, after `npm ci && npm run build` in a clean checkout.

## 1. Static projection smoke (seconds)

```sh
node examples/v0102-package-authoring/projection-smoke.mjs
node --import tsx --test tooling/build/tests/component-view.test.ts
```

The first command checks **one S semantic non-Tool plus two different C Tool
modules**, static selected-module identity and typed negatives. It does not
itself seal an App, pack/install from public tarballs or execute Host/K
Effects.

## 2. Physical public-tarball BUILD/pack/install/run acceptance

```sh
node examples/v0102-package-authoring/authoring-template-check.mjs --evidence <file.json>
```

The full #1305 minimal authoring-template proof in one command, using only
real `npm pack` tarballs and real Node24 processes (nothing imports a
repository path):

- packs the four selected public `0.10.2-rc.0` workspaces and the three
  selected Domain Packages (kernel basic, standard basic,
  semantic-decision feature);
- an isolated **producer** root installs only those tarballs, fail-closed
  probes its graph (retired Compiler root + `v10build` deep alias + four
  unselected features), projects the S non-Tool Feature + two C Tool
  declarations through the public `projectSelectedComponents`, seals the App
  with `buildV10App` and proves six typed negatives (wrong semantic entry,
  undeclared operation, effect-parity lie, duplicate Component, unsupported
  `remote-operation`, and a real BUILD route/handler mismatch →
  `V10_ROUTE_INVALID`);
- a clean **consumer** root installs contracts + microkernel + the Domain
  Packages + the sealed App (NO BUILD, NO Compiler, NO Host-node, NO
  better-sqlite3) and executes the `authoring-basic` journey: selection,
  non-Tool S Feature via `invokeSelectedStandardFeature`, the Business
  PRIVATE pure helper plus the read-only `inventory.get` operation, the
  GOVERNED permitted `jobs.submit` dispatch (one minted permit, adapter
  `#1`), the PERMITLESS probe (typed `ADMISSION_EFFECT_FAILED` naming the
  missing `V10_EFFECT_PERMIT`, zero minted permits, adapter counter proves
  zero dispatch) and the closed facade;
- asserts the physical install closure (lock AND node_modules, forbidden
  names absent) and installed provenance (every sealed module's bytes equal
  what THIS consumer installed or the staged App sources).

Exit code 0 only when every stage passes; the evidence JSON records the
literal exit codes, tarball SHAs, digests and step names.

## Boundaries

This template does **not** replace the T09 (#1330) Tiny/Rich physical
evidence (`tests/integration/v010-clean-consumers/clean-consumers.test.ts`),
which stays the established external producer + clean-consumer record; nor
does a local green run substitute for the independent exact-HEAD review and
CI that Issue #1379 requires before the release P1 #1305 can close.
