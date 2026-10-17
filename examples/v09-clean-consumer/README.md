# v0.9 clean consumer example — two-Business Domain App through the published SDK

This example is the #1119 external-consumer proof: a first-time consumer
organization installs the actual packed `@kaicreator/domain-harness` tarball
into a clean directory and runs a real two-Business Domain App journey —
`load` / `send` / `query` / `subscribe` / `unsubscribe` / `stop` — through
**documented public exports only**.

## The two roles (keep them in separate trust domains)

| Module | Imports only | Role |
|---|---|---|
| `consumer.mjs` | `@kaicreator/domain-harness/v9` | The ordinary application. Calls `DomainHarness.load(installedRef)` — one argument, nothing else. There is deliberately no way to pass a Host, verifier, Kernel or issuer through it. |
| `operator.mjs` | `@kaicreator/domain-harness/v9/deployment` | The deployment (operator). Owns the physical document store, the trusted issuer secret and the Host caller authenticator; installs sealed closures; wraps every consumer request in `bridge.runWithinTrustedContext`. |

A facade loaded inside one trusted callback is bound to that request's
selected Host: used after the callback returns (or under another Host's
callback) it refuses with the public `CALLER_SCOPE_DENIED` family. Closing
the bridge detaches the public binding synchronously before teardown.

## Reproducible command list (real Node 24, outside this repository)

```sh
# 1. Pack the exact built package (from the repository root, after npm ci + npm run build)
npm pack -w @kaicreator/domain-harness --pack-destination /tmp/pack
#    Record the tarball SHA256; consumers pin this value.

# 2. Clean consumer directory — anywhere OUTSIDE the repository
mkdir /tmp/v09-consumer && cd /tmp/v09-consumer
echo '{"name":"v09-consumer","private":true,"type":"module"}' > package.json
npm install /tmp/pack/kaicreator-domain-harness-<version>.tgz

# 3. Copy this example's modules plus the sealed module bytes your build
#    pipeline produced (kernel, standard SDK bundle, Business packages,
#    capability) into ./payload/
cp <repo>/examples/v09-clean-consumer/{operator,consumer}.mjs .

# 4. Run the full journey (installs the two-B closure, executes both
#    Business intents, exercises the scoped lifecycle and every documented
#    refusal)
node operator.mjs
# expected last line: JOURNEY_RESULT {"ok":true,"steps":[...]}   (exit 0)
```

## What the journey proves

- **P** selected `installedRef`-only bootstrap; two real Business intents
  (order-approval commits a real Router → Kernel → one-shot-permit → sealed
  capability handler effect; engineering `reviewChange` is really dispatched
  and returns the Kernel's truthful business-role denial receipt); instance
  snapshot query; subscribe receives a real scope-bound Kernel receipt;
  unsubscribe stops delivery; authenticated `stop` closes exactly once and
  fails closed afterwards.
- **N** load without a deployment scope, a raw JSON root used as a
  reference, a smuggled second `load` argument (caller-supplied Host/verifier
  attempt), a foreign deployment scope borrowing another App's reference,
  wrong-runtime-ABI roots, and principals without the required grants all
  fail typed on the frozen public families — prior to any unauthorized
  import or effect.

No monorepo source import, no `src/`/`dist/` deep path, no fake Host
verifier. The repository test `packages/domain-harness/tests/v09-external-consumer.test.ts`
automates exactly this flow against a freshly packed tarball in an isolated
temp directory.
