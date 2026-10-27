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
trust boundary. The selected C refuses when the port is missing/mutable.

The trusted physical endpoint adapter is in
`packages/host-node/src/llm/providers/anthropic/client.ts` with its byte-exact
compiled Host dist twin. Its inputs/outputs share T-A neutral
`dh.llm.generate/1` (not a public Contracts root export until R). No SDK
version-wide export or manifest is modified by this leaf task. Fake endpoints
only; live paid Anthropic validation remains NOT_RUN without operator keys.
