# xDownload DomainHarness Runtime Consumer

Use Windows-native Node 24.21.0 and locked workspace dependencies. Run `node --check` on `build.mjs`, `app.mjs`, `src/provider.mjs` and the test entry files before running the workspace build and tests.

```sh
npm run build --workspaces --if-present
npm test -w @kaicreator/domain-harness-dis-v011-runtime
node examples/dis-0.1.0-runtime-consumer/app.mjs <SQLite evidence file>
```

Set `DIS_RUNTIME_EVIDENCE_DIR` to the task evidence directory to collect disposable materializations and SQLite test databases there. Set `DIS_RUNTIME_EMIT=1` to emit machine-readable receipt and trace summaries during the tests.

The frozen xDownload Package at revision 1.0.0 is provenance. The application runs the separate qualified `xdownload.web-media-runtime` Package at revision 2.0.0. The 2.1.0 test Package selects changed Knowledge. It uses a distinct immutable lock and Journal namespace while the original active deployment continues to return the original strategy. The local capability returns strategy descriptors from structured observations. It has no network or media download port.

The committed [qualification index](domain/runtime-lock.json) is the expected input for the deterministic AOT recipe and contains separate package pins for both revisions. See the [R1 evidence](../../validation/dis-0.1.0/RUNTIME_REPAIR_R1.md).
