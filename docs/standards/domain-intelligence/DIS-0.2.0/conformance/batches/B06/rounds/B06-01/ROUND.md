# B06-01 / R47 — actual HTTP Form / Chat native Interaction transport

**CI_PENDING** (independently committed source and test, batch-level CI gate pending). Exact parent `11137b81f3bf715c665ffe30c45c992f9c68052e` is qualified B04/B05 closure on #2293.

This experiment adds a real Node `node:http` loopback listener and actual HTTP client `fetch` requests for **HTML Form URL-encoded POST** and **Chat JSON POST**. Each request is translated through the preexisting `channel-adapters.mjs` into native `consumeDownloadSession` on AOT-selected xDownload `interaction.inspect` + `interaction.confirm` Functions. The returned typed intent is `READY_FOR_KDP`, `PENDING_AUTHORIZATION`, `authority:NONE`, `effectDispatched:false`, `evidenceAttested:false`; no download or KDP Effect invocation.

This is stronger than earlier UI-neutral form/text constructor tests because there is an actual HTTP parser/transport and loopback socket. It is still **not a deployed web UI, public server, fully trusted Chat client or multi-platform proof**. Per-round source/test Blob and CI receipt bind to the eventual final batch SHA, never to historical canceled pipeline claims.
