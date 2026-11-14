# B06-02 / R48 — real HTTP negative and Effect-smuggling defenses

**CI_PENDING**, separate source/test commit after R47.

This round sends actual local HTTP network requests to the R47 native xDownload Interaction transport and proves the HTTP parser rejects GET/non-POST, forged Effect routes, unsupported content types, `Authorization` headers, duplicate Form fields, JSON `grantEffect` smuggling, invalid JSON and bodies over 4096 bytes. A credential-bearing remote URL is processed only into `REJECTED` source-owned Observation; it does **not** grant KDP or execute any Host download.

The transport is intentionally loopback-only and not a production HTTP security layer. No independent source/SAP Oracle is claimed. [Machine round](round.json) carries exact original code and final CI receipt after acceptance.
