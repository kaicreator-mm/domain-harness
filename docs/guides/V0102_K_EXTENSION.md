# v0.10.2 K Extension Guide

K Primary is a **single** separately selected Domain Package and exclusively owns state, admission, journal, effect permits, UNKNOWN and replay. An additional K extension is **advisory only**; it cannot become another Primary or claim K authority by naming a Hook.

Author an ESM module exporting a bounded advisory function, then provide its selected `kernel-extension` BUILD input with the exact `dh.v10.kernel-extension/1`, stable `providerId`, `hookExport`, source bytes and SHA256. The Component authoring declaration uses `class:'hook'`, `kind:'kernel-advisory'`, `modulePackageId`, and `entry` exactly equal to `hookExport`. The builder verifies the selected reference; it never evaluates a module merely to discover it.

Existing checked reference: `examples/v010-clean-consumer/apps/rich/app-definition.mjs` selects two distinct advisory K extensions. `tooling/build/tests/component-view.test.ts` checks the projection identity. Run it on Node24 after the build. Verify negative duplicate `providerId`, undeclared Hook export and attempted `lifecycle`/event/observer Hook refusal; `projectSelectedComponents` must reject an unsupported kind.

Host startup may provide physical resources, but K state transition/effect authority is never delegated to this extension. There is no generic new `onInit/onDispose` registration ABI in this release: selected activation binds the advisory and reverse-disposes through Microkernel lifecycle. This guide describes the published contract, **not** an independently validated third-party K extension build result; Issue #1379 retains the Node24 external-template acceptance gate.
