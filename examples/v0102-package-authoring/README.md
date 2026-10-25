# v0.10.2 authoring template candidate

Run only with Node24, after `npm ci && npm run build` in a clean checkout:

```sh
node examples/v0102-package-authoring/projection-smoke.mjs
node --import tsx --test tooling/build/tests/component-view.test.ts
```

The first command checks **one S semantic non-Tool plus two different C Tool modules**, static selected-module identity and typed negatives. It does not itself seal an App, pack/install from public tarballs or execute Host/K Effects. The already-established real external producer + Tiny/Rich flow is `tests/integration/v010-clean-consumers/clean-consumers.test.ts` (T09 #1330), but that suite is not a substitute for an **independent new authoring-template acceptance**. Issue #1379 must still attach real Node24 public-tarball authoring BUILD/pack/run positive and wrong ABI/binding/effect/cleanup negatives before release P1 #1305 can be closed. No PASS is asserted for unrun checks.
