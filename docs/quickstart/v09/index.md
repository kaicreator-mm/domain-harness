# DomainHarness v0.9 Quickstart — external clean consumer

Audience: a consumer organization installing the packaged
`@kaicreator/domain-harness` SDK for the first time. Everything here uses
**documented public exports only** — the two subpaths below; there is no
supported deep `src/`/`dist/` import.

## 1. Install the exact artifact

There is no npm release; consume an exact git pin or a packed tarball whose
SHA256 you recorded (see `examples/v09-clean-consumer/README.md` for the
reproducible `npm pack` + clean-install command list).

```sh
npm install ./kaicreator-domain-harness-<version>.tgz   # clean dir, real Node 24 ESM
```

## 2. Know the two published surfaces

```ts
// The ordinary application API — the ONLY thing app code imports:
import { DomainHarness } from '@kaicreator/domain-harness/v9';
const facade = await DomainHarness.load(installedRef); // exactly one string
await facade.send({ intentType, instanceKey, messageId, input });
await facade.query({ kind: 'instance', instanceKey });
const subscription = await facade.subscribe(observer);
await subscription.unsubscribe();
await facade.stop();

// The deployment-owned trusted bootstrap — operator processes only:
import { createV09DomainHarnessBridge, createProtectedHostV09,
         issueV09ApprovalProof } from '@kaicreator/domain-harness/v9/deployment';
```

`./v9` never exports a Host setter, verifier, Kernel, issuer or registrar —
identity and scope are always Host-sourced. `./v9/deployment` is the one
supported way an operator composes the trusted bridge over materials the
deployment already owns (physical store, issuer secrets, caller
authenticator); importing it grants no cross-deployment authority.

## 3. The request-scoped invocation model

1. The operator composes one bridge per trusted presentation:
   `createV09DomainHarnessBridge({ store, trustedIssuers, audience, runtimeAbi, hostAbi, authenticator, presentation })`.
2. For each inbound request the operator runs the consumer handler inside
   `bridge.runWithinTrustedContext(async () => { ... })`.
3. Inside that callback — and only inside it — consumer code calls
   `DomainHarness.load(installedRef)`. A facade captured there refuses with
   `CALLER_SCOPE_DENIED` once the callback returns or under another Host's
   scope: it is not a transferable bearer capability.
4. `bridge.close()` detaches the public binding synchronously before the
   async teardown; every later load or facade verb fails closed.

## 4. Errors you will actually see

All public refusals are `DomainHarnessV9Error` with one frozen family code:
`PACKAGE_NOT_AUTHORIZED` (no trusted deployment scope / unknown or foreign
installed reference / hostile extra arguments), `CALLER_SCOPE_DENIED`
(missing grant, expired or foreign scope, facade used outside its request),
`OPERATION_NOT_BOUND` (unsealed intent/route/instance), `LIFECYCLE_FAILED`
(closed facade or bridge, wrong lifecycle state), `EFFECT_UNKNOWN` (the
Kernel's honest unknown after a physical effect), `UNSUPPORTED_RUNTIME_ABI`.

## 5. Run the worked example

`examples/v09-clean-consumer/` contains the complete operator+consumer pair
and automates the whole two-Business journey (real committed effect, real
receipt delivery, truthful business denial, every negative above). The
repository test `v09-external-consumer.test.ts` re-proves it against a
freshly packed tarball in an isolated directory on every run.
