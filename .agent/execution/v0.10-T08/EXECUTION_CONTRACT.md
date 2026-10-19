# T08 — JIT Execution Contract

Issue #1175 | Frozen v0.10 DAG | Integration target: **v0.10 only** | Base `b8acbf46614ecb600d13a0f320f78af92e391bb9`.

Implement externally governed **new BUILD version activation** (never an SDK package hot swap). Static package trust/currentness remains a BUILD/deploy concern. The Host may activate an *already qualified* version B only upon an independent Host-owned authorization decision, exact pinned BUILD identity, immutable closure, and stable deployedAppId; Shadow/LLM evidence is advisory and cannot grant promotion. No dynamic package mutation or shadow self-approval.

A running occurrence originally admitted on BUILD A retains original A's selected source/subjectDigest, K02 namespace, immutable K02 original receipt and replay. A newly authorized BUILD B may serve **new occurrences** under the same stable deployedAppId and tenant; it may not steal, silently migrate, replay through, or rewrite A's old occurrence. Restart must restore explicit original BUILD→occurrence binding, never current/latest selection. Deal honestly with physical outer `v10/k/<subjectDigest>/<tenantId>/` and inner per-B K02 namespace. A mere separation of two different subjectDigest prefixes is not proof of immutable old-occurrence routing.

Scope only BUILD/deploy selection, immutable mapping and Host activation metadata, plus real integration tests. Do not change K Primary admission/CAS/Effect/UNKNOWN/receipt semantics or frozen Product/L2/DAG. Do not introduce a separate universal deployment orchestrator, generic HTTP API, or more authority for K extensions, semantic S packages or Agents. One concern, one PR. Builder identity is self-declared, not GitHub-account inferred.

**Before any source write:** inspect exact current `v0.10` and GitHub Issue #1175, accept serialized Builder Claim in Issue as ADS demands, refine the *exact* file-level write set and record targeted test contract, then implement in this branch. Current pack is JIT-prepared, **not** a PASS or a Builder claim.
