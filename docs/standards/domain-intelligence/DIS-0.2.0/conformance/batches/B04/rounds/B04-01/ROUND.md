# B04-01 / R41 — historical Batch/round provenance, without false current-source PASS

**State: CI_PENDING.** The prior B03 archive `59b61aa69b785b3fdb1709d3bd9ebd118a764588` / Woodpecker #2285/1–3 **all SUCCESS**.

Audits 9 independently versioned B01–B03 rounds with actual versioned machine manifests, exact original `Git Blob` receipts and final pass CI context/URL triplets. It verifies that each receipt matches its round Git SHA/test Blob, that machine matrix references it and that the original test file is actually registered in the DIS integration lane. Negative cases forge a test Blob, commit SHA, CI pipeline and matrix reference; these must fail closed.

Important finding anticipated by source history: historical R35 was intentionally modified when the optional Target ABI was added in R38. The original R35 test Git Blob/CI proof remains valid **at the immutable original source**; the current checkout's modified bytes are NOT the same historical evidence. The audit reports `currentBlobMatchesHistorical:false` and preserves the previous exact-SHA receipt rather than silently pretending source equivalence. New-HEAD regressions must be independently CI checked.

The audit verifies recorded CI **claims**, not external Woodpecker API truth. Live GitHub exact-SHA CI is checked separately before any round is marked verified. No independent semantic Oracle or Product/L1 approval. [Machine round](round.json).
