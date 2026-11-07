# xDownload DomainHarness integration probe — blocked

This bounded probe returns an actual K-owned occurrence receipt for a separately implemented local capability. It does not execute the frozen selected provider artifact and is not an adoption or conformance proof. See the [contract blocker](../../validation/dis-0.1.0/RUNTIME_CONSUMER_PROOF.md).

Use Node 24.21.0 and locked workspace dependencies. First check syntax with `node --check examples/dis-0.1.0-runtime-consumer/build.mjs` and the corresponding checks for `app.mjs` and `test/consumer.test.mjs`. Build the workspaces with `npm run build --workspaces --if-present`. Run the private workspace's tests using `npm test -w @kaicreator/domain-harness-dis-v011-runtime`. For manual execution run `node examples/dis-0.1.0-runtime-consumer/app.mjs <SQLite evidence file>`. Provide a fresh local evidence filename. Set `DIS_RUNTIME_EVIDENCE_DIR` to an existing task evidence directory for native test temporary databases.

The entry reads the frozen xDownload Package at revision 1.0.0 but executes a separately identified private adapter rather than the selected frozen handler. An isolated strategy-catalog revision 2.0.0 is resealed as a synthetic reference Package in tests. This does not establish a valid promotion or a fully governed successor Package selection.

The demo fetches no URLs and downloads no media. SQLite persists only the selected Kernel's local control and evidence documents. See the [conformance proof](../../validation/dis-0.1.0/RUNTIME_CONSUMER_PROOF.md).
