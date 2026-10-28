# v0.10.3 I01 — Source-only Case admission recipe (validation pending)

[中文](SOURCE_CASE_ADMISSION.zh-CN.md) · [SDK feedback #1437](https://github.com/kaicreator-mm/domain-harness/issues/1437) · [Release Q #1419](https://github.com/kaicreator-mm/domain-harness/issues/1419)

> **Candidate guide, not a qualified fix.** Source baseline `version/v0.10.3@a732ef492958bac47313735b40881e883143d58e`. Relevant Kernel, Standard, public facade and Host recovery source Git blobs are byte-identical to v0.10.2. The ai-rexform #330 Windows Node24 reproduction shows malformed alias rejected only inside the effect handler *after* Effect Journal reservation; the next valid stable-Case message conflicts. No new exact-v0.10.3 Windows installed-public test has yet completed. **Do not unblock downstream PR #330 on docs alone.**

## Current contract and smallest compatible option

1. Use one **trusted Host/application gateway** as the sole caller of public `DomainApp.send()`. Project a real source-only C00 Case through a trusted projector; validate **before send**: `SOURCE_ONLY`, zero physical claims, all decisions `NOT_RUN`, approved routes/verdicts, exact CaseId/schema/digest, bounded fields/counts and currentness/authorization. Produce a deterministic canonical data-only summary; then send with the *existing stable* CaseId-derived instance and message identity.
2. **Never expose the raw facade to untrusted requesters.** A rejected input must yield `sendCallCount=0` and zero Effect Journal rows. Moving this same validation from C to a B effect handler is **too late**: the Kernel already reserved the effect journal. App-owned validation is not a new SDK authorization power; K remains sole effect permission authority.
3. Optional existing K declarative workflow Guard may reject a missing summary, legacy `caseSummaryJson == caseId` alias or specific context/currentness mismatch *before Effect Journal*. The predicate grammar offers `exists/eq/neq/gt/gte/lt/lte/not/all/any` over event/context, not arbitrary `JSON.parse` of a serialized string. Standard `rule.payloadExpression` is bounded portable syntax, not a generic JS callback. Guard refusal may still write a K turn/disposition; **do not assume** it permits reusing the same message with changed input. The trusted gateway must refuse bad input *without calling K* to establish the intended bad→valid guarantee.
4. Keep stable Case identity for immutable replay/drift. `QUERY_NOT_FOUND` is not evidence that a scope is absent; never use it for write authorization. No payload, tool proposal or Host CAS credential can mint K permits or waive after-send UNKNOWN.
5. Public Host `PoisonRecoveryCoordinator` coordinates **one separately authorized corrective turn** based on a verified exact **FAILED** effect record and CAS, without deleting or replaying the original Journal. Neither public `load().send()` nor the enumerated `./host-seam` exports an established production recovery-turn submit verb. **An already-poisoned Case remains BLOCKED** until independently qualified, Host-authorized, end-to-end recovery; do not forge `turnSource`, delete Journal or retry ambiguous effects.

## Minimal application-private pattern (pseudocode, not a new public export)

```js
async function submitTrustedSourceCase({ caseInput, projectCase, authorizeCurrent, facade }) {
  const report = projectCase(caseInput);            // trusted C00 source
  const summary = validateAndCanonicalize(report);  // exact fields, bounded,
  // approved routes, NOT_RUN decisions, zero claims, digest and source-only
  await authorizeCurrent(report.caseId, summary);   // trusted Host currentness
  const identity = stableCaseIdentity(report.caseId);
  return facade.send({
    intentType: 'inspectSourceTabletCase',
    instanceKey: identity.instanceKey,
    messageId: identity.messageId,
    input: { caseId: report.caseId, caseSummaryJson: JSON.stringify(summary) }
  });
}
// All three helper functions are application-owned and require actual tests.
// Never permit external callers to bypass this sole gateway.
```

Optional K guard (must be validated against the actual sealed SDK):

```js
{
  guardId: 'source-summary-no-legacy-alias',
  predicate: {
    op: 'all',
    predicates: [
      { op: 'exists', operand: { source: 'event', path: ['payload', 'caseSummaryJson'] } },
      { op: 'neq',
        left: { source: 'event', path: ['payload', 'caseSummaryJson'] },
        right: { source: 'event', path: ['payload', 'caseId'] } }
    ]
  }
}
// Bind guardId to the source transition only; preserve legacy fixture path.
```

## Required true Windows Node24 negative proof

Pack/install the actual **exact SHA** public Contracts, BUILD, Microkernel, Host tarballs; seal actual selected K/S/B/C in an external producer, run isolated real `load/send/query` consumer with separate fresh stores. No mock-only facade qualifies.

- Raw bad alias → actual failed effect Journal → same stable Case's valid canonical input → conflict/UNKNOWN. Record actual stateRevision, journal state, and errors without removing the old record.
- Trusted-gateway bad alias, non-JSON, oversized or forged NOT_RUN → **zero calls to facade.send and zero Effect Journal records**; then valid canonical with same Case ID → admitted, exact effect/query binding, exact replay without extra effect, changed data denied. Denied query must not authorize a write.
- K Guard with raw bad alias → rejected before **Effect Journal** (not necessarily before K turn/disposition); explicitly inspect replay/identity behavior and do not claim a guaranteed good second send unless proven.
- Unauthorized/foreign/non-FAILED poison evidence cannot be used as recovery. Do not delete any Journal, forge a recovery source or perform ADB/physical operations.
- Report Node24 version, SDK exact SHA/tree and tarball checksums, downstream exact commit, real commands/EXIT, each store's stateRevision and journal status. No LLM/paid API calls.

Until independently verified: `SDK_GAP=CONFIRMED` for arbitrary public raw-send nested-JSON admission; `MINIMAL_COMPATIBLE_OPTION=TRUSTED_GATEWAY_RECIPE`; `WINDOWS_V0103_EXIT=NOT_RUN`; `I01_RELEASE_READY=NO`. No public ABI or general Host CAS framework expansion is proposed.
