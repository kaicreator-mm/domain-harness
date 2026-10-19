# T03 – bounded selected Workflow semantics
Authority Issue #1170 @6261048652, frozen Product/L2/DAG and T00 #1166 + K02 #1168 DONE. No second workflow runtime: one selected Standard feature offers bounded loop, child, WAIT, RESUME, callback/deadline semantics; selected Kernel K02 owns actual durable turn identity/State/Receipt and K01 owns effect authorization. Standard returns proposals only.
A: finite loop/exit contract, rejects recursive/unbounded/over-budget.
B: parent↔child identity, exact child/correlation/ordinal and scoped callback.
C: durable WAIT/RESUME/callback replay with time/deadline, typed duplicate and cross-B refusals.
D: real Node24 SQLite process restart, lost callback/disposition/duplicate callback, deadline race with no unauthorized K Effect.
Implementation requires exact current selected S hook; read currently in-flight T02 facade and coordinate one writer. Child tests can use separate source fixtures while T02 is active. One concern/PR into v0.10, targeted high-risk independent review+configured CI. No full R01 regression.
