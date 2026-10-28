# Anthropic Messages optional Capability C (v0.10.3 T-C)

This is the **independently selected** `capability-llm-anthropic-messages` with
`capabilityId: llm.anthropic`, operation `llm.anthropic.generate`, handler
`generate`, and module-wide `externalEffect: true`. Selection and the explicit
Business intent `llmViaAnthropic` belong to the existing BUILD/K ABI, never to
model output or automatic provider discovery.

The selected source is `modules/capability-llm-anthropic-messages.mjs`. It has
no OpenAI import, credentials, fetching, dynamic dependencies, tool execution,
or authority to mint an Effect permit. Integration R alone shall bind the
trusted Host port `__dhV0103AnthropicHostGenerate` immutably before evaluation,
wire the C descriptor and K-selected route, and audit the port's same-process
trust boundary. The selected C refuses when the port is missing/mutable. Its
`generate` settles ONE K external-effect phase envelope: an awaited Host result
becomes a terminal ok envelope `{phase:'terminal', externalRef, outcome}` whose
`externalRef` prefers the observed provider request id with a bounded stable
`local-correlation:` fallback; a Host `status:'unknown'` outcome throws typed
`ANTHROPIC_OUTCOME_UNKNOWN` so the existing K fence/Journal owns UNKNOWN.

The trusted physical endpoint adapter is in
`packages/host-node/src/llm/providers/anthropic/client.ts` with its byte-exact
compiled Host dist twin. Its inputs/outputs share T-A neutral
`dh.llm.generate/1` (not a public Contracts root export until R). The trusted
Host passes/constructs the official `@anthropic-ai/sdk` Messages client
(`maxRetries: 0`, approved model/key/endpoint snapshotted at creation) against
a minimal local interface; the SDK is pinned only in this C-private
`package.json` + `package-lock.json` as a locked authoring/test fixture —
shared Host/workspace manifests stay untouched. Fake endpoints only; live paid
Anthropic validation remains NOT_RUN without operator keys.
