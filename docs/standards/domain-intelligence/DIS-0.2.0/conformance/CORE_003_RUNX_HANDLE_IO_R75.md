# DIS v0.2.0 R75 real Runx method-level Function I/O

**SOURCE_COMMITTED / exact-SHA native CI required**. Existing B01–B21 historical scoped rounds remain 35/35; no separate B22 receipt-only round.

Original Runx EnvironmentAgentPresence returns a **PROCESS_LOCAL JavaScript class instance**, not a serializable JSON result. R75 adds an optional, paired `factoryInput:'CLOCK_FUNCTION'` + complete `methodIO` profile to the existing local Handle contract: `observe(request,token):void`, `list():record[]`, `latest():record|null`. The native SDK rejects an invalid factory input before the selected original source is called, validates callback output when used by Runx, and bounds method arguments/outputs with an in-process Proxy. Existing Handle method roster-only legacy AOTs stay loadable but are not marked strict-complete. No Effect authority, remote lease, State serialization or independent semantic SAP is conferred.

Source-specific R75 tests exercise actual Runx state/lifecycle, invalid input before mutation, malformed clock and forged output records, unsafe/incomplete method IO, and process-local handle after SDK stop. An older B05 test which passed `{}` as a fake clock is repaired to a deterministic function matching the actual Runx constructor.

The selected nine Functions now have **9/9 Purpose descriptions and 9/9 typed *applicable* I/O profiles** (5 JSON LOCAL, 2 KDP receipt, 1 App Init, 1 Runx Handle) as a new SOURCE candidate. This does NOT automatically qualify CORE-003 or independent SAP; new three-context Woodpecker, explicit receipt and matrix reconciliation must precede any Core promotion. Last fully qualified Core baseline: 11/16 (68.75%), historic 35/35 rounds, optional 4 NOT_RUN and governance 1 NOT_RUN. No Freeze/merge/release.
