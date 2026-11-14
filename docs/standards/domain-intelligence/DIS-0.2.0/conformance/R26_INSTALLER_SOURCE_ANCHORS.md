# R26: Trusted installer selected-source currentness gate in native KDP load

**Scope:** DIS v0.2.0 [Demo Master #1499](https://github.com/kaicreator-mm/domain-harness/issues/1499), Draft [PR #1497](https://github.com/kaicreator-mm/domain-harness/pull/1497). This is a bounded native admission extension, not a new knowledge/semantic qualification.

## Known prior proof and gap

- The native R25 exact source state `58e27c52d35f45557398d56d0cfe72eac08f4ccf` was 3/3 SUCCESS (Woodpecker #2261/1–3); selected R25 DKE Business readers consumed a real 793→807 Tally node revision.
- However, the *freshness comparison* was provided by the Demo's `demandCurrentRevision` caller. The native DIS loader itself still checked only the trusted whole-AOT `expectedDigest` and the selected LOCAL executable Registry source bytes.
- An old, internally consistent, historically trusted AOT digest may remain valid when an independent installer has since selected a newer domain source version. Source freshness must not be self-authorized by the AOT.

## Additive contract: expectedSourcePins (optional)

`loadDisV020Aot(artifact, {expectedDigest, expectedSourcePins, registry, store, ...})` can now receive a trusted external installer checkpoint:

```js
expectedSourcePins: {
  'tally-business': {
    sha256: '<source-byte SHA256>',
    origin: {
      repository: 'kaicreator-mm/tally',
      commit: '<trusted immutable commit SHA>',
      path: 'packages/tally-engineering-business/src/index.mjs',
      gitBlob: '<trusted immutable Git blob SHA>'
    }
  }
}
```

- This trusted caller input is independent from `artifact.sources`; a fabricated or untrusted caller-supplied checkpoint is **not** an authentic source-owner credential.
- The loader must first qualify the entire AOT and verify independently installed `expectedDigest`; then it checks that each external checkpoint names an **actually consumed** selected source ID in `sourceConsumers`. The pin must match source content digest and all four original-source identity fields exactly.
- Unknown/unconsumed ID => `DIS_SOURCE_ANCHOR_NOT_CONSUMED`; malformed/empty extra-field manifest => `DIS_SOURCE_ANCHORS_INVALID`; otherwise changed version/source content => `DIS_SOURCE_ANCHOR_STALE`. These errors occur **before native KDP boot**.
- This is **opt-in**, allowing the existing native SDK without a new implicit Node major gate or breaking existing snapshots. A subset of pins only asserts currentness for those named sources; **it does not certify omitted sources or complete Function/SAP/ECP reverse closure**.

## Native executed cases

The additive test `examples/dis-v020-native-sdk/source-anchor.test.mjs` uses the **original Tally Business source bytes**, original immutable Git origin identities and canonical BUILD-selected native Tally Function. It covers: correct external pins boot and return `OBSERVATION` with `authority=NONE`, stale trusted version denial despite the old valid AOT digest, changed source SHA denial, subset scope, unknown/unconsumed source denial, and malformed/forged independent anchor refusal. It is wired into the existing DIS native Woodpecker integration lane, not a new local-only validation task.

**Important limits:** The checked source SHA256 in the test is calculated from the locally fixed source bytes after independently verifying the Git Blob/commit origin declarations. No live upstream Git network watcher, independent cryptographic source-owner attestation, knowledge approval, SAP qualification, running-process revocation, automatic update to a newer AOT, or Effect is implemented. R25 still supplies the real changed upstream corpus read-only experience; the R26 generic check is limited to the original selected Tally Business Functions. R26 conformance evidence is **PENDING its own exact-head CI**.

**Version coverage unchanged:** Core 9/16 VERIFIED; 7 PARTIAL; Optional 4 NOT_RUN; Governance 1 NOT_RUN. No merge, freeze or release.
