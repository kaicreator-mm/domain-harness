# Optional OpenAI-compatible capability (v0.10.3 B)

Select only `capability-llm-openai-compatible`, capability `llm.openai`, handler
`llm.openai.generate` → `generate`, **module-wide externalEffect:true**. Business
explicitly declares `llmViaOpenAI` with the same operation/capability/handler.
No Anthropic import, provider fallback, streaming, Responses or automatic tools.

The trusted deployment supplies the static `domain-harness-openai-host` module
with a `generate` export bound to `createOpenAIHostClient(OpenAI, policy)`.
Policy/SDK/key/endpoint/model/catalog and cancellation stay in Host wiring, never
in the sealed JSON request. SDK construction and each operation force zero retries;
redirects are refused. The private authoring fixture pins the official OpenAI SDK
for controlled-endpoint tests; it is not a new shared workspace/runtime dependency.

Install root locked dependencies and this isolated fixture's lockfile (`npm ci
--prefix domain-packages/capabilities/llm-openai-compatible`), build Host, then run
`node --import tsx --test tests/assembly/v0103-llm-openai-only.test.ts` on Node24.
Test credentials are synthetic, endpoint loopback-only; no paid API calls.

Host validates frozen T-A input, selected model and future bounded deadline;
schema refs are unsupported and catalog refs need an explicit approved binding.
Cancellation/deadline before invocation refuses without a call. Once attempted,
abort/network ambiguity stays UNKNOWN; observed terminal HTTP errors get finite
fixed sanitized codes. No error/body/token echo, retry or exactly-once charge claim.
`providerRequestId` is only the observed SDK x-request-id, never completion id.
Missing usage is unavailable; counts are never invented. Tool proposals are data
and require Business/Standard validation and a separate K Permit to execute.

C returns terminal DTO observations for completed/refused/failed results; UNKNOWN
throws a fixed error into the existing K fence/Journal path. The synthetic
`local-correlation:` externalRef fallback is explicitly local, not a provider ID.
Public root exports and installed 0/1/2-provider composition remain R ownership.
The internal T-A leaf imports are source-lane wiring pending R integration; this
does not claim an already released public v0.10.3 npm API or SQLite durability.

中文：这是显式选入的独立 OpenAI C 包，Host 持有 SDK、密钥和模型绑定。
模型输出不能选择端点、回退供应商或获得 Tool/K 权限。发送后的取消、超时或
网络不确定性保留 UNKNOWN；错误只输出有限脱敏码。共享导出和最终安装验证由 R 负责。
