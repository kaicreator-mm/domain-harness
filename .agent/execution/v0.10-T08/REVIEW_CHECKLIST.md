# T08 Review Checklist (risk: high)

- [ ] Source truth pinned to `b8acbf46614ecb600d13a0f320f78af92e391bb9` and accepted L3/test contract; actual branch HEAD fixed before review.
- [ ] One BUILD A, separately built BUILD B with different subjectDigest, stable deployedAppId; neither is a hot-swapped K/S or imported dynamic module set.
- [ ] Activation authorization comes from trusted Host/deployer, **not** candidate Rule/Shadow/LLM or user-provided self-approval claim.
- [ ] Revoked, invalid digest/currentness, mismatched App/tenant/closure refused before new activation, no mutation of old active occurrence.
- [ ] Old A occurrence continues to use exact old A subject/K02 pin across B selection, restart, replay, conflict and recovery; old original immutable receipt byte-identical.
- [ ] R1: at T2 after A's promotion window expires, a real second Node24 process restores the accepted/pinned A BUILD under `PINNED_ONLY` and replays the original receipt; `CURRENT` still refuses, explicit revocation/missing/corrupt activation record/wrong BUILD version/unpinned new occurrence all fail typed.
- [ ] Actual physical Node24 SQLite multi-B/tenant isolation and failure conditions, no synthetic-only 'proof'.
- [ ] New B occurrence admits once only; duplicate deployment decision has explicit consistent outcome, no duplicate effect or false terminal state.
- [ ] Existing T07 Shadow/read-only and T10 selected authorized query semantics unchanged.
- [ ] Scope one concern; no frozen Product/L2/DAG, Kernel CAS/fence/effect/UNKNOWN/receipt changes.
- [ ] Exact-head CI SUCCESS, focused P/N PASS, independent reviewer P0/P1=0; full release regression explicitly deferred to R01.
