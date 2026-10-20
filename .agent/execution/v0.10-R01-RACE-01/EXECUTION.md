# R01-RACE-01 #1205 · v0.10 K01 bounded repair

Base dcf4b31306e1a33b85782ada0507f7b53aee3b0f. Task PR targets v0.10, not main. ADS 4.13.1.
Tests: two live processes/same turn; changed canonical input cannot attach; preserve K01 P1,N1,N2,F1,S1; T11 packed Tiny/Rich three real runs.
Contract: only *identical* canonical turn may non-mutatively attach to current held fence. Neither the live claimant nor a crash-recovery replay may CAS-overwrite its own held revision. Different turn/input and stale identity typed fail-closed.
Implementation: kernel payload claimAdmissionFence, caller turnIdentity, real physical K01 test and worker input-tag fixture. Preserve K02 receipt, non-idempotent Journal/Effect permit and R01 source boundaries.
Failure: run Node24 real SQLite tests, K01 regression, full T11 clean-packed consumer three times, build/lint/typecheck and exact-head CI. Post outputs, request independent exact-head review, merge to v0.10 only after PASS. Re-pin R01 and Hidden validation on successor commit.
Reference: https://github.com/kaicreator-mm/domain-harness/issues/1205
