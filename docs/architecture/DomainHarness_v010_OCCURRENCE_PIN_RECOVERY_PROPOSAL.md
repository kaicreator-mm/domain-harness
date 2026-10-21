# v0.10 occurrence BUILD pin — safe recovery design (non-normative proposal)

Status: **DESIGN ONLY** for Issue #1219. The phase-1 route preflight in PR #1251
does not implement this protocol. It must not be treated as K admission proof.

## Frozen safety constraints

- An *admitted* occurrence is forever bound to its original exact BUILD.
- Never permit another BUILD to use the same deployment / tenant / App /
  Business / workflow / instance target while Kernel admission is possible,
  active or ambiguous.
- Never blindly remove a durable pin after a caught exception: another
  concurrent writer or a crashed predecessor may have committed State,
  Journal, Receipt or a non-idempotent Effect.
- The K02 namespace and immutable original receipt remain Kernel owned.
  Deployment bookkeeping is not another admission authority.

## Recommended protocol (requires L2 review)

1. **Preflight without writes**: validate selected Business + immutable
   workflow + deterministic Standard Router outcome, before any claim.
2. **Reserve the target once**: CAS create a bounded deployment-owned
   reservation record keyed by the exact occurrence tuple. Record original
   exact BUILD subject/closure, decision identity, stable messageId/input
   digest and a unique attempt ID. This is *not* a committed BUILD pin.
3. **Gate all writers**: every governed send consults the immutable committed
   pin and any reservation first. A different BUILD encountering an unresolved
   reservation refuses typed UNKNOWN/PENDING; it never steals the slot based
   on age. Identical owner retries must be bound to the exact original
   messageId and input digest.
4. **Admit through K**: only the reservation owner may invoke the selected
   Kernel for this target. K State/Journal/Effect semantics do not change.
5. **Commit pin after definite admission**: CAS create the immutable BUILD
   pin using the reservation's original exact BUILD. Re-read any conflicting
   pin and accept only an identical owner; an ambiguous write yields typed
   UNKNOWN and does not authorize a different BUILD.
6. **Finalize reservation by exact CAS**: mark admitted only after a durable
   pin is observed. A crash after pin but before finalize is recoverable by
   checking the exact original pin. A crash after K commit but before the pin
   has no automatic release; preserve reservation and refuse cross-BUILD
   routing until K's immutable original receipt proves the old owner.
7. **Abandon without admission only on proof**: a predictable pre-K refusal
   may avoid reserving entirely. An exception from `openInstance` or
   `submitOccurrence` does *not* prove zero K writes. The reservation can
   be released only with an explicit trusted K no-admission witness plus
   conditional CAS, or a physical atomic transaction guaranteeing the same.
   TTL expiry is never sufficient.

An alternative is a **single physical multi-key transaction** spanning
deployment pin and Kernel admission. The current `V10DocStore` only exposes
per-key `get/put/remove`, so this guarantee cannot be inferred from the
interface. Any transaction solution must specify physical SQLite scope,
failure atomicity and whether cross-process workers use the same store.

## Crash/race falsifiers (Node 24, two processes, real SQLite)

| Case | Required |
|---|---|
| Ambiguous Standard routing | No pin/reservation/K write; successor BUILD can admit |
| Kernel input rejects without any K write | No permanently committed pin; release only with verified no-admission proof |
| K admit then process crashes before pin | Reservation blocks successor; typed UNKNOWN; recover original BUILD only |
| Pin written then crash before finalize | Recovery finds identical immutable pin and finishes without new Effect |
| Two opposite BUILDs race | Exactly one selected original BUILD; loser cannot cause K Effect |
| Same owner messageId with changed input | Typed conflict; no new K work |
| Storage/network ambiguity | UNKNOWN, no reset, no time-based takeover |
| Committed old BUILD after successor activation | Old original receipt still replays; new BUILD refuses redirection |

Required before marking #1219 CLOSED: normative Product/L2 disposition of
the reservation/transaction strategy, physically runnable P/N, independent
exact-SHA review and full targeted version integration evidence.
