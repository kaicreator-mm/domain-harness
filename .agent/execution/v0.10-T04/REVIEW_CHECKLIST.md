# Focused T04 Review
- Scoped key grammar is injective, no prefix leak, never guessed caller identity.
- Host injected authorization gate runs before ALL read/write/list or stale/expired checks.
- CAS conditions enforce create or specific revision, never unconditional.
- TTL expiration by controlled Host time; expired values neither returned nor searched.
- Underlying actual SQLite is used for restart test; in-memory tests never passed off as durability proof.
- Tiny/no-selection must not load Memory.
- Node24 targeted tests plus configured CI; independent review per Issue's risk policy.
- One concern, PR targets v0.10 only. Task completion requires actual selected C app invocation, not stand-alone Host adapter only.
