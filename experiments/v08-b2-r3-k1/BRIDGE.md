# BRIDGE.md — K1 → A1 (#984) bridge contract

Handoff from V08 B2 R3 K1 (#983, this experiment) to the separate A1 R3
repair (#984). K1 does NOT patch A1 native-join/Host policy; A1 must not
modify anything in `experiments/v08-b2-r3-k1/**` or re-sign the D1 seed.

## What K1 proves and hands over

1. **Selected physical module + callable.** For any sealed operation the K1
   Host exposes an exact identity record (`host.selected` entries and
   `sealOperation(...).nativeSelection()`):
   `{packageId, componentId, kindRef, implementationId, modulePath,
   moduleSha256, operationId, effect}` plus the byte-verified physical
   `handler` function loaded from a `data:` URL of the verified bytes — never
   a synthetic callback and never a caller-supplied function.
2. **Graph.** `assembly.graphDigest` is the #956 `verifyDefinitionGraph` root
   over ALL four packages (kernel, SDK, two Business), including dependency
   pins, declared imports, capability provider bindings
   (e.g. `k1.business.claim/claim-underwrite → genesis.sdk/sdk-rule` for
   `rule.score@1.0.0`) and DAG/cycle checks.
3. **Kernel/SDK + Business Assembly identity.** `assembly.digest` =
   `sha256:` over domain `dh.v08-b2-r3-k1.sealed-assembly/1` with the D1
   Kernel root `sha256:38c13d4a…`, D1 SDK root `sha256:1833a217…`, graph
   digest, package id/digest list (linked by the PHYSICAL D1 `kernel.link`
   callable), bindings, and the sorted selected-identity set. Two hosts on
   the same bytes produce the identical digest (deterministic selection).
4. **Occurrence pin + native T003C binding flow.** `host/native-join.mjs`
   shows the flow A1 must preserve, consuming the ORIGINAL v0.7 source
   module instance (`invoke-v07.mjs` → `effectful-invocation.ts`):
   `sealRuntimeAssembly` (T002B) → `bindToolImplementation` with
   `implementationHandle === physical handler` and
   `implementationDigest === 'sha256:'+moduleSha256` (T003C, drift-checked
   `E_NATIVE_PHYSICAL_BINDING_DRIFT`) → `admitToolExposure` /
   `admitToolInvocationRequest` (T004A) → original occurrence
   `activator.activate({authorityClass:'PRODUCTION'})` (T002C/T002D) →
   `invokeWithExistingV07Authority` (T004C Central Admission + original
   Journal, replay-safe with the occurrence's exact effect input
   `{amount:42}`).
5. **Handler convention note.** K1 selected callables follow the D1 handler
   convention `({input, semanticBody, invokeCapability})`; the native
   dispatch wrapper adapts the raw T004C effect input into that convention
   without alteration. A1 must keep this adaptation explicit if it reuses K1
   packages.

## Constraints A1 must keep (from the K3 falsifiers)

- **No extra Kernel/Runtime.** The only Kernel Package is the byte-exact D1
  `genesis.kernel`; only it may provide `kernel.link` (`E_SECOND_KERNEL_FORBIDDEN`).
  The #940 business-special-cased kernel and any derived dispatcher module
  must stay OFF the accepted path (ARCH-01 source scan).
- **No caller-owned authority.** Host construction accepts no override keys
  (`E_UNTRUSTED_HOST_OVERRIDE`); invoke accepts none either
  (`E_UNTRUSTED_INVOKE_AUTHORITY`); the effectful join refuses substitution
  of `dispatch`/`admissionPorts`/`activator`/`sha256`/`effectType` and forged
  `effectAuthority`/`effectTools` (`E_HOST_PORT_IMMUTABLE`,
  `E_CALLER_EFFECT_AUTHORITY`). A1 should carry the same refusal into the
  production-shaped join (R2 P1-03).
- **Whole-Assembly currentness before ANY effect.** Post-Seal tamper of ONLY
  the D1 Kernel bytes (or ONLY SDK bytes) must refuse before ANY dispatch and
  before ANY Journal record — including for unaffected business operations
  (K3-08/K3-09). A1's join inherits this via
  `sealOperation(...).requirePhysicalCurrentness()`; keep it on the hot path.
- **Trust roots stay Host-owned and byte-pinned.** `host/trust-roots.mjs`
  pins both D1 roots AND the two Business package roots; re-signed packages
  cannot self-authorize (`E_HOST_MANIFEST_PIN`, K3-04).
- **Projection honesty.** The native Tool projection with permissive test
  admission policy and empty `validateComponent(){}` is a TEST Host bridge.
  A1 must replace it with genuine Host policy provenance and same-domain /
  same-graph preservation evidence (R2 P1-02), or keep declaring the gap.

## Explicitly NOT proven here (A1's lane)

- Governance/Host-policy equivalence of the physical→native projection.
- Persistent-storage / restart journal behavior (the fixture journal is the
  original volatile one).
- Port-injection falsifiers against a production-shaped join with fresh
  occurrences per case.
- The single combined K1+A1 end-to-end verdict: **PARTIAL** until A1's
  repair lands; a fresh independent review must re-scope to the new exact
  HEAD/tree afterwards.
