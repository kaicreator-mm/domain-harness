# T09 — Tests → Contract → Implementation → Failure Handling → Reference

**Source/seams to inspect:** T07 #1174 Shadow L4, T06 #1173 DecisionTrace/ObservedDependencySet, T03 #1170 Workflow wait/callback; re-use actual selected Business+Standard path.

**Expected write set:** selected Business/Workflow Meta task code and tests/integration/**; avoid v10build/activation.ts, T11 examples and C01 internals. Refine at accepted Builder claim on live source; no blanket globs permitted.

**Implementation:** smallest compositional extension using existing v0.10 selected K/S/B/C + Host boundaries. Do not change frozen Product/L2/DAG or introduce new Kernel/Agent execution engine. Never weaken K Effect permit, CAS or immutable receipt to make optional feature pass. Expose only exact selected additive public API, with conservative typed refusals and no fake physical evidence. 

**Tests:** real Node24; when K observations, scoped query and durability are claimed, use actual file-backed SQLite and preserve exact original receipt semantics. No full-suite test per small concern; after source implementation run targeted P/N, build/lint/typecheck, committed dist freshness and exact-head CI. Independent review, then v0.10 merge and Issue close, separate from R01 release qualification.
