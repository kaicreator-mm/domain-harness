# V08 B2 R4 — one trusted K1→A1 native-v0.7 Host integration (#987)

Pre-Freeze bounded executable experiment. NOT formal L2 SDK implementation, NOT a
release candidate, NOT the #972 Approval Domain App. One cohesive
integration-trust-boundary concern: the single K1 Genesis Assembly (#986 /
`3fde560baaf36da89a9de9cd1327be3a88a77570`, reviewed `PASS_BOUNDED` P1=0 by
#983@6084270076) bridged onto the A1 trusted native-v0.7 Host path (#985 /
`0ef92f9433ba9e2d32260c32961859e1c686a63e`, reviewed `PASS_BOUNDED` P1=2 by
#984@6084161227), with both open P1 findings truthfully closed and the K1→A1
ABI mismatch resolved by a trusted Host-only adapter. This branch is a
reproducible pinned merge of both sibling tips (merge parents recorded in the
merge commit); neither sibling source file is modified (READ_ONLY, git-blob
identical).

## Layout

- `authority/r4-selection-adapter.mjs` — trusted Host-only K1 nine-field
  `nativeSelection()` → A1 exact-eight-key projection: physically recomputed
  RAW `manifestSha256` (of the genuine `manifest.json` bytes — distinct from
  the manifest `integrity`/packageDigest, never minted from a label),
  `implementation.componentId`, module/handler identity anchored to the K1
  seal + frozen trust roots + recomputed definition-graph digest.
- `authority/r4-native-join.mjs` — successor fork of A1's
  `bindProjectedPhysicalToNativeAuthority` (changed lines justified in the
  header): K1/D1 handler call convention `query.handle({input: query.input})`
  with `binding.implementationHandle === physical.handler` preserved; full K1
  whole-Assembly currentness immediately before T004A/T004C; Host-only
  cryptographically checked lineage; independent physical re-verification of
  manifest/module digests and seal identity before T002B/T003C.
- `authority/r4-ingress.mjs` — P1-a repair: descriptor-safe public ingress
  (`Reflect.ownKeys` + `Object.getOwnPropertyDescriptors`, own enumerable
  data-only JSON records, typed rejection of symbol/non-enumerable/accessor/
  inherited/`__proto__`/non-JSON carriers, zero getter execution, deep-frozen
  snapshots; Host-supplied trusted material passes the same discipline).
- `host/r4-host.mjs` — the R4 Domain-App constructor. Returns EXACTLY the
  frozen façade: **zero privileged research transport path** (P1-b).
- `lab/trusted-transport-lab.mjs` — TEST-ONLY laboratory (obvious name,
  explicit acknowledgment token) recording the inherited original-v0.7
  trusted-transport hazard honestly (F8a/F8b/F8c on fresh occurrences).
- `tests/r4-integration.test.mjs` — the R4-01..R4-16 executable matrix.

## P1-a — claim-accurate descriptor-safe ingress

The A1 intake silently ignored non-enumerable/symbol keys, accepted inherited
fields and executed getters (#984@6084161227 P1-a). The R4 ingress typed-rejects
every descriptor-level carrier BEFORE any admission/dispatch/journal work and
provably never invokes a getter (R4-11/R4-12: counting getters stay at zero).
The Host-supplied `caller` material is an immutable descriptor-safe snapshot,
never a mutable alias (R4-13). **Caller authentication is NOT proven**: the
façade's `caller` is a provenance claim checked by the trusted policy tuple; a
real ingress must establish trusted caller identity (#972 D2 prerequisite).

## P1-b — privileged channel, truthfully bounded

The ORIGINAL v0.7 seam trusts well-shaped in-process dispatch transport
(#984@6084161227 P1-b falsified the fail-close claim by execution: a holder of
separately exposed privileged material CAN forge `{charged:'FAKE'}` and obtain
an ORIGINAL-journal `completed` row that later replays). R4 therefore:

1. **Removes the channel from the accepted business path** — the production
   constructor returns only the façade; no override of `dispatch`,
   `admissionPorts`, `activator`, `sha256`, `effectJournal`, policy, binding,
   selected handler or currentness is expressible (R4-10/R4-14 reachability
   walk).
2. **Preserves the falsification capability only in the fenced lab** with an
   obvious name and acknowledgment token; R4-14 records the inherited hazard
   as an honest trusted-transport truth. We NEVER claim "original v0.7 rejects
   well-shaped injected ports" (that would be false) and NEVER treat a fake
   completed row as a valid authorized business outcome.

## Provenance and lineage

`describe()`/`assemblyLineage()` export the full chain: D1 kernel/SDK root
pins, original `kernel.link` module SHA, the sealed four-package K1 Assembly
digest + graph digest, the RAW manifest/module digests, the native T002B
successor Assembly digest, the T002D PRODUCTION occurrence pin, the T004A
policy binding fingerprint, and the T003C handler-identity preservation flag.
Any physical-native lineage mismatch, untrusted input, wrong authority or
failing guard rejects `E_INTEGRATION_BLOCKED` (R4-16).

## Honest boundaries

- Original v0.7 Central Admission + its ORIGINAL `VolatileAdmissionEffectJournal`
  remain the ONE effect/State/journal authority; no synthetic handler, no
  second Runtime/State/Admission/Journal.
- Durable restart recovery NOT_PROVEN (volatile journal, same as A1).
- The journaling seam consumes the same original v0.7 research source modules
  (`packages/domain-harness/src/contracts/*`) as accepted K1/A1 (pre-Freeze
  reproduction; D2 #972 must use a fair public packed consumer).
- Tech Gate 1 not self-approved; Product Freeze blocked; MERGE=NO.
