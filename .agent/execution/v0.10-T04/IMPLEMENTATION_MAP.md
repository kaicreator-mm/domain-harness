# Write set
- NEW `packages/domain-harness/src/host-v8/v010-scoped-memory.ts` bounded C/Host adapter over existing `CasDocumentStore`, no duplicate SQLite driver
- Narrow export in `packages/domain-harness/src/host-v8/index.ts`
- NEW `tests/v010-memory-scoped.test.ts` P/N and actual SQLite file-backed witness
The selected C Package BUILD/activation bridge is a separate T04 integration slice; do NOT assert complete selected-C just because this Host adapter exists. No Kernel primary, frozen docs or unrelated tasks.
