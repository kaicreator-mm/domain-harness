# B05-02 / R45 — complete independent source-pinning policy

**CI_PENDING.** Independent round source/test commit after R44.

The native SDK gains an opt-in `requireAllSourcesPinned:true` policy. A trusted installer must supply exact source SHA256 and origin Git Blob/commit for **every consumed selected source**, not just a subset or AOT-produced self-assertion. Missing one source, stale original Tally Git origin, unknown extra source, malformed policy all reject before real KDP boot. Real selected Tally/Runx/xDownload Business sources and native host Target are exercised together; LOCAL observation still returns `authority:NONE`.

Policy is deliberately opt-in to preserve untargeted legacy DIS 0.2.0 application loads. A source hash is a provenance check, **not independent human/other-model SAP semantic acceptance** and not a physical target-specific module certificate.

[round.json](round.json) and independent receipt will be finalized only after true exact-SHA CI.
